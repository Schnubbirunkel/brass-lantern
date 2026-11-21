'use strict'
const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('lantern', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  registerThemes: (list) => ipcRenderer.invoke('themes:register', list),
  library: () => ipcRenderer.invoke('library:list'),
  removeFromLibrary: (p) => ipcRenderer.invoke('library:remove', p),
  openDialog: () => ipcRenderer.invoke('library:open-dialog'),
  addFolder: () => ipcRenderer.invoke('library:add-folder'),
  removeFolder: (f) => ipcRenderer.invoke('library:remove-folder', f),
  syncLibrary: (hash) => ipcRenderer.invoke('library:sync', hash),
  ifdbSearch: (q) => ipcRenderer.invoke('library:ifdb-search', q),
  ifdbSet: (hash, tuid) => ipcRenderer.invoke('library:ifdb-set', hash, tuid),
  ifdbReset: (hash) => ipcRenderer.invoke('library:ifdb-reset', hash),
  reveal: (p) => ipcRenderer.invoke('library:reveal', p),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  startGame: (p) => ipcRenderer.invoke('game:start', p),
  stopGame: () => ipcRenderer.invoke('game:stop'),
  sendEvent: (ev) => ipcRenderer.send('game:event', ev),
  readStory: () => ipcRenderer.invoke('game:read-story'),
  fileref: (req) => ipcRenderer.invoke('game:fileref', req),
  loadMap: (hash) => ipcRenderer.invoke('map:load', hash),
  saveMap: (hash, data) => ipcRenderer.invoke('map:save', hash, data),
  writeSaveMap: (savePath, data) => ipcRenderer.invoke('savemap:write', savePath, data),
  readSaveMap: (savePath) => ipcRenderer.invoke('savemap:read', savePath),
  saveText: (opts) => ipcRenderer.invoke('file:save-text', opts),
  confirm: (opts) => ipcRenderer.invoke('app:confirm', opts),
  platform: () => ipcRenderer.invoke('app:platform'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  on: (channel, fn) => {
    const allowed = ['game:update', 'game:exit', 'app:command', 'app:open-file', 'library:changed', 'game:log']
    if (!allowed.includes(channel)) return
    ipcRenderer.on(channel, (_e, payload) => fn(payload))
  },
})
