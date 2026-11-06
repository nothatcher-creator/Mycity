// The world in play: the star system, every grid in it, the shared materials, physics, flight control,
// thruster flames and sparks, and the questions everything asks (gravity here, air here, what is along
// this ray, what is near this point).
import * as THREE from 'three'
import { Universe } from '../world/universe.js'
import { Grid } from '../grid/grid.js'
import { Physics } from '../grid/physics.js'
import { ShipControl } from '../grid/ship.js'
import { makeAtlas } from '../grid/atlas.js'
import { patchMaterial } from '../world/atmo-glsl.js'
import { BLOCKS } from '../grid/blocks.js'
import { apply, INV } from '../grid/rot.js'

function envTexture() {
  const W = 256, H = 128, cv = new OffscreenCanvas(W, H), c = cv.getContext('2d')
  const g = c.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#9aa6b4'); g.addColorStop(0.45, '#4a525c'); g.addColorStop(0.55, '#2a2e33'); g.addColorStop(1, '#101214')
  c.fillStyle = g; c.fillRect(0, 0, W, H)
  c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(W * 0.2, H * 0.12, W * 0.12, H * 0.08); c.fillRect(W * 0.65, H * 0.2, W * 0.08, H * 0.06)
  const t = new THREE.CanvasTexture(cv); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class World {
  constructor(game) {
    this.game = game
    const e = this.engine = game.engine
    this.creative = true
    this.grids = []
    this.universe = new Universe(e)
    this.sunDir = this.universe.sunDir
    this.atlas = makeAtlas()
    const pm = new THREE.PMREMGenerator(e.renderer)
    this.env = pm.fromEquirectangular(envTexture()).texture
    pm.dispose()
    const U = e.spaceUniforms
    this.gridMat = patchMaterial(new THREE.MeshStandardMaterial({ map: this.atlas.tex, vertexColors: true, metalness: 0.5, roughness: 0.5, envMap: this.env, envMapIntensity: 0.55, alphaTest: 0.5 }), U, { emit: true })
    this.glassMat = patchMaterial(new THREE.MeshStandardMaterial({ map: this.atlas.tex, color: 0xa8d8ff, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.2, depthWrite: false, envMap: this.env, envMapIntensity: 0.45, side: THREE.DoubleSide }), U, {})
    this.ghostMat = new THREE.MeshBasicMaterial({ map: this.atlas.tex, color: 0x5ff3e6, transparent: true, opacity: 0.42, depthWrite: false })
    this.ghostBad = new THREE.MeshBasicMaterial({ map: this.atlas.tex, color: 0xff5040, transparent: true, opacity: 0.42, depthWrite: false })
    this.physics = new Physics(this)
    this.ships = new ShipControl(this)
    this.flames = new Flames(e)
    this.sparks = new Sparks(e)
    this.tmp = new THREE.Vector3()
  }
  addGrid(g) { this.grids.push(g); g.track = this.engine.track(g.group, g.pos, g.quat) }
  removeGrid(g) { const i = this.grids.indexOf(g); if (i >= 0) this.grids.splice(i, 1); this.engine.untrack(g.track); g.dispose(); this.game.onGridRemoved?.(g) }
  // ---- what is where ----
  gravityAt(p, out = new THREE.Vector3()) { return this.universe.gravity(p, out) }
  // gravity felt by someone on foot: natural, plus any gravity generator whose field they stand in
  gravityFelt(p, out = new THREE.Vector3()) {
    this.universe.gravity(p, out)
    for (const g of this.grids) {
      if (!g.parts?.gravgens.length) continue
      if (p.distanceTo(g.pos) > g.radius + 30) continue
      for (const b of g.parts.gravgens) {
        if (!b.on) continue
        const f = b.def.func.gravgen, c = g.toWorld(g.blockCenter(b, this.tmp), new THREE.Vector3())
        const l = g.dirToLocal(new THREE.Vector3().subVectors(p, c))
        const lb = new THREE.Vector3(), v = [0, 0, 0]
        // into the generator's own axes
        apply(INV[b.rot], l.x, l.y, l.z, v)
        if (Math.abs(v[0]) < f.half[0] && Math.abs(v[1]) < f.half[1] && Math.abs(v[2]) < f.half[2]) {
          const down = g.dirToWorld(g.blockDir(b, 0, -1, 0, lb))
          out.addScaledVector(down, f.g)
        }
      }
    }
    return out
  }
  airAt(p) { let a = 0; for (const pl of this.universe.planets) a = Math.max(a, pl.air(p)); return a }
  // is a point in a planet's shadow (for solar arrays)
  inShadow(p) {
    for (const pl of this.universe.planets) {
      const c = v.subVectors(pl.center, p), t = c.dot(this.sunDir)
      if (t > 0 && c.lengthSq() - t * t < pl.R * pl.R) return true
    }
    return false
  }
  // the nearest thing along a ray: a grid's block or rock (planet / asteroid)
  raycast(o, d, max, skip) {
    let best = null
    for (const g of this.grids) {
      if (g === skip || !g.blocks.size) continue
      // a quick sphere test first
      const c = g.comWorld(this.tmp), t = c.sub(o).dot(d)
      if (t < -g.radius || t > max + g.radius) continue
      if (c.lengthSq() - t * t > (g.radius + 1) ** 2 && o.distanceTo(g.comWorld()) > g.radius) continue
      const h = g.raycast(o, d, best ? best.dist : max)
      if (h && (!best || h.dist < best.dist)) best = h
    }
    // rock: march the distance field
    const solids = this.universe.solidsNear(o, max, [])
    if (solids.length) {
      let t = 0
      const p = new THREE.Vector3()
      for (let i = 0; i < 80 && t < (best ? best.dist : max); i++) {
        p.copy(o).addScaledVector(d, t)
        let dd = Infinity, hit = null
        for (const s of solids) { const v = s.sdf(p); if (v < dd) { dd = v; hit = s } }
        if (dd < 0.05) { if (!best || t < best.dist) best = { solid: hit, dist: t, point: p.clone() }; break }
        t += Math.max(0.05, dd * 0.8)
      }
    }
    if (best && !best.point) best.point = o.clone().addScaledVector(d, best.dist)
    return best
  }
  // ---- grids ----
  newGrid(size, pos, quat, o = {}) { return new Grid(this, size, { pos, quat, ...o }) }
  onBlockRemoved(g, b) {
    this.game.onBlockRemoved?.(g, b)
    if (!g.blocks.size) { this.removeGrid(g); return }
    g.splitPending = true
  }
  // a grid that came apart: each loose piece becomes its own grid, moving as it was
  splitGrids() {
    for (const g of [...this.grids]) {
      if (!g.splitPending) continue
      g.splitPending = false
      const comps = g.components()
      if (comps.length < 2) continue
      comps.sort((a, b) => b.length - a.length)
      for (const comp of comps.slice(1)) {
        const n = this.newGrid(g.size, g.pos, g.quat, { static: g.static })
        n.vel.copy(g.vel); n.angVel.copy(g.angVel)
        for (const b of comp) { g.remove(b); const nb = n.add(b.id, b.i, b.j, b.k, b.rot, b.color); if (nb) { nb.hp = b.hp; nb.on = b.on } }
        n.updateMass()
        if (g.static) { n.static = false }
        this.game.onSplit?.(g, n)
      }
      g.splitPending = false
    }
  }
  // a hard landing or crash: blocks near the contact lose health (big hits break them)
  impact(c) {
    const speed = c.hit
    const e = 0.5 * Math.min(c.A.mass, c.B && !c.B.static ? c.B.mass : Infinity) * (speed - 9) ** 2
    for (const g of [c.A, c.B]) {
      if (!g) continue
      const l = g.toLocal(c.p, new THREE.Vector3()).divideScalar(g.cs)
      const near = []
      for (const b of g.blocks) { const d = Math.hypot(b.i - l.x, b.j - l.y, b.k - l.z); if (d < 2.5) near.push([b, d]) }
      near.sort((a, b) => a[1] - b[1])
      let left = e / 1200
      for (const [b] of near.slice(0, 6)) { const dmg = Math.min(left, b.hp + 1); this.damage(g, b, dmg); left -= dmg; if (left <= 0) break }
    }
    this.game.onImpact?.(c)
  }
  damage(g, b, amount) {
    if (!g.blocks.has(b)) return
    b.hp -= amount
    if (b.hp <= 0) { g.remove(b); this.sparks.burst(g.toWorld(g.blockCenter(b)), 30, 2) }
    else g.touch(b)
  }
  // landing clamps
  tryLock(g, tol = 0.35) {
    if (g.locked) { g.locked = null; g.sleep = 0; return 'unlocked' }
    for (const b of g.parts?.gears || []) {
      const p = g.toWorld(g.blockPoint(b, (b.def.sizes[g.size][0] - 1) / 2, -0.55, (b.def.sizes[g.size][2] - 1) / 2))
      let target = null
      if (this.universe.sdf(p, 1 + tol) < tol) target = { solid: true }
      if (!target) for (const o of this.grids) if (o !== g && o.blocks.size && o.sdf(p, o.cs + tol, null) < tol * (o.cs / 2.5 + 0.3)) { target = { grid: o }; break }
      if (target) {
        g.locked = target
        g.vel.set(0, 0, 0); g.angVel.set(0, 0, 0)
        if (target.grid) { const o = target.grid; target.relPos = o.toLocal(g.pos, new THREE.Vector3()); target.relQuat = o.quat.clone().invert().multiply(g.quat) }
        return 'locked'
      }
    }
    return 'none'
  }
  followLock(g) {
    const L = g.locked
    if (L.grid) {
      if (!this.grids.includes(L.grid)) { g.locked = null; return }
      g.quat.copy(L.grid.quat).multiply(L.relQuat)
      g.pos.copy(L.grid.toWorld(L.relPos, this.tmp))
      g.vel.copy(L.grid.vel); g.angVel.copy(L.grid.angVel)
    } else { g.vel.set(0, 0, 0); g.angVel.set(0, 0, 0) }
  }
  update(dt, piloted, ctl) {
    for (const g of this.grids) {
      if (g.static || !g.blocks.size) { g.updateMass(); continue }
      const cp = g === piloted?.grid ? piloted.block : null
      this.ships.update(g, cp, cp ? ctl : null, dt)
    }
    // physics in two half steps
    const n = dt > 1 / 45 ? 3 : 2
    for (let i = 0; i < n; i++) this.physics.step(dt / n)
    this.splitGrids()
    for (const g of this.grids) g.rebuild(6)
  }
  draw(dt) {
    this.flames.update(this.grids, this.engine)
    this.sparks.update(dt, this.engine)
  }
}
const v = new THREE.Vector3()

// Thruster exhaust: a glowing cone per running thruster (one instanced mesh for all of them).
class Flames {
  constructor(engine) {
    const g = new THREE.ConeGeometry(0.5, 1, 12, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2)
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    this.mesh = new THREE.InstancedMesh(g, m, 400)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    for (let i = 0; i < 400; i++) this.mesh.setColorAt(i, new THREE.Color(1, 1, 1))
    engine.scene.add(this.mesh)
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.p = new THREE.Vector3(); this.c = new THREE.Color(); this.t = 0
  }
  update(grids, engine) {
    this.t += 0.016
    let n = 0
    const cam = engine.camPos
    for (const g of grids) {
      if (!g.parts || !g.parts.thrusters.length) continue
      if (g.comWorld().distanceTo(cam) > 4000) continue
      for (const b of g.parts.thrusters) {
        const o = b.out || 0
        if (o < 0.02 || n >= 400) continue
        const f = b.def.func.thruster, S = b.def.sizes[g.size]
        const r = Math.min(S[0], S[1]) * 0.42 * g.cs
        const len = r * (f.kind === 'atmo' ? 1.2 : f.kind === 'ion' ? 3 : 4.5) * (0.4 + o * 0.9) * (0.92 + Math.sin(this.t * 40 + n) * 0.08)
        const tip = g.toWorld(g.blockPoint(b, (S[0] - 1) / 2, (S[1] - 1) / 2, S[2] - 0.5), this.p)
        const dir = g.dirToWorld(g.blockDir(b, 0, 0, 1))
        this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
        this.s.set(r * 2 * (f.kind === 'atmo' ? 1 : 0.85), r * 2 * (f.kind === 'atmo' ? 1 : 0.85), len)
        engine.rel(tip, this.p)
        this.m.compose(this.p, this.q, this.s)
        this.mesh.setMatrixAt(n, this.m)
        const k = f.kind === 'atmo' ? 0.16 : 0.55 + o * 0.45
        this.c.setRGB(f.flame[0] * k, f.flame[1] * k, f.flame[2] * k)
        this.mesh.setColorAt(n, this.c)
        n++
      }
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}

// Sparks from welding, grinding and breaking blocks.
class Sparks {
  constructor(engine) {
    this.N = 600
    this.pos = new Float32Array(this.N * 3); this.vel = new Float32Array(this.N * 3); this.life = new Float32Array(this.N); this.wp = []
    for (let i = 0; i < this.N; i++) this.wp.push(new THREE.Vector3())
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffc070, size: 0.08, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
    this.points.frustumCulled = false
    engine.scene.add(this.points)
    this.i = 0
  }
  burst(p, n = 8, speed = 3, col) {
    for (let k = 0; k < n; k++) {
      const i = this.i = (this.i + 1) % this.N
      this.wp[i].copy(p)
      this.vel[i * 3] = (Math.random() - 0.5) * speed; this.vel[i * 3 + 1] = (Math.random() - 0.5) * speed; this.vel[i * 3 + 2] = (Math.random() - 0.5) * speed
      this.life[i] = 0.3 + Math.random() * 0.5
    }
  }
  update(dt, engine) {
    const t = new THREE.Vector3()
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -1e7; continue }
      this.life[i] -= dt
      this.wp[i].x += this.vel[i * 3] * dt; this.wp[i].y += this.vel[i * 3 + 1] * dt; this.wp[i].z += this.vel[i * 3 + 2] * dt
      engine.rel(this.wp[i], t)
      this.pos[i * 3] = t.x; this.pos[i * 3 + 1] = t.y; this.pos[i * 3 + 2] = t.z
    }
    this.points.geometry.attributes.position.needsUpdate = true
  }
}
