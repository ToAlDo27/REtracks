// @vitest-environment jsdom
import { act } from "react-dom/test-utils"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Message } from "../mb"
import { Action } from "../playback"
import type { YouTubeApi, YouTubePlayerOptions } from "../youtube"
import { loadYouTubeApi } from "../youtube"
import { YouTubeAudio } from "./YouTubeAudio"

const state = vi.hoisted(() => ({ message: undefined as Message | undefined }))
vi.mock("./MessageProvider", () => ({ useMessage: () => state.message }))
vi.mock("./TrackProgress", () => ({ TrackProgress: () => <div>Progress</div> }))
vi.mock("../time", () => ({ now: () => new Date("2026-01-01T00:00:00Z") }))
vi.mock("../youtube", () => ({
  loadYouTubeApi: vi.fn(),
  getYouTubeErrorMessage: (code: number) => `YouTube error ${code}`,
}))

class FakePlayer {
  static instances: FakePlayer[] = []
  iframe = document.createElement("iframe")
  state = 1
  loadVideoById = vi.fn()
  cueVideoById = vi.fn()
  playVideo = vi.fn()
  pauseVideo = vi.fn()
  seekTo = vi.fn()
  getDuration = vi.fn(() => 120)
  getCurrentTime = vi.fn(() => 0)
  getPlayerState = vi.fn(() => this.state)
  setVolume = vi.fn()
  mute = vi.fn()
  unMute = vi.fn()
  getIframe = () => this.iframe
  destroy = vi.fn(() => this.iframe.remove())
  constructor(
    element: HTMLElement,
    public options: YouTubePlayerOptions,
  ) {
    element.replaceWith(this.iframe)
    FakePlayer.instances.push(this)
  }
}

function makeMessage(videoId = "dQw4w9WgXcQ"): Message {
  return {
    id: videoId,
    action: Action.Play,
    time: new Date("2026-01-01T00:00:00Z"),
    offset: 0,
    duration: 0,
    track: { title: videoId, url: `https://youtu.be/${videoId}`, tags: [] },
  }
}

describe("YouTube playback lifecycle", () => {
  let container: HTMLDivElement
  let root: Root
  let resolveApi: (api: YouTubeApi) => void
  const props = { ready: true, volume: 0.4, mute: false }

  beforeEach(() => {
    vi.useFakeTimers()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    state.message = makeMessage()
    FakePlayer.instances = []
    vi.mocked(loadYouTubeApi).mockReturnValue(
      new Promise(resolve => {
        resolveApi = resolve
      }),
    )
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  async function renderPlayer() {
    await act(async () => root.render(<YouTubeAudio {...props} />))
    await act(async () => resolveApi({ Player: FakePlayer }))
    const player = FakePlayer.instances[0]
    await act(async () => player.options.events.onReady({ target: player }))
    return player
  }

  it("loads only the newest track when switching before the API is ready", async () => {
    await act(async () => root.render(<YouTubeAudio {...props} />))
    state.message = makeMessage("M7lc1UVf-VE")
    await act(async () => root.render(<YouTubeAudio {...props} />))
    await act(async () => resolveApi({ Player: FakePlayer }))
    const player = FakePlayer.instances[0]
    await act(async () => player.options.events.onReady({ target: player }))
    expect(player.loadVideoById).toHaveBeenCalledOnce()
    expect(player.loadVideoById).toHaveBeenLastCalledWith(
      expect.objectContaining({ videoId: "M7lc1UVf-VE" }),
    )
  })

  it("reuses the iframe, stops the previous source, and does not seek on volume changes", async () => {
    const player = await renderPlayer()
    player.seekTo.mockClear()
    await act(async () => root.render(<YouTubeAudio {...props} volume={0.8} />))
    expect(player.setVolume).toHaveBeenLastCalledWith(80)
    expect(player.seekTo).not.toHaveBeenCalled()

    state.message = makeMessage("M7lc1UVf-VE")
    await act(async () => root.render(<YouTubeAudio {...props} />))
    expect(FakePlayer.instances).toHaveLength(1)
    expect(player.loadVideoById).toHaveBeenLastCalledWith(
      expect.objectContaining({ videoId: "M7lc1UVf-VE" }),
    )
    expect(player.pauseVideo.mock.invocationCallOrder.at(-1)).toBeLessThan(
      player.loadVideoById.mock.invocationCallOrder.at(-1)!,
    )
    expect(player.getIframe().style.minHeight).toBe("200px")
  })

  it("pauses and seeks within a clip without restarting during timer ticks", async () => {
    const player = await renderPlayer()
    state.message = {
      ...state.message!,
      action: Action.Pause,
      offset: 5,
      track: { ...state.message!.track, start: 10, end: 30 },
    }
    await act(async () => root.render(<YouTubeAudio {...props} />))
    expect(player.cueVideoById).toHaveBeenLastCalledWith({
      videoId: "dQw4w9WgXcQ",
      startSeconds: 15,
      endSeconds: 30,
    })
    player.playVideo.mockClear()
    await act(async () => vi.advanceTimersByTime(3000))
    expect(player.playVideo).not.toHaveBeenCalled()
  })

  it("offers a local activation button after autoplay is blocked", async () => {
    const player = await renderPlayer()
    await act(async () =>
      player.options.events.onAutoplayBlocked({ target: player }),
    )
    const button = Array.from(container.querySelectorAll("button")).find(
      item => item.textContent?.includes("Play YouTube"),
    )
    expect(button).toBeDefined()
    await act(async () =>
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    )
    expect(player.seekTo).toHaveBeenCalledWith(0, true)
    expect(player.playVideo).toHaveBeenCalled()
    expect(container.textContent).not.toContain("Play YouTube on this device")
  })

  it("enforces clip bounds after seeking disables YouTube's endSeconds", async () => {
    state.message = {
      ...makeMessage(),
      offset: 8,
      track: { ...makeMessage().track, start: 10, end: 30 },
    }
    const player = await renderPlayer()
    player.getCurrentTime.mockReturnValue(31)
    await act(async () => vi.advanceTimersByTime(1000))
    expect(player.seekTo).toHaveBeenLastCalledWith(18, true)
    player.state = 0
    await act(async () =>
      player.options.events.onStateChange({ target: player, data: 0 }),
    )
    expect(player.playVideo).toHaveBeenCalled()
  })

  it("lets buffering finish instead of repeatedly seeking and restarting the request", async () => {
    const player = await renderPlayer()
    player.state = 3
    player.getCurrentTime.mockReturnValue(60)
    player.seekTo.mockClear()
    await act(async () => vi.advanceTimersByTime(5000))
    expect(player.seekTo).not.toHaveBeenCalled()
    player.state = 1
    await act(async () => vi.advanceTimersByTime(1000))
    expect(player.seekTo).toHaveBeenCalledWith(0, true)
  })

  it("surfaces an embedding failure and clears it when choosing a new source", async () => {
    const player = await renderPlayer()
    await act(async () =>
      player.options.events.onError({ target: player, data: 150 }),
    )
    expect(container.textContent).toContain("YouTube error 150")
    player.playVideo.mockClear()
    await act(async () => vi.advanceTimersByTime(3000))
    expect(player.playVideo).not.toHaveBeenCalled()
    state.message = makeMessage("M7lc1UVf-VE")
    await act(async () => root.render(<YouTubeAudio {...props} />))
    expect(container.textContent).not.toContain("YouTube error 150")
    expect(player.loadVideoById).toHaveBeenLastCalledWith(
      expect.objectContaining({ videoId: "M7lc1UVf-VE" }),
    )
  })

  it("destroys the iframe on unmount and ignores delayed player callbacks", async () => {
    const player = await renderPlayer()
    await act(async () => root.unmount())
    expect(player.destroy).toHaveBeenCalledOnce()
    player.loadVideoById.mockClear()
    await act(async () => player.options.events.onReady({ target: player }))
    expect(player.loadVideoById).not.toHaveBeenCalled()
    root = createRoot(container)
  })

  it("does not create a stale iframe if the component unmounts while the API loads", async () => {
    await act(async () => root.render(<YouTubeAudio {...props} />))
    await act(async () => root.unmount())
    await act(async () => resolveApi({ Player: FakePlayer }))
    expect(FakePlayer.instances).toHaveLength(0)
    root = createRoot(container)
  })
})
