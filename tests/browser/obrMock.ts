type Metadata = Record<string, unknown>
type Handler<T> = (value: T) => void
type Broadcast = { data: unknown; connectionId: string }
type MockWindow = Window & {
  __obrGetMetadata?: () => Promise<Metadata>
  __obrSetMetadata?: (patch: Metadata) => Promise<void>
  __obrBroadcast?: (channel: string, data: unknown) => Promise<void>
  __obrGetPlayers?: () => Promise<{ role: string; connectionId: string }[]>
}
const transport = window as MockWindow
const parameters = new URLSearchParams(location.search)
const role = parameters.get("role") === "PLAYER" ? "PLAYER" : "GM"
const connectionId = parameters.get("client") ?? "browser-test-gm"
const metadataListeners = new Set<Handler<Metadata>>()
const broadcastListeners = new Map<string, Set<Handler<Broadcast>>>()

const state = {
  metadata: {} as Metadata,
  writes: [] as Metadata[],
  notifications: [] as string[],
  actionHeight: 0,
  receiveMetadata: (metadata: Metadata) => {
    state.metadata = { ...metadata }
    metadataListeners.forEach(callback => callback({ ...state.metadata }))
  },
  receiveBroadcast: (channel: string, message: Broadcast) => {
    broadcastListeners.get(channel)?.forEach(callback => callback(message))
  },
}

Object.assign(window, { __obrMock: state })

const noop = async () => undefined
const noSubscription = () => () => undefined
const OBR = {
  isAvailable: parameters.get("embedded") !== "0",
  onReady: (callback: () => void) => queueMicrotask(callback),
  room: {
    getMetadata: async () => {
      if (transport.__obrGetMetadata)
        state.metadata = await transport.__obrGetMetadata()
      return { ...state.metadata }
    },
    setMetadata: async (patch: Metadata) => {
      state.writes.push(patch)
      if (transport.__obrSetMetadata) await transport.__obrSetMetadata(patch)
      else state.receiveMetadata({ ...state.metadata, ...patch })
    },
    onMetadataChange: (callback: Handler<Metadata>) => {
      metadataListeners.add(callback)
      return () => {
        metadataListeners.delete(callback)
      }
    },
  },
  player: {
    getRole: async () => role,
    getConnectionId: async () => connectionId,
    onChange: noSubscription,
  },
  party: {
    getPlayers: async () =>
      transport.__obrGetPlayers ? transport.__obrGetPlayers() : [],
    onChange: noSubscription,
  },
  theme: {
    getTheme: async () => ({
      mode: "DARK",
      primary: { main: "#90caf9" },
      secondary: { main: "#ce93d8" },
      text: { primary: "#ffffff", secondary: "#b3b3b3" },
      background: { paper: "#242424", default: "#151515" },
    }),
    onChange: noSubscription,
  },
  action: {
    setHeight: async (height: number) => {
      state.actionHeight = height
    },
    setBadgeText: noop,
    setBadgeBackgroundColor: noop,
  },
  notification: {
    show: async (message: string) => {
      state.notifications.push(message)
    },
  },
  broadcast: {
    sendMessage: async (channel: string, data: unknown) => {
      if (transport.__obrBroadcast)
        await transport.__obrBroadcast(channel, data)
      else state.receiveBroadcast(channel, { data, connectionId })
    },
    onMessage: (
      channel: string,
      callback: Handler<{ data: unknown; connectionId: string }>,
    ) => {
      let listeners = broadcastListeners.get(channel)
      if (!listeners) {
        listeners = new Set()
        broadcastListeners.set(channel, listeners)
      }
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    },
  },
}

export default OBR
