import { expect, Page, test } from "@playwright/test"
import type { TabAudioPeer, TabAudioState, TabSignal } from "../../src/tabAudio"

interface RtcHarness {
  peer: TabAudioPeer
  state: TabAudioState
  received?: MediaStream
  context?: AudioContext
  analyser?: AnalyserNode
  playback?: HTMLAudioElement
  oscillator?: OscillatorNode
  capture?: MediaStream
}

type RtcWindow = Window & {
  rtc: RtcHarness
  relayRtcSignal: (signal: TabSignal) => Promise<void>
}

async function initialize(page: Page, target: Page) {
  await page.route("**/rtc-test.html", route =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Tracks real WebRTC test</title><button>Enable audio</button>",
    }),
  )
  await page.exposeFunction("relayRtcSignal", async (signal: TabSignal) => {
    await target.evaluate(async value => {
      await (window as RtcWindow).rtc.peer.receive(value)
    }, signal)
  })
  await page.goto("/rtc-test.html")
  await page.getByRole("button", { name: "Enable audio" }).click()
  await page.evaluate(async () => {
    const moduleUrl = "/src/tabAudio.ts"
    const { TabAudioPeer } = await import(moduleUrl)
    const current = window as RtcWindow
    const harness = {
      state: { available: false, connected: false, listening: false },
    } as RtcHarness
    harness.peer = new TabAudioPeer(
      (signal: TabSignal) => current.relayRtcSignal(signal),
      (state: TabAudioState) => {
        harness.state = state
      },
      (stream: MediaStream | undefined) => {
        harness.received = stream
        if (stream) {
          const playback = document.createElement("audio")
          playback.srcObject = stream
          playback.volume = 0
          document.body.appendChild(playback)
          harness.playback = playback
          void playback.play().catch(() => undefined)
          const audioContext = new AudioContext()
          harness.context = audioContext
          const analyser = audioContext.createAnalyser()
          harness.analyser = analyser
          audioContext.createMediaStreamSource(stream).connect(analyser)
          // Process the received signal without playing test tones to the device.
          const silent = audioContext.createGain()
          silent.gain.value = 0
          analyser.connect(silent)
          silent.connect(audioContext.destination)
          void audioContext.resume()
        } else harness.playback?.pause()
      },
    )
    current.rtc = harness
  })
}

test("real WebRTC sends tab audio between two pages and releases it on stop", async ({
  context,
}) => {
  const host = await context.newPage()
  const guest = await context.newPage()
  const errors: string[] = []
  host.on("pageerror", error => errors.push(error.message))
  guest.on("pageerror", error => errors.push(error.message))
  try {
    await initialize(host, guest)
    await initialize(guest, host)
    await host.evaluate(async () => {
      const rtc = (window as RtcWindow).rtc
      const audioContext = new AudioContext()
      rtc.context = audioContext
      const oscillator = audioContext.createOscillator()
      rtc.oscillator = oscillator
      oscillator.frequency.value = 440
      const destination = audioContext.createMediaStreamDestination()
      oscillator.connect(destination)
      oscillator.start()
      await audioContext.resume()
      rtc.capture = destination.stream
      rtc.peer.startBroadcast(destination.stream)
    })
    await expect
      .poll(() =>
        guest.evaluate(() => (window as RtcWindow).rtc.state.available),
      )
      .toBe(true)
    await guest.evaluate(() => (window as RtcWindow).rtc.peer.listen())
    await expect
      .poll(
        () => host.evaluate(() => (window as RtcWindow).rtc.state.connected),
        { timeout: 15000 },
      )
      .toBe(true)
    await expect
      .poll(
        () => guest.evaluate(() => (window as RtcWindow).rtc.state.connected),
        { timeout: 15000 },
      )
      .toBe(true)
    await expect
      .poll(() =>
        guest.evaluate(() => {
          const track = (window as RtcWindow).rtc.received?.getAudioTracks()[0]
          return (
            track && {
              kind: track.kind,
              readyState: track.readyState,
              muted: track.muted,
            }
          )
        }),
      )
      .toEqual({ kind: "audio", readyState: "live", muted: false })
    await guest.getByRole("button", { name: "Enable audio" }).click()
    await guest.evaluate(async () => {
      await (window as RtcWindow).rtc.context?.resume()
      await (window as RtcWindow).rtc.playback?.play()
    })
    await expect
      .poll(() =>
        guest.evaluate(() => {
          const analyser = (window as RtcWindow).rtc.analyser
          if (!analyser) return 0
          const samples = new Float32Array(analyser.fftSize)
          analyser.getFloatTimeDomainData(samples)
          return Math.sqrt(
            samples.reduce((sum, sample) => sum + sample * sample, 0) /
              samples.length,
          )
        }),
      )
      .toBeGreaterThan(0.001)

    await host.evaluate(() => (window as RtcWindow).rtc.peer.stopBroadcast())
    await expect
      .poll(() =>
        host.evaluate(
          () =>
            (window as RtcWindow).rtc.capture?.getAudioTracks()[0].readyState,
        ),
      )
      .toBe("ended")
    await expect
      .poll(() =>
        guest.evaluate(() => {
          const rtc = (window as RtcWindow).rtc
          return {
            available: rtc.state.available,
            listening: rtc.state.listening,
            connected: rtc.state.connected,
            hasStream: !!rtc.received,
          }
        }),
      )
      .toEqual({
        available: false,
        listening: false,
        connected: false,
        hasStream: false,
      })
    expect(errors).toEqual([])
  } finally {
    for (const page of [host, guest]) {
      await page
        .evaluate(async () => {
          const rtc = (window as Partial<RtcWindow>).rtc
          rtc?.peer.destroy()
          rtc?.oscillator?.stop()
          await rtc?.context?.close()
        })
        .catch(() => undefined)
    }
  }
})

type CaptureWindow = Window & {
  videoOnlyCapture?: boolean
  capturedStream?: MediaStream
  captureContext?: AudioContext
}

test("the real popup postMessage bridge starts and stops broadcasting and rejects a capture without audio", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      configurable: true,
      value: async () => {
        const capture = window as CaptureWindow
        const canvas = document.createElement("canvas")
        canvas.width = 320
        canvas.height = 200
        canvas.getContext("2d")!.fillRect(0, 0, 320, 200)
        const video = canvas.captureStream(10)
        const tracks = [...video.getVideoTracks()]
        if (!capture.videoOnlyCapture) {
          const audioContext = new AudioContext()
          capture.captureContext = audioContext
          const oscillator = audioContext.createOscillator()
          const destination = audioContext.createMediaStreamDestination()
          oscillator.connect(destination)
          oscillator.start()
          await audioContext.resume()
          tracks.push(...destination.stream.getAudioTracks())
        }
        capture.capturedStream = new MediaStream(tracks)
        return capture.capturedStream
      },
    })
  })
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  await page.goto("/")
  const popupPromise = page.waitForEvent("popup")
  await page
    .getByRole("button", { name: "Share tab audio", exact: true })
    .click()
  const popup = await popupPromise
  popup.on("pageerror", error => errors.push(error.message))
  await popup
    .getByRole("button", { name: "Choose tab and start", exact: true })
    .click()
  await expect(
    page.getByText("Broadcasting from another tab. Library audio is muted.", {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    popup.getByRole("button", { name: "Stop broadcast", exact: true }),
  ).toBeVisible()
  expect(
    await popup.evaluate(
      () =>
        (window as CaptureWindow).capturedStream
          ?.getTracks()
          .map(track => track.kind)
          .sort(),
    ),
  ).toEqual(["audio", "video"])

  await popup
    .getByRole("button", { name: "Stop broadcast", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Share tab audio", exact: true }),
  ).toBeVisible()
  await expect
    .poll(() =>
      popup.evaluate(
        () =>
          (window as CaptureWindow).capturedStream
            ?.getTracks()
            .every(track => track.readyState === "ended"),
      ),
    )
    .toBe(true)
  await popup.evaluate(async () => {
    const capture = window as CaptureWindow
    await capture.captureContext?.close()
    capture.videoOnlyCapture = true
  })
  await popup
    .getByRole("button", { name: "Choose tab and start", exact: true })
    .click()
  await expect(
    popup.getByText(
      "No audio was shared. Select a browser tab and enable Share tab audio.",
      { exact: true },
    ),
  ).toBeVisible()
  await expect
    .poll(() =>
      popup.evaluate(
        () =>
          (window as CaptureWindow).capturedStream
            ?.getTracks()
            .every(track => track.readyState === "ended"),
      ),
    )
    .toBe(true)
  await expect(
    page.getByText("Broadcasting from another tab. Library audio is muted.", {
      exact: true,
    }),
  ).toBeHidden()
  expect(errors).toEqual([])
})
