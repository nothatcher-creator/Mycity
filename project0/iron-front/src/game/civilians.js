// Townspeople in the war modes: a few people on the pavements of a town your side holds. They stroll about,
// and when shooting or explosions start near them they run from it and crouch in cover until it has been
// quiet for a while. They are nobody's enemy (side 'civ'); killing one is noted against you.
import { Inventory } from './inventory.js'
import { roadAt } from '../world/heightfield.js'
import { isBuilt } from '../world/places.js'
import { CROUCH, STAND } from '../actors/soldier.js'

const FIRST = ['Anna', 'Boris', 'Clara', 'Dmitri', 'Elena', 'Filip', 'Greta', 'Hugo', 'Ines', 'Jakob', 'Katja', 'Lev', 'Mila', 'Olga', 'Pavel', 'Rosa', 'Stefan', 'Vera']
const LAST = ['Adler', 'Berg', 'Dorn', 'Falk', 'Halden', 'Kessler', 'Lind', 'Morava', 'Novak', 'Orlov', 'Rask', 'Sorel', 'Weller']
const SHIRTS = [[0.85, 0.85, 0.82], [0.25, 0.35, 0.6], [0.6, 0.18, 0.15], [0.3, 0.5, 0.35], [0.82, 0.68, 0.3], [0.35, 0.35, 0.38], [0.55, 0.4, 0.6], [0.9, 0.55, 0.3]]
const PANTS = [[0.2, 0.25, 0.4], [0.25, 0.25, 0.27], [0.45, 0.38, 0.28], [0.15, 0.15, 0.16], [0.55, 0.5, 0.42]]
const pick = a => a[Math.floor(Math.random() * a.length)]
const angle = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d }

export class Civilians {
  constructor(game) { this.g = game; this.list = []; this.tick = 0 }
  // on a pavement: beside a road, not in a building
  pavement(x, z) { const r = roadAt(x, z); return !!r && r.d > r.w / 2 + 0.4 && r.d < r.w / 2 + 3.2 && !isBuilt(x, z, 0.5) }
  spawn(x, z, town) {
    const g = this.g, inv = new Inventory(); inv.wear('tshirt'); inv.wear('jeans')
    const s = g.addSoldier({ faction: 'civ', role: 'rifleman', x, z, yaw: Math.random() * 6.28, inv, team: 'civ', name: `${pick(FIRST)} ${pick(LAST)}` })
    s.plain = true; s.noVest = true; s.unarmed = true; s.pack = false
    s.uniform = pick(SHIRTS); s.pants = pick(PANTS); s.headgear = Math.random() < 0.25 ? 'cap' : 'none'; s.helmetColor = pick(SHIRTS)
    s.civilian = true
    this.list.push({ s, home: { x, z }, target: null, wait: Math.random() * 4, town, calmT: 0 })
  }
  remove(n) {
    const g = this.g, i = g.soldiers.indexOf(n.s); if (i >= 0 && !n.s.dead) g.soldiers.splice(i, 1)
    this.list.splice(this.list.indexOf(n), 1)
  }
  // Once a second: people in the town round (px, pz) when `place` is held by your side and quiet enough
  populate(px, pz, place, want) {
    // the ones far behind you go (the fallen stay where they lie until you are well away)
    for (const n of [...this.list]) { const d = Math.hypot(n.s.pos.x - px, n.s.pos.z - pz); if (d > 280 || (!n.s.dead && n.town !== place?.id && d > 150)) this.remove(n) }
    if (!place || !want) return
    const alive = this.list.filter(n => !n.s.dead && n.town === place.id).length
    for (let i = alive, tries = 0; i < want && tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 90
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r
      if (!this.pavement(x, z)) continue
      this.spawn(x, z, place.id); i++
    }
  }
  // the nearest recent shot or blast within 140 m, if any
  danger(x, z) {
    let best = null, bd = 140
    for (const d of this.g.dangers || []) { if (this.g.time - d.t > 25) continue; const k = Math.hypot(d.x - x, d.z - z); if (k < bd) { bd = k; best = d } }
    return best
  }
  update(dt) {
    const g = this.g, P = g.player?.s
    for (const n of this.list) {
      const s = n.s
      if (s.dead || s.vehicle) continue
      const d = this.danger(s.pos.x, s.pos.z)
      if (d) {
        // run: thirty metres straight away from it, then down in a crouch
        if (!n.scared) { n.scared = true; const a = Math.atan2(s.pos.x - d.x, s.pos.z - d.z) + (Math.random() - 0.5) * 0.8; n.target = { x: s.pos.x + Math.sin(a) * 30, z: s.pos.z + Math.cos(a) * 30 }; n.wait = 0; s.setStance(STAND) }
        n.calmT = 0
      } else if (n.scared) { n.calmT += dt; if (n.calmT > 15) { n.scared = false; n.target = null; s.setStance(STAND) } }
      const t = n.target
      if (n.scared && (!t || Math.hypot(t.x - s.pos.x, t.z - s.pos.z) < 1.5 || (n.stuck || 0) > 2)) {
        n.target = null; n.stuck = 0; s.input.fwd = 0
        if (s.stance !== CROUCH) s.setStance(CROUCH)
      } else if (!n.scared && n.wait > 0) { n.wait -= dt; s.input.fwd = 0 }
      else {
        if (!n.target) {
          for (let k = 0; k < 8; k++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 35, x = n.home.x + Math.cos(a) * r, z = n.home.z + Math.sin(a) * r; if (this.pavement(x, z) || k === 7) { n.target = { x, z }; break } }
        }
        const T = n.target, dx = T.x - s.pos.x, dz = T.z - s.pos.z
        if (!n.scared && Math.hypot(dx, dz) < 0.8) { n.target = null; n.wait = 2 + Math.random() * 7; s.input.fwd = 0 }
        else {
          s.yaw += angle(Math.atan2(dx, dz), s.yaw) * Math.min(1, dt * 6)
          s.input.fwd = 1; s.input.walk = !n.scared; s.input.sprint = !!n.scared
          n.stuck = s.speed < 0.3 ? (n.stuck || 0) + dt : 0
        }
      }
      // standing about away from you: no need to simulate the body
      if (s.input.fwd === 0 && P && Math.hypot(P.pos.x - s.pos.x, P.pos.z - s.pos.z) > 25 && s.onGround && !n.scared) { s.speed = 0; s.vel.x = s.vel.z = 0; continue }
      s.step(dt, g.W)
    }
  }
}
