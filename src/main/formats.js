'use strict'
// Format detection and metadata extraction for story files.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ENGINES = {
  bocfel: { label: 'Bocfel', format: 'Z-code' },
  glulxe: { label: 'Glulxe', format: 'Glulx' },
  git: { label: 'Git', format: 'Glulx' },
  tads: { label: 'TADS', format: 'TADS' },
  hugo: { label: 'Hugo', format: 'Hugo' },
  scare: { label: 'SCARE', format: 'ADRIFT' },
}

const EXTENSIONS = [
  'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z8', 'zblorb', 'zlb', 'dat',
  'ulx', 'gblorb', 'glb', 'blorb', 'blb',
  'gam', 't3',
  'hex',
  'taf',
]

function readChunks(buf) {
  // Parse an IFF FORM IFRS blorb. Returns {chunks:[{type, offset, length}], resources:{Pict:{n:chunk}, Exec:{}, Snd:{}}}
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'FORM' || buf.toString('latin1', 8, 12) !== 'IFRS') return null
  const chunks = []
  let pos = 12
  const end = Math.min(buf.length, 8 + buf.readUInt32BE(4))
  while (pos + 8 <= end) {
    const type = buf.toString('latin1', pos, pos + 4)
    const length = buf.readUInt32BE(pos + 4)
    chunks.push({ type, offset: pos, dataOffset: pos + 8, length })
    pos += 8 + length + (length & 1)
  }
  const byOffset = new Map(chunks.map(c => [c.offset, c]))
  const resources = { Pict: {}, Exec: {}, Snd: {}, Data: {} }
  const ridx = chunks.find(c => c.type === 'RIdx')
  if (ridx) {
    const count = buf.readUInt32BE(ridx.dataOffset)
    for (let i = 0; i < count; i++) {
      const p = ridx.dataOffset + 4 + i * 12
      const usage = buf.toString('latin1', p, p + 4).trim()
      const num = buf.readUInt32BE(p + 4)
      const start = buf.readUInt32BE(p + 8)
      const chunk = byOffset.get(start)
      if (chunk && resources[usage]) resources[usage][num] = chunk
    }
  }
  return { chunks, resources }
}

function engineForExec(type) {
  switch (type) {
    case 'ZCOD': return 'bocfel'
    case 'GLUL': return 'glulxe'
    case 'TAD2': case 'TAD3': return 'tads'
    case 'HUGO': return 'hugo'
    case 'ADRI': return 'scare'
  }
  return null
}

function detect(buf, filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  const blorb = readChunks(buf)
  if (blorb) {
    const exec = blorb.resources.Exec[0] || blorb.chunks.find(c => ['ZCOD', 'GLUL', 'TAD2', 'TAD3', 'HUGO', 'ADRI'].includes(c.type))
    const engine = exec && engineForExec(exec.type)
    return { engine, blorb }
  }
  const head = buf.toString('latin1', 0, 16)
  if (head.startsWith('Glul')) return { engine: 'glulxe' }
  if (head.startsWith('TADS2 bin')) return { engine: 'tads' }
  if (head.startsWith('T3-image')) return { engine: 'tads' }
  if (/^z[1-8]$/.test(ext) || ext === 'dat') {
    if (buf[0] >= 1 && buf[0] <= 8) return { engine: 'bocfel' }
  }
  if (ext === 'hex') return { engine: 'hugo' }
  if (ext === 'taf') return { engine: 'scare' }
  if (ext === 'ulx') return { engine: 'glulxe' }
  if (ext === 'gam' || ext === 't3') return { engine: 'tads' }
  // Last resort: a plausible Z-machine header
  if (buf.length > 64 && buf[0] >= 1 && buf[0] <= 8 && buf.readUInt16BE(14) < buf.length) return { engine: 'bocfel' }
  return { engine: null }
}

function unescapeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&')
}

function xmlTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return m ? unescapeXml(m[1].replace(/<br\s*\/?>/g, '\n').trim()) : null
}

function metadata(buf, filePath, info) {
  const meta = {
    title: path.basename(filePath).replace(/\.[^.]+$/, ''),
    author: null,
    headline: null,
    description: null,
    ifid: null,
    cover: null,
  }
  const blorb = info.blorb
  if (blorb) {
    const ifmd = blorb.chunks.find(c => c.type === 'IFmd')
    if (ifmd) {
      const xml = buf.toString('utf8', ifmd.dataOffset, ifmd.dataOffset + ifmd.length)
      meta.title = xmlTag(xml, 'title') || meta.title
      meta.author = xmlTag(xml, 'author')
      meta.headline = xmlTag(xml, 'headline')
      meta.description = xmlTag(xml, 'description')
      meta.ifid = xmlTag(xml, 'ifid')
    }
    const fspc = blorb.chunks.find(c => c.type === 'Fspc')
    if (fspc) {
      const num = buf.readUInt32BE(fspc.dataOffset)
      const pict = blorb.resources.Pict[num]
      if (pict && (pict.type === 'PNG ' || pict.type === 'JPEG')) {
        meta.cover = {
          mime: pict.type === 'PNG ' ? 'image/png' : 'image/jpeg',
          data: buf.subarray(pict.dataOffset, pict.dataOffset + pict.length),
        }
      }
    }
  }
  if (info.engine === 'tads' || info.engine === 'hugo') {
    // TADS GameInfo resource (plain text "Name: …" / "Byline: …")
    const idx = buf.indexOf('Name: ')
    let at = idx
    while (at >= 0) {
      const text = buf.toString('utf8', at, Math.min(buf.length, at + 4096))
      if (/^Name:\s*[^\r\n]+\r?\n(Byline|IFID|Headline|Desc|AuthorEmail|Genre)/.test(text)) {
        const field = (k) => { const m = text.match(new RegExp(`(?:^|\\n)${k}:\\s*([^\\r\\n]+)`)); return m ? m[1].trim() : null }
        meta.title = field('Name') || meta.title
        const by = field('Byline')
        if (by) meta.author = by.replace(/^by\s+/i, '')
        meta.headline = field('Headline') || meta.headline
        break
      }
      at = buf.indexOf('Name: ', at + 6)
    }
  }
  if (info.engine === 'bocfel' && !blorb && buf.length > 0x20) {
    const release = buf.readUInt16BE(2)
    const serial = buf.toString('latin1', 0x12, 0x18)
    meta.headline = `Version ${buf[0]} · Release ${release} · Serial ${serial}`
  }
  return meta
}

// Treaty of Babel identifiers. Returns candidates, best first.
function ifids(buf, info, meta) {
  const out = []
  const add = (x) => { if (x && !out.includes(x)) out.push(x) }
  if (meta.ifid) add(meta.ifid.trim().toUpperCase())
  let story = buf
  if (info.blorb) {
    const exec = info.blorb.resources.Exec[0]
    if (exec) story = buf.subarray(exec.dataOffset, exec.dataOffset + exec.length)
  }
  // Inform & co. embed "UUID://xxxxxxxx-xxxx-…//"
  const text = story.toString('latin1')
  const m = text.match(/UUID:\/\/([0-9A-Fa-f-]{36})\/\//)
  if (m) add(m[1].toUpperCase())
  if (info.engine === 'bocfel' && story.length > 0x20) {
    const release = story.readUInt16BE(2)
    const serial = story.toString('latin1', 0x12, 0x18)
    const checksum = story.readUInt16BE(0x1c).toString(16).toUpperCase().padStart(4, '0')
    if (/^[0-9A-Za-z]{6}$/.test(serial)) {
      const withSum = `ZCODE-${release}-${serial}-${checksum}`
      const plain = `ZCODE-${release}-${serial}`
      // Babel drops the checksum for Infocom-era serials (dates starting with 8 or 9, or 000000)
      if (/^[89]/.test(serial) || serial === '000000') { add(plain); add(withSum) } else { add(withSum); add(plain) }
    }
  }
  if (info.engine === 'glulxe' && story.length > 0x30 && story.toString('latin1', 0x24, 0x28) === 'Info') {
    const release = story.readUInt16BE(0x34)
    const serial = story.toString('latin1', 0x36, 0x3c)
    const checksum = story.readUInt32BE(0x20).toString(16).toUpperCase().padStart(8, '0')
    if (/^\d{6}$/.test(serial)) add(`GLULX-${release}-${serial}-${checksum}`)
  }
  if (info.engine === 'tads' || info.engine === 'hugo' || info.engine === 'scare') {
    const g = buf.toString('latin1').match(/\bIFID:\s*([0-9A-Fa-f-]{32,36})/)
    if (g) add(g[1].toUpperCase())
  }
  // Fallback for everything: the MD5 of the file
  add(crypto.createHash('md5').update(buf).digest('hex').toUpperCase())
  return out
}

function inspect(filePath) {
  const buf = fs.readFileSync(filePath)
  const info = detect(buf, filePath)
  const hash = crypto.createHash('sha1').update(buf).digest('hex')
  const meta = metadata(buf, filePath, info)
  return { engine: info.engine, hash, meta, size: buf.length, hasBlorb: !!info.blorb, ifids: ifids(buf, info, meta) }
}

module.exports = { ENGINES, EXTENSIONS, inspect, readChunks }
