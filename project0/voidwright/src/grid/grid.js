// A grid: blocks on a lattice of 2.5 m (large) or 0.5 m (small) cells, one rigid body. Stations are fixed
// in space; ships move under their thrusters and gravity. The grid draws itself in 16-cell chunks (a
// changed block rebuilds only its chunk), hiding faces pressed against full neighbours, and answers the
// physics' questions: what a ray hits, how far a point is from its hull, its mass and how it turns.
import * as THREE from 'three'
import { BLOCKS, CELL, blockGeo } from './blocks.js'
import { ROTS, INV, apply, SIDE_ROT, OPP, QUATS } from './rot.js'
import { SIDES } from './geo.js'
import { lin } from '../core/color.js'
import { Inventory, blockRecipe, recipeTotal } from '../game/items.js'

const CK = 16
const kOf = (i, j, k) => ((i + 1024) * 2048 + (j + 1024)) * 2048 + (k + 1024)
export const PALETTE = [
  [0.78, 0.8, 0.82], [0.48, 0.5, 0.53], [0.22, 0.24, 0.26], [0.9, 0.9, 0.88], [0.86, 0.55, 0.16], [0.76, 0.2, 0.16],
  [0.2, 0.44, 0.72], [0.18, 0.62, 0.58], [0.36, 0.52, 0.24], [0.84, 0.76, 0.3], [0.5, 0.32, 0.62], [0.52, 0.38, 0.26],
  [0.12, 0.16, 0.24], [0.94, 0.94, 0.96],
]
let NEXT = 1
const NAMES = ['Kite', 'Wren', 'Heron', 'Gannet', 'Tern', 'Osprey', 'Petrel', 'Lark', 'Shrike', 'Plover', 'Swift', 'Merlin']

export class Grid {
  constructor(world, size, o = {}) {
    this.world = world
    this.id = o.id || 'g' + (NEXT++)
    this.size = size
    this.cs = CELL[size]
    this.static = !!o.static
    this.name = o.name || `${this.static ? 'Station' : size === 'large' ? 'Large Ship' : 'Small Ship'} ${NAMES[NEXT % NAMES.length]}`
    this.cells = new Map()
    this.blocks = new Set()
    this.pos = new THREE.Vector3().copy(o.pos || new THREE.Vector3())
    this.quat = new THREE.Quaternion().copy(o.quat || new THREE.Quaternion())
    this.vel = new THREE.Vector3(); this.angVel = new THREE.Vector3()
    this.mass = 0; this.com = new THREE.Vector3(); this.invI = new THREE.Matrix3(); this.I = new THREE.Matrix3()
    this.chunks = new Map()
    this.group = new THREE.Group(); this.group.name = this.name
    this.mat = o.mat || world.gridMat; this.glassMat = o.glassMat || world.glassMat
    this.dirtyMass = true
    this.points = new Float32Array(0)
    this.dampeners = true
    this.sleep = 0
    this.lights = true
    this.radius = 1
    this.ghost = !!o.ghost
    if (!this.ghost) world.addGrid(this)
  }
  // ---- cells ----
  key(i, j, k) { return kOf(i, j, k) }
  at(i, j, k) { return this.cells.get(kOf(i, j, k)) }
  // the cells a block covers, from its origin cell and rotation
  footprint(id, i, j, k, rot) {
    const S = BLOCKS[id].sizes[this.size], out = [], v = [0, 0, 0]
    for (let x = 0; x < S[0]; x++) for (let y = 0; y < S[1]; y++) for (let z = 0; z < S[2]; z++) {
      apply(rot, x, y, z, v); out.push([i + v[0], j + v[1], k + v[2]])
    }
    return out
  }
  canPlace(id, i, j, k, rot) {
    if (!BLOCKS[id]?.sizes[this.size]) return false
    for (const c of this.footprint(id, i, j, k, rot)) if (this.cells.has(kOf(c[0], c[1], c[2]))) return false
    return true
  }
  add(id, i, j, k, rot = 0, color = 0, o = {}) {
    const d = BLOCKS[id]
    if (!d?.sizes[this.size] || !this.canPlace(id, i, j, k, rot)) return null
    const cells = this.footprint(id, i, j, k, rot)
    const hp = d.hp[this.size]
    const b = { id, def: d, i, j, k, rot, color, hp, maxHp: hp, cells: cells.map(c => kOf(c[0], c[1], c[2])), on: true, grid: this, open: false, name: o.name || d.name }
    // how far it is built: the parts installed, in recipe order (a frame holds just the first)
    b.recipe = blockRecipe(d, this.size)
    b.comps = b.recipe.map(([, n]) => n)
    b.build = 1
    if (o.build != null && o.build < 1) { b.comps = b.recipe.map(() => 0); b.comps[0] = 1; b.build = 1 / recipeTotal(b.recipe); b.hp = Math.max(1, hp * b.build) }
    const f = d.func
    if (f?.inv) b.inv = new Inventory(f.inv[this.size] || 1000)
    if (f?.tank) { b.gas = 0; b.gasMax = f.tank[this.size] }
    for (const c of b.cells) this.cells.set(c, b)
    this.blocks.add(b)
    this.touch(b)
    this.dirtyMass = true
    return b
  }
  remove(b) {
    if (!this.blocks.has(b)) return
    for (const c of b.cells) this.cells.delete(c)
    this.blocks.delete(b)
    this.touch(b)
    this.dirtyMass = true
    this.world.onBlockRemoved?.(this, b)
  }
  // a block changed: its chunk (and the chunks of the cells beside it, whose hidden faces may now show)
  touch(b) {
    const c = new Set()
    for (const key of b.cells) {
      const k = key % 2048 - 1024, j = Math.floor(key / 2048) % 2048 - 1024, i = Math.floor(key / 2048 / 2048) - 1024
      for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const n = this.cells.get(kOf(i + dx, j + dy, k + dz)) || (dx || dy || dz ? null : b)
        if (n) c.add(this.chunkOf(n))
      }
    }
    c.add(this.chunkOf(b))
    for (const ck of c) { let ch = this.chunks.get(ck); if (!ch) { ch = { mesh: null, glass: null }; this.chunks.set(ck, ch) } ch.dirty = true }
    this.meshDirty = true
  }
  chunkOf(b) { return Math.floor(b.i / CK) + ',' + Math.floor(b.j / CK) + ',' + Math.floor(b.k / CK) }
  // the centre of a block in grid-local metres
  blockCenter(b, out = new THREE.Vector3()) {
    const S = b.def.sizes[this.size], v = [0, 0, 0]
    apply(b.rot, (S[0] - 1) / 2, (S[1] - 1) / 2, (S[2] - 1) / 2, v)
    return out.set((b.i + v[0]) * this.cs, (b.j + v[1]) * this.cs, (b.k + v[2]) * this.cs)
  }
  // a point given in a block's own cell units, in grid-local metres
  blockPoint(b, x, y, z, out = new THREE.Vector3()) { const v = apply(b.rot, x, y, z, [0, 0, 0]); return out.set((b.i + v[0]) * this.cs, (b.j + v[1]) * this.cs, (b.k + v[2]) * this.cs) }
  blockDir(b, x, y, z, out = new THREE.Vector3()) { const v = apply(b.rot, x, y, z, [0, 0, 0]); return out.set(v[0], v[1], v[2]) }
  // ---- placement in space ----
  toWorld(l, out = new THREE.Vector3()) { return out.copy(l).applyQuaternion(this.quat).add(this.pos) }
  toLocal(w, out = new THREE.Vector3()) { return out.copy(w).sub(this.pos).applyQuaternion(this._qi || (this._qi = new THREE.Quaternion()).copy(this.quat).invert()) }
  dirToWorld(l, out = new THREE.Vector3()) { return out.copy(l).applyQuaternion(this.quat) }
  dirToLocal(w, out = new THREE.Vector3()) { return out.copy(w).applyQuaternion(this._qi2 || (this._qi2 = new THREE.Quaternion()).copy(this.quat).invert()) }
  comWorld(out = new THREE.Vector3()) { return this.toWorld(this.com, out) }
  // velocity of a world point fixed to the grid
  pointVel(w, out = new THREE.Vector3()) {
    if (this.static) return out.set(0, 0, 0)
    const r = this.comWorld(this._cw || (this._cw = new THREE.Vector3()))
    r.subVectors(w, r)
    return out.crossVectors(this.angVel, r).add(this.vel)
  }
  // ---- drawing ----
  rebuild(budget = 99) {
    if (!this.meshDirty) return 0
    let n = 0
    for (const [ck, ch] of this.chunks) {
      if (!ch.dirty) continue
      if (n >= budget) return n
      this.buildChunk(ck, ch); n++
    }
    this.meshDirty = false
    return n
  }
  buildChunk(ck, ch) {
    const [ci, cj, ckk] = ck.split(',').map(Number)
    const op = { p: [], n: [], u: [], c: [], e: [] }, gl = { p: [], n: [], u: [], c: [], e: [] }
    const v = [0, 0, 0], w = [0, 0, 0], cs = this.cs
    for (const b of this.blocks) {
      if (Math.floor(b.i / CK) !== ci || Math.floor(b.j / CK) !== cj || Math.floor(b.k / CK) !== ckk) continue
      const unfinished = b.build < 1
      const parts = unfinished && b.build < 0.5 ? frameGeo(b.def.sizes[this.size]) : blockGeo(b.id, this.size, b.def.variant ? b.def.variant(b) : '')
      const single = b.cells.length === 1
      const pc = PALETTE[b.color] || PALETTE[0], PC = [lin(pc[0]), lin(pc[1]), lin(pc[2])]
      const health = b.hp / b.maxHp, tint = (0.45 + 0.55 * health) * (unfinished ? 0.55 : 1)
      const lit = b.on && this.lights !== false && !unfinished ? 1 : 0.15
      for (const part of parts) {
        if (single && part.side >= 0 && !part.glass && !unfinished) {
          const ws = SIDE_ROT[b.rot][part.side], s = SIDES[ws]
          const nb = this.cells.get(kOf(b.i + s[0], b.j + s[1], b.k + s[2]))
          if (nb && nb !== b && nb.cells.length === 1 && nb.def.full && nb.build >= 1) {
            const ls = SIDE_ROT[INV[nb.rot]][OPP[ws]]
            if (nb.def.full & (1 << ls)) continue
          }
        }
        const A = part.glass ? gl : op
        for (let q = 0; q < part.n; q++) {
          apply(b.rot, part.pos[q * 3], part.pos[q * 3 + 1], part.pos[q * 3 + 2], v)
          A.p.push((b.i + v[0]) * cs, (b.j + v[1]) * cs, (b.k + v[2]) * cs)
          apply(b.rot, part.nor[q * 3], part.nor[q * 3 + 1], part.nor[q * 3 + 2], w)
          A.n.push(w[0], w[1], w[2])
          A.u.push(part.uv[q * 2], part.uv[q * 2 + 1])
          const pk = part.paint[q]
          A.c.push(part.col[q * 3] * (pk ? PC[0] : 1) * tint, part.col[q * 3 + 1] * (pk ? PC[1] : 1) * tint, part.col[q * 3 + 2] * (pk ? PC[2] : 1) * tint)
          A.e.push(part.emit[q] * lit)
        }
      }
    }
    for (const [A, key, mat] of [[op, 'mesh', this.mat], [gl, 'glass', this.glassMat]]) {
      if (ch[key]) { ch[key].geometry.dispose(); this.group.remove(ch[key]); ch[key] = null }
      if (!A.p.length) continue
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(A.p), 3))
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(A.n), 3))
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(A.u), 2))
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(A.c), 3))
      g.setAttribute('aEmit', new THREE.BufferAttribute(new Float32Array(A.e), 1))
      g.computeBoundingSphere()
      const m = new THREE.Mesh(g, mat)
      if (key === 'glass') m.renderOrder = 2
      this.group.add(m); ch[key] = m
    }
    ch.dirty = false
    if (!ch.mesh && !ch.glass) this.chunks.delete(ck)
  }
  // ---- mass and the hull points the physics tests ----
  updateMass() {
    if (!this.dirtyMass) return
    this.dirtyMass = false
    let m = 0
    const c = new THREE.Vector3(), p = new THREE.Vector3()
    for (const b of this.blocks) { const bm = b.def.mass[this.size]; this.blockCenter(b, p); c.addScaledVector(p, bm); m += bm }
    const oldCom = this.com.clone()
    this.blockMass = m
    this.mass = Math.max(1, m + (this.cargoMass || 0))
    if (m > 0) c.divideScalar(m)
    // keep the grid where it is in space when its centre of mass moves
    if (this.blocks.size && !this.static) {
      const d = c.clone().sub(oldCom)
      if (this.massInit) { /* the origin stays; only the com reference moves */ }
      this.massInit = true
    }
    this.com.copy(c)
    // inertia about the centre of mass (each block a solid box)
    let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0
    const cs = this.cs
    for (const b of this.blocks) {
      const bm = b.def.mass[this.size], S = b.def.sizes[this.size]
      this.blockCenter(b, p).sub(c)
      const d = apply(b.rot, S[0], S[1], S[2], [0, 0, 0]).map(v => Math.abs(v) * cs)
      xx += bm * (p.y * p.y + p.z * p.z + (d[1] * d[1] + d[2] * d[2]) / 12)
      yy += bm * (p.x * p.x + p.z * p.z + (d[0] * d[0] + d[2] * d[2]) / 12)
      zz += bm * (p.x * p.x + p.y * p.y + (d[0] * d[0] + d[1] * d[1]) / 12)
      xy -= bm * p.x * p.y; xz -= bm * p.x * p.z; yz -= bm * p.y * p.z
    }
    this.I.set(xx, xy, xz, xy, yy, yz, xz, yz, zz)
    this.invI.copy(this.I)
    if (Math.abs(this.I.determinant()) > 1e-9) this.invI.invert(); else this.invI.set(1 / Math.max(xx, 1), 0, 0, 0, 1 / Math.max(yy, 1), 0, 0, 0, 1 / Math.max(zz, 1))
    // hull points: the centres of cells with an open side
    const pts = []
    let r2 = 0
    for (const [key, b] of this.cells) {
      const k = key % 2048 - 1024, j = Math.floor(key / 2048) % 2048 - 1024, i = Math.floor(key / 2048 / 2048) - 1024
      const open = !this.cells.has(kOf(i + 1, j, k)) || !this.cells.has(kOf(i - 1, j, k)) || !this.cells.has(kOf(i, j + 1, k)) || !this.cells.has(kOf(i, j - 1, k)) || !this.cells.has(kOf(i, j, k + 1)) || !this.cells.has(kOf(i, j, k - 1))
      const x = i * cs, y = j * cs, z = k * cs
      r2 = Math.max(r2, (x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2)
      if (open) pts.push(x, y, z)
    }
    this.points = new Float32Array(pts)
    this.radius = Math.sqrt(r2) + cs
    this.scan()
  }
  // the working blocks, by kind
  scan() {
    const L = this.parts = { thrusters: [], gyros: [], cockpits: [], power: [], lights: [], medbays: [], beacons: [], gravgens: [], jumpdrives: [], gears: [], doors: [], cargo: [], invs: [], refineries: [], assemblers: [], gasgens: [], tanks: [], drills: [], kits: [], detectors: [] }
    for (const b of this.blocks) {
      const f = b.def.func
      if (!f) continue
      if (f.thruster) L.thrusters.push(b)
      if (f.gyro) L.gyros.push(b)
      if (f.cockpit) L.cockpits.push(b)
      if (f.power) L.power.push(b)
      if (f.light) L.lights.push(b)
      if (f.medbay) L.medbays.push(b)
      if (f.beacon) L.beacons.push(b)
      if (f.gravgen) L.gravgens.push(b)
      if (f.jumpdrive) L.jumpdrives.push(b)
      if (f.gear) L.gears.push(b)
      if (f.door) L.doors.push(b)
      if (f.cargo) L.cargo.push(b)
      if (f.inv) L.invs.push(b)
      if (f.refine) L.refineries.push(b)
      if (f.assemble) L.assemblers.push(b)
      if (f.gasgen) L.gasgens.push(b)
      if (f.tank) L.tanks.push(b)
      if (f.drill || f.crusher) L.drills.push(b)
      if (f.detector) L.detectors.push(b)
      if (f.kit) L.kits.push(b)
      if (f.power?.store && b.charge == null) b.charge = f.power.store[this.size]
    }
  }
  // ---- rays and distances ----
  // the first block along a world ray within `max` metres: the block, the cell hit, the side entered
  raycast(o, d, max) {
    const lo = this.toLocal(o, new THREE.Vector3()).divideScalar(this.cs)
    const ld = this.dirToLocal(d, new THREE.Vector3())
    // walk the cells (Amanatides & Woo), from lo shifted so cell centres are at integers
    let x = Math.round(lo.x), y = Math.round(lo.y), z = Math.round(lo.z)
    const sx = Math.sign(ld.x) || 1, sy = Math.sign(ld.y) || 1, sz = Math.sign(ld.z) || 1
    const tdx = Math.abs(1 / ld.x), tdy = Math.abs(1 / ld.y), tdz = Math.abs(1 / ld.z)
    let tx = ((sx > 0 ? x + 0.5 - lo.x : lo.x - (x - 0.5))) * tdx, ty = ((sy > 0 ? y + 0.5 - lo.y : lo.y - (y - 0.5))) * tdy, tz = ((sz > 0 ? z + 0.5 - lo.z : lo.z - (z - 0.5))) * tdz
    const maxT = max / this.cs
    let t = 0, n = [0, 0, 0]
    for (let s = 0; s < 400 && t <= maxT; s++) {
      const b = this.cells.get(kOf(x, y, z))
      if (b && !((b.def.shape === 'door' || b.def.shape === 'hdoor') && b.open)) return { grid: this, block: b, cell: [x, y, z], normal: n, dist: t * this.cs }
      if (tx < ty && tx < tz) { t = tx; x += sx; tx += tdx; n = [-sx, 0, 0] }
      else if (ty < tz) { t = ty; y += sy; ty += tdy; n = [0, -sy, 0] }
      else { t = tz; z += sz; tz += tdz; n = [0, 0, -sz] }
    }
    return null
  }
  // distance from a grid-local point (metres) to the hull near it, looking `reach` metres round
  sdfLocal(x, y, z, reach) {
    const cs = this.cs, R = Math.ceil(reach / cs + 0.5)
    const i0 = Math.round(x / cs), j0 = Math.round(y / cs), k0 = Math.round(z / cs)
    let best = Infinity
    const seen = this._seen || (this._seen = new Set()); seen.clear()
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let c = -R; c <= R; c++) {
      const bl = this.cells.get(kOf(i0 + a, j0 + b, k0 + c))
      if (!bl || seen.has(bl)) continue
      seen.add(bl)
      const d = shapeSdf(bl, this.size, x / cs, y / cs, z / cs) * cs
      if (d < best) best = d
    }
    return best
  }
  // distance from a world point to the hull, and the outward normal (world) when within reach
  sdf(p, reach, nOut) {
    const l = this.toLocal(p, this._l || (this._l = new THREE.Vector3()))
    const d = this.sdfLocal(l.x, l.y, l.z, reach)
    if (nOut && d < reach) {
      const e = Math.min(0.05, this.cs * 0.1)
      const gx = this.sdfLocal(l.x + e, l.y, l.z, reach) - this.sdfLocal(l.x - e, l.y, l.z, reach)
      const gy = this.sdfLocal(l.x, l.y + e, l.z, reach) - this.sdfLocal(l.x, l.y - e, l.z, reach)
      const gz = this.sdfLocal(l.x, l.y, l.z + e, reach) - this.sdfLocal(l.x, l.y, l.z - e, reach)
      nOut.set(gx, gy, gz)
      if (nOut.lengthSq() < 1e-12) nOut.set(0, 1, 0)
      nOut.normalize().applyQuaternion(this.quat)
    }
    return d
  }
  // ---- connections: the blocks still joined to `start`; the rest fall away as their own grids ----
  components() {
    const left = new Set(this.blocks), out = []
    while (left.size) {
      const first = left.values().next().value, comp = [], stack = [first]
      left.delete(first)
      while (stack.length) {
        const b = stack.pop(); comp.push(b)
        for (const key of b.cells) {
          const k = key % 2048 - 1024, j = Math.floor(key / 2048) % 2048 - 1024, i = Math.floor(key / 2048 / 2048) - 1024
          for (const s of SIDES) { const n = this.cells.get(kOf(i + s[0], j + s[1], k + s[2])); if (n && left.has(n)) { left.delete(n); stack.push(n) } }
        }
      }
      out.push(comp)
    }
    return out
  }
  dispose() { for (const ch of this.chunks.values()) { ch.mesh?.geometry.dispose(); ch.glass?.geometry.dispose() } this.chunks.clear(); this.group.clear() }
}

// ---- block shapes as distance fields (cell units, point relative to the grid lattice) ----
const R2 = Math.SQRT1_2, R3 = 1 / Math.sqrt(3), HS = [0, 1 / Math.hypot(1, 0.5), -0.5 / Math.hypot(1, 0.5)]
function box(x, y, z, x0, y0, z0, x1, y1, z1) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2
  const qx = Math.abs(x - cx) - (x1 - x0) / 2, qy = Math.abs(y - cy) - (y1 - y0) / 2, qz = Math.abs(z - cz) - (z1 - z0) / 2
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0)
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0)
}
export function shapeSdf(b, size, x, y, z) {
  // into the block's own frame
  const M = ROTS[INV[b.rot]], px = x - b.i, py = y - b.j, pz = z - b.k
  const lx = M[0] * px + M[1] * py + M[2] * pz, ly = M[3] * px + M[4] * py + M[5] * pz, lz = M[6] * px + M[7] * py + M[8] * pz
  const S = b.def.sizes[size]
  switch (b.def.shape) {
    case 'cube': return box(lx, ly, lz, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5)
    case 'slope': return Math.max(box(lx, ly, lz, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5), (ly - lz) * R2)
    case 'corner': return Math.max(box(lx, ly, lz, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5), (-(lx + 0.5) + (ly + 0.5) - (lz - 0.5)) * R3)
    case 'inv': return Math.max(box(lx, ly, lz, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5), (-lx + ly - lz) * R3 - 0.5 * R3)
    case 'half': return box(lx, ly, lz, -0.5, -0.5, -0.5, 0.5, 0, 0.5)
    case 'halfslope': return Math.max(box(lx, ly, lz, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5), (ly + 0.5) * HS[1] + (lz + 0.5) * HS[2])
    case 'tip': return Math.max(box(lx, ly, lz, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5), ly * HS[1] + (lz + 0.5) * HS[2])
    case 'panel': return box(lx, ly, lz, -0.5, -0.5, -0.5, 0.5, -0.38, 0.5)
    case 'pane': return box(lx, ly, lz, -0.5, -0.5, 0.3, 0.5, 0.5, 0.5)
    case 'door': return b.open ? Math.min(box(lx, ly, lz, -0.5, 0.4, -0.12, 0.5, 0.5, 0.12), box(lx, ly, lz, -0.5, -0.5, -0.12, -0.4, 0.5, 0.12), box(lx, ly, lz, 0.4, -0.5, -0.12, 0.5, 0.5, 0.12)) : box(lx, ly, lz, -0.5, -0.5, -0.12, 0.5, 0.5, 0.12)
    case 'passage': return Math.min(box(lx, ly, lz, -0.5, -0.5, -0.5, 0.5, -0.42, 0.5), box(lx, ly, lz, -0.5, 0.42, -0.5, 0.5, 0.5, 0.5), box(lx, ly, lz, -0.5, -0.5, -0.5, -0.42, 0.5, 0.5), box(lx, ly, lz, 0.42, -0.5, -0.5, 0.5, 0.5, 0.5))
    case 'round': return Math.max(box(lx, ly, lz, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5), Math.hypot(ly + 0.5, lz - 0.5) - 1)
    case 'roundcorner': return Math.max(box(lx, ly, lz, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5), Math.hypot(lx - 0.5, ly + 0.5, lz - 0.5) - 1)
    case 'hdoor': return b.open ? box(lx, ly, lz, -0.5, 0.42, 0.34, 0.5, 0.5, 0.5) : box(lx, ly, lz, -0.5, -0.5, 0.36, 0.5, 0.5, 0.5)
    case 'boxes': { let d = Infinity; for (const q of b.def.boxes) d = Math.min(d, box(lx, ly, lz, q[0], q[1], q[2], q[3], q[4], q[5])); return d }
    default: return box(lx, ly, lz, -0.5, -0.5, -0.5, S[0] - 0.5, S[1] - 0.5, S[2] - 0.5)
  }
}

// a block that is only a frame: a cage of girders the size of the block
import { Geo } from './geo.js'
import { T } from './atlas.js'
const FRAMES = new Map()
export function frameGeo(S) {
  const k = S.join('x')
  if (FRAMES.has(k)) return FRAMES.get(k)
  const g = new Geo(), x1 = S[0] - 0.5, y1 = S[1] - 0.5, z1 = S[2] - 0.5
  g.box(-0.48, -0.48, -0.48, x1 - 0.02, y1 - 0.02, z1 - 0.02, { tile: T.TRUSS, double: true, paint: false, col: [0.75, 0.62, 0.3] })
  const parts = g.finish(); FRAMES.set(k, parts); return parts
}
// a block doing its job: switched on, fully built, not badly damaged
export const works = b => b.on && b.build >= 1 && b.hp > b.maxHp * 0.25
