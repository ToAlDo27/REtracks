import { Alert, Box, Button, Stack, Typography } from "@mui/material"
import { useEffect, useRef, useState } from "react"
import type { Message } from "../mb"
import { Action, getClipBounds, getMediaPosition } from "../playback"
import {
  getYouTubeErrorMessage,
  loadYouTubeApi,
  YouTubePlayer,
} from "../youtube"
import { getYouTubeId } from "../youtubeUrl"
import { useMessage } from "./MessageProvider"
import { TrackProgress } from "./TrackProgress"

interface Props {
  ready: boolean
  volume: number
  mute: boolean
}

export function YouTubeAudio(props: Props) {
  const message = useMessage()
  const videoId = message && getYouTubeId(message.track.url)
  if (!message || !videoId) return null
  // A new source owns a new iframe. Delayed events from the old iframe
  // cannot affect the new video. Transport controls keep the same iframe.
  const source = `${videoId}:${message.track.start ?? 0}:${
    message.track.end ?? ""
  }`
  return (
    <YouTubePlayerView
      key={source}
      message={message}
      videoId={videoId}
      {...props}
    />
  )
}

/** Visible official YouTube player. Media stays in YouTube's iframe. */
function YouTubePlayerView(
  props: Props & { message: Message; videoId: string },
) {
  const { ready, volume, mute, message, videoId } = props
  const latest = useRef({ ready, volume, mute, message })
  const previous = useRef({ ready, message })
  const host = useRef<HTMLDivElement>(null)
  const sync = useRef<(forceSeek?: boolean, userInitiated?: boolean) => void>(
    () => undefined,
  )
  const [loaded, setLoaded] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [error, setError] = useState<string>()
  const [sourceDuration, setSourceDuration] = useState(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    latest.current = { ready, volume, mute, message }
    const changed =
      previous.current.message !== message || previous.current.ready !== ready
    previous.current = { ready, message }
    sync.current(changed)
  }, [message, ready, volume, mute])

  useEffect(() => {
    const hostElement = host.current
    let disposed = false
    let player: YouTubePlayer | undefined
    let playerReady = false
    let loadedSource = false
    let autoplayBlocked = false
    let playbackFailed = false
    let knownDuration = 0

    setLoaded(false)
    setError(undefined)
    setBlocked(false)
    setSourceDuration(0)

    const applyVolume = (target: YouTubePlayer) => {
      const { volume, mute } = latest.current
      target.setVolume(Math.round(Math.max(0, Math.min(1, volume)) * 100))
      if (mute) target.mute()
      else target.unMute()
    }

    const synchronize = (forceSeek = false, userInitiated = false) => {
      if (!player || !playerReady || disposed) return
      const { message: current, ready } = latest.current

      applyVolume(player)
      const playing = current.action === Action.Play && (ready || userInitiated)
      if (!loadedSource) {
        loadedSource = true
        const options = {
          videoId,
          startSeconds: getMediaPosition(current),
          endSeconds: getClipBounds(current.track, current.duration).end,
        }
        if (playing) player.loadVideoById(options)
        else player.cueVideoById(options)
        return
      }

      if (userInitiated) {
        autoplayBlocked = false
        playbackFailed = false
        setBlocked(false)
        setError(undefined)
      }
      if (playbackFailed) return

      const state = player.getPlayerState()
      // Let a stalled request finish buffering. Repeated automatic seeks here can
      // discard buffered data faster than a slow connection can download it.
      if (
        (state === 3 || state === -1) &&
        playing &&
        !forceSeek &&
        !userInitiated
      )
        return
      if ([0, 1, 2].includes(state)) {
        const duration = player.getDuration()
        if (
          Number.isFinite(duration) &&
          duration > 0 &&
          duration !== knownDuration
        ) {
          knownDuration = duration
          setSourceDuration(duration)
        }
      }
      const effectiveMessage = {
        ...current,
        duration: knownDuration || current.duration,
      }
      if (knownDuration > 0 && (current.track.start ?? 0) >= knownDuration) {
        playbackFailed = true
        player.pauseVideo()
        setError(
          "The clip starts after this YouTube video ends. Edit the track's start time.",
        )
        return
      }
      const desiredPosition = getMediaPosition(effectiveMessage)
      const bounds = getClipBounds(current.track, effectiveMessage.duration)
      const currentTime = player.getCurrentTime()
      // seekTo removes YouTube's endSeconds boundary, so enforce clip looping here too.
      const outsideClip =
        currentTime < bounds.start - 0.5 ||
        (bounds.end !== undefined && currentTime >= bounds.end)
      const needsSeek =
        forceSeek || outsideClip || Math.abs(currentTime - desiredPosition) > 3
      if (!playing) {
        player.pauseVideo()
        if (needsSeek) player.seekTo(desiredPosition, true)
        // YouTube can start a cued video when seeking; pause again after the seek.
        player.pauseVideo()
      } else if (!autoplayBlocked || userInitiated) {
        if (needsSeek) player.seekTo(desiredPosition, true)
        if (userInitiated || (state !== 1 && state !== 3)) player.playVideo()
      }
    }
    sync.current = synchronize

    loadYouTubeApi()
      .then(api => {
        if (disposed || !hostElement?.isConnected) return
        const mount = document.createElement("div")
        hostElement.appendChild(mount)
        player = new api.Player(mount, {
          width: "100%",
          height: 200,
          playerVars: {
            autoplay: 0,
            controls: 1,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: event => {
              if (disposed) return
              player = event.target
              playerReady = true
              setLoaded(true)
              synchronize(true)
            },
            onStateChange: event => {
              if (disposed) return
              if (event.data === 1) {
                autoplayBlocked = false
                setBlocked(false)
              }
              // End of a video or clip loops against the shared room clock.
              if (event.data === 0) synchronize(true)
            },
            onAutoplayBlocked: () => {
              if (disposed) return
              autoplayBlocked = true
              setBlocked(true)
            },
            onError: event => {
              if (disposed) return
              playbackFailed = true
              setError(getYouTubeErrorMessage(event.data))
            },
          },
        })
        const iframe = player.getIframe()
        iframe.title = "YouTube music player"
        iframe.allow =
          "autoplay; encrypted-media; picture-in-picture; fullscreen"
        iframe.referrerPolicy = "strict-origin-when-cross-origin"
        iframe.style.minWidth = "200px"
        iframe.style.minHeight = "200px"
      })
      .catch(reason => {
        if (!disposed) {
          setError(
            reason instanceof Error
              ? reason.message
              : "YouTube could not load.",
          )
        }
      })

    const interval = window.setInterval(() => {
      if (
        latest.current.ready &&
        latest.current.message.action === Action.Play &&
        !autoplayBlocked &&
        !playbackFailed
      ) {
        synchronize()
      }
    }, 1000)

    return () => {
      disposed = true
      sync.current = () => undefined
      window.clearInterval(interval)
      // Destroy removes the iframe and stops its audio, including pending loads.
      player?.destroy()
      hostElement?.replaceChildren()
    }
  }, [attempt, videoId])

  return (
    <Stack spacing={2}>
      <Box ref={host} sx={{ minWidth: 200, minHeight: 200, width: "100%" }} />
      {error && (
        <Alert
          severity="warning"
          action={
            <Button onClick={() => setAttempt(value => value + 1)}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {(!ready || blocked) && message.action === Action.Play && (
        <Button
          disabled={!loaded}
          variant="outlined"
          onClick={() => sync.current(true, true)}
        >
          {loaded ? "Play YouTube on this device" : "Loading YouTube player…"}
        </Button>
      )}
      <Typography variant="caption" color="text.secondary">
        YouTube plays separately on each device. Videos must allow embedding.
      </Typography>
      <TrackProgress sourceDuration={sourceDuration} />
    </Stack>
  )
}
