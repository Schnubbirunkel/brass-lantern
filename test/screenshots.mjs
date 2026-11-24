// Screenshots for README and releases: docs/screenshots/<lang>_<n>_<name>.png
// Run via tools/screenshots.sh (once per interface language).
export default async function ({ page, app, root, sleep }) {
  const fs = await import('node:fs')
  const lang = process.env.SHOT_LANG || 'de'
  const dir = `${root}/docs/screenshots`
  fs.mkdirSync(dir, { recursive: true })
  const shot = (n, name) => page.screenshot({ path: `${dir}/${lang}_${n}_${name}.png` })
  const type = async (c) => { await page.waitForSelector('.line-input', { timeout: 8000 }); await page.fill('.line-input', c); await page.press('.line-input', 'Enter'); await sleep(400) }
  // Hide the blinking caret so screenshots don't change on every run
  await page.addStyleTag({ content: '* { caret-color: transparent !important; } .char-hint { animation: none !important; }' })

  // 1 – Library (wait for the IFDB sync, if any)
  for (let i = 0; i < 40; i++) {
    const pending = await page.evaluate(() => [...document.querySelectorAll('.lib-row .lib-sync')].length)
    if (!pending && await page.evaluate(() => document.querySelectorAll('.lib-row').length)) break
    await sleep(500)
  }
  await page.evaluate(() => window.__lantern.command('library'))
  await sleep(1500)
  const withCover = await page.$('.lib-row:has(.lib-thumb img)')
  await (withCover || page.locator('.lib-row').first()).click()
  await sleep(1200)
  await shot(1, 'library')

  // 2 – Playing with the automap
  await page.evaluate((p) => window.__lantern.openStory(p), `${root}/test/fixtures/advent.z5`)
  await sleep(1500)
  for (const c of ['e', 'take lamp', 'take keys', 'w', 'w', 'e', 's', 's', 's', 'unlock grate with keys', 'open grate', 'n', 'n']) await type(c)
  await sleep(600)
  const center = () => page.evaluate(() => { const v = window.__lantern.state.mapView; v.scale = 0.8; v.center(false) })
  await center()
  await sleep(300)
  await shot(2, 'game')

  // 3–6 – Styles
  const themes = [[3, 'dos', 'dos-blue'], [4, 'mac', 'mac-classic'], [5, 'crt', 'crt-green'], [6, 'gargoyle', 'gargoyle-night'], [7, 'parchmap', 'parchmap']]
  for (const [n, name, id] of themes) {
    await page.evaluate((t) => window.__lantern.command('theme', t), id)
    await sleep(900)
    await center()
    await sleep(300)
    await shot(n, name)
  }

  // 8 – Style picker
  await page.evaluate(() => window.__lantern.command('theme', 'lectrote'))
  await sleep(700)
  await page.evaluate(() => window.__lantern.command('style'))
  await sleep(700)
  await shot(8, 'styles')
  await page.keyboard.press('Escape')
}
