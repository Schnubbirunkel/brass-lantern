'use strict'
// Interface translations for the main process (menus, dialogs). German strings are the keys.
const en = require('../shared/en.json')

let lang = 'en'

function setLang(l) { lang = l === 'de' ? 'de' : 'en' }

function t(key, vars) {
  let s = lang === 'de' ? key : (en[key] ?? key)
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m))
  return s
}

module.exports = { t, setLang }
