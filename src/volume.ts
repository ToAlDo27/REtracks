import { key } from "./key"

const path = key("volume")
const fallback = 0.3

export function getVolume(): number {
  let volume: number
  try {
    volume = parseFloat(localStorage.getItem(path) ?? "")
  } catch {
    return fallback
  }
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    return fallback
  }
  return volume
}

export function setVolume(volume: number) {
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    return
  }
  try {
    localStorage.setItem(path, volume.toString())
  } catch {
    /* Volume still works for this session when browser storage is blocked. */
  }
}
