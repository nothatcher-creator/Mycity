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
import { BLOCKS, rollerYs } from '../grid/blocks.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { lin } from '../core/color.js'
import { blockRecipe } from './items.js'
import { apply, INV, QUATS } from '../grid/rot.js'
import { Survival, netCount, netTake, netPut, gasTotal, gasTake, gasPut } from './survival.js'

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
    this.spinners = new Spinners(e, this)
    this.survival = new Survival(this)
    this.tmp = new THREE.Vector3()
  }
  recipeOf(id, size) { return blockRecipe(BLOCKS[id], size) }
  netCount(g, id) { return netCount(g, id) }
  netTake(g, id, n) { return netTake(g, id, n) }
  netPut(g, id, n) { return netPut(g, id, n) }
  gasTotal(g, gas) { return gasTotal(g, gas) }
  gasTake(g, gas, n) { return gasTake(g, gas, n) }
  gasPut(g, gas, n) { return gasPut(g, gas, n) }
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
        for (const b of comp) { g.remove(b); const nb = n.add(b.id, b.i, b.j, b.k, b.rot, b.color); if (nb) copyState(b, nb) }
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
      if (!g.blocks.size) continue
      // far from the player nothing moves (and nothing is worked out): it is all as you left it
      g.frozen = g !== piloted?.grid && g.pos.distanceTo(this.engine.camPos) > 30000
      if (g.frozen) { g.updateMass(); continue }
      if (g.static) { g.updateMass(); this.ships.update(g, null, null, dt); continue }
      const cp = g === piloted?.grid ? piloted.block : null
      this.ships.update(g, cp, cp ? ctl : null, dt)
    }
    // physics in two half steps
    const n = dt > 1 / 45 ? 3 : 2
    for (let i = 0; i < n; i++) this.physics.step(dt / n)
    this.splitGrids()
    this.survival.update(dt)
    for (const g of this.grids) g.rebuild(6)
  }
  draw(dt) {
    this.spinners.update(dt, this.grids, this.engine)
    this.flames.update(this.grids, this.engine)
    this.sparks.update(dt, this.engine)
  }
}
const v = new THREE.Vector3()
// a block moved to another grid keeps how built, damaged, full and switched on it was
export function copyState(a, b) {
  b.hp = a.hp; b.on = a.on; b.build = a.build; b.comps = a.comps.slice(); b.name = a.name; b.open = a.open
  if (a.inv && b.inv) b.inv.items = new Map(a.inv.items)
  if (a.gas != null) b.gas = a.gas
  if (a.charge != null) b.charge = a.charge
}

// Thruster exhaust: a glowing cone per running thruster (one instanced mesh for all of them).
class Flames {
  constructor(engine) {
    // each flame is a plume turned on a lathe: as wide as the nozzle where it leaves it (z = 0), a slight
    // bulge, then closing to a point (z = 1). It is drawn twice: a broad coloured plume and a short white-hot
    // core. Brighter than white where the picture can hold it.
    const prof = [[0.4, 0], [0.5, 0.07], [0.48, 0.2], [0.4, 0.4], [0.28, 0.62], [0.14, 0.84], [0, 1]].map(([r, z]) => new THREE.Vector2(r, z))
    const g = new THREE.LatheGeometry(prof, 14).rotateX(Math.PI / 2)
    const m = new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: `varying vec3 vCol; varying float vT; varying vec3 vN; varying vec3 vV;
        void main() {
          vT = 1.0 - position.z; vCol = instanceColor;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying vec3 vCol; varying float vT; varying vec3 vN; varying vec3 vV;
        void main() {
          float face = abs(dot(normalize(vN), normalize(vV)));
          float soft = 0.18 + 0.82 * pow(face, 1.6);          // the edges of the plume fade out
          float along = vT * vT * (0.35 + 0.65 * vT);          // bright at the nozzle, gone at the tip
          vec3 c = vCol * (0.5 + 2.4 * along) + vec3(1.0, 0.96, 0.9) * pow(vT, 6.0) * 1.6;
          gl_FragColor = vec4(c * along * soft, 1.0);
        }`,
    })
    this.max = 800
    this.mesh = new THREE.InstancedMesh(g, m, this.max)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    for (let i = 0; i < this.max; i++) this.mesh.setColorAt(i, new THREE.Color(1, 1, 1))
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
        if (o < 0.02 || n >= this.max - 1) continue
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
        // the core: narrower, shorter, paler
        this.s.set(this.s.x * 0.5, this.s.y * 0.5, len * 0.62)
        this.m.compose(this.p, this.q, this.s)
        this.mesh.setMatrixAt(n, this.m)
        this.c.setRGB(k * (0.55 + f.flame[0] * 0.45), k * (0.55 + f.flame[1] * 0.45), k * (0.55 + f.flame[2] * 0.45))
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

// The heads of drills and the rollers of rock crushers: they turn while the block works, so they are drawn
// here, one instanced mesh for each kind, rather than as part of the grid's own mesh.
function painted(g, col) { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = lin(col[0]); c[i * 3 + 1] = lin(col[1]); c[i * 3 + 2] = lin(col[2]) } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g }
export function drillHeadGeo() {
  // along -Z from the base (z = 0, radius 1.08) to the tip (z = -1), teeth in three spirals
  const parts = [painted(new THREE.ConeGeometry(1.08, 1, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5), [0.6, 0.6, 0.63])]
  for (let k = 0; k < 3; k++) for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7, a = k * 2.094 + t * 4.4, rr = 1.02 * (1 - t), z = -t
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(Math.cos(a), Math.sin(a), -0.5), new THREE.Vector3(0, 0, 1))
    const g = new THREE.ConeGeometry(0.11, 0.26, 5).rotateX(-Math.PI / 2).applyMatrix4(m).translate(Math.cos(a) * rr, Math.sin(a) * rr, z)
    parts.push(painted(g, [0.86, 0.6, 0.2]))
  }
  return mergeGeometries(parts)
}
export function rollerGeo() {
  // along X, length 1 (scaled to the mouth), radius 1 (scaled), studded with teeth
  const parts = [painted(new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2), [0.48, 0.48, 0.5])]
  for (let i = 0; i < 5; i++) for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2 + i * 0.5, x = (i + 0.5) / 5 - 0.5
    parts.push(painted(new THREE.ConeGeometry(0.2, 0.36, 4).rotateX(a).translate(x, Math.cos(a) * 1.12, Math.sin(a) * 1.12), [0.86, 0.6, 0.2]))
  }
  return mergeGeometries(parts)
}
class Spinners {
  constructor(engine, world) {
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.45, envMap: world.env, envMapIntensity: 0.5 }), engine.spaceUniforms, {})
    this.heads = new THREE.InstancedMesh(drillHeadGeo(), mat, 96)
    this.rolls = new THREE.InstancedMesh(rollerGeo(), mat, 192)
    for (const m of [this.heads, this.rolls]) { m.frustumCulled = false; m.count = 0; engine.scene.add(m) }
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.p = new THREE.Vector3(); this.spin = new THREE.Quaternion()
    this.t = 0
  }
  update(dt, grids, engine) {
    this.t += dt
    let nh = 0, nr = 0
    const cam = engine.camPos
    for (const g of grids) {
      const D = g.parts?.drills
      if (!D || !D.length || g.pos.distanceTo(cam) > 1500 + g.radius) continue
      for (const b of D) {
        if (b.build < 1) continue
        const S = b.def.sizes[g.size], f = b.def.func, cs = g.cs
        b.angle = (b.angle || 0) + (b.spin ? dt * (f.drill ? 9 : 5) : 0)
        const bq = this.q.copy(g.quat).multiply(QUATS[b.rot])
        if (f.drill && nh < 96) {
          const z1 = S[2] - 0.5, len = z1 - 1.8 + 0.5
          engine.rel(g.toWorld(g.blockPoint(b, 1, 1, z1 - 1.8)), this.p)
          this.spin.setFromAxisAngle(Z, b.angle)
          this.s.set(cs, cs, cs * len)
          this.m.compose(this.p, bq.clone().multiply(this.spin), this.s); this.heads.setMatrixAt(nh++, this.m)
        } else if (f.crusher) {
          const x1 = S[0] - 0.5, zm = S[2] - 0.5 - (S[2] > 2 ? 1.3 : 0.9), ys = rollerYs(S), r = (S[1] - 0.9) / 4.6, len = x1 - 0.22 + 0.28
          for (let k = 0; k < 2 && nr < 192; k++) {
            engine.rel(g.toWorld(g.blockPoint(b, (x1 - 0.5) / 2 + 0.03, ys[k], (zm - 0.5) / 2 - 0.1)), this.p)
            this.spin.setFromAxisAngle(X, b.angle * (k ? -1 : 1))
            this.s.set(cs * len, cs * r, cs * r)
            this.m.compose(this.p, bq.clone().multiply(this.spin), this.s); this.rolls.setMatrixAt(nr++, this.m)
          }
        }
      }
    }
    this.heads.count = nh; this.rolls.count = nr
    this.heads.instanceMatrix.needsUpdate = true; this.rolls.instanceMatrix.needsUpdate = true
  }
}
const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1)
