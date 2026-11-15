import { execFileSync } from "node:child_process"
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"

it("publishing requires a version increase, and the release command keeps notes, manifest and package versions in sync", () => {
  const project = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const fixtureRoot = join(project, "work", "release-tests")
  mkdirSync(fixtureRoot, { recursive: true })
  const fixture = mkdtempSync(join(fixtureRoot, "case-"))
  const run = (command: string, args: string[]) =>
    execFileSync(command, args, {
      cwd: fixture,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  try {
    for (const directory of ["scripts", "public", "src"])
      mkdirSync(join(fixture, directory))
    for (const file of [
      "package.json",
      "package-lock.json",
      "public/manifest.json",
      "src/releases.json",
      "CHANGELOG.md",
      "scripts/release-utils.mjs",
      "scripts/release.mjs",
      "scripts/check-release.mjs",
    ])
      copyFileSync(join(project, file), join(fixture, file))
    run("git", ["init", "-b", "main"])
    run("git", [
      "-c",
      "user.name=Release test",
      "-c",
      "user.email=release-test@example.invalid",
      "add",
      ".",
    ])
    run("git", [
      "-c",
      "user.name=Release test",
      "-c",
      "user.email=release-test@example.invalid",
      "commit",
      "-m",
      "Release baseline",
    ])
    const base = run("git", ["rev-parse", "HEAD"]).trim()
    writeFileSync(
      join(fixture, "src/new-feature.ts"),
      "export const enabled = true\n",
    )
    run("git", ["add", "src/new-feature.ts"])
    expect(() =>
      run(process.execPath, ["scripts/check-release.mjs", "--base", base]),
    ).toThrow(/Application changes require a new version/)
    const previous = JSON.parse(
      readFileSync(join(fixture, "package.json"), "utf8"),
    ).version
    run(process.execPath, [
      "scripts/release.mjs",
      "patch",
      "Проверка новой функции",
    ])
    const updated = JSON.parse(
      readFileSync(join(fixture, "package.json"), "utf8"),
    ).version
    expect(updated).not.toBe(previous)
    expect(
      run(process.execPath, ["scripts/check-release.mjs", "--base", base]),
    ).toContain(`ReTracks ${updated}: release metadata verified`)
    const history = JSON.parse(
      readFileSync(join(fixture, "src/releases.json"), "utf8"),
    )
    expect(history[0]).toMatchObject({
      version: updated,
      changes: ["Проверка новой функции"],
    })
    expect(history[1].version).toBe(previous)
    writeFileSync(join(fixture, "CHANGELOG.md"), "Missing release notes\n")
    expect(() =>
      run(process.execPath, ["scripts/check-release.mjs", "--base", base]),
    ).toThrow(/CHANGELOG.md is out of sync/)
  } finally {
    // Delete only the fixture created inside this test's designated workspace.
    if (resolve(fixture).startsWith(resolve(fixtureRoot) + sep))
      rmSync(fixture, { recursive: true, force: true })
  }
}, 15000)
