// Theme catalogue (styling lives in css/themes.css)

export const THEMES = [
  { id: 'lectrote', name: 'Lectrote · Klassisch', desc: 'Hell, ruhig, Lora-Serifen und schmale Lesespalte – wie Lectrote.', p: { bg: '#fefefe', fg: '#1c1c1c', st: '#e9e9e9', stfg: '#2a2a2a', in: '#1d4f8b', font: "'Lora', serif" } },
  { id: 'lectrote-sepia', name: 'Lectrote · Sepia', desc: 'Warmes Papier mit brauner Tinte.', p: { bg: '#f6efe0', fg: '#3b2f22', st: '#e8dcc3', stfg: '#3b2f22', in: '#8a4a10', font: "'Lora', serif" } },
  { id: 'lectrote-slate', name: 'Lectrote · Schiefer', desc: 'Dunkles Lesen bei Nacht, kühle Akzente.', p: { bg: '#23272e', fg: '#d7dae0', st: '#2d323b', stfg: '#c8ccd4', in: '#9cc3ff', font: "'Lora', serif" } },
  { id: 'gargoyle', name: 'Gargoyle', desc: 'Klassische Buchtypografie: Libertinus, Blocksatz, fette Eingabe.', p: { bg: '#ffffff', fg: '#000', st: '#ffffff', stfg: '#000', in: '#303080', font: "'Libertinus Serif', serif" } },
  { id: 'gargoyle-night', name: 'Gargoyle · Lampenlicht', desc: 'Gargoyle-Typografie auf dunklem Grund mit Messinglicht.', p: { bg: '#12161c', fg: '#d9d4c7', st: '#12161c', stfg: '#d9d4c7', in: '#f2c27a', font: "'Libertinus Serif', serif" } },
  { id: 'parchmap', name: 'Parchmap', desc: 'Wie die Webseite: dunkel, Roboto Mono, helle Raumkarten.', p: { bg: '#1e1e1e', fg: '#d3d3d3', st: '#1e1e1e', stfg: '#a9a9a9', in: '#ffffff', font: "'Roboto Mono', monospace" } },
  { id: 'parchmap-light', name: 'Parchmap · Hell', desc: 'Der helle Modus der Webseite.', p: { bg: '#d3d3d3', fg: '#1e1e1e', st: '#d3d3d3', stfg: '#444', in: '#000', font: "'Roboto Mono', monospace" } },
  { id: 'dos-blue', name: 'MS-DOS · Frotz-Blau', desc: 'VGA-Zeichensatz, Blau/Cyan, Menüzeile und F-Tasten wie 1991.', p: { bg: '#0000aa', fg: '#aaaaaa', st: '#00aaaa', stfg: '#000', in: '#ffff55', font: "'Lantern VGA', monospace" } },
  { id: 'dos-black', name: 'MS-DOS · Infocom', desc: 'Grau auf Schwarz mit inverser Statuszeile – der Infocom-PC-Look.', p: { bg: '#000', fg: '#aaaaaa', st: '#aaaaaa', stfg: '#000', in: '#ffffff', font: "'Lantern VGA', monospace" } },
  { id: 'mac-classic', name: 'Classic Mac · System 7', desc: 'Schwarz-weiß, Nadelstreifen-Titelleisten, Chicago-Pixelschrift.', p: { bg: '#ffffff', fg: '#000', st: '#ffffff', stfg: '#000', in: '#000', font: "'Geneva', 'Verdana', sans-serif", frame: true } },
  { id: 'mac-platinum', name: 'Mac OS 9 · Platinum', desc: 'Graue Platinum-Fenster auf blauem Schreibtisch.', p: { bg: '#ffffff', fg: '#000', st: '#dddddd', stfg: '#000', in: '#000088', font: "'Geneva', 'Verdana', sans-serif", frame: true } },
  { id: 'crt-green', name: 'Phosphor · Grün', desc: 'Terminal mit grünem Leuchten, Scanlines und Wölbung.', p: { bg: '#031a07', fg: '#33ff66', st: '#33ff66', stfg: '#031a07', in: '#b4ffc8', font: "'VT323', monospace" } },
  { id: 'crt-amber', name: 'Phosphor · Bernstein', desc: 'Bernsteinmonitor im Stil eines alten Terminals.', p: { bg: '#1a0f00', fg: '#ffb000', st: '#ffb000', stfg: '#1a0f00', in: '#ffe099', font: "'VT323', monospace" } },
  { id: 'parchment', name: 'Pergament', desc: 'Altes Papier, EB Garamond und Kapitälchen.', p: { bg: '#f3e7c9', fg: '#3a2a17', st: '#f3e7c9', stfg: '#5b4326', in: '#7a2810', font: "'EB Garamond', serif" } },
]

// Themes that look best with the CRT overlay on by default
export const CRT_THEMES = new Set(['crt-green', 'crt-amber'])

export const FONT_CHOICES = [
  { id: '', name: 'Wie im Stil' },
  { id: "'Lora', serif", name: 'Lora' },
  { id: "'Libertinus Serif', serif", name: 'Libertinus Serif' },
  { id: "'EB Garamond', serif", name: 'EB Garamond' },
  { id: "'Gentium Book Plus', serif", name: 'Gentium Book Plus' },
  { id: "'Roboto Mono', monospace", name: 'Roboto Mono' },
  { id: "'IBM Plex Mono', monospace", name: 'IBM Plex Mono' },
  { id: "'Source Code Pro', monospace", name: 'Source Code Pro' },
  { id: "'Inconsolata', monospace", name: 'Inconsolata' },
  { id: "'Lantern VGA', monospace", name: 'VGA (DOS)' },
  { id: "'VT323', monospace", name: 'VT323 (Terminal)' },
  { id: "-apple-system, 'Segoe UI', 'Noto Sans', 'DejaVu Sans', sans-serif", name: 'Systemschrift' },
]
