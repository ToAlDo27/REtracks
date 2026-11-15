import { useEffect, useState } from "react"
import OBR from "@owlbear-rodeo/sdk"
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  Tooltip,
} from "@mui/material"
import { APP_NAME, APP_VERSION, RELEASES } from "../project"

export function ReleaseNotes({ notify = false }: { notify?: boolean }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!notify) return
    const key = "com.toaldo27.retracks/last-notified-version"
    try {
      if (localStorage.getItem(key) === APP_VERSION) return
      // Mark before the request so React StrictMode cannot announce it twice.
      localStorage.setItem(key, APP_VERSION)
      void OBR.notification
        .show(
          `${APP_NAME} ${APP_VERSION}: ${RELEASES[0].changes[0]} История изменений — по кнопке версии в панели.`,
          "INFO",
        )
        .catch(() => undefined)
    } catch {
      /* The version button remains available when storage is disabled. */
    }
  }, [notify])
  return (
    <>
      <Tooltip title="Что нового / история изменений">
        <Button
          size="small"
          color="inherit"
          aria-label={`Что нового в ${APP_NAME} ${APP_VERSION}`}
          sx={{
            minWidth: 0,
            whiteSpace: "nowrap",
            fontSize: 10,
            mr: 1,
            px: 0.75,
          }}
          onClick={() => setOpen(true)}
        >
          v{APP_VERSION}
        </Button>
      </Tooltip>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="release-notes-title"
      >
        <DialogTitle id="release-notes-title">
          {APP_NAME} — история изменений
        </DialogTitle>
        <DialogContent dividers>
          {RELEASES.map(release => (
            <Box key={release.version} sx={{ mb: 3 }}>
              <Typography variant="h6">{release.version}</Typography>
              <Typography variant="caption" color="text.secondary">
                {release.date}
              </Typography>
              <Box component="ul" sx={{ pl: 2.5 }}>
                {release.changes.map(change => (
                  <Typography
                    component="li"
                    variant="body2"
                    key={change}
                    sx={{ mb: 1 }}
                  >
                    {change}
                  </Typography>
                ))}
              </Box>
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
