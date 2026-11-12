# batch.py: grades every finished capture, adds a small wordmark, and builds the key art and the collage.
import os, sys, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grade import grade, stamp, FONT
OUT = 'out'; os.makedirs(OUT, exist_ok=True)
SHOTS = [  # capture, look, output name
  ('f-orbit0.png', 'space', '01-station-over-halvor'),
  ('f-orbit1.png', 'gold', '02-flight-over-the-mountains'),
  ('f-planet0.png', 'gold', '03-landing-in-the-forest'),
  ('f-planet2.png', 'gold', '04-the-valley'),
  ('f-planet3.png', 'cave', '05-the-mine'),
  ('f-rocks1.png', 'space', '06-asteroid-mining'),
  ('f-orbit2.png', 'hud', '07-in-the-seat'),
  ('f-planet1.png', 'day', '08-lift-off'),
]
def load(p):
    im = Image.open(p).convert('RGB')
    return im.crop((0, 0, 1920, 1080))
def mark(im, top=False, right=False):
    # a small wordmark, bottom left
    w, h = im.size
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    f = ImageFont.truetype(FONT + 'ChakraPetch-Bold.ttf', 30)
    x, y = (w - 262 if right else 44), (34 if top else h - 70)
    d.rectangle([x, y + 4, x + 4, y + 38], fill=(63, 224, 208, 235))
    cx = x + 16
    for ch in 'VOIDWRIGHT': d.text((cx, y), ch, font=f, fill=(236, 246, 246, 225)); cx += d.textlength(ch, font=f) + 4
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0)); ds = ImageDraw.Draw(sh)
    ds.rectangle([x - 14, y - 6, cx + 14, y + 48], fill=(0, 0, 0, 120))
    sh = sh.filter(ImageFilter.GaussianBlur(14))
    return Image.alpha_composite(Image.alpha_composite(im.convert('RGBA'), sh), ov).convert('RGB')
done = []
only = sys.argv[1:]
for src, look, name in SHOTS:
    if not os.path.exists(src): continue
    if only and not any(o in src for o in only): done.append(name); continue
    g = grade(load(src), look, seed=len(done) + 3)
    g.save(f'{OUT}/raw-{name}.png')  # graded, no mark (for the collage)
    mark(g, look == 'hud', look == 'cave').save(f'{OUT}/voidwright-{name}.png', optimize=True)
    done.append(name); print('graded', name)
# key art: the hero shot with the title
if os.path.exists('f-orbit0.png') and (not only or 'orbit0' in only):
    grade(load('f-orbit0.png'), 'space', ('VOIDWRIGHT', 'BUILD IT.  FLY IT.  MINE THE REST.')).save(f'{OUT}/voidwright-keyart.png', optimize=True)
# collage: six pictures and a title bar
pick = [n for n in ['01-station-over-halvor', '03-landing-in-the-forest', '06-asteroid-mining', '05-the-mine', '02-flight-over-the-mountains', '04-the-valley'] if os.path.exists(f'{OUT}/raw-{n}.png')]
if len(pick) == 6:
    W, gap, top = 1920, 10, 150
    cw = (W - gap * 4) // 3; chh = cw * 9 // 16
    H = top + chh * 2 + gap * 3
    c = Image.new('RGB', (W, H), (4, 9, 12)); d = ImageDraw.Draw(c)
    for i, n in enumerate(pick):
        im = Image.open(f'{OUT}/raw-{n}.png').resize((cw, chh), Image.LANCZOS)
        c.paste(im, (gap + (i % 3) * (cw + gap), top + gap + (i // 3) * (chh + gap)))
    f1 = ImageFont.truetype(FONT + 'ChakraPetch-Bold.ttf', 78); f2 = ImageFont.truetype(FONT + 'ChakraPetch-SemiBold.ttf', 26)
    d.rectangle([40, 34, 46, 122], fill=(63, 224, 208))
    cx = 68
    for ch in 'VOIDWRIGHT': d.text((cx, 22), ch, font=f1, fill=(236, 246, 246)); cx += d.textlength(ch, font=f1) + 8
    t = 'BUILD SHIPS AND STATIONS BLOCK BY BLOCK  ·  LAND ON PLANETS  ·  DIG REAL TUNNELS  ·  A UNIVERSE THAT KEEPS GOING'
    d.text((cx + 40, 44), 'A SPACE ENGINEERING SANDBOX', font=f2, fill=(150, 232, 224))
    d.text((cx + 40, 80), 'Build block by block · land on planets · dig real tunnels · a universe that keeps going', font=ImageFont.truetype(FONT + 'ChakraPetch-SemiBold.ttf', 22), fill=(170, 190, 190))
    c.save(f'{OUT}/voidwright-collage.png', optimize=True); print('collage', c.size)
