// The star system of VOIDWRIGHT: a green home world with a grey moon, a rust-red world further out with a
// moon of ice, and fields of asteroids between. Everything is in metres from the home world's centre.
// Planets stay put (as in most building games); the star moves round the sky, so days pass.
import * as THREE from 'three'
import { Planet } from './planet.js'
import { AsteroidField } from './asteroid.js'

export const BODIES = [
  { id: 'halvor', name: 'Halvor', kind: 'terra', R: 30000, g: 9.81, seed: 11, center: [0, 0, 0], relief: 1700,
    atmo: { height: 11000, density: 1 / 24000, day: [0.36, 0.58, 1.0], dusk: [1.0, 0.45, 0.2], gain: 1.1 }, breathable: true,
    ores: ['iron', 'nickel', 'silicon', 'iron', 'cobalt', 'ice'],
    blurb: 'Home. Breathable air, 1 g, plains, dry lakes and high mountains.' },
  { id: 'ket', name: 'Ket', kind: 'moon', R: 8000, g: 2.45, seed: 23, center: [96000, 34000, -52000], relief: 900, ores: ['iron', 'magnesium', 'silver', 'ice', 'nickel'],
    blurb: "Halvor's moon. No air, a quarter g, craters and old lava seas." },
  { id: 'vashti', name: 'Vashti', kind: 'mars', R: 21000, g: 5.9, seed: 37, center: [-310000, -46000, 290000], relief: 1700,
    atmo: { height: 7000, density: 1 / 42000, day: [0.85, 0.62, 0.45], dusk: [0.55, 0.62, 0.9], gain: 0.75 },
    ores: ['iron', 'nickel', 'cobalt', 'gold', 'platinum', 'uranium', 'silicon'],
    blurb: 'Rust deserts, canyons and mesas. Thin air, 0.6 g.' },
  { id: 'oru', name: 'Oru', kind: 'ice', R: 6500, g: 1.7, seed: 41, center: [-268000, -38000, 322000], relief: 400, ores: ['ice', 'ice', 'cobalt', 'silver', 'uranium'],
    blurb: "Vashti's frozen moon: sheets of ice and long cracks. No air." },
]
export const FIELDS = [
  { id: 'ring', name: 'Halvor Shoal', center: [0, 21000, 72000], radius: 7000, count: 46, seed: 5, anchor: 340, ores: ['iron', 'nickel', 'silicon', 'cobalt', 'ice'],
    blurb: 'Rocks in high orbit over Halvor, just outside its pull.' },
  { id: 'ketdebris', name: 'Ket Debris', center: [96000, 54000, -40000], radius: 4000, count: 26, seed: 9, ores: ['iron', 'magnesium', 'silver', 'ice'],
    blurb: 'Fragments over Ket, rich in magnesium and silver.' },
  { id: 'belt', name: 'The Drift', center: [-150000, 6000, 150000], radius: 14000, count: 70, seed: 13, anchor: 420, flat: 0.35, ores: ['iron', 'nickel', 'cobalt', 'gold', 'platinum', 'uranium', 'ice'],
    blurb: 'Deep space between the worlds: gold, platinum and uranium.' },
]

const DAY = 60 * 60 // seconds for the star to go round once

export class Universe {
  constructor(engine) {
    this.engine = engine
    this.planets = BODIES.map(d => new Planet(d, engine))
    this.fields = FIELDS.map(d => new AsteroidField(d, engine))
    this.sunDir = new THREE.Vector3(0.62, 0.42, 0.66).normalize()
    this.time = 0.18 * DAY
    this.tmpG = new THREE.Vector3()
  }
  // the star's direction (from anywhere: it is very far away)
  updateSun(dt) {
    this.time += dt
    const a = this.time / DAY * Math.PI * 2
    // round an axis tilted from the system's up, so seasons of a sort and no fixed poles of night
    const ax = new THREE.Vector3(0.18, 1, -0.12).normalize()
    this.sunDir.set(Math.cos(a), 0.18, Math.sin(a)).normalize().applyAxisAngle(ax, 0.3)
    for (const p of this.planets) p.setSun(this.sunDir)
    return this.sunDir
  }
  // total gravity (m/s^2) at a point, and which body pulls hardest
  gravity(p, out = new THREE.Vector3()) {
    out.set(0, 0, 0)
    let best = null, bg = 0
    for (const pl of this.planets) { const g = pl.gravity(p, out); if (g > bg) { bg = g; best = pl } }
    this.strongest = best
    return out
  }
  // the planet a point is nearest the surface of
  nearestPlanet(p) {
    let best = null, bd = Infinity
    for (const pl of this.planets) { const d = p.distanceTo(pl.center) - pl.R; if (d < bd) { bd = d; best = pl } }
    return best
  }
  // the rock bodies (planets, asteroids) within `pad` metres of a point
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
    for (const p of this.planets) p.update(cam, now, quality.detail)
    for (const f of this.fields) f.update(cam, quality.rocks)
  }
  // terrain and rock building, nearest first, within a time budget
  work(ms) {
    const t0 = performance.now()
    let left = 0
    // the planet the camera is on first
    const order = [...this.planets].sort((a, b) => a.camAlt - b.camAlt)
    for (const p of order) { const rem = ms - (performance.now() - t0); if (rem <= 0.3) break; p.work(rem) }
    for (const f of this.fields) { const rem = ms - (performance.now() - t0); if (rem <= 0.3) break; left += f.work(rem) }
    for (const p of this.planets) left += p.pending
    return left
  }
  // places to jump to and show on the map
  places() {
    return [...this.planets.map(p => ({ id: p.id, name: p.name, pos: p.center, r: p.R, kind: 'planet', blurb: p.def.blurb })),
      ...this.fields.map(f => ({ id: f.def.id, name: f.name, pos: f.center, r: f.radius, kind: 'field', blurb: f.def.blurb }))]
  }
}
