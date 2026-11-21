export default async function ({ page, out, root, sleep }) {
  await page.evaluate(() => window.__lantern.command('theme', 'dos-black'))
  await page.evaluate((p) => window.__lantern.openStory(p), `${root}/test/stories/advent.z5`)
  await sleep(1500)
  await page.fill('.line-input', 'look'); await page.press('.line-input', 'Enter'); await sleep(500)
  const sp = await page.locator('#splitter').boundingBox()
  await page.mouse.move(sp.x + 3, sp.y + 200)
  await page.mouse.down()
  for (let x = sp.x; x > sp.x - 380; x -= 40) { await page.mouse.move(x, sp.y + 200); await sleep(30) }
  await sleep(50)
  await page.screenshot({ path: `${out}/drag-mid.png`, clip: { x: 0, y: 0, width: 1280, height: 120 } })
  await page.mouse.up()
  await sleep(800)
  await page.screenshot({ path: `${out}/drag-after.png`, clip: { x: 0, y: 0, width: 1280, height: 120 } })
  await page.evaluate(() => window.__lantern.command('theme', 'lectrote'))
  await sleep(800)
  await page.screenshot({ path: `${out}/drag-lectrote.png`, clip: { x: 0, y: 0, width: 1280, height: 120 } })
}
