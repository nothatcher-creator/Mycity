// What every mode shares: finding clear ground to put soldiers on, spawning squads with orders, parking
// vehicles, the player's squad, respawning, and the mode panel on the HUD.
import * as THREE from 'three'
import { heightAt, waterLevel, roadAt } from '../../world/heightfield.js'
import { isBuilt, POINTS } from '../../world/places.js'
import { PLACES } from '../../world/blueprint.js'
import { FACTIONS, ROLES } from '../../actors/factions.js'
import { C, text } from '../../ui/ui.js'
import { VEHICLES } from '../../vehicles/vehicle-data.js'

export const NAMES = ['Adler', 'Brandt', 'Cole', 'Doran', 'Engel', 'Falk', 'Grau', 'Hale', 'Ivers', 'Jansen', 'Kade', 'Lorn', 'Marek', 'Novak', 'Orsk', 'Petrov',
  'Quist', 'Rook', 'Sten', 'Tarn', 'Ulric', 'Voss', 'Wren', 'Yuri', 'Zane', 'Baker', 'Mills', 'Hart', 'Reyes', 'Silva', 'Kovac', 'Lind', 'Moss', 'Price', 'Ross', 'Vance']
export const SQUAD_ROLES = ['officer', 'rifleman', 'autorifleman', 'rifleman', 'medic', 'at', 'marksman', 'grenadier', 'mg', 'engineer']
let nameIdx = 0
export const nextName = () => NAMES[(nameIdx++ * 7) % NAMES.length]

export class Mode {
  constructor(game, opts = {}) {
    this.g = game
    this.opts = opts
    this.t = 0
    this.kills = 0; this.deaths = 0
  }
  get name() { return 'Mode' }
  setup() {}
  update(dt) { this.t += dt }
  // ---- placing things ----
  // Clear ground near (x, z) within r: on land, not in a building, not too steep.
  // `clear` > 0: nothing solid (walls, props, trees, vehicles) within that many metres either.
  findGround(x, z, r, tries = 24, rand = Math.random, clear = 0) {
    for (let i = 0; i < tries; i++) {
      const a = rand() * Math.PI * 2, d = i === 0 && clear ? 0 : Math.sqrt(rand()) * r
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d
      const h = heightAt(px, pz)
      if (h < waterLevel(px, pz) + 0.3 || isBuilt(px, pz, 1.5 + clear)) continue
      const s = Math.abs(heightAt(px + 2, pz) - h) + Math.abs(heightAt(px, pz + 2) - h)
      if (s > 1.6) continue
      if (clear && !this.isClear(px, pz, h, clear)) continue
      return [px, pz]
    }
    return null
  }
  isClear(x, z, h, r) {
    let ok = true
    this.g.collision.query(x - r, z - r, x + r, z + r, c => { if (c.maxY > h + 0.25 && c.minY < h + 4 && c.kind !== 'floor') { ok = false; return false } })
    if (ok) for (const v of this.g.vehicles.list) if (Math.hypot(v.pos.x - x, v.pos.z - z) < r + Math.max(v.def.size[0], v.def.size[2]) / 2) return false
    return ok
  }
  // A squad of `n` soldiers of `faction` near (x, z) with an order.
  spawnSquad(faction, x, z, n, order, o = {}) {
    const g = this.g, F = FACTIONS[faction]
    const q = g.ai.squad(faction, { team: o.team ?? faction, order, formation: o.formation || 'wedge', home: new THREE.Vector3(x, heightAt(x, z), z), name: o.name })
    const roles = o.roles || SQUAD_ROLES
    for (let i = 0; i < n; i++) {
      const p = this.findGround(x, z, o.spread || 12) || [x + i * 2, z]
      const role = roles[i % roles.length]
      const s = g.addSoldier({ faction, role, x: p[0], z: p[1], yaw: Math.random() * Math.PI * 2, team: o.team ?? faction, name: `${F.ranks[role === 'officer' ? 2 : i % 2]} ${nextName()}` })
      g.ai.add(s, q, (F.skill || 0.5) * (0.75 + g.difficulty * 0.5))
    }
    return q
  }
  patrolRoute(x, z, r, n = 4) {
    const out = []
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + Math.random() * 0.5
      const p = this.findGround(x + Math.cos(a) * r, z + Math.sin(a) * r, r * 0.3) || [x + Math.cos(a) * r, z + Math.sin(a) * r]
      out.push(new THREE.Vector3(p[0], heightAt(p[0], p[1]), p[1]))
    }
    return out
  }
  // The player's own squad following him.
  playerSquadAround(s, n, roles = ['autorifleman', 'medic', 'rifleman', 'at', 'marksman']) {
    const g = this.g
    const q = g.ai.squad(s.faction, { team: s.team, player: true, order: { type: 'follow', target: s }, formation: 'wedge', name: 'Your squad' })
    q.members.push(s)
    for (let i = 0; i < n; i++) {
      const p = this.findGround(s.pos.x, s.pos.z, 8) || [s.pos.x + i * 1.5, s.pos.z - 3]
      const role = roles[i % roles.length]
      const m = g.addSoldier({ faction: s.faction, role, x: p[0], z: p[1], yaw: s.yaw, team: s.team, name: `${ROLES[role].name} ${nextName()}` })
      g.ai.add(m, q, 0.7)
      m.allowDown = true
    }
    g.playerSquad = q
    return q
  }
  // A vehicle on clear ground near (x, z) (helicopters and planes need the most room).
  park(type, x, z, yaw, o = {}) {
    const d = VEHICLES[type]
    const need = Math.max(d.size[0], d.size[2]) / 2 + (d.kind === 'heli' ? 4 : 0.8)
    const p = d.kind === 'boat' ? deepWater(x, z) : o.exact ? [x, z] : this.findGround(x, z, o.search ?? 25, 30, Math.random, need)
    if (!p) return null
    return this.g.vehicles.spawn(type, p[0], p[1], yaw, o)
  }
  // A vehicle with an AI crew (a driver and, where it has one, a gunner) as a squad of its own.
  crewed(type, faction, x, z, yaw, order, o = {}) {
    const g = this.g
    // aircraft can start in the air (o.air: metres above the ground), engine running
    const v = o.air ? g.vehicles.spawn(type, x, z, yaw, { faction, y: heightAt(x, z) + o.air }) : this.park(type, x, z, yaw, { faction, search: o.search ?? 40 })
    if (!v) return null
    if (o.air) {
      v.rpm = 1; v.engine = true; v.onGround = false; v.gearDown = false
      // a plane starts at speed
      if (v.kind === 'plane') { const sp = Math.max(v.def.minSpeed * 1.6, 60); v.speed = sp; v.throttle = 0.8; v.vel.set(Math.sin(yaw) * sp, 0, Math.cos(yaw) * sp) }
    }
    const q = g.ai.squad(faction, { order, name: v.def.name })
    for (const role of ['driver', 'pilot', 'gunner']) {
      if (!v.seats.some(st => st.role === role)) continue
      const s = g.addSoldier({ faction, role: role === 'gunner' ? 'rifleman' : 'engineer', x: v.pos.x, z: v.pos.z, name: `${FACTIONS[faction].ranks[1]} ${nextName()}` })
      g.ai.add(s, q, (FACTIONS[faction].skill || 0.5) * (0.75 + g.difficulty * 0.5))
      g.vehicles.enter(s, v, role)
    }
    q.vehicle = v
    return q
  }
  // ---- the player ----
  spawnPoints(place) { return POINTS.filter(p => p.kind === 'spawn' && (!place || p.place === place)) }
  onKill(sol, killer) { if (killer?.isPlayer && sol !== killer) this.kills++; if (sol.isPlayer) this.deaths++ }
  // What you navigate with: a map (M opens it) and a GPS (shows where you are on it, and the minimap).
  // Every mode but Survival gives both.
  navAccess(s) { return { map: true, gps: true } }
  // The dead screen's choices: [{ id, label, sub }]
  respawnOptions() { return [{ id: 'here', label: 'Respawn', sub: 'Back near where you fell' }] }
  respawn(id) {}
  // ---- HUD ----
  hudKey() { return '' }
  drawHud(c, p, s) {}
  centerText() { return '' }
  // A small titled box for the mode panel.
  panelTitle(c, s, title, sub) {
    c.fillStyle = 'rgba(14,18,12,0.7)'; c.fillRect(0, 0, 300 * s, (sub ? 46 : 28) * s)
    c.fillStyle = C.gold; c.fillRect(0, 0, 3, (sub ? 46 : 28) * s)
    text(c, title, 10 * s, 19 * s, { size: 14 * s, weight: 800, color: C.gold2 })
    if (sub) text(c, sub, 10 * s, 38 * s, { size: 12 * s, color: C.text })
  }
}
export function nearestPlace(x, z) {
  let best = null, bd = Infinity
  for (const p of PLACES) { const d = Math.hypot(p.x - x, p.z - z) - p.r; if (d < bd) { bd = d; best = p } }
  return { place: best, d: bd }
}
export function onRoad(x, z) { const r = roadAt(x, z); return r && r.d < r.w / 2 }
// The nearest water deep enough to float a boat (at least 1.5 m), searching outwards up to 120 m.
export function deepWater(x, z) {
  const deep = (px, pz) => waterLevel(px, pz) - heightAt(px, pz) > 1.5
  if (deep(x, z)) return [x, z]
  for (let r = 6; r <= 120; r += 6) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (deep(px, pz)) return [px, pz] }
  return [x, z]
}
