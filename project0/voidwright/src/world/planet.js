// A planet or moon: a sphere of rock shaped by noise, drawn as a cube-sphere quadtree (six faces, each
// split into ever smaller square patches near the camera, down to under a metre between points underfoot),
// with skirts hiding the steps between patch sizes, colours by height, slope and latitude, and a shell of
// air drawn from inside and out. The same height function gives the ground to stand and land on.
import * as THREE from 'three'
import { simplex3, fbm3, ridged3, craters } from '../core/noise3.js'
import { clamp, smooth } from '../core/noise.js'
import { lin } from '../core/color.js'
import { patchMaterial, ATMO_UNIFORMS } from './atmo-glsl.js'

const SEG = 32
const FACES = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
]
// octaves worth adding for features of wavelength `w` when points are `mw` apart
const oct = (w, mw, max) => clamp(Math.log2(w / Math.max(0.01, mw)) - 0.6, 0, max)

// ---- the shapes of the worlds ----
const KINDS = {
  // green and grey: rolling plains, dry lake beds, ranges of sharp mountains, snow up high and at the poles
  terra(P, x, y, z, mw) {
    const n = P.n
    const base = fbm3(n[0], x / 17000, y / 17000, z / 17000, oct(17000, mw, 4))
    const mask = smooth(-0.08, 0.42, fbm3(n[1], x / 11000 + 31, y / 11000, z / 11000, oct(11000, mw, 3)))
    let h = base * 520
    if (mask > 0) { const k = Math.round(oct(5200, mw, 6)); if (k > 0) { const r = ridged3(n[2], x / 4200, y / 4200, z / 4200, k); h += r * r * 1250 * mask } }
    h += fbm3(n[3], x / 1500, y / 1500, z / 1500, oct(1500, mw, 4)) * 110 * (0.35 + mask)
    if (mw < 120) h += fbm3(n[4], x / 190, y / 190, z / 190, oct(190, mw, 3)) * 11
    if (mw < 8) h += n[5](x / 11, y / 11, z / 11) * 0.7 * clamp(8 / mw - 1, 0, 1)
    if (h < -170) h = -170 + (h + 170) * 0.22
    return h
  },
  // grey dust and craters on craters; dark flat seas of old lava
  moon(P, x, y, z, mw) {
    const n = P.n, s = P.seed
    const mare = smooth(0.05, 0.35, fbm3(n[1], x / 7000, y / 7000, z / 7000, oct(7000, mw, 3)))
    let h = fbm3(n[0], x / 5000, y / 5000, z / 5000, oct(5000, mw, 4)) * 380 - mare * 90
    if (mw < 1200) h += craters(x / 2600, y / 2600, z / 2600, s, 0.55) * 380 * (1 - mare * 0.6)
    if (mw < 320) h += craters(x / 700, y / 700, z / 700, s + 9, 0.5) * 110
    if (mw < 80) h += craters(x / 170, y / 170, z / 170, s + 19, 0.45) * 26
    if (mw < 18) h += craters(x / 40, y / 40, z / 40, s + 29, 0.35) * 5
    if (mw < 60) h += fbm3(n[3], x / 120, y / 120, z / 120, oct(120, mw, 3)) * 5
    return h
  },
  // rust deserts: wide canyons, terraced mesas, dunes, a few big craters
  mars(P, x, y, z, mw) {
    const n = P.n, s = P.seed
    let h = fbm3(n[0], x / 15000, y / 15000, z / 15000, oct(15000, mw, 4)) * 900
    const cv = Math.abs(fbm3(n[1], x / 8000, y / 8000, z / 8000, oct(8000, mw, 3)))
    h -= smooth(0.09, 0.0, cv) * 850
    const mesa = fbm3(n[2], x / 2200, y / 2200, z / 2200, oct(2200, mw, 3)) * 420
    h += mesa > 60 ? 60 + Math.round((mesa - 60) / 90) * 90 * 0.8 + (mesa - 60) * 0.2 : mesa
    if (mw < 900) h += craters(x / 3200, y / 3200, z / 3200, s, 0.3) * 300
    if (mw < 100) h += Math.abs(n[3](x / 140, y / 220, z / 140)) * 12
    if (mw < 30) h += fbm3(n[4], x / 60, y / 60, z / 60, oct(60, mw, 3)) * 3
    return h
  },
  // white and pale blue: smooth sheets of ice, long dark cracks, pressure ridges
  ice(P, x, y, z, mw) {
    const n = P.n, s = P.seed
    let h = fbm3(n[0], x / 5200, y / 5200, z / 5200, oct(5200, mw, 4)) * 260
    const k = Math.round(oct(1600, mw, 4))
    if (k > 0) { const r = ridged3(n[1], x / 1600, y / 1600, z / 1600, k); h -= r ** 6 * 60; h += r ** 2 * 30 }
    if (mw < 500) h += craters(x / 1800, y / 1800, z / 1800, s, 0.25) * 120
    if (mw < 50) h += fbm3(n[3], x / 90, y / 90, z / 90, oct(90, mw, 3)) * 3
    return h
  },
}
// colours (display values; made linear at the end)
const COLS = {
  terra(P, x, y, z, h, slope, lat, out) {
    const v = P.n[6](x / 900, y / 900, z / 900), f = P.n[7](x / 140, y / 140, z / 140)
    let r = 0.34 + v * 0.05, g = 0.41 + v * 0.04, b = 0.22
    if (v + f * 0.4 > 0.25) { r = 0.24; g = 0.33; b = 0.18 }
    if (h < -150) { const k = smooth(-150, -172, h); r += (0.70 - r) * k; g += (0.64 - g) * k; b += (0.5 - b) * k }
    const rock = smooth(0.28, 0.5, slope + f * 0.06)
    r += (0.44 - r) * rock; g += (0.41 - g) * rock; b += (0.38 - b) * rock
    const snowLine = 820 + v * 220 - lat * 1000
    const snow = Math.max(smooth(snowLine, snowLine + 160, h), smooth(0.86, 0.9, lat + f * 0.02)) * (1 - smooth(0.45, 0.62, slope))
    r += (0.92 - r) * snow; g += (0.94 - g) * snow; b += (0.97 - b) * snow
    out[0] = r; out[1] = g; out[2] = b
  },
  moon(P, x, y, z, h, slope, lat, out) {
    const v = P.n[6](x / 1200, y / 1200, z / 1200), mare = smooth(0.05, 0.35, fbm3(P.n[1], x / 7000, y / 7000, z / 7000, 2))
    const g0 = 0.6 + v * 0.06 - mare * 0.26 + slope * 0.1
    out[0] = g0; out[1] = g0 * 0.98; out[2] = g0 * 0.95
  },
  mars(P, x, y, z, h, slope, lat, out) {
    const v = P.n[6](x / 700, y / 700, z / 700)
    let r = 0.66 + v * 0.06, g = 0.36 + v * 0.03, b = 0.22
    const rock = smooth(0.25, 0.5, slope)
    r += (0.42 - r) * rock; g += (0.27 - g) * rock; b += (0.2 - b) * rock
    if (h < -500) { const k = smooth(-500, -800, h); r += (0.5 - r) * k; g += (0.3 - g) * k; b += (0.24 - b) * k }
    const cap = smooth(0.88, 0.93, lat); r += (0.9 - r) * cap; g += (0.88 - g) * cap; b += (0.86 - b) * cap
    out[0] = r; out[1] = g; out[2] = b
  },
  ice(P, x, y, z, h, slope, lat, out) {
    const v = P.n[6](x / 600, y / 600, z / 600)
    const crack = smooth(-30, -50, h - fbm3(P.n[0], x / 5200, y / 5200, z / 5200, 3) * 260)
    out[0] = 0.86 + v * 0.04 - crack * 0.5; out[1] = 0.92 + v * 0.03 - crack * 0.35; out[2] = 0.98 - crack * 0.15
    if (slope > 0.4) { out[0] *= 0.8; out[1] *= 0.86 }
  },
}

let INDEX = null
function sharedIndex() {
  if (INDEX) return INDEX
  const W = SEG + 1, idx = []
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const a = j * W + i, b = a + 1, c = a + W + 1, d = a + W
    idx.push(a, b, c, a, c, d)
  }
  // skirts: one ring of extra points below each edge, joined to the edge
  const base = W * W
  const edges = [[0, 1, 0], [SEG, 0, 1], [SEG * W + SEG, -1, 0], [SEG * W, 0, -1]]
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k < SEG; k++) {
      const [s, di, dj] = edges[e], a = s + (di + dj * W) * k, b = a + di + dj * W
      const sa = base + e * SEG + k, sb = base + ((e * SEG + k + 1) % (4 * SEG))
      idx.push(b, a, sa, b, sa, sb)
    }
  }
  INDEX = new THREE.BufferAttribute(new Uint16Array(idx), 1)
  return INDEX
}

export class Planet {
  constructor(def, engine) {
    this.def = def
    Object.assign(this, { id: def.id, name: def.name, R: def.R, g0: def.g, seed: def.seed, kind: def.kind })
    this.center = new THREE.Vector3(...def.center)
    this.n = []
    for (let i = 0; i < 8; i++) this.n.push(simplex3(def.seed * 13 + i * 101))
    this.hfn = KINDS[def.kind]; this.cfn = COLS[def.kind]
    this.relief = def.relief || 3000
    this.atmo = def.atmo || null
    this.AR = this.atmo ? this.R + this.atmo.height : this.R
    this.faceArc = this.R * Math.PI / 2
    this.maxLevel = Math.ceil(Math.log2(this.faceArc / 24))
    this.engine = engine
    this.group = new THREE.Group(); this.group.name = def.name
    this.track = engine.track(this.group, this.center)
    this.uniforms = {
      uPC: { value: new THREE.Vector3() }, uPR: { value: this.R }, uAR: { value: this.AR }, uDen: { value: this.atmo ? this.atmo.density : 0 },
      uSunD: { value: new THREE.Vector3(0, 1, 0) }, uDay: { value: new THREE.Color(...(this.atmo?.day || [0, 0, 0])) }, uDusk: { value: new THREE.Color(...(this.atmo?.dusk || [0, 0, 0])) },
      uHaze: { value: this.atmo ? 1 : 0 }, uDetail: { value: engine.detailTex },
    }
    this.mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), this.uniforms, { detail: true })
    this.roots = FACES.map((f, i) => this.node(i, 0, -1, -1, 2))
    this.queue = []
    this.built = 0
    this.tmp = [0, 0, 0]
    if (this.atmo) this.makeSky()
  }
  node(face, level, a0, b0, size) { return { face, level, a0, b0, size, children: null, mesh: null, want: false, lastUsed: 0, queued: false, center: null } }
  // ---- the ground ----
  height(x, y, z, mw = 0.6) {
    // x, y, z: a direction (any length); the height is for the ground point under it
    const L = Math.sqrt(x * x + y * y + z * z), R = this.R / L
    return this.hfn(this, x * R, y * R, z * R, mw)
  }
  // signed distance of a system point above the ground (approximate on steep slopes)
  sdf(p) {
    const dx = p.x - this.center.x, dy = p.y - this.center.y, dz = p.z - this.center.z
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (r - this.R > this.relief + 50) return r - this.R - this.relief
    return r - this.R - this.height(dx, dy, dz)
  }
  // ground facts under a system point: height above it, the ground's normal, the up direction
  surface(p, out = {}) {
    const dx = p.x - this.center.x, dy = p.y - this.center.y, dz = p.z - this.center.z
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz), ux = dx / r, uy = dy / r, uz = dz / r
    const h = this.height(ux, uy, uz)
    // two tangents and the slope along each (half a metre)
    let tx = -uz, ty = 0, tz = ux; if (Math.abs(uy) > 0.9) { tx = 1; ty = 0; tz = 0 }
    let tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl
    const bx = uy * tz - uz * ty, by = uz * tx - ux * tz, bz = ux * ty - uy * tx
    const e = 0.5, k = e / this.R
    const h1 = this.height(ux + tx * k, uy + ty * k, uz + tz * k), h2 = this.height(ux + bx * k, uy + by * k, uz + bz * k)
    const gx = (h1 - h) / e, gy = (h2 - h) / e
    const nx = ux - tx * gx - bx * gy, ny = uy - ty * gx - by * gy, nz = uz - tz * gx - bz * gy
    const nl = Math.hypot(nx, ny, nz)
    out.alt = r - this.R - h; out.h = h; out.r = r
    out.nx = nx / nl; out.ny = ny / nl; out.nz = nz / nl; out.ux = ux; out.uy = uy; out.uz = uz
    return out
  }
  // gravity at a system point (m/s^2), added into `out`; full strength at the surface falling off as 1/r^2,
  // fading to nothing between 1.75 and 2.3 radii (as in most of these games: no endless pull)
  gravity(p, out) {
    const dx = this.center.x - p.x, dy = this.center.y - p.y, dz = this.center.z - p.z
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const rr = Math.max(r, this.R)
    let g = this.g0 * (this.R / rr) ** 2
    g *= 1 - smooth(1.75 * this.R, 2.3 * this.R, r)
    if (g > 0) { out.x += dx / r * g; out.y += dy / r * g; out.z += dz / r * g }
    return g
  }
  // air density (1 at the surface, 0 above the atmosphere)
  air(p) {
    if (!this.atmo) return 0
    const r = p.distanceTo(this.center), alt = r - this.R
    return clamp(1 - alt / (this.atmo.height * 0.82), 0, 1) ** 1.4
  }
  // ---- the patches ----
  dir(face, a, b, out) {
    const [N, U, V] = FACES[face]
    a = Math.tan(a * Math.PI / 4); b = Math.tan(b * Math.PI / 4)
    const x = N[0] + U[0] * a + V[0] * b, y = N[1] + U[1] * a + V[1] * b, z = N[2] + U[2] * a + V[2] * b
    const l = Math.sqrt(x * x + y * y + z * z)
    out[0] = x / l; out[1] = y / l; out[2] = z / l
    return out
  }
  nodeCenter(nd) {
    if (nd.center) return nd.center
    const d = this.dir(nd.face, nd.a0 + nd.size / 2, nd.b0 + nd.size / 2, [0, 0, 0])
    const h = this.height(d[0], d[1], d[2], nd.size * this.faceArc / 2 / SEG)
    nd.center = new THREE.Vector3(d[0], d[1], d[2]).multiplyScalar(this.R + h)
    nd.arc = nd.size * this.faceArc / 2
    return nd.center
  }
  build(nd) {
    const W = SEG + 1, E = SEG + 3, mw = nd.arc / SEG
    const P = new Float64Array(E * E * 3), D = new Float64Array(E * E * 3), H = new Float64Array(E * E)
    const d = [0, 0, 0]
    for (let j = -1; j <= SEG + 1; j++) for (let i = -1; i <= SEG + 1; i++) {
      this.dir(nd.face, nd.a0 + nd.size * i / SEG, nd.b0 + nd.size * j / SEG, d)
      const h = this.hfn(this, d[0] * this.R, d[1] * this.R, d[2] * this.R, mw), r = this.R + h, k = ((j + 1) * E + (i + 1))
      P[k * 3] = d[0] * r; P[k * 3 + 1] = d[1] * r; P[k * 3 + 2] = d[2] * r
      D[k * 3] = d[0]; D[k * 3 + 1] = d[1]; D[k * 3 + 2] = d[2]; H[k] = h
    }
    const c = nd.center, n = W * W + 4 * SEG
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), loc = new Float32Array(n * 3)
    const bx = Math.floor(c.x / 4096) * 4096, by = Math.floor(c.y / 4096) * 4096, bz = Math.floor(c.z / 4096) * 4096
    const cc = this.tmp
    for (let j = 0; j <= SEG; j++) for (let i = 0; i <= SEG; i++) {
      const k = (j + 1) * E + (i + 1), o = (j * W + i) * 3
      const l = k - 1, r = k + 1, dn = k - E, up = k + E
      const ax = P[r * 3] - P[l * 3], ay = P[r * 3 + 1] - P[l * 3 + 1], az = P[r * 3 + 2] - P[l * 3 + 2]
      const vx = P[up * 3] - P[dn * 3], vy = P[up * 3 + 1] - P[dn * 3 + 1], vz = P[up * 3 + 2] - P[dn * 3 + 2]
      let nx = ay * vz - az * vy, ny = az * vx - ax * vz, nz = ax * vy - ay * vx
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl
      const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2]
      pos[o] = x - c.x; pos[o + 1] = y - c.y; pos[o + 2] = z - c.z
      nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz
      loc[o] = x - bx; loc[o + 1] = y - by; loc[o + 2] = z - bz
      const slope = 1 - (nx * D[k * 3] + ny * D[k * 3 + 1] + nz * D[k * 3 + 2])
      this.cfn(this, x, y, z, H[k], slope * 1.6, Math.abs(D[k * 3 + 1]), cc)
      col[o] = lin(cc[0]); col[o + 1] = lin(cc[1]); col[o + 2] = lin(cc[2])
    }
    // the skirts, hanging below the edges
    const depth = mw * 3 + 2
    const edges = [[0, 1, 0], [SEG, 0, 1], [SEG * W + SEG, -1, 0], [SEG * W, 0, -1]]
    for (let e = 0; e < 4; e++) for (let k = 0; k < SEG; k++) {
      const [s, di, dj] = edges[e], a = s + (di + dj * W) * k, o = (W * W + e * SEG + k) * 3, ao = a * 3
      const i = a % W, j = Math.floor(a / W), kk = (j + 1) * E + (i + 1)
      pos[o] = pos[ao] - D[kk * 3] * depth; pos[o + 1] = pos[ao + 1] - D[kk * 3 + 1] * depth; pos[o + 2] = pos[ao + 2] - D[kk * 3 + 2] * depth
      nor[o] = nor[ao]; nor[o + 1] = nor[ao + 1]; nor[o + 2] = nor[ao + 2]
      col[o] = col[ao]; col[o + 1] = col[ao + 1]; col[o + 2] = col[ao + 2]
      loc[o] = loc[ao]; loc[o + 1] = loc[ao + 1]; loc[o + 2] = loc[ao + 2]
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aLocal', new THREE.BufferAttribute(loc, 3))
    g.setIndex(sharedIndex())
    g.computeBoundingSphere()
    const m = new THREE.Mesh(g, this.mat)
    m.position.copy(c); m.matrixAutoUpdate = false; m.updateMatrix()
    m.visible = false
    this.group.add(m)
    nd.mesh = m
    this.built++
  }
  // ---- choosing patches round the camera ----
  update(cam, now, detail = 1) {
    const lc = this.lc || (this.lc = new THREE.Vector3())
    lc.copy(cam).sub(this.center)
    this.camAlt = lc.length() - this.R
    this.now = now; this.detailK = 2.25 * detail
    for (const r of this.roots) this.visit(r, lc)
    // the uniforms the shaders use (scene coordinates)
    this.engine.rel(this.center, this.uniforms.uPC.value)
    if (this.sky) { this.sky.u.uPC.value.copy(this.uniforms.uPC.value); this.sky.u.uSunD.value.copy(this.uniforms.uSunD.value) }
  }
  visit(nd, lc) {
    nd.lastUsed = this.now
    const c = this.nodeCenter(nd)
    const d = c.distanceTo(lc)
    const split = nd.level < this.maxLevel && d < nd.arc * this.detailK
    if (split) {
      if (!nd.children) {
        const h = nd.size / 2
        nd.children = [this.node(nd.face, nd.level + 1, nd.a0, nd.b0, h), this.node(nd.face, nd.level + 1, nd.a0 + h, nd.b0, h),
          this.node(nd.face, nd.level + 1, nd.a0, nd.b0 + h, h), this.node(nd.face, nd.level + 1, nd.a0 + h, nd.b0 + h, h)]
      }
      let all = true
      for (const ch of nd.children) if (!this.visit(ch, lc)) all = false
      if (all) { if (nd.mesh) nd.mesh.visible = false; return true }
      for (const ch of nd.children) this.hide(ch)
      if (nd.mesh) { nd.mesh.visible = true; return true }
      // no need to build this patch only to cover the wait for its children: an ancestor covers it
      if (nd.level === 0) this.request(nd, d)
      return false
    }
    if (nd.children) { for (const ch of nd.children) this.hide(ch); if (this.now - (nd.splitAt || 0) > 4) this.prune(nd) }
    if (nd.children) nd.splitAt = nd.splitAt || this.now; else nd.splitAt = 0
    if (nd.mesh) { nd.mesh.visible = true; return true }
    this.request(nd, d); return false
  }
  hide(nd) { if (nd.mesh) nd.mesh.visible = false; if (nd.children) for (const c of nd.children) this.hide(c) }
  prune(nd) {
    for (const c of nd.children) { if (c.children) this.prune(c); this.free(c) }
    nd.children = null; nd.splitAt = 0
  }
  free(nd) { if (nd.mesh) { nd.mesh.geometry.dispose(); this.group.remove(nd.mesh); nd.mesh = null } }
  request(nd, d) { if (!nd.queued) { nd.queued = true; this.queue.push(nd) } nd.prio = d / nd.arc - nd.level * 0.01 }
  // builds the most wanted patches for up to `ms` milliseconds
  work(ms) {
    if (!this.queue.length) return 0
    const t0 = performance.now()
    this.queue.sort((a, b) => a.prio - b.prio)
    let n = 0
    while (this.queue.length && performance.now() - t0 < ms) {
      const nd = this.queue.shift(); nd.queued = false
      if (this.now - nd.lastUsed > 0.5 || nd.mesh) continue
      this.build(nd); n++
    }
    return n
  }
  get pending() { return this.queue.length }
  // ---- the air, seen from inside and out ----
  makeSky() {
    const a = this.atmo
    const u = {
      uPC: { value: new THREE.Vector3() }, uPR: { value: this.R }, uAR: { value: this.AR }, uDen: { value: a.density },
      uSunD: { value: new THREE.Vector3(0, 1, 0) }, uDay: { value: new THREE.Color(...a.day) }, uDusk: { value: new THREE.Color(...a.dusk) },
      uHaze: { value: 1 }, uGain: { value: a.gain || 1 },
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: u, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `varying vec3 vW; uniform float uGain;${ATMO_UNIFORMS}
        void main() {
          vec3 ro = cameraPosition - uPC, rd = normalize(vW - cameraPosition);
          vec2 ta = vwSphere(ro, rd, uAR), tp = vwSphere(ro, rd, uPR * 0.999);
          float t0 = max(ta.x, 0.0), t1 = ta.y;
          if (tp.x > 0.0) t1 = min(t1, tp.x);
          if (t1 <= t0) discard;
          float seg = (t1 - t0) / 6.0, H = (uAR - uPR) * 0.22, od = 0.0;
          vec3 acc = vec3(0.0); float tot = 0.0;
          for (int i = 0; i < 6; i++) {
            vec3 p = ro + rd * (t0 + seg * (float(i) + 0.5)); float r = length(p);
            float dn = exp(-max(0.0, r - uPR) / H); float sh = dot(p / r, uSunD);
            float lit = smoothstep(-0.2, 0.06, sh);
            vec3 c = mix(uDusk, uDay, smoothstep(-0.02, 0.32, sh));
            float w = dn * seg * uDen;
            acc += c * lit * w * exp(-od * 0.5); tot += w; od += w;
          }
          float mu = max(dot(rd, uSunD), 0.0);
          vec3 col = acc / max(tot, 1e-6) * (1.0 - exp(-tot * 11.0 * uGain)) * 1.15;
          col *= 1.0 + 1.6 * pow(mu, 12.0) + 0.4 * pow(mu, 3.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
    const m = new THREE.Mesh(new THREE.SphereGeometry(this.AR, 96, 48), mat)
    m.frustumCulled = false
    m.renderOrder = -1
    this.group.add(m)
    this.sky = { mesh: m, u }
  }
  setSun(dir) { this.uniforms.uSunD.value.copy(dir) }
  dispose() { for (const r of this.roots) { if (r.children) this.prune(r); this.free(r) } this.engine.untrack(this.track) }
}
