// Pirates. Now and then, away from home, a pirate ship comes out of the dark. It closes on you, circles and
// shoots; if your ship slows down near it, it latches on and siphons ore and ingots out of your hold, then
// runs. Break its cockpit or most of its thrust and it is disabled: a wreck you can loot, grind or weld up
// and keep. The pilot is a simple autopilot flying the same thrusters and gyros you do.
import * as THREE from 'three'
import { works } from '../grid/grid.js'
import { QUATS } from '../grid/rot.js'
import { ITEMS } from './items.js'

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion()
const RATES = { off: 0, rare: 1 / 540, often: 1 / 220 }      // chance per second once the grace time is over

export class Pirates {
  constructor(game) { this.g = game; this.t = 0; this.grace = 150; this.list = []; this.warnT = -99 }
  get W() { return this.g.world }
  reset() { this.list = []; this.t = 0; this.grace = 150 }
  // the player's ship (or the player)
  targetNow() {
    const P = this.g.player
    if (!P || P.dead) return null
    if (P.seat && !P.seat.grid.static) return P.seat.grid
    return 'player'
  }
  update(dt) {
    const g = this.g, P = g.player, W = this.W
    if (!P || g.state !== 'play') return
    this.t += dt
    this.list = this.list.filter(x => W.grids.includes(x.grid))
    // a new one?
    const rate = RATES[g.settings.pirates || 'rare'] || 0
    const home = P.pos.distanceTo(new THREE.Vector3(0, 0, 0)) < 40000 && g.scenario === 'planet'
    const alive = this.list.filter(x => !x.grid.ai.disabled).length
    if (rate && this.t > this.grace && !alive && !home && Math.random() < rate * dt) this.spawn()
    for (const x of this.list) this.think(x, dt)
  }
  // a pirate a couple of kilometres off, out of sight behind you if it can be
  spawn(kind) {
    const g = this.g, P = g.player, W = this.W
    const at = (P.seat?.grid ? P.seat.grid.comWorld() : P.pos).clone()
    const far = at.length() > 1.5e6
    const id = kind || (far && Math.random() < 0.45 ? 'reaver' : 'marauder')
    const dir = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.3) * 0.6, Math.random() - 0.5).normalize()
    const pl = W.universe.nearestPlanet(at)
    let p = at.clone().addScaledVector(dir, 1800 + Math.random() * 600)
    // never inside a world: lift it above the ground
    if (pl) { const up = p.clone().sub(pl.center), h = up.length() - pl.R - pl.height(up.x, up.y, up.z); if (h < 400) p.addScaledVector(up.normalize(), 400 - h) }
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), at.clone().sub(p), new THREE.Vector3(0, 1, 0))).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI))
    const gr = g.spawnGrid(id, p, q, { static: false })
    gr.faction = 'pirate'
    gr.name = id === 'reaver' ? 'Pirate Reaver' : 'Pirate Marauder'
    gr.ai = { state: 'approach', target: this.targetNow(), t: 0, orbit: Math.random() * 6.28, cockpit: gr.parts.cockpits[0], fwd0: 0, robT: 0 }
    // something worth taking back from them
    const cargo = gr.parts.invs.find(b => b.inv && b.def.func.cargo)
    if (cargo) { cargo.inv.add('ammo', 6); cargo.inv.add('ing_gold', 20 + Math.random() * 60); cargo.inv.add('ing_platinum', 5 + Math.random() * 15); cargo.inv.add('construct', 40) }
    for (const b of gr.parts.guns) b.ammoLeft = 9999
    for (const b of gr.parts.turrets) b.ammoLeft = 9999
    const x = { grid: gr }
    this.list.push(x)
    g.hud.toast(`Pirates! A ${id === 'reaver' ? 'Reaver gunship' : 'Marauder'} is closing in`, '#ff5a45')
    g.sfx.play('alarm', 0.6)
    return gr
  }
  // the autopilot: the cockpit's frame, a wanted velocity, a wanted aim
  think(x, dt) {
    const gr = x.grid, ai = gr.ai, W = this.W, P = this.g.player
    if (ai.disabled) { ai.ctl = null; return }
    ai.t += dt
    // broken? (no working cockpit, or most of the forward thrust gone)
    const cp = gr.parts.cockpits.find(b => works(b))
    const fwd = this.forwardThrust(gr, cp)
    if (!ai.fwd0 && fwd) ai.fwd0 = fwd
    if (!cp || fwd < ai.fwd0 * 0.3 || gr.blocks.size < (ai.blocks0 || (ai.blocks0 = gr.blocks.size)) * 0.45) {
      ai.disabled = true; ai.ctl = null; gr.name = 'Disabled ' + gr.name; gr.faction = 'derelict'; gr.dampeners = true   // what thrust is left brings it to a stop
      this.g.hud.toast(`${gr.name.replace('Disabled ', '')} disabled: grind it, loot it, or weld it up and keep it`, '#3fe0d0')
      return
    }
    ai.cockpit = cp
    ai.target = this.targetNow()
    if (!ai.target) { ai.ctl = null; return }
    const tp = ai.target === 'player' ? v1.copy(P.pos).addScaledVector(P.up, 1) : ai.target.comWorld(v1)
    const tv = ai.target === 'player' ? P.vel : ai.target.vel
    const me = gr.comWorld(v2).clone()
    const toT = tp.clone().sub(me), dist = toT.length()
    if (dist > 9000) { this.W.removeGrid(gr); return }
    // what to do
    if (ai.state === 'approach' && dist < 650) { ai.state = 'attack'; ai.atk = 0 }
    if (ai.state === 'attack') ai.atk = (ai.atk || 0) + dt
    if (ai.state === 'attack' && ai.target !== 'player') {
      // it fights a while first, then comes alongside if the target stays slow
      const slow = ai.atk > 16 && ai.target.vel.length() < 14 && dist < 260
      ai.robT = slow ? ai.robT + dt : Math.max(0, ai.robT - dt)
      if (ai.robT > 5) { this.rob(gr, ai.target); ai.state = 'flee'; ai.t = 0 }
    }
    if (ai.state === 'flee' && dist > 4500) { this.g.hud.toast(`${gr.name} got away`, '#ff5a45'); this.W.removeGrid(gr); return }
    // where it wants to be: closing in, a circle round the target, or away
    let want
    const up = W.gravityAt(me, new THREE.Vector3()).negate()
    if (up.lengthSq() < 0.01) up.set(0, 1, 0); else up.normalize()
    if (ai.state === 'approach') want = toT.clone().normalize().multiplyScalar(Math.min(130, Math.max(0, dist - 300) * 0.16)).add(tv)
    else if (ai.state === 'attack') {
      ai.orbit += dt * 0.25
      const side = new THREE.Vector3().crossVectors(up, toT).normalize(); if (side.lengthSq() < 0.01) side.set(1, 0, 0)
      const ring = tp.clone().addScaledVector(side, Math.cos(ai.orbit) * 210).addScaledVector(toT.clone().normalize(), -Math.sin(ai.orbit) * 210).addScaledVector(up, 45)
      // when robbing it comes right alongside
      if (ai.robT > 0.5) ring.copy(tp).addScaledVector(side, 40).addScaledVector(up, 12)
      want = ring.sub(me).multiplyScalar(0.35).add(tv)
      const L = want.length(); if (L > 95) want.multiplyScalar(95 / L)
      // never ram it: back off when too close (closer when robbing)
      const close = ai.robT > 0.5 ? 25 : 90
      if (dist < close) want.addScaledVector(toT, -(close - dist) * 0.8 / Math.max(1, dist))
    } else want = toT.clone().normalize().multiplyScalar(-160).addScaledVector(up, 25)
    // into the cockpit's frame (x right, y up, z back)
    const cq = q1.copy(gr.quat).multiply(QUATS[cp.rot]).invert()
    const e = want.sub(gr.vel).applyQuaternion(cq)
    const k = 1 / 7
    const move = [Math.max(-1, Math.min(1, e.x * k)), Math.max(-1, Math.min(1, e.y * k)), Math.max(-1, Math.min(1, e.z * k))]
    // aim: lead the target with the first gun's shot speed (away when fleeing)
    const gun = gr.parts.guns.find(b => works(b))
    const sp = gun ? gun.def.func.gun.speed : 600
    const lead = tp.clone().addScaledVector(v1.copy(tv).sub(gr.vel), dist / sp)
    const aimW = ai.state === 'flee' ? toT.clone().negate() : lead.sub(me)
    const d = aimW.applyQuaternion(cq).normalize()
    const yawE = Math.atan2(-d.x, -d.z), pitchE = Math.atan2(d.y, Math.hypot(d.x, d.z))
    // keep its top toward the sky in gravity
    const upL = up.clone().applyQuaternion(cq), rollE = Math.atan2(-upL.x, upL.y)
    const kt = 1.6, lim = gr.size === 'large' ? 0.7 : 1.3
    // plus the turn rate of the line to the target, so the nose keeps up as they circle each other
    const los = new THREE.Vector3().crossVectors(toT, v1.copy(tv).sub(gr.vel)).divideScalar(Math.max(1, dist * dist)).applyQuaternion(cq)
    if (ai.state === 'flee') los.set(0, 0, 0)
    const turn = [Math.max(-lim, Math.min(lim, pitchE * kt + los.x)), Math.max(-lim, Math.min(lim, yawE * kt + los.y)), Math.max(-lim, Math.min(lim, rollE * 1.2 + los.z * 0))]
    ai.ctl = { move, turn }
    ai.err = [yawE, pitchE, rollE]
    // shoot when lined up and in reach
    const aligned = Math.abs(yawE) < 0.09 && Math.abs(pitchE) < 0.09
    ai.fire = ai.state === 'attack' && aligned && dist < 900
  }
  forwardThrust(gr, cp) {
    if (!cp) return 0
    let f = 0
    const fw = gr.blockDir(cp, 0, 0, -1, new THREE.Vector3())
    for (const b of gr.parts.thrusters) {
      if (!works(b)) continue
      const push = gr.blockDir(b, 0, 0, -1, new THREE.Vector3())
      if (push.dot(fw) > 0.7) f += b.def.func.thruster.force[gr.size]
    }
    return f
  }
  // ore and ingots out of the target's hold into the pirate's
  rob(gr, target) {
    let took = 0, cap = gr.size === 'large' ? 4000 : 1200
    const dest = gr.parts.invs.filter(b => b.inv)
    for (const b of target.parts.invs) {
      if (!b.inv) continue
      for (const [id, n] of [...b.inv.items]) {
        const it = ITEMS[id]
        if (!it || (it.kind !== 'ore' && it.kind !== 'ingot')) continue
        const want = Math.min(n * 0.5, (cap - took) / it.kg)
        if (want <= 0) continue
        const got = b.inv.take(id, want)
        for (const d of dest) { const put = d.inv.add(id, got); if (put >= got) break }
        took += got * it.kg
      }
    }
    target.cargoDirty = true; target.dirtyMass = true
    this.g.hud.toast(took > 1 ? `${gr.name} siphoned ${Math.round(took)} kg out of your hold and is running` : `${gr.name} found nothing worth taking and is running`, '#ff5a45')
    this.g.sfx.play('alarm', 0.4)
  }
}
