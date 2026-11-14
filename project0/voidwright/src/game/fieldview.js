// Shows a gravity generator's field: the box it fills (or the ball, for a spherical one) as glowing edges,
// and arrows inside drifting the way it pulls. Shown while you hold a generator to place it and while you
// look at one close by, so you can see which way is down before you build round it.
import * as THREE from 'three'
import { QUATS } from '../grid/rot.js'

const COL = 0x5ff3e6
function arrowGeo() {
  const shaft = new THREE.CylinderGeometry(0.16, 0.16, 2.4, 8).translate(0, 0.6, 0)
  const head = new THREE.ConeGeometry(0.55, 1.3, 10).rotateX(Math.PI).translate(0, -1.25, 0)
  const pos = [], idx = []
  for (const gm of [shaft, head]) { const o = pos.length / 3, p = gm.attributes.position.array; for (let i = 0; i < p.length; i++) pos.push(p[i]); const ix = gm.index.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + o) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx)
  return g      // points down its -Y, 3.8 m long
}

export class FieldView {
  constructor(engine) {
    this.e = engine
    this.group = new THREE.Group(); this.group.visible = false; this.group.frustumCulled = false
    const lm = new THREE.LineBasicMaterial({ color: COL, transparent: true, opacity: 0.55, depthWrite: false, fog: false, toneMapped: false })
    this.box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), lm)
    // a ball as three great circles
    const circ = []
    for (let a = 0; a < 3; a++) for (let i = 0; i < 64; i++) for (const j of [i, i + 1]) { const t = j / 64 * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); circ.push(...(a === 0 ? [c, s, 0] : a === 1 ? [c, 0, s] : [0, c, s])) }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(circ, 3))
    this.ball = new THREE.LineSegments(cg, lm)
    this.arrows = new THREE.InstancedMesh(arrowGeo(), new THREE.MeshBasicMaterial({ color: COL, transparent: true, opacity: 0.32, depthWrite: false, fog: false, toneMapped: false }), 64)
    for (const o of [this.box, this.ball, this.arrows]) { o.frustumCulled = false; this.group.add(o) }
    engine.scene.add(this.group)
    this.t = 0; this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1)
    this.down = new THREE.Quaternion()
  }
  hide() { this.group.visible = false }
  // centre (world), the generator's own frame (world), and its block definition
  show(center, quat, def, dt) {
    const f = def.func.gravgen
    this.t += dt
    this.e.rel(center, this.group.position); this.group.quaternion.copy(quat); this.group.visible = true
    let n = 0
    if (f.sphere) {
      this.box.visible = false; this.ball.visible = true; this.ball.scale.setScalar(f.sphere)
      // arrows pointing in from all round, sliding inward
      const k = (this.t * 0.25) % 1
      for (let i = 0; i < 40 && n < 64; i++) {
        const y = 1 - (i + 0.5) / 40 * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996
        const dir = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r)
        this.p.copy(dir).multiplyScalar(f.sphere * (0.85 - k * 0.5))
        this.q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().negate())
        this.s.setScalar(1.3); this.m.compose(this.p, this.q, this.s); this.arrows.setMatrixAt(n++, this.m)
      }
    } else {
      this.ball.visible = false; this.box.visible = true; this.box.scale.set(f.half[0] * 2, f.half[1] * 2, f.half[2] * 2)
      // a lattice of arrows pointing to the generator's base, falling slowly
      const k = (this.t * 0.35) % 1
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) for (let l = 0; l < 4; l++) {
        if ((i === 1 || i === 2) && (l === 1 || l === 2)) continue     // none right round the generator
        const y = ((j + 1 - k) / 3 - 0.5) * f.half[1] * 2
        this.p.set((i - 1.5) * f.half[0] * 0.5, y, (l - 1.5) * f.half[2] * 0.5)
        this.s.setScalar(1.4); this.m.compose(this.p, this.q.identity(), this.s); this.arrows.setMatrixAt(n++, this.m)
      }
    }
    this.arrows.count = n; this.arrows.instanceMatrix.needsUpdate = true
  }
  // a generator block on a grid
  showBlock(g, b, dt) { this.show(g.toWorld(g.blockCenter(b)), g.quat.clone().multiply(QUATS[b.rot]), b.def, dt) }
}
