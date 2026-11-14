// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { YouTubeApi } from "./youtube"

describe("official YouTube API loader", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    delete window.YT
    delete window.onYouTubeIframeAPIReady
  })

  afterEach(() => {
    document
      .querySelectorAll('script[src="https://www.youtube.com/iframe_api"]')
      .forEach(script => script.remove())
    delete window.YT
    delete window.onYouTubeIframeAPIReady
    vi.useRealTimers()
  })

  it("shares a single script and preserves an existing ready callback", async () => {
    const previousCallback = vi.fn()
    window.onYouTubeIframeAPIReady = previousCallback
    const { loadYouTubeApi } = await import("./youtube")
    const first = loadYouTubeApi()
    expect(loadYouTubeApi()).toBe(first)
    expect(
      document.querySelectorAll(
        'script[src="https://www.youtube.com/iframe_api"]',
      ),
    ).toHaveLength(1)
    window.YT = { Player: vi.fn() as unknown as YouTubeApi["Player"] }
    window.onYouTubeIframeAPIReady?.()
    await expect(first).resolves.toBe(window.YT)
    expect(previousCallback).toHaveBeenCalledOnce()
    expect(window.onYouTubeIframeAPIReady).toBe(previousCallback)
  })

  it("cleans up a failed script and permits retry", async () => {
    const { loadYouTubeApi } = await import("./youtube")
    const pending = loadYouTubeApi()
    const failed = expect(pending).rejects.toThrow("YouTube could not load")
    document
      .querySelector('script[src="https://www.youtube.com/iframe_api"]')!
      .dispatchEvent(new Event("error"))
    await failed
    const retry = loadYouTubeApi()
    expect(retry).not.toBe(pending)
    window.YT = { Player: vi.fn() as unknown as YouTubeApi["Player"] }
    window.onYouTubeIframeAPIReady?.()
    await expect(retry).resolves.toBe(window.YT)
  })

  it("reports a connection timeout instead of leaving a player loading forever", async () => {
    const { loadYouTubeApi } = await import("./youtube")
    const pending = loadYouTubeApi()
    const failed = expect(pending).rejects.toThrow("YouTube could not load")
    await vi.advanceTimersByTimeAsync(20000)
    await failed
    expect(
      document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]',
      ),
    ).toBeNull()
    expect(window.onYouTubeIframeAPIReady).toBeUndefined()
  })
})
