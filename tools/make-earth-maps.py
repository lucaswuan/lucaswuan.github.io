#!/usr/bin/env python3
"""Make the maps the homepage's ASCII Earth is drawn from (assets/earth/).

  surface.jpg   2048×1024  satellite colours of the whole Earth (NASA Blue Marble, July 2004)
  region.jpg    sharper satellite colours around Alberta (REGION below)
  area.webp     southern Alberta at about 750 m (AREA below; NASA VIIRS, 9 July 2024)
  calgary.webp  the Calgary area at about 125 m (CALGARY below; NASA HLS Sentinel-2, 9 July 2024)
  clouds.jpg    512×256    cloud cover, grey (NASA Blue Marble clouds)
  lights.jpg    1024×512   city lights at night, grey (NASA Black Marble 2016)

All maps are equirectangular: x runs with longitude and y with latitude, north up. sky-renderer.js reads REGION,
AREA, and CALGARY with the same bounds as here, and app.js their sizes, so change them together. Each sharper map is
colour-matched to the one it replaces, so the dive down to Calgary has no visible seams.

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
NASA imagery is public domain. The HLS image contains modified Copernicus Sentinel data (2024); both are credited in
the homepage footer.

Usage:   python3 tools/make-earth-maps.py --sources path/to/folder
Needs:   Pillow (pip install pillow)
"""
import argparse
from pathlib import Path

from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'earth'
WORLD = dict(west=-180.0, east=180.0, south=-90.0, north=90.0)          # degrees
REGION = dict(west=-125.0, east=-103.0, south=44.0, north=58.0)
AREA = dict(west=-119.6, east=-108.6, south=48.28, north=53.78)
CALGARY = dict(west=-115.3, east=-112.9, south=50.55, north=51.5)


def crop(image, box, inside):
    """The part of image (covering box) that lies inside the box `inside`."""
    w, h = image.size
    x = lambda lon: round((lon - box['west']) / (box['east'] - box['west']) * w)
    y = lambda lat: round((box['north'] - lat) / (box['north'] - box['south']) * h)
    return image.crop((x(inside['west']), y(inside['north']), x(inside['east']), y(inside['south'])))


def scaled(image, gains):
    return Image.merge('RGB', [band.point(lambda v, g=g: min(255, round(v * g))) for band, g in zip(image.split(), gains)])


def balanced(image, box, reference, reference_box):
    """image with its colour balance (channel by channel) set by reference, over the ground reference covers."""
    mine = ImageStat.Stat(crop(image, box, reference_box)).mean
    theirs = ImageStat.Stat(reference).mean
    return scaled(image, [t / m for t, m in zip(theirs, mine)])


def white_balanced(image):
    """image with half the colour cast of its brightest 3% (roofs, concrete, snow, mostly grey or white) taken out."""
    pixels = sorted(image.resize((image.width // 4, image.height // 4)).get_flattened_data(), key=lambda p: .299 * p[0] + .587 * p[1] + .114 * p[2])
    top = pixels[len(pixels) * 97 // 100:]
    mean = [sum(p[i] for p in top) / len(top) for i in range(3)]
    grey = .299 * mean[0] + .587 * mean[1] + .114 * mean[2]
    return scaled(image, [(grey / m) ** .5 for m in mean])


def levelled(image, box, reference, reference_box):
    """image brightened or darkened (all channels alike) to match reference's average brightness over the same ground."""
    brightness = lambda im: ImageStat.Stat(im.convert('L')).mean[0]
    gain = brightness(crop(reference, reference_box, box)) / brightness(image)
    return scaled(image, [gain] * 3)


def city_lights(sources):
    # The Black Marble shows land faintly at night (up to about 55 of 255); keep only the city lights above it.
    image = Image.open(sources / 'lights.jpg').convert('L').resize((1024, 512), Image.LANCZOS)
    image.point(lambda v: round(255 * (max(0, v - 56) / 199) ** .6)).save(OUT / 'lights.jpg', quality=88, optimize=True)


def photos(sources):
    world = Image.open(sources / 'surface.jpg').convert('RGB')
    world.resize((2048, 1024), Image.LANCZOS).save(OUT / 'surface.jpg', quality=82, optimize=True, progressive=True)
    crop(world, WORLD, REGION).save(OUT / 'region.jpg', quality=86, optimize=True, progressive=True)
    # The Sentinel-2 photo's colours are corrected for the atmosphere (and here for a slight yellow cast); VIIRS from
    # the same day takes its balance, losing its blue haze. Each then matches the brightness of the map it takes over
    # from.
    calgary = white_balanced(Image.open(sources / 'calgary.jpg').convert('RGB'))
    area = balanced(Image.open(sources / 'area.jpg').convert('RGB'), AREA, calgary, CALGARY)
    area = levelled(area, AREA, world, WORLD)
    calgary = levelled(calgary, CALGARY, area, AREA)
    area.resize((1024, 820), Image.LANCZOS).save(OUT / 'area.webp', quality=82, method=6)
    calgary.resize((1344, 844), Image.LANCZOS).save(OUT / 'calgary.webp', quality=82, method=6)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--sources', required=True, type=Path)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    photos(args.sources)
    Image.open(args.sources / 'clouds.jpg').convert('L').resize((512, 256), Image.LANCZOS).save(OUT / 'clouds.jpg', quality=84, optimize=True)
    city_lights(args.sources)
    for name in ['surface.jpg', 'region.jpg', 'area.webp', 'calgary.webp', 'clouds.jpg', 'lights.jpg']:
        print(f'assets/earth/{name}: {(OUT / name).stat().st_size // 1024} KB')
