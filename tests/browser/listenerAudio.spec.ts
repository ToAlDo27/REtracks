import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
const APP_VERSION = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
).version

type AudioTestWindow = Window & {
  __obrMock: {
    actionHeight: number
    receiveBroadcast(
      channel: string,
      event: { data: unknown; connectionId: string },
    ): void
  }
  __captureOptions?: DisplayMediaStreamOptions
  __level?: { context: AudioContext; analyser: AnalyserNode }
}

test("listener connection enables audible real WebRTC playback even when initially muted at zero volume", async ({
  context,
}) => {
  await context.addInitScript(() => {
    localStorage.setItem("com.obr.tracks/volume", "0")
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      configurable: true,
      value: async (options: DisplayMediaStreamOptions) => {
        (window as AudioTestWindow).__captureOptions = options
        const canvas = document.createElement("canvas")
        canvas.width = 160
        canvas.height = 100
        const video = canvas.captureStream(10)
        const audioContext = new AudioContext()
        const oscillator = audioContext.createOscillator()
        oscillator.frequency.value = 440
        const destination = audioContext.createMediaStreamDestination()
        oscillator.connect(destination)
        oscillator.start()
        await audioContext.resume()
        return new MediaStream([
          ...video.getVideoTracks(),
          ...destination.stream.getAudioTracks(),
        ])
      },
    })
    // Exercise recovery from autoplay denial after asynchronous negotiation.
    if (new URLSearchParams(location.search).get("client") === "guest") {
      const original = HTMLMediaElement.prototype.play
      let denied = false
      HTMLMediaElement.prototype.play = function () {
        if (
          this.getAttribute("aria-label") === "Tab audio stream" &&
          this.srcObject &&
          !denied
        ) {
          denied = true
          return Promise.reject(
            new DOMException("Test autoplay policy", "NotAllowedError"),
          )
        }
        return original.call(this)
      }
    }
  })
  const host = await context.newPage(),
    guest = await context.newPage()
  const errors: string[] = []
  const clients: { page: Page; connectionId: string }[] = [
    { page: host, connectionId: "host" },
    { page: guest, connectionId: "guest" },
  ]
  for (const client of clients) {
    client.page.on("pageerror", error => errors.push(error.message))
    await client.page.exposeFunction("__obrGetPlayers", () => [
      { connectionId: "host", role: "GM" },
      { connectionId: "guest", role: "PLAYER" },
    ])
    await client.page.exposeFunction(
      "__obrBroadcast",
      async (channel: string, data: unknown) => {
        await Promise.all(
          clients
            .filter(target => target !== client && !target.page.isClosed())
            .map(target =>
              target.page.evaluate(
                ({ channel, data, connectionId }) => {
                  (window as AudioTestWindow).__obrMock.receiveBroadcast(
                    channel,
                    { data, connectionId },
                  )
                },
                { channel, data, connectionId: client.connectionId },
              ),
            ),
        )
      },
    )
  }
  await host.goto("/?client=host&role=GM")
  await guest.goto("/?client=guest&role=PLAYER")
  const popupPromise = host.waitForEvent("popup")
  await host
    .getByRole("button", { name: "Share tab audio", exact: true })
    .click()
  const popup = await popupPromise
  await popup
    .getByRole("button", { name: "Choose tab and start", exact: true })
    .click()
  const options = await popup.evaluate(
    () => (window as AudioTestWindow).__captureOptions,
  )
  expect(options?.audio).toMatchObject({
    suppressLocalAudioPlayback: false,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  })
  const streamAudio = guest.locator('audio[aria-label="Tab audio stream"]')
  await expect(streamAudio).toHaveJSProperty("muted", true)
  await expect(streamAudio).toHaveJSProperty("volume", 0)
  await guest
    .getByRole("button", { name: "Listen to tab audio", exact: true })
    .click()
  await expect(
    guest.getByRole("button", { name: "Enable stream audio", exact: true }),
  ).toBeVisible({ timeout: 15000 })
  await expect
    .poll(() =>
      guest.evaluate(() => (window as AudioTestWindow).__obrMock.actionHeight),
    )
    .toBeGreaterThanOrEqual(250)
  const height = await guest.evaluate(
    () => (window as AudioTestWindow).__obrMock.actionHeight,
  )
  await guest.setViewportSize({ width: 400, height })
  const enableButton = guest.getByRole("button", {
    name: "Enable stream audio",
    exact: true,
  })
  await expect
    .poll(async () => {
      const box = await enableButton.boundingBox()
      return !!box && box.y + box.height <= height
    })
    .toBe(true)
  await guest
    .getByRole("button", { name: "Enable stream audio", exact: true })
    .click()
  await expect(streamAudio).toHaveJSProperty("muted", false)
  await expect(streamAudio).toHaveJSProperty("volume", 0.3)
  await expect(streamAudio).toHaveJSProperty("paused", false)
  await expect(
    guest.getByRole("button", { name: "Mute audio", exact: true }),
  ).toBeVisible()
  await expect(
    guest.getByText("Listening to tab audio. Library audio is muted.", {
      exact: true,
    }),
  ).toBeVisible()
  await guest.evaluate(async () => {
    const stream = (
      document.querySelector(
        'audio[aria-label="Tab audio stream"]',
      ) as HTMLAudioElement
    ).srcObject as MediaStream
    const audioContext = new AudioContext(),
      analyser = audioContext.createAnalyser()
    const silence = audioContext.createGain()
    silence.gain.value = 0
    audioContext.createMediaStreamSource(stream).connect(analyser)
    analyser.connect(silence)
    silence.connect(audioContext.destination)
    ;(window as AudioTestWindow).__level = { context: audioContext, analyser }
    await audioContext.resume()
  })
  await expect
    .poll(() =>
      guest.evaluate(() => {
        const analyser = (window as AudioTestWindow).__level!.analyser
        const samples = new Float32Array(analyser.fftSize)
        analyser.getFloatTimeDomainData(samples)
        return Math.sqrt(
          samples.reduce((sum, sample) => sum + sample * sample, 0) /
            samples.length,
        )
      }),
    )
    .toBeGreaterThan(0.001)
  await guest.getByRole("button", { name: "Mute audio", exact: true }).click()
  await expect(streamAudio).toHaveJSProperty("muted", true)
  await guest.getByRole("button", { name: "Unmute audio", exact: true }).click()
  await expect(streamAudio).toHaveJSProperty("muted", false)
  await guest.getByRole("button", { name: "Disconnect", exact: true }).click()
  await expect(streamAudio).toHaveJSProperty("srcObject", null)
  await popup
    .getByRole("button", { name: "Stop broadcast", exact: true })
    .click()
  await guest.evaluate(
    () => (window as AudioTestWindow).__level?.context.close(),
  )
  expect(errors).toEqual([])
})

test("ReTracks exposes current version, music icon, release notes and repository source", async ({
  page,
}) => {
  await page.goto("/?embedded=0")
  await expect(page).toHaveTitle("ReTracks")
  await expect(
    page.getByRole("heading", { name: "ReTracks", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Source code", exact: true }),
  ).toHaveAttribute("href", "https://github.com/ToAlDo27/REtracks")
  await page
    .getByRole("button", {
      name: `Что нового в ReTracks ${APP_VERSION}`,
      exact: true,
    })
    .click()
  const history = page.getByRole("dialog")
  await expect(
    history.getByRole("heading", { name: "ReTracks — история изменений" }),
  ).toBeVisible()
  await expect(history.getByText(APP_VERSION, { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 400, height: 900 })
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true)
  await history.getByRole("button", { name: "Закрыть", exact: true }).click()
  await page.screenshot({
    path: "test-results/retracks-1.0.0.png",
    fullPage: true,
  })
})
