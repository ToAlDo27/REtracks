import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { zipSync } from "fflate"

// Include the corresponding source beside the hosted app (AGPL-3.0).
const entries = {}
const root = process.cwd()
function add(path) {
  if (statSync(path).isDirectory()) {
    for (const name of readdirSync(path)) add(join(path, name))
  } else {
    const name = relative(root, path).replaceAll("\\", "/")
    entries[`obr-tracks-plus/${name}`] = new Uint8Array(readFileSync(path))
  }
}
for (const name of ["src", "public", "docs", "test", "tests", "scripts", ".github"])
  add(join(root, name))
for (const name of readdirSync(root)) {
  if (
    /^(package(?:-lock)?\.json|tsconfig(?:\.node)?\.json|.*config\.(?:ts|cjs|json)|index\.html|broadcast\.html|README(?:\.ru)?\.md|LICENSE|\.gitignore|\.prettierrc|\.eslintrc\.cjs|\.firebaserc)$/.test(
      name,
    )
  )
    add(join(root, name))
}
writeFileSync("dist/source.zip", zipSync(entries, { level: 6 }))
writeFileSync("dist/LICENSE.txt", readFileSync("LICENSE"))
console.log(
  `Packaged corresponding source (${
    Object.keys(entries).length
  } files) in dist/source.zip`,
)
