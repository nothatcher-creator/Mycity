#!/usr/bin/env python3
"""Synthesises every sound effect in the game (original procedural sounds, no samples), then encodes
them as mono MP3s in sfx/. Run: python3 tools/sfxgen.py  (needs numpy and ffmpeg)."""
import numpy as np, subprocess, os, sys, wave

SR = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'sfx')
rng = np.random.default_rng(7)

def t(sec): return np.arange(int(sec * SR)) / SR
def noise(sec): return rng.uniform(-1, 1, int(sec * SR))
def lp(x, fc):
    """one-pole low-pass (fc may be an array: a sweeping filter)"""
    fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    a = 1 - np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x); s = 0.0
    for i in range(len(x)): s += a[i] * (x[i] - s); y[i] = s
    return y
def hp(x, fc): return x - lp(x, fc)
def bp(x, lo, hi): return hp(lp(x, hi), lo)
def env(n, attack=0.002, decay=0.2, sec=None):
    tt = np.arange(n) / SR
    e = np.exp(-tt / decay)
    a = np.clip(tt / max(attack, 1e-4), 0, 1)
    return e * a
def reverb(x, wet=0.3, sec=0.8):
    """a few decaying echoes for outdoor space"""
    y = np.concatenate([x, np.zeros(int(max(sec, 0.46) * SR))])
    for d, g in [(0.031, 0.5), (0.053, 0.4), (0.089, 0.33), (0.137, 0.26), (0.211, 0.2), (0.317, 0.14), (0.45, 0.09)]:
        k = int(d * SR); y[k:k + len(x)] += lp(x, 2500) * g * wet
    return y
def norm(x, peak=0.9): m = np.max(np.abs(x)) or 1; return x / m * peak
def fade(x, ms=8):
    n = int(ms / 1000 * SR); x = x.copy(); x[-n:] *= np.linspace(1, 0, n); return x
def sine(f, sec, phase=0): tt = t(sec); return np.sin(2 * np.pi * np.cumsum(np.broadcast_to(f, tt.shape)) / SR + phase)

def gunshot(body=1.0, crack=1.0, decay=0.09, low=90, tail=0.5, bright=6000, lowmix=0.6):
    n = noise(0.9)
    e1 = env(len(n), 0.0005, 0.012)
    e2 = env(len(n), 0.001, decay)
    x = hp(n, 1500) * e1 * crack * 1.2 + lp(n, bright) * e2 * body
    th = sine(np.linspace(low * 1.6, low * 0.7, len(n)), 0.9) * env(len(n), 0.001, decay * 1.3) * lowmix
    x = x + th
    return fade(norm(reverb(x, 0.5, tail)))

def boom(sec=2.5, fc=900, low=45, crackle=True):
    n = noise(sec)
    e = env(len(n), 0.003, sec * 0.25)
    x = lp(n, np.linspace(fc, 120, len(n))) * e * 1.4
    x += sine(np.linspace(low * 1.8, low * 0.6, len(n)), sec) * env(len(n), 0.002, sec * 0.18)
    if crackle:
        c = (rng.uniform(0, 1, len(n)) > 0.9985) * rng.uniform(-1, 1, len(n))
        x += lp(c, 3000) * 3 * env(len(n), 0.05, sec * 0.35)
    return fade(norm(reverb(x, 0.4, 1.0)), 60)

def click(f=3000, sec=0.04, d=0.006):
    n = noise(sec); return bp(n, f * 0.5, f * 1.5) * env(len(n), 0.0003, d) + sine(f * 0.6, sec) * env(len(n), 0.0003, d * 0.7) * 0.4

def seq(parts, total):
    y = np.zeros(int(total * SR))
    for at, x, g in parts:
        k = int(at * SR); m = min(len(x), len(y) - k); y[k:k + m] += x[:m] * g
    return y

def loop_noise(sec, fc, mod_f=0, mod_d=0, tone=None, tone_g=0.0):
    n = noise(sec + 0.4)
    x = lp(n, fc)
    if tone is not None: x += sine(tone, sec + 0.4) * tone_g
    if mod_f:
        tt = t(sec + 0.4); x *= 1 - mod_d + mod_d * (0.5 + 0.5 * np.sin(2 * np.pi * mod_f * tt)) ** 3
    # crossfade the ends so the loop is seamless
    k = int(0.4 * SR); a = x[:k]; b = x[-k:]; w = np.linspace(0, 1, k)
    y = x[k:].copy(); y[-k:] = b * (1 - w) + a * w
    return norm(y, 0.8)

def engine(sec, f0, harm=(1, 0.5, 0.33, 0.2), rough=0.3, fc=1500):
    tt = t(sec); x = np.zeros_like(tt)
    for i, g in enumerate(harm): x += np.sin(2 * np.pi * f0 * (i + 1) * tt) * g
    x = np.sign(x) * np.abs(x) ** 0.7
    x += lp(noise(sec), fc) * rough
    # f0 * sec must be whole for a seamless loop
    return norm(lp(x, fc), 0.8)

SOUNDS = {}
SOUNDS['shot_rifle'] = gunshot()
SOUNDS['shot_pistol'] = gunshot(body=0.8, decay=0.06, low=130, tail=0.35, bright=7000, lowmix=0.35)
SOUNDS['shot_heavy'] = gunshot(body=1.2, decay=0.14, low=60, tail=0.9, bright=4500, lowmix=0.9)
SOUNDS['shot_shotgun'] = gunshot(body=1.3, crack=0.6, decay=0.13, low=70, tail=0.7, bright=3500, lowmix=1.0)
SOUNDS['shot_smg'] = gunshot(body=0.85, decay=0.05, low=120, tail=0.3, bright=6500, lowmix=0.4)
sup = noise(0.25); SOUNDS['shot_suppressed'] = fade(norm(lp(sup, 1400) * env(len(sup), 0.001, 0.03) + click(2500, 0.25, 0.01) * 0.4, 0.7))
SOUNDS['shot_cannon'] = boom(1.8, 1400, 40, False)
SOUNDS['shot_far'] = fade(norm(reverb(lp(noise(0.6), 900) * env(int(0.6 * SR), 0.004, 0.08), 0.6, 1.0), 0.6))
w = noise(1.3); SOUNDS['shot_rocket'] = fade(norm(bp(w, 300, np.linspace(5000, 1200, len(w))) * np.minimum(1, np.linspace(0, 8, len(w))) * env(len(w), 0.01, 0.6) + lp(noise(1.3), 400) * env(len(w), 0.002, 0.15) * 1.5), 60)
SOUNDS['explosion'] = boom()
SOUNDS['explosion_far'] = fade(norm(lp(boom(2.2, 500, 40), 350), 0.8), 60)
cr = noise(0.12); SOUNDS['crack'] = fade(norm(hp(cr, 2500) * env(len(cr), 0.0002, 0.006) + hp(cr, 600) * env(len(cr), 0.001, 0.03) * 0.3, 0.8))
d = noise(0.3); SOUNDS['impact_dirt'] = fade(norm(lp(d, 2200) * env(len(d), 0.001, 0.035), 0.6))
h = noise(0.3); SOUNDS['impact_hard'] = fade(norm(bp(h, 800, 6000) * env(len(h), 0.0005, 0.02) + bp(h, 200, 900) * env(len(h), 0.001, 0.05) * 0.5, 0.6))
m = t(0.6); SOUNDS['impact_metal'] = fade(norm(sum(np.sin(2 * np.pi * f * m) * g for f, g in [(1870, 1), (2930, 0.6), (4410, 0.4), (980, 0.5)]) * env(len(m), 0.0005, 0.12) + click(5000, 0.6, 0.004) * 2, 0.55))
b = noise(0.25); SOUNDS['impact_body'] = fade(norm(lp(b, 600) * env(len(b), 0.001, 0.04) + sine(110, 0.25) * env(len(b), 0.001, 0.05), 0.6))
r = t(0.7); SOUNDS['ricochet'] = fade(norm(np.sin(2 * np.pi * np.cumsum(np.linspace(3800, 1400, len(r))) / SR) * env(len(r), 0.003, 0.25) * 0.6 + click(4000, 0.7, 0.003), 0.5))
SOUNDS['reload'] = norm(seq([(0.0, click(1800, 0.08, 0.012), 0.8), (0.25, click(1200, 0.1, 0.02), 1), (0.55, click(2400, 0.08, 0.01), 0.9), (0.62, click(1500, 0.08, 0.015), 0.8)], 0.8), 0.5)
SOUNDS['bolt'] = norm(seq([(0.0, click(1400, 0.1, 0.02), 1), (0.22, click(2000, 0.1, 0.015), 1)], 0.4), 0.5)
SOUNDS['dry'] = norm(click(3500, 0.05, 0.004), 0.4)
SOUNDS['ui_click'] = norm(click(2600, 0.05, 0.005), 0.35)
rb = t(0.25); SOUNDS['ui_radio'] = fade(norm(bp(noise(0.25), 1200, 3500) * env(len(rb), 0.002, 0.04) * 0.5 + np.sin(2 * np.pi * 1400 * rb) * (rb < 0.08) * 0.6, 0.35))
hu = noise(0.35); SOUNDS['ui_hurt'] = fade(norm(lp(hu, 300) * env(len(hu), 0.002, 0.06) + sine(70, 0.35) * env(len(hu), 0.002, 0.08), 0.6))
th = noise(0.4); SOUNDS['ui_throw'] = fade(norm(bp(th, 400, 2500) * np.sin(np.linspace(0, np.pi, len(th))) ** 2, 0.3))
pk = t(0.18); SOUNDS['ui_pickup'] = fade(norm(np.sin(2 * np.pi * np.where(pk < 0.08, 880, 1320) * pk) * env(len(pk), 0.002, 0.06), 0.3))
hn = t(0.7); SOUNDS['horn'] = fade(norm(lp(np.sign(np.sin(2 * np.pi * 420 * hn)) + np.sign(np.sin(2 * np.pi * 530 * hn)), 2000) * np.minimum(1, hn * 40), 0.5), 40)
fs = noise(0.12); SOUNDS['step'] = fade(norm(lp(fs, 1200) * env(len(fs), 0.004, 0.025), 0.4))
# loops (seamless)
SOUNDS['loop_wind'] = loop_noise(6, 420, 0.13, 0.5)
SOUNDS['loop_car'] = engine(2.0, 45, (1, 0.6, 0.4, 0.3, 0.2), 0.25, 1300)
SOUNDS['loop_tank'] = engine(2.0, 30, (1, 0.8, 0.6, 0.5, 0.4, 0.3), 0.6, 900)
SOUNDS['loop_heli'] = loop_noise(2.0, 700, 6.5, 0.85, tone=np.full(int(2.4 * SR), 85.0), tone_g=0.25)
SOUNDS['loop_jet'] = loop_noise(3.0, 2600, 0, 0, tone=np.full(int(3.4 * SR), 620.0), tone_g=0.08)
SOUNDS['loop_boat'] = engine(2.0, 55, (1, 0.5, 0.35, 0.25), 0.4, 1600)
SOUNDS['loop_fire'] = loop_noise(4, 1500, 1.7, 0.4)

os.makedirs(OUT, exist_ok=True)
for name, x in SOUNDS.items():
    x = np.clip(x, -1, 1)
    wav = os.path.join(OUT, name + '.wav')
    with wave.open(wav, 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes((x * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-b:a', '64k', os.path.join(OUT, name + '.mp3')], check=True)
    os.remove(wav)
print(len(SOUNDS), 'sounds in', os.path.abspath(OUT))
