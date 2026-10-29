#!/usr/bin/env python3
"""Make the 1200×630 images that link previews (LinkedIn, Discord, iMessage…) show.

  assets/og-home.jpg              a screenshot of the homepage hero, taken with headless Chrome
  assets/projects/<slug>/og.jpg   each project's cover, cropped to 1200×630 (cover.position picks the crop)

They are JPEGs because every preview service accepts JPEG; covers are WebP. The build links them in each
page's <head>. Rerun after changing a cover, the hero, or its text.

Usage:   python3 tools/make-preview-images.py [--url http://127.0.0.1:8000/] [--chrome PATH] [--skip-home]
         The homepage screenshot needs the site running locally (see README) and Chrome or Edge.
Needs:   Pillow (pip install pillow)
"""
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WIDTH, HEIGHT = 1200, 630
CHROMES = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge',
]


def save_jpeg(image, path):
    # Transparent corners (a board render's rounded edges, say) become black, like the site's background.
    if image.mode in ('RGBA', 'LA', 'P'):
        image = image.convert('RGBA')
        background = Image.new('RGB', image.size, '#000000')
        background.paste(image, mask=image.getchannel('A'))
        image = background
    image.convert('RGB').save(path, 'JPEG', quality=85, optimize=True, progressive=True)


def crop_cover(source, position):
    # Like CSS object-fit: cover with object-position: "x% y%".
    image = Image.open(source)
    x_pos, y_pos = (float(p.rstrip('%')) / 100 for p in (position or '50% 50%').split())
    scale = max(WIDTH / image.width, HEIGHT / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    left = round((resized.width - WIDTH) * x_pos)
    top = round((resized.height - HEIGHT) * y_pos)
    return resized.crop((left, top, left + WIDTH, top + HEIGHT))


def find_chrome(explicit):
    for candidate in ([explicit] if explicit else CHROMES):
        found = shutil.which(candidate) or (candidate if Path(candidate).exists() else None)
        if found:
            return found
    sys.exit('Chrome or Edge not found; pass --chrome PATH, or --skip-home to make only the project images.')


def screenshot_home(url, chrome):
    with tempfile.TemporaryDirectory() as folder:
        shot = Path(folder) / 'home.png'
        subprocess.run([chrome, '--headless=new', '--hide-scrollbars', f'--window-size={WIDTH},{HEIGHT}',
                        '--force-device-scale-factor=1', '--enable-unsafe-swiftshader', '--virtual-time-budget=6000',
                        f'--screenshot={shot}', url], check=True, capture_output=True)
        save_jpeg(Image.open(shot), ROOT / 'assets' / 'og-home.jpg')
    print('assets/og-home.jpg')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--url', default='http://127.0.0.1:8000/')
    parser.add_argument('--chrome')
    parser.add_argument('--skip-home', action='store_true')
    args = parser.parse_args()
    for project in json.loads((ROOT / 'content' / 'projects.json').read_text(encoding='utf8'))['projects']:
        cover = project.get('cover')
        if not cover:
            continue
        out = ROOT / 'assets' / 'projects' / project['slug'] / 'og.jpg'
        out.parent.mkdir(parents=True, exist_ok=True)
        save_jpeg(crop_cover(ROOT / cover['src'].lstrip('/'), cover.get('position')), out)
        print(out.relative_to(ROOT).as_posix())
    if not args.skip_home:
        screenshot_home(args.url, find_chrome(args.chrome))
