// Builds the street view of lot 224 (32 x 44 x 29 m): a shipyard where one engineer builds a starfighter and
// flies it away, over and over. On the pad a blueprint of light shows the Crossguard (the game's own
// four-winged fighter, block for block). The engineer jets from part to part with a welding torch and the
// ship comes together in seven pieces: lower engines on their feet, the body, the long nose, the upper
// engines, the lower wings, the upper wings, then the guns and the canopy. The engineer climbs in, the
// engines light, the ship lifts, turns toward Halvor hanging in the sky and jumps away in a flash. The pad
// stands empty for a while; then the engineer comes out of the workshop and starts again. One 60 s loop.
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
const FX = { flame: 0, run: 1, blink: 2, flash: 3, weld: 4, lamp: 5 }
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
const PROXY = id => /^(thr_|gyro|jumpdrive|dish|antenna|drill|crusher|refinery|assembler|turbine|detector|core_|beacon|tank_|flood|warnlight|lamp|lightstrip|lightpanel|medbay|o2h2|survival_kit|door|gear|porthole|console|locker|blastdoor|hangar|conveyor|duct|gravgen)/.test(id)
const stubWorld = { addGrid() {} }
function ship(id, o = {}) {
  const bp = prefab(id), g = new Grid(stubWorld, bp.size, {}), cs = g.cs
  const P = [], Nn = [], U = [], flames = [], lamps = []
  const tri = (pts, colIdx) => { const uv = cellUV(colIdx); for (const p of pts) { P.push(p[0], p[1], p[2]); U.push(uv[0], uv[1]) } }
  const addGeo = (geo, colIdx) => { const q = geo.index ? geo.toNonIndexed() : geo, a = q.attributes.position; for (let i = 0; i < a.count; i += 3) tri([[a.getX(i), a.getY(i), a.getZ(i)], [a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1)], [a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2)]], colIdx) }
  for (const blk of bp.blocks) {
    if (o.keep && !o.keep(blk)) continue
    const [bid, i, j, k, rot, col] = blk
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
    else if (/^(flood|warnlight|lamp|lightstrip|lightpanel)/.test(bid)) { lamps.push({ p: c, r: cs * 0.22, blink: bid === 'warnlight' }) }
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
      const P = new Float32Array((STEPS + 1) * 3), Q = new Float32Array((STEPS + 1) * 4), SC = new Float32Array((STEPS + 1) * 3)
      let prev = null
      for (let i = 0; i <= STEPS; i++) {
        const { p, q, s } = part.anim(times[i])
        if (prev && prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w)
        P.set(p, i * 3); Q.set([q.x, q.y, q.z, q.w], i * 4); SC.set(s || [1, 1, 1], i * 3); prev = q.clone()
      }
      node.setTranslation([P[0], P[1], P[2]]).setRotation([Q[0], Q[1], Q[2], Q[3]]).setScale([SC[0], SC[1], SC[2]])
      for (const [path, type, arr] of [['translation', 'VEC3', P], ['rotation', 'VEC4', Q], ['scale', 'VEC3', SC]]) {
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
    for (let i = 0; i <= STEPS; i++) { const { p, q, s } = part.anim(LOOP * i / STEPS); const sv = new THREE.Vector3(...(s || [1, 1, 1])); for (const pt of pts) pb.expandByPoint(v.copy(pt).multiply(sv).applyQuaternion(q).add(new THREE.Vector3(...p))) }
    worst[nm] = [pb.min.toArray().map(x => +x.toFixed(1)), pb.max.toArray().map(x => +x.toFixed(1))]
    box3.union(pb)
  }
  return { box3, worst }
}

// ======================= the scene =======================
// ---- the clock (seconds in the 60 s loop; the shaders below are written from the same numbers) ----
const NSEG = 7, STAGE = 3.6, FLY = 1.1, WELD_END = 3.0, POP = 0.5
const BUILT = NSEG * STAGE                 // 25.2: the last piece is on
const BOARD = BUILT + 2.2, SEATED = BOARD + 1.0   // the engineer reaches the cockpit, is inside
const IGNITE = 29.5, LIFT = 30, TURN = 33, RUN = 37, GONE = 42.2
const OUT = 52, HOLO = 53                  // the engineer comes out again; the blueprint lights up
const ss = (a, c, x) => { const k = Math.max(0, Math.min(1, (x - a) / (c - a))); return k * k * (3 - 2 * k) }
function lookQuat(dir, up = new THREE.Vector3(0, 1, 0), bank = 0) {
  // ships and people face along -Z
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir.clone().negate(), up)
  return new THREE.Quaternion().setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bank))
}
const GN = simplex3(21)
const PADC = new THREE.Vector3(0, 1.05, 0.5), PADW = 10.6, PADL = 13.6    // the pad's top centre and half sizes
const HUT = new THREE.Vector3(-12.6, 0.75, 18.2)
const K = 1.3                                                             // the fighter and the engineer, a little larger than life
const SKY = new THREE.Vector3(-8.6, 22.6, -15.2), SKYR = 3.3             // Halvor, hanging in a corner of the sky
const ground = (x, z) => 0.75   // the yard is level: everything stands on it

// ---- the fighter in its seven pieces, in the order they are built ----
const segOf = ([bid, i, j, k]) => {
  const ax = Math.abs(i)
  if (ax >= 14) return 6                                    // the guns
  if (ax >= 4) return j >= 1 ? 5 : 4                        // upper wings, lower wings
  if (j <= -3) return 0                                     // struts and feet
  if (ax >= 2) return k < -6 ? 2 : k < 0 ? 1 : j >= 3 ? 3 : 0   // thrusters by the nose and body; upper and lower engines
  if (bid === 'canopy' || bid === 'detector') return 6
  return k < -6 ? 2 : 1                                     // the nose, the body
}
const FULL = ship('crossguard')
const OFF = new THREE.Vector3(-FULL.ctr.x, -FULL.min.y, -FULL.ctr.z).multiplyScalar(K)   // ship metres to the ship's own frame: centred, feet at 0
for (const f of FULL.flames) { f.p = f.p.map(v => v * K); f.r *= K }
const SEGS = []
for (let n = 0; n < NSEG; n++) {
  const S = ship('crossguard', { keep: b => segOf(b) === n })
  S.geo.scale(K, K, K).translate(OFF.x, OFF.y, OFF.z); S.geo.computeBoundingBox()
  const bb = S.geo.boundingBox, c = bb.getCenter(new THREE.Vector3())
  SEGS.push({ S, c, bb: bb.clone(), geo: S.geo.clone().translate(-c.x, -c.y, -c.z) })
}
console.error('crossguard', FULL.geo.attributes.position.count / 3, 'tris', FULL.size.toArray().map(v => +v.toFixed(1)).join(' x '), 'm; pieces', SEGS.map(s => s.geo.attributes.position.count / 3).join(' '))

// the ship as a whole: where it is, how it is turned, how big (it shrinks and stretches as it jumps away)
const REST = PADC.clone()
const HOVER = REST.clone().add(new THREE.Vector3(0, 5.6, 0)), VANISH = SKY.clone().add(new THREE.Vector3(2.6, -2.2, 3.4))
const DIR = VANISH.clone().sub(HOVER).normalize(), FLAT = new THREE.Vector3(DIR.x, 0, DIR.z).normalize()
const Q0 = lookQuat(new THREE.Vector3(0, 0, -1)), QYAW = lookQuat(FLAT), QRUN = lookQuat(DIR)
function shipAt(t) {
  if (t < LIFT || t >= GONE + 0.6) return { p: REST.clone(), q: Q0.clone(), s: new THREE.Vector3(1, 1, 1), gone: t >= GONE }
  const up = ss(LIFT, LIFT + 4.5, t), e = Math.pow(Math.max(0, Math.min(1, (t - RUN) / (GONE - RUN))), 2.4)
  const p = REST.clone().lerp(HOVER, up).lerp(VANISH, e)
  p.y += Math.sin(t * 2.1) * 0.12 * up * (1 - e); p.x += Math.sin(t * 1.3) * 0.08 * up * (1 - e)
  const q = Q0.clone().slerp(QYAW, ss(TURN, RUN, t)).slerp(QRUN, ss(RUN, RUN + 2.2, t)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin((t - TURN) / (RUN - TURN) * Math.PI) * 0.22 * (t > TURN && t < RUN ? 1 : 0)))
  const k = Math.max(0.001, 1 - ss(0.4, 1, e)), st = 1 + 3.2 * ss(0.62, 0.95, e)
  return { p, q, s: new THREE.Vector3(k, k, k * st), gone: t >= GONE }
}
// a piece: nothing until it is welded on, then it swells into place
const popOf = n => n * STAGE + WELD_END
const segScale = (n, t) => { const x = (t - popOf(n)) / POP; return t >= GONE ? 0.001 : x <= 0 ? 0.001 : x >= 1 ? 1 : Math.max(0.001, 1 + 0.16 * Math.sin(x * Math.PI) - (1 - x) ** 2) }
const partAt = (local, t, own = 1) => { const A = shipAt(t), o = local.clone().multiply(A.s).applyQuaternion(A.q); return { p: A.p.clone().add(o).toArray(), q: A.q, s: [A.s.x * own, A.s.y * own, A.s.z * own] } }

// ---- the engineer: where they hover for each weld, and the whole round ----
const SPOTS = SEGS.map((sg, n) => {
  const side = n % 2 ? 1 : -1, b = sg.bb
  const local = new THREE.Vector3(side * (Math.max(Math.abs(b.min.x), Math.abs(b.max.x)) + 1.5), Math.max(1.3, sg.c.y + 0.5), sg.c.z + side * 1.2)
  const aim = new THREE.Vector3(side * Math.max(Math.abs(b.min.x), Math.abs(b.max.x)) * 0.8, sg.c.y, sg.c.z)
  return { p: REST.clone().add(local), aim: REST.clone().add(aim) }
})
const SHIPC = REST.clone().add(new THREE.Vector3(0, 3.2, -1))
const COCKPIT = REST.clone().add(SEGS[6].c).setX(REST.x).add(new THREE.Vector3(0, 1.1, 0))
const DOOR = HUT.clone().add(new THREE.Vector3(0, 0.25, -3.6)), READY = SPOTS[0].p.clone().add(new THREE.Vector3(-2.2, 1.4, 2.4))
// [time, place, what they look at]; they glide from each to the next
const ROUND = []
SPOTS.forEach((sp, n) => { ROUND.push([n * STAGE + FLY, sp.p, sp.aim]); ROUND.push([(n + 1) * STAGE, sp.p, sp.aim]) })
ROUND.push([BOARD, COCKPIT.clone().add(new THREE.Vector3(0, 0.9, 0)), COCKPIT], [SEATED, COCKPIT.clone().add(new THREE.Vector3(0, -0.6, 0)), COCKPIT.clone().add(new THREE.Vector3(0, 0, -4))], [SEATED + 1, DOOR, SHIPC], [OUT + 0.6, DOOR, SHIPC], [OUT + 4.4, READY, SHIPC], [LOOP, READY, SHIPC])
ROUND.unshift([0, READY, SHIPC])
function engineerAt(t) {
  let i = 0
  while (i < ROUND.length - 2 && t >= ROUND[i + 1][0]) i++
  const [t0, p0, a0] = ROUND[i], [t1, p1, a1] = ROUND[i + 1], k = ss(t0, t1, t)
  const p = p0.clone().lerp(p1, k), aim = a0.clone().lerp(a1, k)
  p.y += Math.sin(t * 2.6) * 0.07
  const d = aim.clone().sub(p); d.y *= 0.35
  const moving = Math.sin(k * Math.PI) * Math.min(1, p0.distanceTo(p1) / 3)
  const q = lookQuat(d.normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.4 * moving))
  const inside = t >= SEATED && t < OUT, sc = inside ? 0.001 : t >= BOARD && t < SEATED ? Math.max(0.001, 1 - ss(BOARD, SEATED, t)) : t >= OUT && t < OUT + 0.6 ? Math.max(0.001, ss(OUT, OUT + 0.6, t)) : 1
  return { p: p.toArray(), q, s: [sc * K, sc * K, sc * K] }
}
// the figure: 1.9 m of suit, orange at the shoulders and belt, a teal visor, a pack with two tanks
function engineer(body, glow) {
  const K = 1.0
  body.add(box(0.5, 0.62, 0.3), 'white', M(0, 1.2, 0)); body.add(box(0.52, 0.1, 0.32), 'orange', M(0, 0.95, 0))
  body.add(new THREE.SphereGeometry(0.2, 10, 8), 'white', M(0, 1.72, 0)); body.add(box(0.26, 0.16, 0.1), 'teal', M(0, 1.74, -0.17))
  for (const s of [-1, 1]) {
    body.add(box(0.2, 0.18, 0.22), 'orange', M(s * 0.36, 1.45, 0))
    body.add(box(0.15, 0.5, 0.16), 'white', M(s * 0.36, 1.12, -0.12, 0, s > 0 ? -0.9 : -0.25))        // the right arm holds the torch out
    body.add(box(0.18, 0.78, 0.2), 'white', M(s * 0.13, 0.5, 0.04, 0, 0.12)); body.add(box(0.2, 0.12, 0.3), 'dark', M(s * 0.13, 0.07, 0.02))
    body.add(cyl(0.085, 0.085, 0.5, 8), 'steel', M(s * 0.12, 1.24, 0.32))
  }
  body.add(box(0.42, 0.56, 0.2), 'dark', M(0, 1.22, 0.22)); body.add(box(0.1, 0.1, 0.42), 'dark', M(0.36, 1.3, -0.52))
  if (!glow) return
  for (const s of [-1, 1]) glow.add(new THREE.ConeGeometry(0.11, 0.7, 6).rotateX(Math.PI), fx('flame', 0.3 + s * 0.2, 2), M(s * 0.12, 0.62, 0.32))
  glow.add(box(0.05, 0.05, 1.5), fx('weld', 0, 1), M(0.36, 1.3, -1.45))                                 // the torch's beam
  for (let i = 0; i < 7; i++) glow.add(new THREE.OctahedronGeometry(0.07 + (i % 3) * 0.035), fx('weld', i / 7), M(0.36 + ((i * 0.61) % 1 - 0.5) * 0.5, 1.3 + ((i * 0.37) % 1 - 0.5) * 0.5, -2.2 + ((i * 0.83) % 1 - 0.5) * 0.3))
  glow.add(new THREE.OctahedronGeometry(0.2), fx('weld', 0.5, 2), M(0.36, 1.3, -2.2))                     // the white point where it bites
}
// a plain stand-in for the fighter (far views): boxes cut to the blueprint's own cell numbers
function proxyShip(bag, m) {
  const cs = 0.5 * K, cell = (x0, x1, y0, y1, z0, z1, col) => bag.add(box((x1 - x0 + 1) * cs, (y1 - y0 + 1) * cs, (z1 - z0 + 1) * cs), col, m.clone().multiply(new THREE.Matrix4().makeTranslation((x0 + x1) / 2 * cs + OFF.x, (y0 + y1) / 2 * cs + OFF.y, (z0 + z1) / 2 * cs + OFF.z)))
  cell(-1, 1, -1, 3, -6, 9, 'p3_0'); cell(-1, 1, 0, 1, -15, -7, 'p3_0'); cell(-1, 1, 0, 0, -21, -16, 'p3_1'); cell(-1, 1, 3, 5, -4, 0, 'glass')
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? 2 : -3
    cell(x0, x0 + 1, 3, 4, 1, 11, 'p1_0'); cell(x0, x0 + 1, -2, -1, 1, 11, 'p1_0'); cell(x0, x0 + 1, -5, -3, 1, 2, 'dark'); cell(x0, x0 + 1, -5, -3, 8, 9, 'dark')
    for (const [y0, y1] of [[4, 6], [-4, -2]]) { cell(s > 0 ? 4 : -13, s > 0 ? 13 : -4, y0, y1 - 1, 3, 8, 'p3_0'); cell(s > 0 ? 8 : -9, s > 0 ? 9 : -8, y0, y1 - 1, 3, 8, 'p5_0'); cell(s * 14, s * 14, y1 - 1, y1 - 1, -7, 9, 'dark') }
  }
}

function build(lod) {
  const hi = lod === 0
  const map = new Bag(), glow = new Bag(), air = new Bag(), sign = new Bag(), parts = {}
  // ---- the ground: a slab of Halvor, flat under the yard, hills at the edges ----
  {
    const nx = hi ? 32 : 12, nz = hi ? 44 : 16, g = new THREE.PlaneGeometry(HX * 2 - 0.5, HZ * 2 - 0.5, nx, nz).rotateX(-Math.PI / 2)
    const p = g.attributes.position, uv = g.attributes.uv, R = RECT.ground
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, ground(x, z)); uv.setXY(i, (R[0] + 4 + (x / (HX * 2) + 0.5) * (R[2] - 8)) / AT, (R[1] + 4 + (z / (HZ * 2) + 0.5) * (R[3] - 8)) / AT) }
    map.add(g, null)
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
    for (const sz of [-1, 1]) { glow.add(box(px * 2 - 1, 0.1, 0.1), fx('lamp', 0, 1), M(0, top - 0.5, sz * (pz - 0.28))); glow.add(box(HX * 2 - 0.6, 0.1, 0.08), fx('run', 0.2, 1), M(0, 0.7, sz * (HZ - 0.27))) }
    for (const sx of [-1, 1]) { glow.add(box(0.1, 0.1, pz * 2 - 1), fx('lamp', 0, 1), M(sx * (px - 0.28), top - 0.5, 0)); glow.add(box(0.08, 0.1, HZ * 2 - 0.6), fx('run', 0.7, 1), M(sx * (HX - 0.27), 0.7, 0)) }
    const bw = 12.8, bh = 3.2, by = top - 0.5 - bh / 2
    const banner = m => { const g = new THREE.PlaneGeometry(bw, bh); { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)) } sign.add(g, null, m); sign.add(g, null, m.clone().multiply(new THREE.Matrix4().makeRotationY(Math.PI))) }
    banner(M(0, by, pz - 0.3, 0)); banner(M(0, by, -pz + 0.3, Math.PI)); banner(M(px - 0.3, by, 0, Math.PI / 2)); banner(M(-px + 0.3, by, 0, -Math.PI / 2))
    for (const [x, z, ry] of [[0, pz - 0.3, 0], [0, -pz + 0.3, 0], [px - 0.3, 0, Math.PI / 2], [-px + 0.3, 0, Math.PI / 2]]) { map.add(box(bw + 0.5, 0.2, 0.25), 'frame2', M(x, by - bh / 2 - 0.12, z, ry)); glow.add(box(bw, 0.06, 0.3), fx('lamp', 0, 1), M(x, by - bh / 2 - 0.26, z, ry)) }
  }
  // ---- Halvor in the sky, with its rim of air and its moon: where the ship is bound ----
  map.add(globe(SKYR, RECT.halvor, hi ? 40 : 14), null, M(SKY.x, SKY.y, SKY.z, 0.7, 0.2, 0.25))
  map.add(globe(0.6, RECT.ket, hi ? 14 : 8), null, M(SKY.x + 4.6, SKY.y + 2.4, SKY.z + 1.2))
  if (hi) air.add(new THREE.SphereGeometry(SKYR * 1.07, 32, 16), [0, 1], M(SKY.x, SKY.y, SKY.z))
  // ---- the pad: a dark deck with a striped edge, a painted ring, lights at its corners ----
  {
    map.add(box(PADW * 2, 0.3, PADL * 2), 'pad', M(PADC.x, PADC.y - 0.15, PADC.z))
    for (const s of [-1, 1]) { map.add(box(PADW * 2, 0.31, 0.5), 'hazard', M(PADC.x, PADC.y - 0.15, PADC.z + s * (PADL - 0.25))); map.add(box(0.5, 0.31, PADL * 2), 'hazard', M(PADC.x + s * (PADW - 0.25), PADC.y - 0.15, PADC.z)) }
    if (hi) {
      map.add(new THREE.RingGeometry(8.3, 8.7, 44).rotateX(-Math.PI / 2), 'padLine', M(PADC.x, PADC.y + 0.02, PADC.z))
      for (const [w, d] of [[0.3, 5], [5, 0.3]]) map.add(box(w, 0.02, d), 'padLine', M(PADC.x, PADC.y + 0.02, PADC.z))
      for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; glow.add(box(0.22, 0.12, 0.22), fx('blink', i / 14), M(PADC.x + Math.cos(a) * 9.4, PADC.y + 0.07, PADC.z + Math.sin(a) * 9.4)) }
      // a ramp up to it from the workshop side
      map.add(box(2.2, 0.3, 3), 'frame2', M(-7, PADC.y - 0.3, PADC.z + PADL + 0.9, 0, -0.12))
    }
  }
  // ---- the workshop the engineer comes out of, the racks of parts, tanks, floodlights ----
  {
    const h = HUT
    map.add(box(5.2, 3.2, 5.6), 'white', M(h.x, h.y + 1.6, h.z)); map.add(box(5.3, 0.5, 5.7), 'teal', M(h.x, h.y + 2.6, h.z)); map.add(box(5.7, 0.35, 6.1), 'frame', M(h.x, h.y + 3.35, h.z))
    map.add(box(1.5, 2.4, 0.12), 'dark', M(h.x, h.y + 1.2, h.z - 2.81))
    if (hi) {
      map.add(box(0.1, 0.9, 2.4), 'glass', M(h.x + 2.62, h.y + 1.9, h.z)); map.add(box(1.0, 0.9, 0.1), 'glass', M(h.x + 1.7, h.y + 1.9, h.z - 2.82))
      map.add(cyl(0.9, 0.2, 0.7, 12), 'white', M(h.x - 1.2, h.y + 4.1, h.z - 1.4)); map.add(box(0.12, 2.4, 0.12), 'steel', M(h.x + 1.6, h.y + 4.6, h.z + 1.8))
      glow.add(new THREE.OctahedronGeometry(0.14), fx('blink', 0.3), M(h.x + 1.6, h.y + 5.9, h.z + 1.8)); glow.add(box(1.5, 0.1, 0.1), fx('lamp', 0, 1), M(h.x, h.y + 2.55, h.z - 2.86))
      // racks of hull blocks in the ship's colours, waiting to be used
      const r = rnd(11)
      for (const [rx, rz] of [[13.6, 16.5], [13.4, 19.6], [-13.4, 8.4]]) {
        map.add(box(2.6, 0.2, 2.1), 'frame2', M(rx, 0.86, rz))
        for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) { const n = Math.floor(r() * 4); for (let j = 0; j < n; j++) map.add(box(0.5, 0.5, 0.5), ['p3_0', 'p3_1', 'p5_0', 'p1_0', 'p2_0'][Math.floor(r() * 5)], M(rx - 0.95 + i * 0.62, 1.21 + j * 0.5, rz - 0.62 + k * 0.62)) }
      }
      // a fuel tank and its hose, a tool cart
      map.add(cyl(1.1, 1.1, 3.4, 14), 'white', M(13.7, 2.5, -6.5)); map.add(cyl(1.13, 1.13, 0.5, 14), 'orange', M(13.7, 2.6, -6.5)); map.add(box(2.6, 0.2, 2.6), 'frame2', M(13.7, 0.86, -6.5))
      map.add(box(0.16, 0.16, 2.6), 'dark', M(12.1, 0.95, -6.5, Math.PI / 2)); map.add(box(1.2, 0.8, 0.7), 'orange', M(-13.2, 1.2, -4.5, 0.4)); map.add(box(1.3, 0.08, 0.8), 'steel', M(-13.2, 1.64, -4.5, 0.4))
    }
    // four floodlight masts leaning over the pad
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx * (PADW + 1.4), z = PADC.z + sz * (PADL - 2.5)
      map.add(box(0.22, 8, 0.22), 'frame', M(x, 4.8, z)); map.add(box(1.5, 0.2, 0.2), 'frame', M(x - sx * 0.65, 8.7, z)); map.add(box(0.7, 0.35, 0.5), 'steel', M(x - sx * 1.4, 8.55, z))
      glow.add(box(0.6, 0.08, 0.4), fx('lamp'), M(x - sx * 1.4, 8.34, z))
    }
  }
  // ---- trees round the edges ----
  {
    const r = rnd(3), nt = hi ? 60 : 16
    for (let i = 0; i < nt; i++) {
      const x = (r() - 0.5) * (HX * 2 - 3), z = (r() - 0.5) * (HZ * 2 - 3)
      if (Math.abs(x - PADC.x) < PADW + 3.2 && Math.abs(z - PADC.z) < PADL + 2.5) continue
      if (Math.hypot(x - HUT.x, z - HUT.z) < 5.4 || Math.hypot(x - 13.5, z - 18) < 3.6 || Math.hypot(x - 13.7, z + 6.5) < 3 || Math.hypot(x + 13.3, z - 2) < 7.5) continue
      const y = ground(x, z), s = 0.8 + r() * 0.9
      map.add(cyl(0.06 * s, 0.1 * s, 0.7 * s, 5), 'trunk', M(x, y + 0.35 * s, z))
      map.add(new THREE.ConeGeometry(0.55 * s, 1.3 * s, 6), r() < 0.5 ? 'tree1' : 'tree2', M(x, y + 1.2 * s, z))
      if (hi) map.add(new THREE.ConeGeometry(0.4 * s, 1.0 * s, 6), 'tree2', M(x, y + 1.9 * s, z))
    }
  }
  if (!hi) {
    // far views: the finished fighter stands on the pad
    proxyShip(map, new THREE.Matrix4().makeTranslation(REST.x, REST.y, REST.z))
    return { map, glow, air, sign, parts }
  }
  // ---- the fighter's seven pieces, each its own part ----
  SEGS.forEach((sg, n) => {
    const b = new Bag(); b.raw(sg.geo)
    parts['piece' + n] = { bags: { Map: b }, anim: t => partAt(sg.c, t, segScale(n, t)) }
  })
  // ---- its engines' fire: the four barrels astern, the lift jets below ----
  {
    const g = new Bag()
    for (const f of FULL.flames) {
      const main = f.d[2] > 0.5, lift = f.d[1] < -0.5
      if (!main && !lift) continue
      const r = f.r * (main ? 1.5 : 1.1), len = main ? 3.4 : 1.5, q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...f.d))
      g.add(new THREE.ConeGeometry(r, len, 7), fx('flame', (f.p[0] * 7.3 + f.p[2] * 3.1 + 10) % 1, main ? 0 : 1), new THREE.Matrix4().compose(new THREE.Vector3(f.p[0] + f.d[0] * len / 2 + OFF.x, f.p[1] + f.d[1] * len / 2 + OFF.y, f.p[2] + f.d[2] * len / 2 + OFF.z), q, new THREE.Vector3(1, 1, 1)))
    }
    parts.fire = { bags: { Glow: g }, anim: t => partAt(new THREE.Vector3(), t) }
  }
  // ---- the blueprint of light: each piece shows until the real one takes its place ----
  SEGS.forEach((sg, n) => { const g = sg.geo.clone(), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, popOf(n) / LOOP, 0.25); g.applyMatrix4(new THREE.Matrix4().makeTranslation(REST.x + sg.c.x, REST.y + sg.c.y, REST.z + sg.c.z)); air.raw(g) })
  // ---- the flash where it jumps ----
  for (const [sx, sy, sz] of [[5, 0.12, 0.12], [0.12, 5, 0.12], [0.12, 0.12, 5]]) glow.add(box(sx, sy, sz), fx('flash'), M(VANISH.x, VANISH.y, VANISH.z, 0.5, 0.3))
  glow.add(new THREE.IcosahedronGeometry(0.9, 1), fx('flash'), M(VANISH.x, VANISH.y, VANISH.z))
  // ---- the engineer ----
  { const b = new Bag(), g = new Bag(); engineer(b, g); parts.engineer = { bags: { Map: b, Glow: g }, anim: engineerAt } }
  return { map, glow, air, sign, parts }
}

// ---- the lights and the blueprint, written with the same clock as the animation ----
const f1 = v => v.toFixed(2)
const GLOW_GLSL = `// The yard's lights. Each piece's uv says what it is: uv.x = type + phase, uv.y = its kind.
// 0 fire (kind 0: the fighter's engines, lit from ignition until it has gone; 1: its lift jets, until it runs;
// 2: the engineer's jetpack, always), 1 running lights up the frame (kind 1: amber), 2 a blinking beacon,
// 3 the flash where the fighter jumps, 4 the welding torch (kind 0 sparks, 1 the beam, 2 the white point), lit
// only while a piece is being welded, 5 a steady lamp (kind 1: a teal strip). Time is the world clock, in step
// with the 60 s animation.
void p0Surface(inout P0Surface s) {
  float type = floor(s.uv.x + 0.001);
  float ph = fract(s.uv.x);
  float kind = s.uv.y;
  float T = p0Time;
  float L = mod(T, ${f1(LOOP)});
  vec3 col = vec3(0.2, 0.9, 0.85);
  float on = 1.0;
  if (type < 0.5) {
    float fl = 0.72 + 0.28 * sin(T * 31.0 + ph * 40.0);
    if (kind < 0.5) { on = step(${f1(IGNITE)}, L) * step(L, ${f1(GONE + 0.3)}); col = mix(vec3(1.0, 0.5, 0.25), vec3(1.0, 0.85, 0.75), smoothstep(${f1(RUN)}, ${f1(GONE)}, L)) * (1.6 + 2.2 * smoothstep(${f1(IGNITE)}, ${f1(RUN + 1.5)}, L)); }
    else if (kind < 1.5) { on = step(${f1(IGNITE + 0.3)}, L) * step(L, ${f1(RUN + 1.2)}); col = vec3(1.0, 0.75, 0.45) * 2.0; }
    else col = vec3(0.45, 0.8, 1.0) * 2.2;
    col *= fl;
  } else if (type < 1.5) {
    float band = pow(0.5 + 0.5 * sin(s.position.y * 1.1 - T * 2.6 + ph * 6.283), 8.0);
    col = mix(vec3(0.1, 0.9, 0.85), vec3(1.0, 0.45, 0.1), kind) * (0.3 + band * 2.6);
  } else if (type < 2.5) {
    on = step(0.6, fract(T * 0.8 + ph));
    col = vec3(1.0, 0.4, 0.15) * 2.6;
  } else if (type < 3.5) {
    float f = exp(-abs(L - ${f1(GONE)}) * 5.0);
    on = step(0.05, f);
    col = vec3(0.7, 0.95, 1.0) * f * 5.0;
  } else if (type < 4.5) {
    float st = mod(L, ${f1(STAGE)});
    on = step(L, ${f1(BUILT)}) * step(${f1(FLY)}, st) * step(st, ${f1(WELD_END)});
    if (kind < 0.5) on *= step(0.45, fract(sin(floor(T * 16.0) + ph * 91.0) * 437.5));
    col = kind < 0.5 ? vec3(1.0, 0.75, 0.35) * 3.2 : kind < 1.5 ? vec3(0.5, 0.85, 1.0) * (1.6 + 0.8 * sin(T * 40.0)) : vec3(1.0, 0.97, 0.9) * (3.0 + 1.5 * sin(T * 53.0));
  } else {
    col = kind > 0.5 ? vec3(0.2, 0.9, 0.85) * (1.2 + 0.5 * sin(T * 2.0 + s.position.x + s.position.z)) : vec3(1.0, 0.95, 0.85) * 1.8;
  }
  if (on < 0.5) discard;
  s.color = vec3(0.02);
  s.emissive = col * (1.0 + p0Near * 0.2);
}
`
const AIR_GLSL = `// Two things made of light. uv.y above 0.75: the air round Halvor in the sky, clear face-on and blue at the
// rim. Otherwise the blueprint on the pad: a piece of the fighter drawn in teal lines of light, shown from
// the moment the engineer comes out (${f1(HOLO)} s into the 60 s loop) until the real piece is welded in its
// place (uv.x holds that moment as a fraction of the loop).
void p0Surface(inout P0Surface s) {
  if (s.uv.y > 0.75) {
    float rim = pow(1.0 - max(dot(s.normal, s.view), 0.0), 2.2);
    float day = 0.4 + 0.6 * smoothstep(-0.3, 0.5, dot(s.normal, normalize(vec3(0.5, 0.55, 0.65))));
    s.color = vec3(0.25, 0.5, 1.0);
    s.emissive = vec3(0.3, 0.62, 1.0) * rim * day * 1.7;
    s.alpha = clamp(rim * 1.3, 0.0, 0.85) * day;
    return;
  }
  float L = mod(p0Time, ${f1(LOOP)});
  float until = s.uv.x * ${f1(LOOP)};
  float show = max(step(L, until), smoothstep(${f1(HOLO)}, ${f1(HOLO + 1.5)}, L));
  if (show < 0.02) discard;
  float rim = pow(1.0 - max(dot(s.normal, s.view), 0.0), 1.6);
  float lines = 0.55 + 0.45 * step(0.5, fract(s.position.y * 5.0 - p0Time * 0.6));
  float next = (1.0 - smoothstep(0.0, ${f1(STAGE)}, until - L)) * step(L, until);   // the piece being worked on glows brighter
  s.color = vec3(0.05, 0.3, 0.3);
  s.emissive = vec3(0.15, 0.95, 0.88) * (0.35 + rim * 1.3) * lines * (1.0 + next * 1.6) * show;
  s.alpha = clamp((0.16 + rim * 0.5) * lines * (1.0 + next) * show, 0.0, 0.8);
}
`
const SIGN_GLSL = `// The four banners: the letters light up from the texture, a gleam sweeps across them.
void p0Surface(inout P0Surface s) {
  vec3 t = s.color;
  float lum = max(t.r, max(t.g, t.b));
  float letters = smoothstep(0.2, 0.55, lum);
  float scan = pow(0.5 + 0.5 * sin(s.uv.x * 9.42 - p0Time * 1.4), 14.0);
  s.color = t * 0.45;
  s.emissive = t * letters * (1.1 + scan * 1.6 + p0Near * 0.4) + vec3(0.0, 0.03, 0.03) * scan;
}
`
writeFileSync(`${outDir}/glow.glsl`, GLOW_GLSL); writeFileSync(`${outDir}/air.glsl`, AIR_GLSL); writeFileSync(`${outDir}/sign.glsl`, SIGN_GLSL)
writeFileSync(`${outDir}/lot.json`, JSON.stringify({ materials: { Glow: { surface: 'glow.glsl', glow: 1.7 }, Air: { surface: 'air.glsl', transparent: true, glow: 0.8 }, Sign: { surface: 'sign.glsl', doubleSided: true, glow: 1.1 }, Map: { glow: 0 } } }, null, 2) + '\n')

const t0 = Date.now()
const atl = await atlas(), signTex = await signPng()
const map1024 = await atl.clone().jpeg({ quality: 90 }).toBuffer(), map512 = await atl.clone().resize(512, 512).jpeg({ quality: 88 }).toBuffer(), map256 = await atl.clone().resize(256, 256, { kernel: 'nearest' }).jpeg({ quality: 90 }).toBuffer()
writeFileSync(`${outDir}/atlas.png`, await atl.clone().png().toBuffer()); writeFileSync(`${outDir}/sign.png`, signTex)
console.error('textures', Date.now() - t0, 'ms')
const MAP = { map: map1024, mapName: 'atlas', metal: 0.05, rough: 0.85 }
const GLOW = { color: [0.03, 0.04, 0.05, 1], emissive: [0.2, 0.9, 0.85], rough: 0.5 }
const AIR = { color: [0.2, 0.8, 0.8, 0.25], emissive: [0.1, 0.45, 0.42], rough: 1, blend: true }
const SIGN = { map: signTex, emissiveMap: signTex, mapName: 'sign', emissive: [0.9, 0.9, 0.9], rough: 0.5 }
const L0 = build(0)
const b0 = { materials: { Map: MAP, Glow: GLOW, Air: AIR, Sign: SIGN }, static: { yard: { Map: L0.map, Glow: L0.glow }, air: { Air: L0.air }, sign: { Sign: L0.sign } }, parts: L0.parts }
const bb = bounds(b0)
const r0 = await writeGlb('lod0.glb', b0)
const L1 = build(1)
const sign512 = await sharp(signTex).resize(512, 128).png().toBuffer()
const r1 = await writeGlb('lod1.glb', { materials: { Map: { ...MAP, map: map512, mapName: 'atlas512' }, Sign: { ...SIGN, map: sign512, emissiveMap: sign512, mapName: 'sign512' } }, static: { yard: { Map: L1.map }, sign: { Sign: L1.sign } } })
// LOD2: one mesh: the slab, the frame, blocks where the banners are, the pad, the fighter, the world in the sky
const far = new Bag()
far.add(box(HX * 2 - 0.5, 0.8, HZ * 2 - 0.5).translate(0, 0.4, 0), 'tree2')
for (const sx of [-1, 1]) for (const sz of [-1, 1]) far.add(box(0.6, HY - 0.5, 0.6).translate(0, (HY - 0.5) / 2, 0), 'frame', M(sx * (HX - 0.75), 0, sz * (HZ - 0.75)))
for (const sz of [-1, 1]) { far.add(box(HX * 2 - 1, 0.5, 0.5), 'frame', M(0, HY - 0.7, sz * (HZ - 0.75))); far.add(box(12.8, 3.2, 0.3), 'teal', M(0, HY - 2.6, sz * (HZ - 1.05))) }
for (const sx of [-1, 1]) { far.add(box(0.5, 0.5, HZ * 2 - 1), 'frame', M(sx * (HX - 0.75), HY - 0.7, 0)); far.add(box(0.3, 3.2, 12.8), 'teal', M(sx * (HX - 1.05), HY - 2.6, 0)) }
far.add(box(PADW * 2, 0.3, PADL * 2), 'pad', M(PADC.x, PADC.y - 0.15, PADC.z))
proxyShip(far, new THREE.Matrix4().makeTranslation(REST.x, REST.y, REST.z))
far.add(globe(SKYR, RECT.halvor, 12), null, M(SKY.x, SKY.y, SKY.z, 0.7))
far.add(box(5.2, 3.4, 5.6), 'white', M(HUT.x, HUT.y + 1.7, HUT.z))
const r2 = await writeGlb('lod2.glb', { materials: { Map: { ...MAP, map: map256, mapName: 'atlas256' } }, static: { far: { Map: far } } })
console.log(JSON.stringify({ lod0: r0, lod1: r1, lod2: r2, bounds: { min: bb.box3.min.toArray().map(v => +v.toFixed(2)), max: bb.box3.max.toArray().map(v => +v.toFixed(2)) }, parts: bb.worst }))
