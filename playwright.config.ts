import { existsSync } from "node:fs"
import process from "node:process"
import { defineConfig } from "@playwright/test"

const installedChrome =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const executablePath =
  process.env.PLAYWRIGHT_CHROME_PATH ??
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  (existsSync(installedChrome) ? installedChrome : undefined)

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 900, height: 900 },
    launchOptions: { executablePath },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "npx vite --config tests/browser/vite.config.ts --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
  },
})
