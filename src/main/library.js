'use strict'
// Game library: scans the user's game folders, caches story metadata and syncs with IFDB.

const fs = require('fs')
const path = require('path')
const formats = require('./formats')

const SCAN_EXTENSIONS = new Set(formats.EXTENSIONS.filter(e => e !== 'dat'))
const MAX_FILES = 5000
const MAX_DEPTH = 8
const IFDB_BASE = process.env.LANTERN_IFDB_BASE || 'https://ifdb.org'
const USER_AGENT = 'BrassLantern/1.1 (interactive fiction interpreter; +https://ifdb.org/api)'
const RETRY_NOT_FOUND = 14 * 24 * 3600 * 1000

class Library {
  constructor(store, fetchFn) {
    this.store = store
    this.fetch = fetchFn
    this.index = store.read('scan-index.json', {}) // path -> {size, mtimeMs, hash, engine, meta, ifids}
    this.ifdb = store.read('ifdb-cache.json', {}) // hash -> {status, fetched, data, cover, query}
    this.syncing = false
    this.syncQueue = []
    this.listeners = new Set()
    this.coverDir = path.join(store.dir, 'covers')
    fs.mkdirSync(this.coverDir, { recursive: true })
  }

  onChange(fn) { this.listeners.add(fn) }
  emit(what) { for (const fn of this.listeners) fn(what) }

  saveIndex() { this.store.write('scan-index.json', this.index) }
  saveIfdb() { this.store.write('ifdb-cache.json', this.ifdb) }

  // ---------- scanning ----------

  listFiles(folders, recursive) {
    const files = []
    const walk = (dir, depth) => {
      if (files.length >= MAX_FILES || depth > MAX_DEPTH) return
      let entries
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue
        const p = path.join(dir, e.name)
        if (e.isDirectory()) {
          if (recursive && e.name !== 'node_modules' && !e.name.endsWith('.app')) walk(p, depth + 1)
        } else if (e.isFile() || e.isSymbolicLink()) {
          const ext = path.extname(e.name).slice(1).toLowerCase()
          if (SCAN_EXTENSIONS.has(ext)) files.push(p)
        }
      }
    }
    for (const f of folders) walk(f, 0)
    return files
  }

  entryFor(filePath) {
    let st
    try { st = fs.statSync(filePath) } catch { return null }
    const cached = this.index[filePath]
    if (cached && cached.size === st.size && cached.mtimeMs === st.mtimeMs) return cached
    let info
    try { info = formats.inspect(filePath) } catch { return null }
    if (!info.engine) return null
    let cover = null
    if (info.meta.cover) {
      const ext = info.meta.cover.mime === 'image/png' ? 'png' : 'jpg'
      cover = `${info.hash}-blorb.${ext}`
      const f = path.join(this.coverDir, cover)
      try { if (!fs.existsSync(f)) fs.writeFileSync(f, info.meta.cover.data) } catch { cover = null }
    }
    const entry = {
      path: filePath,
      size: st.size,
      mtimeMs: st.mtimeMs,
      hash: info.hash,
      engine: info.engine,
      format: formats.ENGINES[info.engine].format,
      title: info.meta.title,
      author: info.meta.author,
      headline: info.meta.headline,
      description: info.meta.description,
      ifids: info.ifids,
      titleFromFile: !info.meta.author && info.meta.title === path.basename(filePath).replace(/\.[^.]+$/, ''),
      cover,
    }
    this.index[filePath] = entry
    return entry
  }

  async scan(folders, recursive, extraPaths = []) {
    const files = new Set(this.listFiles(folders, recursive))
    for (const p of extraPaths) files.add(p)
    const out = []
    const seenHash = new Set()
    let n = 0
    for (const f of files) {
      if (++n % 25 === 0) {
        this.emit({ kind: 'scan', done: n, total: files.size })
        await new Promise(r => setImmediate(r))
      }
      const e = this.entryFor(f)
      if (!e) continue
      if (seenHash.has(e.hash)) continue // the same story twice
      seenHash.add(e.hash)
      out.push(e)
    }
    // Forget index entries for files that are gone
    for (const p of Object.keys(this.index)) if (!files.has(p)) delete this.index[p]
    this.saveIndex()
    return out
  }

  // ---------- IFDB ----------

  ifdbFor(hash) {
    return this.ifdb[hash] || null
  }

  needsSync(entry) {
    const c = this.ifdb[entry.hash]
    if (!c) return true
    if (c.status === 'manual' || c.status === 'found') return false
    return Date.now() - (c.fetched || 0) > RETRY_NOT_FOUND
  }

  queueSync(entries, force = false) {
    for (const e of entries) {
      if ((force || this.needsSync(e)) && !this.syncQueue.some(q => q.hash === e.hash)) this.syncQueue.push(e)
    }
    this.runQueue()
  }

  async runQueue() {
    if (this.syncing) return
    this.syncing = true
    this.emit({ kind: 'sync', active: true, pending: this.syncQueue.length })
    while (this.syncQueue.length) {
      const e = this.syncQueue.shift()
      try {
        await this.syncOne(e)
      } catch (err) {
        this.ifdb[e.hash] = { status: 'error', fetched: Date.now(), error: String(err.message || err) }
      }
      this.saveIfdb()
      this.emit({ kind: 'entry', hash: e.hash, pending: this.syncQueue.length })
      await new Promise(r => setTimeout(r, 350)) // be gentle with IFDB
    }
    this.syncing = false
    this.emit({ kind: 'sync', active: false, pending: 0 })
  }

  async getJson(url) {
    const res = await this.fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`IFDB antwortet mit HTTP ${res.status}`)
    const data = await res.json()
    if (data && data.error) return null
    return data
  }

  async fetchGame(param) {
    return this.getJson(`${IFDB_BASE}/viewgame?json&${param}`)
  }

  async searchGames(query) {
    if (!query || !query.trim()) return []
    const data = await this.getJson(`${IFDB_BASE}/search?json&game&searchfor=${encodeURIComponent(query.trim()).replace(/%20/g, '+')}`)
    return (data && data.games) || []
  }

  async syncOne(e) {
    let game = null
    let via = null
    for (const ifid of e.ifids || []) {
      game = await this.fetchGame(`ifid=${encodeURIComponent(ifid)}`)
      if (game && game.bibliographic) { via = 'ifid'; break }
      game = null
    }
    if (!game) {
      // Fall back to a title search, but only accept a convincing match
      const query = cleanTitle(e.title)
      const results = query.length >= 3 ? await this.searchGames(query) : []
      const best = results.find(r => similar(r.title, query) && (!e.author || !r.author || similar(r.author, e.author, 0.5)))
      if (best) {
        game = await this.fetchGame(`id=${encodeURIComponent(best.tuid)}`)
        if (game && game.bibliographic) via = 'title'
        else game = null
      }
    }
    if (!game) {
      this.ifdb[e.hash] = { status: 'notfound', fetched: Date.now() }
      return
    }
    await this.storeGame(e.hash, game, via)
  }

  async setManual(hash, tuid) {
    const game = await this.fetchGame(`id=${encodeURIComponent(tuid)}`)
    if (!game || !game.bibliographic) throw new Error('Eintrag nicht gefunden')
    await this.storeGame(hash, game, 'manual')
    this.saveIfdb()
    this.emit({ kind: 'entry', hash })
  }

  clearManual(hash) {
    delete this.ifdb[hash]
    this.saveIfdb()
  }

  async storeGame(hash, game, via) {
    const ifdb = game.ifdb || {}
    const bib = game.bibliographic || {}
    let cover = null
    const coverUrl = ifdb.coverart && ifdb.coverart.url
    if (coverUrl) {
      try {
        const res = await this.fetch(`${coverUrl}${coverUrl.includes('?') ? '&' : '?'}thumbnail=600x600`, { headers: { 'User-Agent': USER_AGENT } })
        if (res.ok) {
          const type = res.headers.get('content-type') || ''
          const ext = type.includes('png') ? 'png' : type.includes('gif') ? 'gif' : type.includes('webp') ? 'webp' : 'jpg'
          cover = `${hash}-ifdb.${ext}`
          fs.writeFileSync(path.join(this.coverDir, cover), Buffer.from(await res.arrayBuffer()))
        }
      } catch { cover = null }
    }
    this.ifdb[hash] = {
      status: via === 'manual' ? 'manual' : 'found',
      via,
      fetched: Date.now(),
      cover,
      data: {
        tuid: ifdb.tuid,
        link: ifdb.link,
        title: bib.title,
        author: bib.author,
        language: bib.language,
        published: bib.firstpublished,
        genre: bib.genre,
        description: bib.description,
        rating: ifdb.averageRating,
        stars: ifdb.starRating,
        ratings: ifdb.ratingCountTot,
        playTime: ifdb.playTimeInMinutes,
        tags: (ifdb.tags || []).slice().sort((a, b) => (b.tagcnt || 0) - (a.tagcnt || 0)).slice(0, 8).map(t => t.name),
        format: game.identification && game.identification.format,
      },
    }
  }
}

function cleanTitle(t) {
  return String(t || '').replace(/[_.-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/^(the|a|an|der|die|das)\s+/, '').replace(/[^a-z0-9]+/g, '')
}

function similar(a, b, threshold = 0.8) {
  const x = normalize(a), y = normalize(b)
  if (!x || !y) return false
  if (x === y) return true
  if ((x.includes(y) || y.includes(x)) && Math.min(x.length, y.length) / Math.max(x.length, y.length) >= threshold) return true
  // Dice coefficient on bigrams
  const grams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1) } return m }
  const ga = grams(x), gb = grams(y)
  let inter = 0
  for (const [g, n] of ga) inter += Math.min(n, gb.get(g) || 0)
  const total = Math.max(1, x.length - 1 + y.length - 1)
  return (2 * inter) / total >= threshold
}

module.exports = { Library, cleanTitle }
