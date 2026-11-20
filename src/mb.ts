import OBR, { Metadata } from "@owlbear-rodeo/sdk"
import { v4 as uuidv4 } from "uuid"
import { key } from "./key"
import { now } from "./time"
import { Track } from "./track"
import { checkTrack, convertToDirectDownloadable } from "./utils"
import { Action, getClipDuration, getPlaybackPosition } from "./playback"

export { Action } from "./playback"

const path = key("control")

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
      const previous = currentMessage
      await OBR.room.setMetadata({ [path]: message })
      // The subscription may already have delivered this write or a newer one.
      if (currentMessage === previous) currentMessage = message
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

function extractMessage(metadata: Metadata): Message | undefined {
  const data = metadata[path]
  if (isMessage(data)) {
    return data
  }
  return undefined
}

export function onMessage(
  callback: (message: Message | undefined) => void,
): () => void {
  let active = true
  let initialized = false
  let lastId: string | undefined
  let receivedChange = false
  const handler = (m: Metadata) => {
    if (!active) return
    let message = extractMessage(m)
    if (!initialized || message?.id !== lastId) {
      initialized = true
      lastId = message?.id
      // A future message means means there is a massive clock skew issue,
      // so don't allow it. Instead, set the message time to now.
      const n = now()
      if (message && new Date(message.time).getTime() > n.getTime()) {
        console.warn(
          `message came from the future\nmessage time: ${message.time}\nnow: ${n}\nsetting message time to now`,
        )
        message = { ...message, time: n }
      }

      currentMessage = message
      callback(currentMessage)
    }
  }

  const unsubscribe = OBR.room.onMetadataChange(metadata => {
    receivedChange = true
    handler(metadata)
  })
  void OBR.room
    .getMetadata()
    .then(metadata => {
      if (!receivedChange) handler(metadata)
    })
    .catch(report)
  return () => {
    active = false
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
