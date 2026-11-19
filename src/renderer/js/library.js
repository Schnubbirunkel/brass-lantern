// Library screen: games from the user's folders, enriched with IFDB data.
import { t as T, setLang, getLang, locale } from './i18n.js'

const api = window.lantern

function h(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined && text !== null) e.textContent = text
  return e
}

function plainText(html) {
  if (!html) return ''
  const withBreaks = String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*/gi, '\n\n').replace(/<p[^>]*>/gi, '')
  const doc = new DOMParser().parseFromString(`<body>${withBreaks}</body>`, 'text/html')
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}

function year(item) {
  const p = item.ifdb && item.ifdb.published
  const m = p && String(p).match(/\d{4}/)
  return m ? m[0] : null
}

function stars(n) {
  if (!n) return ''
  const full = Math.floor(n)
  const half = n - full >= 0.5
  return '★'.repeat(full) + (half ? '⯪' : '') + '☆'.repeat(5 - full - (half ? 1 : 0))
}

function relDate(t) {
  if (!t) return null
  const days = Math.floor((Date.now() - t) / 86400000)
  if (days <= 0) return T('heute')
  if (days === 1) return T('gestern')
  if (days < 30) return T('vor {n} Tagen', { n: days })
  return new Date(t).toLocaleDateString(locale())
}

function initial(title) {
  return (title || '?').replace(/^(the|a|an|der|die|das)\s+/i, '').trim().charAt(0).toUpperCase() || '?'
}

export class LibraryView {
  constructor(opts) {
    this.opts = opts // {play(path), toast(msg), getSettings(), setSettings(patch), openDialog(title, body), closeDialog()}
    this.items = []
    this.selected = null
    this.query = ''
    this.list = document.getElementById('lib-list')
    this.detail = document.getElementById('lib-detail')
    this.status = document.getElementById('lib-status')
    this.syncInfo = { active: false, pending: 0 }
    const search = document.getElementById('lib-search')
    search.addEventListener('input', () => { this.query = search.value; this.renderList() })
    search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); this.list.focus(); if (e.key === 'Enter' && this.visible()[0]) this.select(this.visible()[0].key) }
    })
    const sort = document.getElementById('lib-sort')
    sort.addEventListener('change', () => { this.opts.setSettings({ librarySort: sort.value }); this.renderList() })
    this.sortEl = sort
    document.getElementById('lib-rescan').addEventListener('click', () => this.refresh(true))
    document.getElementById('lib-folders').addEventListener('click', () => this.showFolders())
    this.list.tabIndex = 0
    this.list.addEventListener('keydown', (e) => this.onKey(e))
    api.on('library:changed', (ev) => this.onChanged(ev))
  }

  // ---------- data ----------

  async refresh(forceSync = false) {
    this.setStatus(T('Ordner werden eingelesen …'))
    if (forceSync) await api.syncLibrary()
    this.items = await api.library()
    if (!this.items.some(i => i.key === this.selected)) this.selected = null
    this.renderList()
    this.renderDetail()
    this.updateStatus()
  }

  onChanged(ev) {
    if (ev.kind === 'scan') this.setStatus(T('Lese Spiele ein … {done}/{total}', { done: ev.done, total: ev.total }))
    if (ev.kind === 'sync') { this.syncInfo = ev; this.updateStatus() }
    if (ev.kind === 'entry') {
      this.syncInfo.pending = ev.pending ?? this.syncInfo.pending
      this.updateStatus()
      clearTimeout(this.reloadTimer)
      this.reloadTimer = setTimeout(async () => {
        if (document.getElementById('library').classList.contains('hidden')) return
        this.items = await api.library()
        this.renderList()
        this.renderDetail()
        this.updateStatus()
      }, 700)
    }
  }

  setStatus(text) { this.status.textContent = text }

  updateStatus() {
    const n = this.items.filter(i => !i.missing).length
    let t = n === 1 ? T('1 Spiel') : T('{n} Spiele', { n })
    if (this.syncInfo.active) t += T(' · IFDB-Abgleich …') + (this.syncInfo.pending ? ' ' + T('noch {n}', { n: this.syncInfo.pending }) : '')
    this.setStatus(t)
  }

  visible() {
    const q = this.query.trim().toLowerCase()
    let list = this.items.slice()
    if (q) {
      list = list.filter(i => [i.title, i.author, i.file, i.format, i.ifdb && i.ifdb.genre, ...(i.ifdb && i.ifdb.tags || [])].filter(Boolean).some(x => String(x).toLowerCase().includes(q)))
    }
    const sort = this.opts.getSettings().librarySort || 'title'
    const key = (s) => String(s || '').replace(/^(the|a|an|der|die|das)\s+/i, '').toLowerCase()
    const cmp = {
      title: (a, b) => key(a.title).localeCompare(key(b.title), 'de'),
      author: (a, b) => key(a.author || '~').localeCompare(key(b.author || '~'), 'de') || key(a.title).localeCompare(key(b.title), 'de'),
      played: (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || key(a.title).localeCompare(key(b.title), 'de'),
      rating: (a, b) => ((b.ifdb && b.ifdb.rating) || 0) - ((a.ifdb && a.ifdb.rating) || 0),
      year: (a, b) => (year(b) || 0) - (year(a) || 0),
      format: (a, b) => a.format.localeCompare(b.format) || key(a.title).localeCompare(key(b.title), 'de'),
    }[sort]
    return list.sort(cmp)
  }

  // ---------- list ----------

  renderList() {
    const s = this.opts.getSettings()
    this.sortEl.value = s.librarySort || 'title'
    const el = this.list
    el.innerHTML = ''
    const folders = s.libraryFolders || []
    if (!folders.length && !this.items.length) {
      el.appendChild(this.emptyState())
      return
    }
    const vis = this.visible()
    if (!vis.length) {
      const msg = this.items.length ? T('Keine Treffer.') : T('In den Spieleordnern wurden keine Story-Dateien gefunden.')
      el.appendChild(h('div', 'lib-none', msg))
      if (!this.items.length) el.appendChild(this.formatsHint())
      return
    }
    if (!this.selected) this.selected = vis[0].key
    for (const item of vis) el.appendChild(this.row(item))
    const sel = el.querySelector('.lib-row.selected')
    if (sel) sel.scrollIntoView({ block: 'nearest' })
  }

  emptyState() {
    const box = h('div', 'lib-welcome')
    box.appendChild(h('div', 'lib-lantern'))
    box.appendChild(h('h2', '', T('Willkommen bei Brass Lantern')))
    box.appendChild(h('p', '', T('Wähle den Ordner, in dem deine Textadventures liegen. Brass Lantern liest ihn ein und holt Titelbilder, Beschreibungen und Bewertungen von der Interactive Fiction Database (IFDB).')))
    const b = h('button', 'btn primary', T('Spieleordner wählen …'))
    b.addEventListener('click', () => this.addFolder())
    box.appendChild(b)
    box.appendChild(this.formatsHint())
    return box
  }

  formatsHint() {
    return h('p', 'lib-formats', T('Erkannt werden Z-Code (.z3–.z8, .zblorb), Glulx (.ulx, .gblorb), TADS 2/3 (.gam, .t3), Hugo (.hex) und ADRIFT 4 (.taf).'))
  }

  cover(item, cls) {
    const c = h('div', cls)
    if (item.cover) {
      const img = h('img')
      img.src = item.cover
      img.alt = ''
      img.loading = 'lazy'
      img.onerror = () => { img.remove(); c.textContent = initial(item.title) }
      c.appendChild(img)
    } else {
      c.textContent = initial(item.title)
      c.classList.add('placeholder')
    }
    return c
  }

  row(item) {
    const r = h('div', 'lib-row')
    r.dataset.key = item.key
    if (item.key === this.selected) r.classList.add('selected')
    if (item.missing) r.classList.add('missing')
    r.appendChild(this.cover(item, 'lib-thumb'))
    const main = h('div', 'lib-row-main')
    main.appendChild(h('div', 'lib-row-title', item.title))
    const sub = [item.author, year(item)].filter(Boolean).join(' · ')
    main.appendChild(h('div', 'lib-row-sub', sub || item.file))
    r.appendChild(main)
    const side = h('div', 'lib-row-side')
    if (item.ifdb && item.ifdb.stars) {
      const st = h('span', 'lib-stars', stars(item.ifdb.stars))
      st.title = T('IFDB: {r} von 5 ({n} Bewertungen)', { r: Number(item.ifdb.rating || item.ifdb.stars).toFixed(1), n: item.ifdb.ratings || 0 })
      side.appendChild(st)
    }
    const meta = h('div', 'lib-row-meta')
    meta.appendChild(h('span', 'lib-badge', item.missing ? T('fehlt') : item.format))
    if (item.lastPlayed) meta.appendChild(h('span', 'lib-played', relDate(item.lastPlayed)))
    if (item.ifdbStatus === 'pending') meta.appendChild(h('span', 'lib-sync', '…'))
    side.appendChild(meta)
    r.appendChild(side)
    r.addEventListener('click', () => this.select(item.key))
    r.addEventListener('dblclick', () => this.play(item))
    r.addEventListener('contextmenu', (e) => { e.preventDefault(); this.select(item.key) })
    return r
  }

  select(key) {
    this.selected = key
    for (const r of this.list.querySelectorAll('.lib-row')) r.classList.toggle('selected', r.dataset.key === key)
    const sel = this.list.querySelector('.lib-row.selected')
    if (sel) sel.scrollIntoView({ block: 'nearest' })
    this.renderDetail()
  }

  onKey(e) {
    const vis = this.visible()
    const i = vis.findIndex(x => x.key === this.selected)
    if (e.key === 'ArrowDown') { e.preventDefault(); if (vis[i + 1]) this.select(vis[i + 1].key) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) this.select(vis[i - 1].key); else document.getElementById('lib-search').focus() }
    else if (e.key === 'Enter') { e.preventDefault(); if (vis[i]) this.play(vis[i]) }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const s = document.getElementById('lib-search')
      s.focus()
    }
  }

  play(item) {
    if (item.missing) return this.opts.toast(T('Die Datei wurde nicht gefunden.'))
    this.opts.play(item.path)
  }

  // ---------- detail ----------

  renderDetail() {
    const d = this.detail
    d.innerHTML = ''
    const item = this.items.find(i => i.key === this.selected)
    if (!item) {
      d.classList.add('empty')
      return
    }
    d.classList.remove('empty')
    const top = h('div', 'lib-detail-top')
    top.appendChild(this.cover(item, 'lib-cover-big'))
    d.appendChild(top)
    d.appendChild(h('h2', 'lib-detail-title', item.title))
    if (item.author) d.appendChild(h('div', 'lib-detail-author', T('von {author}', { author: item.author })))
    if (item.headline && !/^Version \d/.test(item.headline)) d.appendChild(h('div', 'lib-detail-headline', item.headline))

    const facts = h('div', 'lib-facts')
    const fact = (label, value) => { if (!value) return; const f = h('div', 'lib-fact'); f.append(h('span', 'lib-fact-label', label), h('span', 'lib-fact-value', value)); facts.appendChild(f) }
    const ifdb = item.ifdb
    if (ifdb && ifdb.stars) fact(T('Bewertung'), `${stars(ifdb.stars)}  ${Number(ifdb.rating || ifdb.stars).toFixed(1)} (${ifdb.ratings || 0})`)
    fact(T('Erschienen'), ifdb && ifdb.published)
    fact('Genre', ifdb && ifdb.genre)
    fact(T('Sprache'), ifdb && ifdb.language)
    if (ifdb && ifdb.playTime) fact(T('Spieldauer'), ifdb.playTime >= 90 ? T('ca. {n} Std.', { n: Math.round(ifdb.playTime / 60) }) : T('ca. {n} Min.', { n: ifdb.playTime }))
    fact('Format', item.format)
    fact(T('Gespielt'), relDate(item.lastPlayed))
    d.appendChild(facts)

    const actions = h('div', 'lib-actions')
    const play = h('button', 'btn primary lib-play', item.lastPlayed ? T('▶ Weiterspielen') : T('▶ Spielen'))
    play.disabled = !!item.missing
    play.addEventListener('click', () => this.play(item))
    actions.appendChild(play)
    if (ifdb && ifdb.link) {
      const link = h('button', 'btn', T('Auf IFDB ansehen'))
      link.addEventListener('click', () => api.openExternal(ifdb.link))
      actions.appendChild(link)
    }
    d.appendChild(actions)

    const desc = plainText(item.description)
    if (desc) {
      const p = h('div', 'lib-desc')
      for (const para of desc.split(/\n\s*\n/)) p.appendChild(h('p', '', para.trim()))
      d.appendChild(p)
    } else {
      const msg = {
        pending: T('Die Beschreibung wird gerade von IFDB geholt …'),
        notfound: T('Dieses Spiel wurde auf IFDB nicht gefunden. Über „IFDB-Eintrag wählen“ kannst du es selbst zuordnen.'),
        error: T('IFDB war nicht erreichbar. Versuche es später mit „Aktualisieren“.'),
        off: T('Der IFDB-Abgleich ist ausgeschaltet (Ordner … → IFDB).'),
      }[item.ifdbStatus] || T('Keine Beschreibung vorhanden.')
      d.appendChild(h('p', 'lib-desc muted', msg))
    }
    if (ifdb && ifdb.tags && ifdb.tags.length) {
      const tags = h('div', 'lib-tags')
      for (const t of ifdb.tags) tags.appendChild(h('span', 'lib-tag', t))
      d.appendChild(tags)
    }

    const foot = h('div', 'lib-detail-foot')
    const src = { found: ifdb && ifdb.title ? T('Daten von IFDB') : null, manual: T('IFDB-Eintrag von dir zugeordnet'), notfound: T('Nicht auf IFDB gefunden'), pending: T('IFDB-Abfrage läuft'), error: T('IFDB nicht erreichbar'), off: T('IFDB-Abgleich aus') }[item.ifdbStatus]
    if (src) foot.appendChild(h('div', 'lib-source', src + (ifdb && item.ifdbStatus === 'found' && item.ifdbVia === 'title' ? T(' (über den Titel)') : '')))
    const path = h('div', 'lib-path', item.path)
    path.title = item.path
    foot.appendChild(path)
    const small = h('div', 'lib-small-actions')
    const mk = (label, fn) => { const b = h('button', 'lib-link', label); b.addEventListener('click', fn); small.appendChild(b) }
    if (!item.missing) mk(T('Im Ordner zeigen'), () => api.reveal(item.path))
    if (!item.missing) mk(T('IFDB-Eintrag wählen …'), () => this.chooseIfdb(item))
    if (item.ifdbStatus === 'manual') mk(T('Zuordnung zurücksetzen'), async () => { await api.ifdbReset(item.hash); this.refresh() })
    if (!item.inFolder) mk(T('Aus der Liste entfernen'), async () => { await api.removeFromLibrary(item.path); this.refresh() })
    foot.appendChild(small)
    d.appendChild(foot)
  }

  // ---------- dialogs ----------

  chooseIfdb(item) {
    const body = h('div', 'ifdb-pick')
    const form = h('div', 'form-row')
    const input = h('input', 'lib-search')
    input.type = 'search'
    input.value = (item.ifdb && item.ifdb.title) || item.title.replace(/[_.-]+/g, ' ')
    const go = h('button', 'btn primary', T('Suchen'))
    form.append(input, go)
    body.appendChild(form)
    const results = h('div', 'ifdb-results')
    body.appendChild(results)
    const search = async () => {
      results.innerHTML = ''
      results.appendChild(h('div', 'lib-none', T('Suche auf IFDB …')))
      const r = await api.ifdbSearch(input.value)
      results.innerHTML = ''
      if (r.error) return results.appendChild(h('div', 'lib-none', `Fehler: ${r.error}`))
      if (!r.results.length) return results.appendChild(h('div', 'lib-none', T('Keine Treffer.')))
      for (const g of r.results) {
        const row = h('button', 'ifdb-result')
        const c = h('div', 'lib-thumb' + (g.cover ? '' : ' placeholder'))
        if (g.cover) { const img = h('img'); img.src = g.cover; c.appendChild(img) } else c.textContent = initial(g.title)
        const t = h('div', 'lib-row-main')
        t.append(h('div', 'lib-row-title', g.title), h('div', 'lib-row-sub', [g.author, g.year].filter(Boolean).join(' · ')))
        row.append(c, t)
        if (g.rating) row.appendChild(h('span', 'lib-stars', stars(g.rating)))
        row.addEventListener('click', async () => {
          row.disabled = true
          const res = await api.ifdbSet(item.hash, g.tuid)
          if (res.error) return this.opts.toast(`IFDB: ${res.error}`)
          this.opts.closeDialog()
          this.opts.toast(T('„{a}“ wurde „{b}“ zugeordnet.', { a: item.title, b: g.title }))
          this.refresh()
        })
        results.appendChild(row)
      }
    }
    go.addEventListener('click', search)
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') search() })
    this.opts.openDialog(T('IFDB-Eintrag wählen'), body)
    input.focus()
    search()
  }

  async addFolder() {
    const s = await api.addFolder()
    this.opts.applySettings(s)
    await this.refresh()
  }

  showFolders() {
    const body = h('div')
    const render = () => {
      const s = this.opts.getSettings()
      body.innerHTML = ''
      body.appendChild(h('h3', '', T('Spieleordner')))
      const list = h('div', 'folder-list')
      const folders = s.libraryFolders || []
      if (!folders.length) list.appendChild(h('div', 'lib-none', T('Noch kein Ordner gewählt.')))
      for (const f of folders) {
        const row = h('div', 'folder-row')
        row.appendChild(h('span', 'folder-path', f))
        const rm = h('button', 'btn', T('Entfernen'))
        rm.addEventListener('click', async () => { this.opts.applySettings(await api.removeFolder(f)); render(); this.refresh() })
        row.appendChild(rm)
        list.appendChild(row)
      }
      body.appendChild(list)
      const add = h('button', 'btn primary', T('Ordner hinzufügen …'))
      add.addEventListener('click', async () => { await this.addFolder(); render() })
      body.appendChild(add)
      const opt = (label, key, hint) => {
        const r = h('div', 'form-row')
        const c = h('input')
        c.type = 'checkbox'
        c.checked = s[key] !== false
        c.addEventListener('change', async () => { await this.opts.setSettings({ [key]: c.checked }); this.refresh() })
        r.append(h('label', 'lbl', label), c)
        body.appendChild(r)
        if (hint) body.appendChild(h('div', 'form-hint', hint))
      }
      body.appendChild(h('h3', '', T('Optionen')))
      opt(T('Unterordner einbeziehen'), 'libraryRecursive')
      opt(T('Mit IFDB abgleichen'), 'ifdbSync', T('Holt Titelbild, Beschreibung, Genre und Bewertung von ifdb.org. Dabei werden die IFIDs (bzw. Prüfsummen und Titel) deiner Spiele an IFDB gesendet.'))
      const resync = h('button', 'btn', T('Alle IFDB-Daten neu laden'))
      resync.addEventListener('click', () => { this.refresh(true); this.opts.closeDialog() })
      body.appendChild(resync)
    }
    render()
    this.opts.openDialog(T('Bibliothek'), body)
  }
}
