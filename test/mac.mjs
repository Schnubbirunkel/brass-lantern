export default async function ({ page, out, root, sleep }) {
  await page.evaluate(() => window.__lantern.command('theme', 'mac-classic'))
  await page.evaluate((p) => window.__lantern.openStory(p), `${root}/test/stories/lostpig.z8`)
  await sleep(1500)
  for (const c of ['look', 'n', 'x pig', 'w', 'e']) { await page.fill('.line-input', c); await page.press('.line-input', 'Enter'); await sleep(400) }
  await page.screenshot({ path: `${out}/mac2.png` })
  await page.evaluate(() => window.__lantern.command('style'))
  await sleep(400)
  await page.screenshot({ path: `${out}/mac-style.png` })
}
