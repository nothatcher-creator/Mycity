// Deer: a few small herds in the countryside round you. They graze (heads down), wander a little and keep
// together; when you come close (less close crouched, less still prone), a vehicle drives near or a shot
// or blast goes off within earshot, the herd bolts away at a bounding run and settles again further off.
// A bullet kills one: it lies on its side, and at its body you can take venison (food). Every deer is a
// handful of boxes in seven instanced meshes, so the whole lot costs seven draw calls.
import * as THREE from 'three'
import { heightAt, waterLevel, roadAt, normalAt } from './heightfield.js'
import { isBuilt } from './places.js'

const FUR = new THREE.Color(0.47, 0.32, 0.2), BELLY = new THREE.Color(0.78, 0.68, 0.55), DARK = new THREE.Color(0.14, 0.11, 0.09), ANTLER = new THREE.Color(0.72, 0.64, 0.5)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _o = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1)
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d }

function geo(w, h, d, ox = 0, oy = 0, oz = 0) { const g = new THREE.BoxGeometry(w, h, d); g.translate(ox, oy, oz); return g }

export class Fauna {
  constructor(engine, quality) {
    this.engine = engine
    this.herds = []
    this.nHerds = quality === 'low' ? 2 : 3
    const max = this.nHerds * 6
    this.max = max
    const mat = new THREE.MeshLambertMaterial()
    const mk = (g, n) => { const m = new THREE.InstancedMesh(g, mat, n); m.frustumCulled = false; m.count = 0; m.castShadow = quality !== 'low'; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); engine.world.add(m); return m }
    // in each animal's own frame: +z forward, y up from the ground at its feet
    this.body = mk(geo(0.42, 0.5, 1.15), max)                      // centred at the shoulder line
    this.belly = mk(geo(0.36, 0.12, 0.9, 0, -0.24, 0), max)
    this.head = mk(geo(0.18, 0.2, 0.36, 0, 0.5, 0.22), max)   // a head on a neck: the pivot is the base of the neck
    this.neck = mk(geo(0.16, 0.5, 0.18, 0, 0.22, 0.02), max)
    this.ears = mk(geo(0.34, 0.08, 0.05, 0, 0.62, 0.12), max)
    this.antler = mk(geo(0.5, 0.36, 0.06, 0, 0.82, 0.1), max)
    this.legs = mk(geo(0.08, 0.86, 0.08, 0, -0.43, 0), max * 4)    // the pivot is the hip or shoulder
    this.list = []
    this.t = 0
  }
  // a place for a herd: open or wooded ground, not a town, road or water, not too steep
  spot(cx, cz) {
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2, d = 130 + Math.random() * 170, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d
      const h = heightAt(x, z)
      if (waterLevel(x, z) > h - 0.5 || isBuilt(x, z, 25) || normalAt(x, z)[1] < 0.88) continue
      const r = roadAt(x, z); if (r && r.d < 30) continue
      return { x, z }
    }
    return null
  }
  spawnHerd(cx, cz, exact = false, face = null) {
    const at = exact ? { x: cx, z: cz } : this.spot(cx, cz); if (!at) return
    const n = 3 + Math.floor(Math.random() * 4), H = { x: at.x, z: at.z, flee: 0, fx: 0, fz: 0, deer: [], calm: exact ? 20 : 0 }
    for (let i = 0; i < n; i++) {
      const d = { herd: H, x: at.x + (Math.random() - 0.5) * 14, z: at.z + (Math.random() - 0.5) * 14, y: 0, yaw: Math.random() * 6.28, speed: 0, graze: Math.random() < 0.6, t: Math.random() * 5, ph: Math.random() * 6, buck: i === 0 && Math.random() < 0.7, size: 0.92 + Math.random() * 0.16, dead: false, deadT: 0, meat: 2 }
      if (exact && i === 0) { d.x = at.x; d.z = at.z; d.graze = false; d.t = 6; if (face != null) d.yaw = face }
      d.y = heightAt(d.x, d.z)
      H.deer.push(d); this.list.push(d)
    }
    this.herds.push(H)
  }
  scare(H, fromX, fromZ) {
    if (H.flee > 1.5) return
    const a = Math.atan2(H.x - fromX, H.z - fromZ) + (Math.random() - 0.5) * 0.6
    H.flee = 7 + Math.random() * 3; H.fx = Math.sin(a); H.fz = Math.cos(a)
  }
  // threats: you (closer if crouched or prone), anyone on foot near, a moving vehicle, recent shots and blasts
  threats(g) {
    const out = []
    for (const s of g.soldiers) {
      if (s.dead) continue
      if (s.vehicle) { if (Math.abs(s.vehicle.speed) > 2) out.push({ x: s.pos.x, z: s.pos.z, r: 70 }) }
      else out.push({ x: s.pos.x, z: s.pos.z, r: s.stance === 2 ? 14 : s.stance === 1 ? 24 : 38 })
    }
    for (const d of g.dangers || []) if (g.time - d.t < 1.2) out.push({ x: d.x, z: d.z, r: 170 })
    return out
  }
  update(dt, g) {
    this.t += dt
    const P = g.player?.s, cam = g.player ? P.pos : null
    if (!cam) return
    // herds you have left far behind go; new ones settle round you
    for (const H of [...this.herds]) {
      if (Math.hypot(H.x - cam.x, H.z - cam.z) > 480) {
        this.herds.splice(this.herds.indexOf(H), 1)
        for (const d of H.deer) this.list.splice(this.list.indexOf(d), 1)
      }
    }
    this.spawnT = (this.spawnT || 0) - dt
    if (this.herds.length < this.nHerds && this.spawnT <= 0) { this.spawnT = 4; this.spawnHerd(cam.x, cam.z) }
    // what scares them (checked a few times a second)
    this.scareT = (this.scareT || 0) - dt
    if (this.scareT <= 0) {
      this.scareT = 0.25
      const T = this.threats(g)
      for (const H of this.herds) { H.calm = Math.max(0, (H.calm || 0) - 0.25); if (H.calm > 0) continue; for (const t of T) {
        if (H.deer.some(d => !d.dead && Math.hypot(d.x - t.x, d.z - t.z) < t.r)) { this.scare(H, t.x, t.z); break }
      } }
    }
    for (const H of this.herds) {
      const alive = H.deer.filter(d => !d.dead)
      if (H.flee > 0) { H.flee -= dt; H.x += H.fx * 8.5 * dt; H.z += H.fz * 8.5 * dt }
      else if (alive.length) { let sx = 0, sz = 0; for (const d of alive) { sx += d.x; sz += d.z } H.x += (sx / alive.length - H.x) * Math.min(1, dt * 0.3); H.z += (sz / alive.length - H.z) * Math.min(1, dt * 0.3) }
      for (const d of H.deer) {
        if (d.dead) { d.deadT += dt; continue }
        let want = 0, ty = d.yaw
        if (H.flee > 0) {
          // run with the herd, spread a little, round water and buildings
          const tx = H.x + Math.sin(d.ph) * 4 - d.x, tz = H.z + Math.cos(d.ph) * 4 - d.z
          ty = Math.atan2(tx + H.fx * 10, tz + H.fz * 10); want = 9.5; d.graze = false
        } else {
          d.t -= dt
          if (d.t <= 0) {
            // now and then: graze a while, or step a few metres, staying near the herd
            d.graze = Math.random() < 0.55; d.t = 3 + Math.random() * 6
            const a = Math.random() * Math.PI * 2, r = Math.random() * 9
            d.goal = { x: H.x + Math.cos(a) * r, z: H.z + Math.sin(a) * r }
          }
          if (!d.graze && d.goal) {
            const dx = d.goal.x - d.x, dz = d.goal.z - d.z
            if (Math.hypot(dx, dz) > 0.8) { ty = Math.atan2(dx, dz); want = 1.3 } else d.goal = null
          }
        }
        d.yaw += angDiff(ty, d.yaw) * Math.min(1, dt * (want > 5 ? 4 : 2))
        d.speed += (want - d.speed) * Math.min(1, dt * (want > d.speed ? 2.5 : 4))
        const nx = d.x + Math.sin(d.yaw) * d.speed * dt, nz = d.z + Math.cos(d.yaw) * d.speed * dt
        if (waterLevel(nx, nz) < heightAt(nx, nz) - 0.3 && !isBuilt(nx, nz, 1)) { d.x = nx; d.z = nz } else { d.yaw += 1.2 * dt * 3; if (H.flee > 0) { H.fx = Math.sin(d.yaw); H.fz = Math.cos(d.yaw) } }
        d.y = heightAt(d.x, d.z)
        d.ph += dt * (d.speed > 4 ? 9 : d.speed * 4.5)
      }
    }
    this.draw()
  }
  draw() {
    let n = 0, nl = 0
    for (const d of this.list) {
      if (n >= this.max) break
      const sz = d.size, run = d.speed > 4, bound = run ? Math.abs(Math.sin(d.ph)) * 0.25 : 0
      // body: on its side when dead; pitches a little when bounding
      const roll = d.dead ? Math.PI / 2 * Math.min(1, d.deadT * 4) : 0
      _e.set(run ? Math.sin(d.ph) * 0.12 : 0, d.yaw, roll); _q.setFromEuler(_e); _s.setScalar(sz)
      const by = d.dead ? 0.3 : 1.05 * sz + bound
      _p.set(d.x, d.y + by, d.z)
      _m.compose(_p, _q, _s); this.body.setMatrixAt(n, _m); this.body.setColorAt(n, FUR)
      this.belly.setMatrixAt(n, _m); this.belly.setColorAt(n, BELLY)
      // neck and head: forward at the shoulders; down to the grass when grazing, up when alert
      const look = d.dead ? 0.9 : d.graze ? 2.2 : run ? 0.6 : 0.15
      d.look = (d.look ?? look) + (look - (d.look ?? look)) * 0.15
      _o.set(0, 0.18 * sz, 0.5 * sz).applyQuaternion(_q).add(_p)
      _q2.copy(_q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(d.look, 0, 0)))
      _m.compose(_o, _q2, _s)
      this.neck.setMatrixAt(n, _m); this.neck.setColorAt(n, FUR)
      this.head.setMatrixAt(n, _m); this.head.setColorAt(n, FUR)
      this.ears.setMatrixAt(n, _m); this.ears.setColorAt(n, DARK)
      if (d.buck) { this.antler.setMatrixAt(n, _m) } else { _m.makeScale(0, 0, 0); this.antler.setMatrixAt(n, _m) }
      this.antler.setColorAt(n, ANTLER)
      // legs: swing at a walk, gather and stretch at a run, folded when dead
      for (let i = 0; i < 4; i++) {
        const side = i % 2 ? -1 : 1, front = i < 2
        const sw = d.dead ? 1.2 : run ? Math.sin(d.ph + (front ? 0 : 1.6)) * 0.9 : Math.sin(d.ph + i * 1.57) * 0.5 * Math.min(1, d.speed)
        _o.set(side * 0.15 * sz, -0.18 * sz, (front ? 0.45 : -0.45) * sz).applyQuaternion(_q).add(_p)
        _q2.copy(_q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(sw, 0, 0)))
        _m.compose(_o, _q2, _s); this.legs.setMatrixAt(nl, _m); this.legs.setColorAt(nl, FUR); nl++
      }
      n++
    }
    for (const m of [this.body, this.belly, this.head, this.neck, this.ears, this.antler]) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true }
    this.legs.count = nl; this.legs.instanceMatrix.needsUpdate = true; if (this.legs.instanceColor) this.legs.instanceColor.needsUpdate = true
  }
  // A bullet's path against the deer (two spheres on the body, one on the head): the nearest hit, or null
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null
    const sph = (cx, cy, cz, r) => {
      const lx = cx - ox, ly = cy - oy, lz = cz - oz, tc = lx * dx + ly * dy + lz * dz
      if (tc < 0 || tc > maxT + r) return -1
      const d2 = lx * lx + ly * ly + lz * lz - tc * tc
      if (d2 > r * r) return -1
      const t = tc - Math.sqrt(r * r - d2)
      return t >= 0 && t < maxT ? t : -1
    }
    for (const d of this.list) {
      if (d.dead) continue
      const mx = (ox + dx * maxT / 2) - d.x, mz = (oz + dz * maxT / 2) - d.z
      if (mx * mx + mz * mz > (maxT / 2 + 3) ** 2) continue
      const s = Math.sin(d.yaw), c = Math.cos(d.yaw), y = d.y + 1.05 * d.size
      for (const [f, yy, r] of [[0.35, 0, 0.36], [-0.35, 0, 0.36], [0.75, 0.55, 0.22]]) {
        const t = sph(d.x + s * f, y + yy, d.z + c * f, r)
        if (t >= 0 && (!best || t < best.t)) best = { t, deer: d }
      }
    }
    return best
  }
  kill(d, fromX, fromZ) {
    d.dead = true; d.deadT = 0; d.speed = 0
    this.scare(d.herd, fromX, fromZ)
  }
  // a dead deer within reach, with meat left on it
  carcass(x, z) { return this.list.find(d => d.dead && d.meat > 0 && Math.hypot(d.x - x, d.z - z) < 2.2) }
  dispose() { for (const m of [this.body, this.belly, this.head, this.neck, this.ears, this.antler, this.legs]) { m.parent?.remove(m); m.geometry.dispose() } }
}
