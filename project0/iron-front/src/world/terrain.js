// The land as meshes: a quadtree of tiles (1024 m far away, 512 m nearer, 256 m round the player), each a
// grid of the heightfield with skirts that hide the seams between sizes. Tiles are built a few per frame,
// nearest first, and kept in a cache. Flat-shaded and coloured per vertex: grass, forest floor, fields,
// rock, sand and the beds of rivers and the sea.
import * as THREE from 'three'
import { heightAt, forestAt, fieldAt, waterLevel, normalAt, landShape, bilinear, base, flatMask } from './heightfield.js'
import { HALF, LAND_COLORS as C } from './blueprint.js'
import { hash2 } from '../core/noise.js'

const LEVELS = [
  { size: 1024, res: 20 },
  { size: 512, res: 28 },
  { size: 256, res: 44 },
]
const SPLIT = [1.9, 1.7]    // a tile splits when the camera is nearer than this many of its own sizes

export class Terrain {
  constructor(parent, quality) {
    this.group = new THREE.Group()
    this.group.name = 'terrain'
    parent.add(this.group)
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    // ground detail: two scales of value noise vary the land's colour in patches (grass, mud, worn ground),
    // the fine one fading out with distance so it never shimmers. The island offset is the world group's
    // position (the floating origin), shared by reference.
    const offset = { value: parent.position }
    this.material.onBeforeCompile = sh => {
      sh.uniforms.uIslandOffset = offset
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uIslandOffset;\nvarying vec2 vIsland;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvIsland = (modelMatrix * vec4(transformed, 1.0)).xz - uIslandOffset.xz;')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vIsland;
float gHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float gNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float near = 1.0 - smoothstep(60.0, 160.0, length(vViewPosition));
  float coarse = gNoise(vIsland * 0.09) - 0.5, fine = gNoise(vIsland * 0.6) - 0.5;
  float k = 1.0 + coarse * 0.42 + fine * 0.3 * near;
  // a touch of brown in the darker patches, like worn ground
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 0.95, 0.8), clamp(-coarse * 2.0, 0.0, 0.7)) * k;
}`)
    }
    this.cache = new Map()    // key -> { mesh, used }
    this.queue = []
    this.frame = 0
    this.view = 2800
    this.setQuality(quality)
  }
  // low stops at 512 m tiles near the player; nothing past the view distance is drawn (the fog hides it)
  setQuality(q, view = 2800) { this.detail = q === 'low' ? 1 : 2; this.view = view }
  key(level, ix, iz) { return level * 1e6 + ix * 1000 + iz }

  // Which tiles to draw from camera position (x, z): split near ones, keep far ones whole.
  update(cx, cy, cz, budgetMs = 6) {
    this.frame++
    const want = []
    const visit = (level, x0, z0) => {
      const L = LEVELS[level], s = L.size
      const mx = x0 + s / 2, mz = z0 + s / 2
      const d = Math.max(Math.hypot(mx - cx, mz - cz) - s * 0.7, 0) + Math.max(0, cy - 300) * 0.5
      if (level < this.detail && d < SPLIT[level] * s) {
        const h = s / 2
        visit(level + 1, x0, z0); visit(level + 1, x0 + h, z0); visit(level + 1, x0, z0 + h); visit(level + 1, x0 + h, z0 + h)
        return
      }
      if (d > this.view) return
      want.push({ level, x0, z0, d })
    }
    const S = LEVELS[0].size
    for (let x0 = -HALF; x0 < HALF; x0 += S) for (let z0 = -HALF; z0 < HALF; z0 += S) {
      // skip tiles of open sea (the sea plane covers them)
      if (this.isSea(x0, z0, S)) continue
      visit(0, x0, z0)
    }
    // show what is built; build what is missing, nearest first; keep a coarser tile until its children exist
    const missing = []
    for (const w of want) {
      const k = this.key(w.level, Math.round(w.x0), Math.round(w.z0))
      const c = this.cache.get(k)
      if (c) c.used = this.frame
      else missing.push({ ...w, k })
    }
    missing.sort((a, b) => a.d - b.d)
    const t0 = performance.now()
    for (const m of missing) {
      if (performance.now() - t0 > budgetMs) break
      const mesh = this.build(m.level, m.x0, m.z0)
      this.group.add(mesh)
      this.cache.set(m.k, { mesh, used: this.frame, level: m.level, x0: m.x0, z0: m.z0 })
    }
    // a wanted tile not built yet is covered by its built parent or children: keep those visible
    const pending = new Set(missing.filter(m => !this.cache.has(m.k)).map(m => m))
    for (const [k, c] of this.cache) {
      let show = c.used === this.frame
      if (!show && pending.size) {
        for (const p of pending) {
          if (overlaps(c, p)) { show = true; c.used = this.frame; break }
        }
      }
      c.mesh.visible = show
      if (!show && this.frame - c.used > 600) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); this.cache.delete(k) }
    }
    return missing.length - [...missing].filter(m => this.cache.has(m.k)).length
  }
  isSea(x0, z0, s) {
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) if (bilinear(base, x0 + s * i / 4, z0 + s * j / 4) > -6) return false
    return true
  }

  // One tile's mesh: a res x res grid plus a skirt round its edge.
  build(level, x0, z0) {
    const { size, res } = LEVELS[level]
    const step = size / res, n = res + 1
    const verts = n * n + 4 * n
    const pos = new Float32Array(verts * 3), col = new Float32Array(verts * 3)
    // heights with a one-vertex border, so slopes come from the grid itself (one height call a vertex)
    const nb = n + 2, hb = new Float32Array(nb * nb)
    const sink = level === 2 ? 0 : level === 1 ? 0.25 : 0.6
    for (let j = 0; j < nb; j++) for (let i = 0; i < nb; i++) hb[j * nb + i] = heightAt(x0 + (i - 1) * step, z0 + (j - 1) * step) - sink
    const hs = new Float32Array(n * n)
    let v = 0
    const nrm = [0, 1, 0]
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = x0 + i * step, z = z0 + j * step
      const k = (j + 1) * nb + i + 1, h = hb[k]
      hs[j * n + i] = h
      pos[v * 3] = i * step; pos[v * 3 + 1] = h; pos[v * 3 + 2] = j * step
      const hx = hb[k + 1] - hb[k - 1], hz = hb[k + nb] - hb[k - nb], l = Math.hypot(hx, 2 * step, hz)
      nrm[0] = -hx / l; nrm[1] = 2 * step / l; nrm[2] = -hz / l
      landColor(x, z, h + sink, nrm, col, v * 3, level)
      v++
    }
    // skirts: each edge vertex again, a few metres lower
    const drop = step * 1.2
    const edge = []
    for (let i = 0; i < n; i++) edge.push(i)                     // top row
    for (let j = 0; j < n; j++) edge.push(j * n + res)           // right column
    for (let i = res; i >= 0; i--) edge.push(res * n + i)        // bottom row
    for (let j = res; j >= 0; j--) edge.push(j * n)              // left column
    const skirtStart = v
    for (const e of edge) {
      pos[v * 3] = pos[e * 3]; pos[v * 3 + 1] = pos[e * 3 + 1] - drop; pos[v * 3 + 2] = pos[e * 3 + 2]
      col[v * 3] = col[e * 3] * 0.8; col[v * 3 + 1] = col[e * 3 + 1] * 0.8; col[v * 3 + 2] = col[e * 3 + 2] * 0.8
      v++
    }
    const idx = []
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1
      // alternate the diagonal for a less regular, more hand-made look
      if ((i + j) & 1) idx.push(a, c, b, b, c, d)
      else idx.push(a, c, d, a, d, b)
    }
    for (let k = 0; k < edge.length - 1; k++) {
      const a = edge[k], b = edge[k + 1], sa = skirtStart + k, sb = skirtStart + k + 1
      idx.push(a, b, sa, b, sb, sa)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v * 3), 3))
    g.setIndex(idx)
    g.computeBoundingSphere()
    const mesh = new THREE.Mesh(g, this.material)
    mesh.position.set(x0, 0, z0)
    mesh.receiveShadow = level === 2
    mesh.matrixAutoUpdate = false
    mesh.updateMatrix()
    mesh.userData.heights = level === 2 ? { hs, n, step, x0, z0 } : null
    return mesh
  }
}

function overlaps(a, b) {
  const sa = LEVELS[a.level].size, sb = LEVELS[b.level].size
  return a.x0 < b.x0 + sb && b.x0 < a.x0 + sa && a.z0 < b.z0 + sb && b.z0 < a.z0 + sa
}

// Far tiles use the coarse grid plus only the big bumps (cheaper than heightAt), sunk a little so near
// tiles never lose to them where both show.
function bilinearDetail(x, z, level) {
  return heightAt(x, z) - (level === 0 ? 0.6 : 0.25)
}

const tmp = [0, 0, 0]
// The colour of the land at (x, z): what grows there, how steep it is, a little noise so it is not flat paint.
export function landColor(x, z, h, nrm, out, o, level = 2) {
  const wl = waterLevel(x, z)
  let c
  const slope = 1 - nrm[1]
  const jit = hash2(Math.floor(x / 5), Math.floor(z / 5), 3) * 0.12 - 0.06
  if (wl > h + 0.1) {
    c = h < -4 ? C.seabed : C.dirt
    const d = Math.min(1, (wl - h) / 12)
    tmp[0] = c[0] * (1 - d * 0.5); tmp[1] = c[1] * (1 - d * 0.4); tmp[2] = c[2] * (1 - d * 0.2)
    c = tmp
  } else if (h < 2.8 && landShape(x, z) < 0.08) c = C.sand
  else {
    const f = forestAt(x, z, h)
    const fl = fieldAt(x, z)
    const flat = bilinear(flatMask, x, z) / 255
    if (fl && f < 0.4 && slope < 0.15) {
      c = [C.field1, C.field2, C.field3][fl - 1]
      // furrows
      if (fl !== 3 && ((Math.floor(x / 3) + Math.floor(z / 3)) & 1)) { tmp[0] = c[0] * 0.92; tmp[1] = c[1] * 0.92; tmp[2] = c[2] * 0.92; c = tmp }
    } else if (f > 0.45) c = mixc(C.grass, C.forest, Math.min(1, (f - 0.45) * 3))
    else c = mixc(C.grass, C.meadow, 0.5 + 0.5 * Math.sin(x * 0.011 + z * 0.007))
    if (flat > 0.6 && !fl) c = mixc(c, C.plateau, 0.4)
    if (slope > 0.32 || h > 640) c = mixc(c, h > 700 ? C.rock : C.rockDark, Math.min(1, (slope - 0.32) * 5 + Math.max(0, h - 640) / 60))
    if (h > 860) c = mixc(c, C.snow, Math.min(1, (h - 860) / 40))
  }
  out[o] = Math.max(0, c[0] + jit); out[o + 1] = Math.max(0, c[1] + jit); out[o + 2] = Math.max(0, c[2] + jit * 0.6)
}
const mix3 = [0, 0, 0]
function mixc(a, b, t) {
  t = Math.max(0, Math.min(1, t))
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
