// Rain and lightning. The rain is one mesh of short streaks in a 70 x 36 x 70 m box that stays round the
// camera; a vertex shader moves every streak down (and with the wind) and wraps it round the box, so it costs
// one draw call. How much falls follows the weather's `rain`. Storms add lightning: a flash over the screen
// and thunder a moment later, as far away as the gap suggests.
import * as THREE from 'three'
import { ANCHOR } from '../core/engine.js'

const BOX = new THREE.Vector3(70, 36, 70)

export class Rain {
  constructor(engine, quality) {
    this.engine = engine
    const n = quality === 'low' ? 1400 : 3000
    this.max = n
    const pos = new Float32Array(n * 2 * 3), end = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      const x = Math.random() * BOX.x, y = Math.random() * BOX.y, z = Math.random() * BOX.z
      pos.set([x, y, z, x, y, z], i * 6); end[i * 2 + 1] = 1
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('end', new THREE.BufferAttribute(end, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5)
    this.uniforms = { uTime: { value: 0 }, uShift: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() }, uAlpha: { value: 0 } }
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      vertexShader: `
attribute float end;
uniform float uTime; uniform vec3 uShift; uniform vec2 uWind;
const vec3 BOX = vec3(${BOX.x.toFixed(1)}, ${BOX.y.toFixed(1)}, ${BOX.z.toFixed(1)});
varying float vEnd;
void main() {
  vec3 vel = vec3(uWind.x, -11.0, uWind.y);
  // fall, drift, and wrap round the box (which moves with the camera through uShift)
  vec3 p = mod(position + vel * uTime - uShift, BOX) - BOX * 0.5;
  p -= vel * 0.045 * end;        // the streak's tail
  vEnd = end;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`,
      fragmentShader: `
uniform float uAlpha; varying float vEnd;
void main() { gl_FragColor = vec4(0.78, 0.82, 0.88, uAlpha * (0.35 + 0.65 * (1.0 - vEnd))); }`,
    })
    this.mesh = new THREE.LineSegments(g, m)
    this.mesh.frustumCulled = false
    this.mesh.position.copy(ANCHOR)
    this.mesh.renderOrder = 5
    engine.scene.add(this.mesh)
    // the lightning flash: a white sheet over the 3D view (under the interface)
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0, depthTest: false, depthWrite: false })
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.flashMat)
    this.flash.frustumCulled = false; this.flash.renderOrder = -10
    engine.uiScene.add(this.flash)
    this.flashT = 0; this.nextBolt = 10; this.thunder = []
  }
  update(dt, camPos, sky, sfx) {
    const r = sky.w.rain || 0, u = this.uniforms
    this.mesh.visible = r > 0.02
    u.uTime.value += dt
    // the box follows the camera: the streaks keep their place on the island as you move
    u.uShift.value.set(camPos.x, camPos.y, camPos.z)
    const wind = sky.w.wind || 0
    u.uWind.value.set(Math.sin(sky.windDir || 0) * wind * 0.4, Math.cos(sky.windDir || 0) * wind * 0.4)
    u.uAlpha.value = Math.min(0.55, r * 0.6) * (camPos.y > 900 ? 0 : 1)
    this.mesh.geometry.setDrawRange(0, Math.floor(this.max * Math.min(1, r)) * 2)
    // lightning in a storm
    if (r > 0.85 && dt > 0) {
      this.nextBolt -= dt
      if (this.nextBolt <= 0) {
        this.nextBolt = 7 + Math.random() * 16
        this.flashT = 1
        const far = 300 + Math.random() * 2500
        this.thunder.push({ t: far / 340, v: Math.min(1, 900 / far) })
      }
    }
    for (const th of this.thunder) { th.t -= dt; if (th.t <= 0) { sfx?.play(th.v > 0.6 ? 'explosion' : 'explosion_far', th.v * 0.8, 0.55 + Math.random() * 0.1); th.done = true } }
    this.thunder = this.thunder.filter(t => !t.done)
    this.flashT = Math.max(0, this.flashT - dt * 3)
    const e = this.engine
    this.flash.scale.set(e.width, e.height, 1); this.flash.position.set(e.width / 2, -e.height / 2, -1)
    // a double flicker
    this.flashMat.opacity = this.flashT > 0 ? (this.flashT > 0.7 || (this.flashT > 0.3 && this.flashT < 0.45) ? 0.45 : 0.12) * Math.min(1, this.flashT * 3) : 0
    this.flash.visible = this.flashMat.opacity > 0.001
  }
}
