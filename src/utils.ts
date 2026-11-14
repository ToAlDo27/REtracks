import { ObrError } from "./errors"
import { now } from "./time"
import { Track } from "./track"
import { getYouTubeClip, isYouTubeUrl, normalizeYouTubeUrl } from "./youtubeUrl"

// get number of seconds between two times
export function getSeconds(time: Date) {
  return (now().getTime() - new Date(time).getTime()) / 1000
}

// convert urls into direct downloadable urls, currently only supports dropbox
export function convertToDirectDownloadable(url: string): string {
  let urlObject: URL
  try {
    urlObject = new URL(url)
  } catch {
    throw new ObrError(`Failed to convert, invalid url: ${url}`)
  }

  if (
    urlObject.hostname === "dropbox.com" ||
    urlObject.hostname.endsWith(".dropbox.com")
  ) {
    urlObject.searchParams.set("dl", "1")
    urlObject.hostname = "dl.dropboxusercontent.com"
    return urlObject.href
  }
  return url
}

export interface CheckResult<F, V> {
  fixed: F
  validation?: V
}

export function checkTitle(title: string): CheckResult<string, string> {
  const fixed = typeof title === "string" ? title.trim() : ""
  return { fixed, validation: fixed ? undefined : "Title can not be blank" }
}

export function checkUrl(url: string): CheckResult<string, string> {
  let fixed = typeof url === "string" ? url.trim() : ""

  try {
    const urlObject = new URL(fixed)
    if (!["http:", "https:"].includes(urlObject.protocol)) {
      return { fixed, validation: "Use a public http:// or https:// link" }
    }
    if (urlObject.username || urlObject.password) {
      return {
        fixed,
        validation: "Links containing a login or password are not supported",
      }
    }
    if (urlObject.hostname === "drive.google.com") {
      return {
        fixed,
        validation: "Google Drive urls no longer work",
      }
    }
    if (isYouTubeUrl(fixed)) {
      const normalized = normalizeYouTubeUrl(fixed)
      if (!normalized) {
        return {
          fixed,
          validation:
            "Paste a link to a YouTube video, not a channel or playlist",
        }
      }
      fixed = normalized
    } else {
      fixed = urlObject.href
    }
  } catch {
    return { fixed, validation: "Invalid url" }
  }

  return { fixed }
}

export function checkTags(tags: string[]): CheckResult<string[], string> {
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== "string")) {
    return { fixed: [], validation: "Tags must be a list of text values" }
  }
  return { fixed: [...new Set(tags.map(t => t.trim()).filter(Boolean))] }
}

export interface TrackValidation {
  titleValidation?: string
  urlValidation?: string
  tagsValidation?: string
  startValidation?: string
  endValidation?: string
}

export function checkTrack(
  track: Track,
): CheckResult<Track, TrackValidation | undefined> {
  const { fixed: title, validation: titleValidation } = checkTitle(track.title)
  const { fixed: url, validation: urlValidation } = checkUrl(track.url)
  const { fixed: tags, validation: tagsValidation } = checkTags(track.tags)
  const clip = getYouTubeClip(track.url)
  const start = track.start ?? clip.start
  const end = track.end ?? clip.end
  const startValidation =
    start !== undefined && (!Number.isFinite(start) || start < 0)
      ? "Start must be a number of seconds, zero or greater"
      : undefined
  const endValidation =
    end !== undefined && (!Number.isFinite(end) || end <= (start ?? 0))
      ? "End must be a number of seconds greater than start"
      : undefined

  return {
    fixed: {
      title,
      url,
      tags,
      ...(start !== undefined ? { start } : {}),
      ...(end !== undefined ? { end } : {}),
    },
    validation:
      titleValidation ||
      urlValidation ||
      tagsValidation ||
      startValidation ||
      endValidation
        ? {
            titleValidation,
            urlValidation,
            tagsValidation,
            startValidation,
            endValidation,
          }
        : undefined,
  }
}
