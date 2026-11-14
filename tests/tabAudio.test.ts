// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  TabAudioPeer,
  TabSignal,
  isTabSignal,
  isTrustedTabBridgeMessage,
} from "../src/tabAudio"

class FakeConnection {
  static instances: FakeConnection[] = []
  static pendingLocal?: Promise<void>
  connectionState = "new"
  signalingState = "stable"
  remoteDescription: RTCSessionDescriptionInit | null = null
  onicecandidate = null
  ontrack = null
  onconnectionstatechange = null
  close = vi.fn()
  addTrack = vi.fn()
  addIceCandidate = vi.fn(async () => undefined)
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "offer" }))
  createAnswer = vi.fn(async () => ({ type: "answer", sdp: "answer" }))
  setLocalDescription = vi.fn(
    () => FakeConnection.pendingLocal ?? Promise.resolve(),
  )
  setRemoteDescription = vi.fn(async (value: RTCSessionDescriptionInit) => {
    this.remoteDescription = value
  })
  constructor() {
    FakeConnection.instances.push(this)
  }
}

describe("tab audio lifecycle", () => {
  const peers: TabAudioPeer[] = []
  function makePeer() {
    const sent: TabSignal[] = []
    const state = vi.fn()
    const stream = vi.fn()
    const peer = new TabAudioPeer(
      async signal => {
        sent.push(signal)
      },
      state,
      stream,
    )
    peers.push(peer)
    return { peer, sent, state, stream }
  }
  beforeEach(() => {
    vi.useFakeTimers()
    FakeConnection.instances = []
    FakeConnection.pendingLocal = undefined
    vi.stubGlobal("RTCPeerConnection", FakeConnection)
  })
  afterEach(() => {
    peers.forEach(p => p.destroy())
    peers.length = 0
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("queues early ICE until the host offer arrives", async () => {
    const { peer, sent } = makePeer()
    await peer.receive({ kind: "announce", from: "host", session: "session" })
    peer.listen()
    expect(sent.at(-1)?.kind).toBe("join")
    const candidate = { candidate: "early-candidate" }
    await peer.receive({
      kind: "ice",
      from: "host",
      session: "session",
      to: peer.id,
      candidate,
    })
    await peer.receive({
      kind: "offer",
      from: "host",
      session: "session",
      to: peer.id,
      description: { type: "offer", sdp: "offer" },
    })
    expect(FakeConnection.instances[0].addIceCandidate).toHaveBeenCalledWith(
      candidate,
    )
    expect(sent.at(-1)?.kind).toBe("answer")
  })

  it("ignores signals from another host and another session", async () => {
    const { peer } = makePeer()
    await peer.receive({ kind: "announce", from: "host", session: "session" })
    peer.listen()
    await peer.receive({
      kind: "offer",
      from: "other",
      session: "session",
      description: { type: "offer" },
    })
    await peer.receive({
      kind: "offer",
      from: "host",
      session: "old-session",
      description: { type: "offer" },
    })
    expect(FakeConnection.instances).toHaveLength(0)
  })

  it("clears receiver state when a host stops or disappears", async () => {
    const { peer, state, stream } = makePeer()
    await peer.receive({ kind: "announce", from: "host", session: "session" })
    peer.listen()
    await peer.receive({ kind: "stop", from: "host", session: "session" })
    expect(state).toHaveBeenLastCalledWith(
      expect.objectContaining({
        available: false,
        listening: false,
        connected: false,
      }),
    )
    expect(stream).toHaveBeenLastCalledWith(undefined)
    await peer.receive({ kind: "announce", from: "host", session: "next" })
    peer.listen()
    vi.advanceTimersByTime(16000)
    expect(state).toHaveBeenLastCalledWith(
      expect.objectContaining({ available: false, listening: false }),
    )
  })

  it("broadcasts audio tracks only and releases capture and connections on stop", async () => {
    const { peer, sent } = makePeer()
    const audioTrack = { kind: "audio", stop: vi.fn() }
    const videoTrack = { kind: "video", stop: vi.fn() }
    const stream = {
      getAudioTracks: () => [audioTrack],
      getTracks: () => [audioTrack, videoTrack],
    } as unknown as MediaStream
    peer.startBroadcast(stream)
    const session = sent.at(-1)?.session
    await peer.receive({ kind: "join", from: "listener", to: peer.id, session })
    expect(FakeConnection.instances[0].addTrack).toHaveBeenCalledTimes(1)
    expect(FakeConnection.instances[0].addTrack).toHaveBeenCalledWith(
      audioTrack,
      stream,
    )
    peer.stopBroadcast()
    expect(audioTrack.stop).toHaveBeenCalledOnce()
    expect(videoTrack.stop).toHaveBeenCalledOnce()
    expect(FakeConnection.instances[0].close).toHaveBeenCalledOnce()
    expect(sent.at(-1)?.kind).toBe("stop")
  })

  it("rejects malformed signals", () => {
    for (const value of [
      null,
      undefined,
      {},
      { kind: "offer", from: 1 },
      { kind: "bad", from: "a" },
      { kind: "offer", from: "" },
      { kind: "ice", from: "host", candidate: null },
      { kind: "offer", from: "host", description: { type: "offer", sdp: 42 } },
      { kind: "announce", from: "host", session: "x".repeat(1000) },
    ])
      expect(isTabSignal(value)).toBe(false)
  })

  it("does not send an offer after broadcasting stops during setLocalDescription", async () => {
    const { peer, sent } = makePeer()
    let resolve!: () => void
    FakeConnection.pendingLocal = new Promise<void>(done => {
      resolve = done
    })
    const stream = {
      getAudioTracks: () => [],
      getTracks: () => [],
    } as unknown as MediaStream
    peer.startBroadcast(stream)
    const session = sent.at(-1)?.session
    const negotiating = peer.receive({
      kind: "join",
      from: "listener",
      session,
    })
    await vi.waitFor(() =>
      expect(
        FakeConnection.instances[0].setLocalDescription,
      ).toHaveBeenCalled(),
    )
    peer.stopBroadcast()
    resolve()
    await negotiating
    expect(sent.some(signal => signal.kind === "offer")).toBe(false)
    expect(sent.at(-1)?.kind).toBe("stop")
  })

  it("does not answer after disconnecting during setLocalDescription", async () => {
    const { peer, sent, state } = makePeer()
    let resolve!: () => void
    FakeConnection.pendingLocal = new Promise<void>(done => {
      resolve = done
    })
    await peer.receive({ kind: "announce", from: "host", session: "session" })
    peer.listen()
    const negotiating = peer.receive({
      kind: "offer",
      from: "host",
      session: "session",
      description: { type: "offer", sdp: "offer" },
    })
    await vi.waitFor(() =>
      expect(
        FakeConnection.instances[0].setLocalDescription,
      ).toHaveBeenCalled(),
    )
    peer.disconnect()
    resolve()
    await negotiating
    expect(sent.some(signal => signal.kind === "answer")).toBe(false)
    expect(state).toHaveBeenLastCalledWith(
      expect.objectContaining({ listening: false, error: undefined }),
    )
  })

  it("releases capture received after its owner was disposed", () => {
    const { peer, sent } = makePeer()
    peer.destroy()
    const track = { stop: vi.fn() }
    peer.startBroadcast({ getTracks: () => [track] } as unknown as MediaStream)
    expect(track.stop).toHaveBeenCalledOnce()
    expect(sent).toHaveLength(0)
  })

  it("accepts popup relay messages only from the exact origin, window and secret token", () => {
    const source = {} as Window
    const token = "11111111-1111-1111-1111-111111111111"
    const event = {
      origin: "https://tracks.example",
      source,
      data: { type: "ping", token },
    }
    expect(isTrustedTabBridgeMessage(event, event.origin, source, token)).toBe(
      true,
    )
    expect(
      isTrustedTabBridgeMessage(
        { ...event, origin: "https://other.example" },
        event.origin,
        source,
        token,
      ),
    ).toBe(false)
    expect(
      isTrustedTabBridgeMessage(
        { ...event, source: {} as Window },
        event.origin,
        source,
        token,
      ),
    ).toBe(false)
    expect(
      isTrustedTabBridgeMessage(
        { ...event, data: { ...event.data, token: "wrong" } },
        event.origin,
        source,
        token,
      ),
    ).toBe(false)
    expect(isTrustedTabBridgeMessage(event, event.origin, null, token)).toBe(
      false,
    )
  })
})
