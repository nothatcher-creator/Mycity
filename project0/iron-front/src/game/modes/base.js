// What every mode shares: finding clear ground to put soldiers on, spawning squads with orders, parking
// vehicles, the player's squad, respawning, and the mode panel on the HUD.
import * as THREE from 'three'
import { heightAt, waterLevel, roadAt } from '../../world/heightfield.js'
import { isBuilt, POINTS } from '../../world/places.js'
import { PLACES } from '../../world/blueprint.js'
import { FACTIONS, ROLES } from '../../actors/factions.js'
import { C, text } from '../../ui/ui.js'

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
  findGround(x, z, r, tries = 24, rand = Math.random) {
    for (let i = 0; i < tries; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d
      const h = heightAt(px, pz)
      if (h < waterLevel(px, pz) + 0.3 || isBuilt(px, pz, 1.5)) continue
      const s = Math.abs(heightAt(px + 2, pz) - h) + Math.abs(heightAt(px, pz + 2) - h)
      if (s > 1.6) continue
      return [px, pz]
    }
    return null
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
  park(type, x, z, yaw, o = {}) {
    const v = this.g.vehicles.spawn(type, x, z, yaw, o)
    return v
  }
  // ---- the player ----
  spawnPoints(place) { return POINTS.filter(p => p.kind === 'spawn' && (!place || p.place === place)) }
  onKill(sol, killer) { if (killer?.isPlayer && sol !== killer) this.kills++; if (sol.isPlayer) this.deaths++ }
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
