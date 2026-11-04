// Trees and bushes: pines on the mountain, broadleaves and birches in the lowlands, bushes at forest edges.
// Placed on a jittered grid from the forest map (the same everywhere), drawn as instanced meshes in 256 m
// tiles: full models near the player, cheap cones further out. Trunks near the player are colliders.
import * as THREE from 'three'
import { lin } from '../core/color.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { forestAt, heightAt, waterLevel, roadAt, fieldAt } from './heightfield.js'
import { hash2 } from '../core/noise.js'
import { makeBox } from './collision.js'
import { isBuilt } from './places.js'

const TILE = 256
const SPACING = 10

function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo
  const n = g.attributes.position.count, c = new Float32Array(n * 3)
  const r = lin(color[0]), gg = lin(color[1]), b = lin(color[2])
  for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  g.deleteAttribute('uv')
  return g
}
// Unit-height models (the instance scales them): trunk plus crown.
function models() {
  const trunk = [0.38, 0.27, 0.17]
  const pine = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.12, 0.2, 0.35, 5).translate(0, 0.17, 0), trunk),
    colored(new THREE.ConeGeometry(0.55, 0.45, 7).translate(0, 0.45, 0), [0.17, 0.36, 0.2]),
    colored(new THREE.ConeGeometry(0.44, 0.38, 7).translate(0, 0.66, 0), [0.19, 0.4, 0.21]),
    colored(new THREE.ConeGeometry(0.3, 0.32, 7).translate(0, 0.86, 0), [0.22, 0.44, 0.23]),
  ])
  const leaf = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.08, 0.13, 0.5, 5).translate(0, 0.25, 0), trunk),
    colored(new THREE.IcosahedronGeometry(0.42, 0).translate(0, 0.66, 0), [0.32, 0.55, 0.22]),
    colored(new THREE.IcosahedronGeometry(0.3, 0).translate(0.2, 0.55, 0.12), [0.36, 0.6, 0.24]),
  ])
  const birch = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.05, 0.08, 0.6, 5).translate(0, 0.3, 0), [0.88, 0.86, 0.8]),
    colored(new THREE.IcosahedronGeometry(0.3, 0).scale(1, 1.4, 1).translate(0, 0.72, 0), [0.55, 0.7, 0.28]),
  ])
  const bush = colored(new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.7, 1).translate(0, 0.3, 0), [0.3, 0.48, 0.2])
  const far = mergeGeometries([colored(new THREE.ConeGeometry(0.42, 0.85, 4, 1, true).translate(0, 0.55, 0), [0.18, 0.36, 0.19])])
  const farLeaf = mergeGeometries([colored(new THREE.ConeGeometry(0.42, 0.7, 4, 1, true).translate(0, 0.6, 0), [0.3, 0.5, 0.22])])
  return { pine, leaf, birch, bush, far, farLeaf }
}

export class Vegetation {
  constructor(world, collision, quality) {
    this.world = world
    this.collision = collision
    this.models = models()
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    // trees sway a little in the wind
    this.wind = { value: 0 }
    this.mat.onBeforeCompile = sh => {
      sh.uniforms.wind = this.wind
      sh.vertexShader = 'uniform float wind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float sway = sin(wind + instanceMatrix[3].x * 0.1 + instanceMatrix[3].z * 0.13) * 0.035 * position.y * position.y;
        transformed.x += sway; transformed.z += sway * 0.6;
        #endif`)
    }
    this.tiles = new Map()
    this.setQuality(quality)
  }
  setQuality(q) {
    this.density = { low: 0.45, medium: 0.75, high: 1 }[q] ?? 0.75
    this.nearR = { low: 220, medium: 320, high: 420 }[q] ?? 320
    this.farR = { low: 900, medium: 1500, high: 2100 }[q] ?? 1500
    for (const t of this.tiles.values()) this.dropTile(t)
    this.tiles.clear()
  }
  // The trees of one tile: [{ x, y, z, s, kind, rot }].
  plant(tx, tz) {
    const out = []
    const n = TILE / SPACING
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gx = tx * n + i, gz = tz * n + j
      const r1 = hash2(gx, gz, 11), r2 = hash2(gx, gz, 12), r3 = hash2(gx, gz, 13)
      if (r3 > this.density) continue
      const x = gx * SPACING + (r1 - 0.5) * SPACING * 0.9, z = gz * SPACING + (r2 - 0.5) * SPACING * 0.9
      const h = heightAt(x, z)
      if (h < 2) continue
      const f = forestAt(x, z, h)
      const meadow = 0.015 + (fieldAt(x, z) ? -1 : 0)
      if (r1 * 0.5 + r2 * 0.5 > f * 1.08 && hash2(gx, gz, 14) > meadow) continue
      if (waterLevel(x, z) > h - 0.6) continue
      const rd = roadAt(x, z)
      if (rd && rd.d < rd.w / 2 + 3) continue
      if (isBuilt(x, z, 4)) continue
      const kind = h > 180 ? (hash2(gx, gz, 15) < 0.85 ? 'pine' : 'birch') : f < 0.5 ? (hash2(gx, gz, 15) < 0.45 ? 'bush' : 'leaf') : (hash2(gx, gz, 15) < 0.5 ? 'leaf' : hash2(gx, gz, 15) < 0.75 ? 'pine' : 'birch')
      const s = kind === 'bush' ? 1.2 + r1 * 1.4 : kind === 'pine' ? 11 + r2 * 9 : kind === 'birch' ? 9 + r1 * 6 : 8 + r2 * 7
      out.push({ x, y: h - 0.15, z, s, kind, rot: r3 * 6.28 })
    }
    return out
  }
  dropTile(t) {
    for (const m of t.meshes) { this.world.remove(m); m.dispose?.() }
    t.meshes = []
    if (t.colliders) { for (const c of t.colliders) this.collision.remove(c); t.colliders = null }
  }
  makeMeshes(t, near) {
    const groups = near ? { pine: [], leaf: [], birch: [], bush: [] } : { far: [], farLeaf: [] }
    for (const tr of t.trees) {
      if (near) groups[tr.kind].push(tr)
      else if (tr.kind !== 'bush') groups[tr.kind === 'pine' ? 'far' : 'farLeaf'].push(tr)
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), p = new THREE.Vector3()
    const meshes = []
    for (const [k, list] of Object.entries(groups)) {
      if (!list.length) continue
      const im = new THREE.InstancedMesh(this.models[k], this.mat, list.length)
      list.forEach((tr, i) => {
        q.setFromAxisAngle(up, tr.rot)
        const w = tr.kind === 'pine' ? tr.s * 0.45 : tr.kind === 'bush' ? tr.s : tr.s * 0.7
        m4.compose(p.set(tr.x, tr.y, tr.z), q, sc.set(w, tr.s, w))
        im.setMatrixAt(i, m4)
      })
      im.castShadow = near
      im.receiveShadow = false
      im.computeBoundingSphere()
      this.world.add(im)
      meshes.push(im)
    }
    return meshes
  }
  update(cx, cz, budgetMs = 3, dt = 0.016) {
    this.wind.value += dt * 1.3
    const t0 = performance.now()
    const R = this.farR + TILE
    const x0 = Math.floor((cx - R) / TILE), x1 = Math.floor((cx + R) / TILE), z0 = Math.floor((cz - R) / TILE), z1 = Math.floor((cz + R) / TILE)
    const want = []
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const d = Math.hypot((ix + 0.5) * TILE - cx, (iz + 0.5) * TILE - cz)
      if (d > this.farR + TILE * 0.7) continue
      want.push({ ix, iz, d, near: d < this.nearR + TILE * 0.71, coll: d < 160 + TILE * 0.71 })
    }
    want.sort((a, b) => a.d - b.d)
    const seen = new Set()
    for (const w of want) {
      const k = w.ix * 10000 + w.iz
      seen.add(k)
      let t = this.tiles.get(k)
      if (t && t.near === w.near && !!t.colliders === w.coll) continue
      if (performance.now() - t0 > budgetMs) continue
      if (!t) { t = { trees: this.plant(w.ix, w.iz), meshes: [], near: null, colliders: null }; this.tiles.set(k, t) }
      if (t.near !== w.near) { for (const m of t.meshes) { this.world.remove(m); m.dispose?.() } t.meshes = this.makeMeshes(t, w.near); t.near = w.near }
      if (w.coll && !t.colliders) {
        t.colliders = []
        for (const tr of t.trees) {
          if (tr.kind === 'bush') continue
          const r = tr.kind === 'pine' ? tr.s * 0.018 + 0.1 : tr.s * 0.011 + 0.08
          const c = makeBox(tr.x, tr.y + tr.s * 0.25, tr.z, r, tr.s * 0.25, r, tr.rot, 'tree', 'tree')
          this.collision.add(c); t.colliders.push(c)
        }
      } else if (!w.coll && t.colliders) { for (const c of t.colliders) this.collision.remove(c); t.colliders = null }
    }
    for (const [k, t] of this.tiles) if (!seen.has(k)) { this.dropTile(t); this.tiles.delete(k) }
  }
}
