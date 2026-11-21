// Brass Lantern – renderer entry point
import { t as T, setLang, getLang, locale } from './i18n.js'

import { Display } from './glkote.js'
import { Blorb } from './blorb.js'
import { Automap, parseDirection, commandFor } from './automap.js'
import { MapView } from './mapview.js'
import { THEMES, CRT_THEMES, FONT_CHOICES } from './themes.js'
import { LibraryView } from './library.js'

const api = window.lantern
const $ = (s) => document.querySelector(s)

const state = {
  settings: null,
  game: null,
  display: null,
  blorb: null,
  automap: null,
  mapView: null,
  words: new Map(),
  wordTick: 0,
  history: [],
  travel: null,
  tabCycle: null,
  saveTimer: null,
}

// ---------------------------------------------------------------- utils

function h(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

let toastTimer
function toast(msg, ms = 2600) {
  const t = $('#toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), ms)
}

// ---------------------------------------------------------------- settings

async function updateSettings(patch) {
  state.settings = await api.setSettings(patch)
  applySettings()
}

// ---------------------------------------------------------------- language

const STATIC_TEXT = '#topbar .topnav button, .lib-heading, .lib-toolbar button, #lib-sort option, #gameover span, #gameover button, #fkeys span, #dropzone div'

function translateStatic() {
  for (const el of document.querySelectorAll(STATIC_TEXT)) {
    if (el.dataset.i18n === undefined) el.dataset.i18n = el.innerHTML.trim()
    el.innerHTML = T(el.dataset.i18n)
  }
  for (const el of document.querySelectorAll('#app [title], #app [placeholder]')) {
    if (el.title) {
      if (el.dataset.i18nTitle === undefined) el.dataset.i18nTitle = el.title
      el.title = T(el.dataset.i18nTitle)
    }
    if (el.placeholder) {
      if (el.dataset.i18nPh === undefined) el.dataset.i18nPh = el.placeholder
      el.placeholder = T(el.dataset.i18nPh)
    }
  }
  document.documentElement.lang = getLang()
}

function registerThemes() {
  return api.registerThemes(THEMES.map(x => ({ id: x.id, name: T(x.name) })))
}

let appliedLang = null
function applyLanguage() {
  const lang = state.settings.uiLanguage === 'de' ? 'de' : 'en'
  if (lang === appliedLang) return
  const first = appliedLang === null
  appliedLang = lang
  setLang(lang)
  translateStatic()
  if (first) return
  registerThemes()
  if (state.mapView) { state.mapView.rebuild(); if (state.game) state.mapView.setTitle(state.game.title); state.mapView.render(); state.mapView.center(false) }
  if (libraryView) { libraryView.renderList(); libraryView.renderDetail(); libraryView.updateStatus() }
}

function applySettings() {
  applyLanguage()
  const scrollSnap = state.display ? state.display.captureScroll() : null
  const s = state.settings
  const b = document.body
  b.dataset.theme = s.theme
  b.classList.toggle('crt', !!s.crt)
  b.classList.toggle('no-autocomplete', !s.autocomplete)
  b.classList.toggle('map-hidden', !s.mapVisible)
  b.classList.toggle('map-left', s.mapSide === 'left')
  b.classList.toggle('port-unlimited', !s.lineWidth)
  const st = b.style
  st.setProperty('--map-width', `${s.mapWidth}px`)
  if (s.lineWidth) st.setProperty('--port-maxwidth', `calc(${s.lineWidth}em + 2 * var(--buf-pad-x))`)
  if (s.fontSize) st.setProperty('--font-size', `${s.fontSize}px`)
  else st.removeProperty('--font-size')
  if (s.fontFamily) st.setProperty('--font-body', s.fontFamily)
  else st.removeProperty('--font-body')
  if (s.lineHeight) st.setProperty('--line-height', String(s.lineHeight))
  else st.removeProperty('--line-height')
  // The line width is measured in em of the body font size
  const port = $('#play-frame')
  port.style.fontSize = 'var(--font-size)'
  if (state.display) {
    requestAnimationFrame(() => state.display && state.display.restoreScroll(scrollSnap))
    state.display.scheduleArrange()
  }
  if (state.mapView) requestAnimationFrame(() => state.mapView.render())
}

function themeFontSize() {
  const v = getComputedStyle(document.body).getPropertyValue('--font-size')
  return parseFloat(v) || 16
}

// ---------------------------------------------------------------- library

let libraryView = null

async function showLibrary() {
  document.body.classList.remove('in-game')
  $('#game').classList.add('hidden')
  $('#library').classList.remove('hidden')
  $('#topbar-game').textContent = ''
  if (!libraryView) {
    libraryView = new LibraryView({
      play: (p) => openStory(p),
      toast,
      getSettings: () => state.settings,
      setSettings: (patch) => updateSettings(patch),
      applySettings: (s) => { state.settings = s; applySettings() },
      openDialog,
      closeDialog,
    })
  }
  await libraryView.refresh()
  $('#lib-list').focus()
}

async function chooseStory() {
  const p = await api.openDialog()
  if (p) openStory(p)
}

// ---------------------------------------------------------------- game

async function openStory(path) {
  if (state.game && state.display && !state.display.disabled) {
    if (state.game.path !== path) {
      const ok = await api.confirm({ message: T('Laufendes Spiel beenden?'), detail: T('Nicht gespeicherter Fortschritt geht verloren.'), ok: T('Beenden und öffnen') })
      if (!ok) return
    }
  }
  const res = await api.startGame(path)
  if (res.error) {
    toast(res.error, 6000)
    return
  }
  await setupGame(res.game)
}

async function setupGame(game) {
  teardownGame()
  engineLog.length = 0
  state.reportedFailure = false
  state.game = game
  document.body.classList.add('in-game')
  $('#library').classList.add('hidden')
  $('#game').classList.remove('hidden')
  $('#gameover').classList.add('hidden')
  $('#topbar-game').textContent = `${game.title}${game.author ? ' · ' + game.author : ''} — ${game.format} (${game.engineLabel})`
  $('#frame-label').textContent = game.title

  state.blorb = null
  if (game.hasBlorb) {
    const bytes = await api.readStory()
    if (bytes) state.blorb = new Blorb(new Uint8Array(bytes))
  }

  // History and words per game
  try { state.history = JSON.parse(localStorage.getItem(`history:${game.hash}`) || '[]') } catch { state.history = [] }
  state.words = new Map()

  // Every new game starts with an empty map; saves carry their own map (see fileref below).
  // Room notes are kept per game by room name, so they survive restarts.
  state.automap = new Automap(null, () => state.settings)
  state.automap.notesByName = (await api.loadMap(`${game.hash}-notes`)) || {}
  state.pendingRestore = undefined
  // Title screens often put the game's name in the status line or a heading
  state.automap.ignoreNames = new Set([game.title].filter(Boolean).map(t => t.trim().toLowerCase().replace(/\s+/g, ' ')))
  state.automap.onChange((kind) => {
    scheduleMapSave()
    state.mapView.render({ center: kind === 'move' })
  })
  if (!state.mapView) {
    state.mapView = new MapView($('#mappanel'), {
      map: () => state.automap,
      travel: (id) => travelTo(id),
      go: (cmd) => typeCommand(cmd),
      onHide: () => toggleMap(false),
      getSettings: () => state.settings,
    })
  }
  state.mapView.selected = null
  state.mapView.setTitle(game.title)
  state.mapView.render()
  requestAnimationFrame(() => state.mapView.center(false))

  const port = $('#gameport')
  port.innerHTML = ''
  state.display = new Display(port, {
    send: (ev) => api.sendEvent(ev),
    onTurn: (turn) => onTurn(turn),
    onDisable: () => gameOver(),
    onError: (msg) => toast(T('Fehler: {msg}', { msg }), 6000),
    fileref: (spec) => fileref(spec),
    blorb: () => state.blorb,
    getSettings: () => state.settings,
    wordSink: (text) => collectWords(text),
    onMeta: (text) => metaCommand(text),
    onTab: (input, back) => tabComplete(input, back),
    onTyping: (input) => suggest(input),
    onLineKey: (e, input) => lineKey(e, input),
    onSubmit: () => { clearSuggest(); state.tabCycle = null },
    history: {
      push: (cmd) => {
        if (state.history[state.history.length - 1] !== cmd) state.history.push(cmd)
        if (state.history.length > 300) state.history.shift()
        try { localStorage.setItem(`history:${state.game.hash}`, JSON.stringify(state.history)) } catch {}
      },
      list: () => state.history,
    },
  })
  // Wait for fonts so the metrics are right
  await document.fonts.ready
  state.display.start()
}

function teardownGame() {
  if (state.display) state.display.destroy()
  state.display = null
  if (state.blorb) state.blorb.dispose()
  state.blorb = null
  state.travel = null
  flushMapSave()
  clearSuggest()
}

const engineLog = []
api.on('game:log', (text) => {
  engineLog.push(String(text))
  if (engineLog.length > 8) engineLog.shift()
})

// A game that stops before showing any text has failed to start: say why
function reportSilentFailure(extra) {
  if (!state.display || state.display.transcriptText().trim() || state.reportedFailure) return
  state.reportedFailure = true
  const detail = extra || engineLog.filter(Boolean).slice(-3).join(' · ')
  toast(T('Die Story-Datei konnte nicht gestartet werden.') + (detail ? ' ' + detail.slice(0, 300) : ''), 10000)
}

function gameOver() {
  reportSilentFailure()
  $('#gameover').classList.remove('hidden')
  state.travel = null
}

api.on('game:update', (data) => {
  if (state.display) state.display.update(data)
})

api.on('game:exit', (info) => {
  if (info && info.error && state.display && !state.display.transcriptText().trim()) reportSilentFailure(info.error.split('\n').filter(Boolean).slice(-3).join(' · '))
  else if (info && info.error) toast(T('Der Interpreter wurde beendet: {msg}', { msg: info.error.split('\n').filter(Boolean).slice(-3).join(' · ').slice(0, 300) }), 9000)
  if (state.display && !state.display.disabled) {
    state.display.disabled = true
    gameOver()
  }
})

async function restartGame() {
  if (!state.game) return
  const ok = !state.display || state.display.disabled || await api.confirm({ message: T('Spiel neu starten?'), detail: T('Nicht gespeicherter Fortschritt geht verloren. Die Karte bleibt erhalten.'), ok: T('Neu starten') })
  if (!ok) return
  const res = await api.startGame(state.game.path)
  if (res.error) return toast(res.error, 6000)
  await setupGame(res.game)
}

function typeCommand(cmd) {
  if (!state.display) return
  if (!state.display.typeCommand(cmd)) toast(T('Das Spiel wartet gerade nicht auf einen Befehl.'))
}

// ---------------------------------------------------------------- automap glue

function onTurn(turn) {
  const map = state.automap
  const restore = state.pendingRestore
  if (restore && map) {
    state.pendingRestore = undefined
    const text = turn.paragraphs.map(p => p.text).join(' ')
    const failed = /\b(failed|fail|fehlgeschlagen|nicht geladen|can't|cannot|unable)\b/i.test(text)
    if (!failed) {
      if (restore.map) map.replace(restore.map)
      else toast(T('Zu diesem Spielstand ist keine Karte gespeichert – die Karte wird ab hier weitergezeichnet.'), 4500)
    }
  }
  if (map) map.observe(turn)
  // Travel progress
  const t = state.travel
  if (t && turn.lineInput) {
    const step = t.steps[t.index]
    const cur = map.current
    if (step) {
      if (!cur || cur.id !== step.to) {
        state.display.cancelAutoCommands()
        state.travel = null
        toast(T('Weg unterbrochen – die Karte stimmt hier nicht mit dem Spiel überein.'), 4000)
      } else {
        t.index++
        if (t.index >= t.steps.length) {
          state.travel = null
          state.display.cancelAutoCommands()
        }
      }
    }
  }
}

function travelTo(id) {
  const map = state.automap
  if (!map || !state.display) return
  const cur = map.current
  const target = map.room(id)
  if (!target) return
  if (!cur) return toast(T('Aktueller Raum unbekannt.'))
  if (cur.id === id) return toast(T('Du bist bereits hier: {name}', { name: target.name }))
  const steps = map.route(cur.id, id)
  if (!steps) return toast(T('Kein bekannter Weg nach „{name}“.', { name: target.name }))
  if (!state.display.currentLineInput()) return toast(T('Das Spiel wartet gerade nicht auf einen Befehl.'))
  state.travel = { steps, index: 0 }
  toast(T('Weg nach „{name}“: {steps}', { name: target.name, steps: steps.map(s => s.cmd).join(', ') }))
  state.display.queueCommands(steps.map(s => s.cmd))
}

function scheduleMapSave() {
  clearTimeout(state.saveTimer)
  state.saveTimer = setTimeout(flushMapSave, 600)
}

function flushMapSave() {
  clearTimeout(state.saveTimer)
  state.saveTimer = null
  if (state.game && state.automap && state.automap.notesByName) api.saveMap(`${state.game.hash}-notes`, state.automap.notesByName)
}

// File prompts from the game: tie the map to save files
async function fileref(spec) {
  const p = await api.fileref(spec)
  if (!p || spec.filetype !== 'save' || !state.automap) return p
  if (spec.filemode === 'read') {
    // Applied on the next turn, once the game has restored
    state.pendingRestore = { path: p, map: await api.readSaveMap(p) }
  } else {
    await api.writeSaveMap(p, state.automap.snapshot())
  }
  return p
}

async function toggleMap(force) {
  const visible = force === undefined ? !state.settings.mapVisible : force
  await updateSettings({ mapVisible: visible })
  if (visible && state.mapView) requestAnimationFrame(() => state.mapView.center(false))
  if (state.display) state.display.focusInput()
}

async function exportMap() {
  if (!state.mapView || !state.automap) return
  const svg = state.mapView.exportSVG()
  if (!svg) return toast(T('Die Karte ist noch leer.'))
  const ok = await api.saveText({ title: T('Karte exportieren'), name: `${state.game ? state.game.title : T('Karte')} – Karte.svg`, filters: [{ name: 'SVG', extensions: ['svg'] }], content: svg })
  if (ok) toast(T('Karte gespeichert.'))
}

async function clearMap() {
  if (!state.automap) return
  const ok = await api.confirm({ message: T('Karte zurücksetzen?'), detail: T('Alle Räume und Verbindungen der aktuellen Karte werden gelöscht. Raumnotizen bleiben erhalten.'), ok: T('Zurücksetzen') })
  if (ok) state.automap.clear()
}

// ---------------------------------------------------------------- words, suggestions, meta commands

const STOP = new Set(['the', 'and', 'you', 'are', 'there', 'with', 'this', 'that', 'here', 'from', 'your', 'have', 'which', 'into', 'der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'nicht', 'mit', 'auf', 'sie', 'den', 'dem', 'des'])

function collectWords(text) {
  const words = text.toLowerCase().match(/[\p{L}][\p{L}'-]{2,}/gu)
  if (!words) return
  for (const w of words) {
    if (STOP.has(w)) continue
    state.words.set(w, ++state.wordTick)
  }
  if (state.words.size > 4000) {
    const sorted = [...state.words.entries()].sort((a, b) => a[1] - b[1])
    for (const [w] of sorted.slice(0, 1000)) state.words.delete(w)
  }
}

const META_DE = [
  ['/map', T('Karte ein-/ausblenden')],
  ['/goto', T('Zu einem bekannten Raum gehen: /goto Küche')],
  ['/note', T('Notiz zum aktuellen Raum: /note Schlüssel unter der Matte')],
  ['/notes', T('Alle Notizen anzeigen')],
  ['/center', T('Karte auf aktuellen Raum zentrieren')],
  ['/theme', T('Stil wechseln: /theme dos-blue')],
  ['/clearmap', T('Karte zurücksetzen')],
  ['/help', T('Hilfe anzeigen')],
]

function META() { return META_DE.map(([k, v]) => [k, T(v)]) }

function completions(input) {
  const value = input.value
  const caret = input.selectionStart ?? value.length
  const before = value.slice(0, caret)
  if (/^\/(goto|go)\s+/i.test(before)) {
    const q = before.replace(/^\/(goto|go)\s+/i, '').toLowerCase()
    const rooms = state.automap ? state.automap.list().map(r => r.name) : []
    return { kind: 'room', start: before.length - q.length, prefix: q, list: rooms.filter(n => n.toLowerCase().startsWith(q) || (q.length > 1 && n.toLowerCase().includes(q))).slice(0, 8) }
  }
  if (/^\/\S*$/.test(before)) {
    return { kind: 'meta', start: 0, prefix: before, list: META().map(m => m[0]).filter(m => m.startsWith(before.toLowerCase())) }
  }
  const m = before.match(/([\p{L}'-]+)$/u)
  if (!m || m[1].length < 2) return { list: [] }
  const prefix = m[1].toLowerCase()
  const list = [...state.words.entries()].filter(([w]) => w.startsWith(prefix) && w !== prefix).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w)
  return { kind: 'word', start: before.length - m[1].length, prefix, list }
}

function clearSuggest() {
  const s = $('#suggest')
  s.innerHTML = ''
}

function suggest(input) {
  state.tabCycle = null
  const s = $('#suggest')
  s.innerHTML = ''
  if (!state.settings.autocomplete) return
  const c = completions(input)
  if (!c.list || !c.list.length) return
  if (c.kind === 'meta') {
    s.appendChild(h('span', 'sugg-label', T('Befehle:')))
  }
  c.list.forEach((w, i) => {
    const b = h('span', `sugg${i === 0 ? ' first' : ''}`, w)
    if (c.kind === 'meta') b.title = (META().find(m => m[0] === w) || [])[1] || ''
    b.addEventListener('mousedown', (e) => { e.preventDefault(); applyCompletion(input, c, w); input.focus() })
    s.appendChild(b)
  })
  const hint = h('span', 'sugg-label', 'Tab ↹')
  s.appendChild(hint)
}

function applyCompletion(input, c, word) {
  const value = input.value
  const caret = input.selectionStart ?? value.length
  const after = value.slice(caret)
  const add = c.kind === 'room' ? word : `${word} `
  input.value = value.slice(0, c.start) + add + after.replace(/^\S*/, '')
  const pos = c.start + add.length
  input.setSelectionRange(pos, pos)
  suggest(input)
}

function tabComplete(input, back) {
  if (!state.tabCycle) {
    const c = completions(input)
    if (!c.list || !c.list.length) return
    state.tabCycle = { c, index: 0, base: input.value }
  } else {
    const n = state.tabCycle.c.list.length
    state.tabCycle.index = (state.tabCycle.index + (back ? n - 1 : 1)) % n
    input.value = state.tabCycle.base
    input.setSelectionRange(input.value.length, input.value.length)
  }
  const { c, index } = state.tabCycle
  const word = c.list[index]
  const value = input.value
  const add = c.kind === 'room' ? word : `${word} `
  input.value = value.slice(0, c.start) + add
  input.setSelectionRange(input.value.length, input.value.length)
  const cycle = state.tabCycle
  const s = $('#suggest')
  ;[...s.querySelectorAll('.sugg')].forEach((el, i) => el.classList.toggle('first', i === index))
  state.tabCycle = cycle
}

function lineKey(e, input) {
  // Parchmap-style keyboard navigation: Ctrl+Shift+arrows (and optionally the numpad)
  const dirKeys = { ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e', Home: 'nw', PageUp: 'ne', End: 'sw', PageDown: 'se' }
  if (e.ctrlKey && e.shiftKey && dirKeys[e.key]) {
    goDirection(dirKeys[e.key])
    return true
  }
  if (state.settings.numpadNav && !input.value && e.code && e.code.startsWith('Numpad')) {
    const pad = { Numpad8: 'n', Numpad2: 's', Numpad4: 'w', Numpad6: 'e', Numpad7: 'nw', Numpad9: 'ne', Numpad1: 'sw', Numpad3: 'se', NumpadAdd: 'up', NumpadSubtract: 'down', Numpad5: 'look' }
    const d = pad[e.code]
    if (d) {
      if (d === 'look') typeCommand('look')
      else goDirection(d)
      return true
    }
  }
  return false
}

function goDirection(d) {
  const cur = state.automap && state.automap.current
  const ex = cur && cur.exits[d]
  typeCommand(ex && ex.cmd ? ex.cmd : commandFor(d, state.settings.dirLanguage))
}

function metaCommand(text) {
  const [cmd, ...rest] = text.split(/\s+/)
  const arg = rest.join(' ').trim()
  clearSuggest()
  switch (cmd.toLowerCase()) {
    case '/map': toggleMap(); return true
    case '/center': state.mapView && state.mapView.center(true); return true
    case '/help': showHelp(); return true
    case '/theme': {
      const t = THEMES.find(x => x.id === arg || x.name.toLowerCase().includes(arg.toLowerCase()))
      if (t && arg) setTheme(t.id)
      else showStyles()
      return true
    }
    case '/note': {
      const cur = state.automap && state.automap.current
      if (!cur) { toast(T('Kein aktueller Raum.')); return true }
      if (!arg) { state.mapView.select(cur.id); toggleMap(true); return true }
      state.automap.setNotes(cur.id, (cur.notes ? cur.notes.trimEnd() + '\n' : '') + arg)
      state.mapView.render()
      toast(T('Notiz zu „{name}“ gespeichert.', { name: cur.name }))
      return true
    }
    case '/notes': showNotes(); return true
    case '/goto': case '/go': {
      if (!arg) { toast(T('Benutzung: /goto Raumname')); return true }
      const r = state.automap && state.automap.findByName(arg)
      if (!r) { toast(T('Raum „{name}“ ist nicht auf der Karte.', { name: arg })); return true }
      travelTo(r.id)
      return true
    }
    case '/clearmap': clearMap(); return true
  }
  return false
}

// ---------------------------------------------------------------- dialogs

function openDialog(title, body) {
  const d = $('#dialog')
  d.innerHTML = ''
  const head = h('div', 'dlg-head')
  head.appendChild(h('h2', '', title))
  const close = h('button', 'dlg-close', '✕')
  close.title = T('Schließen (Esc)')
  close.addEventListener('click', closeDialog)
  head.appendChild(close)
  const content = h('div', 'dlg-body')
  content.appendChild(body)
  d.append(head, content)
  $('#overlay').classList.remove('hidden')
}

function closeDialog() {
  $('#overlay').classList.add('hidden')
  if (state.display) state.display.focusInput()
}

async function setTheme(id) {
  await updateSettings({ theme: id, crt: CRT_THEMES.has(id) ? true : (CRT_THEMES.has(state.settings.theme) ? false : state.settings.crt) })
}

function themePreview(t) {
  const prev = h('div', 'theme-prev')
  prev.style.background = t.p.bg
  prev.style.color = t.p.fg
  prev.style.fontFamily = t.p.font
  const st = h('div', 'tp-status', T('Westlich vom Haus      Züge: 1'))
  st.style.background = t.p.st
  st.style.color = t.p.stfg
  st.style.fontFamily = t.p.font
  if (t.p.frame) st.style.borderBottom = '1px solid #000'
  const txt = h('div', 'tp-text')
  txt.append(T('Du stehst auf einem Feld westlich eines weißen Hauses.'), h('br'))
  const inp = h('span', 'tp-input', T('>öffne briefkasten'))
  inp.style.color = t.p.in
  txt.appendChild(inp)
  prev.append(st, txt)
  return prev
}

function showStyles() {
  const body = h('div')
  body.appendChild(h('h3', '', T('Stil')))
  const grid = h('div', 'theme-grid')
  for (const t of THEMES) {
    const card = h('button', `theme-card${state.settings.theme === t.id ? ' active' : ''}`)
    card.appendChild(themePreview(t))
    card.appendChild(h('div', 'theme-name', T(t.name)))
    card.appendChild(h('div', 'theme-desc', T(t.desc)))
    card.addEventListener('click', async () => {
      await setTheme(t.id)
      grid.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'))
      card.classList.add('active')
    })
    grid.appendChild(card)
  }
  body.appendChild(grid)
  const more = h('button', 'btn', T('Schrift, Zeilenbreite und weitere Optionen …'))
  more.style.marginTop = '14px'
  more.addEventListener('click', showSettings)
  body.appendChild(more)
  openDialog(T('Stil wählen'), body)
}

function row(label, control, hint) {
  const r = h('div', 'form-row')
  const l = h('label', 'lbl', label)
  r.append(l, control)
  if (!hint) return r
  const wrap = h('div')
  wrap.append(r, h('div', 'form-hint', hint))
  return wrap
}

function select(options, value, onChange) {
  const s = h('select')
  for (const [v, label] of options) {
    const o = h('option', '', label)
    o.value = v
    if (String(v) === String(value)) o.selected = true
    s.appendChild(o)
  }
  s.addEventListener('change', () => onChange(s.value))
  return s
}

function checkbox(value, onChange) {
  const c = h('input')
  c.type = 'checkbox'
  c.checked = !!value
  c.addEventListener('change', () => onChange(c.checked))
  return c
}

function range(min, max, step, value, fmt, onChange) {
  const wrap = h('div', 'form-row')
  wrap.style.flex = '1'
  wrap.style.padding = '0'
  const r = h('input')
  r.type = 'range'
  r.min = min; r.max = max; r.step = step; r.value = value
  const v = h('span', 'val', fmt(value))
  r.addEventListener('input', () => { v.textContent = fmt(+r.value); onChange(+r.value) })
  wrap.append(r, v)
  return wrap
}

function showSettings() {
  const s = state.settings
  const body = h('div')
  body.appendChild(row(T('Language / Sprache'), select([['en', 'English'], ['de', 'Deutsch']], s.uiLanguage || 'en', async (v) => { await updateSettings({ uiLanguage: v }); showSettings() }), T('Ändert Menüs, Dialoge und Bibliothek. Die Sprache der Spiele selbst bleibt unverändert.')))
  body.appendChild(h('h3', '', T('Erscheinungsbild')))
  body.appendChild(row(T('Stil'), select(THEMES.map(x => [x.id, T(x.name)]), s.theme, (v) => setTheme(v))))
  body.appendChild(row(T('Schriftart'), select(FONT_CHOICES.map(f => [f.id, T(f.name)]), s.fontFamily, (v) => updateSettings({ fontFamily: v }))))
  const baseSize = Math.round(themeFontSize())
  body.appendChild(row(T('Schriftgröße'), range(11, 30, 1, s.fontSize || baseSize, (v) => `${v} px`, (v) => updateSettings({ fontSize: v })), T('Strg/⌘ + Plus/Minus ändert die Größe jederzeit, Strg/⌘ + 0 setzt sie zurück.')))
  body.appendChild(row(T('Zeilenabstand'), range(0.9, 2.2, 0.05, s.lineHeight || 0, (v) => (v ? v.toFixed(2) : T('Stil')), (v) => updateSettings({ lineHeight: v < 0.95 ? 0 : v }))))
  body.appendChild(row(T('Textbreite'), range(0, 90, 2, s.lineWidth, (v) => (v ? `${v} em` : T('voll')), (v) => updateSettings({ lineWidth: v })), T('Begrenzt die Breite der Lesespalte. 0 = ganze Fensterbreite.')))
  body.appendChild(row(T('CRT-Effekt'), checkbox(s.crt, (v) => updateSettings({ crt: v })), T('Scanlines, Vignette und Leuchten – funktioniert mit jedem Stil.')))
  body.appendChild(row(T('Spielfarben erlauben'), checkbox(s.gameColors, (v) => updateSettings({ gameColors: v })), T('Wenn das Spiel eigene Farben setzt, werden diese verwendet (wirkt ab dem nächsten Text).')))
  body.appendChild(row(T('Sanftes Scrollen'), checkbox(s.smoothScroll, (v) => updateSettings({ smoothScroll: v }))))
  body.appendChild(row(T('Autovervollständigung'), checkbox(s.autocomplete, (v) => updateSettings({ autocomplete: v })), T('Wörter aus dem Spieltext vorschlagen; Tab vervollständigt.')))

  body.appendChild(h('h3', '', T('Bibliothek')))
  const folders = s.libraryFolders || []
  const fb = h('button', 'btn', T('Spieleordner und IFDB-Abgleich …'))
  fb.addEventListener('click', async () => { closeDialog(); if (await command('library')) libraryView.showFolders() })
  body.appendChild(row(T('Spieleordner'), fb, folders.length ? folders.join(' · ') : T('Noch kein Ordner festgelegt.')))

  body.appendChild(h('h3', '', T('Karte')))
  body.appendChild(row(T('Karte anzeigen'), checkbox(s.mapVisible, (v) => toggleMap(v))))
  body.appendChild(row('Position', select([['right', T('Rechts')], ['left', T('Links')]], s.mapSide, (v) => updateSettings({ mapSide: v }))))
  body.appendChild(row(T('Rückwege annehmen'), checkbox(s.mapTwoWay, (v) => updateSettings({ mapTwoWay: v })), T('Wer nach Norden geht, kommt vermutlich über Süden zurück (gestrichelt, bis begangen).')))
  body.appendChild(row(T('Raumerkennung'), select([['auto', T('Automatisch')], ['status', T('Nur Statuszeile')], ['header', T('Nur fette Raumüberschriften')]], s.mapDetect, (v) => updateSettings({ mapDetect: v }))))
  body.appendChild(row(T('Richtungswörter'), select([['en', T('Englisch (n, s, e, w, u, d …)')], ['de', T('Deutsch (n, s, o, w, no, so, h, r …)')]], s.dirLanguage, (v) => updateSettings({ dirLanguage: v })), T('Bestimmt, wie Abkürzungen verstanden und welche Befehle beim automatischen Laufen gesendet werden.')))
  body.appendChild(row(T('Navigation mit Ziffernblock'), checkbox(s.numpadNav, (v) => updateSettings({ numpadNav: v })), T('Bei leerer Eingabezeile: 8/2/4/6/7/9/1/3 = Himmelsrichtungen, +/− = hoch/runter, 5 = umsehen.')))

  body.appendChild(h('h3', '', 'Interpreter'))
  body.appendChild(row(T('Glulx-Interpreter'), select([['glulxe', T('Glulxe (Referenz)')], ['git', T('Git (schneller)')]], s.glulxEngine, (v) => updateSettings({ glulxEngine: v })), T('Gilt ab dem nächsten Start eines Glulx-Spiels.')))
  openDialog(T('Einstellungen'), body)
}

function showNotes() {
  const body = h('div')
  const rooms = state.automap ? state.automap.list().filter(r => r.notes && r.notes.trim()) : []
  if (!rooms.length) body.appendChild(h('p', 'help-p', T('Noch keine Notizen. Schreibe „/note Text“ in die Eingabezeile oder nutze das Notizfeld unter der Karte.')))
  const t = h('table', 'help-table')
  for (const r of rooms) {
    const tr = h('tr')
    tr.append(h('td', '', r.name), h('td', '', r.notes))
    tr.style.cursor = 'pointer'
    tr.addEventListener('click', () => { closeDialog(); state.mapView.select(r.id); state.mapView.centerOn(r) })
    t.appendChild(tr)
  }
  body.appendChild(t)
  openDialog(T('Notizen'), body)
}

function showHelp() {
  const body = h('div')
  const p = (t) => body.appendChild(h('p', 'help-p', t))
  body.appendChild(h('h3', '', T('Spielen')))
  p(T('Tippe Befehle wie „schau“, „nimm lampe“ oder „norden“ und drücke Enter. Brass Lantern versteht Z-Code, Glulx, TADS 2/3, Hugo und ADRIFT 4 – auch als Blorb mit Bildern.'))
  const t1 = h('table', 'help-table')
  const rows = [
    ['↑ / ↓', T('Frühere Befehle')],
    ['Tab', T('Wort aus dem Spieltext vervollständigen (mehrmals: weiter)')],
    ['Esc', T('Eingabe leeren / Dialog schließen')],
    ['Bild ↑ / Bild ↓', T('Text zurück-/vorblättern')],
    ['Strg + Shift + Pfeiltasten', T('Nord, Süd, West, Ost gehen')],
    ['Strg + Shift + Pos1/Bild↑/Ende/Bild↓', T('NW, NO, SW, SO gehen')],
    ['Strg/⌘ + M', T('Karte ein-/ausblenden')],
    ['Strg/⌘ + S / R', T('Speichern / Laden (auch über die Leiste oben)')],
    ['Strg/⌘ + O', T('Story-Datei öffnen')],
    ['Strg/⌘ + Plus/Minus', T('Schrift größer/kleiner')],
    ['Strg/⌘ + ,', T('Einstellungen')],
  ]
  for (const [k, v] of rows) { const tr = h('tr'); tr.append(h('td', '', k), h('td', '', v)); t1.appendChild(tr) }
  body.appendChild(t1)
  body.appendChild(h('h3', '', T('Befehle von Brass Lantern')))
  const t2 = h('table', 'help-table')
  for (const [k, v] of META()) { const tr = h('tr'); tr.append(h('td', '', k), h('td', '', v)); t2.appendChild(tr) }
  body.appendChild(t2)
  body.appendChild(h('h3', '', T('Die Karte')))
  p(T('Die Karte entsteht automatisch: Brass Lantern liest den Raumnamen aus der Statuszeile bzw. aus der fetten Raumüberschrift und verbindet Räume, wenn du dich mit einer Richtung bewegst. Hoch/Runter wechselt die Ebene, Rein/Raus wird gestrichelt gezeichnet.'))
  p(T('Doppelklick auf einen Raum: automatisch dorthin laufen. Ziehen: Raum verschieben. Rechtsklick: umbenennen, Verbindungen entfernen, löschen. Mausrad/Trackpad verschiebt die Ansicht, mit Strg/⌘ (oder Pinch) wird gezoomt.'))
  p(T('Die Karte gehört zum Spielstand: Ein neues Spiel beginnt mit leerer Karte, beim Speichern wird die Karte mitgesichert und beim Laden genau dieser Stand wiederhergestellt. Raumnotizen bleiben über alle Spielstände hinweg erhalten.'))
  body.appendChild(h('h3', '', T('Spielstände')))
  p(T('„save“ und „restore“ öffnen einen normalen Dateidialog. Standardordner: Dokumente/Brass Lantern/Saves.'))
  openDialog(T('Hilfe'), body)
}

// ---------------------------------------------------------------- commands from menu / toolbar

async function command(cmd, value) {
  switch (cmd) {
    case 'library':
      if (state.game && state.display && !state.display.disabled) {
        const ok = await api.confirm({ message: T('Zur Bibliothek wechseln?'), detail: T('Das laufende Spiel wird beendet. Nicht gespeicherter Fortschritt geht verloren.'), ok: T('Beenden') })
        if (!ok) return false
      }
      teardownGame()
      await api.stopGame()
      state.game = null
      await showLibrary()
      return true
    case 'open': chooseStory(); break
    case 'add-folder':
      if (await command('library') && libraryView) libraryView.addFolder()
      break
    case 'restart': restartGame(); break
    case 'toggle-map': if (state.game) toggleMap(); break
    case 'map-center': state.mapView && state.mapView.center(true); break
    case 'map-level': state.mapView && state.mapView.changeLevel(value); break
    case 'map-export': exportMap(); break
    case 'map-clear': clearMap(); break
    case 'style': showStyles(); break
    case 'settings': showSettings(); break
    case 'help': showHelp(); break
    case 'theme': setTheme(value); break
    case 'crt': updateSettings({ crt: value }); break
    case 'type': typeCommand(value); break
    case 'save': if (state.game) typeCommand('save'); break
    case 'restore': if (state.game) typeCommand('restore'); break
    case 'font': {
      if (value === 0) return updateSettings({ fontSize: 0 })
      const cur = state.settings.fontSize || Math.round(themeFontSize())
      updateSettings({ fontSize: Math.max(10, Math.min(36, cur + value)) })
      break
    }
    case 'transcript': {
      if (!state.display) return
      const ok = await api.saveText({ title: T('Transkript speichern'), name: `${state.game.title} – Transkript.txt`, filters: [{ name: 'Text', extensions: ['txt'] }], content: state.display.transcriptText() })
      if (ok) toast(T('Transkript gespeichert.'))
      break
    }
  }
}

api.on('app:command', ({ cmd, value }) => command(cmd, value))
api.on('app:open-file', (p) => openStory(p))

// ---------------------------------------------------------------- wiring

function wireUi() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd]')
    if (b) command(b.dataset.cmd)
  })
  $('#overlay').addEventListener('mousedown', (e) => { if (e.target.id === 'overlay') closeDialog() })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#overlay').classList.contains('hidden')) { closeDialog(); e.preventDefault(); return }
    const fk = { F2: 'toggle-map', F3: 'style', F4: 'settings', F5: 'open', F6: 'save', F7: 'restore', F10: 'library' }
    if (fk[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); command(fk[e.key]) }
  })
  // Keep focus on the command line when clicking around the story
  $('#gameport').addEventListener('mousedown', (e) => {
    if (e.target.closest('input')) return
    setTimeout(() => { const sel = window.getSelection(); if (state.display && (!sel || sel.isCollapsed)) state.display.focusInput() }, 0)
  })

  // Drag & drop of story files
  let dragDepth = 0
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; document.body.classList.add('dragging') } })
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging') })
  window.addEventListener('dragover', (e) => e.preventDefault())
  window.addEventListener('drop', (e) => {
    e.preventDefault()
    dragDepth = 0
    document.body.classList.remove('dragging')
    const f = e.dataTransfer.files && e.dataTransfer.files[0]
    if (f) {
      const p = api.pathForFile(f)
      if (p) openStory(p)
    }
  })

  // Splitter
  const sp = $('#splitter')
  sp.addEventListener('pointerdown', (e) => {
    sp.setPointerCapture(e.pointerId)
    sp.classList.add('active')
    const startX = e.clientX
    const startW = state.settings.mapWidth
    const left = state.settings.mapSide === 'left'
    const move = (ev) => {
      const dx = ev.clientX - startX
      const w = Math.max(240, Math.min(window.innerWidth * 0.7, startW + (left ? dx : -dx)))
      document.body.style.setProperty('--map-width', `${w}px`)
      state.settings.mapWidth = Math.round(w)
    }
    const up = () => {
      sp.classList.remove('active')
      sp.removeEventListener('pointermove', move)
      sp.removeEventListener('pointerup', up)
      updateSettings({ mapWidth: state.settings.mapWidth })
    }
    sp.addEventListener('pointermove', move)
    sp.addEventListener('pointerup', up)
  })
}

async function init() {
  state.settings = await api.getSettings()
  applySettings()
  await registerThemes()
  wireUi()
  showLibrary()
}

window.addEventListener('beforeunload', flushMapSave)
init()

// For automated tests
window.__lantern = { state, openStory, command, travelTo, parseDirection }
