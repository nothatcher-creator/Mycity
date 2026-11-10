// Rigid bodies for the grids: gravity, thrust and gyro torque; contacts with planets, asteroids and other
// grids found by testing each grid's hull points against the other's distance field, resolved with
// impulses (bounce, friction, push-out); hard hits damage the blocks they land on; a grid at rest sleeps.
import * as THREE from 'three'
import { MAX_SPEED } from './ship.js'

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), n0 = new THREE.Vector3()
const q0 = new THREE.Quaternion()

export class Physics {
  constructor(world) { this.world = world; this.contacts = []; this.tmpM = new THREE.Matrix3(); this.tmpR = new THREE.Matrix3() }
  invIWorld(g, out) {
    const R = this.tmpR.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(g.quat))
    out.copy(R).multiply(g.invI).multiply(R.clone().transpose())
    return out
  }
  step(dt) {
    const W = this.world, grids = W.grids
    for (const g of grids) g.updateMass()
    for (const g of grids) {
      if (g.static || g.locked || g.frozen || !g.blocks.size) continue
      if (g.sleep > 1.5) continue
      g._iw = this.invIWorld(g, g._iw || new THREE.Matrix3())
      const com = g.comWorld(v1)
      const grav = W.gravityAt(com, v2)
      g.vel.addScaledVector(grav, dt)
      if (g.force) g.vel.addScaledVector(g.dirToWorld(g.force, v3), dt / g.mass)
      if (g.torque) { const T = g.dirToWorld(g.torque, v3); g.angVel.add(T.applyMatrix3(g._iw).multiplyScalar(dt)) }
      // a little drag in air (so a ship with its dampeners off still slows in the atmosphere)
      if (g.air > 0) { g.vel.multiplyScalar(1 - Math.min(0.5, g.air * 0.02 * dt)); g.angVel.multiplyScalar(1 - Math.min(0.5, g.air * 0.3 * dt)) }
    }
    // contacts
    this.contacts.length = 0
    for (const g of grids) if (!g.static && !g.locked && !g.frozen && g.blocks.size && g.sleep <= 1.5) this.solidContacts(g)
    for (let i = 0; i < grids.length; i++) for (let j = i + 1; j < grids.length; j++) this.gridContacts(grids[i], grids[j])
    for (const c of this.contacts) this.prepare(c, dt)
    for (let it = 0; it < 6; it++) for (const c of this.contacts) this.solve(c)
    for (const c of this.contacts) if (c.hit > 9) W.impact(c)
    // move
    for (const g of grids) {
      if (g.static || g.frozen || !g.blocks.size) continue
      if (g.locked) { W.followLock(g); continue }
      const sp = g.vel.length()
      if (sp > MAX_SPEED) g.vel.multiplyScalar(MAX_SPEED / sp)
      const wl = g.angVel.length()
      if (wl > 6) g.angVel.multiplyScalar(6 / wl)
      // asleep: resting on something and barely moving
      if (g.touching && sp < 0.06 && wl < 0.02 && !(g.force && g.force.lengthSq() > 1)) g.sleep += dt; else g.sleep = 0
      if (g.sleep > 1.5) { g.vel.set(0, 0, 0); g.angVel.set(0, 0, 0); continue }
      const com = g.comWorld(v1)
      com.addScaledVector(g.vel, dt)
      if (wl > 1e-6) { q0.setFromAxisAngle(v2.copy(g.angVel).divideScalar(wl), wl * dt); g.quat.premultiply(q0).normalize() }
      g.pos.copy(com).sub(v3.copy(g.com).applyQuaternion(g.quat))
      g.touching = false
    }
  }
  // the grid's hull against planets and asteroids
  solidContacts(g) {
    const W = this.world, com = g.comWorld(new THREE.Vector3())
    const solids = W.universe.solidsNear(com, g.radius + 10, this._s || (this._s = []))
    if (!solids.length) return
    const rad = g.cs * 0.5, pts = g.points, P = new THREE.Vector3(), found = []
    for (const s of solids) {
      if (s.sdf(com) > g.radius + 4) continue
      for (let i = 0; i < pts.length; i += 3) {
        P.set(pts[i], pts[i + 1], pts[i + 2]).applyQuaternion(g.quat).add(g.pos)
        const d = s.sdf(P)
        if (d < rad) found.push({ s, p: P.clone(), pen: rad - d })
      }
    }
    if (!found.length) return
    g.touching = true
    found.sort((a, b) => b.pen - a.pen)
    const S = {}
    for (const f of found.slice(0, 24)) {
      const n = new THREE.Vector3()
      if (f.s.surface) { const su = f.s.surface(f.p, S); n.set(su.nx, su.ny, su.nz) } else {
        const e = 0.3, p = f.p
        n.set(f.s.sdf(v1.set(p.x + e, p.y, p.z)) - f.s.sdf(v1.set(p.x - e, p.y, p.z)), f.s.sdf(v1.set(p.x, p.y + e, p.z)) - f.s.sdf(v1.set(p.x, p.y - e, p.z)), f.s.sdf(v1.set(p.x, p.y, p.z + e)) - f.s.sdf(v1.set(p.x, p.y, p.z - e))).normalize()
      }
      // the touching point is on the hull, half a cell in from the test point
      this.contacts.push({ A: g, B: null, solid: f.s, p: f.p.clone().addScaledVector(n, -rad + f.pen * 0.5), n, pen: f.pen })
    }
  }
  // two grids: the smaller one's hull points against the other's blocks
  gridContacts(a, b) {
    if (!a.blocks.size || !b.blocks.size) return
    if (a.frozen || b.frozen) return
    if ((a.static || a.locked || a.sleep > 1.5) && (b.static || b.locked || b.sleep > 1.5)) return
    if (a.parentOf === b || b.parentOf === a) return
    const ca = a.comWorld(v1), cb = b.comWorld(v2)
    if (ca.distanceTo(cb) > a.radius + b.radius + 1) return
    // points from the grid with fewer of them (a small ship landing on a big station)
    const [src, dst] = a.points.length / a.cs <= b.points.length / b.cs ? [a, b] : [b, a]
    const rad = src.cs * 0.5, pts = src.points, P = new THREE.Vector3(), n = new THREE.Vector3()
    const dc = dst.comWorld(new THREE.Vector3())
    let count = 0
    const found = []
    for (let i = 0; i < pts.length; i += 3) {
      P.set(pts[i], pts[i + 1], pts[i + 2]).applyQuaternion(src.quat).add(src.pos)
      if (P.distanceTo(dc) > dst.radius + rad) continue
      const d = dst.sdf(P, rad + dst.cs, n)
      if (d < rad) found.push({ p: P.clone(), n: n.clone(), pen: rad - d })
    }
    if (!found.length) return
    found.sort((x, y) => y.pen - x.pen)
    src.touching = true; dst.touching = true
    if (src.sleep > 1.5) src.sleep = 0
    if (dst.sleep > 1.5 && !dst.static) dst.sleep = 0
    for (const f of found.slice(0, 24)) {
      count++
      // normal pushes src away from dst
      this.contacts.push({ A: src, B: dst, p: f.p.addScaledVector(f.n, -rad + f.pen * 0.5), n: f.n, pen: f.pen })
    }
  }
  movable(g) { return g && !g.static && !g.locked && !g.frozen }
  applyImpulse(g, p, J) {
    if (!this.movable(g)) return
    g.vel.addScaledVector(J, 1 / g.mass)
    const r = v3.subVectors(p, g.comWorld(n0))
    g.angVel.add(r.cross(J).applyMatrix3(g._iw || this.invIWorld(g, g._iw = new THREE.Matrix3())))
  }
  relVel(c, out) {
    c.A.pointVel(c.p, out)
    if (this.movable(c.B)) out.sub(c.B.pointVel(c.p, v2))
    return out
  }
  // effective mass along a direction at the contact
  kAlong(c, d) {
    let k = 0
    for (const [g, s] of [[c.A, 1], [c.B, -1]]) {
      if (!this.movable(g)) continue
      if (!g._iw) g._iw = this.invIWorld(g, new THREE.Matrix3())
      const r = v3.subVectors(c.p, g.comWorld(n0))
      const rn = r.clone().cross(d).applyMatrix3(g._iw).cross(r)
      k += 1 / g.mass + rn.dot(d)
    }
    return k
  }
  prepare(c, dt) {
    const v = this.relVel(c, new THREE.Vector3())
    c.vn0 = v.dot(c.n)
    c.hit = -c.vn0
    c.kn = this.kAlong(c, c.n)
    c.bias = Math.min(4, 0.25 / dt * Math.max(0, c.pen - 0.015))
    c.jn = 0; c.jt = 0
    c.e = c.hit > 3 ? 0.15 : 0
    c.mu = 0.75
  }
  solve(c) {
    if (c.kn <= 0) return
    const v = this.relVel(c, new THREE.Vector3())
    const vn = v.dot(c.n)
    let j = (-(1 + c.e) * Math.min(vn, 0) - (vn > 0 ? 0 : 0) + c.bias) / c.kn
    if (vn > c.bias) j = 0
    const old = c.jn
    c.jn = Math.max(0, old + j)
    j = c.jn - old
    if (j) { const J = c.n.clone().multiplyScalar(j); this.applyImpulse(c.A, c.p, J); if (c.B) this.applyImpulse(c.B, c.p, J.negate()) }
    c.bias *= 0.6
    // friction
    const v2b = this.relVel(c, new THREE.Vector3())
    const vt = v2b.sub(c.n.clone().multiplyScalar(v2b.dot(c.n)))
    const sp = vt.length()
    if (sp > 1e-4) {
      const t = vt.divideScalar(sp)
      const kt = this.kAlong(c, t)
      if (kt > 0) {
        let jt = -sp / kt
        const lim = c.mu * c.jn, oldt = c.jt
        c.jt = Math.max(-lim, Math.min(lim, oldt + jt)); jt = c.jt - oldt
        if (jt) { const J = t.multiplyScalar(jt); this.applyImpulse(c.A, c.p, J); if (c.B) this.applyImpulse(c.B, c.p, J.negate()) }
      }
    }
  }
}
