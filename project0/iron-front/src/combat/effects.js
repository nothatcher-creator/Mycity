// Visual effects: particles (two pools: smoke, dust and debris blend normally; fire, sparks and flashes
// add light), tracers, bullet holes. Each pool is one instanced draw; particles are billboards turned to
// the camera in the vertex shader. Everything is in island coordinates (children of the world group).
import * as THREE from 'three'

function softTexture() {
  const c = new OffscreenCanvas(64, 64), g = c.getContext('2d')
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r; g.fillRect(0, 0, 64, 64)
  // a few lumps so smoke is not a perfect disc
  for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, d = 12 + (i % 3) * 3; const q = g.createRadialGradient(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 0, 32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 13); q.addColorStop(0, 'rgba(255,255,255,0.35)'); q.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = q; g.fillRect(0, 0, 64, 64) }
  const t = new THREE.CanvasTexture(c)
  return t
}
const vert = `
attribute vec4 pcol; attribute vec2 psize; attribute float prot;
varying vec4 vCol; varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv; vCol = pcol;
  vec4 mv = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
  float c = cos(prot), s = sin(prot);
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * psize;
  mv.xy += p;
  vec4 mvPosition = mv;
  gl_Position = projectionMatrix * mv;
  #include <fog_vertex>
}`
const frag = `
uniform sampler2D map; varying vec4 vCol; varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(vCol.rgb, vCol.a * t.a);
  if (gl_FragColor.a < 0.01) discard;
  #include <fog_fragment>
}`

class Pool {
  constructor(world, n, additive, tex) {
    this.n = n
    const g = new THREE.PlaneGeometry(1, 1)
    this.col = new Float32Array(n * 4); this.size = new Float32Array(n * 2); this.rot = new Float32Array(n)
    g.setAttribute('pcol', new THREE.InstancedBufferAttribute(this.col, 4))
    g.setAttribute('psize', new THREE.InstancedBufferAttribute(this.size, 2))
    g.setAttribute('prot', new THREE.InstancedBufferAttribute(this.rot, 1))
    const m = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: tex } }]),
    })
    m.uniforms.map.value = tex
    this.mesh = new THREE.InstancedMesh(g, m, n)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = additive ? 6 : 5
    this.mesh.count = 0
    world.add(this.mesh)
    // per particle state
    this.p = []
    for (let i = 0; i < n; i++) this.p.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s0: 1, s1: 1, r: 1, g: 1, b: 1, a: 1, grav: 0, drag: 0, spin: 0, rot: 0, fadeIn: 0 })
    this.next = 0
  }
  spawn(o) {
    const q = this.p[this.next]; this.next = (this.next + 1) % this.n
    q.alive = true; q.age = 0
    q.x = o.x; q.y = o.y; q.z = o.z; q.vx = o.vx || 0; q.vy = o.vy || 0; q.vz = o.vz || 0
    q.life = o.life || 1; q.s0 = o.s0 ?? o.size ?? 1; q.s1 = o.s1 ?? q.s0
    q.r = o.r ?? 1; q.g = o.g ?? 1; q.b = o.b ?? 1; q.a = o.a ?? 1
    q.grav = o.grav || 0; q.drag = o.drag || 0; q.spin = o.spin || 0; q.rot = o.rot ?? Math.random() * 6.28; q.fadeIn = o.fadeIn || 0
    q.stretch = o.stretch || 0
    return q
  }
  update(dt) {
    let k = 0
    const m4 = _m
    for (const q of this.p) {
      if (!q.alive) continue
      q.age += dt
      if (q.age >= q.life) { q.alive = false; continue }
      q.vy -= q.grav * dt
      const dr = Math.max(0, 1 - q.drag * dt)
      q.vx *= dr; q.vy *= dr; q.vz *= dr
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt
      q.rot += q.spin * dt
      const t = q.age / q.life
      m4.makeTranslation(q.x, q.y, q.z)
      this.mesh.setMatrixAt(k, m4)
      const s = q.s0 + (q.s1 - q.s0) * t
      this.size[k * 2] = s; this.size[k * 2 + 1] = s * (1 + q.stretch)
      const fade = (q.fadeIn ? Math.min(1, t / q.fadeIn) : 1) * (1 - t * t)
      this.col[k * 4] = q.r; this.col[k * 4 + 1] = q.g; this.col[k * 4 + 2] = q.b; this.col[k * 4 + 3] = q.a * fade
      this.rot[k] = q.rot
      k++
    }
    this.mesh.count = k
    this.mesh.instanceMatrix.needsUpdate = true
    const g = this.mesh.geometry
    g.attributes.pcol.needsUpdate = true; g.attributes.psize.needsUpdate = true; g.attributes.prot.needsUpdate = true
  }
}
const _m = new THREE.Matrix4()

export class Effects {
  constructor(world, quality = 'medium') {
    this.world = world
    const tex = softTexture()
    this.smoke = new Pool(world, quality === 'low' ? 500 : 1100, false, tex)
    this.glow = new Pool(world, quality === 'low' ? 400 : 900, true, tex)
    // tracers: thin glowing boxes stretched along their flight
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
    this.tracers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5), this.tracerMat, 256)
    this.tracers.count = 0; this.tracers.frustumCulled = false; this.tracers.renderOrder = 7
    this.tracers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(256 * 3), 3)
    world.add(this.tracers)
    // bullet holes and scorch marks
    this.decalMat = new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
    this.decals = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 6), this.decalMat, 500)
    this.decals.count = 0; this.decals.frustumCulled = false
    world.add(this.decals)
    this.decalNext = 0
    this.tracerList = []
    this.smokeClouds = []      // smoke grenades: { x, y, z, r, t } (block sight for the AI)
  }
  // ---- building blocks ----
  puff(x, y, z, o = {}) { return this.smoke.spawn({ x, y, z, ...o }) }
  flash(x, y, z, o = {}) { return this.glow.spawn({ x, y, z, ...o }) }
  // ---- effects ----
  muzzle(x, y, z, dx, dy, dz, big = 1, suppressed = false) {
    if (!suppressed) {
      this.flash(x, y, z, { size: 0.35 * big, s1: 0.5 * big, life: 0.05, r: 1, g: 0.75, b: 0.35, a: 1 })
      for (let i = 0; i < 2; i++) this.flash(x + dx * 0.15 * (i + 1), y + dy * 0.15 * (i + 1), z + dz * 0.15 * (i + 1), { size: 0.22 * big, life: 0.04, r: 1, g: 0.6, b: 0.2, a: 0.8, stretch: 1.5 })
    }
    this.puff(x + dx * 0.2, y + dy * 0.2, z + dz * 0.2, { vx: dx * 1.5 + (Math.random() - 0.5) * 0.4, vy: dy * 1.5 + 0.3, vz: dz * 1.5, s0: 0.15 * big, s1: 0.9 * big, life: 0.8, r: 0.85, g: 0.85, b: 0.83, a: suppressed ? 0.15 : 0.35, drag: 2.5 })
  }
  impact(x, y, z, nx, ny, nz, fx, color) {
    const n = 5
    if (fx === 'sparks') {
      for (let i = 0; i < 8; i++) this.flash(x, y, z, { vx: nx * 3 + (Math.random() - 0.5) * 6, vy: ny * 3 + Math.random() * 4, vz: nz * 3 + (Math.random() - 0.5) * 6, size: 0.06, life: 0.25 + Math.random() * 0.2, r: 1, g: 0.8, b: 0.4, grav: 9.8, stretch: 2 })
      this.puff(x, y, z, { vx: nx, vy: ny + 0.4, vz: nz, s0: 0.1, s1: 0.5, life: 0.6, r: 0.6, g: 0.6, b: 0.62, a: 0.4, drag: 2 })
    } else if (fx === 'glass') {
      for (let i = 0; i < 10; i++) this.puff(x, y, z, { vx: (Math.random() - 0.5) * 3 - nx, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 3 - nz, size: 0.06, life: 0.9, r: 0.8, g: 0.9, b: 1, a: 0.85, grav: 9.8, spin: 8 })
    } else if (fx === 'hit') {
      for (let i = 0; i < 3; i++) this.puff(x, y, z, { vx: nx * 0.6 + (Math.random() - 0.5), vy: 0.3 + Math.random() * 0.5, vz: nz * 0.6 + (Math.random() - 0.5), s0: 0.1, s1: 0.35, life: 0.4, r: 0.55, g: 0.05, b: 0.04, a: 0.55, drag: 3 })
    } else if (fx === 'water') {
      for (let i = 0; i < 6; i++) this.puff(x, y, z, { vx: (Math.random() - 0.5) * 1.2, vy: 2.5 + Math.random() * 2.5, vz: (Math.random() - 0.5) * 1.2, s0: 0.12, s1: 0.3, life: 0.7, r: 0.85, g: 0.92, b: 1, a: 0.8, grav: 9.8 })
    } else {
      // dust, chips, dirt, splinters: a puff in the colour of the material and a few bits
      const c = color || [0.5, 0.45, 0.4]
      this.puff(x, y, z, { vx: nx * 1.2, vy: ny * 1.2 + 0.3, vz: nz * 1.2, s0: 0.15, s1: fx === 'dirt' ? 1.0 : 0.6, life: fx === 'dirt' ? 1.1 : 0.8, r: c[0], g: c[1], b: c[2], a: 0.6, drag: 2.5 })
      for (let i = 0; i < n; i++) this.puff(x, y, z, { vx: nx * 3 + (Math.random() - 0.5) * 3, vy: ny * 3 + Math.random() * 3, vz: nz * 3 + (Math.random() - 0.5) * 3, size: 0.05, life: 0.6, r: c[0] * 0.7, g: c[1] * 0.7, b: c[2] * 0.7, a: 1, grav: 9.8, spin: 6 })
    }
  }
  decal(x, y, z, nx, ny, nz, size = 0.06) {
    const i = this.decalNext; this.decalNext = (i + 1) % 500
    _q.setFromUnitVectors(_z, _n.set(nx, ny, nz))
    _mm.compose(_p.set(x + nx * 0.01, y + ny * 0.01, z + nz * 0.01), _q, _s.set(size, size, size))
    this.decals.setMatrixAt(i, _mm)
    this.decals.count = Math.max(this.decals.count, i + 1)
    this.decals.instanceMatrix.needsUpdate = true
  }
  explosion(x, y, z, r = 6, o = {}) {
    const k = Math.min(2.5, r / 6)
    this.flash(x, y + 0.5, z, { size: 3 * k, s1: 6 * k, life: 0.18, r: 1, g: 0.85, b: 0.5 })
    for (let i = 0; i < 14; i++) this.flash(x, y + 0.5, z, { vx: (Math.random() - 0.5) * 10 * k, vy: Math.random() * 9 * k, vz: (Math.random() - 0.5) * 10 * k, s0: 1.4 * k, s1: 0.6 * k, life: 0.45 + Math.random() * 0.3, r: 1, g: 0.45 + Math.random() * 0.3, b: 0.1, drag: 3 })
    for (let i = 0; i < 18; i++) this.puff(x, y + 1, z, { vx: (Math.random() - 0.5) * 6 * k, vy: 1 + Math.random() * 5 * k, vz: (Math.random() - 0.5) * 6 * k, s0: 1.2 * k, s1: 5 * k, life: 3 + Math.random() * 3, r: 0.2, g: 0.19, b: 0.18, a: 0.7, drag: 1.2, fadeIn: 0.05 })
    for (let i = 0; i < 16; i++) this.puff(x, y + 0.5, z, { vx: (Math.random() - 0.5) * 18 * k, vy: 4 + Math.random() * 12 * k, vz: (Math.random() - 0.5) * 18 * k, size: 0.12 + Math.random() * 0.2, life: 1.6, r: 0.25, g: 0.22, b: 0.2, grav: 9.8, spin: 9 })
    // a ring of dust along the ground
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; this.puff(x, y + 0.3, z, { vx: Math.cos(a) * 9 * k, vy: 0.4, vz: Math.sin(a) * 9 * k, s0: 1, s1: 3.5 * k, life: 1.8, r: 0.6, g: 0.55, b: 0.45, a: 0.5, drag: 2.5 }) }
    if (o.fire) for (let i = 0; i < 6; i++) this.flash(x + (Math.random() - 0.5) * 2, y + 0.6, z + (Math.random() - 0.5) * 2, { vy: 1.5, s0: 1.2, s1: 0.4, life: 1.5 + Math.random(), r: 1, g: 0.5, b: 0.15, a: 0.8 })
  }
  // A burning wreck keeps smoking (call each second).
  burn(x, y, z, k = 1) {
    this.puff(x, y, z, { vx: (Math.random() - 0.5) * 0.6, vy: 2 + Math.random(), vz: (Math.random() - 0.5) * 0.6, s0: 1 * k, s1: 4 * k, life: 5, r: 0.12, g: 0.12, b: 0.12, a: 0.55, drag: 0.3, fadeIn: 0.1 })
    this.flash(x, y, z, { vy: 1.2, s0: 1.1 * k, s1: 0.3, life: 0.8, r: 1, g: 0.5, b: 0.15, a: 0.8 })
  }
  smokeGrenade(x, y, z, color = [0.85, 0.85, 0.85]) {
    this.smokeClouds.push({ x, y, z, r: 0, t: 0, color })
  }
  dustFromWheels(x, y, z, s) { if (Math.random() < s) this.puff(x, y + 0.3, z, { vx: (Math.random() - 0.5), vy: 0.5, vz: (Math.random() - 0.5), s0: 0.4, s1: 2, life: 1.4, r: 0.6, g: 0.55, b: 0.45, a: 0.35, drag: 1.5 }) }
  tracer(x, y, z, vx, vy, vz, color = [1, 0.6, 0.25]) { this.tracerList.push({ x, y, z, vx, vy, vz, color, life: 0 }) }
  update(dt, cam) {
    // smoke grenades: a growing, lingering cloud
    for (const s of this.smokeClouds) {
      s.t += dt
      s.r = Math.min(9, 2 + s.t * 2)
      if (s.t < 45 && Math.random() < dt * 14) this.puff(s.x + (Math.random() - 0.5) * s.r, s.y + Math.random() * 2, s.z + (Math.random() - 0.5) * s.r, { vx: (Math.random() - 0.5) * 0.6 + 0.4, vy: 0.25, vz: (Math.random() - 0.5) * 0.6, s0: 2, s1: 6, life: 7, r: s.color[0], g: s.color[1], b: s.color[2], a: 0.75, drag: 0.4, fadeIn: 0.15 })
    }
    this.smokeClouds = this.smokeClouds.filter(s => s.t < 52)
    this.smoke.update(dt); this.glow.update(dt)
    // tracers this frame
    let k = 0
    for (const t of this.tracerList) {
      if (k >= 256) break
      const sp = Math.hypot(t.vx, t.vy, t.vz)
      const len = Math.min(sp * 0.045, 40)
      _p.set(t.x, t.y, t.z)
      _n.set(t.vx / sp, t.vy / sp, t.vz / sp)
      _q.setFromUnitVectors(_zneg, _n)
      // thicker far away so it still shows
      const d = cam ? Math.max(1, cam.distanceTo(_p) / 60) : 1
      _mm.compose(_p, _q, _s.set(0.035 * d, 0.035 * d, len))
      this.tracers.setMatrixAt(k, _mm)
      this.tracers.setColorAt(k, _col.setRGB(t.color[0] * 2, t.color[1] * 2, t.color[2] * 2))
      k++
    }
    this.tracers.count = k
    this.tracers.instanceMatrix.needsUpdate = true
    if (this.tracers.instanceColor) this.tracers.instanceColor.needsUpdate = true
    this.tracerList.length = 0
  }
  // Is the line from a to b through a smoke cloud (for the AI's eyes)?
  smokeBlocks(ax, ay, az, bx, by, bz) {
    for (const s of this.smokeClouds) {
      if (s.t > 48) continue
      const dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz
      const t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.y + 1 - ay) * dy + (s.z - az) * dz) / l2))
      if (Math.hypot(ax + dx * t - s.x, ay + dy * t - s.y - 1, az + dz * t - s.z) < s.r * 0.8) return true
    }
    return false
  }
}
const _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _zneg = new THREE.Vector3(0, 0, -1), _n = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _mm = new THREE.Matrix4(), _col = new THREE.Color()
