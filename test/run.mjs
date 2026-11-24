// Drive the app with Playwright for smoke tests and screenshots.
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = path.join(root, 'test', 'shots')
fs.mkdirSync(out, { recursive: true })
const userData = '/tmp/lantern-test-' + Date.now()
fs.mkdirSync(userData, { recursive: true })
if (process.env.SETTINGS) fs.writeFileSync(path.join(userData, 'settings.json'), process.env.SETTINGS)

const app = await electron.launch({
  executablePath: process.env.EXEC || path.join(root, 'node_modules/electron/dist/electron'),
  args: process.env.EXEC ? ['--no-sandbox'] : [root, '--no-sandbox'],
  env: { ...process.env, LANTERN_USERDATA: userData, LANTERN_AUTOCONFIRM: '1' },
})
const page = await app.firstWindow()
page.on('console', m => console.log('[console]', m.type(), m.text()))
let failed = false
page.on('pageerror', e => { failed = true; console.log('[pageerror]', e.message) })
await page.setViewportSize?.({ width: 1280, height: 800 })
await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1280, 820) })
await page.waitForTimeout(800)

const script = (await import(path.resolve(process.argv[2]))).default
try {
  await script({ page, app, out, root, sleep: (ms) => page.waitForTimeout(ms) })
} catch (e) {
  failed = true
  console.error('SCRIPT ERROR', e)
}
await app.close()
if (failed) process.exitCode = 1
