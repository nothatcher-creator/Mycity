// Draws every soldier on the island (the player in third person, AI, other players) as low-poly figures:
// one instanced mesh per body part, so a hundred soldiers are a handful of draw calls. Each frame the
// pose of each soldier (stance, walk cycle, aim, lean, reload, death) is turned into a matrix per part.
// Arms reach the weapon by two-bone IK: the right hand on the grip, the left on the handguard.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildWeapon, HELD } from '../combat/weapon-models.js'
import { weapon } from '../combat/weapons-data.js'
import { FACTIONS } from './factions.js'
import { hash2 } from '../core/noise.js'

const MAX = 320
// Geometry for a part: boxes with a camouflage of lighter and darker faces (vertex colour multiplies the
// instance colour), pivot at the joint.
function partGeo(boxes, camo = true, seed = 1) {
  const gs = []
  let k = 0
  for (const [w, h, d, x, y, z, shade = 1] of boxes) {
    const g = new THREE.BoxGeometry(w, h, d, camo ? 2 : 1, camo ? 2 : 1, camo ? 2 : 1).toNonIndexed()
    g.translate(x, y, z)
    const n = g.attributes.position.count, c = new Float32Array(n * 3)
    for (let i = 0; i < n; i += 3) {
      const v = camo ? 0.78 + 0.44 * hash2(i + k * 977, seed, 9) : 1
      const tone = camo && hash2(i + k, seed, 10) < 0.18 ? 0.7 : 1
      for (let j = 0; j < 3; j++) { c[(i + j) * 3] = v * shade * tone; c[(i + j) * 3 + 1] = v * shade * tone; c[(i + j) * 3 + 2] = v * shade * tone }
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    g.deleteAttribute('uv')
    gs.push(g); k++
  }
  return mergeGeometries(gs)
}
const PARTS = {
  pelvis: partGeo([[0.32, 0.18, 0.2, 0, 0, 0]], true, 1),
  torso: partGeo([[0.36, 0.5, 0.22, 0, 0.25, 0]], true, 2),
  vest: partGeo([[0.4, 0.36, 0.27, 0, 0.26, 0.005], [0.1, 0.1, 0.05, -0.1, 0.18, 0.14, 0.85], [0.1, 0.1, 0.05, 0.0, 0.18, 0.14, 0.85], [0.1, 0.1, 0.05, 0.1, 0.18, 0.14, 0.85]], false, 3),
  pack: partGeo([[0.32, 0.4, 0.16, 0, 0.27, -0.2], [0.26, 0.12, 0.1, 0, 0.13, -0.3, 0.9]], false, 4),
  head: partGeo([[0.19, 0.23, 0.21, 0, 0.13, 0.01]], false, 5),
  helmet: partGeo([[0.25, 0.1, 0.27, 0, 0.27, 0.0], [0.22, 0.06, 0.24, 0, 0.215, 0.0, 0.92]], false, 6),
  cap: partGeo([[0.22, 0.07, 0.23, 0, 0.255, 0.0], [0.18, 0.02, 0.1, 0, 0.225, 0.14, 0.9]], false, 7),
  upper: partGeo([[0.11, 0.3, 0.11, 0, -0.15, 0]], true, 8),
  fore: partGeo([[0.095, 0.27, 0.095, 0, -0.135, 0], [0.085, 0.09, 0.07, 0, -0.31, 0.0, 0.75]], true, 9),
  thigh: partGeo([[0.15, 0.44, 0.16, 0, -0.22, 0]], true, 10),
  shin: partGeo([[0.13, 0.42, 0.14, 0, -0.21, 0], [0.14, 0.1, 0.27, 0, -0.45, 0.05, 0.5]], true, 11),
}
// which colour each part takes from the faction: uniform, gear, skin, headgear
const SRC = { pelvis: 'uniform', torso: 'uniform', vest: 'gear', pack: 'gear', head: 'skin', helmet: 'helmet', cap: 'helmet', upper: 'uniform', fore: 'uniform', thigh: 'uniform', shin: 'uniform' }
const SKINS = [[0.88, 0.7, 0.56], [0.76, 0.56, 0.42], [0.55, 0.38, 0.27], [0.42, 0.3, 0.22], [0.92, 0.76, 0.64]]

export class Rig {
  constructor(world) {
    this.world = world
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    this.mesh = {}
    for (const [k, g] of Object.entries(PARTS)) {
      const n = k === 'upper' || k === 'fore' || k === 'thigh' || k === 'shin' ? MAX * 2 : MAX
      const m = new THREE.InstancedMesh(g, this.mat, n)
      m.count = 0; m.castShadow = true; m.frustumCulled = false
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
      world.add(m)
      this.mesh[k] = m
    }
    // held weapons: one instanced mesh per kind
    this.weaponGeo = {}
    for (const [kind, id] of Object.entries(HELD)) {
      const g = buildWeapon(weapon(id), {}).geometry.clone()
      g.rotateY(Math.PI)       // the rig's forward is +z
      const m = new THREE.InstancedMesh(g, this.mat, MAX)
      m.count = 0; m.castShadow = true; m.frustumCulled = false
      world.add(m)
      this.mesh['w_' + kind] = m
    }
    this.tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), e: new THREE.Euler() }
  }
  begin() { for (const m of Object.values(this.mesh)) m.count = 0 }
  end() {
    for (const m of Object.values(this.mesh)) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  }
  put(part, mat, color) {
    const m = this.mesh[part]
    if (m.count >= m.instanceMatrix.count) return
    m.setMatrixAt(m.count, mat)
    if (color && m.instanceColor) m.setColorAt(m.count, color)
    m.count++
  }

  // Draws soldier `s` (see Soldier: pos, yaw, aimPitch, stanceT, lean, speed, phase, aimW, reloadT, dead...).
  draw(s, camPos) {
    const F = FACTIONS[s.faction] || FACTIONS.vdf
    const T = this.tmp
    const col = (src) => {
      const c = src === 'skin' ? SKINS[s.skin % SKINS.length] : src === 'uniform' ? (s.uniform || F.uniform) : src === 'gear' ? (s.gearColor || F.gear) : (s.helmetColor || F.helmet)
      return _c.setRGB(c[0], c[1], c[2])
    }
    const far = camPos && (s.pos.x - camPos.x) ** 2 + (s.pos.z - camPos.z) ** 2 > 360 * 360
    // root: feet on the ground, facing yaw (+z forward)
    const root = _root.makeRotationY(s.yaw).setPosition(s.pos.x, s.pos.y, s.pos.z)
    const crouch = Math.min(1, s.stanceT), prone = Math.max(0, s.stanceT - 1)
    const dead = s.deadT || 0
    // walk cycle
    const amp = Math.min(1, s.speed / 3.5) * (1 - prone)
    const ph = s.phase || 0
    // the body: pelvis height, lean forward, prone rotation, death
    const pelvisY = 0.95 - 0.33 * crouch - 0.46 * prone - Math.abs(Math.sin(ph * 2)) * 0.03 * amp
    let body = _body.copy(root)
    if (dead > 0) {
      // fall back and lie still
      const t = Math.min(1, dead * 2.2)
      body.multiply(_m.makeTranslation(0, 0.12 * t, -0.5 * t)).multiply(_m2.makeRotationX(-Math.PI / 2 * t * (s.fallDir || 1)))
    } else if (prone > 0) body.multiply(_m.makeTranslation(0, 0.17 * prone, -0.35 * prone)).multiply(_m2.makeRotationX(Math.PI / 2 * prone * 0.96))
    const pel = _pel.copy(body).multiply(_m.makeTranslation(0, pelvisY + (dead > 0 ? -0.75 * Math.min(1, dead * 2.2) : 0), 0))
    // lean: roll the upper body
    const leanR = -(s.lean || 0) * 0.32
    this.put('pelvis', pel, col('uniform'))
    // legs
    for (const side of [1, -1]) {
      const swing = Math.sin(ph + (side > 0 ? 0 : Math.PI)) * 0.55 * amp
      const thighA = -swing - 1.25 * crouch * (1 - prone) - (prone ? 0.05 : 0) + (dead ? 0.1 : 0)
      const kneeA = Math.max(0, Math.sin(ph + (side > 0 ? 0 : Math.PI) + 1.2)) * 0.8 * amp + 2.0 * crouch * (1 - prone) + (prone ? 0.15 : 0)
      const hip = _hip.copy(pel).multiply(_m.makeTranslation(side * 0.09, -0.07, 0)).multiply(_m2.makeRotationX(thighA)).multiply(_m3.makeRotationZ(side * (0.04 + 0.08 * prone)))
      this.put('thigh', hip, col('uniform'))
      const knee = _knee.copy(hip).multiply(_m.makeTranslation(0, -0.44, 0)).multiply(_m2.makeRotationX(kneeA))
      this.put('shin', knee, col('uniform'))
    }
    // spine: lean forward when crouched or sprinting, roll with the lean
    const spineP = 0.12 * crouch + (s.sprint ? 0.2 : 0) - 0.1 * prone
    const spine = _spine.copy(pel).multiply(_m.makeTranslation(0, 0.07, 0)).multiply(_m2.makeRotationZ(leanR)).multiply(_m3.makeRotationX(spineP))
    this.put('torso', spine, col('uniform'))
    if (!s.noVest) this.put('vest', spine, col('gear'))
    if (s.pack) this.put('pack', spine, col('gear'))
    // head and headgear look along the aim
    const aimP = s.aimPitch || 0
    const neck = _neck.copy(spine).multiply(_m.makeTranslation(0, 0.5, 0.0)).multiply(_m2.makeRotationX(-aimP * 0.7 - spineP * 0.5 - prone * 1.2))
    this.put('head', neck, col('skin'))
    const hg = s.headgear || F.headgear
    if (hg === 'helmet') this.put('helmet', neck, col('helmet'))
    else if (hg !== 'none') this.put('cap', neck, col('helmet'))
    // the weapon: held in an aim frame at the shoulders, pitched with the aim; lowered when not aiming
    const kind = s.weaponKind || 'rifle'
    const aimW = s.aimW ?? 1
    const lower = (1 - aimW) * 0.65 + (s.sprint ? 0.5 : 0) + (s.reloadT > 0 ? 0.35 : 0)
    const aimFrame = _aim.copy(spine).multiply(_m.makeTranslation(0, 0.42, 0)).multiply(_m2.makeRotationX(-aimP - spineP + lower + (prone ? -prone * 1.45 : 0)))
    let wx = -0.13, wy = -0.08, wz = 0.3
    if (kind === 'pistol') { wx = -0.04; wy = -0.05; wz = 0.42 }
    if (kind === 'launcher') { wx = -0.16; wy = 0.12; wz = 0.12 }
    if (dead) wy -= 0.4
    const gun = _gun.copy(aimFrame).multiply(_m.makeTranslation(wx, wy, wz))
    if (!dead || dead < 0.5) this.put('w_' + kind, gun, null)
    // arms by IK: right hand to the grip, left hand to the support point (or to the magazine while reloading)
    const grip = _v1.set(0, 0, 0).applyMatrix4(gun)
    let support
    if (s.reloadT > 0 && s.reloadT < 0.75) support = _v2.set(0, -0.12 - Math.sin(s.reloadT * 8) * 0.06, -0.06).applyMatrix4(_m4.copy(gun).multiply(_m5.makeRotationY(Math.PI)))
    else if (kind === 'pistol') support = _v2.set(0.02, -0.02, -0.02).applyMatrix4(gun)
    else support = _v2.set(0.0, -0.01, 0.3).applyMatrix4(gun)
    col('uniform')
    for (const side of [-1, 1]) {
      const shoulder = _v3.set(side * 0.22, 0.44, 0).applyMatrix4(spine)
      const target = side < 0 ? grip : support
      this.arm(shoulder, target, side, spine, dead && dead > 0.3 ? null : true)
    }
  }
  // Two-bone arm from the shoulder to the hand target (elbow bending down and out).
  arm(S, Tgt, side, spine, reach) {
    const L1 = 0.3, L2 = 0.32
    const d = _d.subVectors(Tgt, S)
    let len = d.length()
    if (!reach || len < 0.01) {
      // hang down
      const m = _arm.copy(spine).multiply(_m.makeTranslation(side * 0.22, 0.44, 0)).multiply(_m2.makeRotationZ(side * 0.1))
      this.put('upper', m, _c); this.put('fore', _arm2.copy(m).multiply(_m.makeTranslation(0, -0.3, 0)), _c)
      return
    }
    len = Math.min(len, L1 + L2 - 0.001)
    d.normalize()
    // the pole: down and outward from the body
    const pole = _p.set(side * 0.6, -1, -0.2).transformDirection(spine)
    const a = (L1 * L1 - L2 * L2 + len * len) / (2 * len)
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a))
    const perp = pole.addScaledVector(d, -pole.dot(d)).normalize()
    const E = _e.copy(S).addScaledVector(d, a).addScaledVector(perp, h)
    const H = _h.copy(S).addScaledVector(d, len)
    // upper arm: local -y along S->E; forearm: -y along E->H
    this.limb('upper', S, E)
    this.limb('fore', E, H)
  }
  limb(part, A, B) {
    const dir = _dir.subVectors(B, A).normalize()
    _q.setFromUnitVectors(DOWN, dir)
    _mm.compose(A, _q, ONE)
    this.put(part, _mm, _c)
  }
}
const DOWN = new THREE.Vector3(0, -1, 0), ONE = new THREE.Vector3(1, 1, 1)
const _c = new THREE.Color(), _root = new THREE.Matrix4(), _body = new THREE.Matrix4(), _pel = new THREE.Matrix4(), _hip = new THREE.Matrix4(), _knee = new THREE.Matrix4()
const _spine = new THREE.Matrix4(), _neck = new THREE.Matrix4(), _aim = new THREE.Matrix4(), _gun = new THREE.Matrix4(), _arm = new THREE.Matrix4(), _arm2 = new THREE.Matrix4(), _mm = new THREE.Matrix4()
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _m4 = new THREE.Matrix4(), _m5 = new THREE.Matrix4()
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3(), _h = new THREE.Vector3(), _dir = new THREE.Vector3()
const _q = new THREE.Quaternion()
