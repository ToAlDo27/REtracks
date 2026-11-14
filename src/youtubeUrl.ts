const videoIdPattern = /^[a-zA-Z0-9_-]{11}$/
const youtubeHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
])

function parseYouTubeUrl(value: string): URL | undefined {
  try {
    const url = new URL(value.trim())
    return /^(https?:)$/.test(url.protocol) && youtubeHosts.has(url.hostname)
      ? url
      : undefined
  } catch {
    return undefined
  }
}

/** Recognizes only official YouTube hosts, including malformed video links. */
export function isYouTubeUrl(value: string): boolean {
  return parseYouTubeUrl(value) !== undefined
}

/** Supports watch, share, Shorts, live and embed links, without accepting lookalike hosts. */
export function getYouTubeId(value: string): string | undefined {
  const url = parseYouTubeUrl(value)
  if (!url) return undefined

  const parts = url.pathname.split("/").filter(Boolean)
  let id: string | null | undefined
  if (url.hostname === "youtu.be" || url.hostname === "www.youtu.be") {
    if (parts.length === 1) id = parts[0]
  } else if (url.pathname === "/watch" || url.pathname === "/watch/") {
    id = url.searchParams.get("v")
  } else if (
    parts.length === 2 &&
    ["embed", "shorts", "live", "v"].includes(parts[0])
  ) {
    id = parts[1]
  }

  return id && videoIdPattern.test(id) ? id : undefined
}

/** Clip times belong to Track.start/end; canonical URLs identify the source only. */
export function normalizeYouTubeUrl(value: string): string | undefined {
  const id = getYouTubeId(value)
  return id ? `https://www.youtube.com/watch?v=${id}` : undefined
}

function parseTimestamp(value: string | null): number | undefined {
  if (!value) return undefined
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const seconds = Number(value)
    return Number.isFinite(seconds) ? seconds : undefined
  }
  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(value)
  if (!parts || !parts[0]) return undefined
  const seconds =
    Number(parts[1] ?? 0) * 3600 +
    Number(parts[2] ?? 0) * 60 +
    Number(parts[3] ?? 0)
  return Number.isFinite(seconds) ? seconds : undefined
}

/** Preserve share-link timestamps before canonicalizing the source URL. */
export function getYouTubeClip(value: string): {
  start?: number
  end?: number
} {
  if (!getYouTubeId(value)) return {}
  const url = new URL(value.trim())
  const fragment = new URLSearchParams(url.hash.substring(1))
  const start = parseTimestamp(
    url.searchParams.get("start") ??
      url.searchParams.get("t") ??
      fragment.get("t"),
  )
  const end = parseTimestamp(url.searchParams.get("end"))
  return {
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined ? { end } : {}),
  }
}
