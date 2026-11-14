import {
  Card,
  CardActionArea,
  CardActions,
  CardContent,
  CardHeader,
  Chip,
  ListItem,
  Menu,
  MenuItem,
  Alert,
  Button,
  Typography,
} from "@mui/material"
import Fuse from "fuse.js"
import { useState } from "react"
import { Virtuoso } from "react-virtuoso"
import { ConfirmPayload } from "./Confirm"
import { deleteTrackFromLibrary } from "../library"
import { play } from "../mb"
import { Track } from "../track"
import { getYouTubeId } from "../youtubeUrl"

interface TrackCardProps {
  track: Track
  editTrack: (track: Track) => void
  confirm: (payload: ConfirmPayload) => void
  matches?: ReadonlyArray<Fuse.FuseResultMatch>
}

function TrackCard(props: TrackCardProps) {
  const { track, editTrack, confirm, matches } = props
  const [error, setError] = useState<string>()
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number
    mouseY: number
  } | null>(null)

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    setContextMenu(
      contextMenu === null
        ? {
            mouseX: event.clientX + 2,
            mouseY: event.clientY - 6,
          }
        : // repeated contextmenu when it is already open closes it with Chrome 84 on Ubuntu
          // Other native context menus might behave different.
          // With this behavior we prevent contextmenu from the backdrop to re-locale existing context menus.
          null,
    )
  }

  const handleClose = () => {
    setContextMenu(null)
  }

  const remove = () => {
    handleClose()
    confirm({
      message: `This will delete ${track.title} from your library`,
      action: () => {
        try {
          deleteTrackFromLibrary(track)
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to delete this track",
          )
        }
      },
    })
  }

  const start = async () => {
    setError(undefined)
    try {
      await play(track)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to play this track",
      )
    }
  }

  const chips = track.tags.map((t, i) => (
    <Chip
      key={i}
      variant="outlined"
      label={t}
      color={
        matches?.find(m => m.key === "tags" && m.refIndex === i)
          ? "secondary"
          : undefined
      }
    />
  ))

  return (
    <Card sx={{ minWidth: "100%" }} onContextMenu={handleContextMenu}>
      <CardActionArea
        disableRipple={false}
        onClick={start}
        aria-label={`Play ${track.title}`}
      >
        <CardHeader
          subheader={track.title}
          subheaderTypographyProps={{
            color: matches?.find(
              m => m.key === "title" && m.value === track.title,
            )
              ? "secondary"
              : undefined,
          }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          component="div"
          sx={{ px: 2, pb: chips.length > 0 ? 0 : 1 }}
        >
          {getYouTubeId(track.url) ? "YouTube" : "Audio"}
          {(track.start !== undefined || track.end !== undefined) &&
            ` · Clip ${track.start ?? 0}s – ${
              track.end !== undefined ? `${track.end}s` : "end"
            }`}
        </Typography>
        {chips.length > 0 && <CardContent>{chips}</CardContent>}
      </CardActionArea>
      <CardActions sx={{ pt: 0 }}>
        <Button size="small" onClick={() => editTrack(track)}>
          Edit
        </Button>
        <Button size="small" color="inherit" onClick={remove}>
          Delete
        </Button>
      </CardActions>
      {error && (
        <Alert severity="error" onClose={() => setError(undefined)}>
          {error}
        </Alert>
      )}
      <Menu
        open={contextMenu !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem
          onClick={() => {
            editTrack(track)
            handleClose()
          }}
        >
          Edit
        </MenuItem>
        <MenuItem onClick={remove}>Delete</MenuItem>
      </Menu>
    </Card>
  )
}

interface Props {
  searchResults: Fuse.FuseResult<Track>[]
  editTrack: (track: Track) => void
  confirm: (payload: ConfirmPayload) => void
}

export function TrackList(props: Props) {
  const { editTrack, searchResults, confirm } = props
  return (
    <Virtuoso
      useWindowScroll
      data={searchResults}
      computeItemKey={(_, result) => result.item.url}
      itemContent={(_, result) => (
        <ListItem component={"div"}>
          <TrackCard
            key={result.item.url}
            track={result.item}
            editTrack={editTrack}
            confirm={confirm}
            matches={result.matches}
          />
        </ListItem>
      )}
    />
  )
}
