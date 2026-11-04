// Low-poly vehicle models made in code. Frame: +z forward, +x left, +y up, origin on the ground under the
// middle. Moving parts are separate objects: wheels (they turn and steer), turret and gun (they aim),
// main and tail rotors and propellers (they spin), landing gear. Each model also returns its hull as boxes
// (for bullets and collisions) and points for lights, exhausts and the muzzle.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const C = {
  olive: [0.33, 0.37, 0.22], tan: [0.62, 0.55, 0.4], grey: [0.42, 0.44, 0.46], dark: [0.12, 0.12, 0.13], tyre: [0.08, 0.08, 0.09],
  glass: [0.2, 0.27, 0.33], light: [1, 0.95, 0.8], red: [0.75, 0.12, 0.1], white: [0.88, 0.88, 0.86], metal: [0.5, 0.5, 0.52],
  canvas: [0.4, 0.42, 0.28], wood: [0.5, 0.38, 0.25], navy: [0.35, 0.4, 0.46], orange: [0.85, 0.45, 0.12], black: [0.06, 0.06, 0.07],
}
export const PAINTS = { olive: C.olive, tan: C.tan, grey: C.grey, navy: C.navy, red: [0.7, 0.16, 0.12], blue: [0.18, 0.32, 0.58], white: C.white, green: [0.22, 0.42, 0.28], yellow: [0.85, 0.7, 0.15], black: [0.14, 0.14, 0.15], camo: [0.38, 0.4, 0.26] }

class G {
  constructor() { this.parts = [] }
  add(g, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    g = g.index ? g.toNonIndexed() : g
    if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz)
    g.translate(x, y, z)
    const n = g.attributes.position.count, c = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2] }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    g.deleteAttribute('uv'); g.deleteAttribute('normal')
    this.parts.push(g)
    return this
  }
  box(w, h, d, col, x, y, z, rx, ry, rz) { return this.add(new THREE.BoxGeometry(w, h, d), col, x, y, z, rx, ry, rz) }
  cyl(r, len, col, x, y, z, axis = 'z', seg = 10, r2 = r) {
    const g = new THREE.CylinderGeometry(r2, r, len, seg)
    return this.add(g, col, x, y, z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0)
  }
  // a wedge: a box whose top tapers (for hoods, windscreens, noses)
  wedge(w, h, d, col, x, y, z, front = 0.5, back = 0) {
    const g = new THREE.BoxGeometry(w, h, d)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { if (p.getZ(i) > 0) p.setZ(i, p.getZ(i) - d * front); else p.setZ(i, p.getZ(i) + d * back) }
    return this.add(g, col, x, y, z)
  }
  mesh(mat) { if (!this.parts.length) return null; const m = new THREE.Mesh(mergeGeometries(this.parts), mat); m.castShadow = true; return m }
}

export function buildVehicle(def, paint, mat) {
  const body = new G(), turret = new G(), gun = new G()
  const m = def.model, P = paint || C.olive
  const root = new THREE.Group()
  const out = { root, wheels: [], hull: [], turret: null, gun: null, rotors: [], lights: [], exhaust: [], muzzle: new THREE.Vector3(0, 2, 3), gear: null, props: [] }
  const hull = (x, y, z, hx, hy, hz) => out.hull.push({ x, y, z, hx, hy, hz })
  const wheel = (x, y, z, r, w, steer = false, track = false) => out.wheels.push({ x, y, z, r, w, steer, track })
  const [W, H, L] = def.size
  switch (m.body) {
    case 'sedan': case 'hatch': {
      const len = L, hatch = m.body === 'hatch'
      body.box(W, 0.55, len, P, 0, 0.7, 0)
      body.wedge(W - 0.1, 0.5, hatch ? len * 0.55 : len * 0.5, C.glass, 0, 1.22, hatch ? -0.25 : -0.15, 0.3, hatch ? 0.05 : 0.25)
      body.box(W - 0.2, 0.06, hatch ? len * 0.4 : len * 0.32, P, 0, 1.49, hatch ? -0.45 : -0.2)
      body.box(W * 0.9, 0.2, 0.08, C.dark, 0, 0.62, len / 2 + 0.02)
      for (const s of [-1, 1]) { body.box(0.25, 0.12, 0.05, C.light, s * (W / 2 - 0.25), 0.82, len / 2 + 0.02); body.box(0.25, 0.1, 0.05, C.red, s * (W / 2 - 0.25), 0.85, -len / 2 - 0.02) }
      for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) wheel(x * (W / 2 - 0.12), 0.33, z * (len / 2 - 0.75), 0.33, 0.22, z > 0)
      hull(0, 0.85, 0, W / 2, 0.55, len / 2)
      out.lights.push([0.5, 0.82, len / 2], [-0.5, 0.82, len / 2]); out.exhaust.push([0.5, 0.35, -len / 2])
      break
    }
    case 'pickup': {
      body.box(W, 0.6, L, P, 0, 0.9, 0)
      body.wedge(W - 0.05, 0.75, 2.0, C.glass, 0, 1.55, 0.7, 0.3, 0.05)
      body.box(W - 0.15, 0.08, 1.4, P, 0, 1.94, 0.55)
      body.box(W, 0.55, 0.1, P, 0, 1.45, -L / 2 + 0.05); for (const s of [-1, 1]) body.box(0.1, 0.5, 2.3, P, s * (W / 2 - 0.05), 1.45, -1.3)
      body.box(W * 0.85, 0.35, 0.1, C.dark, 0, 0.95, L / 2)
      body.box(W + 0.1, 0.12, 0.2, C.dark, 0, 0.62, L / 2 + 0.1)
      for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) wheel(x * (W / 2 - 0.1), 0.42, z * 1.6, 0.42, 0.28, z > 0)
      if (m.mg && m.gl) { turret.box(0.1, 0.9, 0.1, C.dark, 0, 1.75, -1.2); gun.box(0.3, 0.3, 0.6, C.olive, 0, 2.25, -1.0); gun.cyl(0.06, 0.6, C.dark, 0, 2.27, -0.4); gun.box(0.7, 0.45, 0.04, C.metal, 0, 2.3, -1.3); gun.cyl(0.12, 0.25, C.olive, 0.25, 2.2, -1.1, 'x'); out.gunPivot = [0, 2.25, -1.2] }
      else if (m.mg) { turret.box(0.1, 0.9, 0.1, C.dark, 0, 1.75, -1.2); gun.box(0.18, 0.2, 0.7, C.dark, 0, 2.25, -1.0); gun.cyl(0.03, 1.1, C.dark, 0, 2.27, -0.1); gun.box(0.7, 0.45, 0.04, C.metal, 0, 2.3, -1.25); out.gunPivot = [0, 2.25, -1.2] }
      hull(0, 1.1, 0.7, W / 2, 0.85, 1.4); hull(0, 0.95, -1.3, W / 2, 0.55, 1.3)
      out.lights.push([0.6, 1.0, L / 2], [-0.6, 1.0, L / 2]); out.exhaust.push([0.6, 0.4, -L / 2])
      break
    }
    case 'bike': {
      body.box(0.3, 0.35, 1.2, P, 0, 0.75, 0.05); body.box(0.25, 0.12, 0.6, C.dark, 0, 0.98, -0.25)
      body.box(0.12, 0.5, 0.12, C.metal, 0, 1.05, 0.7, -0.4); body.box(0.7, 0.04, 0.04, C.dark, 0, 1.3, 0.62)
      if (m.dirt) body.box(0.2, 0.06, 0.4, P, 0, 1.0, 0.9)
      wheel(0, 0.33, 0.75, 0.33, 0.12, true); wheel(0, 0.33, -0.7, 0.33, 0.14)
      hull(0, 0.8, 0, 0.25, 0.45, 1)
      out.lights.push([0, 1.0, 0.95]); out.exhaust.push([0.18, 0.4, -0.8])
      break
    }
    case 'quad': {
      body.box(0.9, 0.3, 1.4, P, 0, 0.65, 0); body.box(0.5, 0.15, 0.6, C.dark, 0, 0.88, -0.2); body.box(0.8, 0.05, 0.06, C.dark, 0, 1.05, 0.45)
      body.box(1.0, 0.08, 0.5, C.dark, 0, 0.85, 0.65); body.box(1.0, 0.08, 0.5, C.dark, 0, 0.85, -0.65)
      for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) wheel(x * 0.5, 0.3, z * 0.62, 0.3, 0.24, z > 0)
      hull(0, 0.7, 0, 0.55, 0.4, 1)
      break
    }
    case 'jeep': case 'mrap': {
      const big = m.body === 'mrap'
      body.box(W, big ? 1.4 : 0.75, L, P, 0, big ? 1.45 : 1.05, 0)
      body.wedge(W - 0.05, big ? 1.0 : 0.65, L * 0.62, P, 0, big ? 2.45 : 1.75, -0.2, 0.12, 0.02)
      for (const s of [-1, 1]) body.box(0.05, big ? 0.45 : 0.4, L * 0.45, C.glass, s * (W / 2 + 0.005), big ? 2.4 : 1.75, 0.1)
      body.box(W - 0.3, big ? 0.45 : 0.4, 0.05, C.glass, 0, big ? 2.45 : 1.8, L * 0.1 + L * 0.21)
      body.box(W + 0.1, 0.2, 0.25, C.dark, 0, big ? 0.85 : 0.65, L / 2 + 0.05)
      body.box(W * 0.7, big ? 0.6 : 0.4, 0.06, C.dark, 0, big ? 1.4 : 1.1, L / 2 + 0.01)
      if (big) { body.box(W + 0.15, 0.6, 0.8, P, 0, 0.75, -0.2); turret.cyl(0.55, 0.3, P, 0, 3.0, 0, 'y', 10); turret.box(1.0, 0.6, 0.06, P, 0, 3.35, 0.45); gun.box(0.18, 0.2, 0.8, C.dark, 0, 3.4, 0.2); gun.cyl(0.035, 1.1, C.dark, 0, 3.42, 1.05); out.gunPivot = [0, 3.4, 0] }
      // the armed utility vehicle: a ring mount and a heavy machine gun over the rear seats
      if (!big && m.mg) { turret.cyl(0.42, 0.12, C.dark, 0, 2.15, -0.5, 'y', 12); turret.box(0.08, 0.35, 0.08, C.dark, 0, 2.35, -0.5); gun.box(0.16, 0.2, 0.7, C.dark, 0, 2.6, -0.35); gun.cyl(0.03, 1.1, C.dark, 0, 2.62, 0.5); gun.box(0.6, 0.4, 0.04, C.metal, 0, 2.65, -0.05); out.gunPivot = [0, 2.6, -0.5] }
      const r = big ? 0.6 : 0.45
      for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) wheel(x * (W / 2 - 0.15), r, z * (L / 2 - (big ? 1.2 : 0.85)), r, big ? 0.4 : 0.32, z > 0)
      hull(0, big ? 1.8 : 1.3, 0, W / 2, big ? 1.1 : 0.7, L / 2)
      out.lights.push([0.7, big ? 1.3 : 1.05, L / 2], [-0.7, big ? 1.3 : 1.05, L / 2]); out.exhaust.push([0.8, 0.5, -L / 2])
      break
    }
    case 'truck': {
      body.box(W, 0.4, L, C.dark, 0, 1.0, 0)
      body.box(W, 1.3, 1.9, P, 0, 1.95, L / 2 - 1.05)
      body.box(W - 0.2, 0.55, 0.05, C.glass, 0, 2.25, L / 2 - 0.08)
      body.box(W * 0.9, 0.7, 0.1, C.dark, 0, 1.45, L / 2 + 0.02)
      if (m.tank) { body.cyl(1.05, L - 2.6, C.metal, 0, 2.3, -1.1, 'z', 14); body.box(0.3, 0.3, 0.3, C.red, 0, 3.4, -1) }
      else if (m.boxes) { for (let i = 0; i < 6; i++) body.box(0.9, 0.7, 0.9, C.olive, (i % 2 ? -0.6 : 0.6), 1.65 + Math.floor(i / 4) * 0.72, -0.5 - (Math.floor(i / 2) % 2) * 1.6); body.box(W, 0.4, L - 2.2, P, 0, 1.4, -1.1) }
      else if (m.ambulance) { body.box(W, 0.5, L - 2.1, P, 0, 1.5, -1.05); body.box(W + 0.05, 1.8, L - 2.2, C.white, 0, 2.6, -1.1); for (const s of [-1, 1]) { body.box(0.04, 0.9, 0.28, C.red, s * (W / 2 + 0.05), 2.7, -1.1); body.box(0.04, 0.28, 0.9, C.red, s * (W / 2 + 0.05), 2.7, -1.1) } body.box(0.9, 0.28, 0.04, C.red, 0, 2.7, -L / 2 + 0.03); body.box(0.28, 0.9, 0.04, C.red, 0, 2.7, -L / 2 + 0.03); body.box(0.3, 0.15, 0.3, [0.2, 0.4, 0.95], 0, 3.55, L / 2 - 1.2) }
      else { body.box(W, 0.5, L - 2.1, P, 0, 1.5, -1.05); if (m.cover) { body.box(W + 0.05, 1.5, L - 2.2, C.canvas, 0, 2.5, -1.1) } }
      for (const z of [L / 2 - 1.2, -0.9, -2.3]) for (const x of [1, -1]) wheel(x * (W / 2 - 0.2), 0.55, z, 0.55, 0.4, z > 1)
      hull(0, 1.9, L / 2 - 1.05, W / 2, 1.0, 0.95); hull(0, 1.8, -1.1, W / 2, 1.0, L / 2 - 1.1)
      out.lights.push([0.8, 1.4, L / 2], [-0.8, 1.4, L / 2]); out.exhaust.push([1.1, 2.9, L / 2 - 2])
      break
    }
    case 'apc': case 'recon': {
      const apc = m.body === 'apc'
      body.box(W, 1.4, L, P, 0, 1.4, 0)
      body.wedge(W, 0.8, 1.6, P, 0, 1.0, L / 2 + 0.3, 0, 0.6)
      body.box(W - 0.4, 0.3, L - 1.5, P, 0, 2.25, -0.3)
      for (const s of [-1, 1]) body.box(0.06, 0.25, 0.25, C.glass, s * (W / 2), 1.9, 1.5)
      if (apc) body.box(W - 0.6, 1.0, 0.1, C.dark, 0, 1.4, -L / 2)
      turret.box(1.4, 0.55, 1.6, P, 0, 2.7, apc ? 0.8 : 0); turret.box(0.8, 0.3, 0.6, P, 0, 3.0, apc ? 0.6 : -0.2)
      if (apc) { gun.box(0.2, 0.22, 0.8, C.dark, 0, 2.95, 1.3); gun.cyl(0.04, 1.2, C.dark, 0, 2.95, 2.3) }
      else { gun.cyl(0.08, 2.2, C.dark, 0, 2.75, 1.8); gun.box(0.3, 0.3, 0.6, P, 0, 2.75, 0.8) }
      out.gunPivot = [0, 2.75, apc ? 0.8 : 0]
      const axles = apc ? [2.6, 1.3, -1.3, -2.6] : [2.2, 0, -2.2]
      for (const z of axles) for (const x of [1, -1]) wheel(x * (W / 2 - 0.25), 0.6, z, 0.6, 0.45, z > 0)
      hull(0, 1.6, 0, W / 2, 1.0, L / 2)
      out.lights.push([0.9, 1.6, L / 2 + 0.5], [-0.9, 1.6, L / 2 + 0.5]); out.exhaust.push([1.2, 2.0, -L / 2 + 0.5])
      break
    }
    case 'ifv': case 'mbt': {
      const tank = m.body === 'mbt'
      body.box(W - 0.8, 1.0, L - 0.4, P, 0, 1.0, 0)
      body.wedge(W - 0.8, 0.6, 1.4, P, 0, 1.6, L / 2 - 0.6, 0.7, 0)
      body.box(W - 0.6, 0.5, L - 1.2, P, 0, 1.7, -0.3)
      for (const s of [-1, 1]) { body.box(0.6, 0.8, L, C.dark, s * (W / 2 - 0.3), 0.55, 0); body.box(0.7, 0.08, L - 0.2, P, s * (W / 2 - 0.3), 1.0, 0) }
      if (tank) {
        turret.box(2.3, 0.7, 3.0, P, 0, 2.3, -0.3); turret.wedge(2.3, 0.6, 1.2, P, 0, 2.25, 1.6, 0.4, 0); turret.box(1.0, 0.25, 1.2, P, 0, 2.75, -1.3); turret.cyl(0.25, 0.4, P, 0.6, 2.85, -0.4, 'y', 8)
        gun.cyl(0.13, 4.8, C.dark, 0, 2.35, 3.6, 'z', 10); gun.cyl(0.18, 0.7, P, 0, 2.35, 2.4, 'z', 10); gun.cyl(0.16, 0.4, C.dark, 0, 2.35, 5.4, 'z', 10)
        out.gunPivot = [0, 2.35, 1.2]
      } else if (m.aa) {
        turret.box(2.0, 0.8, 2.2, P, 0, 2.3, -0.2); turret.box(0.12, 0.7, 0.12, C.dark, 0, 3.0, -1.0); turret.box(1.2, 0.5, 0.06, C.dark, 0, 3.4, -1.0)
        for (const x of [-0.75, 0.75]) for (const y of [2.25, 2.55]) gun.cyl(0.035, 2.0, C.dark, x, y, 1.6)
        gun.box(1.7, 0.6, 0.6, P, 0, 2.4, 0.5)
        out.gunPivot = [0, 2.4, 0.4]
      } else {
        turret.box(1.8, 0.65, 2.1, P, -0.2, 2.25, 0.3); turret.wedge(1.8, 0.5, 0.7, P, -0.2, 2.2, 1.5, 0.4, 0)
        gun.cyl(0.06, 2.4, C.dark, -0.2, 2.35, 2.6); gun.box(0.25, 0.25, 0.5, P, -0.2, 2.35, 1.5)
        out.gunPivot = [-0.2, 2.35, 1.3]
      }
      for (const s of [-1, 1]) for (let i = 0; i < 6; i++) wheel(s * (W / 2 - 0.3), 0.4, -L / 2 + 0.8 + i * (L - 1.6) / 5, 0.4, 0.5, false, true)
      hull(0, 1.25, 0, W / 2, 0.9, L / 2); out.turretHull = { x: 0, y: 2.4, z: -0.2, hx: tank ? 1.15 : 0.9, hy: 0.4, hz: tank ? 1.6 : 1.1 }
      out.lights.push([0.8, 1.6, L / 2]); out.exhaust.push([0.8, 1.6, -L / 2])
      break
    }
    case 'uh': case 'ah': case 'lh': {
      const ah = m.body === 'ah', lh = m.body === 'lh'
      const len = lh ? 4.5 : ah ? 6.5 : 7.5, w = lh ? 1.4 : ah ? 1.1 : 2.4, h = lh ? 1.5 : ah ? 1.6 : 2.2
      body.box(w, h, len, P, 0, 1.6, 0.4)
      body.wedge(w, h * 0.9, 1.6, ah ? P : C.glass, 0, 1.55, len / 2 + 1.1, 0.6, 0)
      if (ah) { body.box(0.9, 0.6, 1.5, C.glass, 0, 2.6, 1.4); body.box(0.9, 0.55, 1.4, C.glass, 0, 2.2, 2.9); for (const s of [-1, 1]) { body.box(1.4, 0.1, 0.6, P, s * 1.0, 1.7, 0.4); body.cyl(0.18, 1.5, C.dark, s * 1.5, 1.45, 0.5) } }
      if (!ah && !lh) for (const s of [-1, 1]) body.box(0.05, 1.1, 1.6, C.dark, s * (w / 2 + 0.01), 1.6, 1.8)
      if (m.pods) for (const s of [-1, 1]) { body.box(1.3, 0.1, 0.7, P, s * (w / 2 + 0.6), 1.4, 0.1); body.cyl(0.2, 1.4, C.dark, s * (w / 2 + 1.05), 1.15, 0.2) }
      body.box(0.45, 0.5, len * 1.0, P, 0, 2.0, -len * 0.85)
      body.box(0.08, 1.2, 1.0, P, 0, 2.6, -len * 1.32)
      body.box(1.8, 0.06, 0.5, P, 0, 2.1, -len * 1.2)
      body.box(0.6, 0.5, 1.2, P, 0, 2.6 + (lh ? -0.2 : 0), 0.2)
      for (const s of [-1, 1]) { body.box(0.08, 0.08, len * 0.9, C.dark, s * (w / 2 + 0.25), 0.25, 0.4); body.box(0.06, 0.6, 0.06, C.dark, s * (w / 2 + 0.2), 0.55, 1.2); body.box(0.06, 0.6, 0.06, C.dark, s * (w / 2 + 0.2), 0.55, -0.6) }
      const rotor = new G(); const rr = def.rotor
      for (let i = 0; i < (ah ? 4 : lh ? 2 : 4); i++) rotor.box(0.35, 0.05, rr * 2, C.dark, 0, 0, 0, 0, i * Math.PI / (ah ? 4 : lh ? 2 : 4) * (ah || !lh ? 2 : 1), 0)
      rotor.cyl(0.18, 0.4, C.dark, 0, -0.1, 0, 'y', 8)
      const tail = new G(); tail.box(0.04, 1.4, 0.18, C.dark, 0, 0, 0); tail.box(0.04, 0.18, 1.4, C.dark, 0, 0, 0)
      out.rotorParts = { main: rotor, mainAt: [0, 3.0 + (lh ? -0.3 : 0), 0.2], tail, tailAt: [0.12, 2.6, -len * 1.32] }
      if (ah) { gun.cyl(0.04, 1.4, C.dark, 0, 0.95, 4.3); gun.box(0.3, 0.3, 0.4, C.dark, 0, 0.95, 3.6); out.gunPivot = [0, 0.95, 3.6] }
      if (!ah && !lh) for (const s of [-1, 1]) { const tg = new G(); tg.cyl(0.03, 0.9, C.dark, 0, 0, 0.4); tg.box(0.14, 0.14, 0.4, C.dark, 0, 0, 0); out.doorGuns = (out.doorGuns || []); out.doorGuns.push({ g: tg, at: [s * (w / 2 + 0.2), 1.7, 1.8], side: s }) }
      hull(0, 1.6, 0.6, w / 2 + 0.1, h / 2 + 0.1, len / 2 + 0.6); hull(0, 2.0, -len * 0.9, 0.3, 0.35, len * 0.5)
      out.lights.push([0, 0.8, len / 2 + 1])
      break
    }
    case 'cessna': {
      body.box(1.1, 1.2, 5.5, C.white, 0, 1.6, 0.3); body.wedge(1.0, 0.8, 1.6, C.glass, 0, 2.2, 1.3, 0.6, 0.3)
      body.box(11, 0.12, 1.5, C.white, 0, 2.55, 0.8); body.box(0.15, 1.3, 1.0, P, 0, 2.3, -3.9); body.box(3.2, 0.08, 0.8, C.white, 0, 1.75, -3.8)
      body.box(1.12, 0.12, 5.6, P, 0, 1.55, 0.3)
      const prop = new G(); prop.box(1.9, 0.12, 0.05, C.dark, 0, 0, 0); prop.cyl(0.12, 0.25, C.dark, 0, 0, 0)
      out.propParts = [{ g: prop, at: [0, 1.6, 3.2] }]
      const gear = new G(); for (const [x, z] of [[1, 0.6], [-1, 0.6], [0, 2.6]]) { gear.box(0.06, 0.9, 0.06, C.dark, x * 1.1 * (z > 1 ? 0 : 1), 0.75, z); gear.cyl(0.25, 0.15, C.tyre, x * 1.1 * (z > 1 ? 0 : 1), 0.25, z, 'x') }
      out.gearParts = gear
      hull(0, 1.6, 0.3, 0.6, 0.65, 3); hull(0, 2.55, 0.8, 5.5, 0.15, 0.75); hull(0, 2.2, -3.9, 1.6, 0.6, 0.5)
      out.lights.push([5.4, 2.55, 0.8], [-5.4, 2.55, 0.8])
      break
    }
    case 'c130': {
      body.cyl(2.3, 26, P, 0, 3.5, 0, 'z', 12); body.wedge(4.0, 2.6, 3.5, P, 0, 4.0, 13.5, 0.5, 0); body.box(1.6, 0.6, 1.4, C.glass, 0, 5.2, 12.2)
      body.box(40, 0.5, 4.5, P, 0, 6.2, 1.5); body.box(0.6, 6, 4.5, P, 0, 8.5, -12.5); body.box(14, 0.4, 3.5, P, 0, 6.5, -12.3)
      out.propParts = []
      for (const x of [-12, -6.5, 6.5, 12]) { body.cyl(0.9, 4.5, C.grey, x, 5.7, 3.8, 'z', 8); const pr = new G(); for (let i = 0; i < 4; i++) pr.box(0.35, 4.2, 0.08, C.dark, 0, 0, 0, 0, 0, i * Math.PI / 4); out.propParts.push({ g: pr, at: [x, 5.7, 6.2] }) }
      const gear = new G(); for (const [x, z] of [[2.2, 1], [-2.2, 1], [0, 10]]) { gear.box(0.3, 1.4, 0.3, C.dark, x, 1.0, z); gear.cyl(0.6, 0.5, C.tyre, x, 0.6, z, 'x') }
      out.gearParts = gear
      hull(0, 3.5, 0, 2.3, 2.3, 14); hull(0, 6.2, 1.5, 20, 0.4, 2.3)
      break
    }
    case 'fighter': case 'attackjet': {
      const a = m.body === 'attackjet'
      body.box(a ? 1.6 : 1.3, a ? 1.5 : 1.2, 12, P, 0, 2.2, 0); body.wedge(a ? 1.6 : 1.3, a ? 1.3 : 1.0, 3, P, 0, 2.1, 7.0, 0.9, 0)
      body.box(0.7, 0.5, 2.2, C.glass, 0, 3.0, 3.6)
      if (a) { body.box(17, 0.3, 3.0, P, 0, 2.0, 0.5); for (const s of [-1, 1]) body.cyl(0.65, 3.5, C.grey, s * 1.4, 3.1, -3.0, 'z', 10); body.box(6, 0.2, 1.8, P, 0, 2.6, -5.8); for (const s of [-1, 1]) body.box(0.2, 1.8, 1.4, P, s * 2.9, 3.2, -5.8) }
      else { body.wedge(10, 0.2, 5, P, 0, 2.0, -1.0, 0.6, 0); body.box(0.15, 2.0, 2.2, P, 0, 3.6, -5.2); body.box(5, 0.15, 1.6, P, 0, 2.2, -5.6); for (const s of [-1, 1]) body.box(0.8, 0.8, 2.6, C.dark, s * 0.9, 2.0, 2.6) }
      body.cyl(a ? 0.5 : 0.55, 1.0, C.dark, 0, 2.2, -6.4, 'z', 10)
      for (const s of [-1, 1]) { body.box(0.25, 0.25, 1.8, C.white, s * (a ? 4.5 : 3.6), 1.75, 0.6); body.box(0.25, 0.25, 1.8, C.white, s * (a ? 6 : 4.6), 1.75, 0.2) }
      const gear = new G(); for (const [x, z] of [[1.4, -0.5], [-1.4, -0.5], [0, 5]]) { gear.box(0.15, 1.4, 0.15, C.dark, x, 0.9, z); gear.cyl(0.35, 0.25, C.tyre, x, 0.35, z, 'x') }
      out.gearParts = gear
      hull(0, 2.2, 0.5, a ? 0.9 : 0.7, 0.8, 7.5); hull(0, 2.0, -1, a ? 8.5 : 5, 0.25, 2.5)
      out.exhaust.push([0, 2.2, -7])
      out.muzzle.set(0.5, 2.2, 7)
      break
    }
    case 'motorboat': case 'rhib': case 'patrolboat': case 'gunboat': {
      const big = m.body === 'gunboat', pb = m.body === 'patrolboat', rhib = m.body === 'rhib'
      const hc = rhib ? C.dark : P
      body.box(W, rhib ? 0.6 : big ? 3 : 1.2, L * 0.8, hc, 0, big ? 1.5 : 0.6, -L * 0.08)
      body.wedge(W, rhib ? 0.6 : big ? 3 : 1.2, L * 0.25, hc, 0, big ? 1.5 : 0.6, L * 0.42, 0.85, 0)
      if (rhib) for (const s of [-1, 1]) body.cyl(0.32, L * 0.85, C.orange, s * (W / 2 - 0.2), 0.75, 0, 'z', 8)
      if (pb || big) { body.box(W * 0.6, big ? 2.5 : 1.6, L * 0.25, C.white, 0, big ? 4.2 : 2.0, big ? 2 : 0.2); body.box(W * 0.62, 0.4, L * 0.05, C.glass, 0, big ? 5.0 : 2.5, big ? 2 + L * 0.12 : 0.2 + L * 0.12); body.box(0.15, big ? 4 : 2.5, 0.15, C.dark, 0, big ? 7 : 3.6, big ? 0 : -0.5) }
      if (m.body === 'motorboat') { body.wedge(W * 0.8, 0.6, 1.2, C.glass, 0, 1.4, 0.4, 0.5, 0); body.box(W - 0.3, 0.1, 2.5, C.white, 0, 1.2, -1.3) }
      if (big) { turret.box(2.2, 1.0, 2.6, P, 0, 3.6, 11); gun.cyl(0.09, 2.6, C.dark, 0, 3.8, 13.2); out.gunPivot = [0, 3.8, 11.4] }
      hull(0, big ? 2 : 0.8, 0, W / 2, big ? 2 : 0.8, L / 2)
      out.exhaust.push([0, 0.4, -L / 2])
      break
    }
  }
  const b = body.mesh(mat)
  if (b) root.add(b)
  out.body = b
  // turret and gun as their own pivots, so they can aim
  if (turret.parts.length || gun.parts.length) {
    const tp = out.gunPivot || [0, 2, 0]
    const tg = new THREE.Group(); tg.position.set(tp[0], 0, tp[2])
    const tm = turret.mesh(mat); if (tm) { tm.position.set(-tp[0], 0, -tp[2]); tg.add(tm) }
    const gg = new THREE.Group(); gg.position.set(0, tp[1], 0)
    const gm = gun.mesh(mat); if (gm) { gm.position.set(-tp[0], -tp[1], -tp[2]); gg.add(gm) }
    tg.add(gg); root.add(tg)
    out.turret = tg; out.gun = gg
    gg.updateMatrixWorld(true)
    if (gm) { gm.geometry.computeBoundingBox(); out.gunLength = gm.geometry.boundingBox.max.z - tp[2] }
  }
  // wheels
  for (const w of out.wheels) {
    const g = new G()
    if (w.track) g.box(w.w, w.r * 2, w.r * 2, C.tyre, 0, 0, 0)
    else { g.cyl(w.r, w.w, C.tyre, 0, 0, 0, 'x', 10); g.cyl(w.r * 0.55, w.w + 0.02, C.metal, 0, 0, 0, 'x', 6) }
    const mesh = g.mesh(mat)
    const piv = new THREE.Group(); piv.position.set(w.x, w.r, w.z); piv.add(mesh)
    root.add(piv); w.obj = piv; w.mesh = mesh
  }
  if (out.rotorParts) {
    const r = out.rotorParts
    const main = r.main.mesh(mat); main.position.set(...r.mainAt); root.add(main); out.rotors.push({ obj: main, axis: 'y', speed: 1 })
    const tail = r.tail.mesh(mat); tail.position.set(...r.tailAt); root.add(tail); out.rotors.push({ obj: tail, axis: 'x', speed: 3 })
    // a translucent disc that shows the rotor's blur at speed
    const disc = new THREE.Mesh(new THREE.CircleGeometry(def.rotor, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false }))
    disc.position.set(...r.mainAt); root.add(disc); out.disc = disc
  }
  if (out.propParts) for (const p of out.propParts) { const mesh = p.g.mesh(mat); mesh.position.set(...p.at); root.add(mesh); out.props.push(mesh) }
  if (out.gearParts) { out.gear = out.gearParts.mesh(mat); root.add(out.gear) }
  if (out.doorGuns) for (const d of out.doorGuns) { const mesh = d.g.mesh(mat); mesh.position.set(...d.at); mesh.rotation.y = d.side * 1.2; root.add(mesh); d.mesh = mesh }
  return out
}
