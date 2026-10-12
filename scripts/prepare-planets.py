"""Prepare offline planet maps and authored reconstructions. Requires Pillow and numpy.
Run from the repository root. NASA maps keep their source attribution in credits.md.
"""
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor
import io
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

DEST = Path('public/textures/planets')
DEST.mkdir(parents=True, exist_ok=True)
NASA_3D = 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/'
SOURCES = {
    'earth': 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.png',
    'clouds': 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg',
    'moon': 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg',
    'moon-height': 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg',
    **{name.lower(): NASA_3D + quote(f'Images and Textures/{name}/{name}.jpg') for name in ['Jupiter', 'Mars', 'Saturn']},
}

def download(item):
    name, url = item
    raw = urlopen(Request(url, headers={'User-Agent': 'Jingliu/1.3 asset preparation'}), timeout=50).read()
    image = Image.open(io.BytesIO(raw)).convert('RGB')
    image.thumbnail((2048, 1024), Image.Resampling.LANCZOS)
    if image.width != image.height * 2:
        raise ValueError(f'{name} must be an equirectangular map')
    if name == 'clouds':
        alpha = image.convert('L')
        image = Image.new('RGBA', image.size, 'white')
        image.putalpha(alpha)
    if name == 'saturn':
        # The NASA visualization map is highly saturated; retain its bands with
        # a calmer, Cassini-inspired palette. This is an aesthetic adjustment.
        image = ImageEnhance.Color(image).enhance(.28)
    if name == 'jupiter':
        image = ImageEnhance.Color(image).enhance(.6)
    image.save(DEST / f'{name}.webp', quality=90, method=6)
    return f'{name}: {image.size}'

# Tileable, deterministic spherical noise. No external assets are used for these
# imagined cloud patterns; the x/z embedding closes the longitudinal seam.
w, h = 1024, 512
lon, lat = np.meshgrid(np.linspace(0, 2*np.pi, w, endpoint=False), np.linspace(np.pi/2, -np.pi/2, h))
x, y, z = np.cos(lat)*np.cos(lon), np.sin(lat), np.cos(lat)*np.sin(lon)
def noise(seed, stretch=1):
    rng = np.random.default_rng(seed)
    value = np.zeros((h, w), dtype=np.float32)
    for octave in range(6):
        frequency = 2.1 * 2**octave
        for _ in range(5):
            a, b, c = rng.normal(size=3)
            phase = rng.uniform(0, 2*np.pi)
            value += np.sin((a*x+b*y*stretch+c*z)*frequency+phase) * .5**octave / 5
    return value

def author_maps():
    for name, base, amplitude, seed in [
        ('neptune', (109,151,189), 13, 803),
        ('uranus', (155,193,196), 4, 612),
        ('venus', (204,187,149), 12, 234),
        ('mercury', (139,131,118), 35, 492),
    ]:
        n = noise(seed, 2.8 if name != 'mercury' else 1)
        if name in ('neptune', 'uranus'):
            n += np.sin(lat*38+n*2.5)*.2
        value = n*amplitude
        if name == 'mercury':
            rng = np.random.default_rng(seed)
            # Crater bowls and rims, measured by angular distance on a sphere.
            for _ in range(270):
                az = rng.uniform(0,2*np.pi); ay=rng.uniform(-1,1)
                ax=np.sqrt(1-ay*ay)*np.cos(az); az=np.sqrt(1-ay*ay)*np.sin(az)
                r = rng.uniform(.012,.072)
                d = np.sqrt(np.maximum(0,2*(1-(x*ax+y*ay+z*az)))) / r
                value += 25*np.exp(-((d-1)/.11)**2)-18*np.exp(-(d/.8)**4)
        rgb = np.clip(np.array(base)+value[...,None],0,255).astype('uint8')
        Image.fromarray(rgb).save(DEST/f'{name}.webp', quality=91, method=6)
# Small transparent, shaded previews remain useful if WebGL is unavailable.
def previews():
    size=384
    px, py = np.meshgrid(np.linspace(-1.15,1.15,size),np.linspace(1.15,-1.15,size))
    r2=px*px+py*py
    pz=np.sqrt(np.maximum(0,1-r2))
    light=np.maximum(0,px*-.45+py*.5+pz*.74)*.89+.11
    u=(np.arctan2(pz,px)/(2*np.pi)+.5)%1
    v=np.arccos(np.clip(py,-1,1))/np.pi
    for name in ['saturn','earth','jupiter','moon','mars','neptune','uranus','venus','mercury']:
        texture=np.array(Image.open(DEST/f'{name}.webp').convert('RGB'))
        th,tw=texture.shape[:2]
        color=texture[np.minimum((v*th).astype(int),th-1),(u*tw).astype(int)%tw]
        rgba=np.zeros((size,size,4),dtype=np.uint8)
        rgba[:,:,:3]=(color*light[...,None]).clip(0,255).astype('uint8')
        rgba[:,:,3]=(np.clip((1-r2)*size,0,1)*255).astype('uint8')
        image=Image.fromarray(rgba)
        if name=='saturn':
            # A separate ring layer places the near arc in front of the globe.
            body=image.resize((190,190),Image.Resampling.LANCZOS)
            image=Image.new('RGBA',(size,size));image.paste(body,(97,97))
            rx,ry=np.meshgrid(np.arange(size)-size/2,np.arange(size)-size/2)
            dist=np.sqrt((rx/173)**2+(ry/56)**2)
            band=np.clip((1-dist)*50,0,1)*np.clip((dist-.57)*50,0,1)
            band*=np.where((dist>.84)&(dist<.865),.09,1)
            alpha=band*(.68+.16*np.sin(dist*510)+.08*np.sin(dist*1120))
            ring=np.zeros((size,size,4),dtype='uint8')
            ring[:,:,:3]=[195,177,143];ring[:,:,3]=(alpha*255).clip(0,255)
            back=ring.copy();back[ry>=0,3]=0
            front=ring.copy();front[ry<0,3]=0
            image=Image.alpha_composite(Image.fromarray(back),image)
            image=Image.alpha_composite(image,Image.fromarray(front)).rotate(-18,resample=Image.Resampling.BICUBIC)
        image.save(DEST/f'{name}-preview.webp',quality=88,method=6)

if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(download,SOURCES.items()): print(result,flush=True)
    author_maps()
    previews()