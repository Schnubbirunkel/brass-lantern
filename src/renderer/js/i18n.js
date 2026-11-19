// Interface translations. German strings are the keys; English is the default language.
import en from '../../shared/en.json' with { type: 'json' }

let lang = 'en'

export function setLang(l) { lang = l === 'de' ? 'de' : 'en' }
export function getLang() { return lang }
export function locale() { return lang === 'de' ? 'de-DE' : 'en-GB' }

export function t(key, vars) {
  let s = lang === 'de' ? key : (en[key] ?? key)
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m))
  return s
}
