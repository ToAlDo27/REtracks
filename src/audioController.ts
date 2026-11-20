import type { Message } from "./mb"
import { Action, getClipBounds, getMediaPosition } from "./playback"

const METADATA_TIMEOUT = 15_000

/** Every invocation owns its listeners; disposing prevents stale media events from playing. */
export function syncAudio(
  audio: HTMLAudioElement,
  message: Message | undefined,
  ready: boolean,
  onError: (error: Error) => void,
  onDuration?: (duration: number) => void,
): () => void {
  let active = true
  let failed = false
  let buffering = false
  let metadataTimer: ReturnType<typeof setTimeout> | undefined
  const duration = () =>
    Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : message?.duration ?? 0
  const report = (error: unknown) => {
    if (!active || failed) return
    if (error instanceof DOMException && error.name === "AbortError") return
    failed = true
    clearTimeout(metadataTimer)
    onError(
      error instanceof Error ? error : new Error("Unable to play this audio."),
    )
  }
  const current = () => message && { ...message, duration: duration() }
  const apply = (tolerance = 0.25) => {
    const state = current()
    if (!active || failed || !state || audio.readyState < 1) return
    if (state.duration > 0 && (state.track.start ?? 0) >= state.duration) {
      audio.pause()
      report(
        new Error(
          "The clip starts after the end of this audio. Edit its start time.",
        ),
      )
      return
    }
    if (!ready) return
    try {
      const position = getMediaPosition(state)
      if (Math.abs(audio.currentTime - position) > tolerance)
        audio.currentTime = position
      if (state.action === Action.Play && audio.paused) {
        const result = audio.play()
        if (result) result.catch(report)
      } else if (state.action === Action.Pause) {
        audio.pause()
      }
    } catch (error) {
      report(error)
    }
  }
  const enforceClip = () => {
    const state = current()
    if (!active || !ready || !state || state.action !== Action.Play) return
    const bounds = getClipBounds(state.track, state.duration)
    if (
      (bounds.end !== undefined && audio.currentTime >= bounds.end) ||
      audio.currentTime < bounds.start - 0.25
    )
      apply()
  }
  const mediaError = () =>
    report(
      new Error("Audio playback failed. Check the source link and try again."),
    )
  const available = () => {
    if (audio.readyState >= 1) clearTimeout(metadataTimer)
    onDuration?.(duration())
    buffering = false
    apply()
  }
  const durationChanged = () => onDuration?.(duration())
  const waiting = () => {
    buffering = true
  }
  const playing = () => {
    buffering = false
  }
  const synchronize = () => {
    // Automatic seeks during buffering can repeatedly discard downloaded data.
    // Once playback resumes, catch up to the room clock without nudging normal
    // playback for small timing differences between browsers.
    if (
      !active ||
      failed ||
      buffering ||
      audio.seeking ||
      audio.readyState < 3 ||
      message?.action !== Action.Play
    )
      return
    apply(1.5)
  }
  let interval: ReturnType<typeof setInterval> | undefined

  audio.pause()
  if (!message) {
    audio.removeAttribute("src")
    audio.load()
  } else {
    audio.addEventListener("loadedmetadata", available)
    audio.addEventListener("durationchange", durationChanged)
    audio.addEventListener("canplay", available)
    audio.addEventListener("waiting", waiting)
    audio.addEventListener("playing", playing)
    audio.addEventListener("timeupdate", enforceClip)
    audio.addEventListener("ended", available)
    audio.addEventListener("error", mediaError)
    if (audio.getAttribute("src") !== message.track.url || audio.error) {
      audio.src = message.track.url
      audio.load()
    }
    onDuration?.(duration())
    apply()
    if (ready && audio.readyState < 1)
      metadataTimer = setTimeout(
        () =>
          report(
            new Error("Audio loading timed out. Check the link and try again."),
          ),
        METADATA_TIMEOUT,
      )
    if (ready) interval = setInterval(synchronize, 1000)
  }
  return () => {
    active = false
    clearInterval(interval)
    clearTimeout(metadataTimer)
    audio.removeEventListener("loadedmetadata", available)
    audio.removeEventListener("durationchange", durationChanged)
    audio.removeEventListener("canplay", available)
    audio.removeEventListener("waiting", waiting)
    audio.removeEventListener("playing", playing)
    audio.removeEventListener("timeupdate", enforceClip)
    audio.removeEventListener("ended", available)
    audio.removeEventListener("error", mediaError)
    audio.pause()
  }
}
