import OBR, { Metadata } from "@owlbear-rodeo/sdk"
import { v4 as uuidv4 } from "uuid"
import { getAudioDuration } from "./audioMetadata"
import { key } from "./key"
import { now } from "./time"
import { Track } from "./track"
import { checkTrack, convertToDirectDownloadable } from "./utils"
import {
  Action,
  getClipBounds,
  getClipDuration,
  getPlaybackPosition,
} from "./playback"
import { getYouTubeId } from "./youtubeUrl"

export { Action } from "./playback"

const path = key("control")

export interface Message {
  id: string
  time: Date
  action: Action
  offset: number
  duration: number
  track: Track
}

function newPlayMessage(track: Track, duration: number): Message {
  return {
    id: uuidv4(),
    time: now(),
    action: Action.Play,
    offset: 0,
    duration: duration,
    track: track,
  }
}

function pauseCurrentMessage(): Message {
  if (!currentMessage) {
    throw new Error("Unable to pause before receiving first message")
  }

  const m = newPlayMessage(currentMessage.track, currentMessage.duration)
  m.action = Action.Pause
  m.offset = getPlaybackPosition(currentMessage)
  return m
}

function resumeCurrentMessage(): Message {
  if (!currentMessage) {
    throw new Error("Unable to resume before receiving first message")
  }

  const m = newPlayMessage(currentMessage.track, currentMessage.duration)
  m.action = Action.Play
  m.offset = currentMessage.offset
  return m
}

// message cache
let currentMessage: Message | undefined = undefined
let requestId = 0
let pendingProbe: AbortController | undefined
let metadataWrites = Promise.resolve()

function cancelPending() {
  requestId += 1
  pendingProbe?.abort()
  pendingProbe = undefined
  return requestId
}

function report(error: unknown) {
  console.error(error)
  void OBR.notification.show(
    error instanceof Error ? error.message : "Unable to update playback",
    "ERROR",
  )
}

// Serial writes prevent an earlier in-flight room update from overtaking a newer one.
function publish(message: Message | undefined, request: number) {
  const write = metadataWrites.then(async () => {
    if (request !== requestId) return
    const previous = currentMessage
    currentMessage = message
    try {
      await OBR.room.setMetadata({ [path]: message })
    } catch (error) {
      if (request === requestId) currentMessage = previous
      throw error
    }
  })
  metadataWrites = write.catch(() => undefined)
  return write
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false

  const { id, time, action, offset, duration, track } = value as Message
  if (
    typeof id !== "string" ||
    !id ||
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
  const request = cancelPending()

  // validate the track
  const { fixed, validation } = checkTrack(track)
  if (validation) {
    throw new Error(Object.values(validation).filter(Boolean).join(" / "))
  }

  // convert url into direct downloadable if applicable
  fixed.url = convertToDirectDownloadable(fixed.url)

  if (getYouTubeId(fixed.url)) {
    await publish(newPlayMessage(fixed, 0), request)
    return
  }

  const controller = new AbortController()
  pendingProbe = controller
  try {
    const duration = await getAudioDuration(fixed.url, controller.signal)
    if (request !== requestId) return
    const bounds = getClipBounds(fixed, duration)
    if (duration > 0 && bounds.duration <= 0) {
      throw new Error(
        "The clip starts after the end of this audio. Edit its start time.",
      )
    }
    await publish(newPlayMessage(fixed, duration), request)
  } catch (error) {
    if (controller.signal.aborted) return
    throw error
  } finally {
    if (pendingProbe === controller) pendingProbe = undefined
  }
}

export function pause() {
  const request = cancelPending()
  if (currentMessage) void publish(pauseCurrentMessage(), request).catch(report)
}

export function resume() {
  const request = cancelPending()
  if (currentMessage)
    void publish(resumeCurrentMessage(), request).catch(report)
}

export function stop() {
  const request = cancelPending()
  void publish(undefined, request).catch(report)
}

/** Seek within the selected clip and broadcast the new position to the room. */
export function seek(seconds: number) {
  if (!currentMessage || !Number.isFinite(seconds)) return
  const request = cancelPending()
  const duration = getClipDuration(
    currentMessage.track,
    currentMessage.duration,
  )
  const offset = Math.max(
    0,
    duration > 0 ? Math.min(seconds, Math.max(0, duration - 0.01)) : seconds,
  )
  const message = { ...currentMessage, id: uuidv4(), time: now(), offset }
  void publish(message, request).catch(report)
}
