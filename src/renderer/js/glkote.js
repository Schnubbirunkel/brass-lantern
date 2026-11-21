// Brass Lantern display layer: a GlkOte-protocol client rendering into the DOM.

const KEY_NAMES = {
  Enter: 'return', Backspace: 'delete', Delete: 'delete', Escape: 'escape', Tab: 'tab',
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  PageUp: 'pageup', PageDown: 'pagedown', Home: 'home', End: 'end',
}
for (let i = 1; i <= 12; i++) KEY_NAMES[`F${i}`] = `func${i}`

const MAX_PARAGRAPHS = 2500

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

function cssValue(v) {
  return typeof v === 'number' ? String(v) : v
}

// Split a status line (array of {ch, tpl}) into a left, middle and right part.
// Parts are separated by two or more spaces; which group a part belongs to depends on
// where it sat in the line the game drew (left, middle or right third). A single part
// with equal space on both sides was centred.
export function analyzeStatus(src) {
  const text = src.map(c => c.ch).join('')
  const n = text.length
  const segs = []
  const re = /\S+(?: \S+)*/g
  let m
  while ((m = re.exec(text))) segs.push({ start: m.index, end: m.index + m[0].length })
  const lead = n - text.trimStart().length
  const trail = n - text.trimEnd().length
  const fillTpl = (src[Math.min(lead, n - 1)] || src[0] || {}).tpl || null
  const groups = { left: [], mid: [], right: [] }
  for (const seg of segs) {
    const c = (seg.start + seg.end) / 2 / n
    if (segs.length === 1) groups[lead > 2 && Math.abs(lead - trail) <= 2 ? 'mid' : 'left'].push(seg)
    else if (seg === segs[0] || c < 0.34) groups.left.push(seg)
    else if (c > 0.6 || seg === segs[segs.length - 1]) groups.right.push(seg)
    else if (Math.abs(c - 0.5) <= 0.12) groups.mid.push(seg)
    else groups.left.push(seg) // off-centre: keeps its distance to the left part
  }
  const block = (g) => g.length ? { start: g[0].start, end: g[g.length - 1].end } : null
  return { n, lead, trail, fillTpl, left: block(groups.left), mid: block(groups.mid), right: block(groups.right) }
}

export class Display {
  constructor(gameport, opts) {
    this.port = gameport
    this.opts = opts // {send, onTurn, onDisable, fileref, blorb, getSettings, wordSink, onMeta, history}
    this.windows = new Map()
    this.gen = 0
    this.waiting = false
    this.queue = []
    this.inputs = new Map() // window id -> input request
    this.timer = null
    this.disabled = false
    this.metrics = null
    this.autoCommands = []
    this.transcript = []
    this.lastCommand = null
    this.historyPos = -1
    this.charHandler = (e) => this.onCharKey(e)
    document.addEventListener('keydown', this.charHandler, true)
    this.resizeObs = new ResizeObserver(() => this.scheduleArrange())
    this.resizeObs.observe(this.port)
  }

  destroy() {
    document.removeEventListener('keydown', this.charHandler, true)
    this.resizeObs.disconnect()
    if (this.timer) clearInterval(this.timer)
    clearTimeout(this.arrangeTimer)
    this.port.innerHTML = ''
    this.windows.clear()
  }

  // ---------- events ----------

  send(ev) {
    if (this.disabled && ev.type !== 'specialresponse') return
    if (this.waiting) {
      if (ev.type === 'timer' || ev.type === 'arrange') {
        if (this.queue.some(q => q.type === ev.type)) return
      }
      this.queue.push(ev)
      return
    }
    this.waiting = true
    ev.gen = this.gen
    if (ev.type === 'arrange' || ev.type === 'init') ev.metrics = this.metrics
    this.opts.send(ev)
  }

  setCharWidthVar() {
    if (this.metrics) this.port.style.setProperty('--grid-cw', `${this.metrics.gridcharwidth}px`)
  }

  start() {
    this.metrics = this.measure()
    this.setCharWidthVar()
    this.send({ type: 'init', support: ['timer', 'graphics', 'graphicswin', 'hyperlinks'], tzoffset: -new Date().getTimezoneOffset() })
  }

  scheduleArrange() {
    if (!this.metrics) return
    clearTimeout(this.arrangeTimer)
    this.arrangeTimer = setTimeout(() => this.rearrange(), 120)
  }

  rearrange() {
    if (!this.metrics || this.disabled) return
    const m = this.measure()
    if (JSON.stringify(m) === JSON.stringify(this.metrics)) return
    this.metrics = m
    this.setCharWidthVar()
    this.send({ type: 'arrange' })
  }

  measure() {
    const port = this.port
    const probe = el('div', 'measure')
    const buf = el('div', 'win win-buffer')
    const bline = el('div', 'par')
    const bspan = el('span', 'Style_normal', '0000000000')
    bline.appendChild(bspan)
    buf.appendChild(bline)
    const grid = el('div', 'win win-grid')
    const gline = el('div', 'gridline')
    const gspan = el('span', 'Style_normal', '0000000000')
    gline.appendChild(gspan)
    grid.appendChild(gline)
    const gfx = el('div', 'win win-graphics')
    probe.append(buf, grid, gfx)
    port.appendChild(probe)
    const pad = (e) => {
      const cs = getComputedStyle(e)
      return {
        x: parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth),
        y: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth),
      }
    }
    const bp = pad(buf), gp = pad(grid), xp = pad(gfx)
    const bRect = bspan.getBoundingClientRect()
    const gRect = gspan.getBoundingClientRect()
    const metrics = {
      width: Math.floor(port.clientWidth),
      height: Math.floor(port.clientHeight),
      buffercharwidth: bRect.width / 10,
      buffercharheight: bline.getBoundingClientRect().height,
      buffermarginx: bp.x,
      buffermarginy: bp.y,
      gridcharwidth: gRect.width / 10,
      gridcharheight: gline.getBoundingClientRect().height,
      gridmarginx: gp.x,
      gridmarginy: gp.y,
      graphicsmarginx: xp.x,
      graphicsmarginy: xp.y,
      inspacingx: 0,
      inspacingy: 0,
      outspacingx: 0,
      outspacingy: 0,
    }
    probe.remove()
    return metrics
  }

  // ---------- updates ----------

  update(data) {
    this.waiting = false
    if (data.type === 'error') {
      this.opts.onError && this.opts.onError(data.message)
      return this.flushQueue()
    }
    if (data.type === 'pass') return this.flushQueue()
    if (data.type === 'retry') { setTimeout(() => this.send({ type: 'refresh' }), 1000); return }
    if (data.type !== 'update') return this.flushQueue()
    if (data.gen === this.gen && this.gen !== 0) return this.flushQueue()
    this.gen = data.gen
    const turn = { status: null, paragraphs: [], command: this.lastCommand }
    this.lastCommand = null

    if (data.input) this.cancelInputs(data.input)
    if (data.windows) this.updateWindows(data.windows)
    if (data.content) for (const c of data.content) this.updateContent(c, turn)
    if (data.input) this.updateInputs(data.input)
    if (data.timer !== undefined) {
      if (this.timer) clearInterval(this.timer)
      this.timer = null
      if (data.timer) this.timer = setInterval(() => { if (!this.waiting) this.send({ type: 'timer' }) }, data.timer)
    }
    if (data.specialinput) this.handleSpecial(data.specialinput)
    if (data.disable) {
      this.disabled = true
      this.cancelInputs([])
      if (this.timer) clearInterval(this.timer)
      this.opts.onDisable && this.opts.onDisable()
    }

    // Status line text (first grid window, first line)
    const grids = [...this.windows.values()].filter(w => w.type === 'grid' && !w.hidden).sort((a, b) => a.top - b.top)
    if (grids.length) turn.status = grids[0].lines.map(l => (l._src ? l._src.map(c => c.ch).join('') : l.textContent)).filter(t => t.trim())[0] || ''
    const lineWin = [...this.inputs.entries()].find(([, inp]) => inp.type === 'line')
    turn.lineInput = !!lineWin
    turn.charInput = [...this.inputs.values()].some(i => i.type === 'char')
    this.opts.onTurn && this.opts.onTurn(turn)

    this.flushQueue()
    if (lineWin && this.autoCommands.length && !this.queue.length) {
      const cmd = this.autoCommands.shift()
      setTimeout(() => this.submitLine(cmd), 160)
    }
  }

  flushQueue() {
    if (!this.waiting && this.queue.length) {
      const ev = this.queue.shift()
      this.send(ev)
    }
  }

  captureScroll() {
    const snap = new Map()
    for (const w of this.windows.values()) {
      if (w.type !== 'buffer') continue
      const e = w.el
      snap.set(w, e.scrollTop + e.clientHeight >= e.scrollHeight - 30)
    }
    return snap
  }

  restoreScroll(snap) {
    for (const [w, atBottom] of snap) if (atBottom) w.el.scrollTop = w.el.scrollHeight
  }

  updateWindows(list) {
    const snap = this.captureScroll()
    requestAnimationFrame(() => this.restoreScroll(snap))
    const seen = new Set()
    for (const w of list) {
      seen.add(w.id)
      let win = this.windows.get(w.id)
      if (!win || win.type !== w.type) {
        if (win) win.el.remove()
        win = this.createWindow(w)
        this.windows.set(w.id, win)
      }
      Object.assign(win, { left: w.left, top: w.top, width: w.width, height: w.height, rock: w.rock, hidden: !!w.hidden })
      const s = win.el.style
      s.left = `${w.left}px`
      s.top = `${w.top}px`
      // Windows that reach the right/bottom edge stay attached to it, so they follow the
      // window size immediately instead of being clipped until the game has re-arranged
      const m = this.metrics
      const toRight = m && Math.abs(w.left + w.width - m.width) <= 2
      const toBottom = m && Math.abs(w.top + w.height - m.height) <= 2
      s.width = toRight ? 'auto' : `${w.width}px`
      s.right = toRight ? '0px' : ''
      s.height = toBottom ? 'auto' : `${w.height}px`
      s.bottom = toBottom ? '0px' : ''
      s.display = w.hidden ? 'none' : ''
      if (w.styles) this.applyWindowStyles(win, w.styles)
      if (w.type === 'grid') this.resizeGrid(win, w.gridwidth, w.gridheight)
      if (w.type === 'graphics') this.resizeGraphics(win, w.graphwidth, w.graphheight)
    }
    for (const [id, win] of this.windows) {
      if (!seen.has(id)) {
        win.el.remove()
        if (win.styleEl) win.styleEl.remove()
        this.windows.delete(id)
        this.inputs.delete(id)
      }
    }
    this.markMainWindow()
  }

  markMainWindow() {
    let best = null
    for (const w of this.windows.values()) {
      if (w.type !== 'buffer' || w.hidden) continue
      if (!best || w.width * w.height > best.width * best.height) best = w
    }
    for (const w of this.windows.values()) w.el.classList.toggle('main', w === best)
    this.mainWindow = best
  }

  createWindow(w) {
    const e = el('div', `win win-${w.type}`)
    e.id = `win-${w.id}`
    e.dataset.id = w.id
    this.port.appendChild(e)
    const win = { id: w.id, type: w.type, el: e, lines: [], styleEl: null }
    if (w.type === 'buffer') {
      win.inner = el('div', 'buffer-inner')
      e.appendChild(win.inner)
      win.lastPar = null
      e.addEventListener('mouseup', () => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed) this.focusInput()
      })
    }
    if (w.type === 'graphics') {
      win.canvas = el('canvas')
      e.appendChild(win.canvas)
      win.color = '#ffffff'
      win.drawChain = Promise.resolve()
      win.canvas.addEventListener('mousedown', (ev) => {
        const inp = this.inputs.get(w.id)
        if (!inp || !inp.mouse) return
        const r = win.canvas.getBoundingClientRect()
        this.send({ type: 'mouse', window: w.id, x: Math.round((ev.clientX - r.left) * win.gw / r.width), y: Math.round((ev.clientY - r.top) * win.gh / r.height) })
      })
    }
    if (w.type === 'grid') {
      e.addEventListener('mousedown', (ev) => {
        const inp = this.inputs.get(w.id)
        if (!inp || !inp.mouse || !this.metrics) return
        const r = e.getBoundingClientRect()
        const cs = getComputedStyle(e)
        const x = Math.floor((ev.clientX - r.left - parseFloat(cs.paddingLeft)) / this.metrics.gridcharwidth)
        const y = Math.floor((ev.clientY - r.top - parseFloat(cs.paddingTop)) / this.metrics.gridcharheight)
        if (x >= 0 && y >= 0) this.send({ type: 'mouse', window: w.id, x, y })
      })
    }
    return win
  }

  applyWindowStyles(win, styles) {
    const allowColors = this.opts.getSettings().gameColors
    let css = ''
    for (const [sel, props] of Object.entries(styles)) {
      const target = sel ? `#win-${win.id} ${sel.endsWith('_par') ? '.par' + sel : sel}` : `#win-${win.id}`
      let body = ''
      for (const [k, v] of Object.entries(props)) {
        if (k === 'monospace') { if (v) body += 'font-family: var(--font-mono);'; continue }
        if (k === 'reverse') continue
        if ((k === 'color' || k === 'background-color') && !allowColors) continue
        if (win.type === 'grid' && (k === 'font-size' || k === 'margin-left' || k === 'text-indent')) continue
        body += `${k}: ${cssValue(v)};`
      }
      if (body) css += `${target} { ${body} }\n`
    }
    if (!win.styleEl) {
      win.styleEl = el('style')
      document.head.appendChild(win.styleEl)
    }
    win.styleEl.textContent = css
  }

  resizeGrid(win, w, h) {
    win.gw = w
    win.gh = h
    while (win.lines.length < h) {
      const line = el('div', 'gridline')
      line.textContent = ' '.repeat(w)
      win.el.appendChild(line)
      win.lines.push(line)
    }
    while (win.lines.length > h) win.lines.pop().remove()
  }

  resizeGraphics(win, w, h) {
    if (win.gw === w && win.gh === h) return
    const dpr = window.devicePixelRatio || 1
    let old = null
    if (win.gw && win.gh) {
      old = document.createElement('canvas')
      old.width = win.canvas.width
      old.height = win.canvas.height
      old.getContext('2d').drawImage(win.canvas, 0, 0)
    }
    win.gw = w
    win.gh = h
    win.canvas.width = Math.max(1, Math.round(w * dpr))
    win.canvas.height = Math.max(1, Math.round(h * dpr))
    win.canvas.style.width = `${w}px`
    win.canvas.style.height = `${h}px`
    const ctx = win.canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (old) ctx.drawImage(old, 0, 0, old.width / dpr, old.height / dpr)
  }

  // ---------- content ----------

  colorAllowed() {
    return this.opts.getSettings().gameColors
  }

  applyWinColors(win, c) {
    if (!this.colorAllowed()) return
    if (c.bg !== undefined) win.el.style.backgroundColor = c.bg || ''
    if (c.fg !== undefined) win.el.style.color = c.fg || ''
  }

  makeRun(win, run) {
    if (run.special === 'image') return this.makeImage(win, run)
    const span = el('span', `Style_${run.style || 'normal'}`)
    span.textContent = run.text
    const css = run.css_styles
    if (css) {
      let fg = this.colorAllowed() ? css.color : null
      let bg = this.colorAllowed() ? css['background-color'] : null
      if (css.reverse) {
        if (win.type === 'grid' && !fg && !bg) {
          span.classList.add('grid-reverse')
        } else if (fg || bg) {
          ;[fg, bg] = [bg || 'var(--bg)', fg || 'var(--fg)']
        } else {
          span.classList.add('reverse')
        }
      }
      if (fg) span.style.color = fg
      if (bg) span.style.backgroundColor = bg
      if (css.monospace) span.classList.add('mono')
      if (css['font-weight']) span.style.fontWeight = css['font-weight']
      if (css['font-style']) span.style.fontStyle = css['font-style']
      if (css['font-size'] && win.type !== 'grid') span.style.fontSize = css['font-size']
    }
    if (run.hyperlink) {
      span.classList.add('hyperlink')
      span.addEventListener('click', (e) => {
        e.preventDefault()
        const inp = this.inputs.get(win.id)
        if (inp && inp.hyperlink) this.send({ type: 'hyperlink', window: win.id, value: run.hyperlink })
      })
    }
    return span
  }

  makeImage(win, run) {
    const blorb = this.opts.blorb()
    const url = blorb && blorb.url(run.image)
    const img = el('img', `glk-image align-${run.alignment || 'inlineup'}`)
    if (url) img.src = url
    img.alt = run.alttext || ''
    if (run.width) img.style.width = `${run.width}px`
    if (run.widthratio) img.style.width = `${run.widthratio * 100}%`
    if (run.height) img.style.height = `${run.height}px`
    else img.style.height = 'auto'
    if (run.widthratio) img.style.maxWidth = '100%'
    else img.style.maxWidth = '100%'
    if (run.hyperlink) {
      img.classList.add('hyperlink')
      img.addEventListener('click', () => {
        const inp = this.inputs.get(win.id)
        if (inp && inp.hyperlink) this.send({ type: 'hyperlink', window: win.id, value: run.hyperlink })
      })
    }
    return img
  }

  normalizeContent(content) {
    // Accept both the object form and the legacy ['style', 'text', ...] form
    const out = []
    if (!content) return out
    for (let i = 0; i < content.length; i++) {
      const r = content[i]
      if (typeof r === 'string') { out.push({ style: r, text: content[i + 1] }); i++ }
      else out.push(r)
    }
    return out
  }

  updateContent(c, turn) {
    const win = this.windows.get(c.id)
    if (!win) return
    if (win.type === 'buffer') return this.updateBuffer(win, c, turn)
    if (win.type === 'grid') return this.updateGrid(win, c)
    if (win.type === 'graphics') return this.updateGraphics(win, c)
  }

  updateBuffer(win, c, turn) {
    if (c.clear) {
      win.inner.innerHTML = ''
      win.lastPar = null
      win.firstNew = null
      this.applyWinColors(win, c)
    }
    const isMain = win === this.mainWindow
    let firstNew = null
    for (const p of c.text || []) {
      const runs = this.normalizeContent(p.content)
      let par
      if (p.append && win.lastPar) {
        par = win.lastPar
      } else {
        par = el('div', 'par')
        win.inner.appendChild(par)
        win.lastPar = par
        if (!firstNew) firstNew = par
        if (runs.length && runs[0].style) par.classList.add(`Style_${runs[0].style}_par`)
      }
      if (p.flowbreak) par.appendChild(el('div', 'flowbreak'))
      for (const r of runs) {
        if (r.special === 'image') { par.appendChild(this.makeImage(win, r)); continue }
        if (r.text === undefined || r.text === '') continue
        par.appendChild(this.makeRun(win, r))
        if (r.style === 'input' && !firstNew) firstNew = par
      }
      if (!par.childNodes.length) par.classList.add('empty')
      else par.classList.remove('empty')
      // Turn record for the automapper and transcript
      if (isMain) {
        const text = runs.filter(r => r.text).map(r => r.text).join('')
        const styles = new Set(runs.filter(r => r.text && r.text.trim()).map(r => r.style))
        if (p.append && turn.paragraphs.length) {
          const last = turn.paragraphs[turn.paragraphs.length - 1]
          last.text += text
          styles.forEach(s => last.styles.add(s))
        } else {
          turn.paragraphs.push({ text, styles })
        }
        if (p.append && this.transcript.length) this.transcript[this.transcript.length - 1] += text
        else this.transcript.push(text)
        if (this.opts.wordSink && text) this.opts.wordSink(text)
      }
    }
    // Trim very long scrollback
    const kids = win.inner.children
    if (kids.length > MAX_PARAGRAPHS) {
      const remove = kids.length - MAX_PARAGRAPHS
      for (let i = 0; i < remove; i++) win.inner.firstElementChild.remove()
    }
    if (this.transcript.length > 20000) this.transcript.splice(0, 5000)
    if (firstNew) this.scrollBuffer(win, firstNew)
  }

  scrollBuffer(win, firstNew) {
    const e = win.el
    requestAnimationFrame(() => {
      const maxScroll = e.scrollHeight - e.clientHeight
      const offset = firstNew.offsetTop - parseFloat(getComputedStyle(e).paddingTop || 0) - 4
      const target = Math.max(0, Math.min(maxScroll, offset))
      const smooth = this.opts.getSettings().smoothScroll
      e.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' })
    })
  }

  updateGrid(win, c) {
    if (c.clear) {
      for (const l of win.lines) l.textContent = ' '.repeat(win.gw || 0)
      this.applyWinColors(win, c)
    }
    if (c.clear) for (const l of win.lines) { l._src = null; l._layout = null; l.classList.remove('status-line'); l.style.paddingLeft = l.style.paddingRight = '' }
    for (const line of c.lines || []) {
      const l = win.lines[line.line]
      if (!l) continue
      l.innerHTML = ''
      const runs = this.normalizeContent(line.content)
      if (!runs.length) l.textContent = ' '.repeat(win.gw || 0)
      for (const r of runs) l.appendChild(this.makeRun(win, r))
      // Remember what the game drew, so the line can be re-laid out when the window width changes
      l._src = []
      for (const node of l.childNodes) {
        const tpl = node.nodeType === 1 ? node : null
        for (const ch of node.textContent) l._src.push({ ch, tpl })
      }
      l._layout = null
    }
    this.reflowGrid(win)
  }

  // ---------- status line layout ----------
  //
  // Games draw their status line for a fixed number of columns and align the score with
  // spaces. That breaks as soon as the window width changes (most Z-machine games only
  // redraw on the next turn, so the score is cut off or a gap remains) and with
  // proportional status fonts. So short grid windows (status lines) are laid out with
  // CSS instead: the left part stays left, the right part right-aligned and a centred
  // part centred – for any width, live while resizing.

  reflowAllGrids() {
    for (const w of this.windows.values()) if (w.type === 'grid') this.reflowGrid(w)
  }

  reflowGrid(win) {
    if (win.type !== 'grid' || !win.lines.length) return
    // Status bars: short grid windows (Hugo uses 4–5 lines with only one or two filled)
    const filled = win.lines.filter(l => l._src && l._src.some(c => c.ch !== ' ')).length
    const status = win.lines.length <= 5 && filled <= 3
    for (const l of win.lines) {
      const src = l._src
      if (!src || !src.length || l._layout === status) continue
      l.classList.remove('has-mid')
      if (status) this.layoutStatusLine(l, src)
      else this.renderGridChars(l, src)
      l._layout = status
    }
  }

  layoutStatusLine(l, src) {
    const a = analyzeStatus(src)
    l.innerHTML = ''
    l.classList.add('status-line')
    const cw = 'var(--grid-cw)'
    l.style.paddingLeft = `calc(${Math.min(a.lead, 3)} * ${cw})`
    l.style.paddingRight = `calc(${Math.min(a.trail, 6)} * ${cw})`
    if (a.fillTpl) {
      // Background (e.g. reverse video) across the whole line
      const bg = a.fillTpl.cloneNode(false)
      bg.textContent = ''
      bg.classList.add('status-bg')
      l.appendChild(bg)
    }
    const part = (b, cls) => {
      const e = document.createElement('span')
      e.className = `status-part ${cls}`
      this.renderGridChars(e, src.slice(b.start, b.end), true)
      return e
    }
    l.classList.toggle('has-mid', !!a.mid)
    if (a.left) l.appendChild(part(a.left, 'status-left'))
    l.appendChild(Object.assign(document.createElement('span'), { className: 'status-gap' }))
    if (a.mid) l.appendChild(part(a.mid, 'status-mid'))
    if (a.right) l.appendChild(part(a.right, 'status-right'))
  }

  renderGridChars(l, chars, append = false) {
    if (!append) {
      l.innerHTML = ''
      l.classList.remove('status-line')
      l.style.paddingLeft = ''
      l.style.paddingRight = ''
    }
    let cur, text = ''
    const flush = () => {
      if (!text) return
      const node = cur ? cur.cloneNode(false) : document.createElement('span')
      node.textContent = text
      l.appendChild(node)
    }
    for (const c of chars) {
      if (c.tpl !== cur) { flush(); cur = c.tpl; text = '' }
      text += c.ch
    }
    flush()
  }

  updateGraphics(win, c) {
    const ops = c.draw || []
    win.drawChain = win.drawChain.then(async () => {
      const ctx = win.canvas.getContext('2d')
      for (const op of ops) {
        if (op.special === 'setcolor') win.color = op.color
        else if (op.special === 'fill') {
          ctx.fillStyle = op.color || win.color
          if (op.x === undefined) ctx.fillRect(0, 0, win.gw, win.gh)
          else ctx.fillRect(op.x, op.y, op.width, op.height)
        } else if (op.special === 'image') {
          const blorb = this.opts.blorb()
          const img = blorb && await blorb.image(op.image)
          if (img) ctx.drawImage(img, op.x, op.y, op.width, op.height)
        }
      }
    })
  }

  // ---------- input ----------

  cancelInputs(list) {
    const keep = new Map(list.map(i => [i.id, i]))
    for (const [id, inp] of this.inputs) {
      const n = keep.get(id)
      if (!n || n.type !== inp.type || n.gen !== inp.gen) {
        if (inp.el) inp.el.remove()
        if (inp.hint) inp.hint.remove()
        this.inputs.delete(id)
      }
    }
  }

  updateInputs(list) {
    for (const req of list) {
      const win = this.windows.get(req.id)
      if (!win) continue
      const existing = this.inputs.get(req.id)
      if (existing && existing.gen === req.gen && existing.type === req.type) {
        Object.assign(existing, { hyperlink: req.hyperlink, mouse: req.mouse })
        if (existing.el && win.type === 'buffer' && win.lastPar && existing.el.parentNode !== win.lastPar) {
          win.lastPar.appendChild(existing.el)
          win.lastPar.classList.add('has-input')
        }
        continue
      }
      const inp = Object.assign({}, req)
      if (req.type === 'line') {
        const input = el('input', 'line-input')
        input.type = 'text'
        input.autocomplete = 'off'
        input.spellcheck = false
        if (req.maxlen) input.maxLength = req.maxlen
        if (req.initial) input.value = req.initial
        input.addEventListener('keydown', (e) => this.onLineKey(e, win, inp))
        input.addEventListener('input', () => this.opts.onTyping && this.opts.onTyping(input))
        inp.el = input
        if (win.type === 'buffer') {
          if (!win.lastPar) {
            win.lastPar = el('div', 'par')
            win.inner.appendChild(win.lastPar)
          }
          win.lastPar.classList.remove('empty')
          win.lastPar.classList.add('has-input')
          win.lastPar.appendChild(input)
        } else if (win.type === 'grid') {
          input.classList.add('grid-input')
          input.style.left = `calc(${(req.xpos || 0) * this.metrics.gridcharwidth}px + var(--grid-pad-x))`
          input.style.top = `calc(${(req.ypos || 0) * this.metrics.gridcharheight}px + var(--grid-pad-y))`
          input.style.width = `${Math.max(1, (win.gw - (req.xpos || 0))) * this.metrics.gridcharwidth}px`
          win.el.appendChild(input)
        }
      } else if (req.type === 'char' && win.type === 'buffer') {
        inp.hint = el('span', 'char-hint')
        if (!win.lastPar) { win.lastPar = el('div', 'par'); win.inner.appendChild(win.lastPar) }
        win.lastPar.appendChild(inp.hint)
      }
      this.inputs.set(req.id, inp)
    }
    this.focusInput()
  }

  focusInput() {
    const active = document.activeElement
    if (active && active.closest && active.closest('.no-steal')) return
    for (const inp of this.inputs.values()) {
      if (inp.el) {
        inp.el.focus({ preventScroll: true })
        return
      }
    }
  }

  currentLineInput() {
    for (const inp of this.inputs.values()) if (inp.type === 'line' && inp.el) return inp
    return null
  }

  submitLine(text, terminator) {
    const inp = this.currentLineInput()
    if (!inp) return false
    const id = [...this.inputs.entries()].find(([, i]) => i === inp)[0]
    this.lastCommand = text
    const ev = { type: 'line', window: id, value: text }
    if (terminator) ev.terminator = terminator
    if (text.trim() && this.opts.history) this.opts.history.push(text)
    this.historyPos = -1
    this.opts.onSubmit && this.opts.onSubmit(text)
    inp.el.remove()
    this.inputs.delete(id)
    this.send(ev)
    return true
  }

  typeCommand(text) {
    // Used by menus, map navigation etc.
    if (this.currentLineInput()) return this.submitLine(text)
    return false
  }

  queueCommands(list) {
    this.autoCommands = list.slice()
    if (this.currentLineInput() && !this.waiting && this.autoCommands.length) {
      this.submitLine(this.autoCommands.shift())
    }
  }

  cancelAutoCommands() {
    this.autoCommands = []
  }

  onLineKey(e, win, inp) {
    const input = inp.el
    if (e.key === 'Enter') {
      e.preventDefault()
      const value = input.value
      if (this.opts.onMeta && value.trim().startsWith('/') && this.opts.onMeta(value.trim())) {
        input.value = ''
        return
      }
      this.cancelAutoCommands()
      this.submitLine(value)
      return
    }
    const hist = this.opts.history
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && hist && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      const h = hist.list()
      if (!h.length) return
      if (this.historyPos === -1) this.savedDraft = input.value
      if (e.key === 'ArrowUp') this.historyPos = Math.min(h.length - 1, this.historyPos + 1)
      else this.historyPos = Math.max(-1, this.historyPos - 1)
      input.value = this.historyPos === -1 ? (this.savedDraft || '') : h[h.length - 1 - this.historyPos]
      input.setSelectionRange(input.value.length, input.value.length)
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      this.opts.onTab && this.opts.onTab(input, e.shiftKey)
      return
    }
    const term = KEY_NAMES[e.key]
    if (term && inp.terminators && inp.terminators.includes(term)) {
      e.preventDefault()
      this.submitLine(input.value, term)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      input.value = ''
      this.opts.onTyping && this.opts.onTyping(input)
      return
    }
    if (this.opts.onLineKey && this.opts.onLineKey(e, input)) e.preventDefault()
    // Page scrolling of the main window
    if ((e.key === 'PageUp' || e.key === 'PageDown') && this.mainWindow) {
      e.preventDefault()
      const m = this.mainWindow.el
      m.scrollBy({ top: (e.key === 'PageUp' ? -1 : 1) * m.clientHeight * 0.85, behavior: 'smooth' })
    }
  }

  onCharKey(e) {
    const entry = [...this.inputs.entries()].find(([, i]) => i.type === 'char')
    if (!entry || this.disabled) return
    const t = e.target
    if (t && t.closest && t.closest('.no-steal')) return
    if (e.metaKey || (e.ctrlKey && e.key.length === 1)) return
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead'].includes(e.key)) return
    let value = KEY_NAMES[e.key]
    if (!value) {
      if (e.key.length !== 1) return
      value = e.key
    }
    e.preventDefault()
    e.stopPropagation()
    const [id, inp] = entry
    if (inp.hint) inp.hint.remove()
    this.inputs.delete(id)
    this.send({ type: 'char', window: id, value })
  }

  async handleSpecial(spec) {
    if (spec.type !== 'fileref_prompt') return
    let value = null
    try {
      const p = await this.opts.fileref(spec)
      value = p ? { filename: p } : null
    } catch {}
    this.send({ type: 'specialresponse', response: 'fileref_prompt', value })
  }

  transcriptText() {
    return this.transcript.join('\n')
  }
}
