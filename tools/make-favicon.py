#!/usr/bin/env python3
"""Draw the site icon: "LW" in DM Serif Display, black on a sage rounded square.

The letters are traced from the font file in tools/fonts (SIL Open Font License, see OFL.txt), so the icon looks
the same on every device whatever fonts it has. One drawing produces all three files:
  assets/favicon.svg          browsers that take SVG icons (sharp at any size)
  favicon.ico                 16, 32 and 48px, at the site root, where browsers look by default
  assets/apple-touch-icon.png 180px, square and edge to edge (iOS rounds the corners itself)

Usage:   python3 tools/make-favicon.py
Needs:   Pillow and fontTools (pip install pillow fonttools)
"""
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / 'tools' / 'fonts' / 'DMSerifDisplay-Regular.ttf'
SAGE, INK = '#b9dcaa', '#000000'
SIZE, RADIUS = 64, 10          # the drawing's units; corners match the site's small rounding
TEXT = 'LW'
WIDTH = 46                     # how wide the letters are across the 64-unit square
TRACKING = -0.02               # extra space between letters, as a fraction of the font size


class PolygonPen(BasePen):
    """Collects each outline as a list of points, with curves broken into short straight pieces."""

    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.contours, self.points = [], []

    def _moveTo(self, p):
        self.points = [p]

    def _lineTo(self, p):
        self.points.append(p)

    def _qCurveToOne(self, p1, p2):
        p0 = self.points[-1]
        for i in range(1, 13):
            t = i / 12
            self.points.append(tuple((1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c for a, b, c in zip(p0, p1, p2)))

    def _curveToOne(self, p1, p2, p3):
        p0 = self.points[-1]
        for i in range(1, 17):
            t = i / 16
            self.points.append(tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d
                                     for a, b, c, d in zip(p0, p1, p2, p3)))

    def _closePath(self):
        self.contours.append(self.points)
        self.points = []

    _endPath = _closePath


def layout():
    """Each letter's glyph and the transform that places it: centred, WIDTH wide, y pointing down."""
    font = TTFont(FONT)
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    tracking = TRACKING * font['head'].unitsPerEm
    placed, x = [], 0
    for char in TEXT:
        name = cmap[ord(char)]
        placed.append((name, x))
        x += glyphs[name].width + tracking
    left = bottom = float('inf')
    right = top = float('-inf')
    for name, dx in placed:
        bounds = BoundsPen(glyphs)
        glyphs[name].draw(bounds)
        x0, y0, x1, y1 = bounds.bounds
        left, bottom, right, top = min(left, x0 + dx), min(bottom, y0), max(right, x1 + dx), max(top, y1)
    scale = WIDTH / (right - left)
    ox = (SIZE - WIDTH) / 2 - left * scale
    oy = (SIZE + (top - bottom) * scale) / 2 + bottom * scale
    return glyphs, [(name, (scale, 0, 0, -scale, ox + dx * scale, oy)) for name, dx in placed]


def svg():
    glyphs, placed = layout()
    paths = []
    for name, transform in placed:
        pen = SVGPathPen(glyphs, ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
        glyphs[name].draw(TransformPen(pen, transform))
        paths.append(f'<path d="{pen.getCommands()}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}">'
            f'<rect width="{SIZE}" height="{SIZE}" rx="{RADIUS}" fill="{SAGE}"/>'
            f'<g fill="{INK}">{"".join(paths)}</g></svg>\n')


def raster(px, rounded=True):
    scale = 16                                  # draw large, then shrink, for smooth edges
    big = px * scale
    k = big / SIZE
    glyphs, placed = layout()
    ink = Image.new('1', (big, big), 0)
    for name, (a, b, c, d, e, f) in placed:
        pen = PolygonPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (a * k, b * k, c * k, d * k, e * k, f * k)))
        for contour in pen.contours:            # even-odd fill, so any counters stay open
            shape = Image.new('1', (big, big), 0)
            ImageDraw.Draw(shape).polygon(contour, fill=1)
            ink = ImageChops.logical_xor(ink, shape)
    image = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if rounded:
        draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=RADIUS * k, fill=SAGE)
    else:
        draw.rectangle((0, 0, big, big), fill=SAGE)
    image.paste(INK, mask=ink.convert('L'))
    return image.resize((px, px), Image.LANCZOS)


if __name__ == '__main__':
    (ROOT / 'assets' / 'favicon.svg').write_text(svg(), encoding='utf8')
    raster(48).save(ROOT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    raster(180, rounded=False).convert('RGB').save(ROOT / 'assets' / 'apple-touch-icon.png')
    print('Wrote assets/favicon.svg, favicon.ico and assets/apple-touch-icon.png')
