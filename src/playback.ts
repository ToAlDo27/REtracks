import { Track } from "./track"
import { now } from "./time"

export enum Action {
  Play,
  Pause,
}

interface PlaybackMessage {
  action: Action
  time: Date
  offset: number
  duration: number
  track: Track
}

// Message offsets are relative to the selected clip; duration is the full source.
export function getClipBounds(track: Track, sourceDuration: number) {
  const duration =
    Number.isFinite(sourceDuration) && sourceDuration > 0
      ? sourceDuration
      : undefined
  const requestedStart =
    Number.isFinite(track.start) && (track.start ?? 0) > 0 ? track.start! : 0
  const start =
    duration === undefined ? requestedStart : Math.min(requestedStart, duration)
  const requestedEnd =
    Number.isFinite(track.end) && (track.end ?? 0) > start
      ? track.end
      : undefined
  const end =
    duration === undefined
      ? requestedEnd
      : Math.min(requestedEnd ?? duration, duration)
  return {
    start,
    end,
    duration: end === undefined ? 0 : Math.max(0, end - start),
  }
}

export function getClipDuration(track: Track, sourceDuration: number): number {
  return getClipBounds(track, sourceDuration).duration
}

export function getPlaybackPosition(message: PlaybackMessage): number {
  const elapsed =
    message.action === Action.Play
      ? Math.max(0, (now().getTime() - new Date(message.time).getTime()) / 1000)
      : 0
  const position = Math.max(
    0,
    (Number.isFinite(message.offset) ? message.offset : 0) + elapsed,
  )
  const duration = getClipDuration(message.track, message.duration)
  return duration > 0 ? position % duration : position
}

export function getMediaPosition(message: PlaybackMessage): number {
  return (
    getClipBounds(message.track, message.duration).start +
    getPlaybackPosition(message)
  )
}
