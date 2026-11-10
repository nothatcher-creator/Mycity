// Trees on worlds that grow them: pines in the dark forest patches, broadleaf trees and bushes on the
// plains, none on rock, snow, dry lake beds or dug ground. Each tree's place comes from a hash of its cell
// on the planet, so the forest is the same every visit. Only the trees within a few hundred metres are
// drawn (three instanced meshes); the engineer bumps into their trunks.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { lin } from '../core/color.js'
import { patchMaterial } from './atmo-glsl.js'

const FACES = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
]
const hash = (a, b, c) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
function paint(g, col) { const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = lin(col[0]); c[i * 3 + 1] = lin(col[1]); c[i * 3 + 2] = lin(col[2]) } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g.index ? g.toNonIndexed() : g }

function pineGeo() {
  const parts = [paint(new THREE.CylinderGeometry(0.16, 0.28, 3.4, 6).translate(0, 1.7, 0), [0.32, 0.22, 0.14])]
  for (const [y, r, h, k] of [[2.4, 2.3, 3.4, 0.85], [4.4, 1.8, 3.1, 0.95], [6.3, 1.25, 2.8, 1.05], [8.0, 0.7, 2.2, 1.15]]) parts.push(paint(new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2 - 0.6, 0), [0.13 * k, 0.3 * k, 0.15 * k]))
  return mergeGeometries(parts.map(p => { const q = p.clone(); q.deleteAttribute('uv'); return q }))
}
function leafGeo() {
  const parts = [paint(new THREE.CylinderGeometry(0.2, 0.34, 3.6, 6).translate(0, 1.8, 0), [0.36, 0.26, 0.17])]
  for (const [x, y, z, r, k] of [[0, 5.2, 0, 2.4, 1], [1.3, 4.4, 0.6, 1.7, 0.88], [-1.1, 4.6, -0.8, 1.8, 1.1], [0.2, 4.2, -1.4, 1.5, 0.94], [-0.4, 6.4, 0.5, 1.5, 1.14]]) parts.push(paint(new THREE.IcosahedronGeometry(r, 0).translate(x, y, z), [0.22 * k, 0.4 * k, 0.16 * k]))
  return mergeGeometries(parts.map(p => { const q = p.clone(); q.deleteAttribute('uv'); return q }))
}
function bushGeo() {
  const parts = []
  for (const [x, y, z, r, k] of [[0, 0.5, 0, 0.9, 1], [0.7, 0.4, 0.3, 0.6, 0.9], [-0.6, 0.45, -0.4, 0.7, 1.1]]) parts.push(paint(new THREE.IcosahedronGeometry(r, 0).translate(x, y, z), [0.26 * k, 0.4 * k, 0.18 * k]))
  return mergeGeometries(parts.map(p => { const q = p.clone(); q.deleteAttribute('uv'); return q }))
}

const MAX = 2400, CELL = 13
export class Trees {
  constructor(engine) {
    this.engine = engine
    this.mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), engine.spaceUniforms, {})
    this.group = new THREE.Group()
    this.anchor = new THREE.Vector3()
    this.meshes = [pineGeo(), leafGeo(), bushGeo()].map(g => { const m = new THREE.InstancedMesh(g, this.mat, MAX); m.count = 0; m.frustumCulled = false; for (let i = 0; i < 4; i++) m.setColorAt(i, new THREE.Color(1, 1, 1)); this.group.add(m); return m })
    this.track = engine.track(this.group, this.anchor)
    this.list = []           // { x, y, z (system), r } trunks near the camera, for bumping into
    this.last = new THREE.Vector3(1e12, 0, 0)
    this.planet = null
    this.range = 380
  }
  clear() { for (const m of this.meshes) m.count = 0; this.list.length = 0; this.planet = null; this.last.set(1e12, 0, 0) }
  // cam: the camera (system); speed: how fast it moves
  update(planet, cam, speed, quality = 1) {
    if (!planet || !planet.def.trees) { if (this.planet) this.clear(); return }
    const lc = new THREE.Vector3().subVectors(cam, planet.center), r = lc.length()
    const alt = r - planet.R
    if (alt > planet.relief + 700) { if (this.planet) this.clear(); return }
    if (this.planet === planet && lc.distanceTo(this.last) < 45) return
    if (speed > 90 && this.planet === planet) return
    this.planet = planet; this.last.copy(lc)
    this.build(planet, lc, quality)
  }
  build(P, lc, quality) {
    const d = lc.clone().normalize(), ax = [Math.abs(d.x), Math.abs(d.y), Math.abs(d.z)]
    const face = ax[0] >= ax[1] && ax[0] >= ax[2] ? (d.x > 0 ? 0 : 1) : ax[1] >= ax[2] ? (d.y > 0 ? 2 : 3) : (d.z > 0 ? 4 : 5)
    const [N, U, V] = FACES[face]
    const dn = d.x * N[0] + d.y * N[1] + d.z * N[2]
    // face coordinates (the same tangent warp the terrain uses), then cells of about 13 m
    const a0 = Math.atan((d.x * U[0] + d.y * U[1] + d.z * U[2]) / dn) / (Math.PI / 4), b0 = Math.atan((d.x * V[0] + d.y * V[1] + d.z * V[2]) / dn) / (Math.PI / 4)
    const step = CELL / (P.R * Math.PI / 4), range = this.range * Math.min(1.2, quality), n = Math.ceil(range / CELL)
    const ci = Math.round(a0 / step), cj = Math.round(b0 / step)
    const tint = P.def.treeTint || [1, 1, 1], snow = P.def.treeLine ?? 700
    this.anchor.copy(lc).add(P.center)
    const counts = [0, 0, 0], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color(), spin = new THREE.Quaternion()
    this.list.length = 0
    const seed = P.seed
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) {
      const h0 = hash(i, j, seed + face * 7)
      if (h0 > 0.62) continue
      const a = (i + hash(i, j, seed + 1) - 0.5) * step, b = (j + hash(i, j, seed + 2) - 0.5) * step
      if (Math.abs(a) > 1 || Math.abs(b) > 1) continue
      const ta = Math.tan(a * Math.PI / 4), tb = Math.tan(b * Math.PI / 4)
      let x = N[0] + U[0] * ta + V[0] * tb, y = N[1] + U[1] * ta + V[1] * tb, z = N[2] + U[2] * ta + V[2] * tb
      const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l
      const gx = x * P.R, gy = y * P.R, gz = z * P.R
      if (Math.hypot(gx - lc.x * P.R / lc.length(), gy - lc.y * P.R / lc.length(), gz - lc.z * P.R / lc.length()) > range) continue
      // forest patches (the same noise that darkens the ground), thin woods elsewhere
      const v = P.n[6](gx / 900, gy / 900, gz / 900), f = P.n[7](gx / 140, gy / 140, gz / 140)
      const forest = v + f * 0.4 > 0.25
      if (h0 > (forest ? 0.62 : 0.07)) continue
      const h = P.hfn(P, gx, gy, gz, 1.5)
      if (h < -150 || h > snow + v * 150 - Math.abs(y) * 700 || Math.abs(y) > 0.84) continue
      // not on steep ground
      const e = 3 / P.R, hx = P.hfn(P, (x + U[0] * e) * P.R, (y + U[1] * e) * P.R, (z + U[2] * e) * P.R, 1.5), hy = P.hfn(P, (x + V[0] * e) * P.R, (y + V[1] * e) * P.R, (z + V[2] * e) * P.R, 1.5)
      if (Math.abs(hx - h) > 1.5 || Math.abs(hy - h) > 1.5) continue
      pos.set(x * (P.R + h - 0.25), y * (P.R + h - 0.25), z * (P.R + h - 0.25))
      if (P.digs.length && P.dugNear(pos.clone().add(P.center))) { if (P.sdf(pos.clone().add(P.center).add(new THREE.Vector3(x, y, z))) > 0.6) continue }
      const h1 = hash(i, j, seed + 3), kind = forest ? (h1 < 0.8 ? 0 : 1) : (h1 < 0.45 ? 1 : h1 < 0.7 ? 0 : 2)
      if (counts[kind] >= MAX) continue
      up.set(x, y, z)
      q.setFromUnitVectors(Y, up).multiply(spin.setFromAxisAngle(Y, h1 * 6.283))
      const sc = (kind === 2 ? 0.8 : 0.75) + hash(i, j, seed + 4) * 0.7
      s.set(sc, sc * (0.9 + hash(i, j, seed + 5) * 0.35), sc)
      m4.compose(pos.clone().sub(lc), q, s)
      const mesh = this.meshes[kind]
      mesh.setMatrixAt(counts[kind], m4)
      const k = 0.82 + hash(i, j, seed + 6) * 0.36
      mesh.setColorAt(counts[kind], col.setRGB(tint[0] * k, tint[1] * k, tint[2] * k))
      counts[kind]++
      if (kind < 2) this.list.push({ x: pos.x + P.center.x, y: pos.y + P.center.y, z: pos.z + P.center.z, ux: x, uy: y, uz: z, r: 0.34 * sc, h: 4 * sc })
    }
    for (let k = 0; k < 3; k++) { const m = this.meshes[k]; m.count = counts[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true }
    this.count = counts[0] + counts[1] + counts[2]
  }
  // pushes a walker (feet at p, radius rad) out of the trunks; returns true if it touched one
  bump(p, vel, rad = 0.34) {
    let hit = false
    for (const t of this.list) {
      const dx = p.x - t.x, dy = p.y - t.y, dz = p.z - t.z
      const along = dx * t.ux + dy * t.uy + dz * t.uz
      if (along < -1 || along > t.h) continue
      const px = dx - t.ux * along, py = dy - t.uy * along, pz = dz - t.uz * along, d = Math.hypot(px, py, pz), min = t.r + rad
      if (d >= min || d < 1e-4) continue
      const k = (min - d) / d
      p.x += px * k; p.y += py * k; p.z += pz * k
      const vn = (vel.x * px + vel.y * py + vel.z * pz) / d
      if (vn < 0) { vel.x -= px / d * vn; vel.y -= py / d * vn; vel.z -= pz / d * vn }
      hit = true
    }
    return hit
  }
}
