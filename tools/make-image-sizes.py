#!/usr/bin/env python3
"""Make smaller AVIF and WebP copies of cover images so each browser downloads only what it needs.

For assets/projects/<slug>/photo.webp this writes photo-600.webp, photo-1200.webp, ... next to it,
up to the photo's own width (at most 2400px), plus matching .avif copies when AVIF comes out smaller
(it usually does for screenshots and renders, not always for photos).
`node tools/build-projects.mjs` finds the copies by name and lists them in a <picture> element.
Run it again whenever you replace a cover, then rebuild.

Usage:   python3 tools/make-image-sizes.py assets/projects/<slug>/<cover>.webp [...]
Needs:   Pillow (pip install pillow); version 11.3 or newer also writes AVIF
"""
import re
import sys
from pathlib import Path

from PIL import Image, features

WIDTHS = (600, 1200, 2400)
AVIF_QUALITY = 75
WEBP_QUALITY = 82


def make_sizes(path):
    source = Path(path)
    image = Image.open(source).convert('RGB')
    largest = min(image.width, WIDTHS[-1])
    widths = sorted({w for w in WIDTHS if w < largest} | {largest})
    # Remove copies from an earlier run so a smaller replacement photo leaves no stale sizes behind.
    pattern = re.compile(re.escape(source.stem) + r'-\d+\.(avif|webp)$')
    for old in source.parent.iterdir():
        if pattern.fullmatch(old.name):
            old.unlink()
    copies = {'webp': [], 'avif': []}
    for width in widths:
        copy = image if width == image.width else image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
        copies['webp'].append(source.with_name(f'{source.stem}-{width}.webp'))
        copy.save(copies['webp'][-1], 'WEBP', quality=WEBP_QUALITY, method=6)
        if features.check('avif'):
            copies['avif'].append(source.with_name(f'{source.stem}-{width}.avif'))
            copy.save(copies['avif'][-1], 'AVIF', quality=AVIF_QUALITY)
    # Browsers take the AVIF copies first, so keep them only if they actually save bytes.
    total = {kind: sum(f.stat().st_size for f in files) for kind, files in copies.items()}
    if copies['avif'] and total['avif'] >= total['webp']:
        for f in copies['avif']:
            f.unlink()
        copies['avif'] = []
    kinds = ' + '.join(kind.upper() for kind in ('avif', 'webp') if copies[kind])
    print(f'{source}: {", ".join(f"{w}px" for w in widths)} ({kinds})')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    if not features.check('avif'):
        print('Note: this Pillow cannot write AVIF, so only WebP copies are made (pip install --upgrade pillow).')
    for arg in sys.argv[1:]:
        make_sizes(arg)
