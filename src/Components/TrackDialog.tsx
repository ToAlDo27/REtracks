import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material"
import { FormEvent, useEffect, useState } from "react"
import {
  addTrackToLibrary,
  mergeLibrary,
  replaceTrackInLibrary,
} from "../library"
import { Track, emptyTrack } from "../track"
import { clipFromUrl, titleFromUrl, tracksFromLines } from "../trackImport"
import { checkTrack, checkUrl, TrackValidation } from "../utils"
import { getYouTubeId } from "../youtubeUrl"

interface Props {
  onClose: () => void
  tagSuggestions: string[]
  track?: Track | null
}

export function TrackDialog({ onClose, tagSuggestions, track }: Props) {
  const [draft, setDraft] = useState<Track>(emptyTrack)
  const [mode, setMode] = useState("single")
  const [lines, setLines] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [startEdited, setStartEdited] = useState(false)
  const [endEdited, setEndEdited] = useState(false)
  const [validation, setValidation] = useState<TrackValidation>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    setDraft(track ?? emptyTrack())
    setStart(track?.start?.toString() ?? "")
    setEnd(track?.end?.toString() ?? "")
    setStartEdited(false)
    setEndEdited(false)
    setMode("single")
    setLines("")
    setValidation(undefined)
    setError(undefined)
  }, [track])

  const readUrl = () => {
    const clip = clipFromUrl(draft.url.trim())
    if (!startEdited && start === "" && clip.start !== undefined)
      setStart(clip.start.toString())
    if (!endEdited && end === "" && clip.end !== undefined)
      setEnd(clip.end.toString())
    if (!draft.title.trim()) {
      setDraft(current => ({ ...current, title: titleFromUrl(current.url) }))
    }
  }

  const save = (event: FormEvent) => {
    event.preventDefault()
    setError(undefined)
    try {
      if (mode === "bulk") {
        const result = tracksFromLines(lines, draft.tags)
        if (result.errors.length > 0) {
          setError(
            result.errors
              .map(item => `Line ${item.line}: ${item.message}`)
              .join("\n"),
          )
          return
        }
        mergeLibrary(result.tracks)
      } else {
        const clip = clipFromUrl(draft.url.trim())
        const result = checkTrack({
          ...draft,
          url: checkUrl(draft.url).fixed,
          title: draft.title.trim() || titleFromUrl(draft.url),
          start: start.trim()
            ? Number(start)
            : startEdited
              ? undefined
              : clip.start,
          end: end.trim() ? Number(end) : endEdited ? undefined : clip.end,
        })
        setValidation(result.validation)
        if (result.validation) return
        if (track) replaceTrackInLibrary(track.url, result.fixed)
        else addTrackToLibrary(result.fixed)
      }
      onClose()
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to save tracks. Please try again.",
      )
    }
  }

  return (
    <Dialog fullWidth open={track !== null} onClose={onClose} maxWidth="sm">
      <DialogTitle>{track ? "Edit Track" : "Add Music"}</DialogTitle>
      <DialogContent>
        <Box id="track-form" component="form" onSubmit={save} noValidate>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {!track && (
              <Tabs
                value={mode}
                onChange={(_, value: string) => {
                  setMode(value)
                  setError(undefined)
                }}
                aria-label="Add music mode"
              >
                <Tab label="One track" value="single" />
                <Tab label="Multiple tracks" value="bulk" />
              </Tabs>
            )}
            <Typography variant="body2" color="text.secondary">
              Add a public audio link (MP3, OGG, WAV and other browser formats)
              or a YouTube video. Links must be accessible to every player.
              Upload local files to a host first; this extension does not store
              audio files.
            </Typography>
            {error && (
              <Alert severity="error" sx={{ whiteSpace: "pre-wrap" }}>
                {error}
              </Alert>
            )}
            {mode === "bulk" ? (
              <TextField
                label="Links, one per line"
                multiline
                minRows={6}
                value={lines}
                onChange={event => setLines(event.target.value)}
                placeholder={
                  "Tavern | https://example.com/tavern.mp3\nhttps://www.youtube.com/watch?v=abcdefghijk"
                }
                helperText="Optional: Title | URL. Blank lines are ignored. Existing links are updated instead of duplicated."
                autoFocus
              />
            ) : (
              <>
                <TextField
                  error={Boolean(validation?.urlValidation)}
                  helperText={
                    validation?.urlValidation ??
                    "Paste a direct audio or YouTube video link. Shared YouTube timestamps fill the clip fields."
                  }
                  autoComplete="off"
                  autoFocus
                  value={draft.url}
                  label="Audio or YouTube URL"
                  onBlur={readUrl}
                  onChange={event => {
                    setDraft({ ...draft, url: event.target.value })
                    setValidation(undefined)
                  }}
                  type="url"
                />
                <TextField
                  error={Boolean(validation?.titleValidation)}
                  helperText={
                    validation?.titleValidation ??
                    "You can rename this track at any time. A filename or video ID is used if left blank."
                  }
                  autoComplete="off"
                  value={draft.title}
                  label="Title"
                  onChange={event =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    fullWidth
                    label="Start (seconds)"
                    type="number"
                    inputProps={{ min: 0, step: "any" }}
                    value={start}
                    error={Boolean(validation?.startValidation)}
                    helperText={
                      validation?.startValidation ??
                      "Optional; starts at 0 by default"
                    }
                    onChange={event => {
                      setStart(event.target.value)
                      setStartEdited(true)
                    }}
                  />
                  <TextField
                    fullWidth
                    label="End (seconds)"
                    type="number"
                    inputProps={{ min: 0, step: "any" }}
                    value={end}
                    error={Boolean(validation?.endValidation)}
                    helperText={
                      validation?.endValidation ??
                      "Optional; loops at the end of this clip"
                    }
                    onChange={event => {
                      setEnd(event.target.value)
                      setEndEdited(true)
                    }}
                  />
                </Stack>
                {getYouTubeId(draft.url) && (
                  <Alert severity="info">
                    YouTube plays in its embedded player. Some videos prohibit
                    embedding, and each player may need to allow playback in
                    their browser.
                  </Alert>
                )}
              </>
            )}
            <Autocomplete
              value={draft.tags}
              multiple
              freeSolo
              onChange={(_, tags) => setDraft({ ...draft, tags })}
              options={tagSuggestions}
              renderTags={(value: readonly string[], getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    variant="outlined"
                    label={option}
                    {...getTagProps({ index })}
                  />
                ))
              }
              renderInput={params => (
                <TextField
                  {...params}
                  label={mode === "bulk" ? "Tags for all tracks" : "Tags"}
                  helperText="Type a tag and press Enter"
                />
              )}
            />
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" form="track-form" variant="contained">
          {track
            ? "Save changes"
            : mode === "bulk"
              ? "Add tracks"
              : "Add track"}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
