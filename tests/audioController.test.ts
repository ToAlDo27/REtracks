import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/time", () => ({ now: () => new Date(Date.now()) }))

import { syncAudio } from "../src/audioController"
import { Action } from "../src/playback"

class Media extends EventTarget {
  src = ""
  readyState = 0
  duration = 90
  paused = true
  seeking = false
  position = 0
  seek = vi.fn()
  get currentTime() {
    return this.position
  }
  set currentTime(value: number) {
    if (this.readyState < 1) throw new Error("Cannot seek before metadata")
    this.seek(value)
    this.position = value
  }
  pause = vi.fn(() => {
    this.paused = true
  })
  play = vi.fn(() => {
    this.paused = false
    return Promise.resolve()
  })
  load = vi.fn(() => {
    this.readyState = 0
  })
  getAttribute(name: string) {
    return name === "src" ? this.src : null
  }
  removeAttribute(name: string) {
    if (name === "src") this.src = ""
  }
  metadata() {
    this.readyState = 1
    this.dispatchEvent(new Event("loadedmetadata"))
  }
}

const base = {
  id: "first",
  action: Action.Play,
  time: new Date("2026-01-01T00:00:00Z"),
  offset: 0,
  duration: 90,
  track: {
    title: "First",
    url: "https://example.com/first.mp3",
    tags: [],
    start: 10,
    end: 40,
  },
}
let audio: Media
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-01-01T00:00:05Z"))
  audio = new Media()
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe("direct audio synchronization", () => {
  it("waits for metadata before seeking or starting playback", () => {
    const error = vi.fn()
    syncAudio(audio as unknown as HTMLAudioElement, base, true, error)
    expect(audio.play).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    audio.metadata()
    expect(audio.currentTime).toBe(15)
    expect(audio.play).toHaveBeenCalledOnce()
  })

  it("reports a clip beyond the source without starting playback", () => {
    const error = vi.fn()
    syncAudio(
      audio as unknown as HTMLAudioElement,
      { ...base, track: { ...base.track, start: 100, end: 120 } },
      true,
      error,
    )
    audio.metadata()
    expect(audio.play).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("starts after the end"),
      }),
    )
  })

  it("times out if the new source never returns its metadata", () => {
    const error = vi.fn()
    const dispose = syncAudio(
      audio as unknown as HTMLAudioElement,
      base,
      true,
      error,
    )
    vi.advanceTimersByTime(15000)
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("timed out"),
      }),
    )
    audio.metadata()
    expect(audio.play).not.toHaveBeenCalled()
    dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("removes stale listeners when tracks are switched rapidly", () => {
    const dispose = syncAudio(
      audio as unknown as HTMLAudioElement,
      base,
      true,
      vi.fn(),
    )
    dispose()
    const second = {
      ...base,
      id: "second",
      track: {
        ...base.track,
        url: "https://example.com/second.mp3",
        start: 30,
        end: 60,
      },
    }
    syncAudio(audio as unknown as HTMLAudioElement, second, true, vi.fn())
    audio.metadata()
    expect(audio.currentTime).toBe(35)
    expect(audio.play).toHaveBeenCalledOnce()
  })

  it("stays paused until the user has enabled audio", () => {
    syncAudio(audio as unknown as HTMLAudioElement, base, false, vi.fn())
    audio.metadata()
    expect(audio.play).not.toHaveBeenCalled()
  })

  it("catches autoplay rejection", async () => {
    const error = vi.fn()
    audio.play.mockImplementation(() =>
      Promise.reject(new Error("Autoplay blocked")),
    )
    const dispose = syncAudio(
      audio as unknown as HTMLAudioElement,
      base,
      true,
      error,
    )
    audio.metadata()
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Autoplay blocked" }),
      ),
    )
    dispose()
    expect(audio.paused).toBe(true)
  })

  it("ignores playback rejections after a track was disposed", async () => {
    const error = vi.fn()
    let reject!: (reason: Error) => void
    audio.play.mockImplementation(
      () =>
        new Promise<void>((_, failed) => {
          reject = failed
        }),
    )
    const dispose = syncAudio(
      audio as unknown as HTMLAudioElement,
      base,
      true,
      error,
    )
    audio.metadata()
    dispose()
    reject(new Error("Old playback failed"))
    await Promise.resolve()
    await Promise.resolve()
    expect(error).not.toHaveBeenCalled()
  })

  it("returns to the current clip position when playback crosses its end", () => {
    syncAudio(audio as unknown as HTMLAudioElement, base, true, vi.fn())
    audio.metadata()
    audio.currentTime = 41
    audio.dispatchEvent(new Event("timeupdate"))
    expect(audio.currentTime).toBe(15)
  })

  it("corrects clock drift after background suspension without restarting playback", () => {
    syncAudio(audio as unknown as HTMLAudioElement, base, true, vi.fn())
    audio.metadata()
    audio.readyState = 4
    audio.seek.mockClear()
    vi.setSystemTime(new Date("2026-01-01T00:00:14Z"))
    vi.advanceTimersByTime(1000)
    expect(audio.currentTime).toBe(25)
    expect(audio.seek).toHaveBeenCalledOnce()
    expect(audio.play).toHaveBeenCalledOnce()
  })

  it("does not seek during normal playback with a small clock difference", () => {
    syncAudio(audio as unknown as HTMLAudioElement, base, true, vi.fn())
    audio.metadata()
    audio.readyState = 4
    audio.seek.mockClear()
    for (let second = 1; second <= 5; second += 1) {
      audio.position = 15 + second - 0.3
      vi.advanceTimersByTime(1000)
    }
    expect(audio.seek).not.toHaveBeenCalled()
    expect(audio.play).toHaveBeenCalledOnce()
  })

  it("leaves buffering and seeking alone, then catches up when media is available", () => {
    syncAudio(audio as unknown as HTMLAudioElement, base, true, vi.fn())
    audio.metadata()
    audio.seek.mockClear()
    // Metadata alone does not mean enough media has downloaded for playback.
    vi.advanceTimersByTime(3000)
    expect(audio.seek).not.toHaveBeenCalled()
    audio.readyState = 4
    audio.dispatchEvent(new Event("waiting"))
    vi.advanceTimersByTime(3000)
    expect(audio.seek).not.toHaveBeenCalled()
    audio.dispatchEvent(new Event("canplay"))
    expect(audio.currentTime).toBe(21)
    audio.seek.mockClear()
    audio.seeking = true
    vi.advanceTimersByTime(3000)
    expect(audio.seek).not.toHaveBeenCalled()
    audio.seeking = false
    vi.advanceTimersByTime(1000)
    expect(audio.currentTime).toBe(25)
  })

  it("disposes the correction timer before the next source starts loading", () => {
    const dispose = syncAudio(
      audio as unknown as HTMLAudioElement,
      base,
      true,
      vi.fn(),
    )
    audio.metadata()
    audio.readyState = 4
    dispose()
    audio.seek.mockClear()
    audio.play.mockClear()
    vi.advanceTimersByTime(5000)
    audio.dispatchEvent(new Event("canplay"))
    expect(audio.seek).not.toHaveBeenCalled()
    expect(audio.play).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
