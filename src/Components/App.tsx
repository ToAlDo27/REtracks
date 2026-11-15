import {
  AppBar,
  Box,
  Alert,
  Button,
  Collapse,
  Link,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material"
import OBR from "@owlbear-rodeo/sdk"
import Fuse from "fuse.js"
import { useEffect, useMemo, useState } from "react"
import { onLibraryChange } from "../library"
import { Track } from "../track"
import { ActionPopover } from "./ActionPopover"
import { Confirm, ConfirmPayload } from "./Confirm"
import { IconMenu } from "./IconMenu"
import { useMessage } from "./MessageProvider"
import { MuteButton } from "./MuteButton"
import { Player } from "./Player"
import { GMOnly, Role, WithRole, useRole } from "./RoleProvider"
import { TrackDialog } from "./TrackDialog"
import { TrackList } from "./TrackList"
import { TrackSearch } from "./TrackSearch"
import { VolumeSlider } from "./VolumeSlider"
import { TabBroadcast } from "./TabBroadcast"
import { getYouTubeId } from "../youtubeUrl"
import { getVolume, setVolume as persistVolume } from "../volume"
import { APP_NAME, AUTHOR_NAME, AUTHOR_URL, SOURCE_CODE_URL } from "../project"
import { ReleaseNotes } from "./ReleaseNotes"

export function App() {
  const currentMessage = useMessage()

  // role
  const role = useRole()

  // track library state
  const [trackLibrary, setTrackLibrary] = useState<Track[]>([])
  const [libraryError, setLibraryError] = useState<string>()
  useEffect(() => {
    return onLibraryChange(
      tracks => {
        setTrackLibrary(tracks)
        setLibraryError(undefined)
      },
      error => setLibraryError(error.message),
    )
  }, [])

  // track list state
  const [searchResults, setSearchResults] = useState<Fuse.FuseResult<Track>[]>(
    [],
  )

  // tag suggestions state for track dialog
  const tagSuggestions = useMemo<string[]>(() => {
    return [...new Set(trackLibrary.flatMap(track => track.tags))]
  }, [trackLibrary])

  // track dialog state
  const [trackDialogTrack, setTrackDialogTrack] = useState<
    Track | undefined | null
  >(null)
  const handleTrackDialogOpen = () => {
    setTrackDialogTrack(undefined)
  }
  const handleTrackDialogClose = () => {
    setTrackDialogTrack(null)
  }

  // confirm state
  const [confirmPayload, setConfirmPayload] = useState<
    ConfirmPayload | undefined
  >()

  // audio state
  const [ready, setReady] = useState(false)
  const [volume, setVolume] = useState(getVolume)
  const [mute, setMute] = useState(true)
  const [broadcastActive, setBroadcastActive] = useState(false)
  const playerProps = { ready, volume, mute: mute || broadcastActive }
  const changeVolume = (value: number) => {
    setVolume(value)
    persistVolume(value)
  }
  const enableAudio = () => {
    setReady(true)
    setMute(false)
    if (volume === 0) changeVolume(0.3)
  }
  const youtube = currentMessage && getYouTubeId(currentMessage.track.url)

  // unmute reminder
  useEffect(() => {
    if (!ready) {
      const id = setTimeout(() => {
        OBR.notification.show("Don't forget to unmute your audio.", "WARNING")
      }, 30000)
      return () => clearTimeout(id)
    }
  }, [ready])

  return (
    <ActionPopover
      height={
        role === Role.GM
          ? 1000
          : (currentMessage !== undefined ? (youtube ? 578 : 318) : 208) +
            (broadcastActive ? 140 : 0)
      }
      badgeText={mute ? "🔇" : undefined}
      badgeColor="transparent"
    >
      <Box
        onClick={ready ? undefined : () => setReady(true)}
        sx={{
          minHeight: "calc(100dvh - 16px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* toolbar */}
        <AppBar position="static">
          {/* menu, meader, and volume control */}
          <Toolbar variant="dense">
            <GMOnly>
              <IconMenu
                confirm={setConfirmPayload}
                openTrackDialog={handleTrackDialogOpen}
              />
            </GMOnly>
            <Typography variant="h5" sx={{ flexGrow: 1, whiteSpace: "nowrap" }}>
              {APP_NAME}
            </Typography>
            <ReleaseNotes notify />

            <Stack spacing={0} direction="row" alignItems="center" flex={9}>
              <VolumeSlider
                volume={volume}
                onVolume={changeVolume}
                disabled={mute}
              />
              <MuteButton mute={mute} onMute={setMute} />
            </Stack>
          </Toolbar>

          {/* search bar */}
          <GMOnly>
            <Toolbar variant="dense">
              <TrackSearch
                trackLibrary={trackLibrary}
                onSearch={setSearchResults}
              />
            </Toolbar>
          </GMOnly>

          {/* player */}
          <WithRole
            gm={
              <Collapse in={currentMessage !== undefined}>
                <Toolbar variant="dense">
                  <Player {...playerProps} />
                </Toolbar>
              </Collapse>
            }
            player={
              <Toolbar variant="dense">
                <Player {...playerProps} />
              </Toolbar>
            }
          />
        </AppBar>

        <TabBroadcast
          gm={role === Role.GM}
          mute={mute}
          volume={volume}
          onEnableAudio={enableAudio}
          onActiveChange={setBroadcastActive}
        />

        {/* only the gm needs the rest of the app */}
        <GMOnly>
          {libraryError && <Alert severity="error">{libraryError}</Alert>}
          <Box sx={{ px: 2, py: 1 }}>
            <Button variant="contained" onClick={handleTrackDialogOpen}>
              Add music
            </Button>
          </Box>

          <TrackDialog
            onClose={handleTrackDialogClose}
            tagSuggestions={tagSuggestions}
            track={trackDialogTrack}
          />
          <Confirm
            payload={confirmPayload}
            onClose={() => {
              setConfirmPayload(undefined)
            }}
          />
          <TrackList
            searchResults={searchResults}
            editTrack={setTrackDialogTrack}
            confirm={setConfirmPayload}
          />
        </GMOnly>
        <Box
          component="footer"
          sx={{
            mt: "auto",
            px: 2,
            py: 1.5,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 1,
            borderTop: 1,
            borderColor: "divider",
            color: "text.secondary",
          }}
        >
          <Typography variant="caption">
            by{" "}
            <Link href={AUTHOR_URL} target="_blank" rel="noreferrer">
              {AUTHOR_NAME}
            </Link>
          </Typography>
          <Link
            href={SOURCE_CODE_URL}
            target="_blank"
            rel="noreferrer"
            variant="caption"
          >
            Source code
          </Link>
        </Box>
      </Box>
    </ActionPopover>
  )
}
