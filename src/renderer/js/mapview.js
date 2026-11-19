// SVG map view for the automapper.
import { t as T, setLang, getLang, locale } from './i18n.js'

import { DIRS, VEC, OPPOSITE, DIR_LABEL, commandFor } from './automap.js'

const NS = 'http://www.w3.org/2000/svg'
const CELL_W = 170
const CELL_H = 104
const BOX_W = 124
const BOX_H = 52

const ANCHOR = {
  n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0], nw: [-1, -1],
}

function svg(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  if (parent) parent.appendChild(e)
  return e
}

function h(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

function wrap(name, max = 17) {
  const words = name.split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    if (!line) line = w
    else if ((line + ' ' + w).length <= max) line += ' ' + w
    else { lines.push(line); line = w }
  }
  if (line) lines.push(line)
  if (lines.length > 3) {
    lines.length = 3
    lines[2] = lines[2].slice(0, max - 1) + '…'
  }
  return lines.map(l => (l.length > max + 2 ? l.slice(0, max + 1) + '…' : l))
}

export class MapView {
  constructor(root, opts) {
    this.root = root
    this.opts = opts // {map(), travel(id), go(cmd), toast(msg), onHide(), getSettings(), setSettings()}
    this.scale = 1
    this.tx = 0
    this.ty = 0
    this.viewZ = 0
    this.followZ = true
    this.selected = null
    this.build()
  }

  get map() { return this.opts.map() }

  // Re-create the panel, e.g. after the interface language changed
  rebuild() {
    if (this.menu) this.menu.remove()
    if (this.menuCloser) document.removeEventListener('mousedown', this.menuCloser)
    this.build()
  }

  build() {
    const r = this.root
    r.innerHTML = ''
    r.classList.add('mapview')

    const bar = h('div', 'map-toolbar')
    this.titleEl = h('div', 'map-title', T('Karte'))
    const btn = (label, title, fn, cls = '') => {
      const b = h('button', `map-btn ${cls}`, label)
      b.title = title
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(e) })
      return b
    }
    this.levelEl = h('span', 'map-level', T('Ebene 0'))
    bar.append(
      this.titleEl,
      h('span', 'map-spacer'),
      btn('▲', T('Ebene höher'), () => this.changeLevel(1)),
      this.levelEl,
      btn('▼', T('Ebene tiefer'), () => this.changeLevel(-1)),
      btn('−', T('Verkleinern'), () => this.zoom(1 / 1.2)),
      btn('+', T('Vergrößern'), () => this.zoom(1.2)),
      btn('⌖', T('Auf aktuellen Raum zentrieren'), () => this.center(true)),
      btn('☰', T('Raumliste'), () => this.toggleList()),
      btn('✕', T('Karte ausblenden (Strg/⌘+M)'), () => this.opts.onHide(), 'map-close'),
    )
    r.appendChild(bar)

    this.stage = h('div', 'map-stage')
    this.svg = svg('svg', { class: 'map-svg' })
    const defs = svg('defs', {}, this.svg)
    const marker = svg('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, defs)
    svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'map-arrow' }, marker)
    const pat = svg('pattern', { id: 'mapgrid', width: CELL_W / 2, height: CELL_H / 2, patternUnits: 'userSpaceOnUse' }, defs)
    svg('circle', { cx: 1, cy: 1, r: 1, class: 'map-griddot' }, pat)
    this.world = svg('g', { class: 'map-world' }, this.svg)
    this.gridRect = svg('rect', { x: -50000, y: -50000, width: 100000, height: 100000, fill: 'url(#mapgrid)', class: 'map-gridrect' }, this.world)
    this.edgeLayer = svg('g', { class: 'map-edges' }, this.world)
    this.roomLayer = svg('g', { class: 'map-rooms' }, this.world)
    this.stage.appendChild(this.svg)
    this.emptyEl = h('div', 'map-empty', T('Noch keine Räume entdeckt.\nBewege dich mit Richtungsbefehlen (n, s, o/e, w, hoch, runter …) – die Karte zeichnet sich von selbst.'))
    this.stage.appendChild(this.emptyEl)
    this.listEl = h('div', 'map-list no-steal hidden')
    this.stage.appendChild(this.listEl)
    r.appendChild(this.stage)

    // Compass + info
    const bottom = h('div', 'map-bottom')
    this.compass = h('div', 'map-compass')
    this.info = h('div', 'map-info no-steal')
    bottom.append(this.compass, this.info)
    r.appendChild(bottom)
    this.buildCompass()

    this.menu = h('div', 'map-menu hidden no-steal')
    document.body.appendChild(this.menu)
    this.menuCloser = (e) => { if (!this.menu.contains(e.target)) this.menu.classList.add('hidden') }
    document.addEventListener('mousedown', this.menuCloser)

    this.bindPointer()
  }

  buildCompass() {
    const c = this.compass
    c.innerHTML = ''
    const grid = h('div', 'compass-grid')
    for (const d of ['nw', 'n', 'ne', 'w', 'here', 'e', 'sw', 's', 'se']) {
      if (d === 'here') {
        const b = h('button', 'compass-here', '●')
        b.title = T('Umsehen (look)')
        b.addEventListener('click', () => this.opts.go('look'))
        grid.appendChild(b)
        continue
      }
      const b = h('button', `compass-dir dir-${d}`, T(DIR_LABEL[d]))
      b.dataset.dir = d
      b.addEventListener('click', () => this.goDir(d))
      grid.appendChild(b)
    }
    const extra = h('div', 'compass-extra')
    for (const d of ['up', 'down', 'in', 'out']) {
      const b = h('button', `compass-dir dir-${d}`, { up: T('▲ Hoch'), down: T('▼ Runter'), in: T('⇥ Rein'), out: T('⇤ Raus') }[d])
      b.dataset.dir = d
      b.addEventListener('click', () => this.goDir(d))
      extra.appendChild(b)
    }
    c.append(grid, extra)
  }

  goDir(d) {
    const cur = this.map.current
    const ex = cur && cur.exits[d]
    this.opts.go(ex && ex.cmd ? ex.cmd : commandFor(d, this.opts.getSettings().dirLanguage))
  }

  updateCompass() {
    const cur = this.map.current
    for (const b of this.compass.querySelectorAll('.compass-dir')) {
      const d = b.dataset.dir
      const ex = cur && cur.exits[d]
      const target = ex && this.map.room(ex.to)
      b.classList.toggle('known', !!target)
      b.title = target ? `${T(DIR_LABEL[d])} → ${target.name}` : T('{d} (unbekannt)', { d: T(DIR_LABEL[d]) })
    }
  }

  // ---------- geometry ----------

  pos(room) {
    return [room.x * CELL_W, room.y * CELL_H]
  }

  anchor(room, dir) {
    const [cx, cy] = this.pos(room)
    const a = ANCHOR[dir]
    if (!a) return [cx, cy + BOX_H / 2]
    return [cx + a[0] * BOX_W / 2, cy + a[1] * BOX_H / 2]
  }

  sideToward(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y
    if (!dx && !dy) return 's'
    const ang = Math.atan2(dy, dx) * 180 / Math.PI
    const dirs = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']
    return dirs[((Math.round(ang / 45) % 8) + 8) % 8]
  }

  // ---------- render ----------

  render(opts = {}) {
    const map = this.map
    if (!map) return
    const cur = map.current
    if (cur && this.followZ) this.viewZ = cur.z
    const z = this.viewZ
    const levels = map.levels()
    this.levelEl.textContent = levels.length > 1 || z !== 0 ? T('Ebene {n}', { n: `${z > 0 ? '+' : ''}${z}` }) : T('Ebene 0')
    this.edgeLayer.innerHTML = ''
    this.roomLayer.innerHTML = ''
    const rooms = map.list()
    this.emptyEl.style.display = rooms.length ? 'none' : ''
    const onLevel = rooms.filter(r => r.z === z)
    const drawn = new Set()

    for (const r of onLevel) {
      for (const d of DIRS) {
        const ex = r.exits[d]
        if (!ex) continue
        const t = map.room(ex.to)
        if (!t) continue
        const key = [r.id, t.id].sort().join('-') + (d === 'in' || d === 'out' ? 'io' : '')
        if (t.z !== r.z || d === 'up' || d === 'down') {
          this.drawStub(r, d, t)
          continue
        }
        const back = OPPOSITE[d] && t.exits[OPPOSITE[d]] && t.exits[OPPOSITE[d]].to === r.id
        if (back && drawn.has(key)) continue
        drawn.add(key)
        this.drawEdge(r, d, t, back ? OPPOSITE[d] : null, !back)
      }
    }
    for (const r of onLevel) this.drawRoom(r, cur)
    this.updateCompass()
    this.renderInfo()
    if (!this.listEl.classList.contains('hidden')) this.renderList()
    if (opts.center) this.center(false)
    this.applyTransform()
  }

  drawEdge(r, d, t, backDir, oneWay) {
    const io = d === 'in' || d === 'out'
    let from, to, fromDir, toDir
    if (io) {
      fromDir = this.sideToward(r, t)
      toDir = this.sideToward(t, r)
    } else {
      fromDir = d
      toDir = backDir || this.sideToward(t, r)
    }
    from = this.anchor(r, fromDir)
    to = this.anchor(t, toDir)
    const fa = ANCHOR[fromDir] || [0, 0]
    const ta = ANCHOR[toDir] || [0, 0]
    const stub = 14
    const p1 = [from[0] + fa[0] * stub, from[1] + fa[1] * stub]
    const p2 = [to[0] + ta[0] * stub, to[1] + ta[1] * stub]
    const straight = !io && VEC[d] && t.x - r.x === VEC[d][0] && t.y - r.y === VEC[d][1]
    const path = straight
      ? `M ${from[0]} ${from[1]} L ${to[0]} ${to[1]}`
      : `M ${from[0]} ${from[1]} L ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} L ${to[0]} ${to[1]}`
    const cls = ['map-edge']
    if (io) cls.push('io')
    if (oneWay) cls.push('oneway')
    if (r.exits[d] && r.exits[d].assumed) cls.push('assumed')
    const p = svg('path', { d: path, class: cls.join(' ') }, this.edgeLayer)
    if (oneWay) p.setAttribute('marker-end', 'url(#arrow)')
    if (io) {
      const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2
      const lbl = svg('text', { x: mx, y: my - 4, class: 'map-edge-label' }, this.edgeLayer)
      lbl.textContent = d === 'in' ? T('rein') : T('raus')
    }
  }

  drawStub(r, d, t) {
    const [cx, cy] = this.pos(r)
    const up = t.z > r.z || d === 'up'
    const down = t.z < r.z || d === 'down'
    const g = svg('g', { class: 'map-stub' }, this.edgeLayer)
    const x = cx + BOX_W / 2 - 4
    const y = up ? cy - BOX_H / 2 - 4 : cy + BOX_H / 2 + 4
    const t2 = svg('text', { x: x, y: up ? y - 2 : y + 11, class: 'map-stub-label', 'text-anchor': 'end' }, g)
    t2.textContent = `${up ? '▲' : down ? '▼' : '◆'} ${t.name.length > 18 ? t.name.slice(0, 17) + '…' : t.name}`
    g.addEventListener('click', (e) => { e.stopPropagation(); this.followZ = false; this.viewZ = t.z; this.select(t.id); this.render(); this.centerOn(t) })
  }

  drawRoom(r, cur) {
    const [cx, cy] = this.pos(r)
    const g = svg('g', { class: 'map-room', transform: `translate(${cx} ${cy})` }, this.roomLayer)
    g.dataset.id = r.id
    if (cur && cur.id === r.id) g.classList.add('here')
    if (this.selected === r.id) g.classList.add('selected')
    if (!r.visits) g.classList.add('unvisited')
    svg('rect', { x: -BOX_W / 2 + 3, y: -BOX_H / 2 + 3, width: BOX_W, height: BOX_H, class: 'room-shadow' }, g)
    svg('rect', { x: -BOX_W / 2, y: -BOX_H / 2, width: BOX_W, height: BOX_H, class: 'room-box' }, g)
    const lines = wrap(r.name)
    const lh = 13
    const y0 = -((lines.length - 1) * lh) / 2 + 4
    lines.forEach((l, i) => {
      const t = svg('text', { x: 0, y: y0 + i * lh, class: 'room-name', 'text-anchor': 'middle' }, g)
      t.textContent = l
    })
    if (r.notes && r.notes.trim()) {
      const n = svg('text', { x: -BOX_W / 2 + 6, y: -BOX_H / 2 + 12, class: 'room-note' }, g)
      n.textContent = '✎'
      svg('title', {}, n).textContent = r.notes
    }
    const marks = []
    if (r.exits.up) marks.push('▲')
    if (r.exits.down) marks.push('▼')
    if (r.exits.in) marks.push('⇥')
    if (r.exits.out) marks.push('⇤')
    if (marks.length) {
      const m = svg('text', { x: BOX_W / 2 - 5, y: -BOX_H / 2 + 12, class: 'room-marks', 'text-anchor': 'end' }, g)
      m.textContent = marks.join('')
    }
    if (cur && cur.id === r.id) {
      svg('circle', { cx: -BOX_W / 2 + 2, cy: BOX_H / 2 - 2, r: 6, class: 'room-here-dot' }, g)
    }
    svg('title', {}, g).textContent = `${r.name}${r.notes ? '\n\n' + r.notes : ''}\n\n${T('Doppelklick: hingehen · Rechtsklick: Optionen')}`
  }

  // ---------- transform ----------

  applyTransform() {
    this.world.setAttribute('transform', `translate(${this.tx} ${this.ty}) scale(${this.scale})`)
  }

  centerOn(room, animate = true) {
    const rect = this.svg.getBoundingClientRect()
    const [x, y] = this.pos(room)
    const tx = rect.width / 2 - x * this.scale
    const ty = rect.height / 2 - y * this.scale
    if (!animate || !rect.width) {
      this.tx = tx; this.ty = ty; this.applyTransform(); return
    }
    const sx = this.tx, sy = this.ty
    const t0 = performance.now()
    cancelAnimationFrame(this.anim)
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 260)
      const e = 1 - Math.pow(1 - k, 3)
      this.tx = sx + (tx - sx) * e
      this.ty = sy + (ty - sy) * e
      this.applyTransform()
      if (k < 1) this.anim = requestAnimationFrame(step)
    }
    this.anim = requestAnimationFrame(step)
  }

  center(animate = true) {
    const cur = this.map && this.map.current
    if (cur) {
      this.followZ = true
      this.viewZ = cur.z
      if (animate) this.render()
      this.centerOn(cur, animate)
    } else {
      const rect = this.svg.getBoundingClientRect()
      this.tx = rect.width / 2
      this.ty = rect.height / 2
      this.applyTransform()
    }
  }

  zoom(f, cx, cy) {
    const rect = this.svg.getBoundingClientRect()
    if (cx === undefined) { cx = rect.width / 2; cy = rect.height / 2 }
    const ns = Math.min(3, Math.max(0.25, this.scale * f))
    const k = ns / this.scale
    this.tx = cx - (cx - this.tx) * k
    this.ty = cy - (cy - this.ty) * k
    this.scale = ns
    this.applyTransform()
  }

  changeLevel(delta) {
    const levels = this.map.levels()
    if (!levels.length) return
    const z = this.viewZ + delta
    this.followZ = false
    this.viewZ = z
    this.render()
    const r = this.map.list().find(x => x.z === z)
    if (r) this.centerOn(r)
  }

  // ---------- interaction ----------

  toWorld(clientX, clientY) {
    const rect = this.svg.getBoundingClientRect()
    return [(clientX - rect.left - this.tx) / this.scale, (clientY - rect.top - this.ty) / this.scale]
  }

  bindPointer() {
    const s = this.svg
    let drag = null
    s.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      const g = e.target.closest('.map-room')
      s.setPointerCapture(e.pointerId)
      if (g) {
        const room = this.map.room(+g.dataset.id)
        const [wx, wy] = this.toWorld(e.clientX, e.clientY)
        drag = { kind: 'room', room, g, ox: wx - room.x * CELL_W, oy: wy - room.y * CELL_H, sx: e.clientX, sy: e.clientY, moved: false }
      } else {
        drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: this.tx, ty: this.ty, moved: false }
      }
    })
    s.addEventListener('pointermove', (e) => {
      if (!drag) return
      const dist = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy)
      if (dist > 4) drag.moved = true
      if (drag.kind === 'pan') {
        this.tx = drag.tx + (e.clientX - drag.sx)
        this.ty = drag.ty + (e.clientY - drag.sy)
        this.applyTransform()
      } else if (drag.moved) {
        const [wx, wy] = this.toWorld(e.clientX, e.clientY)
        drag.g.setAttribute('transform', `translate(${wx - drag.ox} ${wy - drag.oy})`)
        drag.g.classList.add('dragging')
      }
    })
    s.addEventListener('pointerup', (e) => {
      if (!drag) return
      const d = drag
      drag = null
      if (d.kind === 'room') {
        if (d.moved) {
          const [wx, wy] = this.toWorld(e.clientX, e.clientY)
          const nx = Math.round((wx - d.ox) / CELL_W)
          const ny = Math.round((wy - d.oy) / CELL_H)
          this.map.moveRoom(d.room.id, nx, ny)
        } else {
          this.select(d.room.id)
        }
      } else if (!d.moved) {
        this.select(null)
      }
    })
    s.addEventListener('dblclick', (e) => {
      const g = e.target.closest('.map-room')
      if (g) this.opts.travel(+g.dataset.id)
    })
    s.addEventListener('wheel', (e) => {
      e.preventDefault()
      const rect = s.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey || e.altKey) {
        // Pinch gestures arrive as ctrl+wheel
        const f = Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025))
        this.zoom(f, e.clientX - rect.left, e.clientY - rect.top)
      } else {
        const k = e.deltaMode ? 20 : 1
        this.tx -= (e.shiftKey ? e.deltaY : e.deltaX) * k
        this.ty -= (e.shiftKey ? 0 : e.deltaY) * k
        this.applyTransform()
      }
    }, { passive: false })
    s.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      const g = e.target.closest('.map-room')
      if (g) this.openMenu(+g.dataset.id, e.clientX, e.clientY)
    })
  }

  select(id) {
    this.selected = id
    for (const g of this.roomLayer.querySelectorAll('.map-room')) g.classList.toggle('selected', +g.dataset.id === id)
    this.renderInfo()
  }

  openMenu(id, x, y) {
    const r = this.map.room(id)
    if (!r) return
    this.select(id)
    const m = this.menu
    m.innerHTML = ''
    const item = (label, fn, cls = '') => {
      const b = h('button', `menu-item ${cls}`, label)
      b.addEventListener('click', () => { m.classList.add('hidden'); fn() })
      m.appendChild(b)
    }
    m.appendChild(h('div', 'menu-title', r.name))
    item(T('Hierhin gehen'), () => this.opts.travel(id))
    item(T('Umbenennen …'), () => this.editName(id))
    item(T('Notiz bearbeiten …'), () => { this.select(id); const ta = this.info.querySelector('textarea'); if (ta) ta.focus() })
    item(T('Als aktuellen Raum setzen'), () => this.map.setCurrent(id))
    const exits = Object.entries(r.exits)
    if (exits.length) {
      m.appendChild(h('div', 'menu-sep'))
      for (const [d, ex] of exits) {
        const t = this.map.room(ex.to)
        item(T('Verbindung {d} → {name} entfernen', { d: T(DIR_LABEL[d]), name: t ? t.name : '?' }), () => this.map.removeExit(id, d), 'small')
      }
    }
    m.appendChild(h('div', 'menu-sep'))
    item(T('Raum löschen'), () => this.map.deleteRoom(id), 'danger')
    m.classList.remove('hidden')
    const w = m.offsetWidth, hh = m.offsetHeight
    m.style.left = `${Math.min(x, window.innerWidth - w - 8)}px`
    m.style.top = `${Math.min(y, window.innerHeight - hh - 8)}px`
  }

  editName(id) {
    this.select(id)
    const inp = this.info.querySelector('.info-name')
    if (inp) { inp.focus(); inp.select() }
  }

  renderInfo() {
    const map = this.map
    const info = this.info
    if (!map) { info.innerHTML = ''; return }
    const r = map.room(this.selected) || map.current
    if (info.contains(document.activeElement) && info.dataset.room == (r && r.id)) return
    info.innerHTML = ''
    info.dataset.room = r ? r.id : ''
    if (!r) {
      info.appendChild(h('div', 'info-empty', T('Kein Raum ausgewählt.')))
      return
    }
    const head = h('div', 'info-head')
    const name = h('input', 'info-name')
    name.value = r.name
    name.title = T('Raumname (Enter zum Übernehmen)')
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { map.rename(r.id, name.value); name.blur() } if (e.key === 'Escape') { name.value = r.name; name.blur() } })
    name.addEventListener('blur', () => { if (name.value.trim() && name.value !== r.name) map.rename(r.id, name.value) })
    head.appendChild(name)
    const cur = map.current
    if (!cur || cur.id !== r.id) {
      const go = h('button', 'map-btn info-go', T('Hingehen'))
      go.addEventListener('click', () => this.opts.travel(r.id))
      head.appendChild(go)
    } else {
      head.appendChild(h('span', 'info-here', T('Du bist hier')))
    }
    info.appendChild(head)
    const exits = h('div', 'info-exits')
    const entries = DIRS.filter(d => r.exits[d])
    if (!entries.length) exits.appendChild(h('span', 'info-muted', T('Keine bekannten Ausgänge')))
    for (const d of entries) {
      const t = map.room(r.exits[d].to)
      const chip = h('button', 'exit-chip', `${T(DIR_LABEL[d])} → ${t ? t.name : '?'}`)
      chip.title = r.exits[d].assumed ? T('Angenommene Rückverbindung (noch nicht begangen)') : T('Befehl: {cmd}', { cmd: r.exits[d].cmd })
      if (r.exits[d].assumed) chip.classList.add('assumed')
      chip.addEventListener('click', () => { if (t) { this.select(t.id); this.centerOn(t) } })
      exits.appendChild(chip)
    }
    info.appendChild(exits)
    const notes = h('textarea', 'info-notes')
    notes.placeholder = T('Notizen zu diesem Raum …')
    notes.value = r.notes || ''
    notes.addEventListener('input', () => map.setNotes(r.id, notes.value))
    notes.addEventListener('keydown', (e) => e.stopPropagation())
    info.appendChild(notes)
  }

  toggleList() {
    this.listEl.classList.toggle('hidden')
    if (!this.listEl.classList.contains('hidden')) {
      this.renderList()
      const s = this.listEl.querySelector('input')
      if (s) s.focus()
    }
  }

  renderList(filter) {
    const el = this.listEl
    const prev = el.querySelector('input')
    const q = filter !== undefined ? filter : (prev ? prev.value : '')
    el.innerHTML = ''
    const search = h('input', 'list-search')
    search.placeholder = T('Raum suchen …')
    search.value = q
    search.addEventListener('input', () => { this.renderList(search.value); const s = el.querySelector('input'); s.focus(); s.setSelectionRange(s.value.length, s.value.length) })
    search.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.toggleList() })
    el.appendChild(search)
    const ul = h('div', 'list-items')
    const cur = this.map.current
    const rooms = this.map.list().filter(r => r.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name))
    for (const r of rooms) {
      const row = h('div', 'list-item')
      if (cur && cur.id === r.id) row.classList.add('here')
      row.appendChild(h('span', 'list-name', r.name))
      if (r.notes) row.appendChild(h('span', 'list-note', '✎'))
      if (r.z) row.appendChild(h('span', 'list-z', `E${r.z > 0 ? '+' : ''}${r.z}`))
      const go = h('button', 'map-btn list-go', '→')
      go.title = T('Hingehen')
      go.addEventListener('click', (e) => { e.stopPropagation(); this.opts.travel(r.id) })
      row.appendChild(go)
      row.addEventListener('click', () => { this.followZ = false; this.viewZ = r.z; this.select(r.id); this.render(); this.centerOn(r) })
      ul.appendChild(row)
    }
    if (!rooms.length) ul.appendChild(h('div', 'info-muted', T('Keine Räume')))
    el.appendChild(ul)
  }

  setTitle(t) {
    this.titleEl.textContent = t
  }

  exportSVG() {
    const rooms = this.map.list()
    if (!rooms.length) return null
    const clone = this.svg.cloneNode(true)
    const world = clone.querySelector('.map-world')
    const z = this.viewZ
    const onLevel = rooms.filter(r => r.z === z)
    const xs = onLevel.map(r => r.x * CELL_W), ys = onLevel.map(r => r.y * CELL_H)
    const minX = Math.min(...xs) - BOX_W, maxX = Math.max(...xs) + BOX_W
    const minY = Math.min(...ys) - BOX_H * 1.5, maxY = Math.max(...ys) + BOX_H * 1.5
    world.setAttribute('transform', `translate(${-minX} ${-minY})`)
    clone.querySelector('.map-gridrect').remove()
    clone.setAttribute('xmlns', NS)
    clone.setAttribute('width', maxX - minX)
    clone.setAttribute('height', maxY - minY)
    clone.setAttribute('viewBox', `0 0 ${maxX - minX} ${maxY - minY}`)
    const cs = getComputedStyle(this.root)
    const v = (n) => cs.getPropertyValue(n).trim()
    const style = document.createElementNS(NS, 'style')
    style.textContent = `
      svg { background: ${v('--map-bg')}; font-family: ${v('--font-ui')}; }
      .map-edge { stroke: ${v('--map-line')}; stroke-width: 2; fill: none; }
      .map-edge.io { stroke-dasharray: 5 4; }
      .map-edge.assumed { stroke-dasharray: 2 4; }
      .map-arrow { fill: ${v('--map-line')}; }
      .room-box { fill: ${v('--room-bg')}; stroke: ${v('--room-border')}; stroke-width: 2; }
      .room-shadow { fill: ${v('--room-shadow')}; }
      .here .room-box { fill: ${v('--room-here-bg')}; }
      .room-name { fill: ${v('--room-fg')}; font-size: 11.5px; }
      .here .room-name { fill: ${v('--room-here-fg')}; }
      .room-note, .room-marks, .map-stub-label, .map-edge-label { fill: ${v('--map-muted')}; font-size: 10px; }
      .room-here-dot { fill: ${v('--accent')}; }
    `
    clone.insertBefore(style, clone.firstChild)
    return new XMLSerializer().serializeToString(clone)
  }
}
