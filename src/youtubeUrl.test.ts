import { describe, expect, it } from "vitest"
import {
  getYouTubeClip,
  getYouTubeId,
  isYouTubeUrl,
  normalizeYouTubeUrl,
} from "./youtubeUrl"

describe("YouTube video links", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=45s&list=PL123",
    "https://youtu.be/dQw4w9WgXcQ?si=share",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://m.youtube.com/shorts/dQw4w9WgXcQ",
    "https://youtube.com/live/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  ])("extracts a video from %s", value => {
    expect(getYouTubeId(value)).toBe("dQw4w9WgXcQ")
    expect(normalizeYouTubeUrl(value)).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    )
  })

  it.each([
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com@evil.test/watch?v=dQw4w9WgXcQ",
    "javascript:alert('dQw4w9WgXcQ')",
    "https://youtu.be/dQw4w9WgXcQ/other",
    "https://youtube.com/watch?v=short",
    "https://youtube.com/playlist?list=PL123",
    "https://example.com/audio.mp3?v=dQw4w9WgXcQ",
  ])("rejects malformed and lookalike links: %s", value => {
    expect(getYouTubeId(value)).toBeUndefined()
    expect(normalizeYouTubeUrl(value)).toBeUndefined()
  })

  it("distinguishes a malformed YouTube link from another media host", () => {
    expect(isYouTubeUrl("https://youtube.com/playlist?list=PL123")).toBe(true)
    expect(isYouTubeUrl("https://notyoutube.com/watch?v=dQw4w9WgXcQ")).toBe(
      false,
    )
  })

  it("preserves YouTube share timestamps as clip bounds", () => {
    expect(
      getYouTubeClip("https://youtu.be/dQw4w9WgXcQ?t=1h2m3s&end=4000"),
    ).toEqual({ start: 3723, end: 4000 })
    expect(
      getYouTubeClip("https://youtube.com/watch?v=dQw4w9WgXcQ#t=90s"),
    ).toEqual({ start: 90 })
    expect(
      getYouTubeClip("https://youtube.com/embed/dQw4w9WgXcQ?start=12.5&end=30"),
    ).toEqual({ start: 12.5, end: 30 })
    expect(
      getYouTubeClip("https://youtu.be/dQw4w9WgXcQ?t=-10&end=oops"),
    ).toEqual({})
    expect(
      getYouTubeClip("https://example.com/watch?v=dQw4w9WgXcQ&t=20"),
    ).toEqual({})
  })
})
