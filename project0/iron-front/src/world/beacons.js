// Lights that belong to the island at night: the lighthouses' beams sweeping round over the sea, and the
// red aircraft warning lights blinking on top of the radio masts, factory chimneys and the airbase tower.
// They come on at dusk and go off at dawn; all of them together are three draw calls.
import * as THREE from 'three'
import { BUILDINGS, PROPS } from './places.js'

const LEN = 320    // how far a beam reaches, in metres

function beamGeo() {
  // a long open cone along +x, bright at the lamp and fading to nothing at the far end
  const g = new THREE.CylinderGeometry(6, 0.5, LEN, 14, 8, true)
  g.rotateZ(Math.PI / 2); g.translate(LEN / 2, 0, 0)
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) { const f = Math.pow(1 - pos.getX(i) / LEN, 2.6); col[i * 3] = f; col[i * 3 + 1] = f * 0.95; col[i * 3 + 2] = f * 0.8 }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

export class Beacons {
  constructor(engine) {
    this.engine = engine
    // the lighthouses: two opposed beams on each, turning
    this.houses = PROPS.filter(p => p.kind === 'lighthouse').map(p => ({ x: p.x, y: p.y + 25.6, z: p.z }))
    const bm = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    this.beams = new THREE.InstancedMesh(beamGeo(), bm, Math.max(1, this.houses.length * 2))
    this.beams.frustumCulled = false; this.beams.count = 0
    engine.world.add(this.beams)
    // red warning lights: mast tops, chimney tops, the control tower's roof
    this.reds = []
    for (const b of BUILDINGS) {
      if (b.type === 'mast') this.reds.push({ x: b.x, y: b.y + (b.h || 30) + 0.4, z: b.z })
      if (b.type === 'controltower') this.reds.push({ x: b.x, y: b.y + 6 * 3.2 + 4, z: b.z })
    }
    for (const p of PROPS) if (p.kind === 'chimney') this.reds.push({ x: p.x, y: p.y + 50.6, z: p.z })
    const rm = new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false })
    this.red = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), rm, Math.max(1, this.reds.length))
    this.red.frustumCulled = false; this.red.count = 0
    engine.world.add(this.red)
    // the lamp glow on the lighthouses, seen from afar
    const gm = new THREE.MeshBasicMaterial({ color: 0xfff1c0, fog: false })
    this.glow = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), gm, Math.max(1, this.houses.length))
    this.glow.frustumCulled = false; this.glow.count = 0
    engine.world.add(this.glow)
    this.t = 0
  }
  update(dt, cam, sky) {
    this.t += dt
    const on = sky.night > 0.3
    if (!on) { this.beams.count = this.red.count = this.glow.count = 0; return }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0)
    // beams: a turn every 12 s
    let n = 0
    this.houses.forEach((h, i) => {
      for (const k of [0, Math.PI]) {
        Q.setFromAxisAngle(Y, this.t * (Math.PI * 2 / 12) + k + i)
        M.compose(P.set(h.x, h.y, h.z), Q, S); this.beams.setMatrixAt(n++, M)
      }
    })
    this.beams.count = n; this.beams.instanceMatrix.needsUpdate = true
    // lamps and warning lights keep about the same size on screen however far off they are
    const size = (x, y, z, px) => Math.max(0.35, Math.hypot(x - cam.x, y - cam.y, z - cam.z) * px)
    Q.identity()
    this.houses.forEach((h, i) => { S.setScalar(size(h.x, h.y, h.z, 0.004)); M.compose(P.set(h.x, h.y, h.z), Q, S); this.glow.setMatrixAt(i, M) })
    this.glow.count = this.houses.length; this.glow.instanceMatrix.needsUpdate = true
    // warning lights: on for 0.4 s in every 1.4 s, all together
    const blink = (this.t % 1.4) < 0.4
    let m = 0
    if (blink) for (const r of this.reds) { S.setScalar(size(r.x, r.y, r.z, 0.0028)); M.compose(P.set(r.x, r.y, r.z), Q, S); this.red.setMatrixAt(m++, M) }
    this.red.count = m; this.red.instanceMatrix.needsUpdate = true
  }
}
