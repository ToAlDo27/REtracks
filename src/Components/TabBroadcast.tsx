import CastRoundedIcon from "@mui/icons-material/CastRounded"
import { Alert, Box, Button, Stack, Typography } from "@mui/material"
import OBR from "@owlbear-rodeo/sdk"
import { useEffect, useRef, useState } from "react"
import { key } from "../key"
import {
  TabAudioPeer,
  TabAudioState,
  isTabSignal,
  isTrustedTabBridgeMessage,
} from "../tabAudio"

const signalChannel = key("tab-audio-v1")

interface Props {
  gm: boolean
  mute: boolean
  volume: number
  onActiveChange: (active: boolean) => void
}

export function TabBroadcast({ gm, mute, volume, onActiveChange }: Props) {
  const [state, setState] = useState<TabAudioState>({
    available: false,
    listening: false,
    connected: false,
  })
  const [broadcasting, setBroadcasting] = useState(false)
  const [error, setError] = useState<string>()
  const [blocked, setBlocked] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)
  const peer = useRef<TabAudioPeer>()
  const bridgeToken = useRef<string>()
  const popup = useRef<Window | null>(null)
  const lastPong = useRef(0)
  const gmRef = useRef(gm)
  gmRef.current = gm

  useEffect(() => {
    onActiveChange(broadcasting || state.listening)
  }, [broadcasting, state.listening, onActiveChange])

  useEffect(() => {
    if (audio.current) {
      audio.current.volume = volume
      audio.current.muted = mute
    }
  }, [volume, mute])

  useEffect(() => {
    let disposed = false
    const audioElement = audio.current
    let gmConnections = new Set<string>()
    let ownConnectionId: string | undefined
    let partyChanged = false
    const identities = new Map<string, string>()
    const readParty = async () => {
      const players = await OBR.party.getPlayers()
      if (!disposed && !partyChanged)
        gmConnections = new Set(
          players.filter(p => p.role === "GM").map(p => p.connectionId),
        )
    }
    void readParty().catch(() => undefined)
    void OBR.player
      .getConnectionId()
      .then(id => {
        if (!disposed) ownConnectionId = id
      })
      .catch(() => undefined)
    const unsubscribeParty = OBR.party.onChange(players => {
      if (disposed) return
      partyChanged = true
      gmConnections = new Set(
        players.filter(p => p.role === "GM").map(p => p.connectionId),
      )
    })
    const instance = new TabAudioPeer(
      signal => OBR.broadcast.sendMessage(signalChannel, signal),
      value => {
        if (!disposed) setState(value)
      },
      stream => {
        if (disposed) return
        const element = audio.current
        if (!element) return
        element.srcObject = stream ?? null
        if (stream)
          void element
            .play()
            .then(() => {
              if (!disposed && element.srcObject === stream) setBlocked(false)
            })
            .catch(() => {
              if (!disposed && element.srcObject === stream) setBlocked(true)
            })
        else {
          element.pause()
          setBlocked(false)
        }
      },
    )
    peer.current = instance
    const unsubscribe = OBR.broadcast.onMessage(signalChannel, event => {
      if (disposed) return
      if (!isTabSignal(event.data)) return
      const signal = event.data
      const owner = identities.get(signal.from)
      if (owner && owner !== event.connectionId) return
      if (identities.size > 256 && !owner) return
      identities.set(signal.from, event.connectionId)
      // Only GMs can announce and offer a broadcast to listeners.
      if (
        ["announce", "offer", "stop"].includes(signal.kind) &&
        !gmConnections.has(event.connectionId) &&
        !(event.connectionId === ownConnectionId && gmRef.current)
      )
        return
      void instance.receive(signal)
      if (bridgeToken.current)
        popup.current?.postMessage(
          { type: "signal", signal, token: bridgeToken.current },
          window.location.origin,
        )
    })
    const handlePopup = (event: MessageEvent) => {
      if (
        disposed ||
        !isTrustedTabBridgeMessage(
          event,
          window.location.origin,
          popup.current,
          bridgeToken.current,
        )
      )
        return
      if (event.data?.type === "pong") lastPong.current = Date.now()
      if (
        event.data?.type !== "signal" ||
        !isTabSignal(event.data.signal) ||
        !gmRef.current
      )
        return
      const signal = event.data.signal
      if (signal.kind === "announce") setBroadcasting(true)
      if (signal.kind === "stop") setBroadcasting(false)
      const token = bridgeToken.current
      void OBR.broadcast.sendMessage(signalChannel, signal).catch(() => {
        if (!disposed && bridgeToken.current === token)
          setError("Could not send broadcast signals to the room.")
      })
    }
    window.addEventListener("message", handlePopup)
    instance.discover()
    const timer = setInterval(() => {
      if (bridgeToken.current)
        popup.current?.postMessage(
          { type: "ping", token: bridgeToken.current },
          window.location.origin,
        )
      if (
        popup.current?.closed ||
        (lastPong.current && Date.now() - lastPong.current > 15000)
      ) {
        setBroadcasting(false)
        bridgeToken.current = undefined
        popup.current = null
        lastPong.current = 0
      }
    }, 4000)
    return () => {
      disposed = true
      clearInterval(timer)
      unsubscribe()
      unsubscribeParty()
      window.removeEventListener("message", handlePopup)
      instance.destroy()
      if (audioElement) {
        audioElement.pause()
        audioElement.srcObject = null
      }
      bridgeToken.current = undefined
      popup.current?.close()
      popup.current = null
      peer.current = undefined
    }
  }, [])

  useEffect(() => {
    if (!gm) {
      popup.current?.close()
      popup.current = null
      bridgeToken.current = undefined
      lastPong.current = 0
      setBroadcasting(false)
    }
  }, [gm])

  function openBroadcast() {
    if (popup.current && !popup.current.closed) {
      popup.current.focus()
      return
    }
    if (typeof RTCPeerConnection === "undefined") {
      setError("Tab broadcasting needs a browser with WebRTC support.")
      return
    }
    setError(undefined)
    const token = crypto.randomUUID()
    bridgeToken.current = token
    lastPong.current = Date.now()
    const url = new URL("broadcast.html", window.location.href)
    url.hash = token
    popup.current = window.open(
      url.href,
      "_blank",
      "popup,width=620,height=640",
    )
    if (!popup.current) {
      bridgeToken.current = undefined
      setError(
        "The browser blocked the broadcast window. Allow popups for this extension and try again.",
      )
    }
  }

  return (
    <Box sx={{ px: 2, py: 1 }}>
      <audio ref={audio} muted={mute} />
      <Stack
        direction="row"
        spacing={1}
        flexWrap="wrap"
        alignItems="center"
        useFlexGap
      >
        {gm && (
          <Button
            size="small"
            startIcon={<CastRoundedIcon />}
            onClick={openBroadcast}
          >
            {broadcasting ? "Open broadcast" : "Share tab audio"}
          </Button>
        )}
        {(state.available || state.listening) && (
          <Button
            size="small"
            onClick={() => {
              if (typeof RTCPeerConnection === "undefined") {
                setError("Your browser does not support WebRTC audio.")
                return
              }
              peer.current?.disconnect()
              peer.current?.listen()
            }}
          >
            {state.connected ? "Reconnect" : "Listen to tab audio"}
          </Button>
        )}
        {state.listening && (
          <Button size="small" onClick={() => peer.current?.disconnect()}>
            Disconnect
          </Button>
        )}
        {blocked && (
          <Button
            size="small"
            onClick={() => {
              void audio.current
                ?.play()
                .then(() => setBlocked(false))
                .catch(() => setError("Unmute audio, then try again."))
            }}
          >
            Enable stream audio
          </Button>
        )}
      </Stack>
      {(broadcasting || state.listening) && (
        <Typography variant="caption" display="block">
          {broadcasting
            ? "Broadcasting from another tab. Library audio is muted."
            : state.connected
              ? "Listening to tab audio. Library audio is muted."
              : "Waiting for the tab audio connection…"}
        </Typography>
      )}
      {(error || state.error) && (
        <Alert severity="warning" onClose={() => setError(undefined)}>
          {error ?? state.error}
        </Alert>
      )}
    </Box>
  )
}
