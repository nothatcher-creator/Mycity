// Digging a planet properly: tunnels, caves, overhangs. A planet's ground is a height map (fast, and right
// for a whole world), but where someone digs, the ground nearby becomes a block of true 3D rock: 16 m chunks
// of one-metre cells, each holding the distance to the undug ground, with the holes dug cut out of it and
// the result meshed with surface nets. The height-map patches leave those chunks out; from far off (where
// the chunks are not drawn) the height map shows a pit instead.
import * as THREE from 'three'
import { surfaceNets } from './asteroid.js'

const CH = 16, CS = 1, N = CH + 3
const kOf = (i, j, k) => i + ',' + j + ',' + k

export class PlanetVoxels {
  constructor(planet) {
    this.p = planet
    this.chunks = new Map()
    this.queue = []
    this.range = 600
    this.ready = 0
  }
  // a hole dug at planet-local (x, y, z): the chunks it touches hold it from now on
  add(d) {
    const pad = d.r + 2.5
    const i0 = Math.floor((d.x - pad) / CH), i1 = Math.floor((d.x + pad) / CH), j0 = Math.floor((d.y - pad) / CH), j1 = Math.floor((d.y + pad) / CH), k0 = Math.floor((d.z - pad) / CH), k1 = Math.floor((d.z + pad) / CH)
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const key = kOf(i, j, k)
      let c = this.chunks.get(key)
      if (!c) { c = { i, j, k, key, base: null, digs: [], mesh: null, dirty: true, ready: false, center: new THREE.Vector3((i + 0.5) * CH, (j + 0.5) * CH, (k + 0.5) * CH) }; this.chunks.set(key, c) }
      c.digs.push(d); c.dirty = true
      if (!c.queued) { c.queued = true; this.queue.push(c) }
    }
  }
  // should the height-map triangle centred here be left out (a finished chunk covers it)
  cut(x, y, z) {
    const i = Math.floor(x / CH), j = Math.floor(y / CH), k = Math.floor(z / CH)
    const c = this.chunks.get(kOf(i, j, k))
    if (!c || !c.ready) return false
    // keep a band at the edge of the dug region, so the two surfaces overlap rather than gap
    const m = 1.6, lx = x - i * CH, ly = y - j * CH, lz = z - k * CH
    if (lx < m && !this.chunks.get(kOf(i - 1, j, k))?.ready) return false
    if (lx > CH - m && !this.chunks.get(kOf(i + 1, j, k))?.ready) return false
    if (ly < m && !this.chunks.get(kOf(i, j - 1, k))?.ready) return false
    if (ly > CH - m && !this.chunks.get(kOf(i, j + 1, k))?.ready) return false
    if (lz < m && !this.chunks.get(kOf(i, j, k - 1))?.ready) return false
    if (lz > CH - m && !this.chunks.get(kOf(i, j, k + 1))?.ready) return false
    return true
  }
  build(c) {
    const P = this.p, ox = c.i * CH, oy = c.j * CH, oz = c.k * CH
    if (!c.base) {
      // the undug ground, once: the slow part (a height for every corner)
      const B = c.base = new Float32Array(N * N * N)
      for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = ox + (i - 1) * CS, y = oy + (j - 1) * CS, z = oz + (k - 1) * CS
        const r = Math.sqrt(x * x + y * y + z * z), q = P.R / r
        B[(k * N + j) * N + i] = r - P.R - P.hfn(P, x * q, y * q, z * q, 0.6)
      }
    }
    const S = new Float32Array(c.base)
    for (const d of c.digs) {
      const a0 = Math.max(0, Math.floor(d.x - d.r - ox) + 1), a1 = Math.min(N - 1, Math.ceil(d.x + d.r - ox) + 1)
      const b0 = Math.max(0, Math.floor(d.y - d.r - oy) + 1), b1 = Math.min(N - 1, Math.ceil(d.y + d.r - oy) + 1)
      const c0 = Math.max(0, Math.floor(d.z - d.r - oz) + 1), c1 = Math.min(N - 1, Math.ceil(d.z + d.r - oz) + 1)
      for (let k = c0; k <= c1; k++) for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) {
        const e = d.r - Math.hypot(ox + (i - 1) * CS - d.x, oy + (j - 1) * CS - d.y, oz + (k - 1) * CS - d.z), q = (k * N + j) * N + i
        if (e > S[q]) S[q] = e
      }
    }
    const cc = [0, 0, 0]
    const g = surfaceNets(null, ox - c.center.x, oy - c.center.y, oz - c.center.z, CH, CS, (x, y, z, o) => P.voxelColor(x + c.center.x, y + c.center.y, z + c.center.z, o), S)
    if (c.mesh) { c.mesh.geometry.dispose(); P.group.remove(c.mesh); c.mesh = null }
    if (g) {
      // the detail texture's coordinates: planet-local, wrapped like the height map's
      const loc = g.attributes.position.array.slice(), bx = Math.floor(c.center.x / 4096) * 4096, by = Math.floor(c.center.y / 4096) * 4096, bz = Math.floor(c.center.z / 4096) * 4096
      for (let q = 0; q < loc.length; q += 3) { loc[q] += c.center.x - bx; loc[q + 1] += c.center.y - by; loc[q + 2] += c.center.z - bz }
      g.setAttribute('aLocal', new THREE.BufferAttribute(loc, 3))
      c.mesh = new THREE.Mesh(g, P.mat)
      c.mesh.position.copy(c.center); c.mesh.matrixAutoUpdate = false; c.mesh.updateMatrix()
      P.group.add(c.mesh)
    }
    c.dirty = false
    if (!c.ready) { c.ready = true; this.ready++ }
    // the height map round it is redrawn with the chunk left out
    P.markDirty(c.center, CH * 1.2, true)
  }
  // lc: the camera, planet-local
  update(lc) {
    for (const c of this.chunks.values()) {
      const near = c.center.distanceTo(lc) < this.range
      if (c.mesh) c.mesh.visible = near
      if (near && (c.dirty || !c.ready) && !c.queued) { c.queued = true; this.queue.push(c) }
    }
    this.lc = lc
  }
  work(ms) {
    if (!this.queue.length) return 0
    const t0 = performance.now(), lc = this.lc
    if (lc) this.queue.sort((a, b) => a.center.distanceTo(lc) - b.center.distanceTo(lc))
    let n = 0
    while (this.queue.length && performance.now() - t0 < ms) { const c = this.queue.shift(); c.queued = false; this.build(c); n++ }
    return n
  }
  get pending() { return this.queue.length }
  dispose() { for (const c of this.chunks.values()) if (c.mesh) { c.mesh.geometry.dispose(); this.p.group.remove(c.mesh); c.mesh = null } }
}
