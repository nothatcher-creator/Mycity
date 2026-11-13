// The frame. A star system hundreds of kilometres across is drawn from inside a 32 m lot:
//  - Camera-relative positions: everything in the game lives in system metres (double precision, in plain
//    JS numbers); each frame every object is put at (its position - the camera's) + ANCHOR, so the numbers
//    the graphics card sees are always small near the camera and nothing jitters 300 km from home.
//  - Split depth: one depth buffer cannot hold a bolt at 5 cm and a moon at 120 km, so the scene is drawn in
//    three slices (far, middle, near), each with its own near and far planes, the depth cleared between them.
//    The far slice also draws the sky.
import * as THREE from 'three'
import { Post } from './post.js'

export const ANCHOR = new THREE.Vector3(0, 14, 0)

export const QUALITY = {
  low: { name: 'Low', pixel: 0.7, dpr: 1, detail: 0.6, rocks: 0.6, lights: 2 },
  medium: { name: 'Medium', pixel: 1, dpr: 1.5, detail: 1, rocks: 1, lights: 4 },
  high: { name: 'High', pixel: 1, dpr: 2, detail: 1.45, rocks: 1.3, lights: 4 },
}
// the slices: far to near (each slightly overlapping the next)
export const SLICES = [{ near: 40000, far: 8e7 }, { near: 600, far: 41000 }, { near: 0.04, far: 610 }]

export class Engine {
  constructor(p0) {
    this.p0 = p0
    this.renderer = p0.renderer
    this.scene = p0.scene
    this.camera = p0.camera
    this.camPos = new THREE.Vector3()
    this.camQuat = new THREE.Quaternion()
    this.fov = 70
    this.tracked = new Set()       // { obj, pos, quat } kept camera-relative every frame
    // light: the star (a direction), a faint fill from everywhere (light bounced off a planet nearby), and a
    // fixed pool of lamps the nearest lights of the ships borrow (a fixed number, so no shader recompiles)
    this.sun = new THREE.DirectionalLight(0xfff4e6, 3.2)
    this.sun.target.position.copy(ANCHOR)
    this.scene.add(this.sun, this.sun.target)
    this.fill = new THREE.HemisphereLight(0x8a9bb0, 0x2a2622, 0.35)
    this.scene.add(this.fill)
    this.lamps = []
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffffff, 0, 30, 2); this.scene.add(l); this.lamps.push(l) }
    this.spots = []
    for (let i = 0; i < 2; i++) { const l = new THREE.SpotLight(0xffffff, 0, 120, 0.5, 0.45, 1.6); this.scene.add(l, l.target); this.spots.push(l) }
    this.scene.fog = new THREE.FogExp2(0x8fb0d8, 0)
    // the hand-held tool: its own scene and camera so it never clips into walls
    this.vmScene = new THREE.Scene()
    this.vmCamera = new THREE.PerspectiveCamera(55, 1, 0.01, 10)
    this.vmScene.add(new THREE.HemisphereLight(0xdde8ff, 0x303438, 0.9))
    this.vmSun = new THREE.DirectionalLight(0xfff4e6, 1.6)
    this.vmScene.add(this.vmSun)
    // the interface: pixel coordinates, (0, 0) at the top left
    this.uiScene = new THREE.Scene()
    this.uiCamera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10)
    this.qualityKey = 'medium'
    this.quality = QUALITY.medium
    this.p0.autoRender = false
    this.renderer.autoClear = false
    this.camera.position.copy(ANCHOR)
    this.background = null
    this.post = new Post(this.renderer)
    this.postOn = true
    this.resize()
    p0.on('resize', () => this.resize())
  }
  setQuality(key) { this.qualityKey = key; this.quality = QUALITY[key]; this.resize() }
  resize() {
    const w = this.p0.width, h = this.p0.height
    this.width = w; this.height = h
    const pr = Math.min(this.p0.pixelRatio || 1, this.quality.dpr) * this.quality.pixel * (this.resScale || 1) * Math.min(1, 2560 / Math.max(w, 1)) * (1 - 0.35 * (this.relief || 0))
    this.renderer.setPixelRatio(Math.max(0.3, Math.min(3, pr)))
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.vmCamera.aspect = w / h
    this.vmCamera.updateProjectionMatrix()
    const u = this.uiCamera
    u.left = 0; u.right = w; u.top = 0; u.bottom = -h
    u.updateProjectionMatrix()
    if (this.onResize) this.onResize(w, h)
  }
  // On narrow screens (phones held upright) the view is kept as wide sideways as on a 1.3:1 screen.
  widen(fov) {
    const a = this.width / Math.max(1, this.height)
    if (a >= 1.3) return fov
    return Math.min(115, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * 1.3 / a)))
  }
  // The camera at system point `pos`, looking along `quat`.
  setView(pos, quat, fov) {
    this.camPos.copy(pos); this.camQuat.copy(quat)
    this.camera.position.copy(ANCHOR)
    this.camera.quaternion.copy(quat)
    fov = this.widen(fov || this.fov)
    if (Math.abs(fov - this.camera.fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix() }
    this.camera.updateMatrixWorld()
  }
  // System coordinates to scene coordinates.
  rel(v, out = new THREE.Vector3()) { return out.set(v.x - this.camPos.x + ANCHOR.x, v.y - this.camPos.y + ANCHOR.y, v.z - this.camPos.z + ANCHOR.z) }
  track(obj, pos, quat = null) { const t = { obj, pos, quat }; this.tracked.add(t); this.scene.add(obj); return t }
  untrack(t) { if (!t) return; this.tracked.delete(t); t.obj.removeFromParent() }
  sync() {
    for (const t of this.tracked) {
      this.rel(t.pos, t.obj.position)
      if (t.quat) t.obj.quaternion.copy(t.quat)
    }
  }
  setSun(dir, color, intensity) {
    this.sunDir = dir
    this.sun.position.copy(ANCHOR).addScaledVector(dir, 100)
    if (color) this.sun.color.copy(color)
    if (intensity != null) this.sun.intensity = intensity
    this.vmSun.position.copy(dir).applyQuaternion(this.camQuat.clone().invert())
  }
  render(drawViewmodel) {
    const r = this.renderer, cam = this.camera, sc = this.scene
    if (this.uiOnly) { r.setRenderTarget(null); r.clear(true, true, true); r.render(this.uiScene, this.uiCamera); return }
    // with the finishing pass on, the scene goes into its picture first and reaches the screen through it
    const post = this.post && this.postOn && this.post.ready()
    r.setRenderTarget(post ? this.post.rt : null)
    r.clear(true, true, true)
    for (let i = 0; i < SLICES.length; i++) {
      const s = SLICES[i]
      cam.near = s.near; cam.far = s.far; cam.updateProjectionMatrix()
      sc.background = i === 0 ? this.background : null
      if (i) r.clearDepth()
      r.render(sc, cam)
    }
    sc.background = this.background
    if (drawViewmodel) { r.clearDepth(); r.render(this.vmScene, this.vmCamera) }
    if (post) { this.post.finish(); r.setRenderTarget(null) }
    if (this.noUI) return
    r.clearDepth()
    r.render(this.uiScene, this.uiCamera)
  }
}
