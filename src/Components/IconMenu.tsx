import AddIcon from "@mui/icons-material/AddRounded"
import DeleteIcon from "@mui/icons-material/DeleteForeverRounded"
import DownloadIcon from "@mui/icons-material/FileDownloadRounded"
import UploadIcon from "@mui/icons-material/FileUploadRounded"
import MenuIcon from "@mui/icons-material/MenuRounded"
import {
  IconButton,
  Alert,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  MenuList,
  useTheme,
} from "@mui/material"
import { useState } from "react"
import { CsvError, TracksToCsv, csvToTracks } from "../csv"
import { clearLibrary, getLibrary, mergeLibrary } from "../library"
import { ConfirmPayload } from "./Confirm"
import { CsvErrors } from "./CsvErrors"
import { SOURCE_CODE_URL } from "../project"

const importButton = (setErrors: (errors: CsvError[]) => void) => {
  const input = document.createElement("input")
  input.type = "file"
  input.accept = "text/csv"
  input.multiple = false
  input.onchange = () => {
    if (input.files?.length !== 1) {
      return
    }
    input.files[0]
      .text()
      .then(t => {
        const { tracks, errors } = csvToTracks(t)

        if (errors.length > 0) {
          setErrors(errors)
        } else {
          mergeLibrary(tracks)
        }
      })
      .catch(error =>
        setErrors([
          {
            row: 0,
            errors: [
              error instanceof Error ? error.message : "Could not import CSV",
            ],
          },
        ]),
      )
  }
  input.click()
}

const exportButton = () => {
  const tracks = getLibrary()
  const a = document.createElement("a")
  const url = URL.createObjectURL(
    new Blob([TracksToCsv(tracks)], { type: "text/csv;charset=utf-8" }),
  )
  a.href = url
  a.download = "tracks.csv"
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

interface Props {
  confirm: (payload: ConfirmPayload) => void
  openTrackDialog: () => void
}

export function IconMenu(props: Props) {
  const { confirm, openTrackDialog } = props

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }
  const handleClose = () => {
    setAnchorEl(null)
  }

  const [csvErrors, setCsvErrors] = useState<CsvError[]>([])
  const [error, setError] = useState<string>()
  const attempt = (action: () => void) => {
    try {
      action()
      setError(undefined)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to update the library",
      )
    }
  }

  const theme = useTheme()
  return (
    <>
      <IconButton
        size="large"
        edge="start"
        color="inherit"
        aria-label="menu"
        onClick={handleClick}
      >
        <MenuIcon />
      </IconButton>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
        <MenuList>
          <MenuItem
            onClick={() => {
              handleClose()
              openTrackDialog()
            }}
            divider
          >
            <ListItemIcon>
              <AddIcon />
            </ListItemIcon>
            <ListItemText>Add Track</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleClose()
              importButton(setCsvErrors)
            }}
          >
            <ListItemIcon>
              <UploadIcon />
            </ListItemIcon>
            <ListItemText>Import csv</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleClose()
              attempt(exportButton)
            }}
            divider
          >
            <ListItemIcon>
              <DownloadIcon />
            </ListItemIcon>
            <ListItemText>Export csv</ListItemText>
          </MenuItem>
          <MenuItem
            color={"red"}
            onClick={() => {
              handleClose()
              confirm({
                message: "This will clear your entire track library.",
                action: () => attempt(clearLibrary),
              })
            }}
          >
            <ListItemIcon>
              <DeleteIcon color="error" />
            </ListItemIcon>
            <ListItemText sx={{ color: theme.palette.error.main }}>
              Clear All Tracks
            </ListItemText>
          </MenuItem>
          <MenuItem
            component="a"
            href={SOURCE_CODE_URL}
            target="_blank"
            rel="noreferrer"
          >
            Source code
          </MenuItem>
        </MenuList>
      </Menu>
      <CsvErrors errors={csvErrors} onClose={() => setCsvErrors([])} />
      {error && (
        <Alert severity="error" onClose={() => setError(undefined)}>
          {error}
        </Alert>
      )}
    </>
  )
}
