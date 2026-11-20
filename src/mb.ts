import OBR, { Metadata } from "@owlbear-rodeo/sdk"
import { v4 as uuidv4 } from "uuid"
import { key } from "./key"
import { now } from "./time"
import { Track } from "./track"
import { checkTrack, convertToDirectDownloadable } from "./utils"
import { Action, getClipDuration, getPlaybackPosition } from "./playback"

export { Action } from "./playback"

const path = key("control")
const orderPath = key("control-order")

export interface Message {
  id: string
  selectionId?: string
  time: Date
  action: Action
  offset: number
  duration: number
  track: Track
}

function newPlayMessage(track: Track): Message {
  const id = uuidv4()
  return {
    id,
    selectionId: id,
    time: now(),
    action: Action.Play,
    offset: 0,
    duration: 0,
    track,
  }
}

let currentMessage: Message | undefined = undefined
let pendingWrite: { message: Message | undefined } | undefined
let metadataWrites = Promise.resolve()
let initialized = false
let lastOrder: (PlaybackOrder & { stamped: boolean }) | undefined
let lastIssuedTick = 0
const recentCommands = new Set<string>()
const subscribers = new Set<(message: Message | undefined) => void>()

interface PlaybackOrder {
  id: string
  tick: number
  messageId: string | null
}

function messageToControl() {
  return pendingWrite ? pendingWrite.message : currentMessage
}

function report(error: unknown) {
  console.error(error)
  void OBR.notification.show(
    error instanceof Error ? error.message : "Unable to update playback",
    "ERROR",
  )
}

// Skip superseded commands waiting to be sent. An in-flight write must
// settle before the next write so its response cannot restore an older track.
function publish(message: Message | undefined) {
  const pending = { message }
  pendingWrite = pending
  const write = metadataWrites
    .then(async () => {
      if (pendingWrite !== pending) return
      if (!initialized) applyMetadata(await OBR.room.getMetadata())
      if (pendingWrite !== pending) return
      lastIssuedTick = Math.max(
        now().getTime(),
        lastIssuedTick + 1,
        (lastOrder?.tick ?? 0) + 1,
      )
      const order: PlaybackOrder = {
        id: message?.id ?? uuidv4(),
        tick: lastIssuedTick,
        messageId: message?.id ?? null,
      }
      const patch = { [path]: message, [orderPath]: order }
      await OBR.room.setMetadata(patch)
      // Some clients receive the write acknowledgment before the room event.
      if (pendingWrite === pending) applyMetadata(patch)
    })
    .finally(() => {
      if (pendingWrite === pending) pendingWrite = undefined
    })
  metadataWrites = write.catch(() => undefined)
  return write
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false

  const { id, selectionId, time, action, offset, duration, track } =
    value as Message
  if (
    typeof id !== "string" ||
    !id ||
    (selectionId !== undefined &&
      (typeof selectionId !== "string" || !selectionId)) ||
    !(
      typeof time === "string" ||
      typeof time === "number" ||
      time instanceof Date
    ) ||
    !Number.isFinite(new Date(time).getTime()) ||
    (action !== Action.Play && action !== Action.Pause) ||
    typeof offset !== "number" ||
    !Number.isFinite(offset) ||
    offset < 0 ||
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration < 0 ||
    !track ||
    typeof track !== "object" ||
    typeof track.title !== "string" ||
    typeof track.url !== "string" ||
    !Array.isArray(track.tags) ||
    !track.tags.every(tag => typeof tag === "string") ||
    (track.start !== undefined &&
      (typeof track.start !== "number" || !Number.isFinite(track.start))) ||
    (track.end !== undefined &&
      (typeof track.end !== "number" || !Number.isFinite(track.end)))
  )
    return false
  return !checkTrack(track).validation
}

function readOrder(value: unknown): PlaybackOrder | undefined {
  if (!value || typeof value !== "object") return
  const order = value as PlaybackOrder
  if (
    typeof order.id === "string" &&
    order.id &&
    Number.isSafeInteger(order.tick) &&
    order.tick > 0 &&
    (order.messageId === null || order.messageId === order.id)
  ) {
    return order
  }
}

function deliver(message: Message | undefined) {
  if (initialized && currentMessage?.id === message?.id) return
  initialized = true
  currentMessage = message
  for (const callback of subscribers) callback(currentMessage)
}

function applyMetadata(metadata: Metadata, allowLegacyClear = true) {
  const value = metadata[path]
  let message = isMessage(value) ? value : undefined
  const storedOrder = readOrder(metadata[orderPath])
  // The order belongs to one specific write. Older versions may change
  // the playback key while leaving the last ordered write in metadata.
  const matchedOrder =
    storedOrder?.messageId === (message?.id ?? null) ? storedOrder : undefined

  const receivedAt = now()
  if (message && new Date(message.time).getTime() > receivedAt.getTime()) {
    message = { ...message, time: receivedAt }
  }
  const order =
    matchedOrder ??
    (message && {
      id: message.id,
      tick: new Date(message.time).getTime(),
      messageId: message.id,
    })
  if (!order) {
    // A legacy Stop can clear the playback key and leave its order in place.
    // A snapshot from before the ordered write must not clear newer playback.
    if (!initialized) deliver(undefined)
    else if (
      allowLegacyClear &&
      value === undefined &&
      (!lastOrder?.stamped || storedOrder?.id === lastOrder.id)
    ) {
      deliver(undefined)
    }
    return
  }

  if (recentCommands.has(order.id)) return
  if (
    lastOrder &&
    (order.tick < lastOrder.tick ||
      (order.tick === lastOrder.tick && order.id <= lastOrder.id))
  )
    return

  lastOrder = { ...order, stamped: !!matchedOrder }
  recentCommands.add(order.id)
  if (recentCommands.size > 100) {
    recentCommands.delete(recentCommands.values().next().value!)
  }
  deliver(message)
}

export function onMessage(
  callback: (message: Message | undefined) => void,
): () => void {
  let active = true
  let receivedChange = false
  subscribers.add(callback)
  if (initialized) callback(currentMessage)

  const unsubscribe = OBR.room.onMetadataChange(metadata => {
    if (!active) return
    receivedChange = true
    applyMetadata(metadata)
  })
  void OBR.room
    .getMetadata()
    .then(metadata => {
      if (active) applyMetadata(metadata, !receivedChange)
    })
    .catch(report)
  return () => {
    active = false
    subscribers.delete(callback)
    unsubscribe()
  }
}

export async function play(track: Track): Promise<void> {
  // validate the track
  const { fixed, validation } = checkTrack(track)
  if (validation) {
    throw new Error(Object.values(validation).filter(Boolean).join(" / "))
  }

  // convert url into direct downloadable if applicable
  fixed.url = convertToDirectDownloadable(fixed.url)
  // Set the room's selection before the new media loads. Each player reads
  // its own media duration and the old source can stop even for broken links.
  await publish(newPlayMessage(fixed))
}

export function pause() {
  const message = messageToControl()
  if (!message) return
  void publish({
    ...message,
    id: uuidv4(),
    time: now(),
    action: Action.Pause,
    offset: getPlaybackPosition(message),
  }).catch(report)
}

export function resume() {
  const message = messageToControl()
  if (!message) return
  void publish({
    ...message,
    id: uuidv4(),
    time: now(),
    action: Action.Play,
  }).catch(report)
}

export function stop() {
  void publish(undefined).catch(report)
}

/** Seek within the selected clip and broadcast the new position to the room. */
export function seek(
  seconds: number,
  observed?: { id: string; duration: number },
) {
  const current = messageToControl()
  if (!current || !Number.isFinite(seconds)) return
  if (observed && current.id !== observed.id) return
  const sourceDuration = observed?.duration || current.duration
  const duration = getClipDuration(current.track, sourceDuration)
  const offset = Math.max(
    0,
    duration > 0 ? Math.min(seconds, Math.max(0, duration - 0.01)) : seconds,
  )
  const message = { ...current, id: uuidv4(), time: now(), offset }
  void publish(message).catch(report)
}
