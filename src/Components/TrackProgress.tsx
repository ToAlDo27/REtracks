import {
  LinearProgress,
  Slider,
  Skeleton,
  Stack,
  Typography,
  useTheme,
} from "@mui/material"
import { useEffect, useState } from "react"
import { Action, seek } from "../mb"
import { getClipDuration, getPlaybackPosition } from "../playback"
import { useMessage } from "./MessageProvider"
import { Role, useRole } from "./RoleProvider"

function secondsToDisplay(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--"
  const value = Math.floor(seconds)
  const minutes = Math.floor(value / 60)
  return `${minutes}:${String(value % 60).padStart(2, "0")}`
}

function TimeTypography(props: { seconds: number }) {
  const theme = useTheme()
  return (
    <Typography variant="caption" color={theme.palette.grey[400]}>
      {secondsToDisplay(props.seconds)}
    </Typography>
  )
}

export function TrackProgress({ sourceDuration }: { sourceDuration?: number }) {
  const currentMessage = useMessage()
  const [progress, setProgress] = useState(0)
  const [scrubbing, setScrubbing] = useState<number>()
  const role = useRole()
  const mediaDuration =
    sourceDuration && sourceDuration > 0
      ? sourceDuration
      : currentMessage?.duration ?? 0
  const duration = currentMessage
    ? getClipDuration(currentMessage.track, mediaDuration)
    : 0

  useEffect(() => {
    if (currentMessage) {
      const playbackMessage = { ...currentMessage, duration: mediaDuration }
      setScrubbing(undefined)
      setProgress(getPlaybackPosition(playbackMessage))
      // on pause, just set the progression and wait for unpause
      if (currentMessage.action === Action.Pause) {
        return
      }

      // on play, update progress every second
      const id = setInterval(() => {
        setProgress(getPlaybackPosition(playbackMessage))
      }, 1000)
      return () => clearInterval(id)
    }

    setProgress(0)
  }, [currentMessage, mediaDuration])

  if (!currentMessage) {
    return <Skeleton variant="rounded" animation="wave" height={5} />
  }

  return (
    <Stack
      spacing={2}
      direction={"row"}
      justifyContent={"space-between"}
      alignItems={"center"}
      height={5}
    >
      <TimeTypography seconds={scrubbing ?? progress} />
      {duration > 0 && role === Role.GM ? (
        <Slider
          aria-label="Track position"
          size="small"
          min={0}
          max={duration}
          step={1}
          value={Math.min(duration, scrubbing ?? progress)}
          onChange={(_, value) => setScrubbing(value as number)}
          onChangeCommitted={(_, value) => {
            seek(value as number)
            setScrubbing(undefined)
          }}
        />
      ) : (
        <LinearProgress
          sx={{ borderRadius: 1, width: "100%" }}
          variant={duration > 0 ? "determinate" : "indeterminate"}
          value={duration > 0 ? (progress / duration) * 100 : undefined}
        />
      )}
      <TimeTypography seconds={duration || Number.NaN} />
    </Stack>
  )
}
