#!/usr/bin/env python3
"""Synthesises every sound in VOIDWRIGHT (original procedural sounds, no samples) and encodes them as mono
MP3s in sfx/. Run: python3 tools/sfxgen.py  (needs numpy and ffmpeg). Loops are cross-faded end into start."""
import numpy as np, subprocess, os, wave

SR = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'sfx')
rng = np.random.default_rng(11)
def t(sec): return np.arange(int(sec * SR)) / SR
def noise(sec): return rng.uniform(-1, 1, int(sec * SR))
def lp(x, fc):
    a = np.broadcast_to(1 - np.exp(-2 * np.pi * np.asarray(fc, float) / SR), x.shape)
    y = np.empty_like(x); s = 0.0
    for i in range(len(x)): s += a[i] * (x[i] - s); y[i] = s
    return y
def hp(x, fc): return x - lp(x, fc)
def bp(x, lo, hi): return hp(lp(lp(x, hi), hi), lo)
def env(n, attack=0.002, decay=0.2):
    tt = np.arange(n) / SR
    return np.exp(-tt / decay) * np.clip(tt / max(attack, 1e-4), 0, 1)
def norm(x, peak=0.9): m = np.max(np.abs(x)) or 1; return x / m * peak
def fade(x, ms=8):
    n = int(ms / 1000 * SR); x = x.copy(); x[-n:] *= np.linspace(1, 0, n); return x
def sine(f, sec): tt = t(sec); return np.sin(2 * np.pi * np.cumsum(np.broadcast_to(f, tt.shape)) / SR)
def loop(x, xf=0.4):
    """cross-fade the tail into the head so it repeats without a click"""
    n = int(xf * SR); head, tail = x[:n], x[-n:]
    w = np.linspace(0, 1, n)
    y = x[n:-n].copy() if len(x) > 3 * n else x.copy()
    return np.concatenate([tail * (1 - w) + head * w, x[n:-n]])
def echo(x, wet=0.25):
    y = np.concatenate([x, np.zeros(int(0.5 * SR))])
    for d, g in [(0.023, 0.5), (0.041, 0.4), (0.067, 0.3), (0.11, 0.2), (0.17, 0.12)]:
        k = int(d * SR); y[k:k + len(x)] += lp(x, 3000) * g * wet
    return y

S = {}
# thrusters
n = noise(4.4); S['loop_h2'] = norm(loop(lp(n, 900) * 0.8 + lp(n, 160) * 1.6 + sine(52 + 3 * np.sin(2 * np.pi * 0.5 * t(4.4)), 4.4) * 0.25), 0.8)
tt = t(4.4); S['loop_ion'] = norm(loop(sine(96, 4.4) * 0.5 + sine(192, 4.4) * 0.25 + sine(288 + 2 * np.sin(2 * np.pi * 0.25 * tt), 4.4) * 0.12 + bp(noise(4.4), 1800, 4200) * 0.18 * (1 + 0.3 * np.sin(2 * np.pi * 3 * tt))), 0.7)
tt = t(4.4); S['loop_atmo'] = norm(loop(bp(noise(4.4), 200, 1100) * (0.7 + 0.3 * np.sin(2 * np.pi * 21 * tt)) + sine(84, 4.4) * 0.3), 0.75)
S['loop_jetpack'] = norm(loop(hp(lp(noise(3.4), 5000), 900) * 0.7 + lp(noise(3.4), 300) * 0.5), 0.6)
# tools
tt = t(3.4); buzz = sine(120, 3.4) * 0.3 + sine(240, 3.4) * 0.15
crk = (rng.uniform(0, 1, len(tt)) > 0.995) * rng.uniform(-1, 1, len(tt))
S['loop_weld'] = norm(loop(buzz + lp(crk, 6000) * 4 + hp(noise(3.4), 3000) * 0.2), 0.6)
tt = t(3.4); S['loop_grind'] = norm(loop(bp(noise(3.4), 2200, 5200) * (0.8 + 0.2 * np.sin(2 * np.pi * 7 * tt)) + sine(3150 + 80 * np.sin(2 * np.pi * 1.3 * tt), 3.4) * 0.2 + sine(4120, 3.4) * 0.08), 0.6)
tt = t(3.4); S['loop_drill'] = norm(loop(lp(noise(3.4), 700) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 11 * tt))) + sine(70 + 6 * np.sin(2 * np.pi * 0.7 * tt), 3.4) * 0.5 + bp(noise(3.4), 1500, 3500) * 0.25 * (rng.uniform(0, 1, len(tt)) > 0.6)), 0.7)
# ambience
tt = t(8.4); S['loop_wind'] = norm(loop(lp(noise(8.4), 380 + 260 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.17 * tt))) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.11 * tt + 1))), 0.6)
tt = t(6.4); S['loop_hum'] = norm(loop(sine(50, 6.4) * 0.5 + sine(100, 6.4) * 0.3 + sine(150.5, 6.4) * 0.1 + lp(noise(6.4), 220) * 0.4), 0.5)
# one-shots
def clunk(f=90, d=0.18, click=0.6):
    n = noise(0.6); x = sine(np.linspace(f * 1.4, f * 0.7, len(n)), 0.6) * env(len(n), 0.001, d) + bp(n, 800, 4000) * env(len(n), 0.0005, 0.015) * click
    return fade(norm(echo(x, 0.3)))
S['place'] = clunk()
S['grind_end'] = fade(norm(echo(clunk(140, 0.12, 1.0)[:int(0.6 * SR)] + bp(noise(0.6), 2000, 6000) * env(int(0.6 * SR), 0.001, 0.08) * 0.6)))
S['impact'] = fade(norm(echo(clunk(55, 0.35, 0.8)[:int(0.6 * SR)], 0.5)))
n = noise(0.35); S['paint'] = fade(norm(hp(n, 2500) * np.sin(np.pi * t(0.35) / 0.35) ** 0.5 * 0.6))
S['ui_click'] = fade(norm(sine(1800, 0.05) * env(int(0.05 * SR), 0.0005, 0.012) + sine(2700, 0.05) * env(int(0.05 * SR), 0.0005, 0.008) * 0.5))
x = np.concatenate([sine(320, 0.09) * env(int(0.09 * SR), 0.002, 0.05), np.zeros(int(0.04 * SR)), sine(240, 0.12) * env(int(0.12 * SR), 0.002, 0.07)]); S['ui_error'] = fade(norm(x, 0.6))
x = np.concatenate([sine(900, 0.06) * env(int(0.06 * SR), 0.001, 0.04), sine(1350, 0.08) * env(int(0.08 * SR), 0.001, 0.05)]); S['ui_on'] = fade(norm(x, 0.6))
tt = t(9.6); S['jump_charge'] = fade(norm((sine(80 + 520 * (tt / 9.6) ** 2, 9.6) * 0.5 + sine(160 + 1040 * (tt / 9.6) ** 2, 9.6) * 0.2 + bp(noise(9.6), 400, 3000) * 0.15 * (tt / 9.6) ** 2) * np.clip(tt / 0.5, 0, 1), 0.7), 200)
n = noise(2.5); S['jump'] = fade(norm(echo(lp(n, 1500) * env(len(n), 0.01, 0.6) + sine(np.linspace(400, 40, len(n)), 2.5) * env(len(n), 0.002, 0.5), 0.5)), 200)
n = noise(0.5); S['seat'] = fade(norm(sine(np.linspace(300, 600, len(n)), 0.5) * env(len(n), 0.01, 0.2) * 0.4 + bp(n, 600, 2000) * env(len(n), 0.005, 0.1) * 0.3, 0.5))
n = noise(0.9); S['door'] = fade(norm(bp(n, 300, 1600) * np.sin(np.pi * t(0.9) / 0.9) * 0.7 + clunk(70, 0.1, 0.3)[:len(n)] * 0.5, 0.6))
n = noise(0.18); S['step'] = fade(norm(lp(n, 500) * env(len(n), 0.002, 0.04) + sine(80, 0.18) * env(len(n), 0.002, 0.05) * 0.5, 0.5))
S['land'] = fade(norm(echo(lp(noise(0.5), 400) * env(int(0.5 * SR), 0.002, 0.1) + sine(60, 0.5) * env(int(0.5 * SR), 0.002, 0.12), 0.3), 0.8))
x = sine(np.linspace(600, 1200, int(0.25 * SR)), 0.25) * env(int(0.25 * SR), 0.005, 0.15); S['gear'] = fade(norm(np.concatenate([x, clunk(110, 0.1, 0.8)[:int(0.3 * SR)]]), 0.6))

os.makedirs(OUT, exist_ok=True)
for name, x in S.items():
    x = np.clip(x, -1, 1)
    wav = os.path.join(OUT, name + '.wav')
    with wave.open(wav, 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes((x * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-b:a', '56k', os.path.join(OUT, name + '.mp3')], check=True)
    os.remove(wav)
print(len(S), 'sounds in', os.path.abspath(OUT))
