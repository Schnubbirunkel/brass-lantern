// Status line after changing the map width / window size
export default async function ({ page, app, out, root, sleep }) {
  const type = async (c) => { await page.waitForSelector('.line-input', { timeout: 6000 }); await page.fill('.line-input', c); await page.press('.line-input', 'Enter'); await sleep(500) }
  const info = () => page.evaluate(() => {
    const d = window.__lantern.state.display
    const g = [...d.windows.values()].find(w => w.type === 'grid')
    const line = g.lines[0]
    return { gridwidth: g.gw, winPx: Math.round(g.width), cols: Math.floor((g.el.clientWidth) / d.metrics.gridcharwidth), text: JSON.stringify(line.textContent), textLen: line.textContent.length, scroll: line.scrollWidth, client: line.clientWidth }
  })
  for (const g of (process.env.GAMES || 'advent.z5,lostpig.z8,zork1.z3,advent.ulx').split(',')) {
    await page.evaluate((p) => window.__lantern.openStory(p), `${root}/test/stories/${g}`)
    await sleep(1500)
    for (let i = 0; i < 4 && !(await page.evaluate(() => !!document.querySelector('.line-input'))); i++) { await page.keyboard.press('Space'); await sleep(400) }
    await type('look')
    console.log(`\n== ${g}`)
    console.log('start      ', JSON.stringify(await info()))
    await page.evaluate(() => window.lantern.setSettings({ mapWidth: 700 }).then(s => { document.body.style.setProperty('--map-width', '700px') }))
    await sleep(900)
    console.log('map 700px  ', JSON.stringify(await info()))
    await page.screenshot({ path: `${out}/status-${g}-wide-map.png` })
    await type('look')
    console.log('after cmd  ', JSON.stringify(await info()))
    await page.screenshot({ path: `${out}/status-${g}-after.png` })
    await page.evaluate(() => { document.body.style.setProperty('--map-width', '300px') })
    await sleep(900)
    console.log('map 300px  ', JSON.stringify(await info()))
    await type('look')
    console.log('after cmd  ', JSON.stringify(await info()))
  }
}
