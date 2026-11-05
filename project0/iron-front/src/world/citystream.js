// Streams the built world round the player. Near (96 m tiles): every building and prop in full, with its
// colliders, breakable glass and lamps. Far (384 m tiles): building shells, which hide themselves in a
// circle round the camera (in the vertex shader) where the full buildings are.
import * as THREE from 'three'
import { BUILDINGS, PROPS } from './places.js'
import { Kit } from './kit.js'
import { TYPES, shell } from './buildings.js'
import { PROP_TYPES } from './props.js'

const NEAR = 96, FAR = 384
const SHELL_PROPS = new Set(['chimney', 'wagon', 'rockpile', 'cave', 'crash', 'hesco', 'helipad', 'plaza', 'monument', 'aagun', 'logs', 'pole', 'lighthouse'])

export class CityStream {
  constructor(world, collision, quality) {
    this.world = world
    this.collision = collision
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    this.glassMat = new THREE.MeshLambertMaterial({ color: 0x8fb4c8, transparent: true, opacity: 0.45, depthWrite: false })
    // At night some windows are lit: a warm glow, the same windows every night (a hash of where the pane is)
    this.night = { value: 0 }
    this.glassMat.onBeforeCompile = sh => {
      sh.uniforms.uNight = this.night
      sh.vertexShader = 'varying float vLit;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec4 ic = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #else
        vec4 ic = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif
        vLit = step(0.58, fract(sin(dot(floor(ic.xz * 0.45) + floor(ic.y / 2.9) * 7.0, vec2(12.9898, 78.233))) * 43758.5453));`)
      sh.fragmentShader = 'uniform float uNight; varying float vLit;\n' + sh.fragmentShader
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.62, 0.28) * 1.6 * uNight * vLit;')
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.a = mix(gl_FragColor.a, 0.92, uNight * vLit);')
    }
    this.glassGeo = new THREE.BoxGeometry(2, 2, 2)
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: true })
    this.lampGeo = new THREE.SphereGeometry(0.22, 6, 4)
    this.hide = { value: 0 }
    this.camXZ = { value: new THREE.Vector2() }
    this.shellMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    this.shellMat.onBeforeCompile = sh => {
      sh.uniforms.hideR = this.hide; sh.uniforms.camXZ = this.camXZ; sh.uniforms.uNight = this.night
      sh.vertexShader = 'uniform float hideR; uniform vec2 camXZ; attribute vec2 center; varying vec3 vWp;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
        if (distance(center, camXZ) < hideR) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);`)
      // the painted windows of the distant buildings (their dark blue-grey) light up in patches at night
      sh.fragmentShader = 'uniform float uNight; varying vec3 vWp;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float isWin = step(vColor.r * 2.0, vColor.b) * step(max(vColor.r, max(vColor.g, vColor.b)), 0.07) * step(0.03, vColor.b);
        float lit = step(0.6, fract(sin(dot(vec2(floor((vWp.x + vWp.z) / 2.6), floor(vWp.y / 2.9)), vec2(12.9898, 78.233))) * 43758.5453));
        totalEmissiveRadiance += vec3(1.0, 0.62, 0.28) * 1.4 * uNight * isWin * lit;`)
    }
    this.broken = new Set()      // glass and props destroyed (kept while the tile is unloaded)
    this.destroyed = new Set()   // wall sections blown out
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
      // every solid part knows its place in the mesh; parts blown out before stay out
      kit.colliders.forEach((c, i) => { c.wallId = `${k}:${i}`; c.tileMesh = m })
      for (const c of kit.colliders) if (this.destroyed.has(c.wallId)) this.collapse(c)
      t.colliders = kit.colliders.filter(c => c.alive)
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
      const tb = performance.now()
      this.near.set(w.k, this.buildNear(w.k, this.nearIdx.get(w.k)))
      const bt = performance.now() - tb; if (bt > (this.slowTile?.ms || 0)) this.slowTile = { ms: bt, n: this.nearIdx.get(w.k).length }
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
  // A heavy blast knocks out the wall sections within reach (not floors, stairs or the ground floor's slab).
  // Returns the knocked-out parts' centres for the rubble and dust.
  blastWalls(x, y, z, r, collision) {
    const out = []
    collision.query(x - r, z - r, x + r, z + r, c => {
      if (!c.wallId || c.kind !== 'wall' || !c.alive || this.destroyed.has(c.wallId)) return
      if (c.mat !== 'concrete' && c.mat !== 'brick' && c.mat !== 'wood' && c.mat !== 'sheetmetal') return
      const d = Math.hypot(c.x - x, c.y - y, c.z - z) - Math.max(c.hx, c.hz) * 0.5
      if (d > r) return
      this.destroyed.add(c.wallId)
      this.collapse(c)
      collision.remove(c)
      out.push({ x: c.x, y: c.y, z: c.z, size: Math.max(c.hx, c.hy, c.hz) })
    })
    return out
  }
  // A part is removed from view by folding its 8 corners into its centre.
  collapse(c) {
    c.alive = false
    const m = c.tileMesh; if (!m || c.vbase === undefined) return
    const pa = m.geometry.attributes.position
    for (let i = 0; i < 8; i++) pa.setXYZ(c.vbase + i, c.x, c.y, c.z)
    pa.needsUpdate = true
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
