import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { parseVersion, isNewer, renderChangelog } from "./release-utils.mjs"

const read = path => JSON.parse(readFileSync(path, "utf8"))
const pkg = read("package.json"),
  manifest = read("public/manifest.json"),
  lock = read("package-lock.json"),
  releases = read("src/releases.json")
if (
  !parseVersion(pkg.version) ||
  manifest.version !== pkg.version ||
  lock.version !== pkg.version ||
  lock.packages[""].version !== pkg.version ||
  releases[0]?.version !== pkg.version
)
  throw new Error(
    "Package, manifest, lockfile and latest release must have the same version",
  )
const seen = new Set()
for (const [index, release] of releases.entries()) {
  if (
    !parseVersion(release.version) ||
    seen.has(release.version) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(release.date) ||
    !release.changes?.length ||
    release.changes.some(change => typeof change !== "string" || !change.trim())
  )
    throw new Error(
      "Each release needs a unique version, date and nonempty change notes",
    )
  if (index && !isNewer(releases[index - 1].version, release.version))
    throw new Error("Release history must be newest first")
  seen.add(release.version)
}
if (
  readFileSync("CHANGELOG.md", "utf8").replace(/\r\n/g, "\n") !==
  renderChangelog(releases)
)
  throw new Error(
    "CHANGELOG.md is out of sync; generate it with npm run release",
  )
const baseIndex = process.argv.indexOf("--base")
const base =
  baseIndex >= 0 ? process.argv[baseIndex + 1] : process.env.RELEASE_BASE_SHA
if (base && !/^0+$/.test(base)) {
  if (!/^[a-f0-9]{7,40}$/.test(base))
    throw new Error("Release base must be a commit SHA")
  const git = args =>
    execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  const previous = JSON.parse(git(["show", `${base}:package.json`]))
  const files = git([
    "diff",
    "--name-only",
    base,
    "--",
    "src",
    "public",
    "scripts",
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "index.html",
    "broadcast.html",
  ])
    .split("\n")
    .filter(Boolean)
  if (
    files.length &&
    parseVersion(previous.version) &&
    !isNewer(pkg.version, previous.version)
  )
    throw new Error(
      'Application changes require a new version and change notes. Run: npm run release -- patch "Описание изменения"',
    )
}
console.log(`ReTracks ${pkg.version}: release metadata verified`)
