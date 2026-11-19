export default async function ({ page, out, root, sleep }) {
  const type = async (cmd) => {
    try { await page.waitForSelector('.line-input', { timeout: 6000 }) } catch { console.log('no line input for', cmd); return }
    await page.fill('.line-input', cmd)
    await page.press('.line-input', 'Enter')
    await sleep(400)
  }
  const games = [
    ['advent.ulx', ['e', 'w', 'n', 's']],
    ['ditch3.t3', ['', 'look', 'n']],
    ['ditch.gam', ['look', 'w']],
    ['colossal.hex', ['e', 'w', 'n']],
    ['Hamper.taf', ['#key', '#key', '#key', '#key', 'look', 'n']],
    ['bronze.zblorb', ['#key', '#key', 'look', 'n', 's']],
    ['lostpig.z8', ['look', 'n']],
  ]
  for (const [g, cmds] of games) {
    await page.evaluate((p) => window.__lantern.openStory(p), `${root}/test/stories/${g}`)
    await sleep(2000)
    for (const c of cmds) {
      if (c === '#key') { await page.keyboard.press('Space'); await sleep(500); continue }
      await type(c)
    }
    await sleep(600)
    await page.screenshot({ path: `${out}/fmt-${g}.png` })
    const info = await page.evaluate(() => ({ rooms: window.__lantern.state.automap.list().map(r => r.name), wins: [...window.__lantern.state.display.windows.values()].map(w => `${w.type}:${Math.round(w.width)}x${Math.round(w.height)}`) }))
    console.log(g, JSON.stringify(info))
  }
  await page.evaluate(() => window.__lantern.command('library'))
  await sleep(1000)
  await page.screenshot({ path: `${out}/lib-after.png` })
}
