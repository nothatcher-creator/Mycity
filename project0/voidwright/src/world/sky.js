// Space round the system: a painted star sphere (thousands of stars, a bright band of the galaxy and two
// faint nebulae, made at start-up), the star itself as a glow at the end of the sun's direction, and the
// detail texture the ground and rocks share.
import * as THREE from 'three'
import { rng } from '../core/noise.js'
import { simplex3, fbm3 } from '../core/noise3.js'

export function starSphere(W = 2048, H = 1024, pause) {
  const cv = new OffscreenCanvas(W, H), c = cv.getContext('2d')
  c.fillStyle = '#010205'; c.fillRect(0, 0, W, H)
  // nebulae and the galactic band: a small noise image, smoothed up
  const w = 256, h = 128, small = new OffscreenCanvas(w, h), sc = small.getContext('2d'), img = sc.createImageData(w, h)
  const n = simplex3(77), n2 = simplex3(78)
  const band = new THREE.Vector3(0.3, 0.9, 0.31).normalize()
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const lon = (i / w) * Math.PI * 2, lat = (0.5 - j / h) * Math.PI
    const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon)
    const b = Math.exp(-((x * band.x + y * band.y + z * band.z) ** 2) / 0.02)
    const f = fbm3(n, x * 2.2, y * 2.2, z * 2.2, 5) * 0.5 + 0.5
    const g = fbm3(n2, x * 1.6 + 4, y * 1.6, z * 1.6, 4) * 0.5 + 0.5
    const neb1 = Math.max(0, g - 0.6) * 2.4, neb2 = Math.max(0, f - 0.64) * 2.2 * (1 - b)
    const k = (j * w + i) * 4
    img.data[k] = Math.min(255, 255 * (b * f * 0.16 + neb1 * 0.22 + neb2 * 0.05))
    img.data[k + 1] = Math.min(255, 255 * (b * f * 0.14 + neb1 * 0.06 + neb2 * 0.12))
    img.data[k + 2] = Math.min(255, 255 * (b * f * 0.18 + neb1 * 0.2 + neb2 * 0.24))
    img.data[k + 3] = 255
  }
  sc.putImageData(img, 0, 0)
  c.imageSmoothingEnabled = true; c.globalCompositeOperation = 'lighter'
  c.drawImage(small, 0, 0, W, H)
  // a dust of faint stars in the band (the bright ones are points: see Sky)
  const r = rng(91)
  for (let i = 0; i < 2500; i++) {
    const u = r(), v = r(), x0 = Math.cos((v - 0.5) * Math.PI) * Math.cos(u * Math.PI * 2), y0 = Math.sin((v - 0.5) * Math.PI), z0 = Math.cos((v - 0.5) * Math.PI) * Math.sin(u * Math.PI * 2)
    if (r() > Math.exp(-((x0 * band.x + y0 * band.y + z0 * band.z) ** 2) / 0.02)) continue
    c.fillStyle = `rgba(230,236,255,${0.15 + r() * 0.25})`; c.fillRect(u * W, (1 - v) * H, 1.5, 1.5)
  }
  c.globalCompositeOperation = 'source-over'
  const tex = new THREE.CanvasTexture(cv)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// a glow for the star
function glowTex() {
  const s = 256, cv = new OffscreenCanvas(s, s), c = cv.getContext('2d')
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.06, 'rgba(255,250,235,1)'); g.addColorStop(0.1, 'rgba(255,230,190,0.55)')
  g.addColorStop(0.3, 'rgba(255,190,120,0.12)'); g.addColorStop(1, 'rgba(255,160,90,0)')
  c.fillStyle = g; c.fillRect(0, 0, s, s)
  // four faint rays
  c.globalCompositeOperation = 'lighter'
  for (const [dx, dy] of [[1, 0], [0, 1]]) { const lg = c.createLinearGradient(0, 0, s * dx, s * dy); lg.addColorStop(0, 'rgba(255,240,220,0)'); lg.addColorStop(0.5, 'rgba(255,240,220,0.35)'); lg.addColorStop(1, 'rgba(255,240,220,0)'); c.fillStyle = lg; if (dx) c.fillRect(0, s / 2 - 1.5, s, 3); else c.fillRect(s / 2 - 1.5, 0, 3, s) }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t
}

// A tileable texture of grain (red: fine, green: coarse) for the ground and the rocks.
export function detailTexture(size = 256) {
  const cv = new OffscreenCanvas(size, size), c = cv.getContext('2d'), img = c.createImageData(size, size)
  const r = rng(5)
  const lattice = (P) => { const a = new Float32Array(P * P); for (let i = 0; i < a.length; i++) a[i] = r(); return a }
  const L = [lattice(8), lattice(16), lattice(32), lattice(64), lattice(128)]
  const sample = (a, P, x, y) => {
    const fx = x * P, fy = y * P, i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
    const g = (i, j) => a[((j % P) + P) % P * P + ((i % P) + P) % P]
    return (g(i0, j0) * (1 - sx) + g(i0 + 1, j0) * sx) * (1 - sy) + (g(i0, j0 + 1) * (1 - sx) + g(i0 + 1, j0 + 1) * sx) * sy
  }
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = i / size, y = j / size
    const fine = sample(L[2], 32, x, y) * 0.35 + sample(L[3], 64, x, y) * 0.35 + sample(L[4], 128, x, y) * 0.3
    const coarse = sample(L[0], 8, x, y) * 0.5 + sample(L[1], 16, x, y) * 0.3 + sample(L[2], 32, x, y) * 0.2
    const k = (j * size + i) * 4
    img.data[k] = fine * 255; img.data[k + 1] = coarse * 255; img.data[k + 2] = 128; img.data[k + 3] = 255
  }
  c.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.NoColorSpace
  t.anisotropy = 4
  return t
}

export class Sky {
  constructor(engine) {
    this.engine = engine
    this.tex = starSphere()
    engine.background = this.tex
    engine.scene.background = this.tex
    this.sunPos = new THREE.Vector3()
    const m = new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })
    this.glow = new THREE.Sprite(m)
    this.glow.scale.setScalar(7e6)
    this.glow.renderOrder = -2
    engine.scene.add(this.glow)
    // stars: crisp points on a far sphere, more of them along the galaxy's band
    const r = rng(91), N = 7000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3)
    const band = new THREE.Vector3(0.3, 0.9, 0.31).normalize()
    let n = 0
    while (n < N) {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, s0 = Math.sqrt(1 - u * u)
      const v = new THREE.Vector3(s0 * Math.cos(th), u, s0 * Math.sin(th))
      if (r() > 0.3 + 0.7 * Math.exp(-(v.dot(band) ** 2) / 0.03)) continue
      const b = 0.25 + r() ** 5 * 1.6, t = r(), c = t < 0.2 ? [1, 0.82, 0.66] : t < 0.65 ? [1, 0.98, 0.95] : [0.74, 0.82, 1]
      pos.set([v.x * 5e7, v.y * 5e7, v.z * 5e7], n * 3); col.set([c[0] * b, c[1] * b, c[2] * b], n * 3); n++
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    this.starMat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false })
    this.stars = new THREE.Points(g, this.starMat)
    this.stars.frustumCulled = false; this.stars.renderOrder = -3
    engine.scene.add(this.stars)
  }
  // `day`: how much of the sky is lit air round the camera (0 in space): the stars fade behind it
  update(sunDir, day) {
    const e = this.engine
    this.glow.position.copy(e.camera.position).addScaledVector(sunDir, 6e7)
    e.scene.backgroundIntensity = 1 - 0.96 * day
    this.stars.position.copy(e.camera.position)
    this.starMat.opacity = 1 - 0.97 * day
    this.starMat.size = Math.max(1.2, 1.6 * (e.p0.pixelRatio || 1) * 0.8)
    this.glow.material.opacity = 1 - day * 0.3
  }
}
