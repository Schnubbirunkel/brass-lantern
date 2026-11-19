export default async function ({ page, out, root, sleep }) {
  await page.screenshot({ path: `${out}/00-library.png` })
  const type = async (cmd) => {
    await page.waitForSelector('.line-input', { timeout: 8000 })
    await page.fill('.line-input', cmd)
    await page.press('.line-input', 'Enter')
    await sleep(350)
  }
  await page.evaluate((p) => window.__lantern.openStory(p), `${root}/test/stories/advent.z5`)
  await sleep(1500)
  await page.screenshot({ path: `${out}/01-advent-start.png` })
  for (const c of ['e', 'w', 's', 's', 'n', 'n', 'w', 'e', 'n', 'u', 'd']) await type(c)
  await sleep(500)
  await page.screenshot({ path: `${out}/02-advent-map.png` })
  const rooms = await page.evaluate(() => window.__lantern.state.automap.list().map(r => `${r.id}:${r.name}@${r.x},${r.y},${r.z} ${JSON.stringify(Object.fromEntries(Object.entries(r.exits).map(([d,e])=>[d,e.to])))}`))
  console.log(rooms.join('\n'))
}
