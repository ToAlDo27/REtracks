// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("@owlbear-rodeo/sdk", () => ({
  default: { onReady: (callback: () => void) => callback() },
}))
import { setSkew } from "../src/time"
afterEach(() => vi.unstubAllGlobals())
describe("startup clock check", () => {
  it("mounts when the server has no Date header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ headers: new Headers() }),
    )
    await new Promise<void>(resolve => setSkew(resolve))
    expect(fetch).toHaveBeenCalledOnce()
  })
  it("mounts when the time request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined)
    const mounted = vi.fn()
    await new Promise<void>(resolve =>
      setSkew(() => {
        mounted()
        resolve()
      }),
    )
    expect(mounted).toHaveBeenCalledOnce()
    warning.mockRestore()
  })
})
