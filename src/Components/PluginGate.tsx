import OBR from "@owlbear-rodeo/sdk"
import React, { useEffect, useState } from "react"
import { Alert, Box, Button, Link, Stack, Typography } from "@mui/material"

/**
 * Only render the children when we're within a plugin
 * and that plugin is ready.
 */
export function PluginGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  useEffect(() => {
    if (OBR.isAvailable) {
      OBR.onReady(() => setReady(true))
    }
  }, [])

  if (ready) {
    return <>{children}</>
  } else if (!OBR.isAvailable) {
    const manifest = new URL("manifest.json", location.href).href
    return (
      <Box sx={{ maxWidth: 600, mx: "auto", p: 4 }}>
        <Stack spacing={3}>
          <Typography variant="h3">REtracks</Typography>
          <Typography>
            Music for your Owlbear Rodeo room: audio links, YouTube clips and
            browser tab broadcasting.
          </Typography>
          <Alert severity="info">
            Install this as an Owlbear Rodeo extension, then open REtracks in your
            room.
          </Alert>
          <Typography>
            In Owlbear Rodeo, open Extras → Extensions → Add custom extension
            and paste this manifest URL:
          </Typography>
          <Link href={manifest} sx={{ overflowWrap: "anywhere" }}>
            {manifest}
          </Link>
          <Button
            variant="contained"
            onClick={() => {
              if (!navigator.clipboard) {
                setCopyError(true)
                return
              }
              void navigator.clipboard
                .writeText(manifest)
                .then(() => {
                  setCopied(true)
                  setCopyError(false)
                })
                .catch(() => setCopyError(true))
            }}
          >
            {copied ? "Copied" : "Copy manifest URL"}
          </Button>
          {copyError && (
            <Alert severity="info">
              Copy the manifest link above using your browser.
            </Alert>
          )}
          <Link
            href="https://www.owlbear.rodeo/"
            target="_blank"
            rel="noreferrer"
          >
            Open Owlbear Rodeo
          </Link>
          <Typography variant="caption">
            Based on Tracks by Jordan Cohen.{" "}
            <Link href={new URL("source.zip", location.href).href}>
              Download source code
            </Link>{" "}
            · AGPL-3.0
          </Typography>
        </Stack>
      </Box>
    )
  } else {
    return null
  }
}
