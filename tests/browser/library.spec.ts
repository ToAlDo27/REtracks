import { Buffer } from "node:buffer"
import { expect, Page, test } from "@playwright/test"
import type { Track } from "../../src/track"

const library = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("com.obr.tracks/library") ?? "[]",
      ) as Track[],
  )
const currentTrack = (page: Page) =>
  page.evaluate(() => {
    const mock = (
      window as Window & {
        __obrMock: { metadata: Record<string, { track: Track } | undefined> }
      }
    ).__obrMock
    return mock.metadata["com.obr.tracks/control"]?.track.title
  })

async function addBulk(page: Page, text: string) {
  await page.getByRole("button", { name: "Add music", exact: true }).click()
  await page.getByRole("tab", { name: "Multiple tracks" }).click()
  await page.getByLabel("Links, one per line").fill(text)
  await page.getByRole("button", { name: "Add tracks", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
}

function wave() {
  const rate = 8000
  const size = rate * 2
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

test("bulk links, editable URL and clips, deduplication, keyboard save and mobile layout", async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on("pageerror", error => {
    errors.push(error.message)
    console.error(error.stack)
  })
  await page.goto("/")
  await addBulk(
    page,
    "Tavern | https://audio.test/tavern.wav\nBattle | https://audio.test/battle.wav\nCave | https://youtu.be/abcdefghijk?t=30&end=60",
  )
  await expect(
    page.getByRole("button", { name: "Play Tavern", exact: true }),
  ).toBeVisible()
  expect(await library(page)).toHaveLength(3)
  expect(
    (await library(page)).find(track => track.title === "Cave"),
  ).toMatchObject({ start: 30, end: 60 })

  const card = page.locator(".MuiCard-root").filter({
    has: page.getByRole("button", { name: "Play Tavern", exact: true }),
  })
  await card.getByRole("button", { name: "Edit", exact: true }).click()
  await page
    .getByLabel("Audio or YouTube URL")
    .fill("https://audio.test/tavern-edited.wav")
  await page.getByLabel("Start (seconds)").fill("0.1")
  await page.getByLabel("End (seconds)").fill("0.9")
  await page.getByLabel("Title", { exact: true }).fill("Tavern edited")
  await page.getByLabel("Title", { exact: true }).press("Enter")
  await expect(page.getByRole("dialog")).toBeHidden()
  const edited = await library(page)
  expect(edited).toHaveLength(3)
  expect(
    edited.some(track => track.url === "https://audio.test/tavern.wav"),
  ).toBe(false)
  expect(edited.find(track => track.title === "Tavern edited")).toMatchObject({
    url: "https://audio.test/tavern-edited.wav",
    start: 0.1,
    end: 0.9,
  })

  await addBulk(
    page,
    "Battle renamed | https://audio.test/battle.wav\nBattle renamed | https://audio.test/battle.wav",
  )
  expect(await library(page)).toHaveLength(3)
  await page.reload()
  await expect(
    page.getByRole("button", { name: "Play Battle renamed", exact: true }),
  ).toBeVisible()
  await page.setViewportSize({ width: 400, height: 900 })
  await page.getByRole("button", { name: "Add music", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("mobile-add-music.png"),
    fullPage: true,
    animations: "disabled",
  })
  expect(errors).toEqual([])
})

test("rapid direct-audio switching keeps the newest track and stop releases playback", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", error => {
    errors.push(error.message)
    console.error(error.stack)
  })
  let finishSlow!: () => void
  const slowServed = new Promise<void>(resolve => {
    finishSlow = resolve
  })
  await page.route("https://audio.test/**", async route => {
    const slow = route.request().url().includes("slow.wav")
    if (slow) await new Promise(resolve => setTimeout(resolve, 400))
    await route
      .fulfill({
        status: 200,
        contentType: "audio/wav",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: wave(),
      })
      .catch(() => undefined)
    if (slow) finishSlow()
  })
  await page.goto("/")
  await addBulk(
    page,
    "Slow song | https://audio.test/slow.wav\nFast song | https://audio.test/fast.wav",
  )
  await page.getByRole("button", { name: "Unmute audio" }).click()
  await page
    .getByRole("button", { name: "Play Slow song", exact: true })
    .click()
  await page
    .getByRole("button", { name: "Play Fast song", exact: true })
    .click()
  await expect.poll(() => currentTrack(page)).toBe("Fast song")
  await slowServed
  expect(await currentTrack(page)).toBe("Fast song")
  const audio = page.locator("#tracks-audio-player")
  await expect(audio).toHaveJSProperty(
    "currentSrc",
    "https://audio.test/fast.wav",
  )
  await expect(audio).toHaveJSProperty("paused", false)
  await page.getByRole("button", { name: "Stop", exact: true }).click()
  await expect.poll(() => currentTrack(page)).toBeUndefined()
  await expect(audio).toHaveJSProperty("paused", true)
  await expect(audio).not.toHaveAttribute("src")
  expect(errors).toEqual([])
})
