import { relayoutStatus } from '../src/renderer/js/glkote.js'
const mk = (s) => [...s].map(ch => ({ ch, tpl: null }))
const show = (s, w) => '[' + relayoutStatus(mk(s), w).map(c => c.ch).join('') + ']'
const cases = [
  [' At End Of Road                                                   Score: 36    Moves: 1      ', 56],
  [' At End Of Road                           36/2          ', 93],
  [' Outside                                                                                Score: 0      ', 40],
  ['                    Chapter One: The Beginning                    ', 30],
  [' Kitchen               Brass Lantern Demo               Turns: 4 ', 70],
  [' Kitchen               Brass Lantern Demo               Turns: 4 ', 40],
  [' A Very Long Room Name Indeed In The Castle Tower        Score: 10 ', 30],
  ['', 20],
]
for (const [s, w] of cases) console.log(String(w).padStart(3), show(s, w))
