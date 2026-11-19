import http from 'node:http'
import fs from 'node:fs'
const PORT = 18734
const base = `http://127.0.0.1:${PORT}`
const games = {
  lostpig: { ifids: ['ZCODE-2-080406-A377'], title: 'Lost Pig', author: 'Admiral Jota', firstpublished: '2007', genre: 'Comedy', language: 'en', description: 'Grunk think that pig probably go this way. It hard to tell at night time.<br/><br/>Winner of four XYZZY Awards and the 2007 IF Competition.', rating: 4.6, n: 412, tags: ['orcs', 'comedy', 'IF Comp 2007'], time: 120 },
  advent: { ifids: [], title: 'Adventure', author: 'Will Crowther and Don Woods', firstpublished: '1977', genre: 'Cave crawl', language: 'en', description: 'The original interactive fiction: explore Colossal Cave, collect treasures and avoid the dwarves.', rating: 3.9, n: 180, tags: ['cave', 'classic'], time: 300 },
  zork: { ifids: ['ZCODE-88-840726'], title: 'Zork I: The Great Underground Empire', author: 'Marc Blank and Dave Lebling', firstpublished: '1980', genre: 'Fantasy', language: 'en', description: 'The Great Underground Empire awaits. Find the nineteen treasures of Zork.', rating: 4.1, n: 600, tags: ['Infocom', 'treasure hunt'], time: 600 },
}
const json = (res, obj) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
const view = (k) => {
  const g = games[k]
  return { identification: { ifids: g.ifids, format: 'zcode' }, bibliographic: { title: g.title, author: g.author, language: g.language, firstpublished: g.firstpublished, genre: g.genre, description: g.description }, ifdb: { tuid: k, link: `https://ifdb.org/viewgame?id=${k}`, coverart: { url: `${base}/coverart?id=${k}` }, averageRating: g.rating, starRating: Math.round(g.rating * 2) / 2, ratingCountTot: g.n, playTimeInMinutes: g.time, tags: g.tags.map((name, i) => ({ name, tagcnt: 10 - i })) } }
}
http.createServer((req, res) => {
  const u = new URL(req.url, base)
  const q = u.search
  console.log('[ifdb]', req.url, req.headers['user-agent'])
  if (u.pathname === '/viewgame') {
    const ifid = u.searchParams.get('ifid'), id = u.searchParams.get('id')
    const k = id || Object.keys(games).find(k => games[k].ifids.includes(ifid))
    if (k && games[k]) return json(res, view(k))
    return json(res, { error: 'notFound' })
  }
  if (u.pathname === '/search') {
    const s = (u.searchParams.get('searchfor') || '').toLowerCase()
    const hits = Object.entries(games).filter(([k, g]) => g.title.toLowerCase().includes(s) || k.includes(s) || s.includes(k))
    return json(res, { games: hits.map(([k, g]) => ({ tuid: k, title: g.title, author: g.author, published: { printable: g.firstpublished }, starRating: g.rating, coverArtLink: `${base}/coverart?id=${k}` })) })
  }
  if (u.pathname === '/coverart') {
    res.writeHead(200, { 'content-type': 'image/png' })
    return res.end(fs.readFileSync(new URL('../build/icon.png', import.meta.url)))
  }
  res.writeHead(404); res.end()
}).listen(PORT, () => console.log('mock ifdb on', base))
