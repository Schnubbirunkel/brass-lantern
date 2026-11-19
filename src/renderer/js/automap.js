// Automapper model: detects rooms and movements from game output and builds a map graph.

export const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'up', 'down', 'in', 'out']

export const VEC = {
  n: [0, -1, 0], ne: [1, -1, 0], e: [1, 0, 0], se: [1, 1, 0], s: [0, 1, 0], sw: [-1, 1, 0], w: [-1, 0, 0], nw: [-1, -1, 0],
  up: [0, 0, 1], down: [0, 0, -1], in: [0, 0, 0], out: [0, 0, 0],
}

export const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e', ne: 'sw', sw: 'ne', nw: 'se', se: 'nw', up: 'down', down: 'up', in: 'out', out: 'in' }

export const DIR_LABEL = {
  n: 'N', ne: 'NO', e: 'O', se: 'SO', s: 'S', sw: 'SW', w: 'W', nw: 'NW', up: 'Hoch', down: 'Runter', in: 'Rein', out: 'Raus',
}

const COMMAND = {
  en: { n: 'north', ne: 'northeast', e: 'east', se: 'southeast', s: 'south', sw: 'southwest', w: 'west', nw: 'northwest', up: 'up', down: 'down', in: 'in', out: 'out' },
  de: { n: 'norden', ne: 'nordosten', e: 'osten', se: 'südosten', s: 'süden', sw: 'südwesten', w: 'westen', nw: 'nordwesten', up: 'hoch', down: 'runter', in: 'rein', out: 'raus' },
}

const WORDS_COMMON = {
  n: ['n', 'north', 'norden'],
  s: ['s', 'south', 'süden', 'sueden'],
  e: ['e', 'east', 'osten', 'o'],
  w: ['w', 'west', 'westen'],
  ne: ['ne', 'northeast', 'north-east', 'nordosten', 'nordost'],
  nw: ['nw', 'northwest', 'north-west', 'nordwesten', 'nordwest'],
  se: ['se', 'southeast', 'south-east', 'südosten', 'suedosten', 'südost'],
  sw: ['sw', 'southwest', 'south-west', 'südwesten', 'suedwesten', 'südwest'],
  up: ['up', 'upstairs', 'hoch', 'hinauf', 'rauf', 'oben', 'nach oben'],
  down: ['down', 'downstairs', 'runter', 'hinunter', 'hinab', 'unten', 'nach unten'],
  in: ['in', 'inside', 'rein', 'hinein'],
  out: ['out', 'outside', 'exit', 'leave', 'raus', 'hinaus'],
}
const WORDS_EN = { up: ['u'], down: ['d'] }
const WORDS_DE = { ne: ['no'], se: ['so'], up: ['h', 'ob'], down: ['u', 'r'] }

const PREFIXES = /^(go|walk|run|head|move|travel|climb|crawl|swim|fly|geh|gehe|lauf|laufe|renn|renne|kletter|klettere)\s+(to\s+the\s+|nach\s+)?/

export function parseDirection(command, lang = 'en') {
  if (!command) return null
  let c = command.toLowerCase().trim().replace(/[.!]+$/, '').replace(/\s+/g, ' ')
  if (!c || /[.,;]| then | dann /.test(c)) return null
  c = c.replace(PREFIXES, '')
  if (c === 'go out' || c === 'get out') return 'out'
  const extra = lang === 'de' ? WORDS_DE : WORDS_EN
  for (const d of DIRS) {
    if (WORDS_COMMON[d].includes(c)) {
      // "u" and "d"/"r" depend on language
      return d
    }
    if ((extra[d] || []).includes(c)) return d
  }
  return null
}

export function commandFor(dir, lang = 'en') {
  return (COMMAND[lang] || COMMAND.en)[dir]
}

function norm(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function cleanName(s) {
  if (!s) return null
  let n = s.replace(/\s+/g, ' ').trim()
  n = n.replace(/\s+\((on|in|at|under|inside|sitting|lying|standing|auf|im|in der|unter)\b[^)]*\)$/i, '')
  n = n.replace(/^[>*\s]+|[\s*]+$/g, '')
  return n
}

export { norm as normalizeName }

export function emptyMap() {
  return { version: 1, rooms: {}, current: null, nextId: 1, stats: { agree: 0, disagree: 0 } }
}

export class Automap {
  constructor(data, getSettings) {
    this.data = data && data.rooms ? data : emptyMap()
    if (!this.data.stats) this.data.stats = { agree: 0, disagree: 0 }
    this.getSettings = getSettings
    this.listeners = new Set()
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  emit(kind) { for (const fn of this.listeners) fn(kind) }

  get rooms() { return this.data.rooms }
  get current() { return this.data.current != null ? this.data.rooms[this.data.current] : null }
  room(id) { return this.data.rooms[id] }
  list() { return Object.values(this.data.rooms) }

  // ----- detection -----

  statusName(status) {
    if (!status) return null
    const first = status.trim().split(/\s{2,}|\t|\s\|\s/)[0]
    const n = cleanName(first)
    if (!n || n.length > 60) return null
    if (/^(score|moves|turns|time|zeit|punkte|züge|zug)\b/i.test(n)) return null
    if (/^\d+([:/]\d+)*$/.test(n)) return null
    return n
  }

  headerName(paragraphs) {
    let found = null
    let desc = null
    paragraphs.forEach((p, i) => {
      const text = (p.text || '').trim()
      if (!text || text.length > 60) return
      const styles = [...p.styles]
      if (!styles.length || !styles.every(s => s === 'subheader' || s === 'header')) return
      if (/[.!?:,;]$/.test(text) || /^[([“"']/.test(text)) return
      found = cleanName(text)
      desc = null
      for (let j = i + 1; j < paragraphs.length; j++) {
        const t = (paragraphs[j].text || '').trim()
        if (t) { desc = t.slice(0, 160); break }
      }
    })
    this.lastDesc = desc
    return found
  }

  observe(turn) {
    if (!turn.lineInput) return false
    const mode = this.getSettings().mapDetect || 'auto'
    const status = this.statusName(turn.status)
    const header = this.headerName(turn.paragraphs)
    let name = null
    if (mode === 'status') name = status
    else if (mode === 'header') name = header
    else {
      const st = this.data.stats
      if (status && header) {
        if (norm(status) === norm(header)) st.agree++
        else st.disagree++
      }
      const preferHeader = st.disagree > st.agree + 2
      if (status && header) name = preferHeader ? header : status
      else if (status) name = preferHeader ? null : status
      else name = header
    }
    if (!name) return false
    if (this.ignoreNames && this.ignoreNames.has(norm(name))) return false
    const dir = parseDirection(turn.command, this.getSettings().dirLanguage)
    const desc = header && norm(header) === norm(name) ? this.lastDesc : null
    return this.enter(name, dir, turn.command, !!header, desc)
  }

  // ----- graph -----

  enter(name, dir, command, printedHeader = false, desc = null) {
    const cur = this.current
    let target = null
    if (cur && norm(cur.name) === norm(name)) {
      // Same name as the current room: only a move if a fresh, different room description
      // was printed in reply to a movement command (mazes, long corridors …)
      if (!(dir && printedHeader) || !desc || !cur.desc || norm(desc) === norm(cur.desc)) {
        if (desc && !cur.desc) cur.desc = desc
        return false
      }
      const ex = cur.exits[dir]
      if (ex && this.rooms[ex.to] && norm(this.rooms[ex.to].name) === norm(name)) target = this.rooms[ex.to]
      if (!target) target = this.list().find(r => r !== cur && norm(r.name) === norm(name) && r.desc && norm(r.desc) === norm(desc))
      if (!target) target = this.createRoom(name, cur, dir)
    }
    if (!target && cur && dir) {
      const ex = cur.exits[dir]
      if (ex && this.rooms[ex.to] && norm(this.rooms[ex.to].name) === norm(name)) target = this.rooms[ex.to]
    }
    if (!target) {
      {
        const candidates = this.list().filter(r => norm(r.name) === norm(name))
        if (candidates.length === 1) target = candidates[0]
        else if (candidates.length > 1) {
          target = cur && dir && candidates.find(r => r.exits[OPPOSITE[dir]] && r.exits[OPPOSITE[dir]].to === cur.id)
          if (!target && cur) {
            const [vx, vy, vz] = VEC[dir] || [0, 0, 0]
            const ex = cur.x + vx, ey = cur.y + vy, ez = cur.z + vz
            target = candidates.slice().sort((a, b) => (Math.abs(a.x - ex) + Math.abs(a.y - ey) + 3 * Math.abs(a.z - ez)) - (Math.abs(b.x - ex) + Math.abs(b.y - ey) + 3 * Math.abs(b.z - ez)))[0]
          }
          if (!target) target = candidates.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))[0]
        } else {
          target = this.createRoom(name, cur, dir)
        }
      }
    }
    if (cur && dir && target !== cur) {
      cur.exits[dir] = { to: target.id, cmd: command ? command.trim() : commandFor(dir, this.getSettings().dirLanguage) }
      const opp = OPPOSITE[dir]
      if (this.getSettings().mapTwoWay && opp) {
        const back = target.exits[opp]
        if (!back || (back.assumed && back.to !== cur.id)) {
          target.exits[opp] = { to: cur.id, cmd: commandFor(opp, this.getSettings().dirLanguage), assumed: true }
        }
      }
    }
    if (desc && !target.desc) target.desc = desc
    target.visits = (target.visits || 0) + 1
    target.lastSeen = Date.now()
    this.data.current = target.id
    this.emit('move')
    return true
  }

  occupied(x, y, z, except) {
    return this.list().some(r => r !== except && r.x === x && r.y === y && r.z === z)
  }

  freeCellNear(x, y, z, except) {
    if (!this.occupied(x, y, z, except)) return [x, y]
    for (let radius = 1; radius < 40; radius++) {
      const cells = []
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
          cells.push([x + dx, y + dy, Math.abs(dx) + Math.abs(dy)])
        }
      }
      cells.sort((a, b) => a[2] - b[2])
      for (const [cx, cy] of cells) if (!this.occupied(cx, cy, z, except)) return [cx, cy]
    }
    return [x, y]
  }

  createRoom(name, from, dir) {
    const id = this.data.nextId++
    let x = 0, y = 0, z = 0
    if (from) {
      const [vx, vy, vz] = (dir && VEC[dir]) || [0, 0, 0]
      z = from.z + vz
      if (dir && (vx || vy || vz)) {
        ;[x, y] = this.freeCellNear(from.x + vx, from.y + vy, z)
      } else {
        // in/out or teleport: put it next to the origin
        ;[x, y] = this.freeCellNear(from.x + 1, from.y + (dir ? 0 : 1), z)
      }
    }
    const room = { id, name, x, y, z, exits: {}, notes: (this.notesByName && this.notesByName[norm(name)]) || '', visits: 0 }
    this.data.rooms[id] = room
    return room
  }

  rename(id, name) {
    const r = this.room(id)
    if (!r || !name.trim()) return
    r.name = name.trim()
    this.emit('edit')
  }

  setNotes(id, notes) {
    const r = this.room(id)
    if (!r) return
    r.notes = notes
    if (this.notesByName) {
      if (notes && notes.trim()) this.notesByName[norm(r.name)] = notes
      else delete this.notesByName[norm(r.name)]
    }
    this.emit('notes')
  }

  moveRoom(id, x, y, z) {
    const r = this.room(id)
    if (!r) return
    const zz = z === undefined ? r.z : z
    if (this.occupied(x, y, zz, r)) {
      ;[x, y] = this.freeCellNear(x, y, zz, r)
    }
    r.x = x
    r.y = y
    r.z = zz
    this.emit('layout')
  }

  deleteRoom(id) {
    const r = this.room(id)
    if (!r) return
    delete this.data.rooms[id]
    for (const o of this.list()) {
      for (const [d, ex] of Object.entries(o.exits)) if (ex.to === r.id) delete o.exits[d]
    }
    if (this.data.current === r.id) this.data.current = null
    this.emit('edit')
  }

  removeExit(id, dir) {
    const r = this.room(id)
    if (!r || !r.exits[dir]) return
    delete r.exits[dir]
    this.emit('edit')
  }

  setCurrent(id) {
    if (!this.room(id)) return
    this.data.current = id
    this.emit('move')
  }

  // Replace the whole map, e.g. with the snapshot stored alongside a save file
  replace(data) {
    this.data = data && data.rooms ? JSON.parse(JSON.stringify(data)) : emptyMap()
    if (!this.data.stats) this.data.stats = { agree: 0, disagree: 0 }
    if (this.notesByName) {
      // Notes written since that save still apply
      for (const r of this.list()) {
        const n = this.notesByName[norm(r.name)]
        if (n && !r.notes) r.notes = n
      }
    }
    this.emit('move')
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.data))
  }

  clear() {
    const cur = this.current
    this.data = emptyMap()
    if (cur) {
      const r = this.createRoom(cur.name, null, null)
      this.data.current = r.id
    }
    this.emit('edit')
  }

  findByName(name) {
    const n = norm(name)
    const all = this.list()
    return all.find(r => norm(r.name) === n) || all.find(r => norm(r.name).startsWith(n)) || all.find(r => norm(r.name).includes(n)) || null
  }

  route(fromId, toId) {
    if (fromId == null || toId == null || fromId === toId) return null
    const prev = new Map([[fromId, null]])
    const queue = [fromId]
    while (queue.length) {
      const id = queue.shift()
      if (id === toId) break
      const r = this.room(id)
      if (!r) continue
      for (const d of DIRS) {
        const ex = r.exits[d]
        if (!ex || prev.has(ex.to) || !this.room(ex.to)) continue
        prev.set(ex.to, { from: id, cmd: ex.cmd || commandFor(d, this.getSettings().dirLanguage), dir: d })
        queue.push(ex.to)
      }
    }
    if (!prev.has(toId)) return null
    const steps = []
    let at = toId
    while (at !== fromId) {
      const p = prev.get(at)
      steps.unshift({ cmd: p.cmd, dir: p.dir, to: at })
      at = p.from
    }
    return steps
  }

  levels() {
    return [...new Set(this.list().map(r => r.z))].sort((a, b) => a - b)
  }
}
