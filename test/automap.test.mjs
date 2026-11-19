import { Automap, parseDirection } from '../src/renderer/js/automap.js'
const S = { mapTwoWay: true, dirLanguage: 'en', mapDetect: 'auto' }
const m = new Automap(null, () => S)
const turn = (command, status, header, desc) => ({ lineInput: true, command, status, paragraphs: header ? [{ text: header, styles: new Set(['subheader']) }, { text: desc || 'A room.', styles: new Set(['normal']) }] : [{ text: 'Nothing.', styles: new Set(['normal']) }] })
const log = () => console.log(m.list().map(r => `${r.id}${m.current === r ? '*' : ''}:${r.name}@${r.x},${r.y},${r.z} ${JSON.stringify(Object.fromEntries(Object.entries(r.exits).map(([d, e]) => [d, e.to + (e.assumed ? '?' : '')])))}`).join('\n') + '\n--')
m.observe(turn(null, ' Drawbridge   N', 'Drawbridge', 'Castle desc'))
m.observe(turn('n', ' Drawbridge   N', 'Drawbridge', 'Castle desc'))  // answered "no"
m.observe(turn('s', ' Drawbridge   N', null))
log()
m.observe(turn('n', ' Foyer', 'Foyer', 'Foyer desc'))
m.observe(turn('up', ' Attic', 'Attic', 'Attic desc'))
m.observe(turn('down', ' Foyer', 'Foyer', 'Foyer desc'))
m.observe(turn('go west', ' Forest', 'Forest', 'Forest A'))
m.observe(turn('w', ' Forest', 'Forest', 'Forest B'))
m.observe(turn('e', ' Forest', 'Forest', 'Forest A'))
m.observe(turn('look', ' Forest', 'Forest', 'Forest A'))
log()
console.log(m.route(m.current.id, 1).map(s => s.cmd))
for (const c of ['n', 'go north', 'walk to the north', 'u', 'climb up', 'o', 'nordosten', 'geh nach süden', 'get out', 'no', 'x lamp']) console.log(c, '=>', parseDirection(c, 'en'), parseDirection(c, 'de'))
