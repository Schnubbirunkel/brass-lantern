export default async function ({ page, out, root, sleep }) {
  await page.evaluate((p) => window.__lantern.openStory(p), `${root}/test/stories/lostpig.z8`)
  await sleep(1500)
  for (const c of ['look', 'x farm', 'w']) { await page.fill('.line-input', c); await page.press('.line-input', 'Enter'); await sleep(400) }
  for (const t of ['lectrote', 'dos-blue', 'mac-classic']) {
    await page.evaluate((t) => window.__lantern.command('theme', t), t)
    await sleep(700)
    await page.focus('.line-input')
    await page.keyboard.type('x st')
    await sleep(300)
    await page.screenshot({ path: `${out}/sugg-${t}.png` })
    const r = await page.evaluate(() => { const i = document.querySelector('.line-input').getBoundingClientRect(); const s = document.querySelector('#suggest').getBoundingClientRect(); return { inputBottom: Math.round(i.bottom), suggTop: Math.round(s.top), chips: document.querySelectorAll('#suggest .sugg').length } })
    console.log(t, JSON.stringify(r))
    await page.fill('.line-input', '')
  }
}
