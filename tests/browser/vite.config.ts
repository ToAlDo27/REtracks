import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  root: fileURLToPath(new URL("../../", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@owlbear-rodeo\/sdk$/,
        replacement: fileURLToPath(new URL("./obrMock.ts", import.meta.url)),
      },
    ],
  },
})
