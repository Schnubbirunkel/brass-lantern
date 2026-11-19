// Minimal Blorb reader for pictures (and future sounds) used by the display layer.

export class Blorb {
  constructor(bytes) {
    this.bytes = bytes
    this.pict = new Map() // num -> {type, start, length}
    this.urls = new Map()
    this.images = new Map()
    this.parse()
  }

  parse() {
    const b = this.bytes
    if (!b || b.length < 12) return
    const str = (o, n = 4) => String.fromCharCode(...b.subarray(o, o + n))
    const u32 = (o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
    if (str(0) !== 'FORM' || str(8) !== 'IFRS') return
    const chunks = new Map()
    let pos = 12
    const end = Math.min(b.length, 8 + u32(4))
    while (pos + 8 <= end) {
      const type = str(pos)
      const length = u32(pos + 4)
      chunks.set(pos, { type, start: pos + 8, length })
      if (type === 'RIdx') this.ridx = { start: pos + 8 }
      pos += 8 + length + (length & 1)
    }
    if (!this.ridx) return
    const count = u32(this.ridx.start)
    for (let i = 0; i < count; i++) {
      const p = this.ridx.start + 4 + i * 12
      const usage = str(p)
      const num = u32(p + 4)
      const chunk = chunks.get(u32(p + 8))
      if (usage === 'Pict' && chunk) this.pict.set(num, chunk)
    }
  }

  url(num) {
    if (this.urls.has(num)) return this.urls.get(num)
    const c = this.pict.get(num)
    if (!c) return null
    const mime = c.type === 'PNG ' ? 'image/png' : c.type === 'JPEG' ? 'image/jpeg' : null
    if (!mime) return null
    const url = URL.createObjectURL(new Blob([this.bytes.subarray(c.start, c.start + c.length)], { type: mime }))
    this.urls.set(num, url)
    return url
  }

  image(num) {
    if (this.images.has(num)) return this.images.get(num)
    const url = this.url(num)
    const p = new Promise((resolve) => {
      if (!url) return resolve(null)
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = url
    })
    this.images.set(num, p)
    return p
  }

  dispose() {
    for (const url of this.urls.values()) URL.revokeObjectURL(url)
    this.urls.clear()
    this.images.clear()
  }
}
