export default async function ({ page, out, root, sleep }) {
  const shots = []
  for (const theme of ['lectrote', 'mac-classic']) {
    await page.evaluate((t) => window.__lantern.command('theme', t), theme)
    for (const g of ['zork1.z3', 'lostpig.z8', 'advent.ulx', 'ditch3.t3', 'ditch.gam', 'colossal.hex', 'Hamper.taf']) {
      await page.evaluate((p) => window.__lantern.openStory(p), `${root}/test/stories/${g}`)
      await sleep(1200)
      for (let i = 0; i < 6 && !(await page.evaluate(() => !!document.querySelector('.line-input'))); i++) { await page.keyboard.press('Space'); await sleep(400) }
      await page.fill('.line-input', 'look'); await page.press('.line-input', 'Enter'); await sleep(500)
      const box = await page.evaluate(() => { const g = document.querySelector('.win-grid'); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
      if (box && box.w > 5 && box.h > 5) { const f = `${out}/st-${theme}-${g}.png`; await page.screenshot({ path: f, clip: { x: box.x, y: box.y, width: box.w, height: Math.min(box.h, 90) } }); shots.push(f) }
      else console.log('no grid', g)
    }
  }
  console.log(JSON.stringify(shots))
}
