# grade.py <in.png> <out.png> <look> [title]: post-processing for a promotional still.
# Bloom, a light streak on the brightest points, a soft shoulder, contrast, split toning, vibrance, vignette,
# a trace of chromatic fringing at the edges, sharpening and fine grain. Optional title block bottom left.
import os, sys, numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageFont
FONT = os.environ.get('VW_FONTS', './fonts') + '/'  # a folder holding ChakraPetch-Bold.ttf and ChakraPetch-SemiBold.ttf
LOOKS = {
  # th: bloom threshold, bl: bloom gain, st: streak gain, sh/hi: shadow and highlight tints, sat, con, vig, exp
  'space': dict(th=0.55, bl=0.9, st=0.5, sh=(-0.012, 0.012, 0.03), hi=(0.03, 0.012, -0.02), sat=1.16, con=0.42, vig=0.5, exp=1.08),
  'gold':  dict(th=0.62, bl=0.75, st=0.1, sh=(-0.01, 0.006, 0.03), hi=(0.05, 0.022, -0.035), sat=1.2, con=0.38, vig=0.42, exp=1.0),
  'day':   dict(th=0.7, bl=0.55, st=0.08, sh=(-0.008, 0.008, 0.024), hi=(0.03, 0.016, -0.02), sat=1.18, con=0.36, vig=0.4, exp=0.98),
  'cave':  dict(th=0.6, bl=1.0, st=0.2, sh=(-0.012, 0.004, 0.028), hi=(0.045, 0.02, -0.03), sat=1.15, con=0.45, vig=0.6, exp=1.05),
  'hud':   dict(th=0.6, bl=0.6, st=0.25, sh=(-0.008, 0.008, 0.02), hi=(0.02, 0.01, -0.012), sat=1.1, con=0.25, vig=0.3, exp=1.04),
}
def blur(a, r):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255
def hblur(a, r):
    # a wide horizontal box blur, three passes: the streak a lens throws from a point light
    k = np.ones(r, dtype=np.float32) / r
    out = a
    for _ in range(3): out = np.stack([np.apply_along_axis(lambda m: np.convolve(m, k, mode='same'), 1, out[..., c]) for c in range(3)], -1)
    return out
def sm(e0, e1, x): t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def grade(im, look, title=None, seed=1):
    L = LOOKS[look]
    a = np.asarray(im.convert('RGB'), dtype=np.float32) / 255
    h, w = a.shape[:2]
    lin = a ** 2.2
    luma = lin @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    mx = lin.max(-1)
    bright = lin * sm(L['th'], L['th'] + 0.3, np.maximum(luma, mx * 0.62))[..., None]
    s = w / 1920
    bloom = blur(bright, 5 * s) * 0.5 + blur(bright, 16 * s) * 0.45 + blur(bright, 44 * s) * 0.4 + blur(bright, 110 * s) * 0.35
    hot = lin * sm(0.8, 1.0, np.maximum(luma, mx * 0.7))[..., None]
    hot = np.clip(hot - blur(hot, 14 * s) * 1.6, 0, 1)  # small lights only: flames, lamps, the star's core
    small = np.asarray(Image.fromarray(np.clip(hot * 255, 0, 255).astype(np.uint8)).resize((w // 4, h // 4), Image.BILINEAR), dtype=np.float32) / 255
    streak = hblur(blur(small, 1.2), int(90 * s))
    streak = np.asarray(Image.fromarray(np.clip(streak * 255 * 3, 0, 255).astype(np.uint8)).resize((w, h), Image.BILINEAR), dtype=np.float32) / 255 / 3
    streak = streak * np.array([0.55, 0.85, 1.0], dtype=np.float32)
    lin = lin * L['exp'] + bloom * L['bl'] * 0.7 + streak * L['st'] * 5
    lin = (1 - np.exp(-lin * 1.6)) / (1 - np.exp(-1.6 * 1.25))  # soft shoulder
    g = np.clip(lin, 0, 1) ** (1 / 2.2)
    g = g * (1 - L['con']) + (g * g * (3 - 2 * g)) * L['con']
    l = (g @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))[..., None]
    g = g + np.array(L['sh'], dtype=np.float32) * (1 - l) ** 2 * 2.2 + np.array(L['hi'], dtype=np.float32) * l ** 2 * 1.6
    # vibrance: more for the less saturated
    mxx, mnn = g.max(-1, keepdims=True), g.min(-1, keepdims=True)
    satn = (mxx - mnn) / (mxx + 1e-4)
    g = l + (g - l) * (1 + (L['sat'] - 1) * (1.4 - satn))
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    rr = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / 1.414
    g = g * (1 - L['vig'] * sm(0.35, 1.05, rr))[..., None]
    g = np.clip(g, 0, 1)
    out = Image.fromarray((g * 255 + 0.5).astype(np.uint8))
    # fringing: red a touch larger, blue a touch smaller, growing from the centre
    r, gch, b = out.split()
    k = 0.0016
    r = r.transform((w, h), Image.AFFINE, (1 - k, 0, k * w / 2, 0, 1 - k, k * h / 2), Image.BICUBIC)
    b = b.transform((w, h), Image.AFFINE, (1 + k, 0, -k * w / 2, 0, 1 + k, -k * h / 2), Image.BICUBIC)
    out = Image.merge('RGB', (r, gch, b)).filter(ImageFilter.UnsharpMask(radius=1.3, percent=55, threshold=2))
    rng = np.random.default_rng(seed)
    n = rng.normal(0, 1, (h, w, 1)).astype(np.float32)
    o = np.asarray(out, dtype=np.float32) / 255
    lo = (o @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))[..., None]
    o = np.clip(o + n * 0.014 * (0.35 + 0.65 * (1 - np.abs(lo * 2 - 1))), 0, 1)
    out = Image.fromarray((o * 255 + 0.5).astype(np.uint8))
    if title: out = stamp(out, *title)
    return out
def stamp(im, name, line, corner='bl'):
    w, h = im.size
    s = w / 1920
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
    # a soft dark ramp under the text so it reads on any picture
    ramp = np.zeros((h, w, 4), dtype=np.uint8)
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    ramp[..., 3] = (np.clip((yy - 0.62) / 0.38, 0, 1) ** 1.6 * 150).astype(np.uint8)
    ov = Image.alpha_composite(ov, Image.fromarray(ramp))
    d = ImageDraw.Draw(ov)
    f1 = ImageFont.truetype(FONT + 'ChakraPetch-Bold.ttf', int(84 * s)); f2 = ImageFont.truetype(FONT + 'ChakraPetch-SemiBold.ttf', int(27 * s))
    x, y = int(70 * s), h - int(178 * s)
    d.rectangle([x, y + int(12 * s), x + int(7 * s), y + int(134 * s)], fill=(63, 224, 208, 255))
    tx = x + int(28 * s)
    # letter-spaced name
    cx = tx
    for ch in name:
        d.text((cx, y), ch, font=f1, fill=(236, 246, 246, 255)); cx += d.textlength(ch, font=f1) + int(9 * s)
    d.text((tx + 2, y + int(104 * s)), line, font=f2, fill=(150, 232, 224, 255))
    glow = ov.filter(ImageFilter.GaussianBlur(10 * s))
    base = im.convert('RGBA')
    base = Image.alpha_composite(base, Image.eval(glow, lambda v: v))
    return Image.alpha_composite(base, ov).convert('RGB')
if __name__ == '__main__':
    src, dst, look = sys.argv[1:4]
    t = (sys.argv[4], sys.argv[5]) if len(sys.argv) > 5 else None
    im = Image.open(src).convert('RGB')
    if im.size[1] % 2: im = im.crop((0, 0, im.size[0], im.size[1] - 1))
    grade(im, look, t).save(dst)
    print(dst, im.size)
