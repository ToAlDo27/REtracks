import { describe, expect, it, vi } from "vitest"

vi.mock("../src/time", () => ({ now: () => new Date("2026-01-01T00:00:20Z") }))

import {
  Action,
  getClipBounds,
  getClipDuration,
  getMediaPosition,
  getPlaybackPosition,
} from "../src/playback"

const track = {
  title: "Test",
  url: "https://example.com/test.mp3",
  tags: [],
  start: 10,
  end: 40,
}
const message = {
  track,
  action: Action.Play,
  offset: 15,
  duration: 100,
  time: new Date("2026-01-01T00:00:00Z"),
}

describe("clip playback positions", () => {
  it("loops within selected bounds and translates clip time to source time", () => {
    expect(getClipDuration(track, 100)).toBe(30)
    expect(getPlaybackPosition(message)).toBe(5)
    expect(getMediaPosition(message)).toBe(15)
  })

  it("keeps a paused clip at its exact offset", () => {
    expect(getMediaPosition({ ...message, action: Action.Pause })).toBe(25)
  })

  it("clamps the selected end to actual media duration", () => {
    expect(getClipBounds(track, 25)).toEqual({
      start: 10,
      end: 25,
      duration: 15,
    })
    expect(getClipDuration({ ...track, start: 200 }, 100)).toBe(0)
  })

  it("supports unknown YouTube or stream duration without NaN/modulo zero", () => {
    const unknown = {
      ...message,
      track: { ...track, end: undefined },
      duration: 0,
    }
    expect(getPlaybackPosition(unknown)).toBe(35)
    expect(getMediaPosition(unknown)).toBe(45)
    expect(getClipDuration(unknown.track, 0)).toBe(0)
  })

  it("can loop a known clip even while source duration is unknown", () => {
    expect(getMediaPosition({ ...message, duration: 0 })).toBe(15)
  })
})
