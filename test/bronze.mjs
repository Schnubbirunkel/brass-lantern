export default async function ({ page, out, root, sleep }) {
  const type = async (cmd) => {
    await page.waitForSelector('.line-input', { timeout: 6000 })
    await page.fill('.line-input', cmd)
    await page.press('.line-input', 'Enter')
    await sleep(500)
    const st = await page.evaluate(() => { const m = window.__lantern.state.automap; return m.list().map(r => `${r.id}${m.current===r?'*':''}:${r.name}@${r.x},${r.y}`).join(' | ') })
    console.log('>', cmd, '=>', st)
  }
  await page.exposeFunction('logTurn', (t) => console.log('TURN', t))
  await page.evaluate(() => { const d = window.__lantern.state; })
  await page.evaluate((p) => window.__lantern.openStory(p), `${root}/test/stories/bronze.zblorb`)
  await sleep(1500)
  await page.evaluate(() => { const disp = window.__lantern.state.display; const orig = disp.opts.onTurn; disp.opts.onTurn = (t) => { window.logTurn(JSON.stringify({ status: t.status, cmd: t.command, pars: t.paragraphs.filter(p => p.text.trim()).map(p => [...p.styles].join(',') + '|' + p.text.slice(0, 50)) })); orig(t) } })
  for (let i = 0; i < 2; i++) { await page.keyboard.press('Space'); await sleep(500) }
  for (const c of ['look', 'n', 's']) await type(c)
}
