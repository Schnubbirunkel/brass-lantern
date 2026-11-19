'use strict'
// Tiny JSON persistence in the user data directory.

const fs = require('fs')
const path = require('path')

class Store {
  constructor(dir) {
    this.dir = dir
    fs.mkdirSync(dir, { recursive: true })
    this.timers = new Map()
  }
  file(name) {
    return path.join(this.dir, name)
  }
  read(name, fallback) {
    try {
      return JSON.parse(fs.readFileSync(this.file(name), 'utf8'))
    } catch {
      return fallback
    }
  }
  write(name, value) {
    const f = this.file(name)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    const tmp = f + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(value, null, 1))
    fs.renameSync(tmp, f)
  }
  remove(name) {
    try { fs.unlinkSync(this.file(name)) } catch {}
  }
}

module.exports = { Store }
