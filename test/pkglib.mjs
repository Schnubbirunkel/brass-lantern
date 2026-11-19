export default async function ({ page, out, sleep }) {
  await sleep(5000)
  await page.evaluate(() => window.__lantern.command('library'))
  await sleep(1500)
  await page.click('.lib-row:has-text("Lost Pig")')
  await sleep(300)
  await page.click('.lib-play')
  await sleep(2500)
  await page.screenshot({ path: `${out}/pkg-lib-play.png` })
  console.log('covers', await page.evaluate(() => 1))
}
