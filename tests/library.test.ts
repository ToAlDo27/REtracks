import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: { notification: { show: vi.fn() } },
}))
vi.mock("../src/key", () => ({ key: (value: string) => value }))

import {
  addTrackToLibrary,
  clearLibrary,
  getLibrary,
  mergeLibrary,
  onLibraryChange,
  replaceTrackInLibrary,
} from "../src/library"
import { Track } from "../src/track"
import { checkUrl } from "../src/utils"

const track = (
  title: string,
  url = `https://example.com/${title}.mp3`,
): Track => ({ title, url, tags: [] })
let values: Map<string, string>
let storage: {
  getItem: ReturnType<typeof vi.fn>
  setItem: ReturnType<typeof vi.fn>
  removeItem: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  values = new Map()
  storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
  }
  vi.stubGlobal("localStorage", storage)
})
afterEach(() => vi.unstubAllGlobals())

describe("music library writes", () => {
  it("validates before writing even when the existing library is empty", () => {
    expect(() =>
      mergeLibrary([track("valid"), track("bad", "javascript:alert(1)")]),
    ).toThrow("http")
    expect(getLibrary()).toEqual([])
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it("normalizes and deduplicates new links, titles and tags", () => {
    expect(checkUrl("https://youtu.be/abcdefghijk")).toEqual({
      fixed: "https://www.youtube.com/watch?v=abcdefghijk",
    })
    mergeLibrary([
      {
        title: " first ",
        url: " https://youtu.be/abcdefghijk ",
        tags: [" battle ", "", "battle"],
      },
      {
        title: " renamed ",
        url: "https://www.youtube.com/watch?v=abcdefghijk",
        tags: [" tavern ", "tavern"],
        start: 12,
        end: 32,
      },
    ])
    expect(getLibrary()).toEqual([
      {
        title: "renamed",
        url: "https://www.youtube.com/watch?v=abcdefghijk",
        tags: ["tavern"],
        start: 12,
        end: 32,
      },
    ])
  })

  it("updates existing metadata and clip fields without adding a duplicate", () => {
    addTrackToLibrary(track("first"))
    mergeLibrary([
      { ...track("renamed", track("first").url), start: 10, end: 20 },
    ])
    expect(getLibrary()).toEqual([
      { ...track("renamed", track("first").url), start: 10, end: 20 },
    ])
  })

  it("edits a URL in place and merges collisions with an existing link", () => {
    mergeLibrary([track("one"), track("two"), track("three")])
    replaceTrackInLibrary(track("two").url, track("replacement"))
    expect(getLibrary().map(item => item.title)).toEqual([
      "one",
      "replacement",
      "three",
    ])
    replaceTrackInLibrary(
      track("replacement").url,
      track("merged", track("one").url),
    )
    expect(getLibrary().map(item => item.title)).toEqual(["merged", "three"])
    expect(
      getLibrary().some(item => item.url === track("replacement").url),
    ).toBe(false)
  })

  it("reads legacy three-field tracks without adding clip values", () => {
    values.set("library", JSON.stringify([track("legacy")]))
    expect(getLibrary()).toEqual([track("legacy")])
  })

  it("preserves a corrupt library and lets subscribers recover after clearing", () => {
    values.set("library", "not json")
    const changed = vi.fn()
    const failed = vi.fn()
    const unsubscribe = onLibraryChange(changed, failed)
    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("kept") }),
    )
    expect(values.get("library")).toBe("not json")
    clearLibrary()
    expect(changed).toHaveBeenCalledWith([])
    unsubscribe()
  })

  it("reports storage quota failure without emitting an unsaved library", () => {
    addTrackToLibrary(track("saved"))
    const changed = vi.fn()
    const unsubscribe = onLibraryChange(changed)
    changed.mockClear()
    storage.setItem.mockImplementationOnce(() => {
      throw new Error("Quota exceeded")
    })
    expect(() => addTrackToLibrary(track("new"))).toThrow("storage may be full")
    expect(getLibrary()).toEqual([track("saved")])
    expect(changed).not.toHaveBeenCalled()
    unsubscribe()
  })
})
