import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/time", () => ({ now: () => new Date("2026-01-01T00:00:05Z") }))

import { syncAudio } from "../src/audioController"
import { Action } from "../src/playback"

class Media extends EventTarget {
  src = ""
  readyState = 0
  duration = 90
  paused = true
  position = 0
  get currentTime() {
    return this.position
  }
  set currentTime(value: number) {
    if (this.readyState < 1) throw new Error("Cannot seek before metadata")
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
  audio = new Media()
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
})
