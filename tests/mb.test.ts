import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  setMetadata: vi.fn(() => Promise.resolve()),
  getMetadata: vi.fn(() => Promise.resolve({})),
  onMetadataChange: vi.fn(() => vi.fn()),
  getAudioDuration: vi.fn(),
  notification: vi.fn(),
}))
vi.mock("@owlbear-rodeo/sdk", () => ({
  default: {
    room: {
      setMetadata: mocks.setMetadata,
      getMetadata: mocks.getMetadata,
      onMetadataChange: mocks.onMetadataChange,
    },
    notification: { show: mocks.notification },
  },
}))
vi.mock("../src/time", () => ({ now: () => new Date("2026-01-01T00:00:00Z") }))
vi.mock("../src/key", () => ({ key: (value: string) => value }))
vi.mock("../src/audioMetadata", () => ({
  getAudioDuration: mocks.getAudioDuration,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
const track = (title: string) => ({
  title,
  url: `https://example.com/${title}.mp3`,
  tags: [],
})

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.setMetadata.mockImplementation(() => Promise.resolve())
})

describe("room playback requests", () => {
  it.each([
    null,
    "not a message",
    42,
    {},
    {
      id: "bad",
      time: "invalid",
      action: 0,
      offset: 0,
      duration: 1,
      track: track("bad"),
    },
    {
      id: "bad",
      time: new Date(),
      action: 3,
      offset: 0,
      duration: 1,
      track: track("bad"),
    },
    {
      id: "bad",
      time: new Date(),
      action: 0,
      offset: -1,
      duration: 1,
      track: track("bad"),
    },
    {
      id: "bad",
      time: new Date(),
      action: 0,
      offset: 0,
      duration: Number.NaN,
      track: track("bad"),
    },
    {
      id: "bad",
      time: new Date(),
      action: 0,
      offset: 0,
      duration: 1,
      track: { ...track("bad"), tags: [null] },
    },
  ])("ignores malformed room metadata %#", async value => {
    mocks.getMetadata.mockResolvedValueOnce({ control: value })
    const { onMessage } = await import("../src/mb")
    const received = vi.fn()
    const unsubscribe = onMessage(received)
    await vi.waitFor(() => expect(received).toHaveBeenCalledWith(undefined))
    unsubscribe()
  })

  it("clamps future timestamps without modifying the room's metadata object", async () => {
    const value = {
      id: "future",
      time: new Date("2030-01-01"),
      action: 0,
      offset: 0,
      duration: 1,
      track: track("future"),
    }
    mocks.getMetadata.mockResolvedValueOnce({ control: value })
    const { onMessage } = await import("../src/mb")
    const received = vi.fn()
    const unsubscribe = onMessage(received)
    await vi.waitFor(() =>
      expect(received).toHaveBeenCalledWith(
        expect.objectContaining({ time: new Date("2026-01-01T00:00:00Z") }),
      ),
    )
    expect(value.time).toEqual(new Date("2030-01-01"))
    unsubscribe()
  })

  it("publishes only the newest track when metadata arrives out of order", async () => {
    const first = deferred<number>()
    const second = deferred<number>()
    mocks.getAudioDuration
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { play } = await import("../src/mb")
    const a = play(track("first"))
    const firstSignal = mocks.getAudioDuration.mock.calls[0][1] as AbortSignal
    const b = play(track("second"))
    expect(firstSignal.aborted).toBe(true)
    second.resolve(60)
    await b
    first.resolve(100)
    await a
    expect(mocks.setMetadata).toHaveBeenCalledOnce()
    expect(mocks.setMetadata).toHaveBeenCalledWith({
      control: expect.objectContaining({
        track: track("second"),
        duration: 60,
      }),
    })
  })

  it.each(["stop", "pause"] as const)(
    "%s cancels a loading track so late metadata cannot restart it",
    async action => {
      const pending = deferred<number>()
      mocks.getAudioDuration.mockReturnValueOnce(pending.promise)
      const controls = await import("../src/mb")
      const loading = controls.play(track("slow"))
      const signal = mocks.getAudioDuration.mock.calls[0][1] as AbortSignal
      controls[action]()
      expect(signal.aborted).toBe(true)
      pending.resolve(90)
      await loading
      expect(
        mocks.setMetadata.mock.calls.every(
          ([data]) => data.control === undefined,
        ),
      ).toBe(true)
    },
  )

  it("publishes YouTube without attempting to load the video as an audio file", async () => {
    const { play } = await import("../src/mb")
    const youtube = {
      ...track("video"),
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    }
    await play(youtube)
    expect(mocks.getAudioDuration).not.toHaveBeenCalled()
    expect(mocks.setMetadata).toHaveBeenCalledWith({
      control: expect.objectContaining({ track: youtube, duration: 0 }),
    })
  })

  it("surfaces probe errors as rejected promises callers can display", async () => {
    mocks.getAudioDuration.mockRejectedValueOnce(new Error("Broken link"))
    const { play } = await import("../src/mb")
    await expect(play(track("broken"))).rejects.toThrow("Broken link")
    expect(mocks.setMetadata).not.toHaveBeenCalled()
  })
})
