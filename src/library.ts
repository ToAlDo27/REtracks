import { EventEmitter } from "events"
import { key } from "./key"
import { Track } from "./track"
import { checkTrack, checkUrl } from "./utils"

const path = key("library")
const eventEmitter = new EventEmitter()

function validatedTrack(value: unknown): Track {
  if (!value || typeof value !== "object") {
    throw new Error("Track must contain a title, link and tags")
  }
  const { fixed, validation } = checkTrack(value as Track)
  if (validation) {
    throw new Error(Object.values(validation).filter(Boolean).join(" / "))
  }
  return fixed
}

function uniqueTracks(tracks: unknown[]): Track[] {
  const unique = new Map<string, Track>()
  tracks.forEach(value => {
    const track = validatedTrack(value)
    unique.set(track.url, track)
  })
  return [...unique.values()]
}

function set(tracks: Track[]) {
  try {
    localStorage.setItem(path, JSON.stringify(tracks))
  } catch {
    throw new Error(
      "Unable to save your library. Browser storage may be full or blocked. Export a backup and free some space, then try again.",
    )
  }
  eventEmitter.emit(path, tracks)
}

export function addTrackToLibrary(track: Track) {
  mergeLibrary([track])
}

/** Replace an edited link in place, also merging a collision with another link. */
export function replaceTrackInLibrary(originalUrl: string, track: Track) {
  const fixed = validatedTrack(track)
  const original = checkUrl(originalUrl).fixed
  const current = getLibrary()
  const next = current.flatMap(item =>
    item.url === original ? [fixed] : item.url === fixed.url ? [] : [item],
  )
  if (!current.some(item => item.url === original)) next.unshift(fixed)
  set(next)
}

export function deleteTrackFromLibrary(track: Track) {
  const url = checkUrl(track.url).fixed
  set(getLibrary().filter(t => t.url !== url))
}

/** Validate the whole import before writing anything, even for an empty library. */
export function mergeLibrary(tracks: Track[]) {
  const incoming = uniqueTracks(tracks)
  const current = getLibrary()
  const byUrl = new Map(incoming.map(track => [track.url, track]))
  const existingUrls = new Set(current.map(track => track.url))
  set([
    ...incoming.filter(track => !existingUrls.has(track.url)),
    ...current.map(track => byUrl.get(track.url) ?? track),
  ])
}

export function getLibrary(): Track[] {
  let stored: string | null
  try {
    stored = localStorage.getItem(path)
  } catch {
    throw new Error(
      "Unable to read your library. Allow browser storage for this extension and try again.",
    )
  }
  if (stored === null) return []
  try {
    const value: unknown = JSON.parse(stored)
    if (!Array.isArray(value)) throw new Error("Expected a list of tracks")
    return uniqueTracks(value)
  } catch {
    throw new Error(
      "Your saved library could not be read. The stored data has been kept. Clear the library, then import a CSV backup to restore it.",
    )
  }
}

export function clearLibrary() {
  try {
    localStorage.removeItem(path)
  } catch {
    throw new Error("Unable to clear your library. Browser storage is blocked.")
  }
  eventEmitter.emit(path, [])
}

export function onLibraryChange(
  callback: (tracks: Track[]) => void,
  onError?: (error: Error) => void,
): () => void {
  try {
    callback(getLibrary())
  } catch (failure) {
    if (!onError) throw failure
    onError(
      failure instanceof Error
        ? failure
        : new Error("Unable to read your library"),
    )
  }
  eventEmitter.addListener(path, callback)
  return () => eventEmitter.removeListener(path, callback)
}

export function cleanLibrary() {
  set(getLibrary())
}
