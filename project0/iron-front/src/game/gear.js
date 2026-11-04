// Field gear you place or use: AT mines (go off under a ground vehicle), demolition charges (a timed
// blast that breaks walls and armour), sandbag walls (cover the AI uses too), the field radio (a mortar
// strike on where you are looking, once every two and a half minutes) and rations (stamina).
// The key for gear uses the selected item; the next-gear key (or the inventory) chooses it.
import * as THREE from 'three'
import { heightAt, waterLevel } from '../world/heightfield.js'
import { makeBox, raycastTerrain } from '../world/collision.js'
import { ITEMS } from './inventory.js'
import { C } from '../ui/ui.js'

export const GEAR = ['radio', 'c4', 'mine', 'sandbags', 'ration']
const MORTAR = { radius: 7, dmg: 170, heat: 160 }
const MINE = { radius: 5, dmg: 220, heat: 700 }
const CHARGE = { radius: 8, dmg: 260, heat: 1100 }

export class Gear {
  constructor(game) {
    this.g = game
    this.mines = []; this.charges = []; this.walls = []; this.strikes = []
    this.radioT = -999
    const mat = c => new THREE.MeshLambertMaterial({ color: c })
    this.geo = {
      mine: new THREE.CylinderGeometry(0.16, 0.18, 0.08, 12), charge: new THREE.BoxGeometry(0.3, 0.12, 0.2),
      bags: new THREE.BoxGeometry(2.4, 1.0, 0.6),
    }
    this.mat = { mine: mat(0x3d4a2c), charge: mat(0x6b6450), bags: mat(0xa68f5f) }
  }
  // the gear this soldier carries, in order, and the selected one
  owned(s) { return GEAR.filter(id => s.inv.count(id) > 0) }
  selected(s) { const own = this.owned(s); return own.includes(s.gearSel) ? s.gearSel : own[0] || null }
  next(s) {
    const own = this.owned(s); if (!own.length) { this.g.hud.note('No gear: mines, charges, sandbags, a radio or rations'); return }
    const i = own.indexOf(this.selected(s)); s.gearSel = own[(i + 1) % own.length]
    this.g.hud.note(`Gear: ${ITEMS[s.gearSel].name}`)
  }
  use(s, id = this.selected(s)) {
    const g = this.g
    if (!id || !s.inv.count(id) || s.vehicle || !s.canAct) return false
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw)
    if (id === 'ration') { s.inv.use(id); s.stamina = 1; s.fedT = 180; g.hud.note('You eat: stamina restored, and it comes back faster for three minutes'); return true }
    if (id === 'radio') return this.callMortar(s)
    if (s.swimming || s.ladder) return false
    if (id === 'mine') {
      const x = s.pos.x + fx * 1.2, z = s.pos.z + fz * 1.2, y = heightAt(x, z)
      if (waterLevel(x, z) > y) return false
      s.inv.use(id)
      const m = new THREE.Mesh(this.geo.mine, this.mat.mine); m.position.set(x, y + 0.03, z); g.engine.world.add(m)
      this.mines.push({ x, y, z, mesh: m, armT: g.time + 4, owner: s })
      g.hud.note('AT mine laid: it arms in 4 s and goes off under any ground vehicle'); g.sfx.ui('pickup')
      return true
    }
    if (id === 'c4') {
      // on a vehicle within reach, or on the ground (or a wall) in front of you
      const v = g.vehicles.list.find(v => v.alive && v.pos.distanceTo(s.pos) < Math.max(v.def.size[0], v.def.size[2]) / 2 + 1.5)
      const x = v ? v.pos.x : s.pos.x + fx * 0.8, z = v ? v.pos.z : s.pos.z + fz * 0.8, y = v ? v.pos.y + v.def.size[1] * 0.5 : s.pos.y + 0.1
      s.inv.use(id)
      const m = new THREE.Mesh(this.geo.charge, this.mat.charge); m.position.set(x, y, z); m.rotation.y = s.yaw; g.engine.world.add(m)
      this.charges.push({ x, y, z, mesh: m, t: 10, owner: s, vehicle: v || null, beep: 0 })
      g.hud.note(v ? `Charge on the ${v.def.name}: 10 seconds, get clear!` : 'Charge set: 10 seconds, get clear!', C.red); g.sfx.ui('click')
      return true
    }
    if (id === 'sandbags') {
      const x = s.pos.x + fx * 1.5, z = s.pos.z + fz * 1.5, y = Math.max(heightAt(x, z), g.collision.floorAt(x, s.pos.y + 0.5, z, 0.5, 2))
      if (waterLevel(x, z) > y || Math.abs(y - s.pos.y) > 1.2) { g.hud.note('No room for sandbags here'); return false }
      s.inv.use(id)
      const c = makeBox(x, y + 0.5, z, 1.2, 0.5, 0.3, s.yaw, 'sandbag', 'wall')
      g.collision.add(c)
      const m = new THREE.Mesh(this.geo.bags, this.mat.bags); m.position.set(x, y + 0.5, z); m.rotation.y = s.yaw; g.engine.world.add(m)
      this.walls.push({ c, mesh: m })
      g.hud.note('Sandbag wall built: cover that stops rifle fire'); g.sfx.impact?.('soil', x, y, z)
      return true
    }
    return false
  }
  // The mortar section answers: rounds land round the point you are looking at (up to 900 m), a few
  // seconds after the call. Close to your own position is refused.
  callMortar(s) {
    const g = this.g, wait = 150 - (g.time - this.radioT)
    if (wait > 0) { g.hud.radio('Mortars', `Still re-laying, ${Math.ceil(wait)} s.`); return false }
    const p = g.player?.s === s ? g.player.camPos : s.eye(new THREE.Vector3())
    const d = g.player?.s === s ? g.player.aimDirection() : s.forward(new THREE.Vector3())
    let t = 900
    const tt = raycastTerrain(p.x, p.y, p.z, d.x, d.y, d.z, t, 2); if (tt >= 0) t = tt
    const h = { t: 0 }; if (g.collision.raycast(p.x, p.y, p.z, d.x, d.y, d.z, t, h)) t = h.t
    if (g.debug) g.p0.log('dbg radio aim', t.toFixed(0), 'pitch', d.y.toFixed(3))
    if (t >= 900) { g.hud.radio('Mortars', 'No target, look at the ground where you want it.'); return false }
    const x = p.x + d.x * t, z = p.z + d.z * t
    const dist = Math.hypot(x - s.pos.x, z - s.pos.z)
    if (dist < 60) { g.hud.radio('Mortars', 'Danger close, refused. Over 60 m.'); return false }
    this.radioT = g.time
    g.hud.radio('Mortars', `Fire mission at ${Math.round(dist)} m, five rounds. Shot, over.`)
    if (g.debug) g.p0.log('dbg mortar', Math.round(dist), 'm')
    for (let i = 0; i < 5; i++) this.strikes.push({ x: x + (Math.random() - 0.5) * 30, z: z + (Math.random() - 0.5) * 30, t: g.time + 7 + i * 1.3, owner: s })
    return true
  }
  update(dt) {
    const g = this.g
    for (const st of this.strikes) if (!st.done && g.time >= st.t) { st.done = true; const y = Math.max(heightAt(st.x, st.z), waterLevel(st.x, st.z)); g.explode(st.x, y + 0.3, st.z, MORTAR, st.owner) }
    this.strikes = this.strikes.filter(st => !st.done)
    for (const m of this.mines) {
      if (m.done || g.time < m.armT) continue
      const v = g.vehicles.list.find(v => v.alive && v.kind !== 'heli' && v.kind !== 'plane' && v.kind !== 'boat' && Math.hypot(v.pos.x - m.x, v.pos.z - m.z) < Math.max(1.6, v.def.size[0] / 2 + 0.4) && Math.abs(v.pos.y - m.y) < 2.5)
      if (v) { m.done = true; g.engine.world.remove(m.mesh); g.explode(m.x, m.y + 0.3, m.z, MINE, m.owner, v, true); if (g.debug) g.p0.log('dbg mine under', v.def.name, Math.round(v.hp)) }
    }
    this.mines = this.mines.filter(m => !m.done)
    for (const c of this.charges) {
      c.t -= dt
      if (c.vehicle) { c.x = c.vehicle.pos.x; c.z = c.vehicle.pos.z; c.y = c.vehicle.pos.y + c.vehicle.def.size[1] * 0.5; c.mesh.position.set(c.x, c.y, c.z) }
      c.beep -= dt
      if (c.beep <= 0 && c.t > 0) { c.beep = c.t < 3 ? 0.25 : 1; g.fx.flash(c.x, c.y + 0.15, c.z, { size: 0.15, life: 0.1, r: 1, g: 0.1, b: 0.05 }) }
      if (c.t <= 0) { c.done = true; g.engine.world.remove(c.mesh); g.explode(c.x, c.y, c.z, CHARGE, c.owner, c.vehicle?.alive ? c.vehicle : null, true); if (g.debug) g.p0.log('dbg charge', c.vehicle?.def.name || 'ground', c.vehicle ? Math.round(c.vehicle.hp) : '') }
    }
    this.charges = this.charges.filter(c => !c.done)
  }
  clear() {
    const g = this.g
    for (const o of [...this.mines, ...this.charges]) g.engine.world.remove(o.mesh)
    for (const w of this.walls) { g.engine.world.remove(w.mesh); g.collision.remove(w.c) }
    this.mines = []; this.charges = []; this.walls = []; this.strikes = []; this.radioT = -999
  }
  // for the HUD: what the gear key does now
  label(s) { const id = this.selected(s); return id ? `${ITEMS[id].name}${s.inv.count(id) > 1 ? ' x' + s.inv.count(id) : ''}${id === 'radio' && this.g.time - this.radioT < 150 ? ' (' + Math.ceil(150 - (this.g.time - this.radioT)) + ' s)' : ''}` : '' }
}
