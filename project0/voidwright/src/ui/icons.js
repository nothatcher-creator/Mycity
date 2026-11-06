// Toolbar and catalogue pictures: every block drawn once at start-up from its real shape, at an angle,
// into a small picture the interface can paint.
import * as THREE from 'three'
import { BLOCKS, ORDER, blockGeo } from '../grid/blocks.js'
import { PALETTE } from '../grid/grid.js'
import { lin } from '../core/color.js'

const S = 96
export class Icons {
  constructor(engine, atlasTex) {
    this.engine = engine
    this.map = new Map()
    this.scene = new THREE.Scene()
    this.scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x3a4048, 1.4))
    const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(0.6, 1, 0.8); this.scene.add(d)
    this.cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100)
    this.mat = new THREE.MeshStandardMaterial({ map: atlasTex, vertexColors: true, metalness: 0.3, roughness: 0.55, alphaTest: 0.5 })
    this.glass = new THREE.MeshStandardMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.45, metalness: 0.2, roughness: 0.1 })
    this.rt = new THREE.WebGLRenderTarget(S, S, { samples: 0 })
    this.rt.texture.colorSpace = THREE.SRGBColorSpace
    this.buf = new Uint8Array(S * S * 4)
  }
  key(id, size) { return id + '|' + size }
  get(id, size) { return this.map.get(this.key(id, size)) || this.map.get(this.key(id, Object.keys(BLOCKS[id]?.sizes || {})[0])) }
  geometry(id, size, glass) {
    const parts = blockGeo(id, size).filter(p => !!p.glass === glass)
    const P = [], N = [], U = [], C = []
    const pc = PALETTE[0].map(lin)
    for (const p of parts) for (let i = 0; i < p.n; i++) {
      P.push(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]); N.push(p.nor[i * 3], p.nor[i * 3 + 1], p.nor[i * 3 + 2]); U.push(p.uv[i * 2], p.uv[i * 2 + 1])
      const k = p.paint[i], e = 1 + p.emit[i] * 0.6
      C.push(p.col[i * 3] * (k ? pc[0] : 1) * e, p.col[i * 3 + 1] * (k ? pc[1] : 1) * e, p.col[i * 3 + 2] * (k ? pc[2] : 1) * e)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3))
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(U), 2)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(C), 3))
    return g
  }
  draw(id, size) {
    const r = this.engine.renderer, d = BLOCKS[id], Sz = d.sizes[size]
    const g = this.geometry(id, size, false), gg = this.geometry(id, size, true)
    const m = new THREE.Mesh(g, this.mat), mg = new THREE.Mesh(gg, this.glass)
    const grp = new THREE.Group(); grp.add(m, mg)
    const c = new THREE.Vector3((Sz[0] - 1) / 2, (Sz[1] - 1) / 2, (Sz[2] - 1) / 2)
    grp.position.copy(c).negate()
    const wrap = new THREE.Group(); wrap.add(grp); wrap.rotation.set(0, Math.PI * 0.82, 0)
    this.scene.add(wrap)
    const rad = Math.hypot(Sz[0], Sz[1], Sz[2]) * 0.5 + 0.1
    const dist = rad / Math.sin(THREE.MathUtils.degToRad(14)) * 0.92
    this.cam.position.set(0, 0.55, 1).normalize().multiplyScalar(dist); this.cam.lookAt(0, 0, 0)
    const old = r.getRenderTarget(), oc = new THREE.Color(); r.getClearColor(oc); const oa = r.getClearAlpha()
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear(true, true, true)
    r.render(this.scene, this.cam)
    r.readRenderTargetPixels(this.rt, 0, 0, S, S, this.buf)
    r.setRenderTarget(old); r.setClearColor(oc, oa)
    this.scene.remove(wrap); g.dispose(); gg.dispose()
    const cv = new OffscreenCanvas(S, S), cx = cv.getContext('2d'), img = cx.createImageData(S, S)
    for (let y = 0; y < S; y++) img.data.set(this.buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4)
    cx.putImageData(img, 0, 0)
    this.map.set(this.key(id, size), cv)
  }
  // the shaders compiled in the background first (a first draw would compile them on the spot and hold
  // the game up for seconds on a slow driver), then a few pictures each frame
  async prepare() {
    this.todo = []
    for (const id of ORDER) for (const size of Object.keys(BLOCKS[id].sizes)) this.todo.push([id, size])
    const g = this.geometry('window', 'large', false), gg = this.geometry('window', 'large', true)
    const m = new THREE.Mesh(g, this.mat), mg = new THREE.Mesh(gg, this.glass)
    this.scene.add(m, mg)
    const r = this.engine.renderer
    // compiled for drawing into the picture target (a different program from drawing to the screen)
    try {
      const old = r.getRenderTarget(); r.setRenderTarget(this.rt)
      const job = r.compileAsync ? r.compileAsync(this.scene, this.cam) : null
      r.setRenderTarget(old)
      if (job) await Promise.race([job, new Promise(res => setTimeout(res, 8000))])
    } catch {}
    this.scene.remove(m, mg); g.dispose(); gg.dispose()
    this.ready = true
  }
  step(ms = 6, max = 99) {
    if (!this.ready || !this.todo?.length) return false
    const t = performance.now()
    let n = 0
    while (this.todo.length && performance.now() - t < ms && n++ < max) { const [id, size] = this.todo.shift(); try { this.draw(id, size) } catch (e) { } }
    return true
  }
  get done() { return this.ready && !this.todo.length }
}
