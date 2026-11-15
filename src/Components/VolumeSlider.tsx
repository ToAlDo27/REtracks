import { Slider } from "@mui/material"

interface Props {
  volume: number
  onVolume: (volume: number) => void
  disabled: boolean
}

export function VolumeSlider(props: Props) {
  const { volume, onVolume, disabled } = props

  return (
    <Slider
      aria-label="Playback volume"
      disabled={disabled}
      value={volume * 100}
      onChange={(_, v) => {
        const volume = (v as number) / 100
        onVolume(volume)
      }}
    />
  )
}
