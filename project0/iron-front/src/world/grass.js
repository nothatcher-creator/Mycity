// Grass round the player: clumps of three blades in 16 m chunks, built a couple a frame as you move and
// dropped behind you. Each chunk is one merged mesh. Blades sway in the wind in the vertex shader and
// shrink into the ground towards the edge of the patch, so there is no line where grass stops. None on
// roads, water, sand, rock, in buildings or on the steepest slopes; less under trees; tall, golden stalks
// in the wheat fields.
import * as THREE from 'three'
import { heightAt, waterLevel, roadAt, forestAt, fieldAt, normalAt, landShape } from './heightfield.js'
import { isBuilt } from './places.js'
import { hash2 } from '../core/noise.js'
import { lin } from '../core/color.js'

const CH = 16

export class Grass {
  constructor(world, quality) {
    this.world = world
    this.group = new THREE.Group(); this.group.name = 'grass'
    world.add(this.group)
    this.chunks = new Map()
    this.time = { value: 0 }
    this.fade = { value: 50 }
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    this.mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = this.time; sh.uniforms.uFade = this.fade
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uFade; attribute float aTip;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  float d = length((viewMatrix * wp).xyz);
  float k = 1.0 - smoothstep(uFade * 0.65, uFade, d);
  // shrink towards the root (the blade's base is at its own y minus its height along aTip)
  transformed.y -= (1.0 - k) * aTip * 0.9;
  float w = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.27) * 0.6 + sin(uTime * 3.1 + wp.x * 1.3) * 0.25;
  transformed.x += w * 0.22 * aTip * k; transformed.z += w * 0.12 * aTip * k;
}`)
    }
    this.setQuality(quality)
  }
  setQuality(q) {
    this.on = q !== 'low'
    this.radius = q === 'high' ? 56 : 40
    this.density = q === 'high' ? 520 : 340
    this.fade.value = this.radius - 6
    for (const c of this.chunks.values()) this.drop(c)
    this.chunks.clear()
    this.group.visible = this.on
  }
  drop(c) { this.group.remove(c.mesh); c.mesh.geometry.dispose() }
  update(cx, cy, cz, dt, budget = 2) {
    this.time.value += dt
    if (!this.on) return
    // high above the ground (aircraft), no grass
    const high = cy - heightAt(cx, cz) > 60
    this.group.visible = !high
    if (high) return
    const R = this.radius, want = new Set(), todo = []
    const x0 = Math.floor((cx - R) / CH), x1 = Math.floor((cx + R) / CH), z0 = Math.floor((cz - R) / CH), z1 = Math.floor((cz + R) / CH)
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const mx = (i + 0.5) * CH, mz = (j + 0.5) * CH, d = Math.hypot(mx - cx, mz - cz)
      if (d > R + CH * 0.7) continue
      const k = i * 100000 + j
      want.add(k)
      if (!this.chunks.has(k)) todo.push({ k, i, j, d })
    }
    todo.sort((a, b) => a.d - b.d)
    for (const t of todo.slice(0, budget)) {
      const mesh = this.build(t.i, t.j)
      if (mesh) this.group.add(mesh)
      this.chunks.set(t.k, { mesh: mesh || { geometry: { dispose() {} } }, empty: !mesh })
    }
    for (const [k, c] of this.chunks) if (!want.has(k)) { if (!c.empty) this.drop(c); this.chunks.delete(k) }
  }
  build(i, j) {
    const ox = i * CH, oz = j * CH
    const pos = [], col = [], tip = []
    const n = this.density
    for (let k = 0; k < n; k++) {
      const x = ox + hash2(i * 977 + k, j, 21) * CH, z = oz + hash2(i, j * 613 + k, 22) * CH
      const h = heightAt(x, z)
      if (waterLevel(x, z) > h - 0.05 || h < 2.8 && landShape(x, z) < 0.08 || h > 620) continue
      const r = roadAt(x, z); if (r && r.d < r.w / 2 + 0.6) continue
      const nr = normalAt(x, z); if (nr[1] < 0.8) continue
      if (isBuilt(x, z, 0.5)) continue
      const f = forestAt(x, z, h), field = fieldAt(x, z)
      if (f > 0.55 && hash2(x | 0, z | 0, 23) < 0.55) continue
      const wheat = field === 1 || field === 3
      // the clump's colour: wheat gold or grass green, drier and lighter in patches
      const dry = 0.5 + 0.5 * Math.sin(x * 0.021 + z * 0.017) * Math.cos(z * 0.013 - x * 0.006)
      let c = wheat ? (field === 1 ? [0.82, 0.68, 0.3] : [0.55, 0.66, 0.26]) : f > 0.45 ? [0.24, 0.34, 0.14] : [0.36 + dry * 0.16, 0.5 + dry * 0.06, 0.2 + dry * 0.04]
      const v = 0.85 + hash2(x * 7 | 0, z * 7 | 0, 24) * 0.3
      const H = (wheat ? 0.66 : f > 0.45 ? 0.22 : 0.26) * (0.65 + hash2(k, i + j, 25) * 0.7)
      const yaw = hash2(k, j - i, 26) * 6.283
      for (let b = 0; b < 4; b++) {
        const a = yaw + b * 1.57 + hash2(k, b, 28) * 0.6, lean = 0.25 + hash2(k + b, i, 27) * 0.35
        const cx = Math.cos(a), sz = Math.sin(a), wdt = wheat ? 0.035 : 0.055
        const bx = x + cx * 0.06, bz = z + sz * 0.06
        // a triangle: two root corners and a tip leaning out
        pos.push(bx - sz * wdt, h - 0.03, bz + cx * wdt, bx + sz * wdt, h - 0.03, bz - cx * wdt, bx + cx * lean * H, h + H, bz + sz * lean * H)
        // roots the colour of the ground, tips lighter and drier
        for (const [s, t, y] of [[0.9, 0, 1], [0.9, 0, 1], [1.2, 1, 0.9]]) col.push(lin(c[0] * v * s / y), lin(c[1] * v * s), lin(c[2] * v * s * y)), tip.push(t * H)
      }
    }
    if (!pos.length) return null
    const g = new THREE.BufferGeometry()
    for (let q = 0; q < pos.length; q += 3) { pos[q] -= ox; pos[q + 2] -= oz }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1))
    // lit like the ground under it
    const nrm = new Float32Array(pos.length); for (let q = 1; q < nrm.length; q += 3) nrm[q] = 1
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
    g.computeBoundingSphere()
    const m = new THREE.Mesh(g, this.mat)
    m.position.set(ox, 0, oz)
    m.frustumCulled = true
    return m
  }
}
