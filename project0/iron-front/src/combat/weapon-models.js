// Builds a weapon's model from its data: receiver, barrel, stock, magazine, handguard and sights, plus the
// attachments it carries. Frame: forward is -z, up is +y, the origin is at the trigger hand. Returns the
// geometry and the points the game needs: the sight line (for aiming down sights), the muzzle (for flash
// and bullets), the magazine (for reloads) and the support hand.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ATTACHMENTS } from './weapons-data.js'

const COL = {
  metal: [0.13, 0.13, 0.14], dark: [0.07, 0.07, 0.08], poly: [0.1, 0.1, 0.11], tan: [0.56, 0.48, 0.34], wood: [0.42, 0.25, 0.13],
  woodL: [0.52, 0.33, 0.17], olive: [0.3, 0.33, 0.2], steel: [0.32, 0.33, 0.35], green: [0.24, 0.3, 0.2], lens: [0.25, 0.45, 0.6],
  red: [0.7, 0.12, 0.08], brass: [0.7, 0.55, 0.2], sand: [0.6, 0.53, 0.38],
}
class Parts {
  constructor() { this.list = [] }
  add(g, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    g = g.index ? g.toNonIndexed() : g
    g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z)
    const n = g.attributes.position.count, c = new Float32Array(n * 3)
    // a slight darkening on downward faces reads as ambient occlusion
    g.computeVertexNormals()
    const nr = g.attributes.normal
    for (let i = 0; i < n; i++) { const s = 0.82 + 0.18 * (nr.getY(i) * 0.5 + 0.5); c[i * 3] = color[0] * s; c[i * 3 + 1] = color[1] * s; c[i * 3 + 2] = color[2] * s }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    g.deleteAttribute('uv')
    this.list.push(g)
  }
  box(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) { this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz) }
  cyl(r, len, color, x, y, z, seg = 8, r2 = r) { this.add(new THREE.CylinderGeometry(r2, r, len, seg), color, x, y, z, Math.PI / 2) }
  // an open tube along z: looking down a sight you see through it (its inside faces away and is not drawn)
  tube(r, len, color, x, y, z, seg = 12) { this.add(new THREE.CylinderGeometry(r, r, len, seg, 1, true), color, x, y, z, Math.PI / 2) }
  merged() { return mergeGeometries(this.list) }
}

export function buildWeapon(def, att = {}) {
  const P = new Parts(), m = def.model || {}
  const th = m.thick || 1
  const body = m.body
  const furn = m.hand === 'wood' || m.stock === 'wood' ? COL.wood : def.faction === 'nlf' ? COL.poly : def.cat === 'pistol' ? COL.poly : (def.id.charCodeAt(1) % 3 === 0 ? COL.tan : COL.poly)
  let barrelZ = -0.32, sightY = 0.075, sightZ = 0.0, muzzle = new THREE.Vector3(0, 0.04, -0.6), magPos = new THREE.Vector3(0, -0.07, -0.08), support = new THREE.Vector3(0, -0.02, -0.3)
  const bl = m.barrel || 0.4
  const grip = (z = 0.04, c = COL.poly) => P.box(0.032, 0.11, 0.045, c, 0, -0.06, z, 0.3)
  const trigger = () => P.box(0.01, 0.03, 0.05, COL.metal, 0, -0.025, -0.02)
  if (body === 'ar' || body === 'scar' || body === 'm14' || body === 'fal' || body === 'svd' || body === 'ak' || body === 'smg') {
    const recLen = body === 'smg' ? (m.compact ? 0.16 : 0.22) : 0.3
    const isAk = body === 'ak' || body === 'svd'
    P.box(0.055 * th, 0.075 * th, recLen, isAk ? COL.steel : COL.metal, 0, 0.02, -recLen / 2 + 0.06)
    if (!isAk) P.box(0.05 * th, 0.03, recLen + 0.02, COL.dark, 0, 0.068 * th, -recLen / 2 + 0.06)      // the upper rail
    else P.box(0.05, 0.025, recLen * 0.9, COL.steel, 0, 0.065, -recLen / 2 + 0.07)                    // the dust cover
    grip(0.05, isAk && m.hand === 'wood' ? COL.wood : COL.poly); trigger()
    // handguard and barrel
    const hgLen = body === 'smg' ? 0.12 : Math.min(0.32, bl * 0.65)
    const hgZ = -recLen + 0.06 - hgLen / 2
    if (m.hand === 'rail') { P.box(0.06 * th, 0.065 * th, hgLen, COL.metal, 0, 0.03, hgZ); for (let i = 0; i < 5; i++) P.box(0.064 * th, 0.012, 0.012, COL.dark, 0, 0.065 * th, hgZ - hgLen / 2 + 0.02 + i * hgLen / 5) }
    else if (m.hand === 'wood' || m.hand === 'poly') { P.box(0.058, 0.06, hgLen, m.hand === 'wood' ? COL.woodL : furn, 0, 0.018, hgZ); if (isAk) P.cyl(0.012, hgLen + 0.06, COL.steel, 0, 0.06, hgZ - 0.02) }
    else if (m.hand === 'jacket') { P.cyl(0.03, hgLen, COL.steel, 0, 0.03, hgZ, 8) }
    barrelZ = hgZ - hgLen / 2
    const bLen = Math.max(0.05, bl - hgLen + 0.1)
    P.cyl(0.011 * th, bLen, COL.dark, 0, 0.03, barrelZ - bLen / 2)
    muzzle.set(0, 0.03, barrelZ - bLen)
    if (m.brake) { P.cyl(0.018, 0.06, COL.metal, 0, 0.03, muzzle.z - 0.03); muzzle.z -= 0.06 }
    if (m.can) { P.cyl(0.022, 0.18, COL.dark, 0, 0.03, muzzle.z - 0.09, 10); muzzle.z -= 0.18 }
    // magazine
    if (m.mag === 'curved') { P.box(0.03, 0.12, 0.06, COL.metal, 0, -0.09, -0.06, 0.25); P.box(0.03, 0.09, 0.055, COL.metal, 0, -0.18, -0.03, 0.5); magPos.set(0, -0.12, -0.05) }
    else if (m.mag === 'stanag') { P.box(0.028, 0.15, 0.062, COL.dark, 0, -0.08, -0.07, 0.12); magPos.set(0, -0.1, -0.07) }
    else if (m.mag === 'box20') { P.box(0.032, 0.11, 0.07, COL.dark, 0, -0.06, -0.07, 0.06); magPos.set(0, -0.08, -0.07) }
    else if (m.mag === 'box10') { P.box(0.03, 0.07, 0.07, COL.dark, 0, -0.045, -0.07); magPos.set(0, -0.06, -0.07) }
    else if (m.mag === 'straight') { P.box(0.026, 0.16, 0.035, COL.dark, 0, -0.09, -0.06); magPos.set(0, -0.1, -0.06) }
    else if (m.mag === 'drum') { P.cyl(0.08, 0.07, COL.dark, 0, -0.1, -0.06, 14); P.add(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 14), COL.dark, 0, -0.1, -0.06, 0, 0, Math.PI / 2); magPos.set(0, -0.1, -0.06) }
    else if (m.mag === 'helical') { P.cyl(0.03, 0.26, COL.dark, 0, -0.02, -0.2, 10); magPos.set(0, -0.02, -0.2) }
    // stock
    stock(P, m.stock, furn, th)
    // front sight post and rear sight (when no optic)
    if (isAk || !def.rails) { P.box(0.006, 0.04, 0.01, COL.dark, 0, 0.06, muzzle.z + (m.can ? 0.2 : 0.04)); P.box(0.03, 0.018, 0.02, COL.dark, 0, 0.07, -0.06) }
    sightY = isAk ? 0.083 : 0.088 * th
    support.set(0, -0.0, hgZ)
    if (body === 'svd') { P.box(0.06, 0.04, 0.1, COL.wood, 0, 0.05, 0.18); }
    if (body === 'm14' || body === 'fal') { P.box(0.062, 0.05, bl * 0.8, COL.wood, 0, -0.005, -0.2) }
  } else if (body === 'bullpup') {
    P.box(0.062, 0.1, 0.6, COL.olive, 0, 0.0, -0.08)
    P.box(0.05, 0.02, 0.4, COL.dark, 0, 0.065, -0.12)
    grip(-0.15); P.box(0.01, 0.03, 0.05, COL.metal, 0, -0.025, -0.2)
    P.box(0.03, 0.14, 0.06, COL.dark, 0, -0.1, 0.07, -0.1); magPos.set(0, -0.11, 0.07)
    const bLen = Math.max(0.12, bl - 0.32)
    P.cyl(0.012, bLen, COL.dark, 0, 0.02, -0.38 - bLen / 2)
    muzzle.set(0, 0.02, -0.38 - bLen)
    P.box(0.05, 0.05, 0.08, COL.olive, 0, -0.03, 0.26)
    if (m.long) P.box(0.04, 0.03, 0.15, COL.dark, 0, -0.02, -0.4)
    sightY = 0.088; support.set(0, -0.02, -0.3)
    // the trigger hand is forward on a bullpup: shift the origin there
    for (const g of P.list) g.translate(0, 0, 0.15)
    muzzle.z += 0.15; magPos.z += 0.15; support.z += 0.15
  } else if (body === 'p90') {
    P.box(0.07, 0.11, 0.38, COL.poly, 0, 0.0, -0.06)
    P.box(0.05, 0.03, 0.3, COL.lens, 0, 0.07, -0.08); magPos.set(0, 0.07, -0.08)
    P.cyl(0.011, 0.08, COL.dark, 0, 0.02, -0.29)
    muzzle.set(0, 0.02, -0.33)
    P.box(0.04, 0.03, 0.05, COL.poly, 0, -0.07, -0.12)
    sightY = 0.1; support.set(0, -0.06, -0.14)
  } else if (body === 'lmg') {
    P.box(0.075, 0.1, 0.34, COL.metal, 0, 0.025, -0.09)
    P.box(0.07, 0.025, 0.3, COL.dark, 0, 0.085, -0.1)
    grip(0.06); trigger()
    P.box(0.012, 0.06, 0.15, COL.dark, 0, 0.12, -0.12)               // carry handle
    const bLen = bl + 0.1
    P.cyl(m.heavy ? 0.016 : 0.013, bLen, COL.dark, 0, 0.035, -0.26 - bLen / 2)
    if (m.hand === 'rail') P.box(0.065, 0.065, 0.2, COL.metal, 0, 0.03, -0.36)
    if (m.hand === 'jacket') P.cyl(0.03, 0.32, COL.steel, 0, 0.035, -0.42, 10)
    muzzle.set(0, 0.035, -0.26 - bLen)
    P.box(0.006, 0.05, 0.01, COL.dark, 0, 0.07, muzzle.z + 0.04)
    if (m.mag === 'box100') { P.box(0.1, 0.12, 0.12, COL.olive, 0.02, -0.08, -0.08); magPos.set(0.02, -0.08, -0.08) }
    else if (m.mag === 'drum') { P.cyl(0.08, 0.07, COL.dark, 0, -0.1, -0.07, 14); magPos.set(0, -0.1, -0.07) }
    // folded bipod legs under the barrel
    P.box(0.01, 0.01, 0.2, COL.dark, 0.02, 0.005, muzzle.z + 0.22); P.box(0.01, 0.01, 0.2, COL.dark, -0.02, 0.005, muzzle.z + 0.22)
    stock(P, m.stock, COL.poly, 1.1)
    sightY = 0.11; support.set(0, -0.01, -0.34)
  } else if (body === 'bolt') {
    P.box(0.05, 0.06, 0.24, COL.metal, 0, 0.03, -0.04)
    P.box(0.012, 0.012, 0.04, COL.metal, 0.04, 0.04, 0.04, 0, 0, 0.6); P.add(new THREE.SphereGeometry(0.014, 6, 4), COL.metal, 0.065, 0.025, 0.04)
    grip(0.07, m.stock === 'sporter' ? COL.wood : COL.poly); trigger()
    const bLen = bl
    P.cyl(m.heavy ? 0.016 : 0.013, bLen, COL.dark, 0, 0.035, -0.16 - bLen / 2, 10, m.heavy ? 0.016 : 0.011)
    muzzle.set(0, 0.035, -0.16 - bLen)
    if (m.brake) { P.box(0.05, 0.04, 0.08, COL.metal, 0, 0.035, muzzle.z - 0.04); muzzle.z -= 0.08 }
    if (m.can) { P.cyl(0.024, 0.22, COL.dark, 0, 0.035, muzzle.z - 0.11, 10); muzzle.z -= 0.22 }
    if (m.stock === 'chassis') { P.box(0.06, 0.07, 0.36, furn === COL.tan ? COL.tan : COL.green, 0, 0.0, -0.3); stock(P, 'chassis', COL.dark) }
    else { P.box(0.06, 0.06, 0.5, COL.wood, 0, 0.0, -0.2); stock(P, 'sporter', COL.wood) }
    if (m.mag === 'box5' || m.mag === 'box10') { P.box(0.03, 0.06, 0.07, COL.dark, 0, -0.04, -0.06); magPos.set(0, -0.05, -0.06) }
    sightY = 0.07; support.set(0, -0.02, -0.32)
  } else if (body === 'shotgun') {
    P.box(0.055, 0.07, 0.24, COL.metal, 0, 0.02, -0.05)
    grip(0.07, m.stock === 'wood' ? COL.wood : COL.poly); trigger()
    P.cyl(0.013, bl, COL.dark, 0, 0.04, -0.17 - bl / 2)
    if (m.double) P.cyl(0.013, bl, COL.dark, 0.026, 0.04, -0.17 - bl / 2)
    if (m.mag === 'tube') P.cyl(0.011, bl * 0.8, COL.dark, 0, 0.012, -0.17 - bl * 0.4)
    if (m.hand === 'pump') P.box(0.05, 0.045, 0.16, COL.wood, 0, 0.01, -0.34)
    else if (m.hand === 'wood') P.box(0.055, 0.04, 0.22, COL.wood, 0, 0.012, -0.3)
    else P.box(0.06, 0.06, 0.2, COL.metal, 0, 0.02, -0.33)
    muzzle.set(0, 0.04, -0.17 - bl)
    P.add(new THREE.SphereGeometry(0.006, 5, 4), COL.brass, 0, 0.062, muzzle.z + 0.02)
    stock(P, m.stock, m.stock === 'wood' ? COL.wood : COL.poly)
    sightY = 0.065; support.set(0, -0.01, -0.34); magPos.set(0, 0.01, -0.12)
  } else if (body === 'pistol' || body === 'revolver') {
    const L = (m.barrel || 0.11) + 0.08
    if (body === 'pistol') { P.box(0.03, 0.035, L, COL.dark, 0, 0.05, -L / 2 + 0.04); P.box(0.028, 0.025, L * 0.85, furn, 0, 0.022, -L / 2 + 0.05) }
    else { P.cyl(0.01, L, COL.steel, 0, 0.05, -L / 2 + 0.02); P.cyl(0.022, 0.045, COL.steel, 0, 0.04, 0.0, 8); P.box(0.03, 0.03, 0.06, COL.steel, 0, 0.04, 0.02) }
    P.box(0.028, 0.1, 0.04, body === 'revolver' ? COL.wood : furn, 0, -0.03, 0.035, 0.22)
    trigger()
    if (m.longmag) P.box(0.024, 0.08, 0.03, COL.dark, 0, -0.11, 0.05, 0.22)
    muzzle.set(0, 0.05, -L + 0.04)
    P.box(0.006, 0.01, 0.006, COL.dark, 0, 0.072, muzzle.z + 0.01)
    sightY = 0.073; support.set(-0.01, -0.04, 0.03); magPos.set(0, -0.06, 0.04)
  } else if (body === 'rpg' || body === 'tube' || body === 'atgm' || body === 'manpad') {
    const L = body === 'rpg' ? 0.95 : body === 'tube' ? 1.0 : body === 'atgm' ? 1.1 : 1.5
    const r = body === 'rpg' ? 0.03 : body === 'manpad' ? 0.04 : 0.05
    P.cyl(r, L, body === 'tube' ? COL.olive : body === 'rpg' ? COL.green : COL.sand, 0, 0.06, -L / 2 + 0.35, 12)
    if (body === 'rpg') { P.add(new THREE.ConeGeometry(0.05, 0.16, 10), COL.green, 0, 0.06, -0.72, -Math.PI / 2); P.cyl(0.05, 0.12, COL.olive, 0, 0.06, -0.58); P.box(0.04, 0.04, 0.2, COL.wood, 0, 0.03, -0.12) }
    if (body === 'atgm') { P.box(0.16, 0.12, 0.2, COL.sand, -0.12, 0.08, 0.05); P.box(0.1, 0.06, 0.06, COL.lens, -0.12, 0.08, -0.06) }
    grip(0.0); P.box(0.03, 0.08, 0.04, COL.poly, 0, -0.03, -0.25)
    P.box(0.02, 0.06, 0.03, COL.dark, 0.06, 0.12, -0.15)
    muzzle.set(0, 0.06, -L + 0.35 - 0.02)
    sightY = 0.13; support.set(0, -0.02, -0.25); magPos.set(0, 0.06, -0.6)
  } else if (body === 'gl' || body === 'gl6') {
    if (body === 'gl6') { P.cyl(0.065, 0.14, COL.dark, 0, 0.0, -0.12, 10); P.cyl(0.024, 0.32, COL.dark, 0, 0.03, -0.32); P.box(0.04, 0.04, 0.28, COL.tan, 0, 0.0, 0.18) }
    else { P.cyl(0.024, 0.36, COL.steel, 0, 0.04, -0.2); P.box(0.04, 0.04, 0.3, COL.wood, 0, 0.0, 0.16) }
    grip(0.0); trigger()
    muzzle.set(0, 0.04, -0.38)
    P.box(0.025, 0.04, 0.01, COL.dark, 0, 0.09, -0.06)
    sightY = 0.1; support.set(0, -0.02, -0.25); magPos.set(0, 0.02, -0.12)
  }
  // attachments
  let sight = new THREE.Vector3(0, sightY, -0.05), optic = ATTACHMENTS[att.optic] || ATTACHMENTS[def.optic] || ATTACHMENTS.iron
  const opticId = att.optic || def.optic || 'iron'
  if (opticId !== 'iron' && body !== 'pistol') {
    const y = sightY + 0.01
    // reflex sights are hollow: a tube (red dot) or a window frame (holographic) you look through
    if (opticId === 'rd1') { P.tube(0.018, 0.05, COL.dark, 0, y + 0.018, -0.06); P.box(0.02, 0.008, 0.04, COL.dark, 0, y - 0.002, -0.06); sight.set(0, y + 0.018, -0.06) }
    else if (opticId === 'eh3') {
      P.box(0.045, 0.012, 0.07, COL.dark, 0, y + 0.004, -0.07)                 // base
      P.box(0.045, 0.006, 0.02, COL.dark, 0, y + 0.043, -0.095)                // top of the window
      for (const s of [-1, 1]) P.box(0.005, 0.04, 0.02, COL.dark, s * 0.02, y + 0.025, -0.095)
      sight.set(0, y + 0.026, -0.07)
    }
    else if (opticId === 'atgm') { sight.set(-0.12, 0.08, -0.06) }
    else {
      const big = opticId === 'lr525' || opticId === 'hunter8', len = big ? 0.34 : opticId === 'aco2' ? 0.13 : 0.2
      const r = big ? 0.02 : 0.018
      P.tube(r, len, COL.dark, 0, y + 0.035, -0.07)
      P.tube(big ? 0.03 : 0.024, 0.05, COL.dark, 0, y + 0.035, -0.07 - len / 2)
      P.tube(0.024, 0.04, COL.dark, 0, y + 0.035, -0.07 + len / 2)
      P.box(0.02, 0.03, 0.06, COL.dark, 0, y + 0.012, -0.07)
      if (optic.thermal || optic.night) P.box(0.04, 0.04, 0.06, COL.green, 0, y + 0.035, -0.07 + len / 2 + 0.04)
      sight.set(0, y + 0.035, -0.07)
    }
  } else if (body === 'pistol' && opticId === 'rd1') { P.box(0.02, 0.02, 0.03, COL.dark, 0, 0.085, -0.02); sight.set(0, 0.09, -0.02) }
  if (att.muzzle && !def.suppressed) {
    const a = ATTACHMENTS[att.muzzle]
    if (att.muzzle === 'supp') P.cyl(body === 'pistol' ? 0.016 : 0.021, a.length, COL.dark, 0, muzzle.y, muzzle.z - a.length / 2, 10)
    else P.cyl(0.016, a.length, COL.metal, 0, muzzle.y, muzzle.z - a.length / 2, 8)
    muzzle.z -= a.length
  }
  if (att.under === 'vgrip') P.box(0.03, 0.08, 0.035, COL.poly, 0, -0.03, support.z)
  if (att.under === 'agrip') P.box(0.03, 0.035, 0.08, COL.poly, 0, -0.01, support.z, -0.5)
  if (att.under === 'bipod') { P.box(0.012, 0.012, 0.2, COL.dark, 0.02, -0.0, muzzle.z + 0.25); P.box(0.012, 0.012, 0.2, COL.dark, -0.02, -0.0, muzzle.z + 0.25) }
  if (att.under === 'laser') P.box(0.03, 0.03, 0.06, COL.poly, 0.03, 0.02, support.z - 0.03)
  if (att.mag === 'extmag') P.box(0.028, 0.06, 0.06, COL.dark, 0, magPos.y - 0.09, magPos.z)
  if (att.stock === 'heavystock') P.box(0.05, 0.08, 0.1, COL.poly, 0, -0.01, 0.34)
  const g = P.merged()
  g.computeBoundingBox()
  return { geometry: g, sight, muzzle, mag: magPos, support, optic, opticId, length: g.boundingBox.max.z - g.boundingBox.min.z }
}

function stock(P, kind, color, th = 1) {
  if (kind === 'collapsible') { P.cyl(0.014, 0.16, COL.dark, 0, 0.03, 0.17); P.box(0.04, 0.09, 0.07, color, 0, 0.0, 0.26) }
  else if (kind === 'fixed') { P.box(0.045 * th, 0.08, 0.24, color, 0, 0.0, 0.2, -0.08) }
  else if (kind === 'wood') { P.box(0.045, 0.09, 0.3, COL.wood, 0, -0.015, 0.22, -0.12) }
  else if (kind === 'folding') { P.box(0.01, 0.06, 0.26, COL.dark, 0.02, 0.0, 0.19); P.box(0.03, 0.08, 0.02, COL.dark, 0.02, -0.01, 0.32) }
  else if (kind === 'skeleton') { P.box(0.03, 0.015, 0.28, color, 0, 0.03, 0.2); P.box(0.03, 0.015, 0.26, color, 0, -0.04, 0.2, -0.25); P.box(0.04, 0.1, 0.03, color, 0, 0.0, 0.33) }
  else if (kind === 'chassis') { P.box(0.04, 0.03, 0.24, COL.dark, 0, 0.03, 0.2); P.box(0.04, 0.12, 0.05, color, 0, -0.01, 0.33); P.box(0.03, 0.03, 0.06, COL.dark, 0, -0.05, 0.3) }
  else if (kind === 'sporter') { P.box(0.045, 0.1, 0.32, COL.wood, 0, -0.02, 0.22, -0.1) }
}

// Simplified weapons for the soldiers the game draws as instances (one shape per kind).
export const HELD = { rifle: 'brenner', smg: 'vespa', lmg: 'halberd', sniper: 'kestrellr', pistol: 'p17', launcher: 'rk7', shotgun: 'brecher' }
