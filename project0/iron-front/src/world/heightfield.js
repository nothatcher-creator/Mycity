// The shape of the land. A coarse grid (20 m) holds the big forms (coast, mountains, valleys, rivers, lakes,
// flats for towns); heightAt() adds fine detail, cuts the roads in and levels building pads on top of it.
// Pure functions of the blueprint: the same in every browser and in the offline tools.
import { simplex2, fbm, ridged, clamp, lerp, smooth, hash2 } from '../core/noise.js'
import { WORLD, HALF, SEED, ISLAND, PEAKS, PLATEAUS, LAKES, RIVERS, ROAD_WIDTH, PLACES } from './blueprint.js'
import { ROADS } from './roads-data.js'

const nA = simplex2(SEED), nB = simplex2(SEED + 1), nC = simplex2(SEED + 2), nD = simplex2(SEED + 3)
export const GRID = 600                     // cells a side
export const CELL = WORLD / GRID            // 20 m
const N1 = GRID + 1

// ---------- curves ----------
// A Catmull-Rom curve through control points, sampled every `step` metres: [[x, z], ...].
export function sampleCurve(pts, step) {
  const out = []
  const P = i => pts[Math.max(0, Math.min(pts.length - 1, i))]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2)
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(1, Math.ceil(len / step))
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3)
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  out.push(pts[pts.length - 1].slice())
  return out
}

// A grid index of line segments (for nearest-segment queries).
class SegIndex {
  constructor(cell) { this.cell = cell; this.map = new Map(); this.segs = [] }
  key(ix, iz) { return ix * 100003 + iz }
  add(seg, pad) {
    const id = this.segs.push(seg) - 1, c = this.cell
    const x0 = Math.floor((Math.min(seg.ax, seg.bx) - pad) / c), x1 = Math.floor((Math.max(seg.ax, seg.bx) + pad) / c)
    const z0 = Math.floor((Math.min(seg.az, seg.bz) - pad) / c), z1 = Math.floor((Math.max(seg.az, seg.bz) + pad) / c)
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = this.key(ix, iz); let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(id)
    }
  }
  near(x, z) { return this.map.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) }
}
// Distance from (x, z) to segment s, and how far along it (0..1).
function segDist(s, x, z, out) {
  const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz
  let t = l2 > 0 ? ((x - s.ax) * dx + (z - s.az) * dz) / l2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const px = s.ax + dx * t - x, pz = s.az + dz * t - z
  out.t = t; out.d = Math.sqrt(px * px + pz * pz)
  return out
}

// ---------- the big forms ----------
// How much land there is (>0 land, <0 sea).
export function landShape(x, z) {
  const wx = x + 700 * nB(x / 2600, z / 2600), wz = z + 700 * nB(x / 2600 + 7, z / 2600 - 3)
  let s = 1 - Math.hypot(wx / ISLAND.rx, wz / ISLAND.rz) + 0.2 * fbm(nA, wx / 1900, wz / 1900, 5)
  for (const c of ISLAND.capes) s += c.a * Math.exp(-((x - c.x) ** 2 + (z - c.z) ** 2) / (c.r * c.r))
  for (const b of ISLAND.bays) s -= b.a * Math.exp(-((x - b.x) ** 2 + (z - b.z) ** 2) / (b.r * b.r))
  return s
}

function plateauMask(p, x, z) {
  let d
  if (p.w) {
    const c = Math.cos(p.angle), s = Math.sin(p.angle), lx = (x - p.x) * c + (z - p.z) * s, lz = -(x - p.x) * s + (z - p.z) * c
    d = Math.max(Math.abs(lx) - p.w, Math.abs(lz) - p.d, 0) + Math.min(Math.max(Math.abs(lx) - p.w, Math.abs(lz) - p.d), 0)
  } else d = Math.hypot(x - p.x, z - p.z) - p.r
  return 1 - smooth(0, p.fall, d)
}

// The land before plateaus, lakes and rivers.
function rawHeight(x, z) {
  const s = landShape(x, z)
  if (s < 0) return Math.max(-45, s * 260 - 1.5)
  const coast = smooth(0, 0.08, s), inland = smooth(0.03, 0.45, s)
  let h = 1.2 + 6 * coast + 34 * inland
  h += inland * 55 * (0.5 + 0.5 * fbm(nC, x / 1600, z / 1600, 4))
  h += inland * 18 * fbm(nD, x / 520, z / 520, 3)
  for (const p of PEAKS) {
    const dx = (x - p.x) / p.r, dz = (z - p.z) / p.r, d2 = dx * dx + dz * dz
    if (d2 > 9) continue
    const r = ridged(nA, x / 650 + p.x, z / 650 + p.z, 4)
    h += p.h * Math.exp(-Math.pow(d2, 1.1)) * (1 - p.ridge + p.ridge * 1.6 * r) * coast
  }
  return h
}

// Plateaus take the land's height at their middle unless they say otherwise.
const plateauH = PLATEAUS.map(p => p.h ?? Math.max(4, rawHeight(p.x, p.z)))
const lakeLevel = LAKES.map(l => {
  // a lake's water stands a little below the lowest of its rim
  let m = Infinity
  for (let a = 0; a < 16; a++) m = Math.min(m, rawHeight(l.x + Math.cos(a / 16 * 6.283) * l.r * 1.2, l.z + Math.sin(a / 16 * 6.283) * l.r * 1.2))
  return Math.max(1, m - 2)
})

function noRivers(x, z) {
  let h = rawHeight(x, z)
  for (let i = 0; i < PLATEAUS.length; i++) {
    const m = plateauMask(PLATEAUS[i], x, z)
    if (m > 0) h = lerp(h, plateauH[i], m)
  }
  for (let i = 0; i < LAKES.length; i++) {
    const l = LAKES[i], d = Math.hypot(x - l.x, z - l.z)
    if (d < l.r * 1.6) {
      const bowl = lakeLevel[i] - l.depth * (1 - (d / l.r) ** 2)
      const m = 1 - smooth(l.r * 0.85, l.r * 1.55, d)
      h = lerp(h, Math.min(h, d < l.r ? bowl : lakeLevel[i] + (d - l.r) * 0.08), m)
    }
  }
  return h
}

// ---------- rivers ----------
const riverIdx = new SegIndex(100)
export const riverLines = []   // [{ id, name, width, pts: [[x, z, level], ...] }]
function buildRivers() {
  for (const r of RIVERS) {
    const pts = sampleCurve(r.pts, 15)
    let level = Infinity
    const line = pts.map(([x, z]) => {
      let h = noRivers(x, z) - 2.2
      for (let i = 0; i < LAKES.length; i++) if (Math.hypot(x - LAKES[i].x, z - LAKES[i].z) < LAKES[i].r) h = lakeLevel[i]
      level = Math.min(level, h)
      return [x, z, Math.max(level, landShape(x, z) < 0 ? 0 : 0.25)]
    })
    riverLines.push({ id: r.id, name: r.name, width: r.width, pts: line })
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1]
      riverIdx.add({ ax: a[0], az: a[1], bx: b[0], bz: b[1], ha: a[2], hb: b[2], w: r.width }, r.width * 2 + 60)
    }
  }
}
const _q = { d: 0, t: 0 }
// The river nearest (x, z): { d, level, w } or null.
function riverAt(x, z) {
  const ids = riverIdx.near(x, z)
  if (!ids) return null
  let best = null
  for (const id of ids) {
    const s = riverIdx.segs[id]
    segDist(s, x, z, _q)
    if (!best || _q.d < best.d) best = { d: _q.d, level: lerp(s.ha, s.hb, _q.t), w: s.w }
  }
  return best
}
function macro(x, z) {
  let h = noRivers(x, z)
  const r = riverAt(x, z)
  if (r) {
    const half = r.w / 2, bed = r.level - Math.min(4.5, 1.5 + r.w * 0.09)
    if (r.d < half) h = Math.min(h, lerp(bed, r.level - 0.6, (r.d / half) ** 3))
    else h = lerp(Math.min(h, r.level + (r.d - half) * 0.35 - 0.6), h, smooth(half, half + 45, r.d))
  }
  return h
}

// ---------- the grid ----------
export const base = new Float32Array(N1 * N1)
export const flatMask = new Uint8Array(N1 * N1)   // 255 where land is levelled (towns, lakes, rivers): no fine bumps
export function bilinear(arr, x, z) {
  const gx = clamp((x + HALF) / CELL, 0, GRID - 0.0001), gz = clamp((z + HALF) / CELL, 0, GRID - 0.0001)
  const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, i = iz * N1 + ix
  const a = arr[i], b = arr[i + 1], c = arr[i + N1], d = arr[i + N1 + 1]
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz
}

// ---------- roads ----------
const roadIdx = new SegIndex(64)
export const roadLines = []   // [{ id, kind, w, pts: [[x, z, h, bridge], ...] }]
export function addRoad(id, kind, ctrl, step = 8, flat = null) {
  const w = ROAD_WIDTH[kind] || 7
  const pts = sampleCurve(ctrl, step)
  const n = pts.length
  // the ground under the line, lightly smoothed and held to a grade (10% highways, 13% roads, 30% dirt
  // tracks), never under the water; then kept within a cutting or embankment of a few metres, so roads
  // hug the land and only cross water on bridges
  const g = pts.map(([x, z]) => Math.max(bilinear(base, x, z), waterLevel(x, z) + 1.2))
  let prof = g.map((_, i) => {
    let s = 0, c = 0
    for (let k = -5; k <= 5; k++) { const j = Math.max(0, Math.min(n - 1, i + k)); s += g[j]; c++ }
    return s / c
  })
  if (flat != null) prof = prof.map(() => flat)
  const maxStep = step * (kind === 'dirt' ? 0.3 : kind === 'road' ? 0.13 : kind === 'street' ? 0.12 : 0.1)
  const grade = () => {
    for (let i = 1; i < n; i++) prof[i] = clamp(prof[i], prof[i - 1] - maxStep, prof[i - 1] + maxStep)
    for (let i = n - 2; i >= 0; i--) prof[i] = clamp(prof[i], prof[i + 1] - maxStep, prof[i + 1] + maxStep)
  }
  for (let pass = 0; pass < 4; pass++) {
    grade()
    if (flat == null) for (let i = 0; i < n; i++) prof[i] = clamp(prof[i], g[i] - 7, g[i] + 6)
  }
  grade()
  const line = pts.map(([x, z], i) => {
    const wl = waterLevel(x, z), under = bilinear(base, x, z)
    const bridge = (wl > -50 && under < wl + 0.5) || prof[i] - under > 5.5
    return [x, z, prof[i], bridge ? 1 : 0]
  })
  // a bridge reaches a little past the water on both sides
  for (let i = 0; i < n; i++) if (line[i][3] === 1) for (let k = -3; k <= 3; k++) { const j = i + k; if (j >= 0 && j < n && line[j][3] === 0) line[j][3] = 2 }
  const road = { id, kind, w, pts: line }
  roadLines.push(road)
  for (let i = 0; i < n - 1; i++) {
    const a = line[i], b = line[i + 1]
    roadIdx.add({ ax: a[0], az: a[1], bx: b[0], bz: b[1], ha: a[2], hb: b[2], w, bridge: a[3] === 1 && b[3] === 1, road: roadLines.length - 1, i }, w / 2 + 16)
  }
  return road
}
// The road nearest (x, z) within reach: { d, h, w, bridge, kind } or null.
export function roadAt(x, z) {
  const ids = roadIdx.near(x, z)
  if (!ids) return null
  let best = null
  for (const id of ids) {
    const s = roadIdx.segs[id]
    segDist(s, x, z, _q)
    if (!best || _q.d < best.d) best = { d: _q.d, h: lerp(s.ha, s.hb, _q.t), w: s.w, bridge: s.bridge, kind: roadLines[s.road].kind, seg: s }
  }
  return best
}

// ---------- pads (ground levelled under buildings) ----------
const padIdx = new Map()
const PAD_CELL = 64
export const pads = []
export function addPad(x, z, hw, hd, angle, h) {
  const p = { x, z, hw, hd, c: Math.cos(angle), s: Math.sin(angle), h }
  pads.push(p)
  const r = Math.hypot(hw, hd) + 6
  for (let ix = Math.floor((x - r) / PAD_CELL); ix <= Math.floor((x + r) / PAD_CELL); ix++)
    for (let iz = Math.floor((z - r) / PAD_CELL); iz <= Math.floor((z + r) / PAD_CELL); iz++) {
      const k = ix * 100003 + iz; let a = padIdx.get(k); if (!a) padIdx.set(k, a = []); a.push(p)
    }
  return p
}

// ---------- the fine height, used by everything ----------
// The ground's height at (x, z), without buildings.
export function heightAt(x, z) {
  let h = bilinear(base, x, z)
  const flat = bilinear(flatMask, x, z) / 255
  if (flat < 1 && h > 1) {
    const amp = (0.5 + Math.min(3.2, Math.max(0, h - 60) / 110)) * (1 - flat)
    h += amp * (nD(x / 70, z / 70) * 1.2 + nC(x / 19, z / 19) * 0.35)
  }
  const r = roadAt(x, z)
  if (r && !r.bridge) {
    const t = smooth(r.w / 2 + 0.5, r.w / 2 + 14, r.d)
    h = lerp(r.h - 0.02, h, t)
  }
  const ps = padIdx.get(Math.floor(x / PAD_CELL) * 100003 + Math.floor(z / PAD_CELL))
  if (ps) for (const p of ps) {
    const lx = (x - p.x) * p.c + (z - p.z) * p.s, lz = -(x - p.x) * p.s + (z - p.z) * p.c
    const d = Math.max(Math.abs(lx) - p.hw, Math.abs(lz) - p.hd, 0)
    if (d < 6) h = lerp(p.h, h, smooth(0, 6, d))
  }
  return h
}

// The water's surface at (x, z): the sea, a lake or a river; -100 where there is none.
export function waterLevel(x, z) {
  let w = landShape(x, z) < 0.04 ? 0 : -100
  for (let i = 0; i < LAKES.length; i++) if (Math.hypot(x - LAKES[i].x, z - LAKES[i].z) < LAKES[i].r * 1.05) w = Math.max(w, lakeLevel[i])
  const r = riverAt(x, z)
  if (r && r.d < r.w / 2 + 3) w = Math.max(w, r.level)
  return w
}
export const lakeLevels = lakeLevel

// The ground's normal at (x, z) (finite differences).
export function normalAt(x, z, out = [0, 1, 0], e = 1.5) {
  const hx = heightAt(x + e, z) - heightAt(x - e, z), hz = heightAt(x, z + e) - heightAt(x, z - e)
  const l = Math.hypot(hx, 2 * e, hz)
  out[0] = -hx / l; out[1] = 2 * e / l; out[2] = -hz / l
  return out
}

// What the ground is made of at (x, z) (for bullets and footsteps): sand, grass, soil, rock, asphalt, water.
export function surfaceAt(x, z, y = null) {
  const h = y ?? heightAt(x, z), wl = waterLevel(x, z)
  if (wl > h + 0.05) return 'water'
  const r = roadAt(x, z)
  if (r && r.d < r.w / 2) return r.kind === 'dirt' ? 'soil' : 'asphalt'
  if (h < 3 && landShape(x, z) < 0.07) return 'sand'
  const n = normalAt(x, z)
  if (n[1] < 0.72 || h > 520) return 'rock'
  return forestAt(x, z, h) > 0.5 ? 'soil' : 'grass'
}

// How thick the forest is (0..1): dense on Mount Hallen's slopes and in patches elsewhere, never in towns,
// on roads or in water.
export function forestAt(x, z, h = null) {
  h = h ?? bilinear(base, x, z)
  if (h < 3) return 0
  const flat = bilinear(flatMask, x, z) / 255
  let f = 0.5 + 0.5 * fbm(nB, x / 900 + 11, z / 900 - 4, 3)
  f = smooth(0.48, 0.66, f)
  // the mountain is wooded up to the tree line
  const m = PEAKS[0], dm = Math.hypot(x - m.x, z - m.z)
  if (dm < 2600 && h > 70 && h < 640) f = Math.max(f, smooth(2600, 1400, dm) * (0.75 + 0.25 * nA(x / 300, z / 300)))
  if (h > 560) f *= 1 - smooth(560, 680, h)
  return clamp(f * (1 - flat), 0, 1)
}

// Farm fields: patchwork rectangles near villages. Returns 0 (none) or a field index 1..3.
export function fieldAt(x, z) {
  const fx = Math.floor((x + 37) / 180), fz = Math.floor((z - 61) / 130)
  const v = hash2(fx, fz, 77)
  let near = 0
  for (const p of PLACES) if (p.kind === 'village' || p.kind === 'town') {
    const d = Math.hypot(x - p.x, z - p.z)
    if (d > p.r * 0.9 && d < p.r * 3.4) near = 1
  }
  if (!near || v < 0.25) return 0
  return 1 + Math.floor(hash2(fx, fz, 78) * 3)
}

// Thermal erosion: wherever a cell stands more than `talus` metres above a neighbour, part of the
// difference slides down. Cliffs become steep slopes a road can wind up and a soldier can climb.
function erode(iters, talus) {
  const tmp = new Float32Array(base.length)
  for (let it = 0; it < iters; it++) {
    tmp.set(base)
    for (let iz = 1; iz < GRID; iz++) for (let ix = 1; ix < GRID; ix++) {
      const i = iz * N1 + ix, h = base[i]
      if (h < 30) continue
      for (const o of [1, -1, N1, -N1]) {
        const d = h - base[i + o]
        if (d > talus) { const m = (d - talus) * 0.25; tmp[i] -= m; tmp[i + o] += m }
      }
    }
    base.set(tmp)
  }
}

// ---------- start ----------
let ready = false
export function initHeightfield(opts = {}) {
  if (ready) return
  const progress = typeof opts === 'function' ? opts : opts.progress
  buildRivers()
  for (let iz = 0; iz < N1; iz++) {
    const z = iz * CELL - HALF
    for (let ix = 0; ix < N1; ix++) {
      const x = ix * CELL - HALF
      base[iz * N1 + ix] = macro(x, z)
      let fl = 0
      for (const p of PLATEAUS) fl = Math.max(fl, plateauMask(p, x, z))
      for (const l of LAKES) fl = Math.max(fl, 1 - smooth(l.r * 0.9, l.r * 1.4, Math.hypot(x - l.x, z - l.z)))
      const r = riverAt(x, z)
      if (r) fl = Math.max(fl, 1 - smooth(r.w / 2 + 10, r.w / 2 + 60, r.d))
      flatMask[iz * N1 + ix] = Math.round(fl * 255)
    }
    if (progress && iz % 60 === 0) progress(iz / N1 * 0.8)
  }
  erode(14, 0.8 * CELL)
  if (!opts.noRoads) for (const r of ROADS) addRoad(r.id, r.kind, r.pts)
  ready = true
}
export function heightfieldReady() { return ready }
