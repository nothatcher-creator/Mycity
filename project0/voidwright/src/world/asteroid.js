// Asteroids: lumps of rock defined by a distance field (a noisy, stretched sphere with craters, minus any
// holes dug into it), meshed with surface nets in 16-cell chunks near the camera and as one coarse lump
// from afar. The field answers "how far is the rock from this point" for landing gear, boots and hulls.
import * as THREE from 'three'
import { simplex3, fbm3, craters } from '../core/noise3.js'
import { rng } from '../core/noise.js'
import { lin } from '../core/color.js'
import { patchMaterial } from './atmo-glsl.js'

const CH = 16 // cells per chunk side

// surface nets over a box of n^3 cells of size cs whose first corner is (ox, oy, oz) (asteroid-local)
// (`samples`: the field already sampled at the (n + 3)^3 corners, when the caller keeps them)
export function surfaceNets(sdf, ox, oy, oz, n, cs, colorAt, samples = null) {
  const N = n + 3, S = samples || new Float32Array(N * N * N)
  // corners from -1 to n+1 (one extra ring each side so neighbouring chunks agree exactly)
  let any = false, neg = false, plus = false
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = samples ? S[(k * N + j) * N + i] : sdf(ox + (i - 1) * cs, oy + (j - 1) * cs, oz + (k - 1) * cs)
    if (!samples) S[(k * N + j) * N + i] = v
    if (v < 0) neg = true; else plus = true
  }
  any = neg && plus
  if (!any) return null
  const C = n + 2, vid = new Int32Array(C * C * C).fill(-1)
  const P = [], Nr = [], Co = [], idx = []
  const cc = [0, 0, 0]
  const at = (i, j, k) => S[(k * N + j) * N + i]
  // a point in every cell (cells -1..n) the surface passes through
  for (let k = 0; k < C; k++) for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
    let mask = 0, sx = 0, sy = 0, sz = 0, cnt = 0
    const v = [at(i, j, k), at(i + 1, j, k), at(i, j + 1, k), at(i + 1, j + 1, k), at(i, j, k + 1), at(i + 1, j, k + 1), at(i, j + 1, k + 1), at(i + 1, j + 1, k + 1)]
    for (let q = 0; q < 8; q++) if (v[q] < 0) mask |= 1 << q
    if (mask === 0 || mask === 255) continue
    // the 12 edges of the cell: where along each the surface crosses
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
    for (const [a, b] of E) {
      if ((v[a] < 0) === (v[b] < 0)) continue
      const t = v[a] / (v[a] - v[b])
      const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1, bx = b & 1, by = (b >> 1) & 1, bz = (b >> 2) & 1
      sx += ax + (bx - ax) * t; sy += ay + (by - ay) * t; sz += az + (bz - az) * t; cnt++
    }
    const fx = sx / cnt, fy = sy / cnt, fz = sz / cnt
    const x = ox + (i - 1 + fx) * cs, y = oy + (j - 1 + fy) * cs, z = oz + (k - 1 + fz) * cs
    // the normal from the field's slope across the cell
    let gx = (v[1] - v[0]) + (v[3] - v[2]) + (v[5] - v[4]) + (v[7] - v[6])
    let gy = (v[2] - v[0]) + (v[3] - v[1]) + (v[6] - v[4]) + (v[7] - v[5])
    let gz = (v[4] - v[0]) + (v[5] - v[1]) + (v[6] - v[2]) + (v[7] - v[3])
    const gl = Math.hypot(gx, gy, gz) || 1
    vid[(k * C + j) * C + i] = P.length / 3
    P.push(x, y, z); Nr.push(gx / gl, gy / gl, gz / gl)
    colorAt(x, y, z, cc); Co.push(lin(cc[0]), lin(cc[1]), lin(cc[2]))
  }
  // a quad across every edge (owned by this chunk: lower corner in 0..n-1) the surface crosses
  const id = (i, j, k) => vid[(k * C + j) * C + i]
  for (let k = 1; k <= n; k++) for (let j = 1; j <= n; j++) for (let i = 1; i <= n; i++) {
    const a = at(i, j, k) < 0
    // x edge (i,j,k)-(i+1,j,k): the four cells round it are (i, j-1..j, k-1..k)
    if (i <= n - 0 && (at(i + 1, j, k) < 0) !== a) {
      const q = [id(i, j - 1, k - 1), id(i, j, k - 1), id(i, j, k), id(i, j - 1, k)]
      if (q.every(x => x >= 0)) a ? idx.push(q[0], q[1], q[2], q[0], q[2], q[3]) : idx.push(q[0], q[2], q[1], q[0], q[3], q[2])
    }
    if ((at(i, j + 1, k) < 0) !== a) {
      const q = [id(i - 1, j, k - 1), id(i, j, k - 1), id(i, j, k), id(i - 1, j, k)]
      if (q.every(x => x >= 0)) a ? idx.push(q[0], q[2], q[1], q[0], q[3], q[2]) : idx.push(q[0], q[1], q[2], q[0], q[2], q[3])
    }
    if ((at(i, j, k + 1) < 0) !== a) {
      const q = [id(i - 1, j - 1, k), id(i, j - 1, k), id(i, j, k), id(i - 1, j, k)]
      if (q.every(x => x >= 0)) a ? idx.push(q[0], q[1], q[2], q[0], q[2], q[3]) : idx.push(q[0], q[2], q[1], q[0], q[3], q[2])
    }
  }
  if (!idx.length) return null
  const g = new THREE.BufferGeometry()
  const pos = new Float32Array(P)
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(Nr), 3))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Co), 3))
  g.setAttribute('aLocal', new THREE.BufferAttribute(pos, 3))
  g.setIndex(P.length / 3 > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1))
  g.computeBoundingSphere()
  return g
}

export const ORES = {
  stone: { name: 'Stone', col: [0.46, 0.44, 0.42] }, iron: { name: 'Iron', col: [0.52, 0.36, 0.28] }, nickel: { name: 'Nickel', col: [0.58, 0.58, 0.5] },
  silicon: { name: 'Silicon', col: [0.62, 0.62, 0.66] }, cobalt: { name: 'Cobalt', col: [0.28, 0.36, 0.56] }, ice: { name: 'Ice', col: [0.8, 0.9, 0.98] },
  magnesium: { name: 'Magnesium', col: [0.66, 0.6, 0.72] }, silver: { name: 'Silver', col: [0.74, 0.76, 0.8] }, gold: { name: 'Gold', col: [0.78, 0.62, 0.26] },
  uranium: { name: 'Uranium', col: [0.36, 0.56, 0.32] }, platinum: { name: 'Platinum', col: [0.82, 0.84, 0.86] },
}

export class Asteroid {
  constructor(field, def, engine, mat) {
    this.field = field
    Object.assign(this, def) // id, pos (Vector3), r, seed, stretch [x,y,z], ores [..]
    this.engine = engine
    this.n = simplex3(def.seed); this.n2 = simplex3(def.seed + 7)
    this.digs = []                          // { x, y, z, r } holes (asteroid-local)
    this.mat = mat
    this.group = new THREE.Group()
    this.track = null
    this.cs = Math.max(1.2, Math.min(3.2, this.r / 42))
    this.chunks = new Map()
    this.coarse = null
    this.q = new THREE.Quaternion().setFromEuler(new THREE.Euler(def.rot[0], def.rot[1], def.rot[2]))
    this.qi = this.q.clone().invert()
    this.group.quaternion.copy(this.q)
    this.near = false
  }
  // distance from asteroid-local (x, y, z) to the rock surface (negative inside)
  local(x, y, z) {
    const s = this.stretch, r = this.r
    const X = x / s[0], Y = y / s[1], Z = z / s[2]
    const L = Math.sqrt(X * X + Y * Y + Z * Z)
    let d = L - r * (1 + 0.3 * fbm3(this.n, X / r * 1.2, Y / r * 1.2, Z / r * 1.2, 3) + 0.06 * fbm3(this.n2, X / r * 4.5, Y / r * 4.5, Z / r * 4.5, 2))
    if (L > r * 0.4) d -= craters(X / r * 2.2, Y / r * 2.2, Z / r * 2.2, this.seed, 0.5) * r * 0.08
    d *= 0.82
    for (const h of this.digs) { const e = h.r - Math.sqrt((x - h.x) ** 2 + (y - h.y) ** 2 + (z - h.z) ** 2); if (e > d) d = e }
    return d
  }
  toLocal(p, out) { return out.copy(p).sub(this.pos).applyQuaternion(this.qi) }
  sdf(p) {
    const v = this._v || (this._v = new THREE.Vector3())
    this.toLocal(p, v)
    const L = v.length(), big = this.r * Math.max(...this.stretch) * 1.5
    if (L > big + 20) return L - big
    return this.local(v.x, v.y, v.z)
  }
  oreAtWorld(p) { const v = this.toLocal(p, new THREE.Vector3()); return this.oreAt(v.x, v.y, v.z) }
  // what ore is at a local point: veins of the asteroid's ores in stone
  oreAt(x, y, z) {
    if (!this.ores.length) return 'stone'
    const v = this.n2(x / 18 + 50, y / 18, z / 18)
    if (v > 0.38) return this.ores[0]
    if (v < -0.42 && this.ores[1]) return this.ores[1]
    const w = this.n(x / 11 + 90, y / 11, z / 11)
    if (w > 0.55 && this.ores[2]) return this.ores[2]
    return 'stone'
  }
  colorAt(x, y, z, out) {
    // veins show as a tint in the stone, not as paint
    const st = ORES.stone.col, o = ORES[this.oreAt(x, y, z)].col, t = this.tint, f = 0.88 + this.n(x / 6, y / 6, z / 6) * 0.12
    for (let i = 0; i < 3; i++) out[i] = (st[i] * 0.55 + o[i] * 0.45) * t[i] * f
  }
  // ---- meshes ----
  show(on) {
    if (on && !this.track) { this.track = this.engine.track(this.group, this.pos, this.q) }
    else if (!on && this.track) { this.engine.untrack(this.track); this.track = null; this.freeChunks(); if (this.coarse) { this.coarse.geometry.dispose(); this.group.remove(this.coarse); this.coarse = null } }
  }
  buildCoarse() {
    const ext = this.r * Math.max(...this.stretch) * 1.45, cs = ext * 2 / 14
    const g = surfaceNets((x, y, z) => this.local(x, y, z), -ext, -ext, -ext, 14, cs, (x, y, z, o) => this.colorAt(x, y, z, o))
    if (g) { this.coarse = new THREE.Mesh(g, this.mat); this.group.add(this.coarse) }
    this.coarseBuilt = true
  }
  chunkKey(i, j, k) { return i + ',' + j + ',' + k }
  // chunks wanted near a local point (within `range`), built cheapest-first by the field
  wanted(lp, range, out) {
    const size = CH * this.cs, ext = this.r * Math.max(...this.stretch) * 1.45
    const lo = Math.floor(-ext / size), hi = Math.ceil(ext / size)
    for (let k = lo; k < hi; k++) for (let j = lo; j < hi; j++) for (let i = lo; i < hi; i++) {
      const cx = (i + 0.5) * size, cy = (j + 0.5) * size, cz = (k + 0.5) * size
      const d = Math.hypot(cx - lp.x, cy - lp.y, cz - lp.z)
      if (d > range + size) continue
      const key = this.chunkKey(i, j, k)
      const c = this.chunks.get(key)
      if (c && (c.mesh || c.empty) && !c.dirty) { c.used = true; continue }
      // a chunk far from the surface holds nothing: skip it without meshing
      if (!c) { const s = this.local(cx, cy, cz); if (Math.abs(s) > size * 0.95) { this.chunks.set(key, { empty: true, used: true }); continue } }
      out.push({ a: this, key, i, j, k, d })
      if (c) c.used = true
    }
  }
  buildChunk(key, i, j, k) {
    const size = CH * this.cs
    const g = surfaceNets((x, y, z) => this.local(x, y, z), i * size, j * size, k * size, CH, this.cs, (x, y, z, o) => this.colorAt(x, y, z, o))
    const old = this.chunks.get(key)
    if (old?.mesh) { old.mesh.geometry.dispose(); this.group.remove(old.mesh) }
    const c = { used: true, empty: !g, mesh: null }
    if (g) { c.mesh = new THREE.Mesh(g, this.mat); this.group.add(c.mesh) }
    this.chunks.set(key, c)
  }
  freeChunks() { for (const c of this.chunks.values()) if (c.mesh) { c.mesh.geometry.dispose(); this.group.remove(c.mesh) } this.chunks.clear() }
  // a hole dug at a system point (a drill, round two): the chunks it touches are rebuilt
  dig(p, r) {
    const v = this.toLocal(p, new THREE.Vector3())
    this.digs.push({ x: v.x, y: v.y, z: v.z, r })
    const size = CH * this.cs
    for (const [key, c] of this.chunks) {
      const [i, j, k] = key.split(',').map(Number)
      const cx = (i + 0.5) * size, cy = (j + 0.5) * size, cz = (k + 0.5) * size
      if (Math.hypot(cx - v.x, cy - v.y, cz - v.z) < r + size) { c.dirty = true; if (c.empty) this.chunks.delete(key) }
    }
  }
}

// A field of asteroids round a centre; they are made only when the camera comes within reach.
export class AsteroidField {
  constructor(def, engine) {
    this.def = def
    this.name = def.name
    this.center = new THREE.Vector3(...def.center)
    this.radius = def.radius
    this.engine = engine
    this.list = null
    this.mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), engine.spaceUniforms, { detail: true })
    this.mat.onBeforeCompile = ((f) => sh => { f(sh); sh.uniforms.uDetail = { value: engine.detailTex } })(this.mat.onBeforeCompile)
    this.queue = []
  }
  make() {
    const r = rng(this.def.seed), d = this.def
    this.list = []
    for (let i = 0; i < d.count; i++) {
      // clumped: most rocks near the middle, a few big ones
      const u = r(), v = r(), w = r()
      const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1), rr = this.radius * Math.cbrt(w) * (d.flat ? 1 : 1)
      const p = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph) * (d.flat || 1), Math.sin(ph) * Math.sin(th)).multiplyScalar(rr).add(this.center)
      const big = r() < 0.12
      const rad = big ? 160 + r() * 220 : 22 + r() ** 2 * 120
      const ores = [...d.ores].sort(() => r() - 0.5).slice(0, 1 + Math.floor(r() * 3))
      const t = 0.85 + r() * 0.25
      this.list.push(new Asteroid(this, { id: this.def.id + '-' + i, pos: p, r: rad, seed: this.def.seed * 100 + i, stretch: [0.8 + r() * 0.5, 0.65 + r() * 0.4, 0.8 + r() * 0.6], rot: [r() * 6, r() * 6, r() * 6], ores, tint: [t, t * (0.95 + r() * 0.08), t * (0.9 + r() * 0.1)] }, this.engine, this.mat))
    }
    // the field's guaranteed anchor: a large asteroid at the centre (stations are built into it)
    if (d.anchor) this.list.push(new Asteroid(this, { id: this.def.id + '-anchor', pos: this.center.clone(), r: d.anchor, seed: this.def.seed * 100 + 999, stretch: [1.15, 0.8, 1], rot: [0.3, 0.8, 0.1], ores: d.ores.slice(0, 3), tint: [1, 0.97, 0.93] }, this.engine, this.mat))
  }
  update(cam, quality = 1) {
    const dc = cam.distanceTo(this.center)
    if (dc > this.radius + 60000) { if (this.list) for (const a of this.list) a.show(false); return }
    if (!this.list) this.make()
    const lp = new THREE.Vector3()
    this.queue.length = 0
    for (const a of this.list) {
      const d = cam.distanceTo(a.pos) - a.r
      a.show(d < 40000 * quality)
      if (!a.track) continue
      const near = d < 900 * quality
      if (!a.coarseBuilt && !near) this.queue.push({ a, coarse: true, d })
      if (a.coarse) a.coarse.visible = !near || !a.nearReady
      if (near) {
        a.toLocal(cam, lp)
        for (const c of a.chunks.values()) c.used = false
        const before = this.queue.length
        a.wanted(lp, 520 * quality, this.queue)
        a.nearReady = this.queue.length === before || a.nearReady
        for (const c of a.chunks.values()) if (c.mesh) c.mesh.visible = true
        // chunks no longer wanted are dropped
        for (const [key, c] of a.chunks) if (!c.used && c.mesh) { c.mesh.geometry.dispose(); a.group.remove(c.mesh); a.chunks.delete(key) }
      } else if (a.chunks.size) { a.freeChunks(); a.nearReady = false }
    }
  }
  sleep() { if (this.list) for (const a of this.list) a.show(false); this.queue.length = 0 }
  work(ms) {
    const t0 = performance.now()
    this.queue.sort((x, y) => x.d - y.d)
    let n = 0
    for (const q of this.queue) {
      if (performance.now() - t0 > ms) break
      if (q.coarse) { if (!q.a.coarseBuilt) q.a.buildCoarse() } else q.a.buildChunk(q.key, q.i, q.j, q.k)
      n++
    }
    return this.queue.length - n
  }
  // asteroids near a point (for collisions)
  near(p, pad) {
    if (!this.list) return []
    const out = []
    for (const a of this.list) if (a.pos.distanceTo(p) < a.r * 2.2 + pad) out.push(a)
    return out
  }
}
