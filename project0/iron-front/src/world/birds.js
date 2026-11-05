// Birds: a few flocks that wheel about over the land near you in daylight (gulls by the coast, dark birds
// inland). Each bird is a small body and two wings in three instanced meshes, so all of them cost three draw
// calls. They flap and glide in turns, keep loosely together round their flock's centre, and when shooting
// or an explosion happens near a flock it scatters: the birds climb and fly off fast, then settle into a
// new circle further away. They go to roost at night and in heavy rain.
import * as THREE from 'three'
import { heightAt, waterLevel } from './heightfield.js'

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, 'YXZ'), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1)
const DARK = new THREE.Color(0.16, 0.14, 0.13), GULL = new THREE.Color(0.86, 0.87, 0.86)

function wingGeo() {
  // a swept wing from the shoulder (x = 0) out to the tip (x = 0.5); double sided
  const g = new THREE.BufferGeometry()
  const v = new Float32Array([0, 0, 0.1, 0.5, 0, -0.08, 0, 0, -0.12, 0.5, 0, -0.08, 0.32, 0, -0.18, 0, 0, -0.12])
  g.setAttribute('position', new THREE.BufferAttribute(v, 3)); g.computeVertexNormals()
  return g
}

export class Birds {
  constructor(engine, quality) {
    this.engine = engine
    this.flocks = []
    const nF = quality === 'low' ? 2 : 4, per = quality === 'low' ? 7 : 10
    this.max = nF * per
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })
    this.body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.07, 0.38), mat, this.max)
    this.wl = new THREE.InstancedMesh(wingGeo(), mat, this.max)
    this.wr = new THREE.InstancedMesh(wingGeo(), mat, this.max)
    for (const m of [this.body, this.wl, this.wr]) { m.frustumCulled = false; m.count = 0; m.castShadow = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); engine.world.add(m) }
    for (let f = 0; f < nF; f++) {
      const birds = []
      for (let i = 0; i < per; i++) birds.push({ ox: (Math.random() - 0.5) * 16, oy: (Math.random() - 0.5) * 6, oz: (Math.random() - 0.5) * 16, ph: Math.random() * 6.28, rate: 7 + Math.random() * 3, glide: Math.random() * 4, size: 1.1 + Math.random() * 0.5, p: new THREE.Vector3(), prev: new THREE.Vector3(), bank: 0 })
      this.flocks.push({ birds, cx: 1e9, cz: 0, alt: 40, r: 50, w: 0.1, a: Math.random() * 6.28, flee: 0, fx: 0, fz: 0, gull: false, seen: 0 })
    }
    this.t = 0; this.shown = 0
  }
  // put a flock somewhere 80-260 m from (x, z), over land or the shore
  place(F, x, z) {
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 180, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d
      const h = heightAt(px, pz), wl = waterLevel(px, pz)
      if (h < wl - 6 && k < 9) continue    // not far out at sea
      F.cx = px; F.cz = pz; F.alt = 28 + Math.random() * 40; F.r = 25 + Math.random() * 45
      F.w = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 4) / F.r
      F.gull = h < wl + 6
      F.flee = 0
      for (const b of F.birds) b.prev.set(1e9, 0, 0)
      return
    }
  }
  scare(x, z) {
    for (const F of this.flocks) {
      if (F.flee > 0 || F.cx > 1e8) continue
      const px = F.cx + Math.cos(F.a) * F.r, pz = F.cz + Math.sin(F.a) * F.r
      const d = Math.hypot(px - x, pz - z)
      if (d > 160) continue
      F.flee = 7; F.fx = (px - x) / (d || 1); F.fz = (pz - z) / (d || 1)
      F.ox = px; F.oz = pz; F.oy = heightAt(px, pz) + F.alt
    }
  }
  update(dt, cam, sky, dangers, now) {
    this.t += dt
    const day = sky.night < 0.55 && (sky.w?.rain || 0) < 0.6
    if (!day) { this.body.count = this.wl.count = this.wr.count = 0; for (const F of this.flocks) F.cx = 1e9; return }
    // shots and blasts in the last second scatter the flocks near them
    for (const d of dangers || []) if (now - d.t < 1 && !d.birds) { d.birds = true; this.scare(d.x, d.z) }
    let n = 0
    for (const F of this.flocks) {
      // too far off (you moved on): settle somewhere near you again
      if (F.flee <= 0 && Math.hypot(F.cx - cam.x, F.cz - cam.z) > 420) this.place(F, cam.x, cam.z)
      let cx, cy, cz, dirx, dirz
      if (F.flee > 0) {
        // flying off: fast, climbing, then a new circle where they end up
        F.flee -= dt
        F.ox += F.fx * 17 * dt; F.oz += F.fz * 17 * dt; F.oy += 3 * dt
        cx = F.ox; cy = F.oy; cz = F.oz; dirx = F.fx; dirz = F.fz
        if (F.flee <= 0) { F.r = 30 + Math.random() * 30; F.cx = F.ox - Math.cos(F.a) * F.r; F.cz = F.oz - Math.sin(F.a) * F.r; F.alt = Math.max(30, F.oy - heightAt(F.ox, F.oz)) }
        if (F.flee <= 0) F.a = Math.atan2(F.oz - F.cz, F.ox - F.cx)
      } else {
        F.a += F.w * dt
        cx = F.cx + Math.cos(F.a) * F.r; cz = F.cz + Math.sin(F.a) * F.r
        cy = Math.max(heightAt(cx, cz), waterLevel(cx, cz)) + F.alt + Math.sin(this.t * 0.2 + F.r) * 4
        dirx = -Math.sin(F.a) * Math.sign(F.w); dirz = Math.cos(F.a) * Math.sign(F.w)
      }
      const fleeing = F.flee > 0
      // the flock's own frame: forward along its path, so the loose formation turns with it
      const yaw = Math.atan2(dirx, dirz), cs = Math.cos(yaw), sn = Math.sin(yaw)
      const col = F.gull ? GULL : DARK
      for (const b of F.birds) {
        if (n >= this.max) break
        const spread = fleeing ? 1.6 : 1
        const wob = Math.sin(this.t * 0.7 + b.ph) * 2.5
        const lx = (b.ox + wob) * spread, lz = b.oz * spread
        b.p.set(cx + lx * cs + lz * sn, cy + b.oy + Math.sin(this.t * 0.9 + b.ph * 2) * 1.2, cz - lx * sn + lz * cs)
        // heading from how it moved; a new flock starts facing its way
        let hx = b.p.x - b.prev.x, hy = b.p.y - b.prev.y, hz = b.p.z - b.prev.z
        if (b.prev.x > 1e8 || hx * hx + hz * hz < 1e-6) { hx = dirx; hy = 0; hz = dirz }
        const hd = Math.hypot(hx, hz) || 1
        const turn = b.prev.x > 1e8 ? 0 : (Math.atan2(hx, hz) - (b.yaw ?? 0))
        b.yaw = Math.atan2(hx, hz)
        const wrapped = Math.atan2(Math.sin(turn), Math.cos(turn))
        b.bank += ((Math.max(-0.6, Math.min(0.6, -wrapped / Math.max(dt, 1e-3) * 0.6))) - b.bank) * Math.min(1, dt * 3)
        b.prev.copy(b.p)
        // flap for a while, then glide with the wings held out (fleeing birds flap hard all the time)
        b.glide -= dt
        if (b.glide < -3) b.glide = 2 + Math.random() * 5
        const flapping = fleeing || b.glide < 0
        b.ph += dt * (fleeing ? b.rate * 1.5 : b.rate)
        const flap = flapping ? Math.sin(b.ph) * 0.75 : 0.12 + Math.sin(this.t * 1.3 + b.ph) * 0.04
        const pitch = Math.atan2(-hy, hd) * 0.6
        // body
        tmpE.set(pitch, b.yaw, b.bank); tmpQ.setFromEuler(tmpE); tmpS.setScalar(b.size)
        tmpM.compose(b.p, tmpQ, tmpS); this.body.setMatrixAt(n, tmpM); this.body.setColorAt(n, col)
        // wings: hinged at the shoulders, flapping about the body's long axis
        const qb = tmpQ.clone()
        tmpE.set(0, 0, flap); tmpQ.copy(qb).multiply(new THREE.Quaternion().setFromEuler(tmpE))
        tmpP.set(0.04 * b.size, 0.02 * b.size, 0).applyQuaternion(qb).add(b.p)
        tmpM.compose(tmpP, tmpQ, tmpS); this.wl.setMatrixAt(n, tmpM); this.wl.setColorAt(n, col)
        tmpE.set(0, 0, -flap); tmpQ.copy(qb).multiply(new THREE.Quaternion().setFromEuler(tmpE))
        tmpP.set(-0.04 * b.size, 0.02 * b.size, 0).applyQuaternion(qb).add(b.p)
        tmpS.set(-b.size, b.size, b.size)
        tmpM.compose(tmpP, tmpQ, tmpS); this.wr.setMatrixAt(n, tmpM); this.wr.setColorAt(n, col)
        n++
      }
    }
    for (const m of [this.body, this.wl, this.wr]) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true }
    this.shown = n
  }
  dispose() { for (const m of [this.body, this.wl, this.wr]) { m.parent?.remove(m); m.geometry.dispose() } this.body.material.dispose() }
}
