// Pictures of the blueprints for their menu: each design built once as a grid that is never added to the
// world, drawn from the front quarter into a small picture, then thrown away. One a frame, while the menu
// is open, so a 2,400-block station does not stall the game.
import * as THREE from 'three'
import { Grid } from '../grid/grid.js'
import { load } from '../game/build.js'

const W = 240, H = 136
export class Previews {
  constructor(engine, world) {
    this.engine = engine; this.world = world
    this.map = new Map(); this.todo = []
    this.scene = new THREE.Scene()
    this.scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x3a4048, 1.5))
    const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(-0.5, 1, -0.7); this.scene.add(d)
    const d2 = new THREE.DirectionalLight(0x9fd6ff, 0.8); d2.position.set(0.8, 0.2, 0.6); this.scene.add(d2)
    this.cam = new THREE.PerspectiveCamera(30, W / H, 0.5, 4000)
    this.mat = new THREE.MeshStandardMaterial({ map: world.atlas.tex, vertexColors: true, metalness: 0.35, roughness: 0.55, alphaTest: 0.5 })
    this.glass = new THREE.MeshStandardMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.4, metalness: 0.2, roughness: 0.1 })
    this.rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 })
    this.rt.texture.colorSpace = THREE.SRGBColorSpace
    this.buf = new Uint8Array(W * H * 4)
  }
  get(id, bp) {
    const c = this.map.get(id)
    if (c) return c
    if (!this.todo.some(t => t[0] === id)) this.todo.push([id, bp])
    return null
  }
  // draws the next waiting picture; true when one was drawn
  step() {
    if (!this.todo.length) return false
    const [id, bp] = this.todo.shift()
    try { this.draw(id, bp) } catch (e) { this.map.set(id, null); this.world.game.p0.log('preview ' + id + ' failed: ' + e.message) }
    return true
  }
  draw(id, bp) {
    const r = this.engine.renderer
    const g = new Grid(this.world, bp.size, { ghost: true, mat: this.mat, glassMat: this.glass })
    load(g, bp)
    g.updateMass()
    g.rebuild(1e6)
    const wrap = new THREE.Group(); wrap.add(g.group)
    g.group.position.copy(g.com).negate()
    this.scene.add(wrap)
    // from ahead and to the left, a little above; stations from higher up
    const dir = new THREE.Vector3(-0.85, bp.static ? 0.85 : 0.5, -1).normalize()
    const dist = g.radius / Math.sin(THREE.MathUtils.degToRad(15)) * 0.62
    this.cam.position.copy(dir).multiplyScalar(dist); this.cam.lookAt(0, 0, 0)
    this.cam.near = Math.max(0.1, dist - g.radius * 2); this.cam.far = dist + g.radius * 2; this.cam.updateProjectionMatrix()
    const old = r.getRenderTarget(), oc = new THREE.Color(); r.getClearColor(oc); const oa = r.getClearAlpha()
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear(true, true, true)
    r.render(this.scene, this.cam)
    r.readRenderTargetPixels(this.rt, 0, 0, W, H, this.buf)
    r.setRenderTarget(old); r.setClearColor(oc, oa)
    this.scene.remove(wrap); g.dispose()
    const cv = new OffscreenCanvas(W, H), cx = cv.getContext('2d'), img = cx.createImageData(W, H)
    for (let y = 0; y < H; y++) img.data.set(this.buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4)
    cx.putImageData(img, 0, 0)
    this.map.set(id, cv)
  }
}
