// VERSION is the single source of the version number; this copies it into package.json.
import fs from 'node:fs'
const root = new URL('..', import.meta.url)
const version = fs.readFileSync(new URL('VERSION', root), 'utf8').trim()
const file = new URL('package.json', root)
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
if (pkg.version !== version) {
  pkg.version = version
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`package.json → ${version}`)
}
