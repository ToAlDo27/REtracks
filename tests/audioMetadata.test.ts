import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

class Probe {
  static instances: Probe[] = []
  preload = ""
  src = ""
  duration = 90
  onloadedmetadata: (() => void) | null = null
  onerror: (() => void) | null = null
  pause = vi.fn()
  load = vi.fn()
  removeAttribute = vi.fn()
  constructor() {
    Probe.instances.push(this)
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  Probe.instances = []
  vi.stubGlobal("Audio", Probe)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("audio metadata probes", () => {
  it("releases aborted requests and ignores their late metadata callbacks", async () => {
    const { getAudioDuration } = await import("../src/audioMetadata")
    const controller = new AbortController()
    const promise = getAudioDuration(
      "https://example.com/a.mp3",
      controller.signal,
    )
    const audio = Probe.instances[0]
    const staleCallback = audio.onloadedmetadata!
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: "AbortError" })
    staleCallback()
    expect(audio.onloadedmetadata).toBeNull()
    expect(audio.onerror).toBeNull()
    expect(audio.pause).toHaveBeenCalledOnce()
    expect(audio.removeAttribute).toHaveBeenCalledWith("src")
    expect(audio.load).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("caches successful durations without retaining media elements", async () => {
    const { getAudioDuration } = await import("../src/audioMetadata")
    const first = getAudioDuration("cached", new AbortController().signal)
    Probe.instances[0].onloadedmetadata!()
    await expect(first).resolves.toBe(90)
    await expect(
      getAudioDuration("cached", new AbortController().signal),
    ).resolves.toBe(90)
    expect(Probe.instances).toHaveLength(1)
    expect(Probe.instances[0].load).toHaveBeenCalledOnce()
  })

  it("bounds the cache so a large music library does not grow it indefinitely", async () => {
    const { getAudioDuration } = await import("../src/audioMetadata")
    for (let index = 0; index < 65; index++) {
      const promise = getAudioDuration(
        `track-${index}`,
        new AbortController().signal,
      )
      Probe.instances[index].onloadedmetadata!()
      await promise
    }
    const reload = getAudioDuration("track-0", new AbortController().signal)
    expect(Probe.instances).toHaveLength(66)
    Probe.instances[65].onloadedmetadata!()
    await reload
  })

  it("rejects errors and timeouts asynchronously and releases media", async () => {
    const { getAudioDuration } = await import("../src/audioMetadata")
    const failed = getAudioDuration("broken", new AbortController().signal)
    const rejection = expect(failed).rejects.toThrow("Unable to load audio")
    Probe.instances[0].onerror!()
    await rejection
    const timedOut = getAudioDuration("slow", new AbortController().signal)
    const timeout = expect(timedOut).rejects.toThrow("timed out")
    vi.advanceTimersByTime(15000)
    await timeout
    expect(Probe.instances[1].load).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
