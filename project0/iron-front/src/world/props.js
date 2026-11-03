// Small things that make places read: street lamps, parked cars and wrecks, barriers, sandbag nests,
// HESCO walls and fences, rails and wagons, helipads, AA guns, rock piles, caves, a crashed helicopter,
// the harbour's piers. Made with the kit like buildings (in the prop's own frame), most with colliders.
import { rng } from '../core/noise.js'
import { PAL } from './buildings.js'

const CAR_COLS = [[0.75, 0.15, 0.12], [0.2, 0.35, 0.6], [0.85, 0.85, 0.82], [0.2, 0.2, 0.22], [0.35, 0.5, 0.35], [0.8, 0.65, 0.2]]

export const PROP_TYPES = {
  lamp(k) {
    k.box(0, 3, 0, 0.08, 3, 0.08, PAL.dark, { mat: 'metal', kind: 'prop' })
    k.box(0, 6.0, 0.6, 0.06, 0.06, 0.6, PAL.dark, { collide: false })
    k.box(0, 5.95, 1.15, 0.22, 0.08, 0.14, [0.95, 0.9, 0.7], { collide: false })
    k.lights.push({ x: k.tx(0, 1.15), y: k.oy + 5.8, z: k.tz(0, 1.15), color: [1, 0.85, 0.55], lamp: true })
  },
  car(k, p) { car(k, CAR_COLS[p.color % 6], false) },
  wreck(k, p) { car(k, [0.25, 0.2, 0.17], true) },
  barrier(k) {
    k.box(0, 0.4, 0, 1.0, 0.4, 0.3, PAL.concrete, { mat: 'concrete', kind: 'prop' })
    k.box(0, 0.85, 0, 0.9, 0.08, 0.16, PAL.concrete, { mat: 'concrete', kind: 'prop' })
    k.box(0, 0.5, 0.31, 0.9, 0.08, 0.01, PAL.red, { collide: false })
  },
  sandbagnest(k) {
    for (const [x, z, ry] of [[0, 1.6, 0], [-1.6, 0, Math.PI / 2], [1.6, 0, Math.PI / 2]]) k.box(x, 0.55, z, 1.7, 0.55, 0.35, PAL.sand, { mat: 'sandbag', kind: 'prop', yaw: ry })
    k.box(0, 1.25, 1.55, 0.6, 0.12, 0.3, PAL.sand, { mat: 'sandbag', kind: 'prop' })
    k.spot(0, 0.1, 0.6, 'cover'); k.spot(0, 0.1, 0.6, 'mg')
  },
  sandbagring(k) {
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.box(Math.sin(a) * 3, 0.6, Math.cos(a) * 3, 1.6, 0.6, 0.35, PAL.sand, { mat: 'sandbag', kind: 'prop', yaw: a }) }
    k.spot(0, 0.1, 0, 'cover')
  },
  aagun(k) {
    k.box(0, 0.4, 0, 1.2, 0.4, 1.2, PAL.olive, { mat: 'metal', kind: 'prop' })
    k.box(0, 1.1, 0, 0.5, 0.4, 0.6, PAL.olive, { mat: 'metal' })
    for (const s of [-0.25, 0.25]) k.box(s, 1.6, 1.2, 0.06, 0.06, 1.3, PAL.dark, { collide: false, pitch: -0.6 })
  },
  hesco(k, p) {
    const L = (p.len || 6) / 2
    k.box(0, 0.7, 0, L, 0.7, 0.55, [0.66, 0.6, 0.45], { mat: 'sandbag', kind: 'wall' })
    k.box(0, 1.42, 0, L, 0.03, 0.56, [0.42, 0.42, 0.36], { collide: false })
  },
  fence(k, p) {
    const L = (p.len || 10) / 2
    k.box(-L, 1.1, 0, 0.05, 1.1, 0.05, PAL.metal, { mat: 'metal', kind: 'prop' })
    k.box(0, 2.15, 0, L, 0.03, 0.03, PAL.metal, { collide: false })
    k.box(0, 1.1, 0, L, 1.0, 0.01, [0.55, 0.57, 0.58], { mat: 'sheetmetal', kind: 'fence' })
  },
  rail(k, p) {
    const L = (p.len || 200) / 2
    for (const s of [-0.72, 0.72]) k.box(0, 0.12, s, L, 0.06, 0.05, PAL.metal, { collide: false })
    for (let x = -L; x < L; x += 2) k.box(x, 0.04, 0, 0.12, 0.04, 1.2, PAL.woodDark, { collide: false })
  },
  wagon(k, p) {
    const c = [[0.5, 0.22, 0.15], [0.3, 0.33, 0.36], [0.2, 0.35, 0.3]][p.color || 0]
    k.box(0, 2.1, 0, 7, 1.6, 1.45, c, { mat: 'sheetmetal' })
    k.box(0, 0.55, 0, 6.5, 0.3, 1.2, PAL.dark, { mat: 'metal' })
    k.spot(0, 0.1, 2.2, 'cover'); k.spot(0, 0.1, -2.2, 'cover')
  },
  helipad(k) {
    k.box(0, 0.08, 0, 10, 0.08, 10, PAL.concrete, { collide: false })
    k.box(-2.2, 0.17, 0, 0.5, 0.01, 3, PAL.white, { collide: false })
    k.box(2.2, 0.17, 0, 0.5, 0.01, 3, PAL.white, { collide: false })
    k.box(0, 0.17, 0, 1.8, 0.01, 0.5, PAL.white, { collide: false })
  },
  plaza(k) {
    k.box(0, 0.08, 0, 14, 0.08, 14, PAL.floorTile, { collide: false })
    k.box(0, 0.5, 0, 2.5, 0.5, 2.5, PAL.concrete, { mat: 'concrete', kind: 'prop' })
    for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) k.box(x, 0.45, z, 1.5, 0.45, 0.4, PAL.woodDark, { mat: 'wood', kind: 'prop' })
  },
  monument(k) {
    k.box(0, 0.4, 0, 6, 0.4, 6, PAL.concrete)
    k.box(0, 2.8, 0, 1.2, 2.4, 1.2, [0.55, 0.55, 0.5])
    k.box(0, 6.4, 0, 0.5, 1.2, 0.5, [0.45, 0.5, 0.4])
    k.spot(4, 0.1, 4, 'cover'); k.spot(-4, 0.1, -4, 'cover')
  },
  rockpile(k, p) {
    const r = rng(p.x * 13 + p.z), s = p.s || 3
    for (let i = 0; i < 4; i++) k.box((r() - 0.5) * s, s * 0.35 + r() * s * 0.2, (r() - 0.5) * s, s * (0.4 + r() * 0.3), s * 0.4, s * (0.4 + r() * 0.3), [0.55, 0.53, 0.5], { mat: 'rock', kind: 'rock', yaw: r() * 3 })
  },
  logs(k) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) k.box(0, 0.35 + i * 0.6, (j - (2 - i) / 2) * 0.62, 4, 0.3, 0.3, PAL.wood, { mat: 'wood', kind: 'prop' })
    k.spot(0, 0.1, 1.6, 'cover')
  },
  chimney(k) {
    k.box(0, 25, 0, 2.2, 25, 2.2, [0.6, 0.58, 0.55])
    for (let y = 40; y < 50; y += 4) k.box(0, y, 0, 2.3, 0.4, 2.3, PAL.red, { collide: false })
  },
  crates(k) {
    for (const [x, z, s] of [[0, 0, 0.5], [1.1, 0.2, 0.4], [0.4, 1.0, 0.45], [0.3, 0.1, 0.35]]) k.box(x, s + (z > 0.5 && s < 0.4 ? 1 : 0), z, s, s, s, [0.32, 0.38, 0.22], { mat: 'wood', kind: 'prop' })
    k.spot(0.5, 0.1, -1, 'loot')
  },
  // A cave: a shelter of big rocks with a way in.
  cave(k) {
    const c = [0.48, 0.46, 0.43]
    k.box(-3, 2, 0, 1.5, 2, 5, c, { mat: 'rock', kind: 'rock' })
    k.box(3, 2, 0, 1.5, 2, 5, c, { mat: 'rock', kind: 'rock' })
    k.box(0, 4.6, 0, 4.5, 0.8, 5.5, c, { mat: 'rock', kind: 'rock', yaw: 0.05 })
    k.box(0, 2, -4.5, 3, 2, 1, c, { mat: 'rock', kind: 'rock' })
    k.spot(0, 0.2, -2, 'loot'); k.spot(0, 0.2, 0, 'cover')
  },
  // A crashed helicopter: broken fuselage, a bent rotor, scattered parts.
  crash(k) {
    k.box(0, 1.2, 0, 1.3, 1.1, 3.5, PAL.olive, { mat: 'sheetmetal', yaw: 0.2, pitch: 0.15 })
    k.box(0.6, 0.8, -5.5, 0.35, 0.35, 2.4, PAL.olive, { mat: 'sheetmetal', yaw: 0.6 })
    k.box(1.2, 2.4, 0.5, 4.5, 0.05, 0.18, PAL.dark, { collide: false, yaw: 1.1, pitch: 0.2 })
    k.box(-1.6, 0.3, 2.5, 0.8, 0.3, 0.6, PAL.dark, { mat: 'metal' })
    k.spot(2, 0.1, 1, 'loot'); k.spot(-2, 0.1, -1, 'cover')
  },
  pier(k, p) {
    const hw = p.w / 2, hd = p.d / 2
    k.box(0, -0.4, 0, hw, 0.4, hd, PAL.concrete, { mat: 'concrete', kind: 'floor' })
    for (let z = -hd + 4; z < hd; z += 8) for (const s of [-1, 1]) { k.box(s * (hw - 0.3), 0.25, z, 0.25, 0.25, 0.25, PAL.dark, { mat: 'metal' }); k.box(s * (hw - 1), -3, z, 0.4, 2.8, 0.4, PAL.concreteDark, { collide: false }) }
  },
}

// A car: body, cabin, wheels. Wrecks are rusted, flattened and missing their glass.
function car(k, col, wrecked) {
  k.box(0, 0.65, 0, 0.9, 0.35, 2.2, col, { mat: 'sheetmetal', kind: 'prop', pitch: wrecked ? 0.05 : 0 })
  k.box(0, 1.2, -0.2, 0.8, wrecked ? 0.18 : 0.3, 1.2, wrecked ? col : [0.25, 0.35, 0.45], { mat: wrecked ? 'sheetmetal' : 'glass', kind: 'prop' })
  for (const [x, z] of [[-0.85, -1.4], [0.85, -1.4], [-0.85, 1.4], [0.85, 1.4]]) k.box(x, 0.33, z, 0.12, 0.33, 0.33, PAL.dark, { collide: false })
  k.spot(1.6, 0.1, 0, 'cover'); k.spot(-1.6, 0.1, 0, 'cover')
}
