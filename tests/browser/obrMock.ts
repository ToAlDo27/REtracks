type Metadata = Record<string, unknown>
type Handler<T> = (value: T) => void
const metadataListeners = new Set<Handler<Metadata>>()
const broadcastListeners = new Map<
  string,
  Set<Handler<{ data: unknown; connectionId: string }>>
>()

const state = {
  metadata: {} as Metadata,
  writes: [] as Metadata[],
  notifications: [] as string[],
}

Object.assign(window, { __obrMock: state })

const noop = async () => undefined
const noSubscription = () => () => undefined
const OBR = {
  isAvailable: true,
  onReady: (callback: () => void) => queueMicrotask(callback),
  room: {
    getMetadata: async () => ({ ...state.metadata }),
    setMetadata: async (patch: Metadata) => {
      state.metadata = { ...state.metadata, ...patch }
      state.writes.push(patch)
      metadataListeners.forEach(callback => callback({ ...state.metadata }))
    },
    onMetadataChange: (callback: Handler<Metadata>) => {
      metadataListeners.add(callback)
      return () => {
        metadataListeners.delete(callback)
      }
    },
  },
  player: {
    getRole: async () => "GM",
    getConnectionId: async () => "browser-test-gm",
    onChange: noSubscription,
  },
  party: { getPlayers: async () => [], onChange: noSubscription },
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
    setHeight: noop,
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
      broadcastListeners
        .get(channel)
        ?.forEach(callback =>
          callback({ data, connectionId: "browser-test-gm" }),
        )
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
