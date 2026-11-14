// Audio is sent over WebRTC. The room transport carries only connection signals.
export interface TabSignal {
  kind:
    | "discover"
    | "announce"
    | "join"
    | "offer"
    | "answer"
    | "ice"
    | "leave"
    | "stop"
  from: string
  to?: string
  session?: string
  description?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

/** The popup and embedded extension may have different storage partitions. */
export function isTrustedTabBridgeMessage(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  origin: string,
  source: MessageEventSource | null,
  token: string | undefined,
): boolean {
  return (
    !!source &&
    !!token &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      token,
    ) &&
    event.origin === origin &&
    event.source === source &&
    !!event.data &&
    typeof event.data === "object" &&
    event.data.token === token &&
    ["signal", "ping", "pong"].includes(event.data.type)
  )
}

export function isTabSignal(value: unknown): value is TabSignal {
  if (!value || typeof value !== "object") return false
  const v = value as TabSignal
  return (
    [
      "discover",
      "announce",
      "join",
      "offer",
      "answer",
      "ice",
      "leave",
      "stop",
    ].includes(v.kind) &&
    typeof v.from === "string" &&
    v.from.length > 0 &&
    v.from.length < 100 &&
    (v.to === undefined ||
      (typeof v.to === "string" && v.to.length > 0 && v.to.length < 100)) &&
    (v.session === undefined ||
      (typeof v.session === "string" &&
        v.session.length > 0 &&
        v.session.length < 100)) &&
    (v.description === undefined ||
      (v.description !== null &&
        typeof v.description === "object" &&
        ["offer", "answer"].includes(v.description.type) &&
        typeof v.description.sdp === "string" &&
        v.description.sdp.length <= 100000)) &&
    (v.candidate === undefined ||
      (v.candidate !== null &&
        typeof v.candidate === "object" &&
        typeof v.candidate.candidate === "string" &&
        v.candidate.candidate.length <= 16000))
  )
}

interface Connection {
  pc: RTCPeerConnection
  candidates: RTCIceCandidateInit[]
  timer: ReturnType<typeof setTimeout>
}

export interface TabAudioState {
  available: boolean
  listening: boolean
  connected: boolean
  error?: string
}

export class TabAudioPeer {
  readonly id = crypto.randomUUID()
  private session?: string
  private host?: string
  private stream?: MediaStream
  private connections = new Map<string, Connection>()
  private earlyCandidates = new Map<string, RTCIceCandidateInit[]>()
  private heartbeat?: ReturnType<typeof setInterval>
  private hostSeen = 0
  private listening = false
  private disposed = false
  private state: TabAudioState = {
    available: false,
    listening: false,
    connected: false,
  }

  constructor(
    private sendSignal: (signal: TabSignal) => Promise<void>,
    private onState: (state: TabAudioState) => void,
    private onStream: (stream: MediaStream | undefined) => void,
  ) {
    this.heartbeat = setInterval(() => {
      if (this.stream) this.send({ kind: "announce", session: this.session })
      else if (this.host && Date.now() - this.hostSeen > 15000)
        this.resetReceiver()
    }, 4000)
  }

  private update(change: Partial<TabAudioState>) {
    if (this.disposed) return
    this.state = { ...this.state, ...change }
    this.onState(this.state)
  }

  private send(signal: Omit<TabSignal, "from">) {
    if (this.disposed) return
    void this.sendSignal({ ...signal, from: this.id }).catch(() => {
      this.update({
        error: "Could not send the audio connection signal. Try reconnecting.",
      })
    })
  }

  discover() {
    this.send({ kind: "discover" })
  }

  startBroadcast(stream: MediaStream) {
    if (this.disposed) {
      stream.getTracks().forEach(track => track.stop())
      return
    }
    this.stopBroadcast()
    this.stream = stream
    this.session = crypto.randomUUID()
    this.send({ kind: "announce", session: this.session })
  }

  stopBroadcast() {
    const broadcasting = !!this.stream
    if (this.stream) {
      this.send({ kind: "stop", session: this.session })
      this.stream.getTracks().forEach(track => track.stop())
    }
    this.stream = undefined
    if (broadcasting) this.session = undefined
    this.closeConnections()
  }

  listen() {
    if (this.disposed || this.stream) return
    this.listening = true
    this.update({ listening: true, error: undefined })
    if (this.host)
      this.send({ kind: "join", to: this.host, session: this.session })
    else this.discover()
  }

  disconnect() {
    if (this.host)
      this.send({ kind: "leave", to: this.host, session: this.session })
    this.listening = false
    this.closeConnections()
    this.onStream(undefined)
    this.update({ listening: false, connected: false, error: undefined })
  }

  private closeConnections() {
    for (const remote of this.connections.keys()) this.closeConnection(remote)
    this.earlyCandidates.clear()
  }

  private closeConnection(remote: string) {
    const connection = this.connections.get(remote)
    if (!connection) return
    clearTimeout(connection.timer)
    connection.pc.onicecandidate = null
    connection.pc.ontrack = null
    connection.pc.onconnectionstatechange = null
    this.connections.delete(remote)
    connection.pc.close()
  }

  private isCurrent(
    remote: string,
    pc: RTCPeerConnection,
    session: string | undefined,
  ) {
    return (
      !this.disposed &&
      this.session === session &&
      this.connections.get(remote)?.pc === pc
    )
  }

  private resetReceiver() {
    this.closeConnections()
    this.host = undefined
    this.session = undefined
    this.listening = false
    this.onStream(undefined)
    this.update({ available: false, listening: false, connected: false })
  }

  private connection(remote: string): Connection {
    this.closeConnection(remote)
    const session = this.session
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    })
    const connection: Connection = {
      pc,
      candidates: this.earlyCandidates.get(remote) ?? [],
      timer: setTimeout(() => {
        if (
          pc.connectionState !== "connected" &&
          this.connections.get(remote)?.pc === pc
        ) {
          this.closeConnection(remote)
          this.update({
            connected: false,
            error:
              "Audio connection timed out. Reconnect; some networks need a TURN relay.",
          })
        }
      }, 20000),
    }
    this.connections.set(remote, connection)
    this.earlyCandidates.delete(remote)
    pc.onicecandidate = event => {
      if (event.candidate && this.isCurrent(remote, pc, session))
        this.send({
          kind: "ice",
          to: remote,
          session,
          candidate: event.candidate.toJSON(),
        })
    }
    pc.ontrack = event => {
      if (
        !this.disposed &&
        this.connections.get(remote)?.pc === pc &&
        this.listening
      ) {
        this.onStream(new MediaStream([event.track]))
      }
    }
    pc.onconnectionstatechange = () => {
      if (this.connections.get(remote)?.pc !== pc) return
      if (pc.connectionState === "connected") {
        clearTimeout(connection.timer)
        this.update({ connected: true, error: undefined })
      } else if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        this.update({
          connected: false,
          error: "Audio connection interrupted. Click Reconnect.",
        })
      }
    }
    return connection
  }

  async receive(signal: TabSignal) {
    if (
      this.disposed ||
      signal.from === this.id ||
      (signal.to && signal.to !== this.id)
    )
      return
    let negotiating: RTCPeerConnection | undefined
    const receivedSession = signal.session
    try {
      if (signal.kind === "discover") {
        if (this.stream) this.send({ kind: "announce", session: this.session })
        return
      }
      if (signal.kind === "announce" && signal.session && !this.stream) {
        // Keep one active host until stopped/expired, rather than switching on every heartbeat.
        if (this.host && this.host !== signal.from) return
        const changed = this.session !== signal.session
        if (changed) this.closeConnections()
        this.host = signal.from
        this.session = signal.session
        this.hostSeen = Date.now()
        this.update({ available: true })
        if (this.listening && changed)
          this.send({ kind: "join", to: this.host, session: this.session })
        return
      }
      if (!signal.session || signal.session !== this.session) return
      if (signal.kind === "stop" && signal.from === this.host) {
        this.resetReceiver()
        return
      }
      if (signal.kind === "join" && this.stream) {
        const { pc } = this.connection(signal.from)
        negotiating = pc
        this.stream
          .getAudioTracks()
          .forEach(track => pc.addTrack(track, this.stream!))
        const offer = await pc.createOffer()
        if (!this.isCurrent(signal.from, pc, receivedSession)) return
        await pc.setLocalDescription(offer)
        if (!this.isCurrent(signal.from, pc, receivedSession)) return
        this.send({
          kind: "offer",
          to: signal.from,
          session: receivedSession,
          description: offer,
        })
      } else if (
        signal.kind === "offer" &&
        this.listening &&
        signal.from === this.host &&
        signal.description?.type === "offer"
      ) {
        const { pc, candidates } = this.connection(signal.from)
        negotiating = pc
        await pc.setRemoteDescription(signal.description)
        if (!this.isCurrent(signal.from, pc, receivedSession)) return
        for (const candidate of candidates.splice(0)) {
          await pc.addIceCandidate(candidate)
          if (!this.isCurrent(signal.from, pc, receivedSession)) return
        }
        const answer = await pc.createAnswer()
        if (!this.isCurrent(signal.from, pc, receivedSession)) return
        await pc.setLocalDescription(answer)
        if (!this.isCurrent(signal.from, pc, receivedSession)) return
        this.send({
          kind: "answer",
          to: signal.from,
          session: receivedSession,
          description: answer,
        })
      } else if (
        signal.kind === "answer" &&
        this.stream &&
        signal.description?.type === "answer"
      ) {
        const connection = this.connections.get(signal.from)
        if (!connection || connection.pc.signalingState !== "have-local-offer")
          return
        negotiating = connection.pc
        await connection.pc.setRemoteDescription(signal.description)
        if (!this.isCurrent(signal.from, connection.pc, receivedSession)) return
        for (const candidate of connection.candidates.splice(0)) {
          await connection.pc.addIceCandidate(candidate)
          if (!this.isCurrent(signal.from, connection.pc, receivedSession))
            return
        }
      } else if (signal.kind === "ice" && signal.candidate) {
        const connection = this.connections.get(signal.from)
        if (!connection) {
          // ICE may arrive before the offer over the room transport.
          if (!this.listening || signal.from !== this.host) return
          const pending = this.earlyCandidates.get(signal.from) ?? []
          if (pending.length < 100) pending.push(signal.candidate)
          this.earlyCandidates.set(signal.from, pending)
          return
        }
        negotiating = connection.pc
        if (connection.pc.remoteDescription)
          await connection.pc.addIceCandidate(signal.candidate)
        else if (connection.candidates.length < 100)
          connection.candidates.push(signal.candidate)
      } else if (signal.kind === "leave" && this.stream) {
        this.closeConnection(signal.from)
      }
    } catch {
      if (
        !this.disposed &&
        (!negotiating ||
          this.isCurrent(signal.from, negotiating, receivedSession))
      ) {
        this.update({
          error: "Could not establish the audio connection. Click Reconnect.",
        })
      }
    }
  }

  destroy() {
    if (this.disposed) return
    this.disconnect()
    this.stopBroadcast()
    this.disposed = true
    clearInterval(this.heartbeat)
  }
}
