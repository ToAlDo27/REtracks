import type { Message } from "./mb"
import { Action, getClipBounds, getMediaPosition } from "./playback"

/** Every invocation owns its listeners; disposing prevents stale media events from playing. */
export function syncAudio(
  audio: HTMLAudioElement,
  message: Message | undefined,
  ready: boolean,
  onError: (error: Error) => void,
): () => void {
  let active = true
  let failed = false
  let buffering = false
  const report = (error: unknown) => {
    if (!active || failed) return
    if (error instanceof DOMException && error.name === "AbortError") return
    failed = true
    onError(
      error instanceof Error ? error : new Error("Unable to play this audio."),
    )
  }
  const current = () =>
    message && {
      ...message,
      duration:
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : message.duration,
    }
  const apply = (tolerance = 0.25) => {
    const state = current()
    if (!active || !ready || !state || audio.readyState < 1) return
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
    buffering = false
    apply()
  }
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
    audio.addEventListener("canplay", available)
    audio.addEventListener("waiting", waiting)
    audio.addEventListener("playing", playing)
    audio.addEventListener("timeupdate", enforceClip)
    audio.addEventListener("ended", available)
    audio.addEventListener("error", mediaError)
    if (audio.getAttribute("src") !== message.track.url) {
      audio.src = message.track.url
      audio.load()
    }
    apply()
    if (ready) interval = setInterval(synchronize, 1000)
  }
  return () => {
    active = false
    clearInterval(interval)
    audio.removeEventListener("loadedmetadata", available)
    audio.removeEventListener("canplay", available)
    audio.removeEventListener("waiting", waiting)
    audio.removeEventListener("playing", playing)
    audio.removeEventListener("timeupdate", enforceClip)
    audio.removeEventListener("ended", available)
    audio.removeEventListener("error", mediaError)
    audio.pause()
  }
}
