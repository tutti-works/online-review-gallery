"""Rebuild ATRIA vector assets. Requires fontTools and Windows Arial for subtitle outlines."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

OUT = Path(__file__).resolve().parents[1] / 'public' / 'brand'
INK = '#242B2F'
DEFS = '''<defs>
    <linearGradient id="floor" gradientUnits="userSpaceOnUse" x1="120" y1="148" x2="120" y2="196">
      <stop offset="0" stop-color="#C6C5B6" stop-opacity="0.38"/>
      <stop offset="0.55" stop-color="#D8D7CC" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#E6E5DC" stop-opacity="0"/>
    </linearGradient>
  </defs>'''
# Right wall is the exact reflection of the left about x=120.
LEFT = [(120,20),(20,70),(20,174),(84,142),(84,82),(120,64)]
RIGHT = [(240-x,y) for x,y in LEFT]
def points(coords):
    return ' '.join(f'{x},{y}' for x,y in coords)
MARK = f'''<polygon fill="{INK}" points="{points(LEFT)}"/>
  <polygon fill="#D8D8CC" points="{points(RIGHT)}"/>
  <path fill="url(#floor)" d="M96 148H144L240 196H0Z"/>'''
# Reference proportions: cap height / word width = 116 / 640.
# The main strokes are 18 units; A diagonals have a 22-unit baseline cut.
CAPS = f'''<g fill="{INK}">
    <path d="M0 116L72 0L144 116H122L72 35L22 116Z"/>
    <path d="M154 0H244V16H208V116H190V16H154Z"/>
    <path d="M288 116V0H332C362 0 378 14 378 35C378 53 366 63 349 67L390 116H366L325 66V51H332C350 51 360 46 360 35C360 23 350 16 332 16H306V116Z"/>
    <path d="M438 0H456V116H438Z"/>
    <path d="M496 116L568 0L640 116H618L568 35L518 116Z"/>
  </g>'''
font = TTFont('C:/Windows/Fonts/arial.ttf')
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
scale = 22 / 1493  # Arial cap height: 22 SVG units.
phrase = 'DESIGN REVIEW GALLERY'
letters=[]
for char in phrase:
    if char == ' ':
        letters.append(None)
        continue
    glyph = glyphs[cmap[ord(char)]]
    bounds = BoundsPen(glyphs)
    glyph.draw(bounds)
    pen = SVGPathPen(glyphs)
    glyph.draw(pen)
    letters.append((bounds.bounds, pen.getCommands()))
widths = [18 if item is None else (item[0][2]-item[0][0])*scale for item in letters]
tracking = (640-sum(widths))/(len(letters)-1)
x=0
subtitle=[]
for item,width in zip(letters,widths):
    if item:
        (xmin,ymin,xmax,ymax),d=item
        subtitle.append(f'<path transform="translate({x-xmin*scale:.6f} 168) scale({scale:.9f} {-scale:.9f})" d="{d}"/>')
    x += width+tracking
WORD = CAPS + '\n  <!-- Subtitle tracking baked into outline positions; visible bounds x=0..640. -->\n  <g fill="'+INK+'">\n    '+'\n    '.join(subtitle)+'\n  </g>'
def svg(view,title,body,defs=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img" aria-label="{title}">\n  <title>{title}</title>\n  {defs}\n  {body}\n</svg>\n'
OUT.mkdir(exist_ok=True)
(OUT/'atria-mark.svg').write_text(svg('0 0 240 240','ATRIA',MARK,DEFS),encoding='utf-8')
(OUT/'atria-wordmark.svg').write_text(svg('0 -2 640 172','ATRIA — DESIGN REVIEW GALLERY',WORD),encoding='utf-8')
(OUT/'atria-logo.svg').write_text(svg('0 0 970 240','ATRIA — DESIGN REVIEW GALLERY','<g transform="scale(1.18)">'+MARK+'</g>\n  <g transform="translate(330 41)">'+WORD+'</g>',DEFS),encoding='utf-8')
assert RIGHT == [(240-x,y) for x,y in LEFT]
assert abs(x-tracking-640)<1e-8
print(f'Generated 3 vector SVGs; subtitle tracking={tracking:.4f}; aligned bounds=0..640')

# Floor edges and wall lower edges both have absolute slope 1/2.
assert (196-148)/(96-0) == (174-142)/(84-20) == 0.5
