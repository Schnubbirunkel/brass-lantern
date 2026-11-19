export default async function ({ page, out, root, sleep }) {
  const dir = `${root}/docs/screenshots`
  const fs = await import('node:fs')
  fs.mkdirSync(dir, { recursive: true })
  const type = async (c) => { await page.waitForSelector('.line-input', { timeout: 6000 }); await page.fill('.line-input', c); await page.press('.line-input', 'Enter'); await sleep(380) }
  await sleep(2500)
  await page.click('.lib-row:has-text("Bronze")')
  await sleep(500)
  await page.screenshot({ path: `${dir}/library.png` })
  await page.evaluate((p) => window.__lantern.openStory(p), `${root}/test/stories/advent.z5`)
  await sleep(1500)
  for (const c of ['e', 'take lamp', 'take keys', 'w', 'w', 'e', 's', 's', 's', 'unlock grate with keys', 'open grate', 'n', 'n']) await type(c)
  await sleep(600)
  const shots = [['lectrote', 'game-lectrote'], ['dos-blue', 'theme-dos'], ['mac-classic', 'theme-mac'], ['crt-green', 'theme-crt'], ['gargoyle-night', 'theme-gargoyle-night'], ['parchmap', 'theme-parchmap']]
  for (const [t, name] of shots) {
    await page.evaluate((t) => window.__lantern.command('theme', t), t)
    await sleep(800)
    await page.evaluate(() => { const v = window.__lantern.state.mapView; v.scale = 0.8; v.center(false) })
    await sleep(200)
    await page.screenshot({ path: `${dir}/${name}.png` })
  }
  await page.evaluate(() => window.__lantern.command('theme', 'lectrote'))
  await sleep(500)
  await page.evaluate(() => window.__lantern.command('style'))
  await sleep(500)
  await page.screenshot({ path: `${dir}/styles.png` })
}
