// (gen2) Builds the street view of lot 3084 as a miniature of the whole island; see the end of the file.
// Former header: Builds the street view of lot 3084 (12 x 12 x 19 m tower): OPERATION: IRON FRONT as an animated
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
const LOOP = 48, STEPS = 384
const TAU = Math.PI * 2

// ---------- the palette: 8 x 8 flat colour cells ----------
const COLORS = [
  ['grass', '#6f7a3e'], ['mud', '#6b5638'], ['road', '#3b3a38'], ['roadline', '#b9a65a'], ['sand', '#a68f5f'], ['sandDark', '#7d6a45'], ['olive', '#56603a'], ['oliveDark', '#3c4428'],
  ['grey', '#6a6c66'], ['greyDark', '#43453f'], ['steel', '#7b7f83'], ['black', '#1b1c1d'], ['concrete', '#a7a296'], ['concreteDark', '#77736a'], ['brick', '#8a4a35'], ['skin', '#c89a74'],
  ['vdf', '#4f5b33'], ['nlf', '#6e6250'], ['helmet', '#39402a'], ['smoke', '#8e8b86'], ['smokeDark', '#5f5b55'], ['jet', '#8b9096'], ['jetDark', '#4d5258'], ['glass', '#2c3b46'],
  ['gold', '#d9a521'], ['red', '#9b2c22'], ['white', '#e8e4d4'], ['crater', '#2e261c'], ['rubble', '#8c857a'], ['tree', '#3f5a2c'], ['trunk', '#4a3524'], ['wire', '#2a2a2a'],
  ['cloud', '#f4f4f0'], ['cloudShade', '#c9cfd4'], ['heli', '#4a5434'], ['rotor', '#1e1f1d'], ['plinth', '#2b2e25'], ['plinthEdge', '#4b5132'], ['nlfRed', '#8a3b2e'], ['vdfFlag', '#5f7a3a'], ['dirt', '#584631'], ['ash', '#3a3733'], ['rust', '#7a4a2a'], ['canvas', '#77714f'],
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
// ---------- glTF ----------
async function writeGlb(file, b) {
  const doc = new Document(), buffer = doc.createBuffer(), io = new NodeIO()
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer)
  const textures = {}
  const tex = (name, img) => (textures[name] ||= doc.createTexture(name).setImage(img).setMimeType(img[0] === 0xff && img[1] === 0xd8 ? 'image/jpeg' : 'image/png'))
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
    for (const bag of Object.values(part.bags)) for (const g of bag.parts) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) pts.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))) }
    for (let i = 0; i <= STEPS; i++) { const { p, q } = part.anim(LOOP * i / STEPS); for (const pt of pts) box3.expandByPoint(v.copy(pt).applyQuaternion(q).add(new THREE.Vector3(...p))) }
  }
  return box3
}


// @@NEW@@
// ======================= the island in miniature =======================
// The real Varden from the game's own heightfield: 12 km shrunk to 11.4 m (heights x3), a texture baked from
// the land (sea, beaches, fields, forest, rock, snow, roads, rivers, towns), tiny buildings in the towns,
// small battles at real places, two helicopters circling towns, a pair of jets lapping the island, and a ring
// of clouds drifting overhead with the sign among them. One 48 s loop.
const HF = await import('../src/world/heightfield.js')
const PL = await import('../src/world/places.js')
const BP = await import('../src/world/blueprint.js')
HF.initHeightfield(); PL.buildPlaces()
const { heightAt, waterLevel, forestAt, fieldAt, normalAt, roadLines, riverLines } = HF
const WORLD = BP.WORLD, HALF = BP.HALF
const SPAN = 11.4, K = SPAN / WORLD, EX = 3, BASE = 0.62
const toX = x => x * K, toZ = z => z * K
const surf = (x, z) => Math.max(heightAt(x, z), waterLevel(x, z))
const toY = (x, z) => BASE + Math.max(0, surf(x, z)) * K * EX
const place = id => BP.PLACES.find(p => p.id === id)

// ---- the texture ----
async function bakeMap(size) {
  const px = Buffer.alloc(size * size * 3)
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
  const C = { deep: [38, 84, 116], shallow: [78, 140, 170], sand: [200, 182, 130], grass: [104, 138, 66], grass2: [126, 140, 78], forest: [56, 88, 44], rock: [138, 132, 120], snow: [232, 236, 238], wheat: [190, 162, 84], green: [128, 160, 74], ploughed: [140, 112, 72] }
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i + 0.5) / size * WORLD - HALF, z = (j + 0.5) / size * WORLD - HALF
    const h = heightAt(x, z), wl = waterLevel(x, z)
    let c
    if (wl > h) c = mix(C.shallow, C.deep, Math.min(1, (wl - h) / 35))
    else {
      const n = normalAt(x, z), slope = 1 - n[1]
      if (h < wl + 3 && wl > -50 && h < 6) c = C.sand
      else if (h > 820) c = C.snow
      else if (h > 560 || slope > 0.28) c = mix(C.grass2, C.rock, Math.min(1, Math.max((h - 560) / 160, (slope - 0.2) * 5)))
      else {
        c = mix(C.grass, C.grass2, Math.min(1, h / 500))
        const f = fieldAt(x, z); if (f) c = [null, C.wheat, C.green, C.ploughed][f]
        if (forestAt(x, z, h) > 0.35) c = C.forest
      }
      const shade = 0.78 + 0.42 * Math.max(0, -0.5 * n[0] + 0.75 * n[1] - 0.42 * n[2])
      c = c.map(v => v * shade)
    }
    const k = (j * size + i) * 3; px[k] = Math.min(255, c[0]); px[k + 1] = Math.min(255, c[1]); px[k + 2] = Math.min(255, c[2])
  }
  // rivers, roads and the town buildings painted on
  const dot = (x, z, r, col) => { const ci = (x + HALF) / WORLD * size, cj = (z + HALF) / WORLD * size; for (let j = Math.floor(cj - r); j <= cj + r; j++) for (let i = Math.floor(ci - r); i <= ci + r; i++) { if (i < 0 || j < 0 || i >= size || j >= size || Math.hypot(i - ci, j - cj) > r) continue; const k = (j * size + i) * 3; px[k] = col[0]; px[k + 1] = col[1]; px[k + 2] = col[2] } }
  const line = (pts, r, col) => { for (let q = 0; q + 1 < pts.length; q++) { const [ax, az] = pts[q], [bx, bz] = pts[q + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (WORLD / size) * 1.5)); for (let s = 0; s <= n; s++) dot(ax + (bx - ax) * s / n, az + (bz - az) * s / n, r, col) } }
  const ps = size / 1024
  for (const r of riverLines) line(r.pts, Math.max(0.8, r.width / WORLD * size * 0.5), C.shallow)
  const RS = { highway: [[176, 132, 62], 1.6], road: [[214, 198, 120], 1.1], dirt: [[150, 122, 86], 0.7], street: [[90, 88, 84], 0.7], runway: [[70, 72, 76], 3.2], taxiway: [[90, 92, 96], 1.6], apron: [[96, 98, 102], 2.4] }
  for (const r of roadLines) { const [col, w] = RS[r.kind] || RS.road; line(r.pts, Math.max(0.6, w * ps), col) }
  for (const b of PL.BUILDINGS) dot(b.x, b.z, Math.max(0.6, Math.max(b.w, b.d) / WORLD * size * 0.6), [70, 66, 62])
  return sharp(px, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer()
}

// ---- the land: a grid over the island with real uvs ----
function terrain(n) {
  const g = new THREE.PlaneGeometry(SPAN, SPAN, n, n).rotateX(-Math.PI / 2)
  const p = g.attributes.position, uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const X = p.getX(i), Z = p.getZ(i), x = X / K, z = Z / K
    p.setY(i, toY(x, z))
    uv.setXY(i, (x + HALF) / WORLD, (z + HALF) / WORLD)
  }
  return prep(g, null)
}
// the slab under it: dark sides, a gold rim (palette)
function slab(bag) {
  bag.add(box(12, BASE - 0.02, 12).translate(0, (BASE - 0.02) / 2, 0), 'plinth')
  for (const [x, z, w, d] of [[0, 5.95, 12, 0.1], [0, -5.95, 12, 0.1], [5.95, 0, 0.1, 12], [-5.95, 0, 0.1, 12]]) bag.add(box(w, 0.08, d).translate(x, BASE - 0.02, z), 'gold')
  // the sea's edge: a thin blue band round the island, at sea level
  for (const [x, z, w, d] of [[0, 5.78, 11.5, 0.24], [0, -5.78, 11.5, 0.24], [5.78, 0, 0.24, 11.5], [-5.78, 0, 0.24, 11.5]]) bag.add(box(w, 0.05, d).translate(x, BASE - 0.005, z), 'glass')
}
// tiny buildings: footprints x2.5, heights x4 so the towns read as towns
function buildings(bag) {
  for (const b of PL.BUILDINGS) {
    const w = Math.max(0.03, b.w * K * 2.5), d = Math.max(0.03, b.d * K * 2.5), h = Math.max(0.025, ((b.floors || 1) * 3.2 + 2) * K * 4 * (b.type === 'tower' ? 1.4 : 1))
    const col = b.military ? 'olive' : b.type === 'house' || b.type === 'barn' ? 'brick' : b.type === 'church' ? 'white' : 'concrete'
    bag.add(box(w, h, d).translate(0, h / 2, 0), col, M(toX(b.x), toY(b.x, b.z) - 0.005, toZ(b.z), b.yaw || 0))
  }
}

// ---- a battle at a place: tanks facing off, riflemen in two lines, bursts, fires, smoke ----
const U = 0.11   // units are drawn at this share of their 45% diorama size (a tank about 0.35 m long)
function unitM(x, z, yaw, s = U) { return M(toX(x), toY(x, z), toZ(z), yaw, 0, 0, s) }
function battle(body, glow, cx, cz, seed, o = {}) {
  const R = mulberry(seed), ang = R() * TAU, sep = o.sep ?? 420
  const ax = Math.sin(ang), az = Math.cos(ang)
  const A = [cx - ax * sep / 2, cz - az * sep / 2], B = [cx + ax * sep / 2, cz + az * sep / 2]
  const yawAB = Math.atan2(B[0] - A[0], B[1] - A[1]), yawBA = yawAB + Math.PI
  // two tanks a side (hull and turret together, aimed at the other side), with their gun flashes and shells
  for (const [P, yaw, col, dark, ph] of [[A, yawAB, 'olive', 'oliveDark', 0.05 + R() * 0.1], [B, yawBA, 'grey', 'greyDark', 0.5 + R() * 0.1]]) {
    for (let k = 0; k < (o.tanks ?? 2); k++) {
      const off = (k - 0.5) * 150, px = P[0] + Math.cos(yaw) * off, pz = P[1] - Math.sin(yaw) * off
      const m = unitM(px, pz, yaw)
      const hb = new Bag(), tb = new Bag(), tg = new Bag()
      tankHull(hb, col, dark, M(), false); tankTurret(tb, tg, col, dark, false, ph + k * 0.25)
      for (const g of hb.parts) body.parts.push(g.clone().applyMatrix4(m))
      const tm = m.clone().multiply(M(0, 0.68, 0))
      for (const g of tb.parts) body.parts.push(g.clone().applyMatrix4(tm))
      for (const g of tg.parts) glow.parts.push(g.clone().applyMatrix4(tm))
    }
  }
  // riflemen: a line on each side, kneeling and firing across
  for (const [P, yaw, team] of [[A, yawAB, 'vdf'], [B, yawBA, 'nlf']]) {
    for (let k = 0; k < (o.men ?? 5); k++) {
      const off = (k - 2) * 60 + (R() - 0.5) * 30, fwd = 90 + R() * 40
      const px = P[0] + Math.sin(yaw) * fwd + Math.cos(yaw) * off, pz = P[1] + Math.cos(yaw) * fwd - Math.sin(yaw) * off
      const m = unitM(px, pz, yaw, U * 1.3)
      const sb = new Bag(); soldier(sb, team, 'kneel', M(), false)
      for (const g of sb.parts) body.parts.push(g.clone().applyMatrix4(m))
      const ph = R()
      const muzzle = new THREE.Vector3(0.12, 0.62, 0.62).applyMatrix4(m), dir = new THREE.Vector3(Math.sin(yaw), 0.0, Math.cos(yaw))
      glow.add(new THREE.OctahedronGeometry(0.035, 0).scale(1, 1, 1.8), fx('flash', ph), M(muzzle.x, muzzle.y, muzzle.z, yaw))
      const a = muzzle.clone().addScaledVector(dir, 0.08), b = muzzle.clone().addScaledVector(dir, 0.45)
      beam(glow, a.toArray(), b.toArray(), 0.008, fx('tracer', ph))
    }
  }
  // shell bursts round the middle, fires, and a smoke column or two
  for (let k = 0; k < (o.bursts ?? 4); k++) {
    const x = cx + (R() - 0.5) * sep * 1.1, z = cz + (R() - 0.5) * sep * 1.1, r = 0.07 + R() * 0.06
    glow.add(new THREE.IcosahedronGeometry(r, 1), fx('burst', R(), r), M(toX(x), toY(x, z) + 0.02, toZ(z)), true)
  }
  for (let k = 0; k < (o.fires ?? 2); k++) {
    const x = cx + (R() - 0.5) * sep * 0.8, z = cz + (R() - 0.5) * sep * 0.8, y = toY(x, z)
    glow.add(new THREE.IcosahedronGeometry(0.06, 1).scale(1, 1.6, 1), fx('fire', R()), M(toX(x), y + 0.05, toZ(z)))
    const n = 5, h = 0.9 + R() * 0.9
    for (let i = 0; i < n; i++) { const t = i / (n - 1), r = 0.05 + t * 0.16; body.add(new THREE.IcosahedronGeometry(r, 1), t > 0.5 ? 'smoke' : 'smokeDark', M(toX(x) + t * 0.25, y + 0.12 + t * h, toZ(z) - t * 0.12, t * 2)) }
  }
}

// ---- moving parts ----
// a helicopter (diorama size) built facing +z
function heliBody(bag) {
  bag.add(new THREE.SphereGeometry(0.14, 8, 6).scale(1, 0.9, 1.6), 'heli')
  bag.add(box(0.05, 0.05, 0.42).translate(0, 0.03, -0.36), 'heli')
  bag.add(box(0.02, 0.12, 0.08).translate(0, 0.09, -0.56), 'heli')
  bag.add(box(0.16, 0.08, 0.1).translate(0, 0.02, 0.12), 'glass')
  for (const s of [-1, 1]) bag.add(box(0.015, 0.015, 0.32).translate(s * 0.1, -0.15, 0), 'black')
  bag.add(cyl(0.015, 0.015, 0.06, 6).translate(0, 0.15, 0), 'black')
}
function heliRotor(bag) { for (let k = 0; k < 2; k++) bag.add(box(0.7, 0.008, 0.035), 'rotor', M(0, 0, 0, k * Math.PI / 2)) }
function orbit(cx, cz, r, alt, laps, phase) {
  return t => {
    const a = (t / LOOP) * TAU * laps + phase
    const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r
    return { x, z, y: alt, yaw: a + Math.PI / 2, bank: -0.3 }
  }
}

function build(lod) {
  const hi = lod === 0
  const map = new Bag(), body = new Bag(), glow = new Bag(), sign = new Bag()
  map.parts.push(terrain(hi ? 100 : 46))
  slab(body)
  if (hi) buildings(body)
  // the battles: Kaldor (tanks in the streets), Dresk, the coast below Port Anselm, between the bases
  if (hi) {
    const k = place('kaldor'), d = place('dresk'), an = place('anselm'), ma = place('marsk')
    battle(body, glow, k.x + 380, k.z - 260, 11, { sep: 460 })
    battle(body, glow, d.x + 300, d.z + 350, 23, { sep: 420, tanks: 1 })
    battle(body, glow, an.x + 900, an.z - 700, 37, { sep: 500 })
    battle(body, glow, ma.x - 500, ma.z + 300, 41, { sep: 380, tanks: 1, men: 4 })
  }
  // the sign, among the clouds
  const W = 4.0, Hs = 2.0, Y = 17.3
  body.add(box(W - 0.2, Hs - 0.2, W - 0.2).translate(0, Y, 0), 'black')
  for (const y of [Y + Hs / 2, Y - Hs / 2]) body.add(box(W + 0.1, 0.12, W + 0.1).translate(0, y, 0), 'gold')
  for (let kq = 0; kq < 4; kq++) {
    const yaw = kq * Math.PI / 2, face = new THREE.PlaneGeometry(W, Hs), fu = face.attributes.uv
    for (let i = 0; i < fu.count; i++) fu.setY(i, 1 - fu.getY(i))
    sign.parts.push(prep(face, null).applyMatrix4(M(Math.sin(yaw) * (W / 2 + 0.01), Y, Math.cos(yaw) * (W / 2 + 0.01), yaw)))
    body.add(box(0.12, Hs + 0.2, 0.12).translate(Math.sin(yaw + Math.PI / 4) * W * 0.707, Y, Math.cos(yaw + Math.PI / 4) * W * 0.707), 'gold')
  }
  for (let kq = 0; kq < 4; kq++) { const yaw = kq * Math.PI / 2 + Math.PI / 4; glow.add(new THREE.SphereGeometry(0.09, 6, 4).translate(Math.sin(yaw) * W * 0.707, Y + Hs / 2 + 0.1, Math.cos(yaw) * W * 0.707), fx('lamp', 0.5)) }

  const parts = {}
  // clouds: six puffy clusters in a ring, alternating two shapes, turning a third of the way round per loop
  {
    const b = new Bag(), R = mulberry(5)
    const shapes = [0, 1].map(s => { const pts = []; for (let i = 0; i < 9; i++) pts.push([(R() - 0.5) * 1.8, (R() - 0.3) * 0.5, (R() - 0.5) * 1.0, 0.4 + R() * 0.4]); return pts })
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU, rr = i % 2 ? 3.6 : 3.2, y = i % 2 ? 13.6 : 14.6
      for (const [x, yy, z, r] of shapes[i % 2]) {
        const m = M(Math.sin(a) * rr, y, Math.cos(a) * rr, a).multiply(M(x, yy, z))
        b.add(new THREE.IcosahedronGeometry(r, hi ? 1 : 0), yy < -0.05 ? 'cloudShade' : 'cloud', m)
      }
    }
    parts.clouds = { bags: { Body: b }, anim: t => ({ p: [0, 0, 0], q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (t / LOOP) * TAU / 3, 0)) }) }
  }
  // low wisps of cloud: flatter, a ring the other way round
  {
    const b = new Bag(), R = mulberry(9)
    const shapes = [0, 1, 2].map(() => { const pts = []; for (let i = 0; i < 5; i++) pts.push([(R() - 0.5) * 1.4, (R() - 0.5) * 0.2, (R() - 0.5) * 0.7, 0.25 + R() * 0.25]); return pts })
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU + 0.3, rr = 3.9 + (i % 3) * 0.35, y = 9.6 + (i % 3) * 0.5
      for (const [x, yy, z, r] of shapes[i % 3]) b.add(new THREE.IcosahedronGeometry(r, 0).scale(1.4, 0.55, 1), 'cloud', M(Math.sin(a) * rr, y, Math.cos(a) * rr, a).multiply(M(x, yy, z)))
    }
    parts.cloudsLow = { bags: { Body: b }, anim: t => ({ p: [0, 0, 0], q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -(t / LOOP) * TAU / 3, 0)) }) }
  }
  // a transport plane circling high, and paratroopers under canopies drifting down onto the island
  {
    const b = new Bag()
    b.add(cyl(0.22, 0.26, 2.2, 8).rotateX(Math.PI / 2), 'jet'); b.add(new THREE.ConeGeometry(0.22, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0, 1.35), 'jetDark')
    b.add(box(3.0, 0.05, 0.42).translate(0, 0.12, 0.1), 'jet'); b.add(box(1.0, 0.04, 0.3).translate(0, 0.1, -1.0), 'jet'); b.add(box(0.04, 0.42, 0.34).translate(0, 0.3, -1.0), 'jetDark')
    for (const s of [-1, 1]) for (const k of [0.55, 1.05]) b.add(cyl(0.07, 0.07, 0.3, 6).rotateX(Math.PI / 2).translate(s * k, 0.05, 0.25), 'jetDark')
    parts.transport = { bags: { Body: b }, anim: t => {
      const a = (t / LOOP) * TAU + 2.2, r = 3.0, x = Math.sin(a) * r, z = Math.cos(a) * r
      return { p: [x, 11.6, z], q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a + Math.PI / 2, -0.18, 'YXZ')) }
    } }
    // the paratroopers: four canopies in a stick, from high up down to the ground near Tovar, sinking out of sight as they land
    const c = new Bag(), tv = place('tovar'), gx = toX(tv.x), gz = toZ(tv.z), gy = toY(tv.x, tv.z)
    for (let k = 0; k < 4; k++) {
      const ox = (k - 1.5) * 0.45, oy = k * 0.5
      c.add(new THREE.SphereGeometry(0.22, 8, 4, 0, TAU, 0, Math.PI / 2).scale(1, 0.6, 1), k % 2 ? 'sand' : 'olive', M(ox, oy + 0.55, 0))
      for (const s of [-1, 1]) beam(c, [ox + s * 0.2, oy + 0.55, 0], [ox, oy + 0.05, 0], 0.01, 'wire')
      c.add(box(0.05, 0.12, 0.04), 'vdf', M(ox, oy, 0))
    }
    parts.paras = { bags: { Body: c }, anim: t => {
      const f = t / LOOP, land = Math.max(0.12, gy - 0.45), y = gy + 0.2 + (10.5 - gy) * (1 - f) - (gy + 0.2 - land) * Math.max(0, f - 0.92) / 0.08
      return { p: [gx + Math.sin(f * 9) * 0.15, y, gz + f * 0.4], q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.6, Math.sin(f * 20) * 0.08)) }
    } }
  }
  // two helicopters circling towns (each body and its spinning rotor)
  const H1 = place('kaldor'), H2 = place('dresk')
  const helis = [['heliA', orbit(toX(H1.x), toZ(H1.z), 0.9, 4.8, 2, 0)], ['heliB', orbit(toX(H2.x), toZ(H2.z), 0.7, 5.4, 3, 1.7)]]
  for (const [name, path] of helis) {
    const hb = new Bag(); heliBody(hb)
    const rb = new Bag(); heliRotor(rb)
    const at = t => { const o = path(t); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, o.yaw, o.bank, 'YXZ')); return { p: [o.x, o.y, o.z], q } }
    parts[name] = { bags: { Body: hb }, anim: at }
    parts[name + 'Rotor'] = { bags: { Body: rb }, anim: t => { const { p, q } = at(t); const up = new THREE.Vector3(0, 0.18, 0).applyQuaternion(q); return { p: [p[0] + up.x, p[1] + up.y, p[2] + up.z], q: q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (t / LOOP) * STEPS * 2.4)) } } }
  }
  // a pair of jets lapping the island, dipping on their runs
  {
    const b = new Bag(), g = new Bag()
    for (const [dx, dz] of [[0, 0], [0.55, -0.6]]) {
      const jb = new Bag(), jg = new Bag(); jet(jb, jg, hi)
      const m = M(dx, 0, dz, 0, 0, 0, 0.32)
      for (const p of jb.parts) b.parts.push(p.clone().applyMatrix4(m))
      for (const p of jg.parts) g.parts.push(p.clone().applyMatrix4(m))
    }
    parts.jets = { bags: { Body: b, Glow: g }, anim: t => {
      const a = (t / LOOP) * TAU, rx = 3.9, rz = 3.6
      const x = Math.sin(a) * rx, z = Math.cos(a) * rz, y = 8.2 + Math.sin(a * 3) * 0.9
      const vx = Math.cos(a) * rx, vz = -Math.sin(a) * rz, yaw = Math.atan2(vx, vz)
      return { p: [x, y, z], q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.cos(a * 3) * 0.25, yaw, -0.5, 'YXZ')) }
    } }
  }
  return { map, body, glow, sign, parts }
}

const palette = await palettePng(), signTex = await signPng()
const mapPng = await bakeMap(1024), map1024 = await sharp(mapPng).jpeg({ quality: 86 }).toBuffer(), map512 = await sharp(mapPng).resize(512, 512).jpeg({ quality: 86 }).toBuffer(), map256 = await sharp(mapPng).resize(256, 256).jpeg({ quality: 86 }).toBuffer()
writeFileSync(`${outDir}/palette.png`, palette); writeFileSync(`${outDir}/sign.png`, signTex); writeFileSync(`${outDir}/map.png`, mapPng)
const BODY = { map: palette, mapName: 'palette', metal: 0.1, rough: 0.8, nearest: true }
const MAP = { map: map1024, mapName: 'island', metal: 0, rough: 0.92 }
const GLOW = { color: [0.05, 0.04, 0.03, 1], emissive: [1, 0.6, 0.2], rough: 0.5 }
const SIGN = { map: signTex, emissiveMap: signTex, mapName: 'sign', emissive: [0.9, 0.9, 0.9], rough: 0.5 }
const L0 = build(0)
const b0 = { materials: { Map: MAP, Body: BODY, Glow: GLOW, Sign: SIGN }, static: { island: { Map: L0.map }, field: { Body: L0.body, Glow: L0.glow }, sign: { Sign: L0.sign } }, parts: L0.parts }
const box0 = bounds(b0)
const r0 = await writeGlb('lod0.glb', b0)
// LOD1: the land and the slab on the island texture (the slab takes a deep-sea pixel), and the sign
const L1 = build(1)
const deep = [0.004, 0.004]
const slab1 = new Bag(); slab1.add(box(12, BASE, 12).translate(0, BASE / 2, 0), deep)
L1.map.parts.push(...slab1.parts)
const sign512 = await sharp(signTex).resize(512, 256).png().toBuffer()
const r1 = await writeGlb('lod1.glb', { materials: { Map: { ...MAP, map: map512, mapName: 'island512' }, Sign: { ...SIGN, map: sign512, emissiveMap: sign512, mapName: 'sign512' } }, static: { island: { Map: L1.map }, sign: { Sign: L1.sign } } })
// LOD2: one mesh: a coarse island on its slab, and a dark block for the sign
const far = new Bag(); far.parts.push(terrain(18)); far.add(box(12, BASE, 12).translate(0, BASE / 2, 0), deep); { const bd = PL.BUILDINGS.find(b => b.type === 'tower') || PL.BUILDINGS[0]; far.add(box(4, 2, 4).translate(0, 17.3, 0), [(bd.x + HALF) / WORLD, (bd.z + HALF) / WORLD]) }
const r2 = await writeGlb('lod2.glb', { materials: { Map: { ...MAP, map: map256, mapName: 'island256' } }, static: { far: { Map: far } } })
console.log(JSON.stringify({ lod0: r0, lod1: r1, lod2: r2, bounds0: { min: box0.min.toArray().map(v => +v.toFixed(2)), max: box0.max.toArray().map(v => +v.toFixed(2)) } }))
