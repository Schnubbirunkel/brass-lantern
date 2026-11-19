// Runs one emglken interpreter inside an Electron utility process.
// Speaks the GlkOte JSON protocol with the renderer via the parent port.

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [engineFile, storyPath, dataDir] = process.argv.slice(2)
const port = process.parentPort

function post(msg) {
  port.postMessage(msg)
}

class HostDialog {
  constructor() {
    this.async = true
  }
  async init() {}
  async delete(p) {
    try { fs.unlinkSync(p) } catch {}
  }
  async exists(p) {
    try { await fsp.access(p, fs.constants.F_OK); return true } catch { return false }
  }
  get_dirs() {
    return {
      storyfile: path.dirname(storyPath),
      system_cwd: dataDir,
      temp: os.tmpdir(),
      working: dataDir,
    }
  }
  prompt() {
    // Not used: file prompts are answered by the renderer via specialresponse
    return Promise.resolve(null)
  }
  read(p) {
    return fsp.readFile(p).catch(() => null)
  }
  set_storyfile_dir(p) {
    return { storyfile: p, working: dataDir }
  }
  async write(files) {
    for (const [p, data] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, data, { flush: true })
    }
  }
}

class HostGlkOte {
  constructor() {
    this.accept = null
    this.pending = []
  }
  init(options) {
    this.accept = options.accept
    for (const ev of this.pending) this.accept(ev)
    this.pending = []
  }
  update(data) {
    post({ kind: 'update', data })
  }
  event(ev) {
    if (ev.type === 'specialresponse' && typeof ev.value === 'string') ev.value = { filename: ev.value }
    if (this.accept) this.accept(ev)
    else this.pending.push(ev)
  }
}

const GlkOte = new HostGlkOte()
const Dialog = new HostDialog()

port.on('message', (e) => {
  const msg = e.data
  if (msg && msg.kind === 'event') GlkOte.event(msg.event)
})

function finished(err) {
  const exitOk = err && err.name === 'ExitStatus'
  post({ kind: 'exit', error: exitOk || !err ? null : String(err && (err.stack || err.message || err)) })
  setTimeout(() => process.exit(0), 50)
}
process.on('unhandledRejection', finished)
process.on('uncaughtException', finished)

try {
  fs.mkdirSync(dataDir, { recursive: true })
  const mod = await import(pathToFileURL(engineFile).href)
  const vm = await mod.default({
    print: (s) => post({ kind: 'log', text: String(s) }),
    printErr: (s) => post({ kind: 'log', text: String(s), error: true }),
  })
  vm.start({ arguments: [storyPath], Dialog, GlkOte })
  post({ kind: 'started' })
} catch (err) {
  finished(err)
}
