// Builds the street view of lot 3084 (12 x 12 x 19 m tower): OPERATION: IRON FRONT as an animated
// battlefield diorama. A slab of battlefield (road, trenches, craters, sandbags, a ruined house on fire)
// where two tanks trade fire across the field, a fire team runs round the radio mast, riflemen shoot from
// cover, shells burst in the craters, and a ground-attack jet circles the four-sided sign at the top,
// diving on its strafing runs. Everything moves on one 24-second loop played on the world clock.
// node gen.mjs <outDir>   (needs three, @gltf-transform/core and sharp)
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { Document, NodeIO } from '@gltf-transform/core'
import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'node:fs'

const outDir = process.argv[2] || 'out'
mkdirSync(outDir, { recursive: true })
const LOOP = 24, STEPS = 192
const TAU = Math.PI * 2

// ---------- the palette: 8 x 8 flat colour cells ----------
const COLORS = [
  ['grass', '#6f7a3e'], ['mud', '#6b5638'], ['road', '#3b3a38'], ['roadline', '#b9a65a'], ['sand', '#a68f5f'], ['sandDark', '#7d6a45'], ['olive', '#56603a'], ['oliveDark', '#3c4428'],
  ['grey', '#6a6c66'], ['greyDark', '#43453f'], ['steel', '#7b7f83'], ['black', '#1b1c1d'], ['concrete', '#a7a296'], ['concreteDark', '#77736a'], ['brick', '#8a4a35'], ['skin', '#c89a74'],
  ['vdf', '#4f5b33'], ['nlf', '#6e6250'], ['helmet', '#39402a'], ['smoke', '#8e8b86'], ['smokeDark', '#5f5b55'], ['jet', '#8b9096'], ['jetDark', '#4d5258'], ['glass', '#2c3b46'],
  ['gold', '#d9a521'], ['red', '#9b2c22'], ['white', '#e8e4d4'], ['crater', '#2e261c'], ['rubble', '#8c857a'], ['tree', '#3f5a2c'], ['trunk', '#4a3524'], ['wire', '#2a2a2a'],
  ['plinth', '#2b2e25'], ['plinthEdge', '#4b5132'], ['nlfRed', '#8a3b2e'], ['vdfFlag', '#5f7a3a'], ['dirt', '#584631'], ['ash', '#3a3733'], ['rust', '#7a4a2a'], ['canvas', '#77714f'],
]
const CELL = Object.fromEntries(COLORS.map(([k], i) => [k, i]))
const cellUV = i => [((i % 8) + 0.5) / 8, (Math.floor(i / 8) + 0.5) / 8]   // glTF: v runs down the image
async function palettePng(file, size = 64) {
  const px = Buffer.alloc(size * size * 3), c = size / 8
  COLORS.forEach(([, hex], i) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
    const cx = (i % 8) * c, cy = Math.floor(i / 8) * c
    for (let y = cy; y < cy + c; y++) for (let x = cx; x < cx + c; x++) { const k = (y * size + x) * 3; px[k] = r; px[k + 1] = g; px[k + 2] = b }
  })
  return sharp(px, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer()
}
// The sign: one face, used on all four sides (letters light from the texture's brightness).
async function signPng() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512">
  <rect width="1024" height="512" fill="#141a12"/>
  <rect x="14" y="14" width="996" height="484" fill="none" stroke="#7a6420" stroke-width="10"/>
  <rect x="34" y="34" width="956" height="444" fill="none" stroke="#3a3a24" stroke-width="4"/>
  <text x="512" y="150" text-anchor="middle" font-family="Chakra Petch" font-weight="700" font-size="80" fill="#d9a521" letter-spacing="12">OPERATION:</text>
  <text x="512" y="320" text-anchor="middle" font-family="Chakra Petch" font-weight="700" font-size="146" fill="#f2efe2" letter-spacing="4">IRON FRONT</text>
  <rect x="120" y="358" width="784" height="6" fill="#d9a521"/>
  <text x="512" y="440" text-anchor="middle" font-family="Chakra Petch" font-weight="600" font-size="44" fill="#c9c3a0" letter-spacing="5">OPEN WORLD MILITARY WARFARE</text>
</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

// ---------- geometry helpers ----------
function prep(geo, uv) {
  let g = geo.index ? geo : mergeVertices(geo)
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k)
  if (g.index) g = g.toNonIndexed()
  g.computeVertexNormals()
  const n = g.attributes.position.count
  if (uv) { const a = new Float32Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2] = uv[0]; a[i * 2 + 1] = uv[1] } g.setAttribute('uv', new THREE.BufferAttribute(a, 2)) }
  else if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  return g
}
class Bag {
  constructor() { this.parts = [] }
  // color: a palette cell name, or [u, v] for effects (the Glow material reads its uv as type + phase)
  add(geo, color, m = null, smooth = false) {
    const uv = typeof color === 'string' ? cellUV(CELL[color]) : color
    let g = prep(geo.clone(), uv)
    // smooth: round normals (shell bursts grow and shrink along them in the vertex shader)
    if (smooth) { g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4); g.computeVertexNormals(); g = g.toNonIndexed() }
    if (m) g.applyMatrix4(m); this.parts.push(g); return this
  }
  merged() { return mergeVertices(mergeGeometries(this.parts), 1e-4) }
  get tris() { return this.parts.reduce((s, g) => s + g.attributes.position.count / 3, 0) }
  transformed(m) { const b = new Bag(); b.parts = this.parts.map(g => g.clone().applyMatrix4(m)); return b }
}
const M = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s))
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
const cyl = (r1, r2, h, n = 8) => new THREE.CylinderGeometry(r1, r2, h, n)
function beam(bag, a, b, t, color) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())
  bag.add(box(t, len, t), color, new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)))
}
// Effects for the Glow material: uv.x = type + phase (0..0.99), uv.y = size (metres) for bursts.
const FX = { flash: 0, tracer: 1, fire: 2, burst: 3, burner: 4, lamp: 5 }
const fx = (type, phase, size = 0) => [FX[type] + Math.min(0.99, Math.max(0, phase)), size]

// ---------- the pieces ----------
const PLINTH = 0.55     // the battlefield's surface height
function field(lod) {
  const body = new Bag(), glow = new Bag()
  const hi = lod === 0
  // the slab and its rim
  body.add(box(12, 0.4, 12).translate(0, 0.2, 0), 'plinth')
  for (const [x, z, w, d] of [[0, 5.95, 12, 0.1], [0, -5.95, 12, 0.1], [5.95, 0, 0.1, 12], [-5.95, 0, 0.1, 12]]) body.add(box(w, 0.12, d).translate(x, 0.4, z), 'plinthEdge')
  // rolling ground: a grid with low hills, mud where the fighting is
  const seg = hi ? 36 : 12
  const ground = new THREE.PlaneGeometry(11.8, 11.8, seg, seg).rotateX(-Math.PI / 2)
  const p = ground.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i)
    const edge = Math.min(1, (5.9 - Math.max(Math.abs(x), Math.abs(z))) / 0.6)
    let h = 0.08 + 0.18 * Math.sin(x * 0.9 + 1.3) * Math.cos(z * 0.7 - 0.4) + 0.1 * Math.sin(x * 2.1 + z * 1.7)
    for (const [cx, cz, r] of CRATERS) { const d = Math.hypot(x - cx, z - cz); if (d < r) h -= 0.25 * (1 - d / r) ** 1.5 * 1.6; else if (d < r * 1.4) h += 0.06 * (1 - (d - r) / (r * 0.4)) }
    p.setY(i, PLINTH - 0.15 + Math.max(0, h) * edge)
  }
  // grass on the edges, mud in the middle (split into two bags by face position)
  const g2 = prep(ground, null).toNonIndexed()
  const pos = g2.attributes.position, mud = [], grass = []
  for (let f = 0; f < pos.count; f += 3) {
    const cx = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3, cz = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3
    const tri = []; for (let k = 0; k < 3; k++) tri.push(pos.getX(f + k), pos.getY(f + k), pos.getZ(f + k))
    const muddy = Math.hypot(cx * 0.8, cz) < 3.6 + Math.sin(cx * 3.1 + cz * 2.3) * 0.5 || CRATERS.some(([x, z, r]) => Math.hypot(cx - x, cz - z) < r * 1.2)
    ;(muddy ? mud : grass).push(...tri)
  }
  for (const [arr, col] of [[mud, 'mud'], [grass, 'grass']]) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); body.add(g, col) }
  for (const [x, z, r] of CRATERS) body.add(cyl(r * 0.55, r * 0.35, 0.05, 10).translate(x, PLINTH - 0.2, z), 'crater')
  // the road across the field, its centre line, a blown-out section
  body.add(box(1.7, 0.06, 12).translate(-1.2, PLINTH + 0.02, 0), 'road')
  if (hi) for (let z = -5.4; z < 5.5; z += 1.1) body.add(box(0.07, 0.065, 0.5).translate(-1.2, PLINTH + 0.03, z), 'roadline')
  // trench lines with sandbags
  const sandbags = (x0, z0, x1, z1, rows = 2) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.32)), yaw = Math.atan2(x1 - x0, z1 - z0)
    for (let r = 0; r < rows; r++) for (let i = 0; i < n - (r % 2); i++) {
      const t = (i + (r % 2) * 0.5) / (n - 1)
      body.add(box(0.2, 0.13, 0.3).translate(0, 0, 0), r % 2 ? 'sandDark' : 'sand', M(x0 + (x1 - x0) * t, PLINTH + 0.07 + r * 0.12, z0 + (z1 - z0) * t, yaw))
    }
  }
  sandbags(2.0, -4.6, 4.6, -2.0, hi ? 3 : 2); sandbags(-4.8, 2.2, -2.6, 4.6, hi ? 3 : 2); sandbags(3.8, 1.6, 5.2, 3.8, 2)
  body.add(box(3.2, 0.08, 0.5).translate(0, 0, 0), 'dirt', M(3.4, PLINTH - 0.02, -3.2, Math.PI / 4))
  // barbed wire and tank traps
  if (hi) {
    for (let i = 0; i < 9; i++) { const x = -5 + i * 0.6; beam(body, [x, PLINTH, -5.2], [x + 0.3, PLINTH + 0.35, -5.2], 0.03, 'wire'); beam(body, [x + 0.3, PLINTH + 0.35, -5.2], [x + 0.6, PLINTH, -5.2], 0.03, 'wire') }
    beam(body, [-5, PLINTH + 0.3, -5.2], [0.4, PLINTH + 0.3, -5.2], 0.015, 'wire')
    // tank traps: three crossed girders each
    for (const [x, z] of [[1.6, 4.9], [2.6, 5.1], [3.6, 4.8]]) for (let k = 0; k < 3; k++) body.add(box(0.07, 0.6, 0.07), 'steel', M(x, PLINTH + 0.2, z, k * TAU / 3, 0.9))
  }
  // trees, some splintered
  for (const [x, z, s, broken] of [[5.0, 5.0, 1, 0], [4.4, 5.3, 0.8, 0], [-5.2, -4.0, 0.9, 1], [5.3, -0.4, 0.85, 0], [-5.1, -1.4, 0.7, 1]]) {
    body.add(cyl(0.06 * s, 0.09 * s, (broken ? 0.9 : 1.4) * s, 6).translate(x, PLINTH + (broken ? 0.45 : 0.7) * s, z), 'trunk')
    if (!broken) { body.add(new THREE.IcosahedronGeometry(0.6 * s, hi ? 1 : 0).translate(x, PLINTH + 1.7 * s, z), 'tree'); body.add(new THREE.IcosahedronGeometry(0.45 * s, 0).translate(x + 0.2, PLINTH + 2.15 * s, z - 0.1), 'tree') }
  }
  // the ruined house (north-west corner): two storeys of broken walls, a fallen floor, fire inside
  ruin(body, glow, hi)
  // a wrecked truck on the road, burning
  const tr = M(-1.0, PLINTH + 0.05, 3.6, 0.35, 0, 0.18)
  body.add(box(0.9, 0.55, 1.1).translate(0, 0.42, 0.75), 'ash', tr)
  body.add(box(0.95, 0.35, 1.7).translate(0, 0.3, -0.6), 'rust', tr)
  for (const [x, z] of [[-0.45, 0.8], [0.45, 0.8], [-0.45, -0.9], [0.45, -0.9]]) body.add(cyl(0.2, 0.2, 0.15, 8).rotateZ(Math.PI / 2).translate(x, 0.2, z), 'black', tr)
  glow.add(new THREE.IcosahedronGeometry(0.32, 1).scale(1, 1.6, 1).translate(0, 0.95, 0.7), fx('fire', 0.3), tr)
  // riflemen behind the sandbags, firing (flashes and tracers towards the other side)
  // each side aims at the middle of the other side's line
  const TGT = { nlf: [-3.5, 3.4], vdf: [3.4, -2.6] }
  for (const [x, z, ph, team] of [[3.0, -3.1, 0.1, 'nlf'], [3.9, -2.4, 0.55, 'nlf'], [-3.9, 3.0, 0.3, 'vdf'], [-3.2, 3.8, 0.75, 'vdf'], [4.4, 2.6, 0.4, 'nlf']]) {
    const yaw = Math.atan2(TGT[team][0] - x, TGT[team][1] - z)
    const m = M(x, PLINTH, z, yaw)
    soldier(body, team, 'kneel', m, hi)
    const muzzle = new THREE.Vector3(0.12, 0.62, 0.62).applyMatrix4(m), dir = new THREE.Vector3(Math.sin(yaw), 0.02, Math.cos(yaw))
    glow.add(new THREE.OctahedronGeometry(0.09, 0).scale(1, 1, 1.8), fx('flash', ph), M(muzzle.x, muzzle.y, muzzle.z, yaw))
    const a = muzzle.clone().addScaledVector(dir, 0.6), b = muzzle.clone().addScaledVector(dir, 2.4)
    beam(glow, a.toArray(), b.toArray(), 0.025, fx('tracer', ph))
  }
  // shell bursts in the craters
  CRATERS.forEach(([x, z, r], i) => glow.add(new THREE.IcosahedronGeometry(r * 0.75, hi ? 2 : 1), fx('burst', i * 0.27 % 1, r * 0.75), M(x, PLINTH + 0.1, z), true))
  // smoke columns from the house and the truck (dark lumps, static)
  for (const [x, z, h, s] of [[-4.0, -3.6, 7.0, 1], [-1.0, 3.6, 4.5, 0.8], [2.6, -0.4, 3.2, 0.6]]) {
    const n = hi ? 7 : 3
    for (let i = 0; i < n; i++) { const t = i / (n - 1), y = PLINTH + 1.2 + t * (h - 1.2), r = (0.25 + t * 0.6) * s; body.add(new THREE.IcosahedronGeometry(r, hi ? 1 : 0), t > 0.5 ? 'smoke' : 'smokeDark', M(x + t * 1.2 * s, y, z - t * 0.6 * s, t * 2)) }
  }
  return { body, glow }
}
const CRATERS = [[1.6, 0.8, 0.75], [-2.8, -1.4, 0.6], [0.4, -3.0, 0.7], [3.1, 3.6, 0.55], [-3.6, 0.6, 0.5]]

function ruin(body, glow, hi) {
  const x0 = -4.0, z0 = -3.6, w = 3.0, d = 2.4, h = 2.6
  const wallX = (x, z, len, hgt, col = 'concrete') => body.add(box(len, hgt, 0.16).translate(x + len / 2, PLINTH + hgt / 2, z), col)
  const wallZ = (x, z, len, hgt, col = 'concrete') => body.add(box(0.16, hgt, len).translate(x, PLINTH + hgt / 2, z + len / 2), col)
  // the back walls stand, the front is broken down
  wallX(x0 - w / 2, z0 - d / 2, w, h); wallZ(x0 - w / 2, z0 - d / 2, d, h * 0.8)
  wallX(x0 - w / 2, z0 + d / 2, 0.9, 1.2, 'concreteDark'); wallZ(x0 + w / 2, z0 - d / 2, 1.0, 1.7, 'concreteDark')
  // window holes as dark panels on the standing walls
  for (const [x, y] of [[-0.8, 0.8], [0.4, 0.8], [-0.8, 2.0], [0.4, 2.0]]) body.add(box(0.5, 0.55, 0.02).translate(x0 + x, PLINTH + y, z0 - d / 2 + 0.09), 'glass')
  // the first floor slab, cracked and tilted down into the room
  body.add(box(w * 0.6, 0.12, d * 0.8), 'concreteDark', M(x0 - w * 0.18, PLINTH + 1.15, z0 - 0.1, 0, 0.25, 0.12))
  // rubble heaps
  const R = mulberry(7)
  for (let i = 0; i < (hi ? 26 : 8); i++) { const s = 0.08 + R() * 0.2; body.add(box(s, s * 0.7, s * 1.2), R() < 0.5 ? 'rubble' : 'concrete', M(x0 + (R() - 0.3) * w, PLINTH + s * 0.3, z0 + d / 2 + (R() - 0.2) * 1.2, R() * 3, R(), R())) }
  // fire in the window and the room
  glow.add(new THREE.IcosahedronGeometry(0.4, 1).scale(1.2, 1.6, 1), fx('fire', 0.7), M(x0 + 0.3, PLINTH + 0.6, z0 + 0.1))
  glow.add(new THREE.IcosahedronGeometry(0.22, 1).scale(1, 1.5, 0.5), fx('fire', 0.2), M(x0 - 0.8, PLINTH + 2.0, z0 - d / 2 + 0.12))
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

// A soldier at 45% of life size (0.8 m tall). pose: 'run' | 'kneel' | 'stand'; built facing +z.
function soldier(bag, team, pose, m, hi) {
  const U = team === 'vdf' ? 'vdf' : 'nlf', S = 0.45
  const add = (g, c, x, y, z, rx = 0, rz = 0) => bag.add(g, c, m.clone().multiply(M(x * S, y * S, z * S, 0, rx, rz, S)))
  const kneel = pose === 'kneel', run = pose === 'run'
  const hip = kneel ? 0.62 : 0.95
  // legs
  if (kneel) { add(box(0.16, 0.5, 0.18), U, 0.12, 0.3, 0.32, -1.3); add(box(0.15, 0.45, 0.16), U, 0.12, 0.25, 0.55); add(box(0.16, 0.5, 0.18), U, -0.12, 0.25, -0.1, 0.3) }
  else if (run) { add(box(0.15, 0.9, 0.17), U, 0.11, 0.5, 0.18, 0.55); add(box(0.15, 0.9, 0.17), U, -0.11, 0.5, -0.15, -0.5) }
  else { add(box(0.15, 0.9, 0.17), U, 0.11, 0.47, 0); add(box(0.15, 0.9, 0.17), U, -0.11, 0.47, 0) }
  // body, vest, pack, head and helmet
  add(box(0.42, 0.62, 0.26), U, 0, hip + 0.33, run ? 0.06 : 0, run ? 0.25 : 0)
  add(box(0.44, 0.38, 0.3), team === 'vdf' ? 'oliveDark' : 'greyDark', 0, hip + 0.4, run ? 0.08 : 0.01, run ? 0.25 : 0)
  if (hi) add(box(0.32, 0.36, 0.18), 'canvas', 0, hip + 0.42, run ? -0.15 : -0.2, run ? 0.25 : 0)
  add(box(0.2, 0.22, 0.2), 'skin', 0, hip + 0.78, run ? 0.2 : 0.02)
  add(hi ? new THREE.SphereGeometry(0.15, 8, 5, 0, TAU, 0, Math.PI / 2) : box(0.3, 0.12, 0.3), team === 'vdf' ? 'helmet' : 'nlfRed', 0, hip + 0.86, run ? 0.2 : 0.02)
  // arms and the rifle held at the shoulder, pointing ahead
  add(box(0.12, 0.42, 0.12), U, 0.24, hip + 0.48, 0.18, -1.2); add(box(0.12, 0.42, 0.12), U, -0.2, hip + 0.48, 0.28, -1.35)
  add(box(0.06, 0.1, 0.85), 'black', 0.1, hip + 0.55, 0.5)
}

// A tank at 45%: hull (static) and turret (turns), built facing +z.
function tankHull(bag, col, colDark, m, hi) {
  const S = 0.45, add = (g, c, x, y, z, rx = 0) => bag.add(g, c, m.clone().multiply(M(x * S, y * S, z * S, 0, rx, 0, S)))
  add(box(3.4, 0.9, 7.2), col, 0, 1.15, 0)
  add(box(3.0, 0.5, 1.4), col, 0, 1.1, 3.9, 0.55)
  add(box(3.2, 0.4, 1.0), colDark, 0, 1.0, -3.8, -0.4)
  for (const s of [-1, 1]) {
    add(box(0.9, 1.0, 7.6), 'black', s * 1.75, 0.55, 0)
    add(box(1.0, 0.12, 7.4), colDark, s * 1.75, 1.12, 0)
    if (hi) for (let i = 0; i < 6; i++) add(cyl(0.42, 0.42, 0.95, 10).rotateZ(Math.PI / 2), 'greyDark', s * 1.75, 0.5, -2.9 + i * 1.16)
  }
}
function tankTurret(bag, glow, col, colDark, hi, phase) {
  const S = 0.45, add = (g, c, x, y, z, rx = 0, ry = 0) => bag.add(g, c, M(x * S, y * S, z * S, ry, rx, 0, S))
  add(box(2.8, 0.8, 3.2), col, 0, 0.4, -0.2)
  add(box(2.4, 0.5, 1.4), col, 0, 0.35, 1.5, 0.35)
  add(box(2.6, 0.6, 1.2), colDark, 0, 0.45, -2.2)
  add(cyl(0.16, 0.2, 4.6, 8).rotateX(Math.PI / 2), 'greyDark', 0, 0.45, 4.2)
  add(cyl(0.26, 0.26, 0.6, 8).rotateX(Math.PI / 2), 'black', 0, 0.45, 6.4)
  add(cyl(0.45, 0.5, 0.35, 8), colDark, 0.6, 1.0, -0.6)
  if (hi) { add(box(0.1, 0.1, 1.2), 'black', -0.7, 1.05, 0.2); add(cyl(0.02, 0.02, 1.8, 4), 'black', -1.0, 1.8, -1.6) }
  // the muzzle flash and the shell's tracer reaching across the field
  glow.add(new THREE.OctahedronGeometry(0.28, 1).scale(1, 1, 2.0), fx('flash', phase, 1), M(0, 0.45 * S, 7.1 * S))
  glow.add(box(0.05, 0.05, 4.2).translate(0, 0.45 * S, 7.1 * S + 2.4), fx('tracer', phase, 1))
}
// The ground-attack jet at 45%, nose +z.
function jet(bag, glow, hi) {
  const S = 0.45, add = (g, c, x, y, z, rx = 0, ry = 0, rz = 0) => bag.add(g, c, M(x * S, y * S, z * S, ry, rx, rz, S))
  add(cyl(0.45, 0.55, 6.2, hi ? 10 : 6).rotateX(Math.PI / 2), 'jet', 0, 0, 0)
  add(new THREE.ConeGeometry(0.45, 1.6, hi ? 10 : 6).rotateX(Math.PI / 2), 'jetDark', 0, 0, 3.9)
  add(box(0.5, 0.35, 1.3), 'glass', 0, 0.45, 1.6)
  const wing = new THREE.Shape([new THREE.Vector2(0, 1.3), new THREE.Vector2(3.4, -0.6), new THREE.Vector2(3.4, -1.3), new THREE.Vector2(0, -1.3)])
  for (const s of [1, -1]) {
    const g = new THREE.ExtrudeGeometry(wing, { depth: 0.12, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.06, 0)
    if (s < 0) g.scale(-1, 1, 1)
    add(g, 'jet', 0, -0.05, -0.2)
    add(box(0.18, 0.18, 1.1), 'jetDark', s * 2.2, -0.25, -0.2)     // stores under the wings
    add(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.6), new THREE.Vector2(1.4, -0.3), new THREE.Vector2(1.4, -0.6), new THREE.Vector2(0, -0.6)]), { depth: 0.08, bevelEnabled: false }).rotateX(Math.PI / 2).scale(s, 1, 1), 'jet', 0, 0.05, -2.6)
  }
  add(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.2, 0), new THREE.Vector2(1.6, 1.6), new THREE.Vector2(0.9, 1.6)]), { depth: 0.08, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.04, 0.3, -3.2), 'jetDark', 0, 0, 0)
  add(cyl(0.4, 0.42, 0.3, 8).rotateX(Math.PI / 2), 'black', 0, 0, -3.2)
  glow.add(cyl(0.3 * S, 0.05 * S, 1.6 * S, 8).rotateX(-Math.PI / 2).translate(0, 0, -3.95 * S), fx('burner', 0))
  // the nose gun: flashes and tracers on the strafing dive
  glow.add(new THREE.OctahedronGeometry(0.12, 0).scale(1, 1, 2), fx('flash', 0.92, 2), M(0.3 * S, -0.2 * S, 4.6 * S))
  glow.add(box(0.03, 0.03, 1.0).translate(0.3 * S, -0.2 * S, 4.6 * S + 0.6), fx('tracer', 0.92, 2))
}
// The mast at the centre and the four-sided sign on it.
function mast(body, sign, glow, hi) {
  const H0 = PLINTH, top = 11.0
  for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [0.35, 0.35], [-0.35, 0.35]]) beam(body, [x * 1.6, H0, z * 1.6], [x, top, z], 0.08, 'steel')
  if (hi) for (let y = H0 + 0.8; y < top; y += 1.1) {
    const k = 1 - (y - H0) / (top - H0) * 0.375, a = 0.35 * 1.6 * k
    for (const [p, q] of [[[-a, -a], [a, -a]], [[a, -a], [a, a]], [[a, a], [-a, a]], [[-a, a], [-a, -a]]]) beam(body, [p[0], y, p[1]], [q[0], y + 0.55, q[1]], 0.035, 'steel')
  }
  body.add(box(1.4, 0.3, 1.4).translate(0, H0 + 0.15, 0), 'concreteDark')
  // the sign box: a dark frame and four lettered faces
  const W = 5.6, Hs = 2.8, Y = 12.6
  body.add(box(W - 0.3, Hs - 0.3, W - 0.3).translate(0, Y, 0), 'black')
  for (const [y, h] of [[Y + Hs / 2, 0.14], [Y - Hs / 2, 0.14]]) body.add(box(W + 0.12, h, W + 0.12).translate(0, y, 0), 'gold')
  for (let k = 0; k < 4; k++) {
    const yaw = k * Math.PI / 2
    const face = new THREE.PlaneGeometry(W, Hs)
    const fu = face.attributes.uv; for (let i = 0; i < fu.count; i++) fu.setY(i, 1 - fu.getY(i))   // glTF images are not flipped
    sign.parts.push(prep(face, null).applyMatrix4(M(Math.sin(yaw) * (W / 2 + 0.01), Y, Math.cos(yaw) * (W / 2 + 0.01), yaw)))
    // corner posts
    const cx = Math.sin(yaw + Math.PI / 4) * W * 0.707, cz = Math.cos(yaw + Math.PI / 4) * W * 0.707
    body.add(box(0.16, Hs + 0.3, 0.16).translate(cx, Y, cz), 'gold')
  }
  // red warning lamps on top of the sign
  body.add(box(1.2, 0.5, 1.2).translate(0, Y + Hs / 2 + 0.3, 0), 'greyDark')
  beam(body, [0, Y + Hs / 2 + 0.5, 0], [0, 17.6, 0], 0.1, 'steel')
  glow.add(new THREE.SphereGeometry(0.16, 8, 6).translate(0, 17.7, 0), fx('lamp', 0))
  for (let k = 0; k < 4; k++) { const yaw = k * Math.PI / 2 + Math.PI / 4; glow.add(new THREE.SphereGeometry(0.11, 6, 4).translate(Math.sin(yaw) * W * 0.707, Y + Hs / 2 + 0.12, Math.cos(yaw) * W * 0.707), fx('lamp', 0.5)) }
}

// ---------- the build at a level of detail ----------
function build(lod) {
  const hi = lod === 0
  const { body, glow } = field(lod)
  const sign = new Bag()
  mast(body, sign, glow, hi)
  const parts = {}
  // the tanks: hulls static, turrets swing to track and fire
  const tankA = { at: [-3.9, PLINTH + 0.68, -0.9], yaw: 0.35 }, tankB = { at: [3.4, PLINTH + 0.68, 1.2], yaw: Math.PI + 0.45 }
  tankHull(body, 'olive', 'oliveDark', M(tankA.at[0], PLINTH, tankA.at[2], tankA.yaw), hi)
  tankHull(body, 'grey', 'greyDark', M(tankB.at[0], PLINTH, tankB.at[2], tankB.yaw), hi)
  for (const [name, T, col, dark, ph] of [['turretA', tankA, 'olive', 'oliveDark', 0.05], ['turretB', tankB, 'grey', 'greyDark', 0.55]]) {
    const b = new Bag(), g = new Bag()
    tankTurret(b, g, col, dark, hi, ph)
    // aim at the other tank, sweep a little, hold still when it fires (at the flash phase)
    const other = T === tankA ? tankB : tankA, aim = Math.atan2(other.at[0] - T.at[0], other.at[2] - T.at[2])
    parts[name] = { bags: { Body: b, Glow: g }, anim: t => {
      const f = t / LOOP, cyc = (f * 4 + ph) % 1
      const sweep = Math.sin(f * TAU * 2 + ph * 6) * 0.35 * Math.min(1, Math.max(0, (cyc - 0.15) / 0.3))
      return { p: T.at, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, aim + sweep, 0)) }
    } }
  }
  // the fire team: three soldiers in file running round the mast
  {
    const b = new Bag()
    for (let i = 0; i < 3; i++) soldier(b, 'vdf', 'run', M(0, 0, -i * 0.6, 0), hi)
    const R = 1.6
    parts.squad = { bags: { Body: b }, anim: t => {
      const a = (t / LOOP) * TAU * 2
      // the file follows the leader's circle: the whole group turns about the mast; the curve is slight at this radius
      return { p: [Math.sin(a) * R, PLINTH + 0.02 + Math.abs(Math.sin(a * 12)) * 0.03, Math.cos(a) * R], q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a + Math.PI / 2, 0)) }
    } }
  }
  // the jet: circles the sign, diving and firing twice a loop
  {
    const b = new Bag(), g = new Bag()
    jet(b, g, hi)
    const R = 4.25
    parts.jet = { bags: { Body: b, Glow: g }, anim: t => {
      const a = (t / LOOP) * TAU * 2
      const dive = Math.sin(a * 2 + 0.6)
      const y = 16.2 + dive * 1.1
      const climb = Math.cos(a * 2 + 0.6) * 1.1 * 2 * (TAU * 2 / LOOP) / (R * TAU * 2 / LOOP)
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan(climb), a + Math.PI / 2, -0.55, 'YXZ'))
      return { p: [Math.sin(a) * R, y, Math.cos(a) * R], q }
    } }
  }
  return { body, glow, sign, parts }
}

// ---------- glTF ----------
async function writeGlb(file, b) {
  const doc = new Document(), buffer = doc.createBuffer(), io = new NodeIO()
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer)
  const textures = {}
  const tex = (name, png) => (textures[name] ||= doc.createTexture(name).setImage(png).setMimeType('image/png'))
  const mats = {}
  for (const [name, m] of Object.entries(b.materials)) {
    const mat = doc.createMaterial(name).setBaseColorFactor(m.color || [1, 1, 1, 1]).setMetallicFactor(m.metal ?? 0).setRoughnessFactor(m.rough ?? 0.7)
    if (m.map) mat.setBaseColorTexture(tex(m.mapName, m.map))
    if (m.emissiveMap) mat.setEmissiveTexture(tex(m.mapName, m.emissiveMap))
    if (m.emissive) mat.setEmissiveFactor(m.emissive)
    if (m.nearest) { const i = mat.getBaseColorTextureInfo(); if (i) i.setMagFilter(9728).setMinFilter(9728) }
    if (m.doubleSided) mat.setDoubleSided(true)
    mats[name] = mat
  }
  let total = 0, draws = 0
  const mesh = (name, bags) => {
    const msh = doc.createMesh(name)
    for (const [matName, bag] of Object.entries(bags)) {
      if (!bag.parts.length) continue
      const g = bag.merged(), n = g.attributes.position.count, idx = g.index.array
      msh.addPrimitive(doc.createPrimitive()
        .setAttribute('POSITION', accessor('VEC3', new Float32Array(g.attributes.position.array)))
        .setAttribute('NORMAL', accessor('VEC3', new Float32Array(g.attributes.normal.array)))
        .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(g.attributes.uv.array)))
        .setIndices(accessor('SCALAR', n < 65535 ? new Uint16Array(idx) : new Uint32Array(idx)))
        .setMaterial(mats[matName]))
      total += idx.length / 3; draws++
    }
    return msh
  }
  const scene = doc.createScene('lot')
  for (const [name, bags] of Object.entries(b.static)) { const msh = mesh(name, bags); if (msh.listPrimitives().length) scene.addChild(doc.createNode(name).setMesh(msh)) }
  if (b.parts) {
    const anim = doc.createAnimation('loop')
    const times = new Float32Array(STEPS + 1)
    for (let i = 0; i <= STEPS; i++) times[i] = LOOP * i / STEPS
    const input = accessor('SCALAR', times)
    for (const [name, part] of Object.entries(b.parts)) {
      const msh = mesh(name + '_mesh', part.bags)
      const node = doc.createNode(name).setMesh(msh)
      scene.addChild(node)
      const P = new Float32Array((STEPS + 1) * 3), Q = new Float32Array((STEPS + 1) * 4)
      let prev = null
      for (let i = 0; i <= STEPS; i++) {
        const { p, q } = part.anim(times[i])
        if (prev && prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w)   // keep the quaternions on one side: no flips
        P.set(p, i * 3); Q.set([q.x, q.y, q.z, q.w], i * 4); prev = q.clone()
      }
      node.setTranslation([P[0], P[1], P[2]]).setRotation([Q[0], Q[1], Q[2], Q[3]])
      for (const [path, type, arr] of [['translation', 'VEC3', P], ['rotation', 'VEC4', Q]]) {
        const s = doc.createAnimationSampler().setInput(input).setOutput(accessor(type, arr)).setInterpolation('LINEAR')
        anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(s))
      }
    }
  }
  const bytes = await io.writeBinary(doc)
  writeFileSync(`${outDir}/${file}`, bytes)
  return { file, tris: Math.round(total), draws, bytes: bytes.length }
}
// Checks every vertex (and every animated part over the loop) stays inside the lot.
function bounds(b) {
  const box3 = new THREE.Box3(), v = new THREE.Vector3()
  for (const bag of Object.values(b.static).flatMap(o => Object.values(o))) for (const g of bag.parts) { g.computeBoundingBox(); box3.union(g.boundingBox) }
  if (b.parts) for (const part of Object.values(b.parts)) {
    const pts = []
    for (const bag of Object.values(part.bags)) for (const g of bag.parts) { const p = g.attributes.position; for (let i = 0; i < p.count; i += 3) pts.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))) }
    for (let i = 0; i < STEPS; i += 4) { const { p, q } = part.anim(LOOP * i / STEPS); for (const pt of pts) box3.expandByPoint(v.copy(pt).applyQuaternion(q).add(new THREE.Vector3(...p))) }
  }
  return box3
}

const palette = await palettePng(), signTex = await signPng()
writeFileSync(`${outDir}/palette.png`, palette); writeFileSync(`${outDir}/sign.png`, signTex)
const BODY = { map: palette, mapName: 'palette', metal: 0.15, rough: 0.78, nearest: true }
const GLOW = { color: [0.05, 0.04, 0.03, 1], emissive: [1, 0.6, 0.2], rough: 0.5 }
const SIGN = { map: signTex, emissiveMap: signTex, mapName: 'sign', emissive: [0.9, 0.9, 0.9], rough: 0.5 }

const L0 = build(0)
const b0 = { materials: { Body: BODY, Glow: GLOW, Sign: SIGN }, static: { field: { Body: L0.body, Glow: L0.glow }, sign: { Sign: L0.sign } }, parts: L0.parts }
const box0 = bounds(b0)
const r0 = await writeGlb('lod0.glb', b0)
// LOD1: static and simpler, two materials: the body (with the parts at rest) and the sign
const L1 = build(1)
for (const part of Object.values(L1.parts)) {
  const { p, q } = part.anim(0)
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), q, new THREE.Vector3(1, 1, 1))
  if (part.bags.Body) L1.body.parts.push(...part.bags.Body.transformed(m).parts)
}
const sign512 = await sharp(signTex).resize(512, 256).png().toBuffer()
const r1 = await writeGlb('lod1.glb', { materials: { Body: BODY, Sign: { ...SIGN, map: sign512, emissiveMap: sign512, mapName: 'sign512' } }, static: { field: { Body: L1.body }, sign: { Sign: L1.sign } } })
// LOD2: one mesh, one material: the slab, the mast, the sign block (gold and black), the tanks' shapes
const far = new Bag()
far.add(box(12, 0.55, 12).translate(0, 0.275, 0), 'grass')
far.add(box(6, 0.1, 6).translate(0, 0.6, 0), 'mud')
far.add(cyl(0.3, 0.6, 10.5, 4).translate(0, 5.8, 0), 'steel')
far.add(box(5.6, 2.8, 5.6).translate(0, 12.6, 0), 'black')
for (const y of [11.2, 14.0]) far.add(box(5.72, 0.16, 5.72).translate(0, y, 0), 'gold')
for (const [x, z, yaw, c] of [[-3.9, -0.9, 0.35, 'olive'], [3.4, 1.2, Math.PI + 0.45, 'grey']]) far.add(box(1.6, 0.8, 3.3), c, M(x, 1.0, z, yaw))
far.add(box(3.0, 2.4, 2.4).translate(-4.0, 1.75, -3.6), 'concrete')
far.add(box(3.0, 0.3, 2.4).translate(0, 16.6, 4.25), 'jet')
far.add(new THREE.IcosahedronGeometry(1.2, 0).translate(-3.4, 6.0, -4.0), 'smoke')
const palSmall = await palettePng('x', 64)
const r2 = await writeGlb('lod2.glb', { materials: { Body: { ...BODY, map: palSmall } }, static: { far: { Body: far } } })
for (const [n, part] of Object.entries(L0.parts)) { const bb = bounds({ static: {}, parts: { [n]: part } }); console.log(n, bb.min.toArray().map(v => +v.toFixed(2)), bb.max.toArray().map(v => +v.toFixed(2))) }
console.log(JSON.stringify({ lod0: r0, lod1: r1, lod2: r2, bounds0: { min: box0.min.toArray().map(v => +v.toFixed(2)), max: box0.max.toArray().map(v => +v.toFixed(2)) } }))
