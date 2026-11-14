// The void between the groups. Lone rocks, small clusters and balls of ice drift in the dark, laid out by
// cell (800 km cubes) from the cell's number, so they are the same for everyone, every visit. None lie
// inside a group or the sphere its star circles in. The suit's scanner picks them up within 1,500 km (the HUD, the map
// and the jump drive list them); they wake, with their rock meshes and their pull on boots and hulls, when
// you come within 70 km. Some carry an event (game/events.js) that happens when you first arrive.
import * as THREE from 'three'
import { AsteroidField } from './asteroid.js'
import { rng } from '../core/noise.js'

export const VOID_CELL = 800000
const SCAN = 1500000, WAKE = 70000, SLEEP = 95000, CLEAR = 2500000
function hash3(i, j, k) { let h = (Math.imul(i | 0, 73856093) ^ Math.imul(j | 0, 19349663) ^ Math.imul(k | 0, 83492791)) + 0x5bd1e995 | 0; h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); return (h ^ (h >>> 16)) >>> 0 }
const ROCKY = ['iron', 'nickel', 'silicon', 'cobalt', 'silver', 'gold', 'magnesium']
const RICH = ['platinum', 'gold', 'uranium']
const SYL = ['ar', 'vo', 'ke', 'lun', 'mor', 'sa', 'tie', 'ra', 'ost', 'el', 'ny', 'cra', 'dis', 'pho', 'ul']
const nm = r => { let s = ''; for (let i = 0; i < 2 + (r() < 0.3 ? 1 : 0); i++) s += SYL[Math.floor(r() * SYL.length)]; return s[0].toUpperCase() + s.slice(1) }
export const EVENTS = ['pirates', 'derelict', 'rich', 'meteors', 'cache', 'distress']

// the site in a cell, or null; `nearGroup(p)` says whether a point is inside a group (no sites there)
export function voidSite(i, j, k, nearGroup) {
  const r = rng(hash3(i, j, k))
  if (r() > 0.42) return null
  const c = [(i + 0.15 + r() * 0.7) * VOID_CELL, (j + 0.15 + r() * 0.7) * VOID_CELL, (k + 0.15 + r() * 0.7) * VOID_CELL]
  if (nearGroup && nearGroup(new THREE.Vector3(...c), CLEAR)) return null
  const roll = r(), kind = roll < 0.34 ? 'ice' : roll < 0.7 ? 'rock' : 'cluster'
  const name = nm(r)
  const ev = r() < 0.5 ? EVENTS[Math.floor(r() * EVENTS.length)] : null
  let ores = [...ROCKY].sort(() => r() - 0.5).slice(0, 2 + Math.floor(r() * 2))
  if (kind === 'ice') ores = ['ice', ores[0]]
  if (ev === 'rich') ores = [RICH[Math.floor(r() * RICH.length)], ...ores]
  const def = {
    id: `v${i},${j},${k}`, void: true, kind, event: ev, center: c, seed: Math.floor(r() * 1e6), ores,
    name: kind === 'ice' ? `${name} Ice` : kind === 'cluster' ? `${name} Drift` : `${name} Rock`,
    radius: kind === 'cluster' ? 1400 + r() * 1200 : 500, count: kind === 'cluster' ? 5 + Math.floor(r() * 7) : Math.floor(r() * 3),
    anchor: kind === 'cluster' ? 0 : 70 + r() * 90, icy: kind === 'ice', iceShare: kind === 'cluster' ? 0.3 : 0,
  }
  def.blurb = (kind === 'ice' ? 'A ball of ice adrift in the void: water, oxygen and hydrogen for the taking.'
    : kind === 'cluster' ? 'A loose drift of rocks in the void, some of them ice.' : 'A lone rock in the void.')
    + (ev === 'rich' ? ' The scanner reads something rich in it.' : ev === 'distress' ? ' A faint distress call comes from it.' : '')
  return def
}

export class Voids {
  constructor(universe, engine) { this.U = universe; this.engine = engine; this.sites = new Map(); this.awake = new Set(); this.key = null; this.scanned = [] }
  nearGroup(p, pad) {
    const S = this.U.sectorSize, ci = Math.round(p.x / S), ck = Math.round(p.z / S)
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const d = this.U.sector(ci + a, ck + b).def
      // (and clear of the sphere its star circles in)
      if (!d.empty && p.distanceTo(new THREE.Vector3(...d.center)) < Math.max(pad, d.star ? d.star.dist + 2.2e6 : 0)) return true
    }
    return p.length() < pad + 6e6   // nor round home (and Vela's circle)
  }
  site(i, j, k) {
    const key = i + ',' + j + ',' + k
    if (!this.sites.has(key)) { const d = voidSite(i, j, k, (p, pad) => this.nearGroup(p, pad)); this.sites.set(key, d ? { def: d, pos: new THREE.Vector3(...d.center), field: null } : null) }
    return this.sites.get(key)
  }
  // the sites the scanner can see from p
  scan(p) {
    const ci = Math.floor(p.x / VOID_CELL), cj = Math.floor(p.y / VOID_CELL), ck = Math.floor(p.z / VOID_CELL), key = ci + ',' + cj + ',' + ck
    if (key !== this.key) {
      this.key = key; this.scanned = []
      const n = Math.ceil(SCAN / VOID_CELL)
      for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) for (let c = -n; c <= n; c++) { const s = this.site(ci + a, cj + b, ck + c); if (s) this.scanned.push(s) }
    }
    return this.scanned.filter(s => s.pos.distanceTo(p) < SCAN)
  }
  // wake the near ones (their rocks become solid), put the far ones to sleep; true if the set changed
  manage(p) {
    let changed = false
    for (const s of this.scan(p)) {
      const d = s.pos.distanceTo(p)
      if (d < WAKE && !this.awake.has(s)) {
        if (!s.field) s.field = new AsteroidField(s.def, this.engine)
        this.awake.add(s); changed = true
      }
    }
    for (const s of [...this.awake]) if (s.pos.distanceTo(p) > SLEEP) { s.field.sleep(); this.awake.delete(s); changed = true }
    if (changed) this.U.refresh()
    return changed
  }
  fields() { return [...this.awake].map(s => s.field) }
  places(p) { return this.scan(p).map(s => ({ id: s.def.id, name: s.def.name, pos: s.pos.clone(), r: s.def.radius, kind: s.def.kind === 'ice' ? 'ice' : 'void', blurb: s.def.blurb, group: 'The void', site: s })) }
}
