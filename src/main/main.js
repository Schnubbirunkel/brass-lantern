'use strict'

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, utilityProcess, nativeTheme, protocol, net } = require('electron')
const fs = require('fs')
const path = require('path')
const formats = require('./formats')
const { Store } = require('./store')
const { Library } = require('./library')
const { t: T, setLang } = require('./i18n')

protocol.registerSchemesAsPrivileged([{ scheme: 'lantern', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

const isMac = process.platform === 'darwin'
let store
let win = null
let host = null // current engine process
let current = null // current game info
let pendingOpen = [] // files requested before the window was ready
let themeList = []

function unpacked(p) {
  return p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
}

const EMGLKEN_BUILD = unpacked(path.join(path.dirname(require.resolve('emglken/package.json')), 'build'))
const HOST_SCRIPT = unpacked(path.join(__dirname, 'engine-host.mjs'))

const DEFAULT_SETTINGS = {
  theme: 'lectrote',
  fontSize: 0, // 0 = theme default
  fontFamily: '', // '' = theme default
  lineWidth: 46, // em; 0 = unlimited
  lineHeight: 0,
  crt: false,
  gameColors: true,
  mapVisible: true,
  mapSide: 'right',
  mapWidth: 380,
  mapTwoWay: true,
  dirLanguage: 'en',
  glulxEngine: 'glulxe',
  smoothScroll: true,
  numpadNav: false,
  mapDetect: 'auto',
  autocomplete: true,
  uiLanguage: 'en',
  libraryFolders: [],
  libraryRecursive: true,
  ifdbSync: true,
  librarySort: 'title',
}

function settings() {
  return Object.assign({}, DEFAULT_SETTINGS, store.read('settings.json', {}))
}

function saveSettings(patch) {
  const s = Object.assign(settings(), patch)
  store.write('settings.json', s)
  return s
}

// ---------- Library ----------

let lib = null

// Recently played stories (also those outside the library folders)
function recents() {
  return store.read('library.json', [])
}

function saveRecents(list) {
  store.write('library.json', list)
}

function addToRecents(filePath, info) {
  const list = recents().filter(e => e.path !== filePath && e.hash !== info.hash)
  list.unshift({ path: filePath, hash: info.hash, title: info.meta.title, lastPlayed: Date.now() })
  saveRecents(list.slice(0, 200))
  app.addRecentDocument(filePath)
}

function coverUrl(file) {
  return file ? `lantern://cover/${encodeURIComponent(file)}` : null
}

let scanning = null
async function libraryItems() {
  const s = settings()
  const folders = (s.libraryFolders || []).filter(f => { try { return fs.statSync(f).isDirectory() } catch { return false } })
  const rec = recents()
  const extra = rec.map(r => r.path).filter(p => fs.existsSync(p))
  if (!scanning) scanning = lib.scan(folders, s.libraryRecursive !== false, extra).finally(() => { scanning = null })
  const entries = await scanning
  const played = new Map(rec.map(r => [r.hash, r.lastPlayed]))
  const inFolder = (p) => folders.some(f => p === f || p.startsWith(f.endsWith(path.sep) ? f : f + path.sep))
  const items = entries.map(e => itemFor(e, played.get(e.hash), inFolder(e.path)))
  // Recently played files that no longer exist
  for (const r of rec) {
    if (!entries.some(e => e.hash === r.hash) && !fs.existsSync(r.path)) {
      items.push({ key: r.hash, hash: r.hash, path: r.path, title: r.title || path.basename(r.path), author: null, format: '?', missing: true, lastPlayed: r.lastPlayed, inFolder: false, ifdb: null })
    }
  }
  if (s.ifdbSync) lib.queueSync(entries)
  return items
}

function itemFor(e, lastPlayed, inFolder) {
  const c = lib.ifdbFor(e.hash)
  const d = c && c.data
  const useIfdbTitle = d && d.title && (e.titleFromFile || !e.title || c.status === 'manual')
  return {
    key: e.hash,
    hash: e.hash,
    path: e.path,
    file: path.basename(e.path),
    title: useIfdbTitle ? d.title : e.title,
    author: e.author || (d && d.author) || null,
    headline: e.headline,
    description: (d && d.description) || e.description || null,
    format: e.format,
    engine: e.engine,
    cover: coverUrl(e.cover || (c && c.cover)),
    lastPlayed: lastPlayed || null,
    inFolder,
    missing: false,
    ifdbStatus: c ? c.status : (settings().ifdbSync ? 'pending' : 'off'),
    ifdbVia: c ? c.via : null,
    ifdb: d || null,
  }
}

function libraryEntryByHash(hash) {
  return Object.values(lib.index).find(e => e.hash === hash)
}

// ---------- Engine ----------

function stopGame() {
  if (host) {
    const h = host
    host = null
    try { h.kill() } catch {}
  }
}

function startGame(filePath) {
  let info
  try {
    info = formats.inspect(filePath)
  } catch (err) {
    return { error: T('Die Datei konnte nicht gelesen werden: {msg}', { msg: err.message }) }
  }
  if (!info.engine) {
    return { error: T('Dieses Dateiformat wird nicht erkannt. Unterstützt werden Z-Code, Glulx, TADS 2/3, Hugo und ADRIFT 4 (auch in Blorb-Containern).') }
  }
  // Prefer IFDB data for stories without their own metadata
  const cached = lib && lib.ifdbFor(info.hash)
  if (cached && cached.data && cached.data.title && (cached.status === 'manual' || !info.meta.author)) {
    info.meta.title = cached.data.title
    info.meta.author = info.meta.author || cached.data.author
  }
  let engine = info.engine
  if (engine === 'glulxe' && settings().glulxEngine === 'git') engine = 'git'
  stopGame()
  addToRecents(filePath, info)
  const dataDir = path.join(store.dir, 'gamedata', info.hash)
  const engineFile = path.join(EMGLKEN_BUILD, `${engine}.js`)
  const proc = utilityProcess.fork(HOST_SCRIPT, [engineFile, filePath, dataDir], {
    serviceName: `Brass Lantern – ${engine}`,
    stdio: 'pipe',
  })
  host = proc
  proc.stdout && proc.stdout.on('data', d => process.stdout.write(`[${engine}] ${d}`))
  proc.stderr && proc.stderr.on('data', d => process.stderr.write(`[${engine}] ${d}`))
  proc.on('message', (msg) => {
    if (host !== proc || !win) return
    if (msg.kind === 'update') win.webContents.send('game:update', msg.data)
    else if (msg.kind === 'exit') win.webContents.send('game:exit', { error: msg.error })
    else if (msg.kind === 'log' && msg.error) console.error(`[${engine}]`, msg.text)
  })
  proc.on('exit', (code) => {
    if (host === proc && win) win.webContents.send('game:exit', { code })
    if (host === proc) host = null
  })
  current = {
    path: filePath,
    hash: info.hash,
    engine,
    format: formats.ENGINES[engine].format,
    engineLabel: formats.ENGINES[engine].label,
    title: info.meta.title,
    author: info.meta.author,
    headline: info.meta.headline,
    hasBlorb: info.hasBlorb,
    dataDir,
  }
  if (win) win.setTitle(`${current.title} – Brass Lantern`)
  buildMenu()
  return { game: current }
}

// ---------- Window & menu ----------

function send(channel, payload) {
  if (win) win.webContents.send(channel, payload)
}

function openDialog() {
  const res = dialog.showOpenDialogSync(win, {
    title: T('Story-Datei öffnen'),
    properties: ['openFile'],
    filters: [
      { name: 'Interactive Fiction', extensions: formats.EXTENSIONS },
      { name: T('Alle Dateien'), extensions: ['*'] },
    ],
  })
  return res && res[0]
}

function requestOpen(filePath) {
  if (!win || !win.webContents || win.webContents.isLoading()) {
    pendingOpen.push(filePath)
    return
  }
  send('app:open-file', filePath)
}

function buildMenu() {
  setLang(settings().uiLanguage)
  const s = settings()
  const recent = recents().slice(0, 10)
  const themeItems = themeList.map(t => ({
    label: t.name,
    type: 'radio',
    checked: s.theme === t.id,
    click: () => send('app:command', { cmd: 'theme', value: t.id }),
  }))
  const template = [
    ...(isMac ? [{ role: 'appMenu', label: 'Brass Lantern' }] : []),
    {
      label: T('Datei'),
      submenu: [
        { label: T('Story öffnen …'), accelerator: 'CmdOrCtrl+O', click: () => { const f = openDialog(); if (f) requestOpen(f) } },
        {
          label: T('Zuletzt gespielt'),
          submenu: recent.length ? recent.map(e => ({ label: e.title, click: () => requestOpen(e.path) })) : [{ label: T('(leer)'), enabled: false }],
        },
        { label: T('Bibliothek'), accelerator: 'CmdOrCtrl+L', click: () => send('app:command', { cmd: 'library' }) },
        { label: T('Spieleordner hinzufügen …'), click: () => send('app:command', { cmd: 'add-folder' }) },
        { type: 'separator' },
        { label: T('Neu starten'), accelerator: 'CmdOrCtrl+Shift+R', enabled: !!current, click: () => send('app:command', { cmd: 'restart' }) },
        { label: T('Spielstand-Ordner zeigen'), enabled: !!current, click: () => { if (current) { fs.mkdirSync(savesDir(current), { recursive: true }); shell.openPath(savesDir(current)) } } },
        { label: T('Transkript speichern …'), enabled: !!current, click: () => send('app:command', { cmd: 'transcript' }) },
        { type: 'separator' },
        isMac ? { role: 'close', label: T('Fenster schließen') } : { role: 'quit', label: T('Beenden') },
      ],
    },
    {
      label: T('Bearbeiten'),
      submenu: [
        { role: 'undo', label: T('Widerrufen') }, { role: 'redo', label: T('Wiederholen') }, { type: 'separator' },
        { role: 'cut', label: T('Ausschneiden') }, { role: 'copy', label: T('Kopieren') }, { role: 'paste', label: T('Einfügen') }, { role: 'selectAll', label: T('Alles auswählen') },
      ],
    },
    {
      label: T('Spiel'),
      submenu: [
        { label: T('Speichern'), accelerator: 'CmdOrCtrl+S', enabled: !!current, click: () => send('app:command', { cmd: 'type', value: 'save' }) },
        { label: T('Laden'), accelerator: 'CmdOrCtrl+R', enabled: !!current, click: () => send('app:command', { cmd: 'type', value: 'restore' }) },
        { label: T('Rückgängig (undo)'), accelerator: 'CmdOrCtrl+U', enabled: !!current, click: () => send('app:command', { cmd: 'type', value: 'undo' }) },
        { type: 'separator' },
        { label: T('Umsehen (look)'), accelerator: 'CmdOrCtrl+Shift+L', enabled: !!current, click: () => send('app:command', { cmd: 'type', value: 'look' }) },
        { label: T('Inventar'), accelerator: 'CmdOrCtrl+I', enabled: !!current, click: () => send('app:command', { cmd: 'type', value: 'inventory' }) },
      ],
    },
    {
      label: T('Karte'),
      submenu: [
        { label: T('Karte ein-/ausblenden'), accelerator: 'CmdOrCtrl+M', click: () => send('app:command', { cmd: 'toggle-map' }) },
        { label: T('Auf aktuellen Raum zentrieren'), accelerator: 'CmdOrCtrl+Shift+C', click: () => send('app:command', { cmd: 'map-center' }) },
        { label: T('Ebene höher'), accelerator: 'CmdOrCtrl+Alt+Up', click: () => send('app:command', { cmd: 'map-level', value: 1 }) },
        { label: T('Ebene tiefer'), accelerator: 'CmdOrCtrl+Alt+Down', click: () => send('app:command', { cmd: 'map-level', value: -1 }) },
        { type: 'separator' },
        { label: T('Karte als SVG exportieren …'), click: () => send('app:command', { cmd: 'map-export' }) },
        { label: T('Karte zurücksetzen …'), click: () => send('app:command', { cmd: 'map-clear' }) },
      ],
    },
    {
      label: T('Ansicht'),
      submenu: [
        { label: T('Stil'), submenu: themeItems.length ? themeItems : [{ label: '…', enabled: false }] },
        { label: T('Einstellungen …'), accelerator: 'CmdOrCtrl+,', click: () => send('app:command', { cmd: 'settings' }) },
        { type: 'separator' },
        { label: T('Schrift größer'), accelerator: 'CmdOrCtrl+=', click: () => send('app:command', { cmd: 'font', value: 1 }) },
        { label: T('Schrift kleiner'), accelerator: 'CmdOrCtrl+-', click: () => send('app:command', { cmd: 'font', value: -1 }) },
        { label: T('Schriftgröße zurücksetzen'), accelerator: 'CmdOrCtrl+0', click: () => send('app:command', { cmd: 'font', value: 0 }) },
        { label: T('CRT-Effekt'), type: 'checkbox', checked: !!s.crt, click: (item) => send('app:command', { cmd: 'crt', value: item.checked }) },
        { type: 'separator' },
        { role: 'togglefullscreen', label: T('Vollbild') },
        { role: 'toggleDevTools', label: T('Entwicklerwerkzeuge') },
      ],
    },
    {
      role: 'help',
      label: T('Hilfe'),
      submenu: [
        { label: T('Tastenkürzel & Befehle'), accelerator: 'F1', click: () => send('app:command', { cmd: 'help' }) },
        { label: T('IF Archive öffnen'), click: () => shell.openExternal('https://ifarchive.org/') },
        { label: T('IFDB öffnen'), click: () => shell.openExternal('https://ifdb.org/') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function savesDir(game) {
  // Language-independent folder name; earlier versions used "Spielstände"
  const base = path.join(app.getPath('documents'), 'Brass Lantern')
  const legacy = path.join(base, 'Spielstände')
  return path.join(fs.existsSync(legacy) ? legacy : path.join(base, 'Saves'), sanitize(game.title))
}

function sanitize(name) {
  return String(name || T('Spiel')).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)
}

function createWindow() {
  const state = store.read('window.json', { width: 1280, height: 820 })
  win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 640,
    minHeight: 420,
    title: 'Brass Lantern',
    backgroundColor: '#1e1e1e',
    show: false,
    autoHideMenuBar: !isMac,
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  if (state.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  win.webContents.on('did-finish-load', () => {
    const files = pendingOpen
    pendingOpen = []
    files.forEach(f => send('app:open-file', f))
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault()
      if (/^https?:/.test(url)) shell.openExternal(url)
    }
  })
  const saveState = () => {
    if (!win) return
    const b = win.getNormalBounds()
    store.write('window.json', Object.assign(b, { maximized: win.isMaximized() }))
  }
  win.on('close', saveState)
  win.on('closed', () => {
    win = null
    stopGame()
    current = null
  })
}

// ---------- IPC ----------

function registerIpc() {
  ipcMain.handle('settings:get', () => settings())
  ipcMain.handle('settings:set', (_e, patch) => {
    const s = saveSettings(patch)
    buildMenu()
    return s
  })
  ipcMain.handle('themes:register', (_e, list) => {
    themeList = list
    buildMenu()
  })
  ipcMain.handle('library:list', () => libraryItems())
  ipcMain.handle('library:remove', (_e, filePath) => {
    saveRecents(recents().filter(e => e.path !== filePath))
    buildMenu()
  })
  ipcMain.handle('library:add-folder', () => {
    const r = dialog.showOpenDialogSync(win, { title: T('Spieleordner wählen'), properties: ['openDirectory', 'createDirectory'] })
    if (!r) return settings()
    const folders = settings().libraryFolders || []
    if (!folders.includes(r[0])) folders.push(r[0])
    return saveSettings({ libraryFolders: folders })
  })
  ipcMain.handle('library:remove-folder', (_e, folder) => saveSettings({ libraryFolders: (settings().libraryFolders || []).filter(f => f !== folder) }))
  ipcMain.handle('library:sync', (_e, hash) => {
    if (hash) {
      const e = libraryEntryByHash(hash)
      if (e) lib.queueSync([e], true)
    } else {
      lib.queueSync(Object.values(lib.index), true)
    }
  })
  ipcMain.handle('library:ifdb-search', async (_e, query) => {
    try {
      return { results: (await lib.searchGames(query)).slice(0, 20).map(g => ({ tuid: g.tuid, title: g.title, author: g.author, year: g.published && g.published.printable, cover: g.coverArtLink ? `${g.coverArtLink}${g.coverArtLink.includes('?') ? '&' : '?'}thumbnail=80x80` : null, rating: g.starRating })) }
    } catch (err) {
      return { error: String(err.message || err) }
    }
  })
  ipcMain.handle('library:ifdb-set', async (_e, hash, tuid) => {
    try { await lib.setManual(hash, tuid); return { ok: true } } catch (err) { return { error: String(err.message || err) } }
  })
  ipcMain.handle('library:ifdb-reset', (_e, hash) => {
    lib.clearManual(hash)
    const e = libraryEntryByHash(hash)
    if (e && settings().ifdbSync) lib.queueSync([e], true)
  })
  ipcMain.handle('library:reveal', (_e, p) => shell.showItemInFolder(p))
  ipcMain.handle('app:open-external', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url) })
  ipcMain.handle('library:open-dialog', () => openDialog() || null)
  ipcMain.handle('game:start', (_e, filePath) => startGame(filePath))
  ipcMain.handle('game:stop', () => { stopGame(); current = null; if (win) win.setTitle('Brass Lantern'); buildMenu() })
  ipcMain.on('game:event', (_e, ev) => {
    if (host) host.postMessage({ kind: 'event', event: ev })
  })
  ipcMain.handle('game:read-story', () => {
    if (!current) return null
    try { return fs.readFileSync(current.path) } catch { return null }
  })
  ipcMain.handle('game:fileref', (_e, req) => {
    if (!current) return null
    const dir = req.filetype === 'save' ? savesDir(current) : path.join(app.getPath('documents'), 'Brass Lantern')
    fs.mkdirSync(dir, { recursive: true })
    const ext = req.filetype === 'save' ? 'glksave' : (req.filetype === 'data' ? 'glkdata' : 'txt')
    const typeName = { save: T('Spielstand'), transcript: T('Transkript'), command: T('Befehlsdatei'), data: T('Daten') }[req.filetype] || T('Datei')
    const filters = [{ name: typeName, extensions: [ext] }, { name: T('Alle Dateien'), extensions: ['*'] }]
    if (req.filemode === 'read') {
      const r = dialog.showOpenDialogSync(win, { title: T('{type} laden', { type: typeName }), defaultPath: dir, filters, properties: ['openFile'] })
      return r ? r[0] : null
    }
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-')
    const r = dialog.showSaveDialogSync(win, {
      title: T('{type} speichern', { type: typeName }),
      defaultPath: path.join(dir, `${sanitize(current.title)} ${stamp}.${ext}`),
      filters,
    })
    if (!r) return null
    return path.extname(r) ? r : `${r}.${ext}`
  })
  ipcMain.handle('map:load', (_e, hash) => store.read(path.join('maps', `${hash}.json`), null))
  ipcMain.handle('map:save', (_e, hash, data) => { store.write(path.join('maps', `${hash}.json`), data) })
  // Map snapshots belonging to save files (keyed by the save file's path)
  const saveKey = (p) => path.join('savemaps', `${require('crypto').createHash('sha1').update(path.resolve(p)).digest('hex')}.json`)
  ipcMain.handle('savemap:write', (_e, savePath, data) => { store.write(saveKey(savePath), { savePath, saved: Date.now(), map: data }) })
  ipcMain.handle('savemap:read', (_e, savePath) => { const r = store.read(saveKey(savePath), null); return r ? r.map : null })
  ipcMain.handle('file:save-text', (_e, opts) => {
    const r = dialog.showSaveDialogSync(win, { title: opts.title, defaultPath: path.join(app.getPath('documents'), opts.name), filters: opts.filters })
    if (!r) return false
    fs.writeFileSync(r, opts.content)
    return true
  })
  ipcMain.handle('app:confirm', (_e, opts) => {
    if (process.env.LANTERN_AUTOCONFIRM) return true
    const r = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: [opts.ok || 'OK', opts.cancel || T('Abbrechen')],
      defaultId: 0,
      cancelId: 1,
      message: opts.message,
      detail: opts.detail,
    })
    return r === 0
  })
  ipcMain.handle('app:platform', () => ({ platform: process.platform, dark: nativeTheme.shouldUseDarkColors, version: app.getVersion() }))
}

// ---------- App lifecycle ----------

if (process.env.LANTERN_USERDATA) app.setPath('userData', process.env.LANTERN_USERDATA)

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const f = argv.slice(1).find(a => !a.startsWith('-') && fs.existsSync(a) && fs.statSync(a).isFile())
    if (f) requestOpen(path.resolve(f))
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })
}

app.on('open-file', (e, filePath) => {
  e.preventDefault()
  if (win) requestOpen(filePath)
  else pendingOpen.push(filePath)
})

app.whenReady().then(() => {
  app.setName('Brass Lantern')
  store = new Store(app.getPath('userData'))
  lib = new Library(store, (url, opts) => net.fetch(url, opts))
  lib.onChange((ev) => send('library:changed', ev))
  protocol.handle('lantern', (req) => {
    const u = new URL(req.url)
    const file = path.basename(decodeURIComponent(u.pathname))
    if (u.hostname !== 'cover' || !file) return new Response('not found', { status: 404 })
    return net.fetch(require('url').pathToFileURL(path.join(lib.coverDir, file)).toString())
  })
  registerIpc()
  buildMenu()
  const argFile = process.argv.slice(app.isPackaged ? 1 : 2).find(a => !a.startsWith('-') && fs.existsSync(a) && fs.statSync(a).isFile())
  if (argFile) pendingOpen.push(path.resolve(argFile))
  createWindow()
  app.on('activate', () => { if (!win) createWindow() })
})

app.on('window-all-closed', () => {
  stopGame()
  if (!isMac) app.quit()
})
