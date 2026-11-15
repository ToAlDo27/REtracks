export interface YouTubeVideoOptions {
  videoId: string
  startSeconds?: number
  endSeconds?: number
}

export interface YouTubePlayer {
  loadVideoById(options: YouTubeVideoOptions): void
  cueVideoById(options: YouTubeVideoOptions): void
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getDuration(): number
  getCurrentTime(): number
  getPlayerState(): number
  setVolume(volume: number): void
  mute(): void
  unMute(): void
  getIframe(): HTMLIFrameElement
  destroy(): void
}

interface YouTubeEvent {
  target: YouTubePlayer
}

export interface YouTubePlayerOptions {
  width: number | string
  height: number | string
  videoId?: string
  playerVars?: Record<string, string | number>
  events: {
    onReady(event: YouTubeEvent): void
    onStateChange(event: YouTubeEvent & { data: number }): void
    onError(event: YouTubeEvent & { data: number }): void
    onAutoplayBlocked(event: YouTubeEvent): void
  }
}

export interface YouTubeApi {
  Player: new (
    element: HTMLElement,
    options: YouTubePlayerOptions,
  ) => YouTubePlayer
}

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

let pendingApi: Promise<YouTubeApi> | undefined

/** Share one official API script between players; a failed load can be retried. */
export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (pendingApi) return pendingApi

  pendingApi = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    )
    const script = existingScript ?? document.createElement("script")
    const cleanUp = () => {
      window.clearTimeout(timeout)
      script.removeEventListener("error", onError)
      if (window.onYouTubeIframeAPIReady === onReady) {
        window.onYouTubeIframeAPIReady = previousReady
      }
    }
    const fail = () => {
      cleanUp()
      script.remove()
      reject(
        new Error("YouTube could not load. Check your connection and retry."),
      )
    }
    const onError = () => fail()
    const onReady = () => {
      cleanUp()
      if (window.YT?.Player) resolve(window.YT)
      else fail()
      previousReady?.()
    }
    const timeout = window.setTimeout(fail, 20000)
    window.onYouTubeIframeAPIReady = onReady
    script.addEventListener("error", onError, { once: true })
    if (!existingScript) {
      script.src = "https://www.youtube.com/iframe_api"
      script.async = true
      document.head.appendChild(script)
    }
  }).catch(error => {
    pendingApi = undefined
    throw error
  })

  return pendingApi
}

export function getYouTubeErrorMessage(code: number): string {
  switch (code) {
    case 2:
      return "This YouTube link is invalid. Edit the track and check its URL."
    case 5:
      return "Your browser could not play this YouTube video. Try another video."
    case 100:
      return "This YouTube video is private, removed or unavailable."
    case 101:
    case 150:
      return "The owner of this YouTube video does not allow embedded playback. Choose another video."
    case 153:
      return "YouTube could not verify this embed. Open ReTracks from its hosted HTTPS address and check the browser referrer settings."
    default:
      return "YouTube playback failed. Check the video or choose another track."
  }
}
