import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  setMetadata: vi.fn(() => Promise.resolve()),
  getMetadata: vi.fn(() => Promise.resolve({})),
  onMetadataChange: vi.fn(() => vi.fn()),
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

  it("publishes the newest queued track without waiting for media metadata", async () => {
    const { play } = await import("../src/mb")
    await Promise.all([play(track("first")), play(track("second"))])
    expect(mocks.setMetadata).toHaveBeenCalledOnce()
    expect(mocks.setMetadata).toHaveBeenCalledWith({
      control: expect.objectContaining({
        track: track("second"),
        duration: 0,
        selectionId: expect.any(String),
      }),
    })
  })

  it("stop supersedes a queued selection while an older room write is still in flight", async () => {
    const pending = deferred<void>()
    mocks.setMetadata.mockReturnValueOnce(pending.promise)
    const { play, stop } = await import("../src/mb")
    const first = play(track("first"))
    await vi.waitFor(() => expect(mocks.setMetadata).toHaveBeenCalledOnce())
    const second = play(track("second"))
    stop()
    expect(mocks.setMetadata).toHaveBeenCalledOnce()
    pending.resolve()
    await Promise.all([first, second])
    await vi.waitFor(() =>
      expect(mocks.setMetadata).toHaveBeenLastCalledWith({
        control: undefined,
      }),
    )
    expect(mocks.setMetadata).toHaveBeenCalledTimes(2)
  })

  it("pauses the newly selected track instead of restoring the previous one", async () => {
    const { play, pause, resume, Action } = await import("../src/mb")
    await play(track("first"))
    const replacement = play(track("second"))
    pause()
    await replacement
    await vi.waitFor(() =>
      expect(mocks.setMetadata).toHaveBeenLastCalledWith({
        control: expect.objectContaining({
          track: track("second"),
          action: Action.Pause,
        }),
      }),
    )
    const paused = mocks.setMetadata.mock.calls.at(-1)?.[0].control
    resume()
    await vi.waitFor(() =>
      expect(mocks.setMetadata).toHaveBeenLastCalledWith({
        control: expect.objectContaining({
          track: track("second"),
          action: Action.Play,
          selectionId: paused.selectionId,
        }),
      }),
    )
  })

  it("publishes the normalized YouTube selection with the same room playback format", async () => {
    const { play } = await import("../src/mb")
    const youtube = {
      ...track("video"),
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    }
    await play(youtube)
    expect(mocks.setMetadata).toHaveBeenCalledWith({
      control: expect.objectContaining({ track: youtube, duration: 0 }),
    })
  })

  it("rejects malformed links without changing the room selection", async () => {
    const { play } = await import("../src/mb")
    await expect(play({ ...track("broken"), url: "broken" })).rejects.toThrow(
      "Invalid url",
    )
    expect(mocks.setMetadata).not.toHaveBeenCalled()
  })
})
