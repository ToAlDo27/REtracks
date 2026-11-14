import { Buffer } from "node:buffer"
import { expect, Page, test } from "@playwright/test"
import type { Message } from "../../src/mb"

type Metadata = Record<string, unknown>
type RoomWindow = Window & {
  __obrMock: {
    metadata: Metadata
    receiveMetadata: (metadata: Metadata) => void
  }
}

/** Ten seconds makes elapsed playback and a late join distinguishable from zero. */
function wave() {
  const rate = 8000
  const size = rate * 2 * 10
  const data = Buffer.alloc(44 + size)
  data.write("RIFF", 0)
  data.writeUInt32LE(36 + size, 4)
  data.write("WAVEfmt ", 8)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(1, 22)
  data.writeUInt32LE(rate, 24)
  data.writeUInt32LE(rate * 2, 28)
  data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34)
  data.write("data", 36)
  data.writeUInt32LE(size, 40)
  return data
}

const audioState = (page: Page) =>
  page.locator("#tracks-audio-player").evaluate((audio: HTMLAudioElement) => ({
    paused: audio.paused,
    time: audio.currentTime,
    source: audio.getAttribute("src"),
  }))

const roomMessage = (page: Page) =>
  page.evaluate(
    () =>
      (window as RoomWindow).__obrMock.metadata["com.obr.tracks/control"] as
        | Message
        | undefined,
  )

test("room playback reaches a late player and synchronizes pause, seek, resume, switching and stop", async ({
  context,
}) => {
  const host = await context.newPage()
  const guest = await context.newPage()
  const joined = new Set<Page>()
  const errors: string[] = []
  let metadata: Metadata = {}
  let slowServed!: () => void
  const slowResponse = new Promise<void>(resolve => {
    slowServed = resolve
  })

  // This relay replaces only Owlbear's transport. Each page runs the real app,
  // message subscription, HTMLAudioElement and production playback controller.
  for (const page of [host, guest]) {
    page.on("pageerror", error => errors.push(error.message))
    await page.exposeFunction("__obrGetMetadata", () => {
      joined.add(page)
      return metadata
    })
    await page.exposeFunction("__obrSetMetadata", async (patch: Metadata) => {
      metadata = { ...metadata, ...patch }
      await Promise.all(
        [...joined].map(client =>
          client.evaluate(value => {
            const mock = (window as RoomWindow).__obrMock
            mock.receiveMetadata(value)
          }, metadata),
        ),
      )
    })
    await page.route("https://audio.test/**", async route => {
      const slow = route.request().url().endsWith("slow.wav")
      if (slow) await new Promise(resolve => setTimeout(resolve, 400))
      const data = wave()
      const range = route
        .request()
        .headers()
        .range?.match(/^bytes=(\d+)-(\d*)$/)
      const start = range ? Number(range[1]) : 0
      const end = range?.[2]
        ? Math.min(Number(range[2]), data.length - 1)
        : data.length - 1
      await route
        .fulfill({
          status: range ? 206 : 200,
          contentType: "audio/wav",
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Accept-Ranges": "bytes",
            ...(range
              ? { "Content-Range": `bytes ${start}-${end}/${data.length}` }
              : {}),
          },
          body: data.subarray(start, end + 1),
        })
        .catch(() => undefined)
      if (slow) slowServed()
    })
    // Give both clients the same precise server clock. HTTP Date's usual
    // one-second precision would otherwise introduce unrelated test jitter.
    await page.route("http://127.0.0.1:4174/", async route => {
      if (route.request().resourceType() !== "fetch") {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        headers: { date: new Date().toISOString() },
        body: "",
      })
    })
  }

  await host.goto("/?role=GM&client=host")
  await host.getByRole("button", { name: "Unmute audio" }).click()
  await host.evaluate(async () => {
    const moduleUrl = "/src/mb.ts"
    const { play } = await import(moduleUrl)
    await play({
      title: "Room song",
      url: "https://audio.test/room.wav",
      tags: [],
    })
  })
  await expect.poll(async () => (await audioState(host)).paused).toBe(false)
  await expect
    .poll(async () => (await audioState(host)).time)
    .toBeGreaterThan(1.2)

  // Join after the song has already advanced, rather than receiving a fresh play.
  await guest.goto("/?role=PLAYER&client=guest")
  await guest.getByRole("button", { name: "Unmute audio" }).click()
  await expect(
    guest.getByRole("button", { name: "Pause", exact: true }),
  ).toHaveCount(0)
  await expect.poll(async () => (await audioState(guest)).paused).toBe(false)
  await expect
    .poll(async () => (await audioState(guest)).time)
    .toBeGreaterThan(1.2)
  await expect
    .poll(async () => {
      const [a, b] = await Promise.all([audioState(host), audioState(guest)])
      return Math.abs(a.time - b.time)
    })
    .toBeLessThan(0.5)

  await host.getByRole("button", { name: "Pause", exact: true }).click()
  for (const page of [host, guest])
    await expect.poll(async () => (await audioState(page)).paused).toBe(true)
  const paused = await audioState(guest)
  await new Promise(resolve => setTimeout(resolve, 400))
  expect((await audioState(guest)).time).toBeCloseTo(paused.time, 1)

  await host.evaluate(async () => {
    const moduleUrl = "/src/mb.ts"
    const { seek } = await import(moduleUrl)
    seek(4)
  })
  for (const page of [host, guest]) {
    await expect
      .poll(async () => (await audioState(page)).time)
      .toBeCloseTo(4, 1)
    expect((await audioState(page)).paused).toBe(true)
  }
  await host.getByRole("button", { name: "Resume", exact: true }).click()
  for (const page of [host, guest]) {
    await expect.poll(async () => (await audioState(page)).paused).toBe(false)
    await expect
      .poll(async () => (await audioState(page)).time)
      .toBeGreaterThan(4.2)
  }

  await host.evaluate(async () => {
    const moduleUrl = "/src/mb.ts"
    const { play } = await import(moduleUrl)
    void play({
      title: "Slow old song",
      url: "https://audio.test/slow.wav",
      tags: [],
    })
    // Let the first metadata probe start before issuing the replacement.
    await new Promise(resolve => setTimeout(resolve, 50))
    await play({
      title: "Newest song",
      url: "https://audio.test/newest.wav",
      tags: [],
    })
  })
  await slowResponse
  for (const page of [host, guest]) {
    await expect
      .poll(async () => (await roomMessage(page))?.track.title)
      .toBe("Newest song")
    await expect
      .poll(async () => (await audioState(page)).source)
      .toBe("https://audio.test/newest.wav")
    await expect.poll(async () => (await audioState(page)).paused).toBe(false)
  }
  await expect
    .poll(async () => {
      const [a, b] = await Promise.all([audioState(host), audioState(guest)])
      return Math.abs(a.time - b.time)
    })
    .toBeLessThan(0.5)

  await host.getByRole("button", { name: "Stop", exact: true }).click()
  for (const page of [host, guest]) {
    await expect.poll(() => roomMessage(page)).toBeUndefined()
    await expect
      .poll(() => audioState(page))
      .toMatchObject({ paused: true, source: null })
  }
  expect(errors).toEqual([])
})
