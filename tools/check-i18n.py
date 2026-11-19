"""Checks that every T('…') key has an English translation and lists German literals that are not translated."""
import json, re, sys
en = json.load(open('src/shared/en.json'))
files = ['src/renderer/js/app.js', 'src/renderer/js/library.js', 'src/renderer/js/mapview.js', 'src/main/main.js', 'src/renderer/js/themes.js', 'src/renderer/js/automap.js']
missing, untranslated = set(), []
for f in files:
    s = open(f).read()
    for m in re.finditer(r"\bT\('((?:[^'\\]|\\.)*)'", s):
        k = m.group(1).replace("\\'", "'").replace('\\n', '\n')
        if k not in en and re.search(r'[a-zäöü]', k) and k not in ('Karte',):
            missing.add(k)
    for i, line in enumerate(s.split('\n'), 1):
        if line.strip().startswith('//'): continue
        for m in re.finditer(r"(?<!T\()'((?:[^'\\]|\\.)*[äöüßÄÖÜ„](?:[^'\\]|\\.)*)'", line):
            k = m.group(1)
            if f.endswith(('themes.js',)) and k in en: continue
            if f.endswith('automap.js'): continue
            untranslated.append(f'{f}:{i}: {k[:90]}')
        if '`' in line and re.search(r'`[^`]*[äöüßÄÖÜ„][^`]*`', line):
            untranslated.append(f'{f}:{i}: TEMPLATE {line.strip()[:100]}')
for k in sorted(missing): print('MISSING EN:', k)
for u in untranslated: print('UNWRAPPED:', u)
# HTML static strings
html = open('src/renderer/index.html').read()
for m in re.finditer(r'>([^<>]*[äöüßÄÖÜ][^<>]*)<', html):
    print('HTML:', m.group(1).strip())
for m in re.finditer(r'(title|placeholder)="([^"]+)"', html):
    if m.group(2) not in en and re.search('[a-z]', m.group(2)): print('HTML ATTR MISSING:', m.group(2))
sys.exit(1 if missing else 0)
