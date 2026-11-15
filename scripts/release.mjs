import { readFileSync, writeFileSync } from "node:fs"
import { parseVersion, isNewer, renderChangelog } from "./release-utils.mjs"

const [bump, ...notes] = process.argv.slice(2)
if (!bump || !notes.length || notes.some(note => !note.trim()))
  throw new Error(
    'Usage: npm run release -- patch|minor|major|1.2.3 "Описание изменения" ["Ещё одно изменение"]',
  )
const read = path => JSON.parse(readFileSync(path, "utf8"))
const write = (path, value) => {
  const newline = readFileSync(path, "utf8").includes("\r\n") ? "\r\n" : "\n"
  writeFileSync(
    path,
    (JSON.stringify(value, null, 2) + "\n").replace(/\n/g, newline),
  )
}
const pkg = read("package.json")
const numbers = parseVersion(pkg.version)
if (!numbers) throw new Error("Current version is invalid")
const index = { major: 0, minor: 1, patch: 2 }[bump]
if (index !== undefined) {
  numbers[index]++
  for (let i = index + 1; i < 3; i++) numbers[i] = 0
}
const version = index === undefined ? bump : numbers.join(".")
if (!isNewer(version, pkg.version))
  throw new Error("New version must be greater than the current version")
const releases = read("src/releases.json")
if (releases.some(release => release.version === version))
  throw new Error("This release already exists")
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date())
releases.unshift({ version, date, changes: notes.map(note => note.trim()) })
const manifest = read("public/manifest.json")
const lock = read("package-lock.json")
pkg.version = version
manifest.version = version
lock.version = version
lock.packages[""].version = version
write("package.json", pkg)
write("public/manifest.json", manifest)
write("package-lock.json", lock)
write("src/releases.json", releases)
writeFileSync("CHANGELOG.md", renderChangelog(releases))
console.log(`ReTracks ${version}: ${notes.length} change(s) recorded`)
