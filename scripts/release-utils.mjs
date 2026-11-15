export function renderChangelog(releases) {
  return `# ReTracks — история изменений\n\n${releases
    .map(
      release =>
        `## ${release.version} — ${release.date}\n\n${release.changes
          .map(change => `- ${change}`)
          .join("\n")}`,
    )
    .join("\n\n")}\n`
}
export const parseVersion = version =>
  typeof version === "string" &&
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
    ? version.split(".").map(Number)
    : null
export function isNewer(version, previous) {
  const a = parseVersion(version),
    b = parseVersion(previous)
  if (!a || !b) return false
  for (let index = 0; index < 3; index++)
    if (a[index] !== b[index]) return a[index] > b[index]
  return false
}
