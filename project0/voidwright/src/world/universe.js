// The universe of VOIDWRIGHT. The home system is made by hand: green Halvor and its moon, rust Vashti and its
// ice moon, violet Thessa, the dune world Sabik with its molten moon, and three fields of rock. Beyond it,
// space is laid out in sectors 1,800 km across, most holding a group of worlds made from the sector's
// number: the same worlds for everyone, every visit. Only the groups near you are awake (their ground
// drawn, their gravity felt); the ones behind you go to sleep but stay on your map, which grows as you
// find things. Everything is in metres from Halvor's centre; the star's direction is the same everywhere.
import * as THREE from 'three'
import { Planet } from './planet.js'
import { AsteroidField } from './asteroid.js'
import { rng } from '../core/noise.js'
import { Cosmos, STAR_CELL, starsNear } from './cosmos.js'

export const SECTOR = 1800000
const WAKE = 1050000, SLEEP = 1300000, SENSE = 3400000

const HOME_BODIES = [
  { id: 'halvor', name: 'Halvor', kind: 'terra', R: 30000, g: 9.81, seed: 11, center: [0, 0, 0], relief: 1700,
    atmo: { height: 11000, density: 1 / 24000, day: [0.36, 0.58, 1.0], dusk: [1.0, 0.45, 0.2], gain: 1.1 }, breathable: true, trees: true, clouds: 0.42,
    ores: ['iron', 'nickel', 'silicon', 'iron', 'cobalt', 'ice'],
    blurb: 'Home. Breathable air, 1 g, forests, plains, dry lakes and high mountains.' },
  { id: 'ket', name: 'Ket', kind: 'moon', R: 8000, g: 2.45, seed: 23, center: [96000, 34000, -52000], relief: 900, ores: ['iron', 'magnesium', 'silver', 'ice', 'nickel'],
    blurb: "Halvor's moon. No air, a quarter g, craters and old lava seas." },
  { id: 'vashti', name: 'Vashti', kind: 'mars', R: 21000, g: 5.9, seed: 37, center: [-310000, -46000, 290000], relief: 1700,
    atmo: { height: 7000, density: 1 / 42000, day: [0.85, 0.62, 0.45], dusk: [0.55, 0.62, 0.9], gain: 0.75 },
    ores: ['iron', 'nickel', 'cobalt', 'gold', 'platinum', 'uranium', 'silicon'],
    blurb: 'Rust deserts, canyons and mesas. Thin air, 0.6 g.' },
  { id: 'oru', name: 'Oru', kind: 'ice', R: 6500, g: 1.7, seed: 41, center: [-268000, -38000, 322000], relief: 400, ores: ['ice', 'ice', 'cobalt', 'silver', 'uranium'],
    blurb: "Vashti's frozen moon: sheets of ice and long cracks. No air." },
  { id: 'thessa', name: 'Thessa', kind: 'terra', R: 24000, g: 8.2, seed: 53, center: [520000, 70000, -380000], relief: 1700,
    atmo: { height: 9500, density: 1 / 20000, day: [0.3, 0.85, 0.75], dusk: [0.9, 0.3, 0.7], gain: 1.1 }, trees: true,
    veg: [0.42, 0.26, 0.5], veg2: [0.3, 0.16, 0.42], treeTint: [1.5, 0.6, 1.9], tint: [1, 0.97, 1.03],
    ores: ['silicon', 'cobalt', 'silver', 'gold', 'magnesium', 'ice'],
    blurb: 'A violet world: purple forests under a green sky. The air is thick but not for breathing.' },
  { id: 'nix', name: 'Nix', kind: 'moon', R: 5000, g: 1.5, seed: 59, center: [572000, 84000, -352000], relief: 700, tint: [0.9, 0.85, 1.05], ores: ['silver', 'platinum', 'ice'],
    blurb: "Thessa's little moon, pale and pocked." },
  { id: 'sabik', name: 'Sabik', kind: 'desert', R: 27000, g: 9.0, seed: 67, center: [-180000, 50000, -660000], relief: 1200,
    atmo: { height: 9000, density: 1 / 30000, day: [0.95, 0.82, 0.55], dusk: [0.95, 0.45, 0.25], gain: 0.9 },
    ores: ['iron', 'silicon', 'silicon', 'gold', 'uranium', 'magnesium'],
    blurb: 'Sand seas and mesas under a brass sky. Hot, dry, heavy.' },
  { id: 'cinder', name: 'Cinder', kind: 'lava', R: 7000, g: 2.2, seed: 71, center: [-118000, 66000, -632000], relief: 1500,
    atmo: { height: 3000, density: 1 / 14000, day: [0.6, 0.22, 0.12], dusk: [0.7, 0.2, 0.1], gain: 0.5 }, rock: [0.2, 0.17, 0.16],
    ores: ['iron', 'nickel', 'platinum', 'uranium', 'gold'],
    blurb: "Sabik's molten moon: black rock and rivers of fire. Rich in rare ore." },
]
const HOME_FIELDS = [
  { id: 'ring', name: 'Halvor Shoal', center: [0, 21000, 72000], radius: 7000, count: 46, seed: 5, anchor: 340, ores: ['iron', 'nickel', 'silicon', 'cobalt', 'ice'],
    blurb: 'Rocks in high orbit over Halvor, just outside its pull.' },
  { id: 'ketdebris', name: 'Ket Debris', center: [96000, 54000, -40000], radius: 4000, count: 26, seed: 9, ores: ['iron', 'magnesium', 'silver', 'ice'],
    blurb: 'Fragments over Ket, rich in magnesium and silver.' },
  { id: 'belt', name: 'The Drift', center: [-150000, 6000, 150000], radius: 14000, count: 70, seed: 13, anchor: 420, flat: 0.35, ores: ['iron', 'nickel', 'cobalt', 'gold', 'platinum', 'uranium', 'ice'],
    blurb: 'Deep space between the worlds: gold, platinum and uranium.' },
]
const HOME_GIANTS = [
  { id: 'toren', name: 'Toren', R: 140000, g: 14, seed: 77, center: [980000, -60000, 420000], tilt: 0.38, rings: [190000, 330000], cols: [[0.86, 0.66, 0.42], [0.62, 0.42, 0.28], [0.95, 0.9, 0.8]],
    blurb: 'A gas giant with rings: no ground, only cloud getting thicker the deeper you go, until it crushes. 1.4 g at the cloud tops.' },
]
const HOME_NEBULAE = [{ id: 'veil', name: 'The Veil', center: [-1500000, 380000, 900000], radius: 380000, seed: 5, cols: [[0.55, 0.3, 0.95], [0.2, 0.75, 0.95]], blurb: 'A cloud of glowing gas hundreds of kilometres across.' }]
HOME_FIELDS.push({ id: 'ishu', name: 'Comet Ishu', center: [-420000, 150000, -120000], radius: 900, count: 0, seed: 21, anchor: 320, comet: true, tail: 70000, ores: ['ice', 'ice', 'cobalt', 'silver'],
  blurb: 'A comet: a mountain of dirty ice trailing a tail of light away from the star.' })
export const BODIES = HOME_BODIES, FIELDS = HOME_FIELDS

// ---- worlds made from a sector's number ----
const SYL = ['ka', 've', 'ro', 'thi', 'an', 'dur', 'os', 'el', 'mi', 'ra', 'zen', 'tor', 'ul', 'ga', 'ne', 'sha', 'bri', 'yo', 'pal', 'ix', 'om', 'ter', 'lu', 'vas', 'ke', 'dra', 'in', 'so', 'hal', 'ry']
function makeName(r) { let s = ''; const n = 2 + (r() < 0.35 ? 1 : 0); for (let i = 0; i < n; i++) s += SYL[Math.floor(r() * SYL.length)]; return s[0].toUpperCase() + s.slice(1) }
const SKIES = { terra: [[[0.36, 0.58, 1], [1, 0.45, 0.2]], [[0.3, 0.8, 0.8], [0.9, 0.4, 0.6]], [[0.55, 0.5, 1], [1, 0.5, 0.3]], [[0.75, 0.7, 0.4], [0.9, 0.35, 0.2]]], mars: [[[0.85, 0.62, 0.45], [0.55, 0.62, 0.9]], [[0.7, 0.7, 0.6], [0.8, 0.4, 0.3]]], desert: [[[0.95, 0.82, 0.55], [0.95, 0.45, 0.25]], [[0.7, 0.8, 0.9], [1, 0.5, 0.3]]], lava: [[[0.6, 0.22, 0.12], [0.7, 0.2, 0.1]]], ice: [[[0.6, 0.75, 1], [0.8, 0.6, 0.8]]] }
const VEGS = [[[0.34, 0.41, 0.22], [0.24, 0.33, 0.18], [1, 1, 1]], [[0.2, 0.42, 0.4], [0.12, 0.32, 0.32], [0.6, 1.2, 1.3]], [[0.46, 0.28, 0.48], [0.32, 0.18, 0.4], [1.5, 0.6, 1.8]], [[0.5, 0.36, 0.2], [0.42, 0.24, 0.14], [1.9, 0.9, 0.5]], [[0.3, 0.44, 0.3], [0.18, 0.36, 0.26], [0.8, 1.15, 1]]]
const COMMON = ['iron', 'nickel', 'silicon', 'ice', 'cobalt', 'magnesium'], RARE = ['silver', 'gold', 'platinum', 'uranium']
function pickOres(r, far) { const out = []; const n = 4 + Math.floor(r() * 3); for (let i = 0; i < n; i++) out.push(r() < 0.35 + far * 0.25 ? RARE[Math.floor(r() * RARE.length)] : COMMON[Math.floor(r() * COMMON.length)]); return out }
function hash2i(i, k) { let h = (Math.imul(i | 0, 374761393) + Math.imul(k | 0, 668265263) + 977) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return h >>> 0 }
function makeBody(r, id, name, kind, R, center, far, isMoon) {
  const g = (kind === 'moon' || kind === 'ice' ? 0.12 + r() * 0.25 : 0.45 + r() * 0.75) * 9.81 * (isMoon ? 0.7 : 1)
  const d = { id, name, kind, R, g, seed: Math.floor(r() * 1e6) + 7, center, relief: kind === 'ice' ? 500 : kind === 'moon' ? 900 : kind === 'desert' ? 1300 : 1900, ores: pickOres(r, far) }
  const sk = SKIES[kind]
  if (sk && (kind !== 'ice' || r() < 0.3)) { const s = sk[Math.floor(r() * sk.length)]; d.atmo = { height: R * (0.3 + r() * 0.1) * (kind === 'mars' ? 0.8 : 1), density: 1 / (16000 + r() * 30000), day: s[0], dusk: s[1], gain: kind === 'lava' ? 0.5 : 0.8 + r() * 0.4 } }
  if (kind === 'terra') { const v = VEGS[Math.floor(r() * VEGS.length)]; d.veg = v[0]; d.veg2 = v[1]; d.treeTint = v[2]; d.trees = true; d.breathable = r() < 0.4 }
  if (kind === 'lava') d.rock = [0.2, 0.17, 0.16]
  const t = 0.88 + r() * 0.24; d.tint = [t * (0.94 + r() * 0.12), t * (0.94 + r() * 0.12), t * (0.94 + r() * 0.12)]
  const what = { terra: d.breathable ? 'A living world with air you can breathe.' : 'A living world; its air is not for breathing.', mars: 'Cold deserts and canyons under thin air.', desert: 'Dunes and mesas.', lava: 'Black rock and molten rivers.', ice: 'A frozen ball of ice and cracks.', moon: 'Airless rock and craters.' }[kind]
  d.blurb = `${what} ${(g / 9.81).toFixed(2)} g.`
  return d
}
export function sectorDef(i, k) {
  if (i === 0 && k === 0) return { key: '0,0', i, k, name: 'Home', center: [0, 0, 0], bodies: HOME_BODIES, fields: HOME_FIELDS, giants: HOME_GIANTS, nebulae: HOME_NEBULAE, home: true }
  const r = rng(hash2i(i, k))
  if (r() > 0.66 && !(Math.abs(i) + Math.abs(k) === 1)) return { key: i + ',' + k, i, k, empty: true }
  const far = Math.min(1, Math.hypot(i, k) / 6)
  const c = [(i + (r() - 0.5) * 0.3) * SECTOR, (r() - 0.5) * 300000, (k + (r() - 0.5) * 0.3) * SECTOR]
  const name = makeName(r), key = i + ',' + k
  const dir = () => { const a = r() * Math.PI * 2, e = (r() - 0.5) * 0.5; return [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)] }
  const at = (o, d, len) => [o[0] + d[0] * len, o[1] + d[1] * len, o[2] + d[2] * len]
  const kinds = ['terra', 'terra', 'mars', 'desert', 'lava', 'ice', 'moon']
  const bodies = [], fields = []
  const R0 = 15000 + r() * 23000, k0 = kinds[Math.floor(r() * 5)]
  bodies.push(makeBody(r, `s${key}a`, name, k0, R0, c, far, false))
  const moons = Math.floor(r() * 3)
  for (let m = 0; m < moons; m++) bodies.push(makeBody(r, `s${key}m${m}`, `${name} ${'IV'[m] === 'I' ? 'I' : 'II'}`.replace(' II', m ? ' II' : ' I'), ['moon', 'ice', 'lava', 'moon'][Math.floor(r() * 4)], 3500 + r() * 5500, at(c, dir(), R0 * 2.7 + 22000 + r() * 50000), far, true))
  if (r() < 0.5) { const n2 = makeName(r), R1 = 9000 + r() * 16000; bodies.push(makeBody(r, `s${key}b`, n2, kinds[Math.floor(r() * kinds.length)], R1, at(c, dir(), 250000 + r() * 150000), far, false)) }
  const nf = 1 + Math.floor(r() * 2)
  for (let f = 0; f < nf; f++) fields.push({ id: `s${key}f${f}`, name: `${name} ${['Reef', 'Scatter', 'Shoal', 'Belt'][Math.floor(r() * 4)]}`, center: at(c, dir(), R0 * 2.6 + 30000 + r() * 110000), radius: 4000 + r() * 6000, count: 22 + Math.floor(r() * 30), seed: Math.floor(r() * 1e5) + 3, anchor: r() < 0.5 ? 250 + r() * 200 : 0, ores: pickOres(r, far), blurb: 'A field of drifting rock.' })
  // sometimes a gas giant, a comet, a nebula
  const giants = [], nebulae = []
  if (r() < 0.38) { const R = 90000 + r() * 110000, h = r(); giants.push({ id: `s${key}g`, name: makeName(r), R, g: 9 + r() * 12, seed: Math.floor(r() * 1e5), center: at(c, dir(), 520000 + r() * 300000), tilt: (r() - 0.5) * 0.9, rings: r() < 0.6 ? [R * 1.35, R * (2 + r() * 0.6)] : null,
    cols: h < 0.33 ? [[0.86, 0.66, 0.42], [0.62, 0.42, 0.28], [0.95, 0.9, 0.8]] : h < 0.66 ? [[0.42, 0.62, 0.86], [0.26, 0.38, 0.66], [0.85, 0.92, 1]] : [[0.7, 0.8, 0.55], [0.45, 0.55, 0.36], [0.92, 0.95, 0.8]], blurb: 'A gas giant: no ground, only cloud that crushes the deeper you go.' }) }
  if (r() < 0.3) fields.push({ id: `s${key}c`, name: `Comet ${makeName(r)}`, center: at(c, dir(), 300000 + r() * 300000), radius: 900, count: 0, seed: Math.floor(r() * 1e6), anchor: 220 + r() * 180, comet: true, tail: 40000 + r() * 50000, ores: ['ice', 'ice', ...pickOres(r, far).slice(0, 2)], blurb: 'A comet: dirty ice with a tail of light.' })
  if (r() < 0.25) { const h = r(); nebulae.push({ id: `s${key}n`, name: `${makeName(r)} Nebula`, center: at(c, dir(), 900000 + r() * 400000), radius: 200000 + r() * 250000, seed: Math.floor(r() * 1e5), cols: h < 0.5 ? [[0.95, 0.35, 0.45], [0.95, 0.65, 0.3]] : [[0.3, 0.9, 0.7], [0.3, 0.5, 0.95]], blurb: 'A cloud of glowing gas.' }) }
  return { key, i, k, name, center: c, bodies, fields, giants, nebulae }
}

const DAY = 60 * 60 // seconds for the star to go round once

export class Universe {
  constructor(engine) {
    this.engine = engine
    this.sectors = new Map()        // key -> { def, planets, fields, awake }
    this.known = new Set(['0,0'])   // sectors found (the map)
    this.planets = []; this.fields = []
    this.sunDir = new THREE.Vector3(0.62, 0.42, 0.66).normalize()
    this.time = 0.18 * DAY
    this.tmpG = new THREE.Vector3()
    this.cosmos = new Cosmos(engine, this)
    this.homeDir = new THREE.Vector3().copy(this.sunDir)
    this.cam = new THREE.Vector3()
    this.wake(this.sector(0, 0))
  }
  sector(i, k) {
    const key = i + ',' + k
    let s = this.sectors.get(key)
    if (!s) { s = { key, def: sectorDef(i, k), planets: null, fields: null, awake: false }; this.sectors.set(key, s) }
    return s
  }
  wake(s) {
    if (s.awake || s.def.empty) return
    if (!s.planets) { s.planets = s.def.bodies.map(d => new Planet(d, this.engine)); s.fields = s.def.fields.map(d => new AsteroidField(d, this.engine)) }
    else for (const p of s.planets) p.wake()
    for (const p of s.planets) p.setSun(this.sunDir)
    if (this.cosmos) { for (const g of s.def.giants || []) this.cosmos.addGiant(g); for (const n of s.def.nebulae || []) this.cosmos.addNebula(n); for (const f of s.fields) if (f.def.comet) this.cosmos.addComet(f) }
    s.awake = true
    const fresh = !this.known.has(s.key)
    this.known.add(s.key)
    this.refresh()
    if (fresh) this.onDiscover?.(s.def)
  }
  rest(s) {
    if (!s.awake) return
    for (const p of s.planets) p.sleep()
    for (const f of s.fields) f.sleep()
    for (const g of s.def.giants || []) this.cosmos.removeGiant(g.id)
    for (const n of s.def.nebulae || []) this.cosmos.removeNebula(n.id)
    for (const f of s.fields) if (f.def.comet) this.cosmos.removeComet(f)
    s.awake = false
    this.refresh()
  }
  refresh() {
    this.planets = []; this.fields = []
    for (const s of this.sectors.values()) if (s.awake) { this.planets.push(...s.planets); this.fields.push(...s.fields) }
  }
  byId(id) { for (const s of this.sectors.values()) if (s.planets) for (const p of s.planets) if (p.id === id) return p; return null }
  field(id) { for (const s of this.sectors.values()) if (s.fields) for (const f of s.fields) if (f.def.id === id) return f; return null }
  // wakes whatever is in reach of a point (a new start, a jump) at once
  ensure(p) { this.manage(p) }
  manage(cam) {
    const ci = Math.round(cam.x / SECTOR), ck = Math.round(cam.z / SECTOR), c = new THREE.Vector3()
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const s = this.sector(ci + a, ck + b)
      if (s.def.empty) continue
      const d = c.set(...s.def.center).distanceTo(cam)
      if (!s.awake && d < WAKE) this.wake(s)
    }
    for (const s of this.sectors.values()) if (s.awake && c.set(...s.def.center).distanceTo(cam) > SLEEP) this.rest(s)
  }
  // groups not yet found, near enough for the suit to sense: where to explore next
  signals(cam) {
    const ci = Math.round(cam.x / SECTOR), ck = Math.round(cam.z / SECTOR), out = []
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const s = this.sector(ci + a, ck + b)
      if (s.def.empty || this.known.has(s.key)) continue
      const pos = new THREE.Vector3(...s.def.center), d = pos.distanceTo(cam)
      if (d < SENSE) out.push({ id: 'sig' + s.key, name: 'Unknown signal', pos, r: 420000, kind: 'signal', blurb: 'Something is out there. Go and see.', dist: d })
    }
    return out.sort((x, y) => x.dist - y.dist)
  }
  updateSun(dt) {
    this.time += dt
    this.lastDt = dt
    const a = this.time / DAY * Math.PI * 2
    const ax = new THREE.Vector3(0.18, 1, -0.12).normalize()
    // Vela circles the home system (this is the day); light comes from the nearest star
    this.homeDir.set(Math.cos(a), 0.18, Math.sin(a)).normalize().applyAxisAngle(ax, 0.3)
    const C = this.cosmos
    C.place(this.homeDir)
    const st = C.nearestStar(this.cam)
    this.sunDir.copy(st.pos).sub(this.cam).normalize()
    this.star = st
    for (const p of this.planets) p.setSun(this.tmpG.copy(C.nearestStar(p.center).pos).sub(p.center).normalize())
    return this.sunDir
  }
  heatAt(p) { return this.cosmos.heatAt(p) }
  gravity(p, out = new THREE.Vector3()) {
    out.set(0, 0, 0)
    let best = null, bg = 0
    for (const pl of this.planets) { const g = pl.gravity(p, out); if (g > bg) { bg = g; best = pl } }
    this.cosmos?.gravity(p, out)
    this.strongest = best
    return out
  }
  nearestPlanet(p) {
    let best = null, bd = Infinity
    for (const pl of this.planets) { const d = p.distanceTo(pl.center) - pl.R; if (d < bd) { bd = d; best = pl } }
    return best
  }
  solidsNear(p, pad, out = []) {
    out.length = 0
    for (const pl of this.planets) if (p.distanceTo(pl.center) < pl.R + pl.relief + pad + 50) out.push(pl)
    for (const f of this.fields) if (f.list && p.distanceTo(f.center) < f.radius + 600 + pad) for (const a of f.near(p, pad)) out.push(a)
    return out
  }
  sdf(p, pad = 2) {
    let d = Infinity
    for (const s of this.solidsNear(p, pad, this._near || (this._near = []))) d = Math.min(d, s.sdf(p))
    return d
  }
  update(cam, now, quality) {
    this.cam.copy(cam)
    this.cosmos.update(this.lastDt || 0.016, cam, this.sunDir)
    this.acc = (this.acc || 0) + 1
    if (this.acc % 30 === 1) this.manage(cam)
    for (const p of this.planets) p.update(cam, now, quality.detail)
    for (const f of this.fields) f.update(cam, quality.rocks)
  }
  work(ms) {
    const t0 = performance.now()
    let left = 0
    const order = [...this.planets].sort((a, b) => a.camAlt - b.camAlt)
    for (const p of order) { const rem = ms - (performance.now() - t0); if (rem <= 0.3) break; p.work(rem) }
    for (const f of this.fields) { const rem = ms - (performance.now() - t0); if (rem <= 0.3) break; left += f.work(rem) }
    for (const p of this.planets) left += p.pending
    return left
  }
  // everything found so far (the map, the jump planner)
  places() {
    const out = []
    for (const key of this.known) {
      const [i, k] = key.split(',').map(Number), d = this.sector(i, k).def
      if (d.empty) continue
      for (const b of d.bodies) out.push({ id: b.id, name: b.name, pos: new THREE.Vector3(...b.center), r: b.R, kind: 'planet', ptype: b.kind, blurb: b.blurb, sector: key, group: d.name, air: !!b.atmo, g: b.g })
      for (const f of d.fields) out.push({ id: f.id, name: f.name, pos: new THREE.Vector3(...f.center), r: f.comet ? f.anchor : f.radius, kind: f.comet ? 'comet' : 'field', blurb: f.blurb, sector: key, group: d.name })
      for (const g of d.giants || []) out.push({ id: g.id, name: g.name, pos: new THREE.Vector3(...g.center), r: g.R, kind: 'giant', blurb: g.blurb, sector: key, group: d.name, g: g.g })
      for (const n of d.nebulae || []) out.push({ id: n.id, name: n.name, pos: new THREE.Vector3(...n.center), r: n.radius, kind: 'nebula', blurb: n.blurb, sector: key, group: d.name })
    }
    // the stars: Vela always, and the nearest others
    const C = this.cosmos
    if (C) {
      out.push({ id: 'vela', name: 'Vela', pos: C.home.pos.clone(), r: C.home.R, kind: 'star', blurb: 'The home star. It burns anything that comes within a few of its radii.', group: 'Home' })
      for (const st of C.far(this.cam).slice().sort((a, b) => a.pos.distanceTo(this.cam) - b.pos.distanceTo(this.cam)).slice(0, 4)) out.push({ id: st.id, name: st.name, pos: st.pos.clone(), r: st.R, kind: 'star', blurb: 'A star far beyond the home system.', group: 'Deep space' })
    }
    return out
  }
}
