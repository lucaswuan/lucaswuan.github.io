#!/usr/bin/env python3
"""Make the maps the homepage's ASCII Earth is drawn from (assets/earth/).

  surface.jpg          2048×1024  satellite colours of the whole Earth (NASA Blue Marble, July 2004)
  region.jpg           sharper satellite colours around Alberta (REGION below)
  area.webp            southern Alberta at about 750 m (AREA below; NASA VIIRS, 9 July 2024)
  calgary.webp         the Calgary area at about 125 m (CALGARY below; NASA HLS Sentinel-2, 9 July 2024)
  centre.webp          central Calgary at about 40 m, where the dive ends (CENTRE below; the same)
  area-night.webp      southern Alberta's lights at night by kind (NASA Black Marble, VIIRS, 2016; see night_lights)
  calgary-night.webp   Calgary's lights at night by kind at about 125 m, drawn from OpenStreetMap streets
  centre-night.webp    the same for central Calgary at about 40 m
  clouds.jpg           512×256    cloud cover, grey (NASA Blue Marble clouds)
  lights.jpg           1024×512   city lights on the globe's night side, grey (NASA Black Marble 2016)

All maps are equirectangular: x runs with longitude and y with latitude, north up. sky-renderer.js reads REGION,
AREA, CALGARY, and CENTRE with the same bounds as here, and app.js their sizes, so change them together. Each sharper
map is matched to the one it replaces (colour and brightness, by day and by night), so the dive down to Calgary has
no visible seams.

Sources (download them into one folder and pass it with --sources):
  surface.jpg  https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x5400x2700.jpg
  clouds.jpg   https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg
  lights.jpg   https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg
  area.jpg     https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap
               &LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor&SRS=EPSG:4326&BBOX=-119.6,48.28,-108.6,53.78
               &WIDTH=2444&HEIGHT=1222&FORMAT=image/jpeg&TIME=2024-07-09
  calgary.jpg  https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap
               &LAYERS=HLS_S30_Nadir_BRDF_Adjusted_Reflectance&SRS=EPSG:4326&BBOX=-115.3,50.55,-112.9,51.5
               &WIDTH=3430&HEIGHT=1357&FORMAT=image/jpeg&TIME=2024-07-09
  centre.jpg   the same, with BBOX=-114.33,50.915,-113.81,51.185&WIDTH=1214&HEIGHT=1000 (30 m)
  area-night.jpg  the same as area.jpg, with LAYERS=VIIRS_Black_Marble and no TIME
  major.json, medium.json, minor.json   OpenStreetMap streets in CALGARY from the Overpass API
               (https://overpass-api.de/api/interpreter), each the result of
               [out:json];way["highway"~"^(KINDS)$"](50.55,-115.3,51.5,-112.9);out skel geom qt;
               with KINDS motorway|trunk|primary|motorway_link|trunk_link|primary_link (major),
               secondary|tertiary|secondary_link|tertiary_link (medium), and unclassified|residential|living_street
               (minor).
NASA imagery is public domain. The HLS images contain modified Copernicus Sentinel data (2024). OpenStreetMap data
is © OpenStreetMap contributors (ODbL). All are credited in the homepage footer.

Usage:   python3 tools/make-earth-maps.py --sources path/to/folder
Needs:   Pillow and NumPy (pip install pillow numpy)
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'earth'
WORLD = dict(west=-180.0, east=180.0, south=-90.0, north=90.0)          # degrees
REGION = dict(west=-125.0, east=-103.0, south=44.0, north=58.0)
AREA = dict(west=-119.6, east=-108.6, south=48.28, north=53.78)
CALGARY = dict(west=-115.3, east=-112.9, south=50.55, north=51.5)
CENTRE = dict(west=-114.33, east=-113.81, south=50.915, north=51.185)
STREET_METRES = 35                                                      # street lights are drawn at this size
DOWNTOWN = (51.047, -114.066)                                           # lat, lon


def size(box, metres):
    """Pixels across and down for box at about this many metres a pixel."""
    lon_km = 111.32 * math.cos(math.radians((box['north'] + box['south']) / 2))
    return round((box['east'] - box['west']) * lon_km * 1000 / metres), round((box['north'] - box['south']) * 110570 / metres)


def crop(image, box, inside):
    """The part of image (covering box) that lies inside the box `inside`."""
    w, h = image.size
    x = lambda lon: round((lon - box['west']) / (box['east'] - box['west']) * w)
    y = lambda lat: round((box['north'] - lat) / (box['north'] - box['south']) * h)
    return image.crop((x(inside['west']), y(inside['north']), x(inside['east']), y(inside['south'])))


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def scaled(image, gains):
    return Image.merge('RGB', [band.point(lambda v, g=g: min(255, round(v * g))) for band, g in zip(image.split(), gains)])


def balanced(image, box, reference, reference_box):
    """image with its colour balance (channel by channel) set by reference, over the ground reference covers."""
    mine = ImageStat.Stat(crop(image, box, reference_box)).mean
    theirs = ImageStat.Stat(reference).mean
    return scaled(image, [t / m for t, m in zip(theirs, mine)])


def cast(image):
    """Gains taking out half the colour cast of image's brightest 3% (roofs, concrete, snow, mostly grey or white)."""
    pixels = sorted(image.resize((image.width // 4, image.height // 4)).get_flattened_data(), key=lambda p: .299 * p[0] + .587 * p[1] + .114 * p[2])
    top = pixels[len(pixels) * 97 // 100:]
    mean = [sum(p[i] for p in top) / len(top) for i in range(3)]
    grey = .299 * mean[0] + .587 * mean[1] + .114 * mean[2]
    return [(grey / m) ** .5 for m in mean]


def brightness(image):
    return ImageStat.Stat(image.convert('L')).mean[0]


def levelled(image, box, reference, reference_box):
    """image brightened or darkened (all channels alike) to match reference's average brightness over the same ground."""
    gain = brightness(crop(reference, reference_box, box)) / brightness(image)
    return image.point(lambda v: min(255, round(v * gain))) if image.mode == 'L' else scaled(image, [gain] * 3)


def sharpened(image):
    """Clearer neighbourhoods, parks, and valleys (local contrast), then crisper detail."""
    return image.filter(ImageFilter.UnsharpMask(radius=8, percent=45, threshold=1)).filter(ImageFilter.UnsharpMask(radius=1.5, percent=50, threshold=3))


def night(sources):
    # The Black Marble shows land faintly at night (up to about 55 of 255); keep only the city lights above it.
    return Image.open(sources / 'lights.jpg').convert('L').point(lambda v: round(255 * (max(0, v - 56) / 199) ** .6))


def night_lights(sources):
    """The lights at night, as seen from a plane, in three kinds (each 0 to 255): red is the glow of homes and buildings
    across the built-up city, green the street lights along roads, and blue the brightest, busiest places (downtown,
    shopping and industrial areas). sky-renderer.js colours each kind its own way; parks, rivers, and open land stay
    dark.

    Southern Alberta's lights come from NASA's night photo (its warm city light above the dark ground, leaving out
    moonlit snow). Calgary's are drawn from its streets: built-up places from how many local streets they have, roads
    from the major and other through roads, and the busiest places from where NASA's photo is brightest."""
    area = np.asarray(Image.open(sources / 'area-night.jpg').convert('RGB'), dtype=float)
    luma = area @ [.299, .587, .114]
    warm = np.clip((area[..., 0] - area[..., 2] + 5) / 25, 0, 1)
    glow = np.clip((luma - np.percentile(luma, 60)) * warm / 200, 0, 1)
    kinds = np.stack([glow, glow * .5, smoothstep(.8, 1, glow)], axis=-1)
    Image.fromarray((kinds * 255).astype(np.uint8)).resize((1024, 820), Image.LANCZOS).save(OUT / 'area-night.webp', quality=82, method=6)

    width, height = size(CALGARY, STREET_METRES)
    xy = lambda p: ((p['lon'] - CALGARY['west']) / (CALGARY['east'] - CALGARY['west']) * width,
                    (CALGARY['north'] - p['lat']) / (CALGARY['north'] - CALGARY['south']) * height)
    roads, local = Image.new('L', (width, height), 0), Image.new('L', (width, height), 0)
    draw = {'roads': ImageDraw.Draw(roads), 'local': ImageDraw.Draw(local)}
    for name, value, line in [('minor', 255, 1), ('medium', 170, 1), ('major', 255, 2)]:
        for way in json.loads((sources / f'{name}.json').read_text(encoding='utf8'))['elements']:
            points = [xy(p) for p in way.get('geometry', [])]
            if len(points) > 1:
                draw['local' if name == 'minor' else 'roads'].line(points, fill=value, width=line)
    # How built up each place is: how much local street there is within about 350 m (so highways through farmland
    # don't count), and a little more widely for which roads are lit.
    streets = np.asarray(local, dtype=float)
    built = smoothstep(10, 30, np.asarray(local.filter(ImageFilter.GaussianBlur(10)), dtype=float))
    around = smoothstep(4, 18, np.asarray(local.filter(ImageFilter.GaussianBlur(25)), dtype=float))
    nasa = np.asarray(crop(Image.fromarray((glow * 255).astype(np.uint8)), AREA, CALGARY).resize((width, height), Image.BICUBIC), dtype=float) / 255
    homes = np.clip(built * (.42 + .3 * nasa) + streets / 255 * built * .3, 0, 1)
    lit_roads = np.asarray(roads, dtype=float) / 255 * around * (.75 + .25 * nasa)
    # Downtown (about a kilometre around its middle) and the very brightest places in NASA's photo.
    x, y = xy(dict(lat=DOWNTOWN[0], lon=DOWNTOWN[1]))
    reach = 1300 / STREET_METRES
    downtown = np.outer(np.exp(-((np.arange(height) - y) / reach) ** 2 / 2), np.exp(-((np.arange(width) - x) / reach) ** 2 / 2))
    busiest = np.maximum(downtown, .5 * smoothstep(.97, 1, nasa)) * built
    return Image.fromarray((np.stack([homes, np.clip(lit_roads, 0, 1), busiest], axis=-1) * 255).astype(np.uint8))


def save_lights(lights):
    # The wider map keeps each road's full brightness (the brightest 105 m in each pixel) rather than averaging it
    # away, so roads stay bright lines on the way down.
    homes, roads, busiest = lights.split()
    wide = Image.merge('RGB', [homes, roads.filter(ImageFilter.MaxFilter(3)), busiest])
    wide.resize(size(CALGARY, 125), Image.BOX).save(OUT / 'calgary-night.webp', quality=82, method=6)
    crop(lights, CALGARY, CENTRE).resize(size(CENTRE, 40), Image.BOX).save(OUT / 'centre-night.webp', quality=82, method=6)


def photos(sources):
    world = Image.open(sources / 'surface.jpg').convert('RGB')
    world.resize((2048, 1024), Image.LANCZOS).save(OUT / 'surface.jpg', quality=82, optimize=True, progressive=True)
    crop(world, WORLD, REGION).save(OUT / 'region.jpg', quality=86, optimize=True, progressive=True)
    # The Sentinel-2 photos' colours are corrected for the atmosphere (and here for a slight yellow cast); VIIRS from
    # the same day takes their balance, losing its blue haze. Each then matches the brightness of the map it takes over
    # from, and the close ones are sharpened.
    calgary = Image.open(sources / 'calgary.jpg').convert('RGB')
    gains = cast(calgary)
    calgary = scaled(calgary, gains)
    centre = scaled(Image.open(sources / 'centre.jpg').convert('RGB'), gains)
    area = balanced(Image.open(sources / 'area.jpg').convert('RGB'), AREA, calgary, CALGARY)
    area = levelled(area, AREA, world, WORLD)
    calgary = levelled(calgary, CALGARY, area, AREA)
    centre = levelled(centre, CENTRE, calgary, CALGARY)
    area.resize((1024, 820), Image.LANCZOS).save(OUT / 'area.webp', quality=82, method=6)
    calgary = sharpened(calgary.resize((1344, 844), Image.LANCZOS))
    centre = sharpened(centre.resize(size(CENTRE, 40), Image.LANCZOS))
    calgary.save(OUT / 'calgary.webp', quality=82, method=6)
    centre.save(OUT / 'centre.webp', quality=80, method=6)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--sources', required=True, type=Path)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    photos(args.sources)
    save_lights(night_lights(args.sources))
    Image.open(args.sources / 'clouds.jpg').convert('L').resize((512, 256), Image.LANCZOS).save(OUT / 'clouds.jpg', quality=84, optimize=True)
    night(args.sources).resize((1024, 512), Image.LANCZOS).save(OUT / 'lights.jpg', quality=88, optimize=True)
    for name in ['surface.jpg', 'region.jpg', 'area.webp', 'calgary.webp', 'centre.webp', 'area-night.webp',
                 'calgary-night.webp', 'centre-night.webp', 'clouds.jpg', 'lights.jpg']:
        print(f'assets/earth/{name}: {(OUT / name).stat().st_size // 1024} KB')
