import OBR from "@owlbear-rodeo/sdk"

let skew = 0

export function now() {
  return new Date(new Date().getTime() + skew)
}

export function setSkew(callback: () => void) {
  OBR.onReady(async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(location.origin, {
        cache: "no-store",
        signal: controller.signal,
      })
      const date = response.headers.get("date")
      const serverTime = date === null ? NaN : new Date(date).getTime()
      if (Number.isFinite(serverTime)) skew = serverTime - Date.now()
    } catch {
      // A failed time check must not prevent the entire music UI from mounting.
      console.warn("Tracks could not check server time; using the local clock.")
    } finally {
      clearTimeout(timer)
      callback()
    }
  })
}
