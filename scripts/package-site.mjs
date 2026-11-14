import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

const repository = "https://github.com/ToAlDo27/REtracks"
let revision = process.env.GITHUB_SHA
if (!revision) {
  try {
    const options = {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }
    if (!execFileSync("git", ["status", "--porcelain"], options).trim()) {
      revision = execFileSync("git", ["rev-parse", "HEAD"], options).trim()
    }
  } catch {
    /* Source exports without git history still link to the public repository. */
  }
}
const source =
  revision && /^[a-f0-9]{40}$/.test(revision)
    ? `${repository}/tree/${revision}`
    : repository
writeFileSync("dist/LICENSE.txt", readFileSync("LICENSE"))
writeFileSync(
  "dist/SOURCE.txt",
  `REtracks by ToAlDo27\nSource code: ${source}\nRepository: ${repository}\nBased on Tracks by Jordan Cohen: https://github.com/hypergig/obr-tracks\nLicense: AGPL-3.0 (see LICENSE.txt)\n`,
)
console.log(`Source code available at ${source}`)
