// Runs one emglken interpreter inside an Electron utility process.
// Speaks the GlkOte JSON protocol with the renderer via the parent port.

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { osPath, toVm, fromVm } from './vmpath.mjs'

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
  // All paths coming from or going to the interpreter pass through toVm/fromVm (see vmpath.mjs)
  async delete(p) {
    try { fs.unlinkSync(fromVm(p)) } catch {}
  }
  async exists(p) {
    try { await fsp.access(fromVm(p), fs.constants.F_OK); return true } catch { return false }
  }
  get_dirs() {
    return {
      storyfile: toVm(osPath(path.dirname(storyPath))),
      system_cwd: toVm(osPath(dataDir)),
      temp: toVm(osPath(os.tmpdir())),
      working: toVm(osPath(dataDir)),
    }
  }
  prompt() {
    // Not used: file prompts are answered by the renderer via specialresponse
    return Promise.resolve(null)
  }
  read(p) {
    return fsp.readFile(fromVm(p)).catch(() => null)
  }
  set_storyfile_dir(p) {
    return { storyfile: p, working: toVm(osPath(dataDir)) }
  }
  async write(files) {
    for (const [vp, data] of Object.entries(files)) {
      const p = fromVm(vp)
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
    if (ev.type === 'specialresponse') {
      if (typeof ev.value === 'string') ev.value = { filename: ev.value }
      if (ev.value && ev.value.filename) ev.value.filename = toVm(osPath(ev.value.filename))
    }
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

// Last error lines of the interpreter, shown to the user if it stops unexpectedly
const stderr = []

function finished(err) {
  const exitStatus = err && err.name === 'ExitStatus'
  let error = null
  if (err && !exitStatus) error = String(err.stack || err.message || err)
  else if (exitStatus && err.status !== 0) error = stderr.join('\n') || `exit code ${err.status}`
  post({ kind: 'exit', error, log: stderr.join('\n') })
  setTimeout(() => process.exit(0), 50)
}
process.on('unhandledRejection', finished)
process.on('uncaughtException', finished)

try {
  fs.mkdirSync(dataDir, { recursive: true })
  const mod = await import(pathToFileURL(engineFile).href)
  const vm = await mod.default({
    print: (s) => {
      stderr.push(String(s))
      if (stderr.length > 8) stderr.shift()
      post({ kind: 'log', text: String(s) })
    },
    printErr: (s) => {
      stderr.push(String(s))
      if (stderr.length > 8) stderr.shift()
      post({ kind: 'log', text: String(s), error: true })
    },
  })
  vm.start({ arguments: [toVm(osPath(storyPath))], Dialog, GlkOte })
  post({ kind: 'started' })
} catch (err) {
  finished(err)
}
