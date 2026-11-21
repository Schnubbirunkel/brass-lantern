export default async function ({ page, root, sleep }) {
  await page.evaluate((p) => window.__lantern.openStory(p), `${root}/test/stories/advent.z5`)
  await sleep(2500)
  console.log('TOAST:', await page.evaluate(() => document.getElementById('toast').textContent), '| gameover visible:', await page.evaluate(() => !document.getElementById('gameover').classList.contains('hidden')))
}
