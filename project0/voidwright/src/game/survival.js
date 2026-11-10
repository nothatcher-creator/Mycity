// Survival rules: the linked inventories of a grid (every inventory on a grid is reachable, as if joined by
// ducts), refineries and assemblers working through the grid's cargo, ice split into oxygen and hydrogen,
// the suit's oxygen, hydrogen and energy, and mining with the hand drill and ship drills.
import * as THREE from 'three'
import { ITEMS, REFINE, BASIC_REFINE, GAS, PART_LIST } from './items.js'
import { works } from '../grid/grid.js'

// ---- a grid's linked inventories ----
export function netCount(g, id) { let n = 0; for (const b of g.parts?.invs || []) if (b.inv && b.build >= 1) n += b.inv.count(id); return n }
export function netTake(g, id, n) {
  let left = n
  for (const b of g.parts?.invs || []) { if (left <= 1e-9) break; if (b.inv && b.build >= 1) left -= b.inv.take(id, left) }
  return n - left
}
// into cargo first, then any other inventory
export function netPut(g, id, n) {
  let left = n
  const order = [...(g.parts?.cargo || []), ...(g.parts?.invs || [])]
  for (const b of order) { if (left <= 1e-9) break; if (b.inv && b.build >= 1) left -= b.inv.add(id, left) }
  return n - left
}
export function netItems(g) {
  const m = new Map()
  for (const b of g.parts?.invs || []) if (b.inv && b.build >= 1) for (const [k, n] of b.inv.items) m.set(k, (m.get(k) || 0) + n)
  return m
}
export function netVolume(g) { let v = 0, max = 0; for (const b of g.parts?.invs || []) if (b.inv && b.build >= 1) { v += b.inv.volume; max += b.inv.max } return { v, max } }
export function gasTotal(g, gas) { let n = 0; for (const b of g.parts?.tanks || []) if (b.def.func.tank.gas === gas && b.build >= 1) n += b.gas; return n }
export function gasMax(g, gas) { let n = 0; for (const b of g.parts?.tanks || []) if (b.def.func.tank.gas === gas && b.build >= 1) n += b.gasMax; return n }
export function gasTake(g, gas, n) { let left = n; for (const b of g.parts?.tanks || []) { if (b.def.func.tank.gas !== gas || b.build < 1 || !b.on) continue; const t = Math.min(b.gas, left); b.gas -= t; left -= t; if (left <= 0) break } return n - left }
export function gasPut(g, gas, n) { let left = n; for (const b of g.parts?.tanks || []) { if (b.def.func.tank.gas !== gas || b.build < 1) continue; const t = Math.min(b.gasMax - b.gas, left); b.gas += t; left -= t; if (left <= 0) break } return n - left }

export class Survival {
  constructor(world) { this.world = world; this.acc = 0 }
  // production on every grid, twice a second
  update(dt) {
    this.acc += dt
    if (this.acc < 0.5) return
    const t = this.acc; this.acc = 0
    for (const g of this.world.grids) {
      if (!g.parts || !g.blocks.size) continue
      let use = 0
      const ok = !g.power || g.power.ratio > 0.5 || this.world.creative
      for (const b of g.parts.refineries) if (works(b) && ok) use += this.refine(g, b, t) ? (b.def.func.power?.use?.[g.size] || 0) : 0
      for (const b of g.parts.assemblers) if (works(b) && ok) use += this.assemble(g, b, t) ? (b.def.func.power?.use?.[g.size] || 0) : 0
      for (const b of g.parts.gasgens) if (works(b) && ok) use += this.split(g, b, t) ? (b.def.func.power?.use?.[g.size] || 0) : 0
      g.extraPower = use
      // what the grid carries weighs something
      let m = 0
      for (const b of g.parts.invs) if (b.inv) m += b.inv.mass
      if (Math.abs(m - (g.cargoMass || 0)) > Math.max(5, g.blockMass * 0.01)) { g.cargoMass = m; g.dirtyMass = true }
    }
  }
  refine(g, b, t) {
    const f = b.def.func.refine
    // the ore there is most of, that this block can melt
    let best = null, bn = 0
    for (const [k, n] of netItems(g)) { if (!REFINE[k] || (f.basic && !BASIC_REFINE.has(k))) continue; if (n > bn) { bn = n; best = k } }
    if (!best) { b.status = 'No ore'; return false }
    const kg = netTake(g, best, Math.min(bn, f.rate * t * (best === 'ore_stone' ? 3 : 1) * (g.size === 'large' ? 1 : 0.5)))
    for (const [ing, r] of Object.entries(REFINE[best])) { const put = netPut(g, ing, kg * r); if (put < kg * r * 0.99) { b.status = 'Cargo full'; } }
    b.status = `Refining ${ITEMS[best].name}`
    return true
  }
  assemble(g, b, t) {
    const f = b.def.func.assemble
    const q = g.queue || (g.queue = [])
    if (!b.job) {
      const next = q.find(j => j.n > 0 && (!f.basic || ITEMS[j.id].basic))
      if (!next) { b.status = q.length ? 'Queue needs an assembler' : 'Idle'; return false }
      const rec = ITEMS[next.id].recipe
      for (const [k, n] of Object.entries(rec)) if (netCount(g, k) < n - 1e-6) { b.status = `Needs ${ITEMS[k].name}`; return false }
      for (const [k, n] of Object.entries(rec)) netTake(g, k, n)
      next.n--
      b.job = { id: next.id, left: ITEMS[next.id].t }
      if (next.n <= 0) q.splice(q.indexOf(next), 1)
    }
    b.job.left -= t * f.rate * (this.world.creative ? 4 : 1)
    b.status = `Making ${ITEMS[b.job.id].name}`
    if (b.job.left <= 0) { if (netPut(g, b.job.id, 1) < 1) { b.status = 'Cargo full'; b.job.left = 0.01; return false } b.job = null }
    return true
  }
  split(g, b, t) {
    const room = Math.min((gasMax(g, 'h2') - gasTotal(g, 'h2')) / GAS.ice_h2, (gasMax(g, 'o2') - gasTotal(g, 'o2')) / GAS.ice_o2)
    const kg = Math.min(b.def.func.gasgen[g.size] * t, netCount(g, 'ore_ice'), Math.max(room, 0) + 0.01)
    if (kg <= 0.001) { b.status = netCount(g, 'ore_ice') > 0 ? 'Tanks full' : 'No ice'; return false }
    netTake(g, 'ore_ice', kg)
    gasPut(g, 'h2', kg * GAS.ice_h2); gasPut(g, 'o2', kg * GAS.ice_o2)
    b.status = 'Splitting ice'
    return true
  }
  // ---- the suit ----
  // P: the engineer; returns a warning, if any
  suit(P, dt) {
    const W = this.world
    if (W.creative) { P.oxygen = 100; P.fuel = Math.max(P.fuel, 100); P.energy = 100; return null }
    // breathable air (Halvor's), a grid's oxygen when seated or by a kit or med bay, or the suit's own
    const pl = W.universe.nearestPlanet(P.pos), air = W.airAt(P.pos)
    const breath = pl?.def.breathable && air > 0.45
    const station = this.stationNear(P)
    if (breath) P.oxygen = Math.min(100, P.oxygen + dt * 20)
    else if (station) { const want = Math.min(100 - P.oxygen, dt * 25); if (want > 0) P.oxygen += station.free ? want : gasTake(station.g, 'o2', want) }
    else P.oxygen = Math.max(0, P.oxygen - dt * (100 / 600) * (P.thrusting > 0.5 ? 1.3 : 1))
    if (station) {
      const wantH = Math.min(100 - P.fuel, dt * 25); if (wantH > 0) P.fuel += station.free ? wantH : gasTake(station.g, 'h2', wantH * 5) / 5
      if (station.power) P.energy = Math.min(100, P.energy + dt * 10)
    }
    if (P.light) P.energy = Math.max(0, P.energy - dt * 0.02)
    if (P.oxygen <= 0) P.hurt(dt * 4, 'oxygen')
    if (P.energy <= 0 && P.jetpack) P.jetpack = false
    return P.oxygen < 20 ? 'OXYGEN LOW' : P.energy < 10 ? 'ENERGY LOW' : P.fuel < 10 && P.jetpack ? 'HYDROGEN LOW' : null
  }
  // a seat on a grid, or a survival kit / med bay within reach: where the suit refills
  stationNear(P) {
    if (P.seat) { const g = P.seat.grid; return { g, power: (g.power?.ratio || 0) > 0.1, free: false } }
    for (const g of this.world.grids) {
      for (const b of g.parts?.medbays || []) {
        if (!works(b)) continue
        if (g.toWorld(g.blockCenter(b)).distanceTo(P.pos) < g.cs * 1.6 + 1.5) return { g, power: (g.power?.ratio ?? 1) > 0.1, free: true }
      }
    }
    return null
  }
  // ---- mining ----
  // digs a ball of radius r at a system point in whatever rock is there; returns { ore, kg } or null
  dig(p, r, yieldKg) {
    const U = this.world.universe
    for (const s of U.solidsNear(p, r + 2, [])) {
      if (s.sdf(p) > r * 0.6) continue
      const ore = s.oreAtWorld ? s.oreAtWorld(p) : 'stone'
      s.dig(p, r)
      return { ore: 'ore_' + ore, kg: yieldKg }
    }
    return null
  }
  // ship drills: while the pilot holds the button, each drill bites the rock in front of it
  shipDrill(g, dt, on) {
    const D = g.parts?.drills || []
    if (!on || !D.length) { for (const b of D) b.spin = false; return 0 }
    g.drillT = (g.drillT || 0) + dt
    const bite = g.drillT > 0.3
    if (bite) g.drillT = 0
    let n = 0
    for (const b of D) {
      if (!works(b)) { b.spin = false; continue }
      b.spin = true
      if (!bite) continue
      const S = b.def.sizes[g.size], f = b.def.func, crush = !!f.crusher, r = (f.drill || f.crusher)[g.size]
      const tip = g.toWorld(g.blockPoint(b, (S[0] - 1) / 2, (S[1] - 1) / 2, -0.5))
      const fwd = g.dirToWorld(g.blockDir(b, 0, 0, -1))
      const p = tip.clone().addScaledVector(fwd, r * (crush ? 0.35 : 0.5))
      const res = this.dig(p, r, g.size === 'large' ? 220 : 45)
      if (res) {
        // a drill keeps everything; a crusher throws the stone away (a little gravel aside) and keeps the ore
        let put = 1, want = 1
        if (crush && res.ore === 'ore_stone') netPut(g, 'ing_gravel', res.kg * 0.05)
        else { want = res.kg * (crush ? 1.5 : 1); put = netPut(g, res.ore, want) }
        this.world.sparks.burst(p, crush ? 12 : 6, crush ? 5 : 3)
        g.cargoFull = put < want * 0.5
        n++
      }
    }
    return n
  }
}
export { PART_LIST }
