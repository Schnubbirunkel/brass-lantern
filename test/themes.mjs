export default async function ({ page, out, root, sleep }) {
  const type = async (cmd) => {
    await page.waitForSelector('.line-input', { timeout: 8000 })
    await page.fill('.line-input', cmd)
    await page.press('.line-input', 'Enter')
    await sleep(300)
  }
  await page.evaluate((p) => window.__lantern.openStory(p), `${root}/test/stories/zork1.z3`)
  await sleep(1500)
  for (const c of ['n', 'e', 'open window', 'w', 'w', 'u', 'd', 'e', 'e', 'open sack', 'take all']) await type(c)
  const themes = (process.env.THEMES || 'lectrote,lectrote-sepia,lectrote-slate,gargoyle,gargoyle-night,parchmap,parchmap-light,dos-blue,dos-black,mac-classic,mac-platinum,crt-green,crt-amber,parchment').split(',')
  for (const t of themes) {
    await page.evaluate((t) => window.__lantern.command('theme', t), t)
    await sleep(700)
    await page.screenshot({ path: `${out}/theme-${t}.png` })
  }
}
