// Draws every soldier on the island (the player in third person, AI, other players) as low-poly figures:
// one instanced mesh per body part, so a hundred soldiers are a handful of draw calls. Each frame the
// pose of each soldier (stance, walk cycle, aim, lean, reload, death) is turned into a matrix per part.
// Arms reach the weapon by two-bone IK: the right hand on the grip, the left on the handguard.
import * as THREE from 'three'
import { lin } from '../core/color.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildWeapon, HELD } from '../combat/weapon-models.js'
import { weapon } from '../combat/weapons-data.js'
import { FACTIONS } from './factions.js'
import { hash2 } from '../core/noise.js'

const MAX = 320
// Geometry for a part: boxes, pivot at the joint, with vertex colours that multiply the instance colour
// (the faction's uniform, gear, skin or headgear). Uniform parts get a camouflage: blotches of dark green,
// brown and light from a noise at each face's position (the same pattern across a soldier's body). A box's
// `shade` darkens it (straps, boots, gloves); a negative shade keeps it out of the camouflage.
const TONES = [[0.62, 0.68, 0.57], [0.95, 0.84, 0.7], [1.13, 1.11, 1.0], [1, 1, 1]].map(t => t.map(lin))
function camoAt(x, y, z, seed) {
  const n = hash2(Math.floor(x * 9 + y * 3), Math.floor(y * 9 - z * 4), seed) * 0.55 + hash2(Math.floor(x * 4), Math.floor(y * 4 + z * 4), seed + 1) * 0.45
  return n < 0.26 ? 0 : n < 0.44 ? 1 : n > 0.8 ? 2 : 3
}
function partGeo(boxes, camo = true, seed = 1) {
  const gs = []
  for (const [w, h, d, x, y, z, shade = 1] of boxes) {
    const seg = camo && shade > 0 ? 3 : 1
    const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg).toNonIndexed()
    g.translate(x, y, z)
    const p = g.attributes.position, n = p.count, c = new Float32Array(n * 3)
    const sh = lin(Math.abs(shade))
    // per quad (two triangles), so blotches are square patches rather than diagonal slivers
    for (let i = 0; i < n; i += 6) {
      let cx = 0, cy = 0, cz = 0
      for (let j = 0; j < 6; j++) { cx += p.getX(i + j); cy += p.getY(i + j); cz += p.getZ(i + j) }
      const tone = camo && shade > 0 ? TONES[camoAt(cx / 6, cy / 6, cz / 6, seed)] : TONES[3]
      const v = camo ? 1 : 0.94 + 0.12 * hash2(i, seed, 9)
      for (let j = 0; j < 6; j++) { c[(i + j) * 3] = tone[0] * sh * v; c[(i + j) * 3 + 1] = tone[1] * sh * v; c[(i + j) * 3 + 2] = tone[2] * sh * v }
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    g.deleteAttribute('uv')
    gs.push(g)
  }
  return mergeGeometries(gs)
}
const PARTS = {
  // pelvis with a belt, a buckle and a pouch on the hip
  pelvis: partGeo([[0.32, 0.18, 0.2, 0, 0, 0], [0.34, 0.05, 0.22, 0, 0.07, 0, -0.45], [0.05, 0.035, 0.012, 0, 0.07, 0.112, -0.8], [0.06, 0.09, 0.07, 0.17, 0.02, -0.02, -0.55]], true, 1),
  torso: partGeo([[0.36, 0.5, 0.22, 0, 0.25, 0], [0.2, 0.05, 0.2, 0, 0.5, 0, 0.9]], true, 2),
  // a plate carrier: front and back plates, three magazine pouches, an admin pouch, a radio with its aerial
  vest: partGeo([[0.38, 0.32, 0.06, 0, 0.27, 0.115], [0.38, 0.32, 0.06, 0, 0.27, -0.115], [0.41, 0.1, 0.25, 0, 0.17, 0], [0.07, 0.12, 0.25, 0.17, 0.33, 0, 0.9], [0.07, 0.12, 0.25, -0.17, 0.33, 0, 0.9],
    [0.09, 0.1, 0.05, -0.1, 0.17, 0.165, 0.85], [0.09, 0.1, 0.05, 0.0, 0.17, 0.165, 0.85], [0.09, 0.1, 0.05, 0.1, 0.17, 0.165, 0.85], [0.16, 0.07, 0.035, 0, 0.32, 0.16, 0.8],
    [0.08, 0.13, 0.06, 0.12, 0.3, -0.17, 0.7], [0.012, 0.32, 0.012, 0.15, 0.5, -0.17, 0.4]], false, 3),
  pack: partGeo([[0.32, 0.4, 0.16, 0, 0.27, -0.2], [0.26, 0.12, 0.1, 0, 0.13, -0.3, 0.9], [0.3, 0.06, 0.17, 0, 0.5, -0.2, 0.8], [0.06, 0.25, 0.08, 0.17, 0.25, -0.2, 0.85], [0.06, 0.25, 0.08, -0.17, 0.25, -0.2, 0.85]], false, 4),
  // a face: eyes, brows, nose, mouth and ears
  head: partGeo([[0.19, 0.23, 0.21, 0, 0.13, 0.01], [0.04, 0.022, 0.01, 0.045, 0.155, 0.118, 0.22], [0.04, 0.022, 0.01, -0.045, 0.155, 0.118, 0.22], [0.05, 0.012, 0.012, 0.045, 0.178, 0.119, 0.45], [0.05, 0.012, 0.012, -0.045, 0.178, 0.119, 0.45],
    [0.03, 0.05, 0.03, 0, 0.12, 0.125, 0.92], [0.06, 0.012, 0.01, 0, 0.07, 0.118, 0.55], [0.025, 0.05, 0.04, 0.1, 0.13, 0.0, 0.88], [0.025, 0.05, 0.04, -0.1, 0.13, 0.0, 0.88]], false, 5),
  // a rounded helmet: dome, brim, chin strap, night-vision mount
  helmet: partGeo([[0.24, 0.07, 0.26, 0, 0.3, 0.0], [0.27, 0.06, 0.29, 0, 0.255, 0.0, 0.94], [0.2, 0.04, 0.22, 0, 0.345, 0.0], [0.04, 0.025, 0.04, 0, 0.27, 0.15, -0.35], [0.012, 0.13, 0.012, 0.12, 0.17, 0.02, -0.3], [0.012, 0.13, 0.012, -0.12, 0.17, 0.02, -0.3]], false, 6),
  cap: partGeo([[0.22, 0.07, 0.23, 0, 0.255, 0.0], [0.18, 0.02, 0.1, 0, 0.225, 0.14, 0.9]], false, 7),
  upper: partGeo([[0.11, 0.3, 0.11, 0, -0.15, 0], [0.115, 0.06, 0.115, 0, -0.04, 0, 0.92]], true, 8),
  fore: partGeo([[0.095, 0.27, 0.095, 0, -0.135, 0], [0.085, 0.09, 0.07, 0, -0.31, 0.0, -0.4]], true, 9),
  // trousers with a cargo pocket
  thigh: partGeo([[0.15, 0.44, 0.16, 0, -0.22, 0], [0.04, 0.12, 0.1, 0.085, -0.25, 0, 0.88]], true, 10),
  // knee pad and boot
  shin: partGeo([[0.13, 0.42, 0.14, 0, -0.21, 0], [0.12, 0.09, 0.04, 0, -0.03, 0.08, -0.4], [0.145, 0.12, 0.28, 0, -0.44, 0.05, -0.32]], true, 11),
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
      return _c.setRGB(lin(c[0]), lin(c[1]), lin(c[2]))
    }
    const far = camPos && (s.pos.x - camPos.x) ** 2 + (s.pos.z - camPos.z) ** 2 > 360 * 360
    // root: feet on the ground, facing yaw (+z forward)
    const root = _root.makeRotationY(s.yaw).setPosition(s.pos.x, s.pos.y, s.pos.z)
    const crouch = Math.min(1, s.stanceT), prone = Math.max(0, s.stanceT - 1)
    const dead = s.deadT || 0
    if (s.dead || dead > 0) return this.drawDead(s, root, col)
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
  // A death: the knees give and the body slumps (0.3 s), then it topples the way the hit pushed it, faster
  // and faster, arms flung out, lands with a little bounce and lies sprawled: legs apart, one knee bent, the
  // head rolled to one side, the arms out or one caught under. The rifle falls beside the body. Each soldier
  // falls a little differently (from his id); someone already lying down just slumps where he is.
  drawDead(s, root, col) {
    const t = s.deadT || 0, h = hash2(s.id | 0, 7, 51), h2 = hash2(s.id | 0, 8, 52)
    const sm = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k) }
    const proneDeath = s.deathProne
    const back = !proneDeath && (s.fallDir || 1) < 0
    const buckle = proneDeath ? 1 : sm(0, 0.3, t)
    const f0 = proneDeath ? 1 : Math.max(0, Math.min(1, (t - 0.12) / 0.55)), fall = f0 * f0
    const land = t - 0.67, bounce = !proneDeath && land > 0 ? Math.exp(-land * 8) * Math.sin(land * 28) * 0.07 : 0
    const sgn = back ? -1 : 1
    const twist = (h - 0.5) * 1.1 * fall
    // the body: lifted by its own thickness as it lies, rotated over the feet towards the fall
    const body = _body.copy(root).multiply(_m.makeRotationY(twist)).multiply(_m2.makeTranslation(0, 0.13 * fall, 0)).multiply(_m3.makeRotationX(sgn * (Math.PI / 2 - 0.04) * (fall - bounce)))
    // knees give: the pelvis sinks while standing, and lies on the ground once down
    const pelvisY = 0.95 - 0.3 * buckle * (1 - fall) - 0.62 * fall
    const pel = _pel.copy(body).multiply(_m.makeTranslation(0, pelvisY, 0)).multiply(_m2.makeRotationZ((h2 - 0.5) * 0.3 * fall))
    this.put('pelvis', pel, col('uniform'))
    for (const side of [1, -1]) {
      // legs: buckled at the knee as he drops, then spread, the one bent more on one side
      const bentLeg = (side > 0) === (h > 0.5)
      const spread = side * (0.12 + 0.18 * fall * (bentLeg ? 0.6 : 1.2))
      const thighA = -0.55 * buckle * (1 - fall) + (back ? 0.15 : -0.2) * fall + (bentLeg ? -0.5 * fall : 0)
      const kneeA = 1.3 * buckle * (1 - fall) + (bentLeg ? 1.1 : 0.15) * fall
      const hip = _hip.copy(pel).multiply(_m.makeTranslation(side * 0.09, -0.07, 0)).multiply(_m2.makeRotationX(thighA)).multiply(_m3.makeRotationZ(spread))
      this.put('thigh', hip, col('uniform'))
      this.put('shin', _knee.copy(hip).multiply(_m.makeTranslation(0, -0.44, 0)).multiply(_m2.makeRotationX(kneeA)), col('uniform'))
    }
    // the trunk slumps forward as the knees go, then lies flat (a little twist)
    const slump = 0.45 * buckle * (1 - fall)
    const spine = _spine.copy(pel).multiply(_m.makeTranslation(0, 0.07, 0)).multiply(_m2.makeRotationX(slump)).multiply(_m3.makeRotationY((h2 - 0.5) * 0.4 * fall))
    this.put('torso', spine, col('uniform'))
    if (!s.noVest) this.put('vest', spine, col('gear'))
    if (s.pack) this.put('pack', spine, col('gear'))
    const F = FACTIONS[s.faction] || FACTIONS.vdf
    const neck = _neck.copy(spine).multiply(_m.makeTranslation(0, 0.5, 0)).multiply(_m2.makeRotationX(0.5 * buckle * (1 - fall) - 0.2 * fall * sgn)).multiply(_m3.makeRotationZ((h > 0.5 ? 1 : -1) * 0.75 * fall))
    this.put('head', neck, col('skin'))
    const hg = s.headgear || F.headgear
    if (hg === 'helmet') this.put('helmet', neck, col('helmet')); else if (hg !== 'none') this.put('cap', neck, col('helmet'))
    // arms: dropped from the gun, flung out with the fall, then splayed (or one caught under him)
    col('uniform')
    for (const side of [-1, 1]) {
      const under = !back && (side > 0) === (h2 > 0.6)
      // on his back the arms lie along the ground, spread or one thrown over the head; on his front, out or under
      const overhead = back && (side > 0) === (h > 0.45)
      const out = side * (0.25 + (under ? 0.1 : back ? (overhead ? 2.5 : 1.35) : 1.25) * fall) + side * 0.6 * Math.sin(Math.min(1, f0) * Math.PI) * (1 - fall * 0.5)
      const fwd = (under ? -0.3 : back ? -0.15 : -0.5) * fall - 0.5 * buckle * (1 - fall)
      const sh = _arm.copy(spine).multiply(_m.makeTranslation(side * 0.22, 0.44, 0)).multiply(_m2.makeRotationZ(out)).multiply(_m3.makeRotationX(fwd))
      this.put('upper', sh, _c)
      this.put('fore', _arm2.copy(sh).multiply(_m.makeTranslation(0, -0.3, 0)).multiply(_m2.makeRotationX(-0.25 - (under ? 1.2 : 0.4) * fall)), _c)
    }
    // the rifle: still in the hands for a moment, then on the ground beside him, on its side
    const kind = s.weaponKind || 'rifle'
    if (t < 0.25) this.put('w_' + kind, _gun.copy(spine).multiply(_m.makeTranslation(-0.13, 0.3 - t * 1.2, 0.3)).multiply(_m2.makeRotationX(0.6 + t * 2)), null)
    else this.put('w_' + kind, _gun.copy(root).multiply(_m.makeRotationY(h * 2.4 - 1.2)).multiply(_m2.makeTranslation((h2 - 0.5) * 1.2 + 0.35, 0.04, back ? 0.6 : 0.9)).multiply(_m3.makeRotationZ(Math.PI / 2)), null)
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
