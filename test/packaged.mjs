export default async function ({ page, out, root, sleep }) {
  await page.evaluate((p) => window.__lantern.openStory(p), `${root}/test/stories/ditch3.t3`)
  await sleep(2500)
  await page.keyboard.press('Enter')
  await sleep(1000)
  await page.evaluate(() => window.__lantern.command('theme', 'dos-black'))
  await sleep(800)
  await page.screenshot({ path: `${out}/packaged.png` })
  console.log('fonts', await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).filter((v, i, a) => a.indexOf(v) === i).join(',')))
  console.log('text', await page.evaluate(() => window.__lantern.state.display.transcriptText().slice(0, 200)))
}
