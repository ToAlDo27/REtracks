import { useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  Alert,
  Button,
  Container,
  CssBaseline,
  Stack,
  ThemeProvider,
  Typography,
  createTheme,
} from "@mui/material"
import {
  TabAudioPeer,
  isTabSignal,
  isTrustedTabBridgeMessage,
} from "./tabAudio"
import { APP_NAME, APP_VERSION } from "./project"

export function BroadcastWindow() {
  const token = location.hash.slice(1)
  const [active, setActive] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const peer = useRef<TabAudioPeer>()
  const opener = useRef<Window | null>(window.opener)
  const lastBridge = useRef(Date.now())
  const captureRequest = useRef(0)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    const parent = opener.current
    if (!/^[a-f0-9-]{36}$/.test(token) || !parent) {
      setError(`Open this window using Share tab audio in ${APP_NAME}.`)
      return
    }
    const post = (data: Record<string, unknown>) =>
      parent.postMessage({ ...data, token }, window.location.origin)
    const instance = new TabAudioPeer(
      async signal => post({ type: "signal", signal }),
      state => {
        if (state.error) setError(state.error)
      },
      () => undefined,
    )
    peer.current = instance
    const handleBridge = (event: MessageEvent) => {
      if (
        !isTrustedTabBridgeMessage(event, window.location.origin, parent, token)
      )
        return
      if (event.data?.type === "signal" && isTabSignal(event.data.signal))
        void instance.receive(event.data.signal)
      if (event.data?.type === "ping") {
        lastBridge.current = Date.now()
        post({ type: "pong" })
      }
    }
    window.addEventListener("message", handleBridge)
    post({ type: "pong" })
    const timer = setInterval(() => {
      if (Date.now() - lastBridge.current > 15000) {
        captureRequest.current += 1
        instance.stopBroadcast()
        setActive(false)
        setPending(false)
        setError(
          `The Owlbear connection closed. Reopen Share tab audio in ${APP_NAME}.`,
        )
      }
    }, 4000)
    const close = () => {
      mounted.current = false
      captureRequest.current += 1
      if (peer.current === instance) peer.current = undefined
      instance.destroy()
    }
    window.addEventListener("beforeunload", close)
    return () => {
      window.removeEventListener("beforeunload", close)
      window.removeEventListener("message", handleBridge)
      clearInterval(timer)
      close()
    }
  }, [token])

  async function start() {
    if (!peer.current || !navigator.mediaDevices?.getDisplayMedia) {
      setError(
        "Tab audio capture is unavailable. Open this page in desktop Chrome or Edge over HTTPS.",
      )
      return
    }
    setPending(true)
    setError(undefined)
    const instance = peer.current
    const request = ++captureRequest.current
    try {
      // Capture needs a video track, but only audio tracks are ever added to WebRTC.
      const captureOptions: DisplayMediaStreamOptions & {
        selfBrowserSurface: string
        surfaceSwitching: string
      } = {
        video: { displaySurface: "browser" },
        audio: {
          suppressLocalAudioPlayback: false,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as MediaTrackConstraints,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
      }
      const stream =
        await navigator.mediaDevices.getDisplayMedia(captureOptions)
      if (!stream.getAudioTracks().length) {
        stream.getTracks().forEach(track => track.stop())
        throw new Error(
          "No audio was shared. Select a browser tab and enable Share tab audio.",
        )
      }
      if (
        !mounted.current ||
        request !== captureRequest.current ||
        peer.current !== instance ||
        Date.now() - lastBridge.current > 15000
      ) {
        stream.getTracks().forEach(track => track.stop())
        throw new Error("The Owlbear connection closed.")
      }
      const stop = () => {
        if (
          mounted.current &&
          request === captureRequest.current &&
          peer.current === instance
        ) {
          instance.stopBroadcast()
          setActive(false)
        }
      }
      stream
        .getTracks()
        .forEach(track => track.addEventListener("ended", stop, { once: true }))
      instance.startBroadcast(stream)
      setActive(true)
    } catch (e) {
      if (mounted.current && request === captureRequest.current)
        setError(e instanceof Error ? e.message : "Tab capture was cancelled.")
    } finally {
      if (mounted.current && request === captureRequest.current)
        setPending(false)
    }
  }
  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <img src="./music-icon.svg" width="44" height="44" alt="" />
          <div>
            <Typography variant="h4">Broadcast tab audio</Typography>
            <Typography variant="caption">
              {APP_NAME} {APP_VERSION}
            </Typography>
          </div>
        </Stack>
        <Typography>
          Open your music in another browser tab. Choose that tab below and
          enable “Share tab audio”. Only its audio is sent to listeners in your
          Owlbear room.
        </Typography>
        <Alert severity={active ? "success" : "info"}>
          {active
            ? "Broadcasting. Change songs in the source tab. Keep this window and Owlbear open."
            : `Listeners click Listen to tab audio in ${APP_NAME}; this enables their sound. Desktop Chrome or Edge is recommended for capture.`}
        </Alert>
        {error && <Alert severity="error">{error}</Alert>}
        <Button
          variant="contained"
          disabled={pending || active}
          onClick={() => void start()}
        >
          Choose tab and start
        </Button>
        {active && (
          <Button
            color="error"
            variant="outlined"
            onClick={() => {
              peer.current?.stopBroadcast()
              setActive(false)
            }}
          >
            Stop broadcast
          </Button>
        )}
        <Typography variant="caption">
          Playback and track changes are controlled in the source tab. Direct
          connections may fail on restricted networks; a TURN relay is not
          bundled.
        </Typography>
      </Stack>
    </Container>
  )
}
createRoot(document.getElementById("root")!).render(
  <ThemeProvider theme={createTheme({ palette: { mode: "dark" } })}>
    <CssBaseline />
    <BroadcastWindow />
  </ThemeProvider>,
)
