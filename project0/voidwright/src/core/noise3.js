// 3D simplex noise (after Stefan Gustavson's public-domain reference), seeded, plus fractal sums and a
// cellular crater field. Written here so every planet and asteroid is the same on every machine and in
// every version: the terrain under a parked ship must not move when the game updates.
import { rng } from './noise.js'

const G3 = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1])
const F3 = 1 / 3, K3 = 1 / 6

export function simplex3(seed) {
  const r = rng(seed)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t }
  const perm = new Uint8Array(512), pm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = (perm[i] % 12) * 3 }
  return function (x, y, z) {
    const s = (x + y + z) * F3
    const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s)
    const t = (i + j + k) * K3
    const x0 = x - i + t, y0 = y - j + t, z0 = z - k + t
    let i1, j1, k1, i2, j2, k2
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0 }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1 }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1 }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1 }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1 }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0 }
    }
    const x1 = x0 - i1 + K3, y1 = y0 - j1 + K3, z1 = z0 - k1 + K3
    const x2 = x0 - i2 + 2 * K3, y2 = y0 - j2 + 2 * K3, z2 = z0 - k2 + 2 * K3
    const x3 = x0 - 1 + 0.5, y3 = y0 - 1 + 0.5, z3 = z0 - 1 + 0.5
    const ii = i & 255, jj = j & 255, kk = k & 255
    let n = 0, t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0
    if (t0 > 0) { const g = pm[ii + perm[jj + perm[kk]]]; t0 *= t0; n += t0 * t0 * (G3[g] * x0 + G3[g + 1] * y0 + G3[g + 2] * z0) }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1
    if (t1 > 0) { const g = pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]]; t1 *= t1; n += t1 * t1 * (G3[g] * x1 + G3[g + 1] * y1 + G3[g + 2] * z1) }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2
    if (t2 > 0) { const g = pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]]; t2 *= t2; n += t2 * t2 * (G3[g] * x2 + G3[g + 1] * y2 + G3[g + 2] * z2) }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3
    if (t3 > 0) { const g = pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]]; t3 *= t3; n += t3 * t3 * (G3[g] * x3 + G3[g + 1] * y3 + G3[g + 2] * z3) }
    return 32 * n
  }
}

// Fractal sum in about [-1, 1]; `oct` may be fractional (the last octave fades in), so the level of detail
// can follow the distance smoothly.
export function fbm3(n, x, y, z, oct = 4, lac = 2.03, gain = 0.5) {
  let a = 1, s = 0, w = 0
  const full = Math.floor(oct), frac = oct - full
  for (let i = 0; i < full; i++) { s += a * n(x, y, z); w += a; a *= gain; x *= lac; y *= lac; z *= lac }
  if (frac > 0) { s += a * frac * n(x, y, z); w += a * frac }
  return w ? s / w : 0
}
// Ridged fractal noise in [0, 1]: sharp crests (mountain ranges).
export function ridged3(n, x, y, z, oct = 4) {
  let a = 1, s = 0, w = 0, prev = 1
  for (let i = 0; i < oct; i++) {
    let v = 1 - Math.abs(n(x, y, z)); v *= v
    s += a * v * prev; w += a; prev = v; a *= 0.5; x *= 2.07; y *= 2.07; z *= 2.07
  }
  return s / w
}

function h3(x, y, z, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1442695041) + Math.imul(seed | 0, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
// Craters: a jittered point in each unit cell (density `dens` of cells holding one), a bowl with a raised
// rim round each. Returns a height offset in units of the crater depth (about -1 .. 0.3).
export function craters(x, y, z, seed, dens = 0.5) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  let bowl = 0, rim = 0
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const cx = ix + a, cy = iy + b, cz = iz + c
    const h = h3(cx, cy, cz, seed)
    if (h > dens) continue
    const px = cx + h3(cx, cy, cz, seed + 1), py = cy + h3(cx, cy, cz, seed + 2), pz = cz + h3(cx, cy, cz, seed + 3)
    const r = 0.18 + 0.32 * h3(cx, cy, cz, seed + 4)
    const d = Math.sqrt((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2) / r
    if (d > 1.6) continue
    // a bowl (d < 1), its rim (d about 1) and the ejecta slope outside
    const v = d < 1 ? (d * d - 1) + 0.3 * d ** 6 : 0.3 * Math.max(0, 1 - (d - 1) / 0.6) ** 2
    if (v < bowl) bowl = v; else if (v > rim) rim = v
  }
  return bowl < 0 ? bowl + rim * 0.3 : rim
}
