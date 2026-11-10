// Builds the street view of lot 224 (32 x 44 x 29 m): VOIDWRIGHT as a living orrery inside a shipyard frame.
// Halvor turns in the middle (its texture baked from the game's own terrain), wrapped in a glowing rim of
// air; its moon and a belt of rocks circle it; Kestrel Station orbits low; the Lancer and two Sparrows fly
// a wide tilted lap through a jump gate that flashes as they pass; on the ground the Foothold outpost, a
// Mule lifting off and landing on its fans, and a Mole chewing at a rock. Ships and bases are the game's
// real blueprints, block for block. One 60 s loop on the world clock.
// node gen.mjs [outDir]   (needs three, @gltf-transform/core and sharp: see node_modules)
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { Document, NodeIO } from '@gltf-transform/core'
import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'node:fs'
const { Planet } = await import('../src/world/planet.js')
const { BODIES } = await import('../src/world/universe.js')
const { prefab } = await import('../src/game/prefabs.js')
const { Grid, PALETTE } = await import('../src/grid/grid.js')
const { BLOCKS } = await import('../src/grid/blocks.js')
const { apply } = await import('../src/grid/rot.js')
const { simplex3, fbm3 } = await import('../src/core/noise3.js')

const outDir = process.argv[2] || 'out'
mkdirSync(outDir, { recursive: true })
const LOOP = 60, STEPS = 360, TAU = Math.PI * 2
const HX = 16, HZ = 22, HY = 29

// ---------- the one texture: worlds, ground and a palette ----------
const AT = 1024
const RECT = { halvor: [0, 0, 1024, 512], ket: [0, 512, 512, 256], thessa: [512, 512, 512, 256], ground: [0, 768, 512, 256], pal: [512, 768, 512, 256] }
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const NAMED = { glass: '#2f6a8c', dark: '#22262a', steel: '#8a9096', gold: '#d9a521', white: '#e6e8ea', hazard: '#e0a020', black: '#0e1012', teal: '#2ec4b6', rock1: '#5e574e', rock2: '#48413a', rock3: '#7a6a58', ore: '#8a5a3a',
  tree1: '#2c5630', tree2: '#3d7038', trunk: '#4a3524', pad: '#3a3e44', padLine: '#d9a521', frame: '#1c2026', frame2: '#2b3138', orange: '#e07a22', sky: '#5aa0ff', ice: '#cfe8ff' }
const PAL = []   // [name, r, g, b]
PALETTE.forEach((c, i) => [1, 0.78, 0.56].forEach((k, s) => PAL.push([`p${i}_${s}`, c[0] * 255 * k, c[1] * 255 * k, c[2] * 255 * k])))
for (const [k, v] of Object.entries(NAMED)) PAL.push([k, ...hex(v)])
const PCOLS = 16, PROWS = 8, PCELL = 32
const CELLI = Object.fromEntries(PAL.map(([k], i) => [k, i]))
const cellUV = i => [(RECT.pal[0] + (i % PCOLS + 0.5) * PCELL) / AT, (RECT.pal[1] + (Math.floor(i / PCOLS) + 0.5) * PCELL) / AT]
function nearest(r, g, b) { let best = 0, bd = 1e9; for (let i = 0; i < PAL.length; i++) { const d = (PAL[i][1] - r) ** 2 + (PAL[i][2] - g) ** 2 + (PAL[i][3] - b) ** 2; if (d < bd) { bd = d; best = i } } return best }

const eng = { track: () => ({}), untrack() {}, rel: (v, o) => o.copy(v), detailTex: null }
function worldTexture(id, w, h) {
  // the planet as the game shapes and colours it, with a little relief shading
  const def = BODIES.find(b => b.id === id), P = new Planet(def, eng), px = Buffer.alloc(w * h * 3), cc = [0, 0, 0]
  const H = new Float32Array(w * h), mw = Math.PI * 2 * P.R / w
  const dirOf = (i, j) => { const lon = i / w * TAU, lat = (0.5 - (j + 0.5) / h) * Math.PI; return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)] }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const d = dirOf(i, j); H[j * w + i] = P.hfn(P, d[0] * P.R, d[1] * P.R, d[2] * P.R, mw) }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const d = dirOf(i, j), hh = H[j * w + i], hl = H[j * w + (i + w - 1) % w], hr = H[j * w + (i + 1) % w], hu = H[Math.max(0, j - 1) * w + i], hd = H[Math.min(h - 1, j + 1) * w + i]
    const gx = (hr - hl) / (2 * mw * Math.max(0.2, Math.cos((0.5 - (j + 0.5) / h) * Math.PI))), gy = (hd - hu) / (2 * mw)
    const slope = Math.min(1, Math.hypot(gx, gy) * 1.2)
    P.cfn(P, d[0] * P.R, d[1] * P.R, d[2] * P.R, hh, slope, Math.abs(d[1]), cc)
    const t = P.tint || [1, 1, 1], shade = Math.max(0.55, Math.min(1.45, 1 + (-gx * 0.9 - gy * 0.6) * 1.6))
    for (let q = 0; q < 3; q++) px[(j * w + i) * 3 + q] = Math.max(0, Math.min(255, cc[q] * t[q] * shade * 255))
  }
  return px
}
function groundTexture(w, h) {
  const px = Buffer.alloc(w * h * 3), n = simplex3(4)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const v = fbm3(n, i / 60, j / 60, 0, 4), f = n(i / 9, j / 9, 3)
    let c = [0.3 + v * 0.06, 0.4 + v * 0.07, 0.2]
    if (v > 0.18) c = [0.22, 0.32, 0.17]
    if (v < -0.22) c = [0.42, 0.4, 0.37]
    for (let q = 0; q < 3; q++) px[(j * w + i) * 3 + q] = Math.max(0, Math.min(255, (c[q] + f * 0.03) * 255))
  }
  return px
}
async function atlas() {
  const px = Buffer.alloc(AT * AT * 3)
  const blit = (src, rect) => { const [x0, y0, w, h] = rect; for (let j = 0; j < h; j++) src.copy(px, ((y0 + j) * AT + x0) * 3, j * w * 3, (j + 1) * w * 3) }
  blit(worldTexture('halvor', 1024, 512), RECT.halvor)
  blit(worldTexture('ket', 512, 256), RECT.ket)
  blit(worldTexture('thessa', 512, 256), RECT.thessa)
  blit(groundTexture(512, 256), RECT.ground)
  PAL.forEach(([, r, g, b], i) => { const cx = RECT.pal[0] + (i % PCOLS) * PCELL, cy = RECT.pal[1] + Math.floor(i / PCOLS) * PCELL; for (let y = cy; y < cy + PCELL; y++) for (let x = cx; x < cx + PCELL; x++) { const k = (y * AT + x) * 3; px[k] = r; px[k + 1] = g; px[k + 2] = b } })
  return sharp(px, { raw: { width: AT, height: AT, channels: 3 } })
}
async function signPng() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="256">
  <rect width="1024" height="256" fill="#05090c"/>
  <rect x="8" y="8" width="1008" height="240" fill="none" stroke="#1f6f6a" stroke-width="6"/>
  <text x="512" y="150" text-anchor="middle" font-family="Chakra Petch" font-weight="700" font-size="150" fill="#eafffb" letter-spacing="10">VOIDWRIGHT</text>
  <rect x="150" y="176" width="724" height="5" fill="#3fe0d0"/>
  <text x="512" y="226" text-anchor="middle" font-family="Chakra Petch" font-weight="600" font-size="38" fill="#3fe0d0" letter-spacing="7">BUILD SHIPS · MINE WORLDS · FLY ANYWHERE</text>
</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

// ---------- geometry helpers ----------
function prep(geo, uv) {
  let g = geo.index ? geo : mergeVertices(geo)
  const keepUV = uv === null
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k)
  if (g.index) g = g.toNonIndexed()
  g.computeVertexNormals()
  const n = g.attributes.position.count
  if (!keepUV) { const a = new Float32Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2] = uv[0]; a[i * 2 + 1] = uv[1] } g.setAttribute('uv', new THREE.BufferAttribute(a, 2)) }
  return g
}
class Bag {
  constructor() { this.parts = [] }
  // color: a palette cell name, [u, v] (effects: the Glow material reads its uv as type + phase, kind), or null to keep the geometry's own uv
  add(geo, color, m = null) {
    const uv = typeof color === 'string' ? cellUV(CELLI[color]) : color
    const g = prep(geo.clone(), uv)
    if (m) g.applyMatrix4(m); this.parts.push(g); return this
  }
  raw(g, m = null) { const c = g.clone(); if (m) c.applyMatrix4(m); this.parts.push(c); return this }
  merged() { return mergeVertices(mergeGeometries(this.parts), 1e-4) }
  get tris() { return this.parts.reduce((s, g) => s + g.attributes.position.count / 3, 0) }
}
const M = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s))
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
const cyl = (r1, r2, h, n = 8) => new THREE.CylinderGeometry(r1, r2, h, n)
const FX = { flame: 0, run: 1, blink: 2, gate: 3, spark: 4, lamp: 5 }
const fx = (type, phase = 0, kind = 0) => [FX[type] + Math.min(0.99, Math.max(0, phase)), kind]
function rnd(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

// a sphere mapped into a rectangle of the texture
function globe(r, rect, seg = 48) {
  const g = new THREE.SphereGeometry(r, seg, seg / 2), uv = g.attributes.uv
  // three's sphere u runs with longitude from -x round; the baked texture has u = lon / 2pi from +x: turn the sphere to match
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (rect[0] + 2 + uv.getX(i) * (rect[2] - 4)) / AT, (rect[1] + 2 + (1 - uv.getY(i)) * (rect[3] - 4)) / AT)
  return g
}

// ---------- the game's blueprints as meshes ----------
const PROXY = id => /^(thr_|gyro|jumpdrive|dish|antenna|drill|crusher|refinery|assembler|turbine|detector|core_|beacon|tank_|flood|warnlight|lamp|light|medbay|o2h2|survival_kit|door|gear|porthole|console|locker|blastdoor|hangar|conveyor|duct|gravgen)/.test(id)
const stubWorld = { addGrid() {} }
function ship(id, o = {}) {
  const bp = prefab(id), g = new Grid(stubWorld, bp.size, {}), cs = g.cs
  const P = [], Nn = [], U = [], flames = [], lamps = []
  const tri = (pts, colIdx) => { const uv = cellUV(colIdx); for (const p of pts) { P.push(p[0], p[1], p[2]); U.push(uv[0], uv[1]) } }
  const addGeo = (geo, colIdx) => { const q = geo.index ? geo.toNonIndexed() : geo, a = q.attributes.position; for (let i = 0; i < a.count; i += 3) tri([[a.getX(i), a.getY(i), a.getZ(i)], [a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1)], [a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2)]], colIdx) }
  for (const [bid, i, j, k, rot, col] of bp.blocks) {
    const d = BLOCKS[bid]
    if (!PROXY(bid)) { g.add(bid, i, j, k, rot, col); continue }
    // a stand-in: the block's box in its colour, with a nozzle, a dish, a lamp where it matters
    const S = d.sizes[bp.size], a = apply(rot, 0, 0, 0, [0, 0, 0]), b = apply(rot, S[0] - 1, S[1] - 1, S[2] - 1, [0, 0, 0])
    const lo = [0, 1, 2].map(q => (Math.min(a[q], b[q]) + [i, j, k][q] - 0.5) * cs), hi = [0, 1, 2].map(q => (Math.max(a[q], b[q]) + [i, j, k][q] + 0.5) * cs)
    const c = [0, 1, 2].map(q => (lo[q] + hi[q]) / 2), sz = [0, 1, 2].map(q => hi[q] - lo[q])
    const pc = PALETTE[col] || PALETTE[0]
    const paint = nearest(pc[0] * 255, pc[1] * 255, pc[2] * 255)
    const mm = new THREE.Matrix4().makeTranslation(c[0], c[1], c[2])
    if (bid.startsWith('thr_')) {
      const f = d.func.thruster, ex = apply(rot, 0, 0, 1, [0, 0, 0]), ax = ex[0] ? 0 : ex[1] ? 1 : 2, len = sz[ax], r = Math.min(...sz.filter((_, q) => q !== ax)) * 0.44
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...ex))
      const m2 = new THREE.Matrix4().compose(new THREE.Vector3(...c), q, new THREE.Vector3(1, 1, 1))
      addGeo(cyl(r * (f.kind === 'atmo' ? 1 : 0.95), r * 0.7, len * 0.92, 10).applyMatrix4(m2), f.kind === 'atmo' ? CELLI.steel : CELLI.dark)
      const tip = c.map((v, q2) => v + ex[q2] * len * 0.5)
      flames.push({ p: tip, d: ex, r, kind: f.kind })
    } else if (bid === 'dish') { addGeo(cyl(sz[0] * 0.46, sz[0] * 0.08, sz[1] * 0.4, 12).applyMatrix4(new THREE.Matrix4().makeTranslation(c[0], c[1] + sz[1] * 0.15, c[2])), CELLI.white); addGeo(box(sz[0] * 0.15, sz[1] * 0.6, sz[2] * 0.15).applyMatrix4(new THREE.Matrix4().makeTranslation(c[0], c[1] - sz[1] * 0.2, c[2])), CELLI.steel) }
    else if (bid === 'antenna' || bid === 'beacon' || bid === 'turbine') { addGeo(box(cs * 0.16, sz[1], cs * 0.16).applyMatrix4(mm), CELLI.steel); lamps.push({ p: [c[0], hi[1], c[2]], r: cs * 0.2, blink: true }) }
    else if (bid.startsWith('tank_')) { addGeo(cyl(Math.min(sz[0], sz[2]) * 0.46, Math.min(sz[0], sz[2]) * 0.46, sz[1] * 0.96, 10).applyMatrix4(mm), bid === 'tank_h2' ? CELLI.white : CELLI.sky) }
    else if (bid === 'drill') { const ex = apply(rot, 0, 0, -1, [0, 0, 0]), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...ex)); addGeo(cyl(0.02, Math.min(sz[0], sz[1]) * 0.42, Math.max(...sz), 10).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...c), q, new THREE.Vector3(1, 1, 1))), CELLI.gold) }
    else if (bid === 'crusher') { addGeo(box(sz[0], sz[1], sz[2] * 0.5).applyMatrix4(new THREE.Matrix4().makeTranslation(c[0], c[1], c[2] + sz[2] * 0.25)), CELLI.dark); for (const dy of [-0.22, 0.22]) addGeo(cyl(sz[1] * 0.2, sz[1] * 0.2, sz[0] * 0.9, 8).rotateZ(Math.PI / 2).applyMatrix4(new THREE.Matrix4().makeTranslation(c[0], c[1] + dy * sz[1], c[2] - sz[2] * 0.2)), CELLI.gold) }
    else if (/^(flood|warnlight|lamp|light)/.test(bid)) { lamps.push({ p: c, r: cs * 0.22, blink: bid === 'warnlight' }) }
    else if (bid === 'gear') { addGeo(box(sz[0] * 0.9, sz[1] * 0.3, sz[2] * 0.9).applyMatrix4(new THREE.Matrix4().makeTranslation(c[0], lo[1] + sz[1] * 0.15, c[2])), CELLI.hazard); addGeo(box(sz[0] * 0.25, sz[1] * 0.8, sz[2] * 0.25).applyMatrix4(mm), CELLI.steel) }
    else if (bid === 'porthole') { addGeo(box(sz[0], sz[1], sz[2]).applyMatrix4(mm), paint); const ex = apply(rot, 0, 0, 1, [0, 0, 0]); addGeo(box(ex[0] ? sz[0] * 1.04 : sz[0] * 0.5, sz[1] * 0.5, ex[2] ? sz[2] * 1.04 : sz[2] * 0.5).applyMatrix4(mm), CELLI.glass) }
    else if (bid === 'hangar' || bid === 'door' || bid === 'blastdoor') addGeo(box(sz[0] * (bid === 'hangar' ? 1 : 0.9), sz[1], sz[2] * 0.3).applyMatrix4(mm), bid === 'hangar' ? CELLI.hazard : CELLI.steel)
    else addGeo(box(sz[0] * 0.92, sz[1] * 0.92, sz[2] * 0.92).applyMatrix4(mm), /core_|jumpdrive|gravgen/.test(bid) ? CELLI.teal : /medbay|survival/.test(bid) ? CELLI.white : CELLI.steel)
  }
  g.updateMass()
  for (const [ck, ch] of g.chunks) g.buildChunk(ck, ch)
  for (const ch of g.chunks.values()) for (const [mesh, glass] of [[ch.mesh, false], [ch.glass, true]]) {
    if (!mesh) continue
    const a = mesh.geometry.attributes.position, c = mesh.geometry.attributes.color, e = mesh.geometry.attributes.aEmit
    for (let i = 0; i < a.count; i += 3) {
      let r = 0, gg = 0, b = 0, em = 0
      for (let q = 0; q < 3; q++) { r += c.getX(i + q); gg += c.getY(i + q); b += c.getZ(i + q); em += e.getX(i + q) }
      const s = v => Math.pow(Math.max(0, v / 3), 1 / 2.2) * 255
      const idx = glass ? CELLI.glass : em > 1.5 ? CELLI.teal : nearest(s(r), s(gg), s(b))
      tri([[a.getX(i), a.getY(i), a.getZ(i)], [a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1)], [a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2)]], idx)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(U), 2))
  geo.computeVertexNormals(); geo.computeBoundingBox()
  const ctr = geo.boundingBox.getCenter(new THREE.Vector3())
  return { geo, flames, lamps, ctr, size: geo.boundingBox.getSize(new THREE.Vector3()), min: geo.boundingBox.min.clone() }
}
// puts a ship into bags: m places the ship (its own metres, centred) in its node's space
function placeShip(S, m, body, glow, o = {}) {
  const c = new THREE.Matrix4().makeTranslation(-S.ctr.x, o.onGround ? -S.min.y : -S.ctr.y, -S.ctr.z), mm = m.clone().multiply(c)
  body.raw(S.geo, mm)
  if (!glow) return
  const sc = new THREE.Vector3().setFromMatrixScale(m).x
  if (o.flames) for (const f of S.flames) {
    if (f.kind === 'atmo' && !o.lift) continue
    if (o.only && !o.only(f)) continue
    const len = f.r * (o.lift ? 3.2 : f.kind === 'ion' ? 5 : 6), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...f.d))
    const fm = new THREE.Matrix4().compose(new THREE.Vector3(f.p[0] + f.d[0] * len / 2, f.p[1] + f.d[1] * len / 2, f.p[2] + f.d[2] * len / 2), q, new THREE.Vector3(1, 1, 1))
    glow.add(new THREE.ConeGeometry(f.r * 0.85, len, 6), fx('flame', (f.p[0] * 7.3 + f.p[2] * 3.1) % 1, o.lift ? 2 : f.kind === 'ion' ? 0 : 1), mm.clone().multiply(fm))
  }
  if (o.lamps !== false) for (const l of S.lamps) glow.add(new THREE.OctahedronGeometry(Math.max(l.r, 0.09 / sc)), l.blink ? fx('blink', (l.p[0] * 0.37 + l.p[2] * 0.11) % 1) : fx('lamp'), mm.clone().multiply(new THREE.Matrix4().makeTranslation(l.p[0], l.p[1], l.p[2])))
}

// ---------- GLB ----------
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
    if (m.blend) mat.setAlphaMode('BLEND')
    if (m.doubleSided) mat.setDoubleSided(true)
    mats[name] = mat
  }
  let total = 0, draws = 0
  const mesh = (name, bags) => {
    const msh = doc.createMesh(name)
    for (const [matName, bag] of Object.entries(bags)) {
      if (!bag || !bag.parts.length) continue
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
        if (prev && prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w)
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
// every vertex (and every animated part over the loop) must stay inside the lot
function bounds(b) {
  const box3 = new THREE.Box3(), v = new THREE.Vector3(), worst = {}
  for (const [nm, o] of Object.entries(b.static)) for (const bag of Object.values(o)) for (const g of bag.parts) { g.computeBoundingBox(); box3.union(g.boundingBox) }
  if (b.parts) for (const [nm, part] of Object.entries(b.parts)) {
    const pb = new THREE.Box3(), pts = []
    for (const bag of Object.values(part.bags)) if (bag) for (const g of bag.parts) { const p = g.attributes.position; for (let i = 0; i < p.count; i += 7) pts.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))) }
    for (let i = 0; i <= STEPS; i += 2) { const { p, q } = part.anim(LOOP * i / STEPS); for (const pt of pts) pb.expandByPoint(v.copy(pt).applyQuaternion(q).add(new THREE.Vector3(...p))) }
    worst[nm] = [pb.min.toArray().map(x => +x.toFixed(1)), pb.max.toArray().map(x => +x.toFixed(1))]
    box3.union(pb)
  }
  return { box3, worst }
}

// ======================= the scene =======================
const C = new THREE.Vector3(0, 15.2, -3), PR = 6.4      // Halvor
const TILT_L = 0.24                                     // the Lancer's lap
const lapPos = a => new THREE.Vector3(Math.sin(a) * 12.4, 0, Math.cos(a) * 16.2).applyAxisAngle(new THREE.Vector3(1, 0, 0), TILT_L).add(new THREE.Vector3(0, 15.4, -0.6))
function lookQuat(dir, up = new THREE.Vector3(0, 1, 0), bank = 0) {
  // ships fly nose first: their nose is -Z
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir.clone().negate(), up)
  return new THREE.Quaternion().setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bank))
}
const ground = (x, z) => { const e = Math.max(Math.abs(x) / HX, Math.abs(z) / HZ), n = GN(x / 7, z / 7, 1) * 0.5 + GN(x / 2.6, z / 2.6, 5) * 0.14; return 0.75 + Math.max(0, n + 0.25) * 1.5 * Math.min(1, Math.max(0, (Math.hypot(x * 1.1, (z - 4) * 0.8) - 11) / 6)) * (1 - Math.max(0, e - 0.9) * 8) }
const GN = simplex3(21)

function build(lod) {
  const hi = lod === 0
  const map = new Bag(), glow = new Bag(), air = new Bag(), sign = new Bag(), parts = {}
  // ---- the ground: a slab of Halvor, hills at the edges, flat in the middle ----
  {
    const nx = hi ? 32 : 12, nz = hi ? 44 : 16, g = new THREE.PlaneGeometry(HX * 2 - 0.5, HZ * 2 - 0.5, nx, nz).rotateX(-Math.PI / 2)
    const p = g.attributes.position, uv = g.attributes.uv, R = RECT.ground
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, ground(x, z)); uv.setXY(i, (R[0] + 4 + (x / (HX * 2) + 0.5) * (R[2] - 8)) / AT, (R[1] + 4 + (z / (HZ * 2) + 0.5) * (R[3] - 8)) / AT) }
    map.add(g, null)
    // the slab's sides
    const w = HX * 2 - 0.5, d = HZ * 2 - 0.5
    for (const [sx, sz, len, ry] of [[0, d / 2, w, 0], [0, -d / 2, w, Math.PI], [w / 2, 0, d, Math.PI / 2], [-w / 2, 0, d, -Math.PI / 2]]) map.add(new THREE.PlaneGeometry(len, 0.76).translate(0, 0.38, 0), 'rock2', M(sx, 0, sz, ry))
  }
  // ---- the shipyard frame and the sign round its top ----
  {
    const px = HX - 0.75, pz = HZ - 0.75, top = HY - 0.5
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      map.add(box(0.5, top, 0.5).translate(0, top / 2, 0), 'frame', M(sx * px, 0, sz * pz))
      if (hi) for (let y = 3; y < top - 4; y += 4.2) map.add(box(0.7, 0.3, 0.7), 'frame2', M(sx * px, y, sz * pz))
      glow.add(box(0.12, top - 4.5, 0.12).translate(0, (top - 4.5) / 2 + 0.6, 0), fx('run', (sx + sz + 2) / 4 * 0.5), M(sx * (px - 0.3), 0, sz * (pz - 0.3)))
    }
    for (const sz of [-1, 1]) map.add(box(px * 2 + 0.5, 0.45, 0.45), 'frame', M(0, top - 0.22, sz * pz))
    for (const sx of [-1, 1]) map.add(box(0.45, 0.45, pz * 2 + 0.5), 'frame', M(sx * px, top - 0.22, 0))
    // four banners (12.8 x 3.2 m) hung under the top beams, lit both ways
    const bw = 12.8, bh = 3.2, by = top - 0.5 - bh / 2
    const banner = m => { const g = new THREE.PlaneGeometry(bw, bh); sign.add(g, null, m); sign.add(g, null, m.clone().multiply(new THREE.Matrix4().makeRotationY(Math.PI))) }
    banner(M(0, by, pz - 0.3, 0)); banner(M(0, by, -pz + 0.3, Math.PI)); banner(M(px - 0.3, by, 0, Math.PI / 2)); banner(M(-px + 0.3, by, 0, -Math.PI / 2))
    for (const [x, z, ry] of [[0, pz - 0.3, 0], [0, -pz + 0.3, 0], [px - 0.3, 0, Math.PI / 2], [-px + 0.3, 0, Math.PI / 2]]) { map.add(box(bw + 0.5, 0.2, 0.25), 'frame2', M(x, by - bh / 2 - 0.12, z, ry)); glow.add(box(bw, 0.06, 0.3), fx('lamp', 0, 1), M(x, by - bh / 2 - 0.26, z, ry)) }
  }
  // ---- Halvor: the globe turns (its own part), the air round it glows at the rim ----
  const halvor = new Bag(); halvor.add(globe(PR, RECT.halvor, hi ? 64 : 24), null)
  if (hi) {
    parts.halvor = { bags: { Map: halvor }, anim: t => ({ p: C.toArray(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, t / LOOP * TAU, 0.12, 'ZXY')) }) }
    air.add(new THREE.SphereGeometry(PR * 1.07, 48, 24), 'sky', M(C.x, C.y, C.z))
  } else map.raw(halvor.parts[0], M(C.x, C.y, C.z, 0.6, 0.12, 0.3))
  // the moon, on its own tilted round
  const ket = new Bag(); ket.add(globe(1.0, RECT.ket, hi ? 20 : 10), null)
  const moonAt = t => { const a = t / LOOP * TAU + 1.2; return new THREE.Vector3(Math.cos(a) * 10.6, 0, Math.sin(a) * 10.6).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.42).add(C) }
  if (hi) parts.ket = { bags: { Map: ket }, anim: t => ({ p: moonAt(t).toArray(), q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -t / LOOP * TAU) }) }
  else map.raw(ket.parts[0], new THREE.Matrix4().makeTranslation(...moonAt(8).toArray()))
  // the belt: rocks in a ring, turning the other way
  {
    const r = rnd(7), belt = new Bag(), n = hi ? 54 : 16
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r() * 0.1, rad = 8.9 + r() * 0.9, s = 0.16 + r() ** 2 * 0.34
      const g = new THREE.IcosahedronGeometry(s, hi && s > 0.3 ? 1 : 0), p = g.attributes.position
      for (let q = 0; q < p.count; q++) { const k = 0.75 + GN(p.getX(q) * 5 + i, p.getY(q) * 5, p.getZ(q) * 5) * 0.35; p.setXYZ(q, p.getX(q) * k * (0.8 + r() * 0.0), p.getY(q) * k * 0.8, p.getZ(q) * k) }
      belt.add(g, ['rock1', 'rock2', 'rock3', 'ore'][Math.floor(r() * 4)], M(Math.cos(a) * rad, (r() - 0.5) * 0.5, Math.sin(a) * rad, r() * 6, r() * 6))
    }
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.16)
    if (hi) parts.belt = { bags: { Map: belt }, anim: t => ({ p: C.toArray(), q: tilt.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -t / LOOP * TAU)) }) }
    else for (const g of belt.parts) map.raw(g, new THREE.Matrix4().compose(C, tilt, new THREE.Vector3(1, 1, 1)))
  }
  // ---- Kestrel Station in low orbit ----
  {
    const b = new Bag(), g = new Bag()
    if (hi) placeShip(SHIPS.kestrel, M(0, 0, 0, 0, 0, 0, 0.046), b, g)
    else b.add(box(2.6, 0.5, 3.2), 'p1_1')
    const at = t => { const a = -t / LOOP * TAU + 2.4; const p = new THREE.Vector3(Math.cos(a) * 7.95, 0, Math.sin(a) * 7.95).applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.2).add(C); const up = p.clone().sub(C).normalize(); return { p: p.toArray(), q: lookQuat(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.2).negate(), up) } }
    if (hi) parts.station = { bags: { Map: b, Glow: g }, anim: at }
    else { const o = at(20); map.raw(b.parts[0], new THREE.Matrix4().compose(new THREE.Vector3(...o.p), o.q, new THREE.Vector3(1, 1, 1))) }
  }
  // ---- the Lancer and two Sparrows: two laps a loop, through the gate ----
  {
    const b = new Bag(), g = new Bag()
    if (hi) {
      placeShip(SHIPS.lancer, M(0, 0, 0, 0, 0, 0, 0.088), b, g, { flames: true, only: f => f.d[2] > 0.5 })
      for (const [dx, dy, dz] of [[-1.9, 0.5, 2.6], [1.9, -0.3, 3.4]]) placeShip(SHIPS.sparrow, M(dx, dy, dz, 0, 0, dx * 0.08, 0.2), b, g, { flames: true, only: f => f.d[2] > 0.5 })
    } else { b.add(box(0.9, 0.6, 3.4), 'p12_0'); b.add(box(0.5, 0.3, 1.4), 'p6_0', M(-1.9, 0.5, 2.6)); b.add(box(0.5, 0.3, 1.4), 'p6_0', M(1.9, -0.3, 3.4)) }
    const at = t => { const a = t / LOOP * TAU * 2, p = lapPos(a), d = lapPos(a + 0.01).sub(p).normalize(); return { p: p.toArray(), q: lookQuat(d, new THREE.Vector3(0, 1, 0), -0.35) } }
    if (hi) parts.flight = { bags: { Map: b, Glow: g }, anim: at }
    else { const o = at(4); for (const gg of b.parts) map.raw(gg, new THREE.Matrix4().compose(new THREE.Vector3(...o.p), o.q, new THREE.Vector3(1, 1, 1))) }
  }
  // ---- the jump gate on their path: a ring of lit segments that turns, and flashes as they pass ----
  {
    const gp = lapPos(0), gd = lapPos(0.01).sub(gp).normalize(), q0 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), gd)
    const ring = new Bag(), frame = new Bag(), R = 2.5, n = 16
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU
      ring.add(box(0.5, 0.16, 0.2), fx('gate', i / n), M(Math.cos(a) * R, Math.sin(a) * R, 0, 0, 0, a + Math.PI / 2))
      if (i % 2 === 0) frame.add(box(1.05, 0.34, 0.42), 'frame2', M(Math.cos(a) * (R + 0.22), Math.sin(a) * (R + 0.22), 0, 0, 0, a + Math.PI / 2))
    }
    ring.add(new THREE.CircleGeometry(R - 0.25, 20), fx('gate', 0, 1)); ring.add(new THREE.CircleGeometry(R - 0.25, 20).rotateY(Math.PI), fx('gate', 0, 1))
    const fm = new THREE.Matrix4().compose(gp, q0, new THREE.Vector3(1, 1, 1))
    for (const g of frame.parts) map.raw(g, fm)
    // two struts down to the ground
    for (const s of [-1, 1]) { const base = new THREE.Vector3(s * 2.3, 0, 0).applyQuaternion(q0).add(gp); map.add(box(0.22, base.y - R * 0.5, 0.22).translate(0, (base.y - R * 0.5) / 2, 0), 'frame', M(base.x, 0, base.z)) }
    if (hi) parts.gate = { bags: { Glow: ring }, anim: t => ({ p: gp.toArray(), q: q0.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), t / LOOP * TAU * 3)) }) }
    else for (const g of ring.parts.slice(0, n)) glow.raw(g, fm)
  }
  // ---- on the ground: the outpost, the pad and the Mule, the Mole at its rock, trees ----
  const PAD = [8.2, 10.5], BASE = [-7.6, 10.5], ROCK = [7.5, -15]
  {
    const gy = ground(BASE[0], BASE[1])
    if (hi) placeShip(SHIPS.foothold, M(BASE[0], gy - 0.25, BASE[1], 0.5, 0, 0, 0.27), map, glow, { onGround: true })
    else map.add(box(6.5, 1.6, 6.5).translate(0, 0.8, 0), 'p1_1', M(BASE[0], gy, BASE[1], 0.5))
    // the pad: a dark slab with a lit edge
    const py = ground(PAD[0], PAD[1])
    map.add(cyl(4.2, 4.5, 0.3, 10), 'pad', M(PAD[0], py + 0.1, PAD[1]))
    if (hi) { map.add(new THREE.RingGeometry(3.3, 3.6, 24).rotateX(-Math.PI / 2), 'padLine', M(PAD[0], py + 0.27, PAD[1])); for (let i = 0; i < 8; i++) glow.add(box(0.2, 0.14, 0.2), fx('blink', i / 8), M(PAD[0] + Math.cos(i / 8 * TAU) * 4.1, py + 0.3, PAD[1] + Math.sin(i / 8 * TAU) * 4.1)) }
    // the Mule: on the pad, up on its fans, a slow turn in the air, down again
    const b = new Bag(), g = new Bag()
    if (hi) placeShip(SHIPS.mule, M(0, 0, 0, 0, 0, 0, 0.19), b, g, { flames: true, lift: true, only: f => f.d[1] < -0.5, onGround: true })
    else b.add(box(2.4, 1.4, 5).translate(0, 0.7, 0), 'p4_0')
    const ss = (a, c, x) => { const k = Math.max(0, Math.min(1, (x - a) / (c - a))); return k * k * (3 - 2 * k) }
    const at = t => { const up = ss(8, 20, t) - ss(34, 46, t), yaw = 0.9 + ss(18, 36, t) * TAU; return { p: [PAD[0], py + 0.28 + up * 6.2, PAD[1]], q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(t * 0.9) * 0.03 * up, yaw, Math.sin(t * 0.7) * 0.04 * up, 'YXZ')) } }
    if (hi) parts.mule = { bags: { Map: b, Glow: g }, anim: at }
    else map.raw(b.parts[0], M(PAD[0], py + 0.28, PAD[1], 0.9))
    // the rock and the Mole
    const ry = ground(ROCK[0], ROCK[1])
    const rg = new THREE.IcosahedronGeometry(2.7, hi ? 2 : 1), p = rg.attributes.position
    for (let q = 0; q < p.count; q++) { const k = 0.8 + GN(p.getX(q) * 0.6, p.getY(q) * 0.6, p.getZ(q) * 0.6) * 0.3; p.setXYZ(q, p.getX(q) * k, p.getY(q) * k * 0.85, p.getZ(q) * k) }
    map.add(rg, 'rock1', M(ROCK[0] + 3.2, ry + 1.5, ROCK[1]))
    if (hi) {
      for (const [dx, dy, dz, s, c] of [[1.6, 2.3, 1.2, 0.5, 'ore'], [2.1, 0.9, -1.6, 0.6, 'ore'], [1.2, 1.6, -0.4, 0.4, 'gold']]) map.add(new THREE.IcosahedronGeometry(s, 0), c, M(ROCK[0] + dx + 0.6, ry + dy, ROCK[1] + dz))
      placeShip(SHIPS.mole, M(ROCK[0] - 2.7, ry + 0.05, ROCK[1], -Math.PI / 2, 0, 0, 0.15), map, glow, { onGround: true })
      for (let i = 0; i < 9; i++) glow.add(new THREE.OctahedronGeometry(0.09 + (i % 3) * 0.04), fx('spark', i / 9), M(ROCK[0] + 0.55 + (i % 3) * 0.2, ry + 0.5 + (i * 0.37 % 1) * 1.6, ROCK[1] + ((i * 0.61) % 1 - 0.5) * 3.4))
    } else map.add(box(5.5, 1.6, 4), 'p4_1', M(ROCK[0] - 2.7, ry + 0.9, ROCK[1]))
    // trees round the edges
    const r = rnd(3), nt = hi ? 46 : 14
    for (let i = 0; i < nt; i++) {
      const x = (r() - 0.5) * (HX * 2 - 3), z = (r() - 0.5) * (HZ * 2 - 3)
      if (Math.hypot(x - PAD[0], z - PAD[1]) < 5.5 || Math.hypot(x - BASE[0], z - BASE[1]) < 5.8 || Math.hypot(x - ROCK[0], z - ROCK[1]) < 6.5 || Math.hypot(x, z - 15.5) < 3.4) continue
      const y = ground(x, z), s = 0.7 + r() * 0.7
      map.add(cyl(0.06 * s, 0.1 * s, 0.7 * s, 5), 'trunk', M(x, y + 0.35 * s, z))
      map.add(new THREE.ConeGeometry(0.55 * s, 1.3 * s, 6), r() < 0.5 ? 'tree1' : 'tree2', M(x, y + 1.2 * s, z))
      if (hi) map.add(new THREE.ConeGeometry(0.4 * s, 1.0 * s, 6), 'tree2', M(x, y + 1.9 * s, z))
    }
  }
  return { map, glow, air, sign, parts }
}

const t0 = Date.now()
const SHIPS = {}
for (const id of ['kestrel', 'lancer', 'sparrow', 'mule', 'mole', 'foothold']) { SHIPS[id] = ship(id); console.error(id, SHIPS[id].geo.attributes.position.count / 3, 'tris', SHIPS[id].size.toArray().map(v => +v.toFixed(1)).join(' x '), 'm') }
const atl = await atlas(), signTex = await signPng()
const map1024 = await atl.clone().jpeg({ quality: 90 }).toBuffer(), map512 = await atl.clone().resize(512, 512).jpeg({ quality: 88 }).toBuffer(), map256 = await atl.clone().resize(256, 256, { kernel: 'nearest' }).jpeg({ quality: 90 }).toBuffer()
writeFileSync(`${outDir}/atlas.png`, await atl.clone().png().toBuffer()); writeFileSync(`${outDir}/sign.png`, signTex)
console.error('textures', Date.now() - t0, 'ms')
const MAP = { map: map1024, mapName: 'atlas', metal: 0.05, rough: 0.85 }
const GLOW = { color: [0.03, 0.04, 0.05, 1], emissive: [0.2, 0.9, 0.85], rough: 0.5 }
const AIR = { color: [0.3, 0.6, 1, 0.25], emissive: [0.1, 0.25, 0.5], rough: 1, blend: true }
const SIGN = { map: signTex, emissiveMap: signTex, mapName: 'sign', emissive: [0.9, 0.9, 0.9], rough: 0.5 }
const L0 = build(0)
const b0 = { materials: { Map: MAP, Glow: GLOW, Air: AIR, Sign: SIGN }, static: { yard: { Map: L0.map, Glow: L0.glow }, air: { Air: L0.air }, sign: { Sign: L0.sign } }, parts: L0.parts }
const bb = bounds(b0)
const r0 = await writeGlb('lod0.glb', b0)
const L1 = build(1)
const sign512 = await sharp(signTex).resize(512, 128).png().toBuffer()
const r1 = await writeGlb('lod1.glb', { materials: { Map: { ...MAP, map: map512, mapName: 'atlas512' }, Sign: { ...SIGN, map: sign512, emissiveMap: sign512, mapName: 'sign512' } }, static: { yard: { Map: L1.map }, sign: { Sign: L1.sign } } })
// LOD2: one mesh: the slab, the frame, the globe, blocks where the banners are
const far = new Bag()
far.add(box(HX * 2 - 0.5, 0.8, HZ * 2 - 0.5).translate(0, 0.4, 0), 'tree2')
for (const sx of [-1, 1]) for (const sz of [-1, 1]) far.add(box(0.6, HY - 0.5, 0.6).translate(0, (HY - 0.5) / 2, 0), 'frame', M(sx * (HX - 0.75), 0, sz * (HZ - 0.75)))
for (const sz of [-1, 1]) { far.add(box(HX * 2 - 1, 0.5, 0.5), 'frame', M(0, HY - 0.7, sz * (HZ - 0.75))); far.add(box(12.8, 3.2, 0.3), 'teal', M(0, HY - 2.6, sz * (HZ - 1.05))) }
for (const sx of [-1, 1]) { far.add(box(0.5, 0.5, HZ * 2 - 1), 'frame', M(sx * (HX - 0.75), HY - 0.7, 0)); far.add(box(0.3, 3.2, 12.8), 'teal', M(sx * (HX - 1.05), HY - 2.6, 0)) }
far.add(globe(PR, RECT.halvor, 16), null, M(C.x, C.y, C.z, 0.6))
far.add(new THREE.IcosahedronGeometry(1, 0), 'steel', new THREE.Matrix4().makeTranslation(C.x + 9, C.y + 3, C.z + 4))
const r2 = await writeGlb('lod2.glb', { materials: { Map: { ...MAP, map: map256, mapName: 'atlas256' } }, static: { far: { Map: far } } })
console.log(JSON.stringify({ lod0: r0, lod1: r1, lod2: r2, bounds: { min: bb.box3.min.toArray().map(v => +v.toFixed(2)), max: bb.box3.max.toArray().map(v => +v.toFixed(2)) }, parts: bb.worst }))
