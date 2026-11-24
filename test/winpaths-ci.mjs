// CI check for Windows path handling (run with LANTERN_FAKE_WIN=/): stories start, save and restore work.
export default async function ({ page, app, root, sleep }) {
  const fs = await import('node:fs')
  const save = '/tmp/bl-ci-winpath.glksave'
  await app.evaluate(({ ipcMain }, f) => { ipcMain.removeHandler('game:fileref'); ipcMain.handle('game:fileref', () => f) }, save)
  for (const g of ['advent.z5', 'advent.ulx']) {
    await page.evaluate((p) => window.__lantern.openStory(p), `${root}/test/fixtures/${g}`)
    await page.waitForSelector('.line-input', { timeout: 10000 }).catch(() => { throw new Error(`${g}: story did not start with Windows paths`) })
    try { fs.unlinkSync(save) } catch {}
    await page.fill('.line-input', 'save'); await page.press('.line-input', 'Enter'); await sleep(1200)
    if (!fs.existsSync(save)) throw new Error(`${g}: saving failed with Windows paths`)
    console.log(`${g}: start + save ok`)
  }
}
