// Library rating stars with a half star (uses the IFDB mock: node test/ifdb-mock.mjs)
export default async function ({ page, out, sleep }) {
  await sleep(4000)
  await page.evaluate(() => window.__lantern.command('library'))
  await sleep(1500)
  await page.click('.lib-row:has-text("Lost Pig")')
  await sleep(500)
  await page.evaluate(() => document.getElementById('lib-search').focus())
  const els = await page.$$('.lib-stars')
  let i = 0
  for (const e of els.slice(0, 2)) await e.screenshot({ path: `${out}/stars-${i++}.png` })
  await (await page.$('.lib-facts')).screenshot({ path: `${out}/stars-fact.png` })
}
