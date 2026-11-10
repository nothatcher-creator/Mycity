// A planet or moon: a sphere of rock shaped by noise, drawn as a cube-sphere quadtree (six faces, each
// split into ever smaller square patches near the camera, down to under a metre between points underfoot),
// with skirts hiding the steps between patch sizes, colours by height, slope and latitude, and a shell of
// air drawn from inside and out. The same height function gives the ground to stand and land on.
import * as THREE from 'three'
import { simplex3, fbm3, ridged3, craters } from '../core/noise3.js'
import { clamp, smooth } from '../core/noise.js'
import { lin } from '../core/color.js'
import { patchMaterial, ATMO_UNIFORMS } from './atmo-glsl.js'
import { PlanetVoxels } from './voxels.js'

const SEG = 32
const VEG = [0.34, 0.41, 0.22], VEG2 = [0.24, 0.33, 0.18]
const ORE_COL = { iron: [0.55, 0.36, 0.26], nickel: [0.62, 0.62, 0.5], silicon: [0.72, 0.72, 0.76], cobalt: [0.3, 0.4, 0.62], ice: [0.82, 0.92, 1], magnesium: [0.68, 0.6, 0.76], silver: [0.8, 0.82, 0.86], gold: [0.82, 0.64, 0.26], platinum: [0.86, 0.88, 0.9], uranium: [0.38, 0.6, 0.34] }
const FACES = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
]
// octaves worth adding for features of wavelength `w` when points are `mw` apart
const oct = (w, mw, max) => clamp(Math.log2(w / Math.max(0.01, mw)) - 0.6, 0, max)

// ---- the shapes of the worlds ----
const KINDS = {
  // green and grey: rolling plains, dry lake beds, ranges of sharp mountains, snow up high and at the poles
  terra(P, x, y, z, mw) {
    const n = P.n
    const base = fbm3(n[0], x / 17000, y / 17000, z / 17000, oct(17000, mw, 4))
    const mask = smooth(-0.08, 0.42, fbm3(n[1], x / 11000 + 31, y / 11000, z / 11000, oct(11000, mw, 3)))
    let h = base * 520
    if (mask > 0) { const k = Math.round(oct(5200, mw, 6)); if (k > 0) { const r = ridged3(n[2], x / 4200, y / 4200, z / 4200, k); h += r * r * 1250 * mask } }
    h += fbm3(n[3], x / 1500, y / 1500, z / 1500, oct(1500, mw, 4)) * 110 * (0.35 + mask)
    if (mw < 120) h += fbm3(n[4], x / 190, y / 190, z / 190, oct(190, mw, 3)) * 11
    if (mw < 8) h += n[5](x / 11, y / 11, z / 11) * 0.7 * clamp(8 / mw - 1, 0, 1)
    if (h < -170) h = -170 + (h + 170) * 0.22
    return h
  },
  // grey dust and craters on craters; dark flat seas of old lava
  moon(P, x, y, z, mw) {
    const n = P.n, s = P.seed
    const mare = smooth(0.05, 0.35, fbm3(n[1], x / 7000, y / 7000, z / 7000, oct(7000, mw, 3)))
    let h = fbm3(n[0], x / 5000, y / 5000, z / 5000, oct(5000, mw, 4)) * 380 - mare * 90
    if (mw < 1200) h += craters(x / 2600, y / 2600, z / 2600, s, 0.55) * 380 * (1 - mare * 0.6)
    if (mw < 320) h += craters(x / 700, y / 700, z / 700, s + 9, 0.5) * 110
    if (mw < 80) h += craters(x / 170, y / 170, z / 170, s + 19, 0.45) * 26
    if (mw < 18) h += craters(x / 40, y / 40, z / 40, s + 29, 0.35) * 5
    if (mw < 60) h += fbm3(n[3], x / 120, y / 120, z / 120, oct(120, mw, 3)) * 5
    return h
  },
  // rust deserts: wide canyons, terraced mesas, dunes, a few big craters
  mars(P, x, y, z, mw) {
    const n = P.n, s = P.seed
    let h = fbm3(n[0], x / 15000, y / 15000, z / 15000, oct(15000, mw, 4)) * 900
    const cv = Math.abs(fbm3(n[1], x / 8000, y / 8000, z / 8000, oct(8000, mw, 3)))
    h -= smooth(0.09, 0.0, cv) * 850
    const mesa = fbm3(n[2], x / 2200, y / 2200, z / 2200, oct(2200, mw, 3)) * 420
    h += mesa > 60 ? 60 + Math.round((mesa - 60) / 90) * 90 * 0.8 + (mesa - 60) * 0.2 : mesa
    if (mw < 900) h += craters(x / 3200, y / 3200, z / 3200, s, 0.3) * 300
    if (mw < 100) h += Math.abs(n[3](x / 140, y / 220, z / 140)) * 12
    if (mw < 30) h += fbm3(n[4], x / 60, y / 60, z / 60, oct(60, mw, 3)) * 3
    return h
  },
  // white and pale blue: smooth sheets of ice, long dark cracks, pressure ridges
  ice(P, x, y, z, mw) {
    const n = P.n, s = P.seed
    let h = fbm3(n[0], x / 5200, y / 5200, z / 5200, oct(5200, mw, 4)) * 260
    const k = Math.round(oct(1600, mw, 4))
    if (k > 0) { const r = ridged3(n[1], x / 1600, y / 1600, z / 1600, k); h -= r ** 6 * 60; h += r ** 2 * 30 }
    if (mw < 500) h += craters(x / 1800, y / 1800, z / 1800, s, 0.25) * 120
    if (mw < 50) h += fbm3(n[3], x / 90, y / 90, z / 90, oct(90, mw, 3)) * 3
    return h
  },
  // sand seas: long dunes, flat-topped mesas, dry basins
  desert(P, x, y, z, mw) {
    const n = P.n
    let h = fbm3(n[0], x / 16000, y / 16000, z / 16000, oct(16000, mw, 4)) * 520
    const m = fbm3(n[2], x / 2600, y / 2600, z / 2600, oct(2600, mw, 3))
    h += smooth(0.26, 0.34, m) * 240 + Math.max(0, m - 0.34) * 120
    if (mw < 200) h += Math.abs(n[3](x / 300, y / 460, z / 300)) * 26 * (1 - smooth(0.2, 0.34, m))
    if (mw < 40) h += Math.abs(n[4](x / 60, y / 90, z / 60)) * 4
    if (mw < 8) h += n[5](x / 9, y / 9, z / 9) * 0.4
    return h
  },
  // black basalt, sharp ridges, rivers of molten rock in the low ground
  lava(P, x, y, z, mw) {
    const n = P.n
    let h = fbm3(n[0], x / 9000, y / 9000, z / 9000, oct(9000, mw, 4)) * 480
    const k = Math.round(oct(2600, mw, 5))
    if (k > 0) { const r = ridged3(n[2], x / 2600, y / 2600, z / 2600, k); h += r * r * 800 }
    const c = Math.abs(fbm3(n[1], x / 3200, y / 3200, z / 3200, oct(3200, mw, 3)))
    h -= smooth(0.07, 0.0, c) * 130
    if (mw < 60) h += fbm3(n[3], x / 110, y / 110, z / 110, oct(110, mw, 3)) * 6
    if (mw < 8) h += n[5](x / 7, y / 7, z / 7) * 0.5
    return h
  },
}
// colours (display values; made linear at the end)
const COLS = {
  terra(P, x, y, z, h, slope, lat, out) {
    const v = P.n[6](x / 900, y / 900, z / 900), f = P.n[7](x / 140, y / 140, z / 140)
    const G = P.def.veg || VEG, G2 = P.def.veg2 || VEG2
    let r = G[0] + v * 0.05, g = G[1] + v * 0.04, b = G[2]
    if (v + f * 0.4 > 0.25) { r = G2[0]; g = G2[1]; b = G2[2] }
    if (h < -150) { const k = smooth(-150, -172, h); r += (0.70 - r) * k; g += (0.64 - g) * k; b += (0.5 - b) * k }
    const rock = smooth(0.28, 0.5, slope + f * 0.06)
    r += (0.44 - r) * rock; g += (0.41 - g) * rock; b += (0.38 - b) * rock
    const snowLine = 820 + v * 220 - lat * 1000
    const snow = Math.max(smooth(snowLine, snowLine + 160, h), smooth(0.86, 0.9, lat + f * 0.02)) * (1 - smooth(0.45, 0.62, slope))
    r += (0.92 - r) * snow; g += (0.94 - g) * snow; b += (0.97 - b) * snow
    out[0] = r; out[1] = g; out[2] = b
  },
  moon(P, x, y, z, h, slope, lat, out) {
    const v = P.n[6](x / 1200, y / 1200, z / 1200), mare = smooth(0.05, 0.35, fbm3(P.n[1], x / 7000, y / 7000, z / 7000, 2))
    const g0 = 0.6 + v * 0.06 - mare * 0.26 + slope * 0.1
    out[0] = g0; out[1] = g0 * 0.98; out[2] = g0 * 0.95
  },
  mars(P, x, y, z, h, slope, lat, out) {
    const v = P.n[6](x / 700, y / 700, z / 700)
    let r = 0.66 + v * 0.06, g = 0.36 + v * 0.03, b = 0.22
    const rock = smooth(0.25, 0.5, slope)
    r += (0.42 - r) * rock; g += (0.27 - g) * rock; b += (0.2 - b) * rock
    if (h < -500) { const k = smooth(-500, -800, h); r += (0.5 - r) * k; g += (0.3 - g) * k; b += (0.24 - b) * k }
    const cap = smooth(0.88, 0.93, lat); r += (0.9 - r) * cap; g += (0.88 - g) * cap; b += (0.86 - b) * cap
    out[0] = r; out[1] = g; out[2] = b
  },
  desert(P, x, y, z, h, slope, lat, out) {
    const v = P.n[6](x / 800, y / 800, z / 800), m = fbm3(P.n[2], x / 2600, y / 2600, z / 2600, 2)
    let r = 0.8 + v * 0.05, g = 0.67 + v * 0.04, b = 0.44
    const mesa = smooth(0.26, 0.36, m); r += (0.66 - r) * mesa; g += (0.42 - g) * mesa; b += (0.28 - b) * mesa
    const rock = smooth(0.3, 0.55, slope); r += (0.5 - r) * rock; g += (0.36 - g) * rock; b += (0.26 - b) * rock
    out[0] = r; out[1] = g; out[2] = b
  },
  lava(P, x, y, z, h, slope, lat, out) {
    const v = P.n[6](x / 500, y / 500, z / 500), c = Math.abs(fbm3(P.n[1], x / 3200, y / 3200, z / 3200, 3))
    const g0 = 0.15 + v * 0.03 + slope * 0.08
    out[0] = g0 * 1.05; out[1] = g0 * 0.95; out[2] = g0 * 0.95
    const hot = smooth(0.05, 0.012, c), warm = smooth(0.11, 0.05, c)
    out[0] += warm * 0.25 + hot * 1.3; out[1] += warm * 0.05 + hot * 0.5; out[2] += hot * 0.08
  },
  ice(P, x, y, z, h, slope, lat, out) {
    const v = P.n[6](x / 600, y / 600, z / 600)
    const crack = smooth(-30, -50, h - fbm3(P.n[0], x / 5200, y / 5200, z / 5200, 3) * 260)
    out[0] = 0.86 + v * 0.04 - crack * 0.5; out[1] = 0.92 + v * 0.03 - crack * 0.35; out[2] = 0.98 - crack * 0.15
    if (slope > 0.4) { out[0] *= 0.8; out[1] *= 0.86 }
  },
}

let INDEX = null
function sharedIndex() {
  if (INDEX) return INDEX
  const W = SEG + 1, idx = []
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const a = j * W + i, b = a + 1, c = a + W + 1, d = a + W
    idx.push(a, b, c, a, c, d)
  }
  // skirts: one ring of extra points below each edge, joined to the edge
  const base = W * W
  const edges = [[0, 1, 0], [SEG, 0, 1], [SEG * W + SEG, -1, 0], [SEG * W, 0, -1]]
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k < SEG; k++) {
      const [s, di, dj] = edges[e], a = s + (di + dj * W) * k, b = a + di + dj * W
      const sa = base + e * SEG + k, sb = base + ((e * SEG + k + 1) % (4 * SEG))
      idx.push(b, a, sa, b, sa, sb)
    }
  }
  INDEX = new THREE.BufferAttribute(new Uint16Array(idx), 1)
  return INDEX
}

export class Planet {
  constructor(def, engine) {
    this.def = def
    Object.assign(this, { id: def.id, name: def.name, R: def.R, g0: def.g, seed: def.seed, kind: def.kind })
    this.center = new THREE.Vector3(...def.center)
    this.n = []
    for (let i = 0; i < 8; i++) this.n.push(simplex3(def.seed * 13 + i * 101))
    this.hfn = KINDS[def.kind]; this.cfn = COLS[def.kind]
    this.relief = def.relief || 3000
    this.atmo = def.atmo || null
    this.AR = this.atmo ? this.R + this.atmo.height : this.R
    this.faceArc = this.R * Math.PI / 2
    this.maxLevel = Math.ceil(Math.log2(this.faceArc / 24))
    this.engine = engine
    this.group = new THREE.Group(); this.group.name = def.name
    this.track = engine.track(this.group, this.center)
    this.uniforms = {
      uPC: { value: new THREE.Vector3() }, uPR: { value: this.R }, uAR: { value: this.AR }, uDen: { value: this.atmo ? this.atmo.density : 0 },
      uSunD: { value: new THREE.Vector3(0, 1, 0) }, uDay: { value: new THREE.Color(...(this.atmo?.day || [0, 0, 0])) }, uDusk: { value: new THREE.Color(...(this.atmo?.dusk || [0, 0, 0])) },
      uHaze: { value: this.atmo ? 1 : 0 }, uDetail: { value: engine.detailTex },
    }
    this.mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), this.uniforms, { detail: true })
    this.roots = FACES.map((f, i) => this.node(i, 0, -1, -1, 2))
    this.queue = []
    this.built = 0
    this.digs = []; this.digHash = new Map()
    this.vox = new PlanetVoxels(this)
    this.rock = def.rock || [0.4, 0.37, 0.34]
    this.tint = def.tint || null
    this.ores = def.ores || []
    this.tmp = [0, 0, 0]
    if (this.atmo) this.makeSky()
  }
  node(face, level, a0, b0, size) { return { face, level, a0, b0, size, children: null, mesh: null, want: false, lastUsed: 0, queued: false, center: null } }
  // ---- the ground ----
  height(x, y, z, mw = 0.6) {
    // x, y, z: a direction (any length); the height is for the ground point under it
    const L = Math.sqrt(x * x + y * y + z * z), R = this.R / L
    const h = this.hfn(this, x * R, y * R, z * R, mw)
    return this.digs.length ? this.digAdjust(x / L, y / L, z / L, h) : h
  }
  // ---- holes dug into the ground (drills): the ground under each is lowered to the hole's bottom ----
  digAdjust(ux, uy, uz, h) {
    let g = this.R + h
    const list = this.digHash.get(this.digKey(ux * g, uy * g, uz * g))
    if (!list) return h
    for (let pass = 0; pass < 2; pass++) for (const d of list) {
      const tc = ux * d.x + uy * d.y + uz * d.z, perp = d.x * d.x + d.y * d.y + d.z * d.z - tc * tc
      if (perp >= d.r * d.r) continue
      const s = Math.sqrt(d.r * d.r - perp), lo = tc - s, hi = tc + s
      if (g > lo && g < hi + 0.05) g = lo
    }
    return g - this.R
  }
  digKey(x, y, z) { return Math.floor(x / 48) + ',' + Math.floor(y / 48) + ',' + Math.floor(z / 48) }
  dig(p, r) {
    const x = p.x - this.center.x, y = p.y - this.center.y, z = p.z - this.center.z
    const d = { x, y, z, r }
    this.digs.push(d)
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const k = this.digKey(x + a * (r + 1), y + b * (r + 1), z + c * (r + 1))
      let L = this.digHash.get(k); if (!L) this.digHash.set(k, L = [])
      if (!L.includes(d)) L.push(d)
    }
    this.vox.add(d)
    this.markDirty(new THREE.Vector3(x, y, z), r + 2)
  }
  // the height-map patches round a planet-local point are rebuilt (the old ones stay on screen meanwhile)
  markDirty(lp, r, fineOnly = false) {
    const mark = nd => {
      if (!nd.center || nd.center.distanceTo(lp) > nd.arc * 0.8 + r) return
      if (nd.mesh && (!fineOnly || nd.level >= this.maxLevel - 2)) { nd.dirty = true; this.request(nd, 0) }
      if (nd.children) for (const ch of nd.children) mark(ch)
    }
    for (const rt of this.roots) mark(rt)
  }
  // the colour of dug rock at a planet-local point: the ground's own near the surface, bare rock below
  voxelColor(x, y, z, out) {
    const r = Math.sqrt(x * x + y * y + z * z), q = this.R / r
    const h0 = this.hfn(this, x * q, y * q, z * q, 2), depth = this.R + h0 - r
    if (depth < 0.7) { this.cfn(this, x, y, z, h0, 0.1, Math.abs(y / r), out); if (this.tint) for (let i = 0; i < 3; i++) out[i] *= this.tint[i] }
    else { const f = 0.85 + this.n[5](x / 5, y / 5, z / 5) * 0.15, k = Math.min(1, depth / 30); for (let i = 0; i < 3; i++) out[i] = this.rock[i] * f * (1 - k * 0.25) }
    const ore = this.oreAt(x, y, z)
    if (ore !== 'stone') { const oc = ORE_COL[ore]; for (let i = 0; i < 3; i++) out[i] = out[i] * 0.5 + oc[i] * 0.5 }
  }
  // ore in the ground: patches of the world's ores in the stone
  oreAtWorld(p) {
    const x = p.x - this.center.x, y = p.y - this.center.y, z = p.z - this.center.z
    return this.oreAt(x, y, z)
  }
  oreAt(x, y, z) {
    if (!this.ores.length) return 'stone'
    const v = this.n[7](x / 70 + 13, y / 70, z / 70)
    if (v < 0.42) return 'stone'
    const h = Math.abs(Math.sin(Math.floor(x / 300) * 12.9898 + Math.floor(y / 300) * 78.233 + Math.floor(z / 300) * 37.719) * 43758.5453) % 1
    return this.ores[Math.floor(h * this.ores.length)]
  }
  // signed distance of a system point above the ground (approximate on steep slopes); where holes have
  // been dug it is true 3D: the undug ground with the holes cut out (so tunnels and overhangs hold)
  sdf(p) {
    const dx = p.x - this.center.x, dy = p.y - this.center.y, dz = p.z - this.center.z
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (r - this.R > this.relief + 50) return r - this.R - this.relief
    const q = this.R / r
    let s = r - this.R - this.hfn(this, dx * q, dy * q, dz * q, 0.6)
    if (this.digs.length) { const list = this.digHash.get(this.digKey(dx, dy, dz)); if (list) for (const d of list) { const e = d.r - Math.sqrt((dx - d.x) ** 2 + (dy - d.y) ** 2 + (dz - d.z) ** 2); if (e > s) s = e } }
    return s
  }
  dugNear(p) { return this.digs.length > 0 && this.digHash.has(this.digKey(p.x - this.center.x, p.y - this.center.y, p.z - this.center.z)) }
  // ground facts under a system point: height above it, the ground's normal, the up direction
  surface(p, out = {}) {
    const dx = p.x - this.center.x, dy = p.y - this.center.y, dz = p.z - this.center.z
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz), ux = dx / r, uy = dy / r, uz = dz / r
    if (this.dugNear(p)) {
      // in and round dug rock: the slope of the 3D field
      const e = 0.12, v = this._sv || (this._sv = new THREE.Vector3())
      const f = (a, b, c) => this.sdf(v.set(p.x + a, p.y + b, p.z + c))
      let nx = f(e, 0, 0) - f(-e, 0, 0), ny = f(0, e, 0) - f(0, -e, 0), nz = f(0, 0, e) - f(0, 0, -e)
      const nl = Math.hypot(nx, ny, nz)
      if (nl > 1e-9) { nx /= nl; ny /= nl; nz /= nl } else { nx = ux; ny = uy; nz = uz }
      out.alt = this.sdf(p); out.h = r - this.R - out.alt; out.r = r
      out.nx = nx; out.ny = ny; out.nz = nz; out.ux = ux; out.uy = uy; out.uz = uz
      return out
    }
    const h = this.height(ux, uy, uz)
    // two tangents and the slope along each (half a metre)
    let tx = -uz, ty = 0, tz = ux; if (Math.abs(uy) > 0.9) { tx = 1; ty = 0; tz = 0 }
    let tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl
    const bx = uy * tz - uz * ty, by = uz * tx - ux * tz, bz = ux * ty - uy * tx
    const e = 0.5, k = e / this.R
    const h1 = this.height(ux + tx * k, uy + ty * k, uz + tz * k), h2 = this.height(ux + bx * k, uy + by * k, uz + bz * k)
    const gx = (h1 - h) / e, gy = (h2 - h) / e
    const nx = ux - tx * gx - bx * gy, ny = uy - ty * gx - by * gy, nz = uz - tz * gx - bz * gy
    const nl = Math.hypot(nx, ny, nz)
    out.alt = r - this.R - h; out.h = h; out.r = r
    out.nx = nx / nl; out.ny = ny / nl; out.nz = nz / nl; out.ux = ux; out.uy = uy; out.uz = uz
    return out
  }
  // gravity at a system point (m/s^2), added into `out`; full strength at the surface falling off as 1/r^2,
  // fading to nothing between 1.75 and 2.3 radii (as in most of these games: no endless pull)
  gravity(p, out) {
    const dx = this.center.x - p.x, dy = this.center.y - p.y, dz = this.center.z - p.z
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const rr = Math.max(r, this.R)
    let g = this.g0 * (this.R / rr) ** 2
    g *= 1 - smooth(1.75 * this.R, 2.3 * this.R, r)
    if (g > 0) { out.x += dx / r * g; out.y += dy / r * g; out.z += dz / r * g }
    return g
  }
  // air density (1 at the surface, 0 above the atmosphere)
  air(p) {
    if (!this.atmo) return 0
    const r = p.distanceTo(this.center), alt = r - this.R
    return clamp(1 - alt / (this.atmo.height * 0.82), 0, 1) ** 1.4
  }
  // ---- the patches ----
  dir(face, a, b, out) {
    const [N, U, V] = FACES[face]
    a = Math.tan(a * Math.PI / 4); b = Math.tan(b * Math.PI / 4)
    const x = N[0] + U[0] * a + V[0] * b, y = N[1] + U[1] * a + V[1] * b, z = N[2] + U[2] * a + V[2] * b
    const l = Math.sqrt(x * x + y * y + z * z)
    out[0] = x / l; out[1] = y / l; out[2] = z / l
    return out
  }
  nodeCenter(nd) {
    if (nd.center) return nd.center
    const d = this.dir(nd.face, nd.a0 + nd.size / 2, nd.b0 + nd.size / 2, [0, 0, 0])
    const h = this.height(d[0], d[1], d[2], nd.size * this.faceArc / 2 / SEG)
    nd.center = new THREE.Vector3(d[0], d[1], d[2]).multiplyScalar(this.R + h)
    nd.arc = nd.size * this.faceArc / 2
    return nd.center
  }
  build(nd) {
    const W = SEG + 1, E = SEG + 3, mw = nd.arc / SEG
    const P = new Float64Array(E * E * 3), D = new Float64Array(E * E * 3), H = new Float64Array(E * E)
    const d = [0, 0, 0]
    for (let j = -1; j <= SEG + 1; j++) for (let i = -1; i <= SEG + 1; i++) {
      this.dir(nd.face, nd.a0 + nd.size * i / SEG, nd.b0 + nd.size * j / SEG, d)
      let h = this.hfn(this, d[0] * this.R, d[1] * this.R, d[2] * this.R, mw)
      if (this.digs.length) h = this.digAdjust(d[0], d[1], d[2], h)
      const r = this.R + h, k = ((j + 1) * E + (i + 1))
      P[k * 3] = d[0] * r; P[k * 3 + 1] = d[1] * r; P[k * 3 + 2] = d[2] * r
      D[k * 3] = d[0]; D[k * 3 + 1] = d[1]; D[k * 3 + 2] = d[2]; H[k] = h
    }
    const c = nd.center, n = W * W + 4 * SEG
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), loc = new Float32Array(n * 3)
    const bx = Math.floor(c.x / 4096) * 4096, by = Math.floor(c.y / 4096) * 4096, bz = Math.floor(c.z / 4096) * 4096
    const cc = this.tmp
    for (let j = 0; j <= SEG; j++) for (let i = 0; i <= SEG; i++) {
      const k = (j + 1) * E + (i + 1), o = (j * W + i) * 3
      const l = k - 1, r = k + 1, dn = k - E, up = k + E
      const ax = P[r * 3] - P[l * 3], ay = P[r * 3 + 1] - P[l * 3 + 1], az = P[r * 3 + 2] - P[l * 3 + 2]
      const vx = P[up * 3] - P[dn * 3], vy = P[up * 3 + 1] - P[dn * 3 + 1], vz = P[up * 3 + 2] - P[dn * 3 + 2]
      let nx = ay * vz - az * vy, ny = az * vx - ax * vz, nz = ax * vy - ay * vx
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl
      const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2]
      pos[o] = x - c.x; pos[o + 1] = y - c.y; pos[o + 2] = z - c.z
      nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz
      loc[o] = x - bx; loc[o + 1] = y - by; loc[o + 2] = z - bz
      const slope = 1 - (nx * D[k * 3] + ny * D[k * 3 + 1] + nz * D[k * 3 + 2])
      this.cfn(this, x, y, z, H[k], slope * 1.6, Math.abs(D[k * 3 + 1]), cc)
      if (this.tint) { cc[0] *= this.tint[0]; cc[1] *= this.tint[1]; cc[2] *= this.tint[2] }
      if (this.ores.length && mw < 40) { const ore = this.oreAt(x, y, z); if (ore !== 'stone') { const oc = ORE_COL[ore]; for (let q = 0; q < 3; q++) cc[q] = cc[q] * 0.6 + oc[q] * 0.4 } }
      col[o] = lin(cc[0]); col[o + 1] = lin(cc[1]); col[o + 2] = lin(cc[2])
    }
    // the skirts, hanging below the edges
    const depth = mw * 3 + 2
    const edges = [[0, 1, 0], [SEG, 0, 1], [SEG * W + SEG, -1, 0], [SEG * W, 0, -1]]
    for (let e = 0; e < 4; e++) for (let k = 0; k < SEG; k++) {
      const [s, di, dj] = edges[e], a = s + (di + dj * W) * k, o = (W * W + e * SEG + k) * 3, ao = a * 3
      const i = a % W, j = Math.floor(a / W), kk = (j + 1) * E + (i + 1)
      pos[o] = pos[ao] - D[kk * 3] * depth; pos[o + 1] = pos[ao + 1] - D[kk * 3 + 1] * depth; pos[o + 2] = pos[ao + 2] - D[kk * 3 + 2] * depth
      nor[o] = nor[ao]; nor[o + 1] = nor[ao + 1]; nor[o + 2] = nor[ao + 2]
      col[o] = col[ao]; col[o + 1] = col[ao + 1]; col[o + 2] = col[ao + 2]
      loc[o] = loc[ao]; loc[o + 1] = loc[ao + 1]; loc[o + 2] = loc[ao + 2]
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aLocal', new THREE.BufferAttribute(loc, 3))
    let index = sharedIndex()
    if (this.vox.ready && nd.level >= this.maxLevel - 2) {
      // leave out the triangles a dug chunk now draws
      let cut = null
      const src = index.array
      for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
        const k0 = (j + 1) * E + (i + 1), k1 = k0 + E + 1
        if (!this.vox.cut((P[k0 * 3] + P[k1 * 3]) / 2, (P[k0 * 3 + 1] + P[k1 * 3 + 1]) / 2, (P[k0 * 3 + 2] + P[k1 * 3 + 2]) / 2)) continue
        if (!cut) cut = new Uint16Array(src)
        const q = (j * SEG + i) * 6
        for (let t = 0; t < 6; t++) cut[q + t] = 0
      }
      if (cut) index = new THREE.BufferAttribute(cut, 1)
    }
    g.setIndex(index)
    g.computeBoundingSphere()
    const m = new THREE.Mesh(g, this.mat)
    m.position.copy(c); m.matrixAutoUpdate = false; m.updateMatrix()
    m.visible = false
    if (nd.mesh) { m.visible = nd.mesh.visible; nd.mesh.geometry.dispose(); this.group.remove(nd.mesh) }
    nd.dirty = false
    this.group.add(m)
    nd.mesh = m
    this.built++
  }
  // ---- choosing patches round the camera ----
  update(cam, now, detail = 1) {
    const lc = this.lc || (this.lc = new THREE.Vector3())
    lc.copy(cam).sub(this.center)
    this.camAlt = lc.length() - this.R
    this.now = now; this.detailK = 2.25 * detail
    for (const r of this.roots) this.visit(r, lc)
    this.vox.update(lc)
    // the uniforms the shaders use (scene coordinates)
    this.engine.rel(this.center, this.uniforms.uPC.value)
    if (this.sky) { this.sky.u.uPC.value.copy(this.uniforms.uPC.value); this.sky.u.uSunD.value.copy(this.uniforms.uSunD.value) }
  }
  visit(nd, lc) {
    nd.lastUsed = this.now
    const c = this.nodeCenter(nd)
    const d = c.distanceTo(lc)
    const split = nd.level < this.maxLevel && d < nd.arc * this.detailK
    if (split) {
      if (!nd.children) {
        const h = nd.size / 2
        nd.children = [this.node(nd.face, nd.level + 1, nd.a0, nd.b0, h), this.node(nd.face, nd.level + 1, nd.a0 + h, nd.b0, h),
          this.node(nd.face, nd.level + 1, nd.a0, nd.b0 + h, h), this.node(nd.face, nd.level + 1, nd.a0 + h, nd.b0 + h, h)]
      }
      let all = true
      for (const ch of nd.children) if (!this.visit(ch, lc)) all = false
      if (all) { if (nd.mesh) nd.mesh.visible = false; return true }
      for (const ch of nd.children) this.hide(ch)
      if (nd.mesh) { nd.mesh.visible = true; return true }
      // no need to build this patch only to cover the wait for its children: an ancestor covers it
      if (nd.level === 0) this.request(nd, d)
      return false
    }
    if (nd.children) { for (const ch of nd.children) this.hide(ch); if (this.now - (nd.splitAt || 0) > 4) this.prune(nd) }
    if (nd.children) nd.splitAt = nd.splitAt || this.now; else nd.splitAt = 0
    if (nd.mesh) { nd.mesh.visible = true; return true }
    this.request(nd, d); return false
  }
  hide(nd) { if (nd.mesh) nd.mesh.visible = false; if (nd.children) for (const c of nd.children) this.hide(c) }
  prune(nd) {
    for (const c of nd.children) { if (c.children) this.prune(c); this.free(c) }
    nd.children = null; nd.splitAt = 0
  }
  free(nd) { if (nd.mesh) { nd.mesh.geometry.dispose(); this.group.remove(nd.mesh); nd.mesh = null } }
  request(nd, d) { if (!nd.queued) { nd.queued = true; this.queue.push(nd) } nd.prio = d / nd.arc - nd.level * 0.01 }
  // builds the most wanted patches for up to `ms` milliseconds
  work(ms) {
    const t0 = performance.now()
    if (this.vox.pending) { this.vox.work(ms); if (performance.now() - t0 >= ms) return 1 }
    if (!this.queue.length) return 0
    this.queue.sort((a, b) => a.prio - b.prio)
    let n = 0
    while (this.queue.length && performance.now() - t0 < ms) {
      const nd = this.queue.shift(); nd.queued = false
      if (this.now - nd.lastUsed > 0.5 || (nd.mesh && !nd.dirty)) continue
      this.build(nd); n++
    }
    return n
  }
  get pending() { return this.queue.length + this.vox.pending }
  // ---- the air, seen from inside and out ----
  makeSky() {
    const a = this.atmo
    const u = {
      uPC: { value: new THREE.Vector3() }, uPR: { value: this.R }, uAR: { value: this.AR }, uDen: { value: a.density },
      uSunD: { value: new THREE.Vector3(0, 1, 0) }, uDay: { value: new THREE.Color(...a.day) }, uDusk: { value: new THREE.Color(...a.dusk) },
      uHaze: { value: 1 }, uGain: { value: a.gain || 1 },
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: u, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `varying vec3 vW; uniform float uGain;${ATMO_UNIFORMS}
        void main() {
          vec3 ro = cameraPosition - uPC, rd = normalize(vW - cameraPosition);
          vec2 ta = vwSphere(ro, rd, uAR), tp = vwSphere(ro, rd, uPR * 0.999);
          float t0 = max(ta.x, 0.0), t1 = ta.y;
          if (tp.x > 0.0) t1 = min(t1, tp.x);
          if (t1 <= t0) discard;
          float seg = (t1 - t0) / 6.0, H = (uAR - uPR) * 0.22, od = 0.0;
          vec3 acc = vec3(0.0); float tot = 0.0;
          for (int i = 0; i < 6; i++) {
            vec3 p = ro + rd * (t0 + seg * (float(i) + 0.5)); float r = length(p);
            float dn = exp(-max(0.0, r - uPR) / H); float sh = dot(p / r, uSunD);
            float lit = smoothstep(-0.2, 0.06, sh);
            vec3 c = mix(uDusk, uDay, smoothstep(-0.02, 0.32, sh));
            float w = dn * seg * uDen;
            acc += c * lit * w * exp(-od * 0.5); tot += w; od += w;
          }
          float mu = max(dot(rd, uSunD), 0.0);
          vec3 col = acc / max(tot, 1e-6) * (1.0 - exp(-tot * 11.0 * uGain)) * 1.15;
          col *= 1.0 + 1.6 * pow(mu, 12.0) + 0.4 * pow(mu, 3.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
    const m = new THREE.Mesh(new THREE.SphereGeometry(this.AR, 96, 48), mat)
    m.frustumCulled = false
    m.renderOrder = -1
    this.group.add(m)
    this.sky = { mesh: m, u }
  }
  setSun(dir) { this.uniforms.uSunD.value.copy(dir) }
  // asleep: nothing drawn, nothing built, but the world (and the holes dug in it) is remembered
  sleep() {
    for (const r of this.roots) { if (r.children) this.prune(r); this.free(r); r.queued = false }
    this.queue.length = 0
    this.vox.dispose(); for (const c of this.vox.chunks.values()) { c.ready = false; c.dirty = true; c.queued = false } this.vox.ready = 0; this.vox.queue.length = 0
    this.engine.untrack(this.track); this.track = null; this.asleep = true
  }
  wake() { if (!this.track) this.track = this.engine.track(this.group, this.center); this.asleep = false }
  dispose() { this.vox.dispose(); for (const r of this.roots) { if (r.children) this.prune(r); this.free(r) } this.engine.untrack(this.track) }
}
