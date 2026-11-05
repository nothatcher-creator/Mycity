// The frame: three scenes drawn in order (the world, the first-person weapon, the 2D interface), and the
// floating origin. The camera never leaves the lot: it stays at ANCHOR, inside the lot's box, and the
// whole island (the `world` group) moves round it, so a 12 km world plays inside a 12 m lot. Everything
// in the game works in island metres ("virtual" coordinates); only this file knows about the anchor.
import * as THREE from 'three'

export const ANCHOR = new THREE.Vector3(0, 9.5, 0)

export const QUALITY = {
  low: { name: 'Low', pixel: 0.75, dpr: 1, shadows: false, view: 1800, trees: 0.45, aiNear: 18, grass: false, msaa: false },
  medium: { name: 'Medium', pixel: 1, dpr: 1.5, shadows: false, view: 2800, trees: 0.75, aiNear: 32, grass: true, msaa: false },
  high: { name: 'High', pixel: 1, dpr: 2, shadows: true, view: 4000, trees: 1, aiNear: 48, grass: true, msaa: true },
}

export class Engine {
  constructor(p0) {
    this.p0 = p0
    this.renderer = p0.renderer
    this.scene = p0.scene
    this.camera = p0.camera
    this.world = new THREE.Group()
    this.world.name = 'world'
    this.scene.add(this.world)
    this.camPos = new THREE.Vector3()        // where the camera is on the island
    this.camQuat = new THREE.Quaternion()
    this.fov = 70
    // the first-person weapon: its own scene and camera so it never clips into walls
    this.vmScene = new THREE.Scene()
    this.vmCamera = new THREE.PerspectiveCamera(55, 1, 0.01, 10)
    this.vmScene.add(new THREE.HemisphereLight(0xfff8ee, 0x3a3a34, 1.05))
    this.vmSun = new THREE.DirectionalLight(0xfff2dd, 1.5)
    this.vmSun.position.set(0.4, 1, 0.3)
    this.vmScene.add(this.vmSun)
    // the interface: pixel coordinates, (0, 0) at the top left
    this.uiScene = new THREE.Scene()
    this.uiCamera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10)
    this.width = p0.width; this.height = p0.height
    this.qualityKey = 'medium'
    this.quality = QUALITY.medium
    this.p0.autoRender = false
    this.renderer.autoClear = false
    this.camera.near = 0.15
    this.camera.far = 6000
    this.camera.position.copy(ANCHOR)
    this.frameMs = 16
    this.slowFrames = 0
    this.resize()
    p0.on('resize', () => this.resize())
  }
  setQuality(key) {
    this.qualityKey = key
    this.quality = QUALITY[key]
    this.resize()
  }
  resize() {
    const w = this.p0.width, h = this.p0.height
    this.width = w; this.height = h
    // `relief` (0..1) is set while play keeps hitching: fewer pixels to draw
    // the screen's density (up to the setting's limit) x the setting's share x the player's resolution choice;
    // very wide windows stop at about 2560 drawn pixels across
    const pr = Math.min(this.p0.pixelRatio || 1, this.quality.dpr || 2) * this.quality.pixel * (this.resScale || 1) * Math.min(1, 2560 / Math.max(w, 1)) * (1 - 0.35 * (this.relief || 0))
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
  // Puts the camera at island point `pos` looking along `quat`: the island moves so that point sits on the anchor.
  setView(pos, quat, fov) {
    this.camPos.copy(pos)
    this.camQuat.copy(quat)
    this.world.position.set(ANCHOR.x - pos.x, ANCHOR.y - pos.y, ANCHOR.z - pos.z)
    this.camera.position.copy(ANCHOR)
    this.camera.quaternion.copy(quat)
    if (fov) fov = this.widen(fov)
    if (fov && Math.abs(fov - this.camera.fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix() }
  }
  // On narrow screens (phones held upright) the field of view is kept as wide sideways as on a 1.3:1 screen.
  widen(fov) {
    const a = this.width / Math.max(1, this.height)
    if (a >= 1.3) return fov
    return Math.min(115, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * 1.3 / a)))
  }
  // Island coordinates to scene coordinates and back.
  toScene(v, out = new THREE.Vector3()) { return out.set(v.x + this.world.position.x, v.y + this.world.position.y, v.z + this.world.position.z) }
  render(drawViewmodel) {
    const r = this.renderer
    r.setRenderTarget(null)
    r.clear(true, true, true)
    if (this.uiOnly) { r.render(this.uiScene, this.uiCamera); return }
    r.render(this.scene, this.camera)
    if (drawViewmodel) { r.clearDepth(); r.render(this.vmScene, this.vmCamera) }
    r.clearDepth()
    r.render(this.uiScene, this.uiCamera)
  }
}
