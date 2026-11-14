const MAX_CACHE_ENTRIES = 64
const METADATA_TIMEOUT_MS = 15000
const durations = new Map<string, number>()

function aborted() {
  return new DOMException("Track loading was cancelled", "AbortError")
}

/** Probe once, releasing the network resource on success, failure or cancellation. */
export function getAudioDuration(
  url: string,
  signal: AbortSignal,
): Promise<number> {
  if (signal.aborted) return Promise.reject(aborted())
  if (durations.has(url)) {
    const duration = durations.get(url)!
    durations.delete(url)
    durations.set(url, duration)
    return Promise.resolve(duration)
  }

  return new Promise((resolve, reject) => {
    const audio = new Audio()
    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      audio.onloadedmetadata = null
      audio.onerror = null
      audio.pause()
      audio.removeAttribute("src")
      audio.load()
    }
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : 0
      cleanup()
      if (error) {
        reject(error)
        return
      }
      durations.set(url, duration)
      if (durations.size > MAX_CACHE_ENTRIES)
        durations.delete(durations.keys().next().value)
      resolve(duration)
    }
    const onAbort = () => finish(aborted())
    signal.addEventListener("abort", onAbort, { once: true })
    audio.preload = "metadata"
    audio.onloadedmetadata = () => finish()
    audio.onerror = () =>
      finish(
        new Error(
          "Unable to load audio. Check that the link is a public audio file.",
        ),
      )
    const timer = setTimeout(
      () =>
        finish(
          new Error("Audio loading timed out. Check the link and try again."),
        ),
      METADATA_TIMEOUT_MS,
    )
    audio.src = url
  })
}
