// Wrecks. Ships that came down hard lie on the worlds, and derelicts drift in the rock fields: the game's own
// designs with blocks torn away, others knocked back to frames, the cockpit and thrusters broken. Each sends
// a distress beacon. Weld it back (the welder repairs and finishes what is there; parts missing from the hull
// can be built again) and it flies. Sites come from the world's own numbers, so the same wreck is always in
// the same place.
import * as THREE from 'three'

function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function hash(a, b, c, d) { let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791) ^ Math.imul(d | 0, 2654435761)) | 0; h = Math.imul(h ^ (h >>> 16), 2246822507); h ^= h >>> 13; return h >>> 0 }
const KINDS = ['sparrow', 'mule', 'pick', 'lancer', 'talon', 'crossguard', 'vagrant', 'marauder', 'buggy', 'rover']
const SPACE = ['lancer', 'mule', 'vagrant', 'talon', 'reaver', 'marauder']
const CELL = 6000

export class Wrecks {
  constructor(game) { this.g = game; this.done = new Set(); this.t = 0 }
  reset() { this.done.clear() }
  // breaks a grid: some blocks torn away, many knocked back, the working parts damaged
  ruin(gr, r) {
    const W = this.g.world
    const list = [...gr.blocks]
    for (const b of list) {
      const f = b.def.func || {}
      const vital = f.cockpit || f.thruster || f.gyro || f.power
      const x = r()
      if (!vital && x < 0.14 && gr.blocks.size > 20) { gr.remove(b); continue }
      if (vital || x < 0.45) {
        // back to a frame: some parts out, health down
        const keep = vital ? 0.35 + r() * 0.4 : 0.2 + r() * 0.6
        b.build = keep; b.comps = b.comps.map((n, i) => Math.floor(n * keep)); b.hp = b.maxHp * keep * (0.4 + r() * 0.5)
        if (b.inv) b.inv.items.clear()
        gr.touch(b)
      } else if (x < 0.8) { b.hp = b.maxHp * (0.25 + r() * 0.6); gr.touch(b) }
    }
    gr.dampeners = false
    for (const b of gr.parts?.power || []) if (b.charge != null) b.charge = 0
    gr.updateMass()
    gr.splitPending = true
    W.splitGrids()
    // what is left over: salvage in whatever cargo survived
    const cargo = gr.parts.invs.find(b => b.inv && b.def.func.cargo)
    if (cargo) for (const [id, n] of [['plate', 20 + r() * 40], ['construct', 20 + r() * 30], ['motor', 4 + r() * 8], ['computer', 10 + r() * 20], ['thrust', 2 + r() * 4], ['ammo', 2 + r() * 6]]) cargo.inv.add(id, Math.floor(n))
    gr.wreck = true
    gr.name = `Wreck of the ${gr.name}`
  }
  // a distress beacon somewhere on it, so it shows on the display
  beacon(gr) {
    gr.distress = true
  }
  crash(id, pl, dir, seed) {
    const g = this.g, r = rng(seed)
    const h = pl.height(dir.x, dir.y, dir.z)
    const fr = g.frameAt(pl, dir, h, r() * 6.28)
    // nose down and rolled a little, as it hit
    const q = fr.q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12 - r() * 0.15, 0, (r() - 0.5) * 0.4)))
    const gr = g.spawnGrid(id, fr.p.clone().addScaledVector(fr.up, 6), q, { static: false })
    g.settle(gr, 0.4 + r() * 0.6, false)
    this.ruin(gr, r)
    gr.locked = { solid: true }
    gr.vel.set(0, 0, 0); gr.angVel.set(0, 0, 0)
    this.beacon(gr)
    return gr
  }
  drift(id, p, seed) {
    const g = this.g, r = rng(seed)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6))
    const gr = g.spawnGrid(id, p, q, { static: false })
    this.ruin(gr, r)
    gr.angVel.set((r() - 0.5) * 0.02, (r() - 0.5) * 0.02, (r() - 0.5) * 0.02)
    this.beacon(gr)
    return gr
  }
  // sites near the camera: on worlds, a lattice over the faces; in space, by each rock field
  update(dt) {
    this.t += dt
    if (this.t < 2) return
    this.t = 0
    const g = this.g, P = g.player, U = g.world.universe
    if (!P || g.state !== 'play') return
    const at = P.pos
    const pl = U.nearestPlanet(at)
    if (pl) {
      const lc = at.clone().sub(pl.center), alt = lc.length() - pl.R
      if (alt < 8000) {
        const u = lc.clone().normalize(), A = [Math.abs(u.x), Math.abs(u.y), Math.abs(u.z)]
        const ax = A[0] > A[1] && A[0] > A[2] ? 0 : A[1] > A[2] ? 1 : 2, uu = [u.x, u.y, u.z], sg = Math.sign(uu[ax]) || 1
        const o1 = (ax + 1) % 3, o2 = (ax + 2) % 3, cs = CELL / pl.R
        const ia0 = Math.floor(uu[o1] / Math.abs(uu[ax]) / cs), ib0 = Math.floor(uu[o2] / Math.abs(uu[ax]) / cs)
        for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
          const ia = ia0 + da, ib = ib0 + db, key = `${pl.id}:${ax}${sg}:${ia}:${ib}`
          if (this.done.has(key)) continue
          const r = rng(hash(pl.seed || 3, ax * 2 + (sg > 0 ? 1 : 0), ia, ib))
          if (r() > 0.16) { this.done.add(key); continue }
          const v = [0, 0, 0]; v[ax] = sg; v[o1] = (ia + 0.15 + r() * 0.7) * cs; v[o2] = (ib + 0.15 + r() * 0.7) * cs
          const dir = new THREE.Vector3(...v).normalize()
          const p = dir.clone().multiplyScalar(pl.R).add(pl.center)
          if (p.distanceTo(at) > 5000) continue
          this.done.add(key)
          this.crash(KINDS[Math.floor(r() * KINDS.length)], pl, dir, Math.floor(r() * 1e9))
        }
      }
    }
    for (const f of U.fields) {
      if (this.done.has(f.def.id) || f.def.comet) continue
      if (f.center.distanceTo(at) > f.radius + 6000) continue
      this.done.add(f.def.id)
      const r = rng(f.def.seed * 7 + 1)
      if (r() > 0.7) continue
      const p = f.center.clone().add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(f.radius * 0.6))
      p.addScaledVector(p.clone().sub(f.center).normalize(), (f.def.anchor || 200) + 120)
      this.drift(SPACE[Math.floor(r() * SPACE.length)], p, Math.floor(r() * 1e9))
    }
  }
}
