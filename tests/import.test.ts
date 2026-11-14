import { describe, expect, it, vi } from "vitest"
vi.mock("@owlbear-rodeo/sdk", () => ({
  default: { notification: { show: vi.fn() } },
}))

import { TracksToCsv, csvToTracks } from "../src/csv"
import { tracksFromLines } from "../src/trackImport"
import { checkTrack, checkUrl, convertToDirectDownloadable } from "../src/utils"

describe("music link input", () => {
  it("accepts mixed named, plain and timestamped links in one paste", () => {
    expect(
      tracksFromLines(
        "Tavern | https://example.com/tavern.mp3\n\nhttps://example.com/forest_night.ogg\nhttps://youtu.be/abcdefghijk?t=1m30s&end=120",
        [" mood ", "mood"],
      ),
    ).toEqual({
      tracks: [
        {
          title: "Tavern",
          url: "https://example.com/tavern.mp3",
          tags: ["mood"],
        },
        {
          title: "forest night",
          url: "https://example.com/forest_night.ogg",
          tags: ["mood"],
        },
        {
          title: "YouTube abcdefghijk",
          url: "https://www.youtube.com/watch?v=abcdefghijk",
          tags: ["mood"],
          start: 90,
          end: 120,
        },
      ],
      errors: [],
    })
  })

  it("reports the actual bad line and returns no partial import", () => {
    const result = tracksFromLines(
      "https://example.com/good.mp3\n\nBad | not-a-link",
    )
    expect(result.tracks).toEqual([])
    expect(result.errors).toEqual([{ line: 3, message: "Invalid url" }])
    expect(tracksFromLines(" \n").errors).toHaveLength(1)
  })

  it.each([
    "file:///C:/song.mp3",
    "javascript:alert(1)",
    "data:audio/mp3;base64,AA==",
    "https://user:password@example.com/audio.mp3",
    "https://youtube.com/playlist?list=PL123",
  ])("rejects unsupported input: %s", url => {
    expect(checkUrl(url).validation).toBeTruthy()
  })

  it.each([
    { start: -1 },
    { start: NaN },
    { start: Infinity },
    { end: 0 },
    { start: 20, end: 10 },
    { start: 20, end: 20 },
  ])("rejects invalid clip bounds: %j", clip => {
    expect(
      checkTrack({
        title: "clip",
        url: "https://example.com/a.mp3",
        tags: [],
        ...clip,
      }).validation,
    ).toBeTruthy()
  })

  it("converts real Dropbox links without rewriting a lookalike host", () => {
    expect(
      convertToDirectDownloadable("https://www.dropbox.com/s/abc/a.mp3?dl=0"),
    ).toBe("https://dl.dropboxusercontent.com/s/abc/a.mp3?dl=1")
    expect(convertToDirectDownloadable("https://notdropbox.com/a.mp3")).toBe(
      "https://notdropbox.com/a.mp3",
    )
  })
})

describe("CSV music backups", () => {
  it("keeps the original three-column format when no clips are present", () => {
    const tracks = [
      {
        title: "Tavern, night",
        url: "https://example.com/a.mp3",
        tags: ["ambient", "night"],
      },
    ]
    const csv = TracksToCsv(tracks)
    expect(csv.split(/\r?\n/)[0]).toBe("title,url,tags")
    expect(csvToTracks(csv)).toEqual({ tracks, errors: [] })
  })

  it("round-trips optional clip positions alongside full tracks", () => {
    const tracks = [
      {
        title: "Clip",
        url: "https://example.com/a.mp3",
        tags: [],
        start: 12.5,
        end: 40,
      },
      { title: "Full", url: "https://example.com/b.mp3", tags: [] },
    ]
    const csv = TracksToCsv(tracks)
    expect(csv.split(/\r?\n/)[0]).toBe("title,url,tags,start,end")
    expect(csvToTracks(csv)).toEqual({ tracks, errors: [] })
  })

  it("rejects malformed rows and invalid bounds without silently importing the rest", () => {
    const result = csvToTracks(
      "title,url,tags,start,end\nGood,https://example.com/a.mp3,,,\nBad,https://example.com/b.mp3,,30,10",
    )
    expect(result.tracks).toEqual([])
    expect(result.errors[0]).toMatchObject({
      row: 2,
      errors: [expect.stringContaining("greater than start")],
    })
    expect(
      csvToTracks("title,url,tags\nGood,https://example.com/a.mp3,,extra")
        .tracks,
    ).toEqual([])
    expect(
      csvToTracks("title,url,tags\nGood,https://example.com/a.mp3,,extra")
        .errors,
    ).toHaveLength(1)
  })
})
