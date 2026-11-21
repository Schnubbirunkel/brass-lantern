// Path translation between the operating system and the interpreters.
//
// The interpreters run as WebAssembly and their Glk library (remglk-rs) treats every
// path the Unix way: only paths starting with "/" are absolute. A Windows path such as
// C:\Games\advent.z5 is therefore taken as relative and appended to the working
// directory, so on Windows no story could be opened and no game saved.
//
// We hand the interpreters "/C:/Games/advent.z5" instead and translate back whenever
// the interpreter reads or writes a file.
//
// For tests on Linux, LANTERN_FAKE_WIN=<root> pretends to be Windows: real paths below
// <root> appear as drive Z: (and LANTERN_FAKE_WIN_NOFIX=1 disables the translation to
// reproduce the original bug).

import path from 'node:path'

const FAKE_ROOT = process.env.LANTERN_FAKE_WIN || null
const NOFIX = !!process.env.LANTERN_FAKE_WIN_NOFIX
export const WINDOWS = process.platform === 'win32' || !!FAKE_ROOT

// An OS path as Windows would report it (only differs in fake mode)
export function osPath(p) {
  if (!FAKE_ROOT || !p) return p
  return 'Z:\\' + path.relative(FAKE_ROOT, p).split('/').join('\\')
}

// OS path -> path for the interpreter
export function toVm(p) {
  if (!WINDOWS || !p || NOFIX) return p
  const s = p.replace(/\\/g, '/')
  if (/^[A-Za-z]:(\/|$)/.test(s)) return '/' + s
  return s // UNC paths (//server/share) are already absolute for the interpreter
}

// Path from the interpreter -> path for Node's fs
export function fromVm(p) {
  if (!WINDOWS || !p) return p
  let s = p
  if (/^\/[A-Za-z]:(\/|$)/.test(s)) s = s.slice(1)
  if (FAKE_ROOT) {
    const m = s.replace(/\\/g, '/').match(/^[Zz]:\/?(.*)$/)
    if (m) return path.join(FAKE_ROOT, m[1])
    return s.startsWith('/') ? s : path.join(FAKE_ROOT, s)
  }
  return s
}
