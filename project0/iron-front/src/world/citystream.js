// Streams the built world round the player. Near (96 m tiles): every building and prop in full, with its
// colliders, breakable glass and lamps. Far (384 m tiles): building shells, which hide themselves in a
// circle round the camera (in the vertex shader) where the full buildings are.
import * as THREE from 'three'
import { BUILDINGS, PROPS } from './places.js'
import { Kit } from './kit.js'
import { TYPES, shell } from './buildings.js'
import { PROP_TYPES } from './props.js'

const NEAR = 96, FAR = 384
const SHELL_PROPS = new Set(['chimney', 'wagon', 'rockpile', 'cave', 'crash', 'hesco', 'helipad', 'plaza', 'monument', 'aagun', 'logs'])

export class CityStream {
  constructor(world, collision, quality) {
    this.world = world
    this.collision = collision
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    this.glassMat = new THREE.MeshLambertMaterial({ color: 0x8fb4c8, transparent: true, opacity: 0.45, depthWrite: false })
    this.glassGeo = new THREE.BoxGeometry(2, 2, 2)
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: true })
    this.lampGeo = new THREE.SphereGeometry(0.22, 6, 4)
    this.hide = { value: 0 }
    this.camXZ = { value: new THREE.Vector2() }
    this.shellMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    this.shellMat.onBeforeCompile = sh => {
      sh.uniforms.hideR = this.hide; sh.uniforms.camXZ = this.camXZ
      sh.vertexShader = 'uniform float hideR; uniform vec2 camXZ; attribute vec2 center;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        if (distance(center, camXZ) < hideR) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);`)
    }
    this.broken = new Set()      // glass and props destroyed (kept while the tile is unloaded)
    this.near = new Map(); this.far = new Map()
    this.nearIdx = new Map(); this.farIdx = new Map()
    for (const b of BUILDINGS) push(this.nearIdx, key(b.x, b.z, NEAR), { b }), push(this.farIdx, key(b.x, b.z, FAR), { b })
    for (const p of PROPS) { push(this.nearIdx, key(p.x, p.z, NEAR), { p }); if (SHELL_PROPS.has(p.kind)) push(this.farIdx, key(p.x, p.z, FAR), { p }) }
    this.ladders = []
    this.spots = []
    this.lamps = []
    this.setQuality(quality)
  }
  setQuality(q) {
    this.nearR = { low: 170, medium: 240, high: 320 }[q] ?? 240
    this.farR = { low: 1600, medium: 2600, high: 3800 }[q] ?? 2600
  }
  buildNear(k, list) {
    const kit = new Kit()
    for (const it of list) {
      if (it.b) { const b = it.b; kit.setFrame(b.x, b.y, b.z, b.yaw); (TYPES[b.type] || PROP_TYPES[b.type])(kit, b) }
      else { const p = it.p; kit.setFrame(p.x, p.y, p.z, p.yaw); PROP_TYPES[p.kind]?.(kit, p) }
    }
    const t = { meshes: [], colliders: kit.colliders, ladders: kit.ladders, spots: kit.spots, lights: kit.lights }
    if (kit.pos.length) {
      const m = new THREE.Mesh(kit.geometry(), this.mat)
      m.castShadow = true; m.receiveShadow = true
      this.world.add(m); t.meshes.push(m)
    }
    // glass panes: one instanced mesh; each pane's collider knows its instance so a bullet can break it
    if (kit.glass.length) {
      const g = new THREE.InstancedMesh(this.glassGeo, this.glassMat, kit.glass.length)
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0)
      kit.glass.forEach((p, i) => {
        const id = `${k}:${i}`
        const gone = this.broken.has(id)
        m4.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(up, p.yaw), new THREE.Vector3(p.hx, p.hy, p.hz).multiplyScalar(gone ? 0 : 1))
        g.setMatrixAt(i, m4)
        if (!gone) {
          const c = { ...glassCollider(p), pane: { mesh: g, index: i, id } }
          t.colliders.push(c)
        }
      })
      g.computeBoundingSphere()
      g.renderOrder = 3
      this.world.add(g); t.meshes.push(g)
    }
    if (kit.lights.length) {
      const L = new THREE.InstancedMesh(this.lampGeo, this.lampMat, kit.lights.length)
      const m4 = new THREE.Matrix4()
      kit.lights.forEach((l, i) => { m4.makeTranslation(l.x, l.y, l.z); L.setMatrixAt(i, m4); L.setColorAt(i, new THREE.Color(...l.color)) })
      L.computeBoundingSphere()
      this.world.add(L); t.meshes.push(L)
    }
    for (const c of t.colliders) this.collision.add(c)
    return t
  }
  buildFar(list) {
    const kit = new Kit()
    const centers = []
    for (const it of list) {
      const before = kit.pos.length / 3
      if (it.b) { const b = it.b; kit.setFrame(b.x, b.y, b.z, b.yaw); shell(kit, b) }
      else { const p = it.p; kit.setFrame(p.x, p.y, p.z, p.yaw); PROP_TYPES[p.kind]?.(kit, p) }
      const x = it.b ? it.b.x : it.p.x, z = it.b ? it.b.z : it.p.z
      for (let i = before; i < kit.pos.length / 3; i++) centers.push(x, z)
    }
    if (!kit.pos.length) return { meshes: [] }
    const g = kit.geometry()
    g.setAttribute('center', new THREE.Float32BufferAttribute(centers, 2))
    const m = new THREE.Mesh(g, this.shellMat)
    this.world.add(m)
    return { meshes: [m] }
  }
  drop(t) {
    for (const m of t.meshes) { this.world.remove(m); m.geometry !== this.glassGeo && m.geometry !== this.lampGeo && m.geometry.dispose() }
    if (t.colliders) for (const c of t.colliders) this.collision.remove(c)
  }
  update(cx, cz, budgetMs = 4) {
    const t0 = performance.now()
    this.camXZ.value.set(cx, cz)
    let nearestMissing = Infinity
    // near tiles
    const seenN = new Set()
    const R = this.nearR
    const wantN = []
    for (let ix = Math.floor((cx - R) / NEAR); ix <= Math.floor((cx + R) / NEAR); ix++)
      for (let iz = Math.floor((cz - R) / NEAR); iz <= Math.floor((cz + R) / NEAR); iz++) {
        const d = distRect(cx, cz, ix * NEAR, iz * NEAR, NEAR)
        if (d > R) continue
        const k = ix * 10000 + iz
        if (!this.nearIdx.has(k)) continue
        seenN.add(k)
        if (!this.near.has(k)) wantN.push({ k, d })
      }
    wantN.sort((a, b) => a.d - b.d)
    for (const w of wantN) {
      if (performance.now() - t0 > budgetMs) { nearestMissing = Math.min(nearestMissing, w.d); continue }
      this.near.set(w.k, this.buildNear(w.k, this.nearIdx.get(w.k)))
      this.dirty = true
    }
    for (const [k, t] of this.near) if (!seenN.has(k) && distRect(cx, cz, Math.floor(k / 10000) * NEAR, (k % 10000) * NEAR, NEAR) > R + 60) { this.drop(t); this.near.delete(k); this.dirty = true }
    // shells hide where full buildings stand (up to the nearest tile not built yet)
    this.hide.value = Math.max(0, Math.min(R - NEAR * 0.75, nearestMissing - 2))
    // far tiles
    const F = this.farR, seenF = new Set()
    for (let ix = Math.floor((cx - F) / FAR); ix <= Math.floor((cx + F) / FAR); ix++)
      for (let iz = Math.floor((cz - F) / FAR); iz <= Math.floor((cz + F) / FAR); iz++) {
        const k = ix * 10000 + iz
        if (!this.farIdx.has(k) || distRect(cx, cz, ix * FAR, iz * FAR, FAR) > F) continue
        seenF.add(k)
        if (!this.far.has(k) && performance.now() - t0 < budgetMs) this.far.set(k, this.buildFar(this.farIdx.get(k)))
      }
    for (const [k, t] of this.far) if (!seenF.has(k)) { this.drop(t); this.far.delete(k) }
    if (this.dirty) {
      this.dirty = false
      this.ladders = []; this.spots = []
      for (const t of this.near.values()) { this.ladders.push(...t.ladders); this.spots.push(...t.spots) }
    }
  }
  // A bullet broke a pane.
  breakGlass(c) {
    const p = c.pane
    if (!p) return
    const m4 = new THREE.Matrix4()
    p.mesh.getMatrixAt(p.index, m4)
    m4.scale(new THREE.Vector3(0, 0, 0))
    p.mesh.setMatrixAt(p.index, m4)
    p.mesh.instanceMatrix.needsUpdate = true
    c.alive = false
    this.broken.add(p.id)
  }
}
import { makeBox } from './collision.js'
function glassCollider(p) { return makeBox(p.x, p.y, p.z, p.hx, p.hy, 0.05, p.yaw, 'glass', 'glass') }
const key = (x, z, s) => Math.floor(x / s) * 10000 + Math.floor(z / s)
function push(m, k, v) { let a = m.get(k); if (!a) m.set(k, a = []); a.push(v) }
function distRect(px, pz, x0, z0, s) {
  const dx = Math.max(x0 - px, 0, px - (x0 + s)), dz = Math.max(z0 - pz, 0, pz - (z0 + s))
  return Math.hypot(dx, dz)
}
