"""Convert raw VGA BIOS bitmap fonts (8xN, 256 glyphs) into pixel TTFs."""
import sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

CP437_LOW = "\u0000☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼"

def build(src, dst, family, height, width_px, ascii_only=False, dup9=False, proportional=False):
    data = bytearray(open(src, 'rb').read())
    extra = {}
    if proportional:
        # Compose German umlauts and sharp s for the Chicago-like font
        def rows(ch):
            return list(data[ord(ch)*height:(ord(ch)+1)*height])
        def ink(rws):
            m = 0
            for b in rws: m |= b
            cols = [c for c in range(8) if (m >> (7 - c)) & 1]
            return (cols[0], cols[-1]) if cols else (0, 0)
        for base, comp, row in [('A', 'Ä', 0), ('O', 'Ö', 0), ('U', 'Ü', 0), ('a', 'ä', 3), ('o', 'ö', 3), ('u', 'ü', 3)]:
            r = rows(base)
            l, rr = ink(r)
            dots = (0x80 >> (l + 1)) | (0x80 >> (rr - 1))
            r[row] = dots
            extra[comp] = r
        sz = ['........', '........', '..####..', '.##..##.', '.##..##.', '.##.##..', '.##..##.', '.##...##', '.##...##', '.##.###.', '.##.....'] + ['........'] * (height - 11)
        extra['ß'] = [int(x.replace('.', '0').replace('#', '1'), 2) for x in sz]
    upm = 1000
    px = upm // height  # pixel size in font units
    adv = width_px * px
    descent_px = 4 if height >= 14 else 2
    glyphs = {'.notdef': None}
    cmap = {}
    order = ['.notdef', 'space']
    pens = {}
    advances = {}
    def glyph_for(i, rows=None):
        rows = rows if rows is not None else data[i*height:(i+1)*height]
        shift = 0
        if proportional:
            m = 0
            for b in rows: m |= b
            cols = [c for c in range(8) if (m >> (7 - c)) & 1]
            if cols:
                shift = cols[0]
                advances[i] = (cols[-1] - cols[0] + 2)
            else:
                advances[i] = 5
        pen = TTGlyphPen(None)
        for r, byte in enumerate(rows):
            bits = [(byte >> (7 - c)) & 1 for c in range(8)]
            if dup9:
                bits.append(bits[7] if 0xC0 <= i <= 0xDF else 0)
            c = 0
            while c < len(bits):
                if bits[c]:
                    s = c
                    while c < len(bits) and bits[c]:
                        c += 1
                    x0, x1 = (s - shift)*px, (c - shift)*px
                    y1 = (height - descent_px - r) * px
                    y0 = y1 - px
                    pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
                else:
                    c += 1
        return pen.glyph()
    for i in range(256):
        if i < 32:
            if ascii_only: continue
            ch = CP437_LOW[i] if i else None
        elif i == 127:
            ch = '⌂' if not ascii_only else None
        elif i < 128:
            ch = chr(i)
        else:
            if ascii_only: continue
            ch = bytes([i]).decode('cp437')
        if ch is None: continue
        name = 'space' if ch == ' ' else 'uni%04X' % ord(ch)
        if name in pens: continue
        pens[name] = glyph_for(i)
        if i in advances: advances[name] = advances[i]
        cmap[ord(ch)] = name
        if name not in order: order.append(name)
    for ch, rws in extra.items():
        name = 'uni%04X' % ord(ch)
        pens[name] = glyph_for(1000 + ord(ch), rws)
        advances[name] = advances[1000 + ord(ch)]
        cmap[ord(ch)] = name
        order.append(name)
    if not ascii_only:
        cmap.setdefault(0xA0, 'space')
    fb = FontBuilder(upm, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    empty = TTGlyphPen(None).glyph()
    gl = {'.notdef': empty}
    gl.update(pens)
    fb.setupGlyf(gl)
    fb.setupHorizontalMetrics({n: ((advances.get(n, width_px) * px) if proportional else adv, 0) for n in order})
    asc = (height - descent_px) * px
    fb.setupHorizontalHeader(ascent=asc, descent=-descent_px*px)
    fb.setupNameTable({'familyName': family, 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=asc, sTypoDescender=-descent_px*px, usWinAscent=asc, usWinDescent=descent_px*px, sTypoLineGap=0)
    fb.setupPost(isFixedPitch=0 if proportional else 1)
    fb.save(dst)

if __name__ == '__main__':
    V = '/tmp/vgafonts/FONTS/'
    build(V + 'PC-IBM/VGA8.F16', 'src/renderer/fonts/LanternVGA.ttf', 'Lantern VGA', 16, 9, dup9=True)
    build(V + 'BIGPILE/MACNTOSH.F16', 'src/renderer/fonts/LanternChicago.ttf', 'Lantern Chicago', 16, 8, ascii_only=True, proportional=True)
    print('ok')
