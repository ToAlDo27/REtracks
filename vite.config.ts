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
            readFileSync(new URL("./public/manifest.json", import.meta.url), "utf8"),
          )
          manifest.icon = `${base}tracks_256.png`
          manifest.action.icon = `${base}album_black_24dp.svg`
          manifest.action.popover = base
          this.emitFile({
            type: "asset",
            fileName: "manifest.json",
            source: `${JSON.stringify(manifest, null, 2)}\n`,
          })
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
