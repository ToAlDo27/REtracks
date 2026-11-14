import { Alert, Button } from "@mui/material"
import { useEffect, useRef, useState } from "react"
import { syncAudio } from "../audioController"
import { useMessage } from "./MessageProvider"
import { TrackProgress } from "./TrackProgress"

interface AudioProps {
  ready: boolean
  volume: number
  mute: boolean
}

export function Audio(props: AudioProps) {
  const { ready, volume, mute } = props
  const currentMessage = useMessage()

  const ref = useRef<HTMLAudioElement>(null)
  const [error, setError] = useState<string>()
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (ref.current) {
      ref.current.volume = volume
    }
  }, [volume])

  useEffect(() => {
    setError(undefined)
    if (!ref.current) return
    return syncAudio(ref.current, currentMessage, ready, failure =>
      setError(failure.message),
    )
  }, [ready, currentMessage, retry])

  useEffect(() => {
    const audio = ref.current
    return () => {
      if (!audio) return
      audio.pause()
      audio.removeAttribute("src")
      audio.load()
    }
  }, [])

  return (
    <>
      <audio
        id="tracks-audio-player"
        ref={ref}
        autoPlay={false}
        preload="metadata"
        controls={false}
        loop={false}
        muted={mute}
      />
      {error && (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setRetry(value => value + 1)}
            >
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      <TrackProgress />
    </>
  )
}
