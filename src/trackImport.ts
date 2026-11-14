import { Track } from "./track"
import { checkTrack } from "./utils"
import { getYouTubeClip, getYouTubeId } from "./youtubeUrl"

export const clipFromUrl = getYouTubeClip

export function titleFromUrl(value: string): string {
  const id = getYouTubeId(value)
  if (id) return `YouTube ${id}`
  try {
    const url = new URL(value)
    const filename = url.pathname.split("/").filter(Boolean).pop()
    return filename
      ? decodeURIComponent(filename)
          .replace(/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i, "")
          .replace(/[_-]/g, " ")
      : url.hostname
  } catch {
    return ""
  }
}

export interface ImportLineError {
  line: number
  message: string
}

/** One URL per line, or a friendly title followed by ` | URL`. No partial imports. */
export function tracksFromLines(
  text: string,
  tags: string[] = [],
): {
  tracks: Track[]
  errors: ImportLineError[]
} {
  const tracks: Track[] = []
  const errors: ImportLineError[] = []
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return
    const separator = line.lastIndexOf(" | ")
    const url = (separator < 0 ? line : line.slice(separator + 3)).trim()
    const title =
      separator < 0 ? titleFromUrl(url) : line.slice(0, separator).trim()
    const { fixed, validation } = checkTrack({
      title,
      url,
      tags,
      ...clipFromUrl(url),
    })
    if (validation) {
      errors.push({
        line: index + 1,
        message: Object.values(validation).filter(Boolean).join(" / "),
      })
    } else {
      tracks.push(fixed)
    }
  })
  if (tracks.length === 0 && errors.length === 0) {
    errors.push({ line: 1, message: "Paste at least one link" })
  }
  return { tracks: errors.length > 0 ? [] : tracks, errors }
}
