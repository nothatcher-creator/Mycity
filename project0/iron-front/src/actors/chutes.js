// Parachute canopies: an arched canopy of panels in alternating olive and sand, with rigging lines down to
// the jumper's shoulders. One instanced mesh for everyone under a parachute; each opens out over half a
// second after the jump and sways a little as it glides.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const OLIVE = [0.36, 0.4, 0.24], SAND = [0.66, 0.6, 0.42], CORD = [0.15, 0.15, 0.14]

function canopyGeo() {
  const parts = []
  const add = (g, col) => {
    g = g.toNonIndexed()
    const n = g.attributes.position.count, c = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) c.set(col, i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(g)
  }
  // nine panels across an arch 7.6 m wide, 2.6 m deep (front to back), curving down at the ends
  const N = 9, R = 4.4
  for (let i = 0; i < N; i++) {
    const a = (i - (N - 1) / 2) / N * 2.0, x = Math.sin(a) * R, y = Math.cos(a) * R - R
    const g = new THREE.BoxGeometry(R * 2.0 / N * 1.04, 0.12, 2.6)
    g.rotateZ(-a); g.translate(x, y, 0)
    add(g, i % 2 ? SAND : OLIVE)
  }
  // rigging: from the canopy's edges down to the shoulders (about 6.4 m below)
  for (const a of [-1, -0.5, 0.5, 1]) for (const z of [-1.1, 1.1]) {
    const x0 = Math.sin(a) * R, y0 = Math.cos(a) * R - R, x1 = Math.sign(a) * 0.22, y1 = -6.4, z1 = 0
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z, L = Math.hypot(dx, dy, dz)
    const g = new THREE.BoxGeometry(0.018, L, 0.018)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize())
    g.applyQuaternion(q); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z + z1) / 2)
    add(g, CORD)
  }
  return mergeGeometries(parts)
}

export class Chutes {
  constructor(engine) {
    this.mesh = new THREE.InstancedMesh(canopyGeo(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 24)
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.castShadow = true
    engine.world.add(this.mesh)
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ'); this.p = new THREE.Vector3(); this.s = new THREE.Vector3()
    this.t = 0
  }
  update(dt, soldiers) {
    this.t += dt
    let n = 0
    for (const sol of soldiers) {
      if (!sol.parachute || sol.dead || n >= 24) continue
      const open = Math.min(1, (sol.chuteT || 0) / 0.5), k = 0.25 + 0.75 * open
      // lean into the turn a little and sway
      this.e.set(Math.sin(this.t * 1.3 + n) * 0.05, sol.yaw, Math.sin(this.t * 0.9 + n * 2) * 0.07)
      this.q.setFromEuler(this.e)
      this.p.set(0, 6.4 + 1.6, 0).applyQuaternion(this.q).add(sol.pos)
      this.s.set(k, 0.4 + 0.6 * open, k)
      this.m.compose(this.p, this.q, this.s); this.mesh.setMatrixAt(n++, this.m)
    }
    this.mesh.count = n
    if (n) this.mesh.instanceMatrix.needsUpdate = true
  }
}
