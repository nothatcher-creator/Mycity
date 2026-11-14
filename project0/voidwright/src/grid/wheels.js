// Wheels and tracks: a ray from each wheel's mount down its suspension finds the ground (rock or another
// grid). A spring and damper hold the grid up; the tyre grips sideways, drives along its rolling line when
// the pilot asks (W/S), steers when it is ahead of the centre of mass (A/D), and brakes when nothing is
// asked and the dampeners are on. Tracks have three rays along their length, do not steer, and drive their
// two sides against each other to turn on the spot.
import * as THREE from 'three'
import { works } from './grid.js'

const a = new THREE.Vector3(), b = new THREE.Vector3(), down = new THREE.Vector3(), up = new THREE.Vector3(), fw = new THREE.Vector3(), ax = new THREE.Vector3()
const M = new THREE.Vector3(), P = new THREE.Vector3(), V = new THREE.Vector3(), F = new THREE.Vector3(), r = new THREE.Vector3(), n = new THREE.Vector3()
const LOOK = new THREE.Quaternion()

// which way the pilot's seat faces, in grid axes (the grid's own -Z when nobody sits)
function seatAxes(g) {
  const c = g.drive?.seat
  const f = c ? g.blockDir(c, 0, 0, -1, new THREE.Vector3()) : new THREE.Vector3(0, 0, -1)
  const u = c ? g.blockDir(c, 0, 1, 0, new THREE.Vector3()) : new THREE.Vector3(0, 1, 0)
  return { f, u }
}

export function wheelStep(W, g, dt) {
  const L = g.parts?.wheels
  if (!L?.length) return
  const d = g.drive || { throttle: 0, steer: 0 }
  const size = g.size, cs = g.cs, com = g.comWorld(new THREE.Vector3())
  const { f: sf, u: su } = seatAxes(g)
  const sfW = g.dirToWorld(sf, new THREE.Vector3()), suW = g.dirToWorld(su, new THREE.Vector3())
  const sideW = new THREE.Vector3().crossVectors(sfW, suW)    // the seat's right
  const ratio = g.power ? Math.max(0.15, g.power.ratio) : 1
  // contacts: how many rays touch, to share the load
  let rays = 0
  for (const w of L) if (works(w)) rays += w.def.func.track ? w.def.func.track.rays : 1
  if (!rays) return
  const gW = Math.max(2, W.gravityAt(com, new THREE.Vector3()).length())
  const share = g.mass / rays
  let touching = 0
  const want = Math.abs(d.throttle) > 0.05 || Math.abs(d.steer) > 0.05
  for (const w of L) {
    if (!works(w)) { w.contact = false; continue }
    const fwh = w.def.func.wheel, ftr = w.def.func.track, f = fwh || ftr
    const S = w.def.sizes[size], rad = f.r[size]
    up.copy(g.dirToWorld(g.blockDir(w, 0, 1, 0, a), b))
    down.copy(up).negate()
    // the wheel's rolling line, flipped to agree with the seat; the axle across it
    fw.copy(g.dirToWorld(g.blockDir(w, 0, 0, -1, b), ax))
    if (fw.dot(sfW) < 0) fw.negate()
    const cen = g.toWorld(g.blockPoint(w, (S[0] - 1) / 2, (S[1] - 1) / 2, (S[2] - 1) / 2), new THREE.Vector3())
    const ahead = cen.clone().sub(com).dot(sfW), right = cen.clone().sub(com).dot(sideW)
    // the front wheels steer
    let steerA = 0
    if (fwh && ahead > cs * 0.3) steerA = -d.steer * 0.5 * Math.min(1, 12 / Math.max(6, g.vel.length()))
    if (steerA) { LOOK.setFromAxisAngle(up, steerA); fw.applyQuaternion(LOOK) }
    w.steer = steerA
    // drive for this wheel: tracks drive their sides against each other to turn
    let thr = d.throttle
    if (ftr) thr = Math.max(-1, Math.min(1, d.throttle + (right > 0 ? -1 : 1) * d.steer * 1.4))
    const smax = fwh ? fwh.smax[size] : cs * 0.5 * (S[1]) - 0.02 * cs + 0.12
    const smin = fwh ? fwh.smin[size] : smax - 0.25
    const xeq = fwh ? (smax - smin) * 0.38 : 0.12
    const k = share * gW / xeq, c = 2 * 0.75 * Math.sqrt(k * share)
    const nr = ftr ? ftr.rays : 1
    let anyC = false, sAvg = 0
    for (let i = 0; i < nr; i++) {
      // mount points along a track's length
      const along = ftr ? (i / (nr - 1) - 0.5) * (S[2] - 1) * cs : 0
      M.copy(cen).addScaledVector(g.dirToWorld(g.blockDir(w, 0, 0, 1, b), r), along)
      const len = smax + (fwh ? rad : 0)
      const h = W.raycast(M, down, len, g)
      if (!h) { sAvg += smax; continue }
      anyC = true
      const s = Math.max(smin, h.dist - (fwh ? rad : 0))
      sAvg += s
      const comp = smax - s
      P.copy(h.point)
      g.pointVel(P, V)
      if (h.grid && !h.grid.static) V.sub(h.grid.pointVel(P, a))
      // the ground's normal: from rock's field, or the ray's way back
      n.copy(up)
      if (h.solid?.surface) { const su2 = h.solid.surface(P, {}); n.set(su2.nx, su2.ny, su2.nz) }
      const vn = V.dot(up)
      let N = Math.max(0, k * comp - c * vn)
      if (h.dist - (fwh ? rad : 0) < smin) N += Math.max(0, -vn) * share / dt * 0.5   // bottomed out: a hard stop
      F.copy(up).multiplyScalar(N)
      // grip and drive in the ground's plane
      const t1 = b.copy(fw).addScaledVector(n, -fw.dot(n)).normalize(), t2 = r.crossVectors(n, t1).normalize()
      const vl = V.dot(t1), vs = V.dot(t2)
      const mu = f.grip * (ftr ? 1 : 1)
      const lim = mu * N
      const eff = share / dt * 0.6
      // tracks slip sideways while they turn (that is how a tracked machine steers)
      const latLim = ftr && Math.abs(d.steer) > 0.1 ? lim * 0.18 : lim
      let side = -vs * eff; side = Math.max(-latLim, Math.min(latLim, side))
      let drive = 0
      if (Math.abs(thr) > 0.03) {
        drive = thr * f.force[size] / nr * ratio
        // a top speed: the motors fade out as the ground speed grows
        const top = size === 'large' ? 34 : 26
        if (Math.sign(vl) === Math.sign(thr)) drive *= Math.max(0, 1 - Math.abs(vl) / top)
        drive -= vl * share * 0.02
      } else if (g.dampeners) drive = -vl * eff * 0.9
      else drive = -vl * share * 0.05
      drive = Math.max(-lim, Math.min(lim, drive))
      F.addScaledVector(t1, drive).addScaledVector(t2, side)
      // apply at the contact
      g.vel.addScaledVector(F, dt / g.mass)
      r.subVectors(P, com).cross(F)
      g.angVel.add(r.applyMatrix3(g._iw).multiplyScalar(dt))
      if (h.grid && !h.grid.static && !h.grid.locked) h.grid.vel.addScaledVector(F, -dt / h.grid.mass)
      w.speed = vl
    }
    w.contact = anyC
    w.susp = sAvg / nr
    if (anyC) touching++
    w.spin = (w.spin || 0) + (w.speed || 0) * dt / Math.max(0.1, rad) * (fw.dot(g.dirToWorld(g.blockDir(w, 0, 0, -1, b), a)) < 0 ? -1 : 1)
    if (!anyC && Math.abs(thr) > 0.03) w.spin += thr * dt * 6
  }
  g.wheelContacts = touching
  if (touching) { g.touching = true; if (want) g.sleep = 0 }
}
