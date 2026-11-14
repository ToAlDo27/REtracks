import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { syncAudio } from "../src/audioController"
import type { Message } from "../src/mb"

const sdk = vi.hoisted(() => ({
  setMetadata: vi.fn(),
  getMetadata: vi.fn(),
  onMetadataChange: vi.fn(),
}))
vi.mock("@owlbear-rodeo/sdk", () => ({
  default: {
    room: sdk,
    notification: { show: vi.fn() },
  },
}))
vi.mock("../src/time", () => ({ now: () => new Date(Date.now()) }))
vi.mock("../src/key", () => ({ key: (value: string) => value }))
vi.mock("../src/audioMetadata", () => ({
  getAudioDuration: vi.fn(() => Promise.resolve(120)),
}))

class ClientAudio extends EventTarget {
  src = ""
  duration = 120
  currentTime = 0
  readyState = 0
  paused = true
  seeking = false
  pause = vi.fn(() => {
    this.paused = true
  })
  play = vi.fn(() => {
    this.paused = false
    return Promise.resolve()
  })
  load() {
    this.readyState = 0
    this.currentTime = 0
  }
  getAttribute(name: string) {
    return name === "src" ? this.src : null
  }
  removeAttribute(name: string) {
    if (name === "src") this.src = ""
  }
  metadata() {
    this.readyState = 4
    this.dispatchEvent(new Event("loadedmetadata"))
  }
}

type RoomMetadata = Record<string, unknown>
let metadata: RoomMetadata
let listeners: Set<(metadata: RoomMetadata) => void>
let cleanups: Array<() => void>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
  vi.resetModules()
  vi.clearAllMocks()
  metadata = {}
  listeners = new Set()
  cleanups = []
  sdk.getMetadata.mockImplementation(() => Promise.resolve({ ...metadata }))
  sdk.onMetadataChange.mockImplementation(callback => {
    listeners.add(callback)
    return () => listeners.delete(callback)
  })
  sdk.setMetadata.mockImplementation(async (change: RoomMetadata) => {
    for (const [key, value] of Object.entries(change)) {
      if (value === undefined) delete metadata[key]
      // A room sends serialized timestamps, rather than sharing Date instances.
      else metadata[key] = JSON.parse(JSON.stringify(value))
    }
    for (const receive of listeners) receive({ ...metadata })
  })
})

afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
})

async function connect() {
  const { onMessage } = await import("../src/mb")
  const audio = new ClientAudio()
  const error = vi.fn()
  let dispose = () => undefined
  const unsubscribe = onMessage((message: Message | undefined) => {
    dispose()
    dispose = syncAudio(
      audio as unknown as HTMLAudioElement,
      message,
      true,
      error,
    )
  })
  cleanups.push(() => {
    unsubscribe()
    dispose()
  })
  await vi.advanceTimersByTimeAsync(0)
  return { audio, error }
}

function advance(seconds: number, ...playing: ClientAudio[]) {
  for (let second = 0; second < seconds; second += 1) {
    for (const audio of playing) {
      if (!audio.paused && audio.readyState >= 3) audio.currentTime += 1
    }
    vi.advanceTimersByTime(1000)
  }
}

const track = {
  title: "Shared music",
  url: "https://example.com/music.mp3",
  tags: [],
  start: 10,
  end: 40,
}

describe("room playback across independent listeners", () => {
  it("aligns delayed loads and late joins, then shares pause, seek, and resume", async () => {
    const host = await connect()
    const guest = await connect()
    const controls = await import("../src/mb")
    await controls.play(track)
    host.audio.metadata()
    advance(4, host.audio)
    guest.audio.metadata()
    expect(host.audio.currentTime).toBe(14)
    expect(guest.audio.currentTime).toBe(14)

    advance(1, host.audio, guest.audio)
    controls.pause()
    await vi.advanceTimersByTimeAsync(0)
    expect(host.audio.paused).toBe(true)
    expect(guest.audio.paused).toBe(true)
    advance(8)
    expect(host.audio.currentTime).toBe(15)
    expect(guest.audio.currentTime).toBe(15)

    controls.seek(8)
    await vi.advanceTimersByTimeAsync(0)
    expect(host.audio.currentTime).toBe(18)
    expect(guest.audio.currentTime).toBe(18)
    expect(guest.audio.paused).toBe(true)
    controls.resume()
    await vi.advanceTimersByTimeAsync(0)
    advance(3, host.audio, guest.audio)
    const lateGuest = await connect()
    lateGuest.audio.metadata()
    expect(host.audio.currentTime).toBe(21)
    expect(guest.audio.currentTime).toBe(21)
    expect(lateGuest.audio.currentTime).toBe(21)
    expect(lateGuest.audio.paused).toBe(false)
    expect(host.error).not.toHaveBeenCalled()
    expect(guest.error).not.toHaveBeenCalled()
    expect(lateGuest.error).not.toHaveBeenCalled()
  })

  it("recovers a stalled guest and clears playback and timers for both clients on stop", async () => {
    const host = await connect()
    const guest = await connect()
    const controls = await import("../src/mb")
    await controls.play(track)
    host.audio.metadata()
    guest.audio.metadata()
    guest.audio.dispatchEvent(new Event("waiting"))
    advance(5, host.audio)
    expect(host.audio.currentTime).toBe(15)
    expect(guest.audio.currentTime).toBe(10)
    guest.audio.dispatchEvent(new Event("canplay"))
    expect(guest.audio.currentTime).toBe(15)

    // A tab can resume with enough buffered audio but with an outdated position.
    advance(4, host.audio)
    expect(guest.audio.currentTime).toBe(host.audio.currentTime)
    controls.stop()
    await vi.advanceTimersByTimeAsync(0)
    expect(host.audio.src).toBe("")
    expect(guest.audio.src).toBe("")
    expect(host.audio.paused).toBe(true)
    expect(guest.audio.paused).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    guest.audio.dispatchEvent(new Event("canplay"))
    advance(5)
    expect(guest.audio.paused).toBe(true)
  })
})
