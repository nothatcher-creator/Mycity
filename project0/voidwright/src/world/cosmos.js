// What lies between and beyond the worlds. Stars are real places: a glowing ball hundreds of kilometres
// across, far out (the home star, Vela, circles the home system thousands of kilometres off, which is
// what makes day and night), lighting whatever is nearest them and burning whatever comes too close.
// Gas giants are banded balls of cloud with rings and no ground: their pull is real and their depths
// crush. Comets trail tails of light away from their star. Nebulae are clouds of glowing gas hundreds of
// kilometres across.
import * as THREE from 'three'

export const STAR_CELL = 26e6          // one star in every 26,000 km square (the home square has Vela)
const HOME_STAR_D = 7.2e6
const TAU = Math.PI * 2
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function hash2(i, k) { let h = (Math.imul(i | 0, 2654435761) + Math.imul(k | 0, 40503) + 31) | 0; h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13; return h >>> 0 }
const SYL = ['ve', 'la', 'an', 'tar', 'is', 'ri', 'gel', 'mi', 'ra', 'sol', 'en', 'ca', 'pel', 'nos', 'ar', 'cyr', 'thu', 'ban']
const starName = r => { let s = ''; const n = 2 + (r() < 0.4 ? 1 : 0); for (let i = 0; i < n; i++) s += SYL[Math.floor(r() * SYL.length)]; return s[0].toUpperCase() + s.slice(1) }
const KCOL = [[1, 0.58, 0.32], [1, 0.78, 0.52], [1, 0.95, 0.85], [0.82, 0.88, 1]]

export function starsNear(p, n = 6) {
  const ci = Math.round(p.x / STAR_CELL), ck = Math.round(p.z / STAR_CELL), out = []
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
    const i = ci + a, k = ck + b
    if (i === 0 && k === 0) continue
    const r = rng(hash2(i, k))
    const t = r()
    out.push({ id: `star${i},${k}`, name: starName(r), R: 160000 + r() * 420000, col: KCOL[Math.floor(t * KCOL.length)], pos: new THREE.Vector3((i + (r() - 0.5) * 0.5) * STAR_CELL, (r() - 0.5) * 6e6, (k + (r() - 0.5) * 0.5) * STAR_CELL) })
  }
  return out
}

// ---- the shaders ----
const STAR_VS = 'varying vec3 vN; varying vec3 vP; varying vec3 vV; void main() { vN = normalize(normalMatrix * normal); vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }'
const NOISE = `
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y), mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n3(p); p *= 2.03; a *= 0.5; } return v; }`
const STAR_FS = `uniform vec3 uCol; uniform float uTime; varying vec3 vN; varying vec3 vP; varying vec3 vV;${NOISE}
void main() {
  vec3 d = normalize(vP);
  float g = fbm(d * 6.0 + vec3(uTime * 0.02, 0.0, uTime * 0.013)), c = fbm(d * 22.0 - vec3(0.0, uTime * 0.05, 0.0));
  float limb = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 0.35);
  vec3 col = uCol * (1.6 + 1.6 * g + 0.8 * c) * (0.55 + 0.45 * limb);
  gl_FragColor = vec4(col * 2.2, 1.0);
}`
const GIANT_FS = `uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uSun; uniform float uTime; uniform float uSeed; varying vec3 vN; varying vec3 vP; varying vec3 vV;${NOISE}
void main() {
  vec3 d = normalize(vP);
  float lat = d.y + 0.08 * fbm(d * 4.0 + uSeed);
  float sw = fbm(vec3(lat * 9.0, d.x * 2.0 + uTime * 0.004, d.z * 2.0 + uSeed));
  float band = 0.5 + 0.5 * sin(lat * 26.0 + sw * 4.0);
  vec3 col = mix(mix(uA, uB, band), uC, smoothstep(0.62, 0.9, fbm(d * 9.0 + vec3(uTime * 0.003, 0.0, 0.0) + uSeed)) * 0.6);
  vec3 n = normalize(vP);
  float lit = max(dot(n, uSun), 0.0);
  float rim = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 3.0);
  col = col * (0.06 + 1.05 * lit) + uA * rim * 0.5 * (0.3 + lit);
  gl_FragColor = vec4(col, 1.0);
}`
const RING_VS = 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
const RING_FS = `uniform float uIn; uniform float uOut; uniform vec3 uCol; uniform vec3 uSun; uniform vec3 uSunL; varying vec3 vP;${NOISE}
void main() {
  float r = length(vP.xy), t = (r - uIn) / (uOut - uIn);
  if (t < 0.0 || t > 1.0) discard;
  float bands = 0.35 + 0.65 * fbm(vec3(t * 40.0, 0.0, 0.0)) * smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.85, t);
  float gap = smoothstep(0.02, 0.05, abs(t - 0.62));
  // the planet's shadow on the far side of the ring
  vec2 s2 = normalize(uSunL.xy + 1e-4);
  float side = dot(vP.xy, -s2), across = abs(vP.x * s2.y - vP.y * s2.x);
  float shadow = (side > 0.0 && across < uIn / 1.45) ? 0.18 : 1.0;
  gl_FragColor = vec4(uCol * (0.45 + 0.75 * max(uSun.y * 0.0 + 0.6, 0.0)) * shadow, bands * gap * 0.85);
}`
const TAIL_FS = `uniform vec3 uCol; uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;${NOISE}
void main() {
  float t = clamp(vP.y + 0.5, 0.0, 1.0);          // 0 at the head, 1 at the end
  float face = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
  float streak = 0.6 + 0.4 * fbm(vec3(atan(vP.x, vP.z) * 3.0, t * 6.0 - uTime * 0.05, 0.0));
  float a = (1.0 - t) * (1.0 - t) * face * streak;
  gl_FragColor = vec4(uCol * a * 1.6, a);
}`

function glowTexture(inner, outer) {
  const S = 128, c = new OffscreenCanvas(S, S), x = c.getContext('2d'), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, inner); g.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.45)')); g.addColorStop(1, outer)
  x.fillStyle = g; x.fillRect(0, 0, S, S)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
function cloudTexture(seed) {
  const S = 128, c = new OffscreenCanvas(S, S), x = c.getContext('2d'), img = x.createImageData(S, S), r = rng(seed)
  const pts = []; for (let i = 0; i < 9; i++) pts.push([S / 2 + (r() - 0.5) * S * 0.5, S / 2 + (r() - 0.5) * S * 0.5, S * (0.12 + r() * 0.22)])
  for (let y = 0; y < S; y++) for (let x2 = 0; x2 < S; x2++) {
    let v = 0; for (const [px, py, pr] of pts) { const d = Math.hypot(x2 - px, y - py) / pr; v += Math.exp(-d * d * 2.2) }
    const e = Math.hypot(x2 - S / 2, y - S / 2) / (S / 2), a = Math.min(1, v * 0.6) * Math.max(0, 1 - e * e)
    const o = (y * S + x2) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = a * 255
  }
  x.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c); return t
}

export class Cosmos {
  constructor(engine, universe) {
    this.engine = engine; this.U = universe
    this.time = 0
    this.home = { id: 'vela', name: 'Vela', R: 280000, col: [1, 0.9, 0.72], pos: new THREE.Vector3(), home: true }
    this.stars = [this.home]
    this.giants = []; this.comets = []; this.nebulae = []
    // the star bodies: one sphere and halo, moved to whichever stars are in sight
    this.starGeo = new THREE.SphereGeometry(1, 64, 32)
    this.bodies = []
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color() }, uTime: { value: 0 } }, vertexShader: STAR_VS, fragmentShader: STAR_FS, fog: false, toneMapped: false })
      const m = new THREE.Mesh(this.starGeo, mat); m.frustumCulled = false; m.visible = false
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,236,200,1)', 'rgba(255,170,90,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false }))
      halo.visible = false
      engine.scene.add(m, halo)
      this.bodies.push({ m, halo, star: null })
    }
    // far stars: points of light with a little glow
    this.sprites = []
    for (let i = 0; i < 12; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); s.visible = false; s.renderOrder = -2; engine.scene.add(s); this.sprites.push(s) }
    this.cloudTex = [cloudTexture(3), cloudTexture(17), cloudTexture(29)]
    this.heatTmp = new THREE.Vector3()
  }
  // ---- the stars ----
  // Vela circles the home system once a day (this is the day); every other star stands still
  place(sunDir) { this.home.pos.copy(sunDir).multiplyScalar(HOME_STAR_D) }
  nearestStar(p) {
    let best = this.home, bd = p.distanceTo(this.home.pos)
    if (Math.abs(p.x) > STAR_CELL * 0.3 || Math.abs(p.z) > STAR_CELL * 0.3) for (const s of this.far(p)) { const d = p.distanceTo(s.pos); if (d < bd) { bd = d; best = s } }
    return best
  }
  far(p) {
    const key = Math.round(p.x / STAR_CELL) + ',' + Math.round(p.z / STAR_CELL)
    if (key !== this.farKey) { this.farKey = key; this.farList = starsNear(p) }
    return this.farList
  }
  // how hot it is here: 0 out beyond five radii, 1 at the surface
  heatAt(p) {
    let worst = 0, star = null
    for (const s of [this.home, ...(this.farList || [])]) {
      const d = p.distanceTo(s.pos)
      if (d > s.R * 5) continue
      const h = d < s.R ? 1 : Math.pow(1 - (d - s.R) / (s.R * 4), 2)
      if (h > worst) { worst = h; star = s }
    }
    for (const g of this.giants) {
      const d = p.distanceTo(g.center)
      if (d < g.R * 1.02) { const h = Math.min(1, (g.R * 1.02 - d) / (g.R * 0.05)); if (h > worst) { worst = h; star = g } }
    }
    return { heat: worst, by: star }
  }
  // ---- gas giants, comets, nebulae: added when their group wakes ----
  addGiant(d) {
    const e = this.engine, g = { def: d, id: d.id, name: d.name, R: d.R, g: d.g, center: new THREE.Vector3(...d.center), group: new THREE.Group() }
    const mat = new THREE.ShaderMaterial({ uniforms: { uA: { value: new THREE.Color(...d.cols[0]) }, uB: { value: new THREE.Color(...d.cols[1]) }, uC: { value: new THREE.Color(...d.cols[2]) }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uTime: { value: 0 }, uSeed: { value: d.seed % 97 } }, vertexShader: STAR_VS, fragmentShader: GIANT_FS, fog: false })
    const ball = new THREE.Mesh(new THREE.SphereGeometry(d.R, 96, 48), mat); ball.frustumCulled = false
    g.group.add(ball); g.mat = mat
    if (d.rings) {
      const rm = new THREE.ShaderMaterial({ uniforms: { uIn: { value: d.rings[0] }, uOut: { value: d.rings[1] }, uCol: { value: new THREE.Color(...d.cols[1]).lerp(new THREE.Color(0.9, 0.85, 0.75), 0.5) }, uSun: { value: new THREE.Vector3() }, uSunL: { value: new THREE.Vector3(1, 0, 0) } }, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false })
      const ring = new THREE.Mesh(new THREE.RingGeometry(d.rings[0], d.rings[1], 160, 4), rm); ring.frustumCulled = false
      ring.rotation.set(Math.PI / 2 + d.tilt, 0, d.tilt * 0.6)
      g.group.add(ring); g.ring = ring; g.ringMat = rm
    }
    g.track = e.track(g.group, g.center)
    this.giants.push(g)
    return g
  }
  removeGiant(id) { const i = this.giants.findIndex(g => g.id === id); if (i < 0) return; const g = this.giants[i]; this.engine.untrack(g.track); g.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose() }); this.giants.splice(i, 1) }
  addComet(field) {
    const e = this.engine
    const mat = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(0.55, 0.85, 1) }, uTime: { value: 0 } }, vertexShader: STAR_VS, fragmentShader: TAIL_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false })
    const len = field.def.tail || 60000
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.15, 1, 24, 12, true), mat)
    tail.frustumCulled = false
    const grp = new THREE.Group(); grp.add(tail)
    const c = { field, grp, tail, mat, len, track: e.track(grp, field.center) }
    this.comets.push(c)
    return c
  }
  removeComet(field) { const i = this.comets.findIndex(c => c.field === field); if (i < 0) return; this.engine.untrack(this.comets[i].track); this.comets[i].tail.geometry.dispose(); this.comets.splice(i, 1) }
  addNebula(d) {
    const e = this.engine, r = rng(d.seed), grp = new THREE.Group(), n = { def: d, id: d.id, name: d.name, center: new THREE.Vector3(...d.center), R: d.radius, grp }
    for (let i = 0; i < 34; i++) {
      const u = r() * 2 - 1, th = r() * TAU, rr = d.radius * Math.cbrt(r()) * 0.85, s0 = Math.sqrt(1 - u * u)
      const col = new THREE.Color(...d.cols[0]).lerp(new THREE.Color(...d.cols[1]), r())
      const m = new THREE.SpriteMaterial({ map: this.cloudTex[i % 3], color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.1 + r() * 0.12, fog: false, rotation: r() * TAU })
      const sp = new THREE.Sprite(m); sp.position.set(s0 * Math.cos(th) * rr, u * rr * 0.6, s0 * Math.sin(th) * rr); sp.scale.setScalar(d.radius * (0.5 + r() * 0.7)); sp.frustumCulled = false
      grp.add(sp)
    }
    n.track = e.track(grp, n.center)
    this.nebulae.push(n)
    return n
  }
  removeNebula(id) { const i = this.nebulae.findIndex(n => n.id === id); if (i < 0) return; this.engine.untrack(this.nebulae[i].track); this.nebulae.splice(i, 1) }
  gravity(p, out) {
    let best = 0
    for (const g of this.giants) {
      const d = this.heatTmp.subVectors(g.center, p), r = d.length()
      if (r > g.R * 5) continue
      const a = g.g * (g.R / Math.max(r, g.R * 0.5)) ** 2 * (r > g.R * 3.5 ? 1 - (r - g.R * 3.5) / (g.R * 1.5) : 1)
      out.addScaledVector(d.normalize(), a); best = Math.max(best, a)
    }
    return best
  }
  // ---- every frame ----
  update(dt, cam, sunDir) {
    this.time += dt
    const e = this.engine
    // the star bodies: the nearest three in reach of the far slice
    const list = [this.home, ...this.far(cam)].map(s => ({ s, d: cam.distanceTo(s.pos) })).sort((a, b) => a.d - b.d)
    for (let i = 0; i < this.bodies.length; i++) {
      const B = this.bodies[i], it = list[i]
      const show = it && it.d < 7.6e7 - it.s.R
      B.m.visible = B.halo.visible = !!show
      if (!show) continue
      const s = it.s
      e.rel(s.pos, B.m.position); B.m.scale.setScalar(s.R)
      B.m.material.uniforms.uCol.value.setRGB(...s.col); B.m.material.uniforms.uTime.value = this.time
      B.halo.position.copy(B.m.position); B.halo.scale.setScalar(s.R * 7)
      B.halo.material.color.setRGB(...s.col)
    }
    // the rest as points of light on the sky
    let k = 0
    for (const it of list.slice(this.bodies.length)) {
      if (k >= this.sprites.length) break
      const sp = this.sprites[k++], dir = this.heatTmp.subVectors(it.s.pos, cam).normalize()
      sp.visible = true; sp.position.copy(e.camera.position).addScaledVector(dir, 5.5e7)
      sp.scale.setScalar(Math.max(2.5e5, Math.min(3e6, it.s.R / it.d * 5.5e7 * 9)))
      sp.material.color.setRGB(...it.s.col)
    }
    for (; k < this.sprites.length; k++) this.sprites[k].visible = false
    for (const g of this.giants) {
      const sd = this.heatTmp.copy(this.nearestStar(g.center).pos).sub(g.center).normalize()
      g.mat.uniforms.uSun.value.copy(sd); g.mat.uniforms.uTime.value = this.time
      if (g.ringMat) { g.ringMat.uniforms.uSun.value.copy(sd); g.ringMat.uniforms.uSunL.value.copy(sd).applyQuaternion(g.ring.quaternion.clone().invert()) }
    }
    for (const c of this.comets) {
      // the tail points away from the star, wider and fainter with distance
      const away = this.heatTmp.copy(c.field.center).sub(this.nearestStar(c.field.center).pos).normalize()
      c.tail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), away)
      c.tail.scale.set(c.len * 0.09, c.len, c.len * 0.09)
      c.tail.position.copy(away).multiplyScalar(c.len * 0.5 + 200)
      c.mat.uniforms.uTime.value = this.time
    }
  }
}
