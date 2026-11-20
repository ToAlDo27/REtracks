import { readFileSync } from "node:fs"
import process from "node:process"
import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_")
  const basePath = (env.VITE_BASE_PATH ?? "/").replace(/^\/+|\/+$/g, "")
  const base = basePath ? `/${basePath}/` : "/"

  return {
    base,
    plugins: [
      react(),
      {
        name: "extension-manifest",
        generateBundle() {
          const manifest = JSON.parse(
            readFileSync(
              new URL("./public/manifest.json", import.meta.url),
              "utf8",
            ),
          )
          const version = `?v=${encodeURIComponent(manifest.version)}`
          manifest.icon = `${base}music-icon.svg${version}`
          manifest.action.icon = `${base}music-action.svg${version}`
          manifest.action.popover = `${base}${version}`

          const releases: { version: string }[] = JSON.parse(
            readFileSync(
              new URL("./src/releases.json", import.meta.url),
              "utf8",
            ),
          )
          const source = `${JSON.stringify(manifest, null, 2)}\n`
          const installFiles = [
            "manifest.json",
            // Keep older install links working and serving the current release.
            ...releases.map(release => `manifest-v${release.version}.json`),
          ]
          for (const fileName of installFiles) {
            this.emitFile({ type: "asset", fileName, source })
          }
        },
      },
    ],
    build: {
      rollupOptions: {
        input: { main: "index.html", broadcast: "broadcast.html" },
      },
    },
  }
})
