import Papa from "papaparse"
import { Track } from "./track"
import { checkTrack } from "./utils"

interface Row {
  title: string
  url: string
  tags: string
  start?: string
  end?: string
}

export interface CsvError {
  row: number
  errors: string[]
}
function isRow(something: unknown): something is Row {
  if (!something || typeof something !== "object") return false
  const { title, url, tags, start, end } = something as Row
  return (
    typeof title === "string" &&
    typeof url === "string" &&
    typeof tags === "string" &&
    (start === undefined || typeof start === "string") &&
    (end === undefined || typeof end === "string")
  )
}

const tagDelimiter = "|"

const options = { delimiter: ",", header: true, skipEmptyLines: true }

export function csvToTracks(text: string): {
  tracks: Track[]
  errors: CsvError[]
} {
  const results = Papa.parse<Row>(text, options)

  if (
    results.meta.fields === undefined ||
    !["title", "url", "tags"].every(
      field => results.meta.fields?.includes(field),
    ) ||
    results.meta.fields.some(
      field => !["title", "url", "tags", "start", "end"].includes(field),
    ) ||
    new Set(results.meta.fields).size !== results.meta.fields.length
  ) {
    return {
      tracks: [],
      errors: [
        {
          row: 0,
          errors: [
            "Use the columns title,url,tags with optional start,end (seconds)",
          ],
        },
      ],
    }
  }

  const errors: CsvError[] = results.errors
    .filter(error => error.row === undefined)
    .map(error => ({ row: 0, errors: [error.message] }))
  const tracks: Track[] = []
  results.data.forEach((r, i) => {
    // add all existing csv errors to
    const errorList = {
      row: i + 1,
      errors: results.errors.filter(e => i === e.row).map(e => e.message),
    }

    // make sure its a row
    if (!isRow(r)) {
      errorList.errors.push("Not a valid row")
      errors.push(errorList)

      // no point continuing
      return
    }

    // check the track
    const { fixed, validation } = checkTrack({
      title: r.title,
      url: r.url,
      tags: r.tags === "" ? [] : r.tags.split(tagDelimiter),
      ...(r.start?.trim() ? { start: Number(r.start) } : {}),
      ...(r.end?.trim() ? { end: Number(r.end) } : {}),
    })

    if (validation) {
      errorList.errors.push(
        ...Object.values(validation).reduce<string[]>((result, v) => {
          if (v) {
            result.push(v)
          }
          return result
        }, []),
      )
    }

    if (errorList.errors.length > 0) {
      errors.push(errorList)
      return
    }
    tracks.push(fixed)
  })

  // don't return any tracks if there were errors
  if (errors.length > 0) {
    return { tracks: [], errors }
  }

  return { tracks, errors: [] }
}

export function TracksToCsv(tracks: Track[]): string {
  const includeClips = tracks.some(
    track => track.start !== undefined || track.end !== undefined,
  )
  return Papa.unparse<Row>(
    tracks.map<Row>(r => ({
      title: r.title,
      url: r.url,
      tags: r.tags.join(tagDelimiter),
      ...(includeClips
        ? { start: r.start?.toString() ?? "", end: r.end?.toString() ?? "" }
        : {}),
    })),
    options,
  )
}
