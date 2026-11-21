// Starts every format, plays a move and saves/restores. Run with LANTERN_FAKE_WIN=/ to simulate Windows paths.
export default async function ({ page, app, root, sleep }) {
  await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler('game:fileref'); ipcMain.handle('game:fileref', () => '/tmp/bl-winpath-test.glksave') })
  const fs = await import('node:fs')
  const games = [['advent.z5', 'look'], ['advent.ulx', 'look'], ['ditch3.t3', 'look'], ['ditch.gam', 'look'], ['colossal.hex', 'look'], ['Hamper.taf', 'look'], ['bronze.zblorb', 'look']]
  for (const engine of ['glulxe', 'git']) {
    await page.evaluate((e) => window.lantern.setSettings({ glulxEngine: e }), engine)
    for (const [g, cmd] of games) {
      if (engine === 'git' && !g.endsWith('.ulx')) continue
      await page.evaluate((p) => window.__lantern.openStory(p), `${root}/test/stories/${g}`)
      let ok = false
      for (let i = 0; i < 30 && !ok; i++) {
        await sleep(300)
        ok = await page.evaluate(() => !!document.querySelector('.line-input'))
        if (!ok) await page.keyboard.press('Space')
      }
      const text = await page.evaluate(() => window.__lantern.state.display ? window.__lantern.state.display.transcriptText().replace(/\s+/g, ' ').trim() : '')
      let saved = '-'
      if (ok && g === 'advent.z5') {
        try { fs.unlinkSync('/tmp/bl-winpath-test.glksave') } catch {}
        await page.fill('.line-input', 'save'); await page.press('.line-input', 'Enter'); await sleep(900)
        saved = fs.existsSync('/tmp/bl-winpath-test.glksave') ? 'save ok' : 'SAVE FAILED'
        await page.fill('.line-input', 'restore'); await page.press('.line-input', 'Enter'); await sleep(900)
        const t2 = await page.evaluate(() => window.__lantern.state.display.transcriptText().slice(-200))
        saved += /Ok|OK|restored|wiederhergestellt/i.test(t2) ? ', restore ok' : ', RESTORE FAILED: ' + t2.replace(/\s+/g, ' ').slice(-80)
      }
      console.log(`${engine.padEnd(6)} ${g.padEnd(14)} ${ok ? 'OK    ' : 'FAILED'} ${saved}  | ${text.slice(0, 60)}`)
    }
  }
}
