export interface Track {
  title: string
  url: string
  tags: string[]
  /** Absolute source positions in seconds. Omitted values play the full track. */
  start?: number
  end?: number
}

export function toString(track: Track): string {
  return `Title: ${track.title}: Url: ${track.url}`
}

export function emptyTrack(): Track {
  return {
    title: "",
    url: "",
    tags: [],
  }
}
