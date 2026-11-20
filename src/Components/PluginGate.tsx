import OBR from "@owlbear-rodeo/sdk"
import React, { useEffect, useState } from "react"
import { Alert, Box, Button, Link, Stack, Typography } from "@mui/material"
import { APP_NAME, APP_VERSION, SOURCE_CODE_URL } from "../project"
import { ReleaseNotes } from "./ReleaseNotes"

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
    const manifestFile = import.meta.env.PROD
      ? `manifest-v${APP_VERSION}.json`
      : "manifest.json"
    const manifest = new URL(manifestFile, location.href).href
    return (
      <Box sx={{ maxWidth: 600, mx: "auto", p: 4 }}>
        <Stack spacing={3}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <img src="./music-icon.svg" width="64" height="64" alt="" />
            <Typography variant="h3">{APP_NAME}</Typography>
            <ReleaseNotes />
          </Stack>
          <Typography>
            Music for your Owlbear Rodeo room: audio links, YouTube clips and
            browser tab broadcasting.
          </Typography>
          <Alert severity="info">
            Install this as an Owlbear Rodeo extension, then open ReTracks in
            your room.
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
          <Link href={SOURCE_CODE_URL} target="_blank" rel="noreferrer">
            Source code
          </Link>
          <Typography variant="caption">
            ReTracks by <Link href="https://github.com/ToAlDo27">ToAlDo27</Link>
            . Based on Tracks by Jordan Cohen. · AGPL-3.0
          </Typography>
        </Stack>
      </Box>
    )
  } else {
    return null
  }
}
