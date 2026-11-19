export default async function ({ page, out, root, sleep }) {
  await page.screenshot({ path: `${out}/lib-0.png` })
  await sleep(6000)
  await page.evaluate(() => window.__lantern.command('library'))
  await sleep(1500)
  await page.screenshot({ path: `${out}/lib-1.png` })
  // select lost pig
  await page.click('.lib-row:has-text("Lost Pig")')
  await sleep(500)
  await page.screenshot({ path: `${out}/lib-2.png` })
  for (const t of (process.env.THEMES || 'dos-blue,mac-classic,parchmap').split(',')) {
    await page.evaluate((t) => window.__lantern.command('theme', t), t)
    await sleep(600)
    await page.screenshot({ path: `${out}/lib-${t}.png` })
  }
  await page.evaluate(() => window.__lantern.command('theme', 'lectrote'))
  await page.click('.lib-row:has-text("ditch3")').catch(() => page.click('.lib-row:has-text("Ditch")'))
  await sleep(300)
  await page.click('text=IFDB-Eintrag wählen')
  await sleep(1500)
  await page.screenshot({ path: `${out}/lib-pick.png` })
  console.log('rows', await page.evaluate(() => [...document.querySelectorAll('.lib-row')].map(r => r.innerText.replace(/\n/g, ' | ')).join('\n')))
}
