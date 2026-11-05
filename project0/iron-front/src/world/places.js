// Where every building, street and prop on Varden goes. Run once at start (deterministic): fills
// BUILDINGS with records the streamer turns into meshes and colliders, adds city streets and the
// airfield's runway to the road network, and levels a pad under each building.
import { rng } from '../core/noise.js'
import { PLACES, place, HALF } from './blueprint.js'
import { heightAt, waterLevel, roadAt, addRoad, addPad, roadLines, normalAt, forestAt, fieldAt } from './heightfield.js'

export const BUILDINGS = []          // { type, x, y, z, yaw, w, d, floors, h, seed, style, place, ... }
export const PROPS = []              // { kind, x, y, z, yaw, ... } small things: barrels, sandbags, wrecks, lamps
export const POINTS = []             // { kind: 'spawn' | 'loot' | 'stash' | 'secret' | 'heli' | 'vehicle', x, y, z, place, ... }
const occ = new Map()                // footprint grid (8 m) to keep buildings apart
const OCC = 8

function occKey(ix, iz) { return ix * 100003 + iz }
function footprintFree(x, z, w, d, yaw, pad = 1.5) {
  const r = Math.hypot(w, d) / 2 + pad
  for (let ix = Math.floor((x - r) / OCC); ix <= Math.floor((x + r) / OCC); ix++)
    for (let iz = Math.floor((z - r) / OCC); iz <= Math.floor((z + r) / OCC); iz++) {
      const a = occ.get(occKey(ix, iz)); if (!a) continue
      for (const o of a) if (Math.hypot(o.x - x, o.z - z) < o.r + r - pad * 0.5) return false
    }
  return true
}
// Is (x, z) on or within `pad` metres of a building's footprint (trees keep clear of them).
export function isBuilt(x, z, pad = 2) {
  const a = occ.get(occKey(Math.floor(x / OCC), Math.floor(z / OCC)))
  if (!a) return false
  for (const o of a) if (Math.hypot(o.x - x, o.z - z) < o.r + pad) return true
  return false
}
function occupy(x, z, w, d) {
  const r = Math.hypot(w, d) / 2
  const o = { x, z, r }
  for (let ix = Math.floor((x - r) / OCC); ix <= Math.floor((x + r) / OCC); ix++)
    for (let iz = Math.floor((z - r) / OCC); iz <= Math.floor((z + r) / OCC); iz++) {
      const k = occKey(ix, iz); let a = occ.get(k); if (!a) occ.set(k, a = []); a.push(o)
    }
}
// Is the ground there fit to build on: dry, not too steep, clear of roads (unless allowed) and other buildings.
function canBuild(x, z, w, d, yaw, o = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw), hw = w / 2, hd = d / 2
  let lo = Infinity, hi = -Infinity
  for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [0, 0], [0, hd], [0, -hd], [hw, 0], [-hw, 0]]) {
    const px = x + lx * c + lz * s, pz = z - lx * s + lz * c
    const h = heightAt(px, pz)
    if (waterLevel(px, pz) > h - 0.5) return false
    if (h < 1.5) return false
    lo = Math.min(lo, h); hi = Math.max(hi, h)
    if (!o.onRoad) { const r = roadAt(px, pz); if (r && r.d < r.w / 2 + 2) return false }
  }
  if (hi - lo > (o.slope ?? 3.5)) return false
  return footprintFree(x, z, w, d, yaw, o.pad ?? 1.5)
}
let seedN = 1
function addBuilding(b, o = {}) {
  if (!o.force && !canBuild(b.x, b.z, b.w, b.d, b.yaw, o)) return null
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), hw = b.w / 2, hd = b.d / 2
  let sum = 0, n = 0
  for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [0, 0]]) { sum += heightAt(b.x + lx * c + lz * s, b.z - lx * s + lz * c); n++ }
  b.y = o.y ?? sum / n
  b.seed = b.seed ?? (seedN++ * 7919)
  addPad(b.x, b.z, hw + 1.5, hd + 1.5, b.yaw, b.y)
  occupy(b.x, b.z, b.w, b.d)
  BUILDINGS.push(b)
  return b
}
const prop = (kind, x, z, yaw = 0, extra = {}) => { const p = { kind, x, y: heightAt(x, z), z, yaw, ...extra }; PROPS.push(p); return p }
const point = (kind, x, z, extra = {}) => POINTS.push({ kind, x, y: heightAt(x, z), z, ...extra })

// ---------- Port Anselm: a modern grid, towers downtown, the harbour on the bay ----------
function anselm() {
  const P = place('anselm'), r = rng(101), A = 0.35, ca = Math.cos(A), sa = Math.sin(A)
  const BLOCK = 86, STREET = 14
  const toW = (u, v) => [P.x + u * ca + v * sa, P.z - u * sa + v * ca]
  const n = Math.ceil(P.r / BLOCK)
  const groundY = heightAt(P.x, P.z)
  // streets along the grid lines, clipped to the city and the land
  for (let i = -n; i <= n; i++) for (const dir of [0, 1]) {
    const pts = []
    for (let t = -n * BLOCK; t <= n * BLOCK; t += 24) {
      const [x, z] = dir ? toW(i * BLOCK, t) : toW(t, i * BLOCK)
      const inside = Math.hypot(x - P.x, z - P.z) < P.r - 40 && waterLevel(x, z) < heightAt(x, z) - 0.3
      if (inside) pts.push([x, z]); else if (pts.length) break
    }
    if (pts.length > 4) addRoad(`anselm-st-${dir}-${i}`, 'street', pts, 8, groundY)
  }
  // blocks: four lots each; what goes up depends on the distance from downtown and from the sea
  const bay = place('anselm')
  for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) {
    const cu = (i + 0.5) * BLOCK, cv = (j + 0.5) * BLOCK
    const [bx, bz] = toW(cu, cv)
    const dc = Math.hypot(bx - P.x, bz - P.z)
    if (dc > P.r - 170) continue
    const seaNear = [[90, 0], [-90, 0], [0, 90], [0, -90], [200, 0], [0, 200], [-200, 0], [0, -200], [140, 140], [-140, 140], [140, -140], [-140, -140]].some(([du, dv]) => { const [x, z] = toW(cu + du, cv + dv); return waterLevel(x, z) > heightAt(x, z) })
    const zone = seaNear ? 'harbour' : dc < 230 ? 'downtown' : dc < 500 ? 'mid' : 'outer'
    const half = (BLOCK - STREET) / 4
    for (const [qu, qv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const lu = cu + qu * half, lv = cv + qv * half
      const [x, z] = toW(lu, lv)
      // face the nearer street
      const yaw = A + (qv > 0 ? 0 : Math.PI)
      const rr = r()
      let b
      if (zone === 'downtown') b = rr < 0.55 ? { type: 'tower', w: 20 + Math.floor(r() * 6), d: 18 + Math.floor(r() * 4), floors: 8 + Math.floor(r() * 7) }
        : rr < 0.8 ? { type: 'apartment', w: 24, d: 14, floors: 5 + Math.floor(r() * 3), style: 'modern', shop: true }
        : rr < 0.9 ? { type: 'parking', w: 28, d: 30, floors: 3 } : null
      else if (zone === 'mid') b = rr < 0.6 ? { type: 'apartment', w: 18 + Math.floor(r() * 8), d: 12 + Math.floor(r() * 3), floors: 3 + Math.floor(r() * 4), style: 'modern', shop: r() < 0.4 }
        : rr < 0.85 ? { type: 'shop', w: 14, d: 11, floors: 2, style: 'modern' } : { type: 'warehouse', w: 26, d: 18, h: 7 }
      else if (zone === 'harbour') b = rr < 0.45 ? { type: 'warehouse', w: 30, d: 22, h: 9 } : rr < 0.75 ? { type: 'containers', w: 10, d: 22, n: 9 } : { type: 'apartment', w: 16, d: 12, floors: 3, style: 'modern' }
      else b = rr < 0.55 ? { type: 'house', w: 9 + Math.floor(r() * 3), d: 8 + Math.floor(r() * 3), floors: 1 + Math.floor(r() * 2), style: 'town' } : rr < 0.8 ? { type: 'apartment', w: 16, d: 12, floors: 3, style: 'modern' } : null
      if (!b) { if (zone === 'downtown') { prop('plaza', x, z, A); point('spawn', x, z, { place: 'anselm' }) } continue }
      addBuilding({ ...b, x, z, yaw, style: b.style || 'modern', place: 'anselm' }, { pad: 1 })
    }
  }
  // the police station, a landmark downtown
  const [px, pz] = toW(BLOCK * 1.5 + 2, -BLOCK * 0.5)
  addBuilding({ type: 'apartment', x: px, z: pz, yaw: A, w: 22, d: 14, floors: 3, style: 'modern', police: true, place: 'anselm' }, { pad: 0.5 })
  // the harbour: walk out from the city towards the bay until the water starts; a pier runs out from
  // there with a crane at its root, and a berth for a boat beside it
  for (let k = 0; k < 5; k++) {
    const a = 1.95 + k * 0.2, dx = Math.cos(a), dz = Math.sin(a)
    let d = 300
    while (d < 1600 && waterLevel(P.x + dx * d, P.z + dz * d) < heightAt(P.x + dx * d, P.z + dz * d) - 0.2) d += 10
    if (d >= 1600) continue
    const sx = P.x + dx * (d - 12), sz = P.z + dz * (d - 12)
    const yaw = Math.atan2(dx, dz), len = 80
    addBuilding({ type: 'pier', x: sx + dx * len / 2, z: sz + dz * len / 2, yaw, w: 14, d: len, place: 'anselm' }, { force: true, y: 1.8 })
    addBuilding({ type: 'crane', x: sx - dx * 14, z: sz - dz * 14, yaw, w: 10, d: 8, place: 'anselm' }, { force: true })
    if (k % 2 === 0) addBuilding({ type: 'containers', x: sx - dx * 40 + dz * 20, z: sz - dz * 40 - dx * 20, yaw, w: 10, d: 22, n: 9, place: 'anselm' })
    if (k % 2 === 1) addBuilding({ type: 'warehouse', x: sx - dx * 45, z: sz - dz * 45, yaw, w: 30, d: 20, h: 9, place: 'anselm' })
    point('boat', sx + dx * len * 0.7 + dz * 12, sz + dz * len * 0.7 - dx * 12, { yaw, place: 'anselm' })
  }
  for (const [x, z] of [[-3500, 2900], [-3200, 3200]]) point('spawn', x, z, { place: 'anselm' })
}

// ---------- Kaldor: an old city of radial streets round a church square ----------
function kaldor() {
  const P = place('kaldor'), r = rng(202), y0 = heightAt(P.x, P.z)
  const N = 8
  addBuilding({ type: 'church', x: P.x, z: P.z - 52, yaw: 0, w: 12, d: 24, place: 'kaldor' }, { force: true })
  prop('monument', P.x, P.z, 0)
  point('spawn', P.x + 20, P.z + 20, { place: 'kaldor' })
  // streets: spokes from the square and three rings
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2 + 0.2
    const pts = []
    for (let d = 40; d < P.r - 30; d += 30) { const wob = Math.sin(d * 0.013 + i) * 18; pts.push([P.x + Math.cos(a) * d - Math.sin(a) * wob, P.z + Math.sin(a) * d + Math.cos(a) * wob]) }
    addRoad(`kaldor-spoke-${i}`, 'street', pts, 8)
  }
  for (const R of [170, 340, 520]) {
    const pts = []
    for (let k = 0; k <= 48; k++) { const a = k / 48 * Math.PI * 2; pts.push([P.x + Math.cos(a) * R, P.z + Math.sin(a) * R]) }
    addRoad(`kaldor-ring-${R}`, 'street', pts, 8)
  }
  // terraced houses along every street: both sides, facing it
  const mine = roadLines.filter(l => l.id.startsWith('kaldor'))
  for (const l of mine) {
    for (let i = 2; i < l.pts.length - 2; i += 2) {
      const [x, z] = l.pts[i], [nx, nz] = l.pts[i + 1]
      const dx = nx - x, dz = nz - z, len = Math.hypot(dx, dz) || 1
      const ux = dx / len, uz = dz / len
      for (const side of [-1, 1]) {
        const d = Math.hypot(x - P.x, z - P.z)
        const fl = d < 220 ? 3 + Math.floor(r() * 2) : d < 420 ? 2 + Math.floor(r() * 2) : 1 + Math.floor(r() * 2)
        const w = 10 + Math.floor(r() * 4), dd = 10 + Math.floor(r() * 3)
        const off = l.w / 2 + dd / 2 + 2.5
        const bx = x + uz * off * side, bz = z - ux * off * side
        const yaw = Math.atan2(-uz * side, ux * side) + Math.PI / 2
        const type = d < 260 && r() < 0.35 ? 'shop' : fl >= 3 ? 'apartment' : 'house'
        addBuilding({ type, x: bx, z: bz, yaw: Math.atan2(-(uz * side), -(-ux * side)), w, d: dd, floors: fl, style: 'old', place: 'kaldor', shop: type === 'shop' }, { pad: 0.8 })
      }
    }
  }
  // the train yard to the west: tracks, wagons, a station and sheds
  const ty = [P.x - 600, P.z + 60]
  for (let t = -2; t <= 2; t++) prop('rail', ty[0], ty[1] + t * 5, 0, { len: 260 })
  for (let i = 0; i < 9; i++) prop('wagon', ty[0] - 100 + i * 24 + (i % 2) * 6, ty[1] + ((i % 5) - 2) * 5, 0, { color: i % 3 })
  addBuilding({ type: 'warehouse', x: ty[0] + 20, z: ty[1] - 34, yaw: 0, w: 60, d: 20, h: 9, place: 'kaldor' }, { onRoad: true })
  addBuilding({ type: 'apartment', x: ty[0] - 60, z: ty[1] + 30, yaw: Math.PI, w: 26, d: 11, floors: 2, style: 'old', place: 'kaldor' }, { onRoad: true })
  point('spawn', ty[0], ty[1] - 15, { place: 'kaldor' })
  // the communications station to the north: masts, a bunker, a fence
  const cs = [P.x + 60, P.z - 600]
  for (const [dx, dz, h] of [[-25, 0, 38], [25, 10, 30], [0, -30, 24]]) addBuilding({ type: 'mast', x: cs[0] + dx, z: cs[1] + dz, yaw: 0, w: 3, d: 3, h, place: 'kaldor' }, { slope: 8 })
  addBuilding({ type: 'bunker', x: cs[0], z: cs[1] + 25, yaw: 0, w: 9, d: 6, place: 'kaldor' }, { slope: 8 })
  addBuilding({ type: 'barracks', x: cs[0] - 35, z: cs[1] + 30, yaw: Math.PI / 2, w: 24, d: 9, floors: 1, place: 'kaldor' }, { slope: 8 })
  fence(cs[0], cs[1], 70, 60, 0, 'fence')
  point('objective', cs[0], cs[1], { place: 'kaldor', name: 'Kaldor comms station' })
  // the industrial quarter to the south-west
  for (let i = 0; i < 6; i++) addBuilding({ type: 'warehouse', x: P.x - 380 + (i % 3) * 55, z: P.z + 330 + Math.floor(i / 3) * 45, yaw: 0.1, w: 34, d: 22, h: 8, place: 'kaldor' })
}

// ---------- towns and villages: houses along the roads through them ----------
function town(id) {
  const P = place(id), r = rng(300 + id.length * 17 + Math.round(P.x))
  const ls = roadLines.filter(l => !l.id.includes('-') && l.pts.some(p => Math.hypot(p[0] - P.x, p[1] - P.z) < P.r))
  // a short main street of its own if no road runs through
  if (!ls.length) ls.push(addRoad(`${id}-main`, 'road', [[P.x - P.r * 0.8, P.z], [P.x + P.r * 0.8, P.z]], 8))
  const big = P.kind === 'town'
  let church = false
  for (const l of ls) for (let i = 1; i < l.pts.length - 1; i += 3) {
    const [x, z] = l.pts[i], [nx, nz] = l.pts[i + 1]
    const d = Math.hypot(x - P.x, z - P.z)
    if (d > P.r) continue
    const dx = nx - x, dz = nz - z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len
    for (const side of [-1, 1]) {
      if (r() < 0.2) continue
      const w = 8 + Math.floor(r() * 4), dd = 8 + Math.floor(r() * 3)
      const off = l.w / 2 + dd / 2 + 5
      const bx = x + uz * off * side, bz = z - ux * off * side
      const yaw = Math.atan2(-(uz * side), -(-ux * side))
      let b = { type: 'house', w, d: dd, floors: 1 + (r() < (big ? 0.5 : 0.3) ? 1 : 0), style: 'rural' }
      if (!church && d < P.r * 0.4 && r() < 0.3) { b = { type: 'church', w: 11, d: 20 }; church = true }
      else if (big && d < P.r * 0.5 && r() < 0.25) b = { type: 'shop', w: 12, d: 10, floors: 2, style: 'old' }
      addBuilding({ ...b, x: bx, z: bz, yaw, place: id })
    }
  }
  // farms round the edge
  for (let k = 0; k < (big ? 3 : 4); k++) {
    const a = r() * Math.PI * 2, d = P.r * (0.9 + r() * 0.6)
    const x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d
    if (addBuilding({ type: 'barn', x, z, yaw: r() * 3, w: 12, d: 18, place: id })) addBuilding({ type: 'house', x: x + 22, z: z + 4, yaw: r() * 3, w: 9, d: 8, floors: 2, style: 'rural', place: id })
  }
  if (id === 'belno' || id === 'tovar' || id === 'marsk') {
    const l = ls[0], p = l.pts[Math.floor(l.pts.length / 2)]
    for (let t = 0; t < 30; t++) {
      const q = l.pts[Math.min(l.pts.length - 1, Math.floor(l.pts.length / 2) + t * 2)]
      const a = Math.atan2((l.pts[Math.min(l.pts.length - 1, l.pts.indexOf(q) + 1)][0] - q[0]), (l.pts[Math.min(l.pts.length - 1, l.pts.indexOf(q) + 1)][1] - q[1]))
      if (Math.hypot(q[0] - P.x, q[1] - P.z) > P.r * 1.3) break
      const x = q[0] + Math.cos(a) * 16, z = q[1] - Math.sin(a) * 16
      if (addBuilding({ type: 'fuel', x, z, yaw: a + Math.PI / 2, w: 16, d: 20, place: id }, { slope: 2 })) break
    }
    if (id === 'tovar') for (let k = 0; k < 2; k++) addBuilding({ type: 'warehouse', x: P.x + 80 + k * 40, z: P.z - 120, yaw: 0.3, w: 20, d: 14, h: 6, place: id, garage: true })
  }
  point('spawn', P.x, P.z, { place: id })
  point('loot', P.x + 10, P.z - 10, { place: id })
}

// ---------- military bases ----------
function base(id, w, d) {
  const P = place(id), r = rng(400 + id.length)
  const yaw = 0.2, c = Math.cos(yaw), s = Math.sin(yaw)
  const at = (lx, lz) => [P.x + lx * c + lz * s, P.z - lx * s + lz * c]
  fence(P.x, P.z, w, d, yaw, 'hesco')
  for (let i = 0; i < 4; i++) { const [x, z] = at(-w / 2 + 30 + i * 22, -d / 2 + 28); addBuilding({ type: 'barracks', x, z, yaw, w: 26, d: 9, floors: 1, place: id }, { slope: 5, force: true }) }
  { const [x, z] = at(w / 2 - 40, d / 2 - 40); addBuilding({ type: 'hangar', x, z, yaw: yaw + Math.PI, w: 34, d: 28, h: 9, military: true, place: id }, { slope: 6, force: true }) }
  { const [x, z] = at(0, 10); addBuilding({ type: 'apartment', x, z, yaw, w: 18, d: 12, floors: 2, style: 'military', place: id, command: true }, { slope: 6, force: true }) }
  for (const [lx, lz] of [[-w / 2 + 4, -d / 2 + 4], [w / 2 - 4, -d / 2 + 4], [-w / 2 + 4, d / 2 - 4], [w / 2 - 4, d / 2 - 4]]) { const [x, z] = at(lx, lz); addBuilding({ type: 'watchtower', x, z, yaw, w: 4, d: 4, h: 7, place: id }, { force: true }) }
  { const [x, z] = at(-w / 2 + 40, d / 2 - 35); prop('helipad', x, z, yaw); point('heli', x, z, { place: id, yaw }) }
  for (let i = 0; i < 3; i++) { const [x, z] = at(-20 + i * 20, d / 2 - 15); prop('sandbagnest', x, z, yaw + Math.PI) }
  { const [x, z] = at(w / 2 - 30, -d / 2 + 30); addBuilding({ type: 'bunker', x, z, yaw, w: 9, d: 6, place: id }, { slope: 6, force: true }) }
  for (let i = 0; i < 4; i++) { const [x, z] = at(w / 2 - 75 + i * 10, d / 2 - 20); point('vehicle', x, z, { yaw: yaw + Math.PI, place: id, military: true }) }
  point('spawn', P.x, P.z + 25, { place: id, base: true })
  point('objective', P.x, P.z, { place: id, name: place(id).name })
}

// ---------- Kessel Airbase ----------
function airbase() {
  const P = place('kessel'), A = 0.26, c = Math.cos(A), s = Math.sin(A)
  const at = (lx, lz) => [P.x + lx * c + lz * s, P.z - lx * s + lz * c]
  const y = heightAt(P.x, P.z)
  // the runway (2.6 km), a parallel taxiway, links and the apron
  const run = [at(-1300, 0), at(1300, 0)]
  addRoad('kessel-runway', 'runway', run, 10, y)
  addRoad('kessel-taxi', 'taxiway', [at(-1250, 180), at(1250, 180)], 10, y)
  for (const lx of [-1250, -400, 400, 1250]) addRoad(`kessel-link-${lx}`, 'taxiway', [at(lx, 20), at(lx, 175)], 10, y)
  for (let i = 0; i < 5; i++) addRoad(`kessel-apron-${i}`, 'apron', [at(-500, 230 + i * 30), at(500, 230 + i * 30)], 10, y)
  // hangars, the tower, the terminal, fuel, barracks and air defence
  for (let i = 0; i < 5; i++) { const [x, z] = at(-420 + i * 110, 340); addBuilding({ type: 'hangar', x, z, yaw: A + Math.PI, w: 40, d: 32, h: 12, military: i < 3, place: 'kessel' }, { force: true }) }
  { const [x, z] = at(600, 300); addBuilding({ type: 'controltower', x, z, yaw: A + Math.PI, w: 9, d: 9, place: 'kessel' }, { force: true }) }
  { const [x, z] = at(750, 330); addBuilding({ type: 'apartment', x, z, yaw: A + Math.PI, w: 60, d: 18, floors: 2, style: 'modern', place: 'kessel', terminal: true }, { force: true }) }
  for (let i = 0; i < 3; i++) { const [x, z] = at(-700 + i * 22, 360); addBuilding({ type: 'tank', x, z, yaw: 0, w: 12, d: 12, h: 9, place: 'kessel' }, { force: true }) }
  for (let i = 0; i < 3; i++) { const [x, z] = at(-900, 300 + i * 25); addBuilding({ type: 'barracks', x, z, yaw: A, w: 28, d: 9, floors: 1, place: 'kessel' }, { force: true }) }
  for (const [lx, lz] of [[-1350, 120], [1350, 120], [0, -120], [-600, 420]]) { const [x, z] = at(lx, lz); prop('aagun', x, z, A); prop('sandbagring', x, z, A) }
  for (let i = 0; i < 3; i++) { const [x, z] = at(900 + i * 45, 230); prop('helipad', x, z, A); point('heli', x, z, { place: 'kessel', yaw: A + Math.PI }) }
  for (let i = 0; i < 4; i++) { const [x, z] = at(-450 + i * 110, 250); point('plane', x, z, { place: 'kessel', yaw: A + Math.PI }) }
  { const [x, z] = at(-1150, 0); point('runway', x, z, { place: 'kessel', yaw: A + Math.PI / 2 }) }
  fence(P.x, P.z + 150, 2800, 760, A, 'fence')
  point('spawn', ...at(700, 260), { place: 'kessel', base: true })
  point('objective', P.x, P.z + 200, { place: 'kessel', name: 'Kessel Airbase' })
}

// ---------- industry and landmarks ----------
function industry() {
  { const P = place('quarry'), r = rng(501)
    for (let i = 0; i < 3; i++) addBuilding({ type: 'warehouse', x: P.x - 60 + i * 50, z: P.z + 60, yaw: 0.4, w: 24, d: 14, h: 8, place: 'quarry' }, { slope: 6 })
    for (let i = 0; i < 10; i++) prop('rockpile', P.x + (r() - 0.5) * 220, P.z + (r() - 0.5) * 160, r() * 3, { s: 2 + r() * 4 })
    point('spawn', P.x, P.z, { place: 'quarry' }) }
  { const P = place('lumber'), r = rng(502)
    for (let i = 0; i < 2; i++) addBuilding({ type: 'warehouse', x: P.x + i * 40, z: P.z, yaw: 0.6, w: 26, d: 12, h: 6, place: 'lumber' }, { slope: 6 })
    for (let i = 0; i < 8; i++) prop('logs', P.x + (r() - 0.5) * 120, P.z + 40 + (r() - 0.5) * 60, r() * 3)
    point('spawn', P.x, P.z + 20, { place: 'lumber' }) }
  { const P = place('power')
    for (let i = 0; i < 2; i++) addBuilding({ type: 'warehouse', x: P.x - 30 + i * 60, z: P.z, yaw: 0, w: 40, d: 26, h: 14, place: 'power' }, { slope: 6 })
    for (let i = 0; i < 3; i++) prop('chimney', P.x - 40 + i * 35, P.z - 50, 0)
    fence(P.x, P.z, 220, 170, 0, 'fence')
    point('objective', P.x, P.z, { place: 'power', name: 'Anselm Power Station' }) }
  // Mount Hallen: the summit station, lookouts, cabins, hidden bunkers and caves
  const H = place('hallen')
  addBuilding({ type: 'mast', x: H.x, z: H.z, yaw: 0, w: 3, d: 3, h: 34, place: 'hallen' }, { force: true })
  addBuilding({ type: 'bunker', x: H.x + 14, z: H.z + 6, yaw: 0.5, w: 8, d: 6, place: 'hallen' }, { force: true })
  point('objective', H.x, H.z, { place: 'hallen', name: 'Hallen Summit Station' })
  const G = place('grail')
  for (const [dx, dz] of [[-20, -10], [18, 12]]) addBuilding({ type: 'bunker', x: G.x + dx, z: G.z + dz, yaw: 0.3, w: 9, d: 6, place: 'grail' }, { force: true })
  addBuilding({ type: 'watchtower', x: G.x, z: G.z - 25, yaw: 0, w: 4, d: 4, h: 9, place: 'grail' }, { force: true })
  addBuilding({ type: 'barracks', x: G.x + 5, z: G.z + 30, yaw: 0.3, w: 22, d: 9, floors: 1, place: 'grail' }, { force: true })
  fence(G.x, G.z, 120, 110, 0.3, 'hesco')
  point('objective', G.x, G.z, { place: 'grail', name: 'Fort Grail' })
  const r = rng(503)
  const secrets = [
    ['lookout', 1700, -2050], ['lookout', 3300, -1650], ['lookout', -4000, -2500], ['lookout', 2500, 2300], ['lookout', 1350, -3100],
    ['cabin', 2050, -2250], ['cabin', 2900, -2900], ['cabin', 1600, -2650], ['cabin', 3500, -2300],
    ['hidden', 2650, -2150], ['hidden', 1950, -3300], ['hidden', -3900, -2400],
    ['cave', 2150, -1950], ['cave', 3000, -2600],
    ['crash', -600, -900], ['crash', 2200, 1500], ['wreck', -1800, 1000], ['wreck', 2600, 600], ['wreck', -500, -3000], ['wreck', 1400, 2200],
    ['stash', -2900, 300], ['stash', 3000, 3000], ['stash', -1000, 1800], ['stash', 600, -2800], ['stash', 4000, -1200],
  ]
  for (const [kind, x0, z0] of secrets) {
    // nudge onto ground that suits it
    let x = x0, z = z0
    for (let t = 0; t < 20; t++) { if (waterLevel(x, z) < heightAt(x, z) - 1 && normalAt(x, z)[1] > 0.8) break; x = x0 + (r() - 0.5) * 160; z = z0 + (r() - 0.5) * 160 }
    if (kind === 'lookout') addBuilding({ type: 'watchtower', x, z, yaw: r() * 3, w: 4, d: 4, h: 10, place: null, lookout: true }, { force: true })
    else if (kind === 'cabin') addBuilding({ type: 'cabin', x, z, yaw: r() * 3, w: 8, d: 7, floors: 1, style: 'rural', place: null }, { force: true })
    else if (kind === 'hidden') addBuilding({ type: 'bunker', x, z, yaw: r() * 3, w: 8, d: 6, place: null, hidden: true }, { force: true })
    else if (kind === 'cave') prop('cave', x, z, r() * 3)
    else if (kind === 'crash') prop('crash', x, z, r() * 3)
    else if (kind === 'wreck') prop('wreck', x, z, r() * 3)
    point(kind === 'stash' ? 'stash' : 'secret', x, z, { kind, name: { lookout: 'Lookout tower', cabin: 'Mountain cabin', hidden: 'Hidden bunker', cave: 'Cave', crash: 'Crashed helicopter', wreck: 'Abandoned vehicle', stash: 'Supply stash' }[kind] })
    if (kind === 'stash') prop('crates', x, z, r() * 3)
  }
}

// A perimeter of fence posts, or HESCO walls (sand-filled, stops bullets), with a gate gap on one side.
function fence(cx, cz, w, d, yaw, kind) {
  const c = Math.cos(yaw), s = Math.sin(yaw)
  const seg = kind === 'hesco' ? 6 : 10
  for (const [ax, az, bx, bz] of [[-w / 2, -d / 2, w / 2, -d / 2], [w / 2, -d / 2, w / 2, d / 2], [w / 2, d / 2, -w / 2, d / 2], [-w / 2, d / 2, -w / 2, -d / 2]]) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / seg))
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, lx = ax + (bx - ax) * t, lz = az + (bz - az) * t
      if (az === d / 2 && bz === d / 2 && Math.abs(lx) < 9) continue      // the gate
      const x = cx + lx * c + lz * s, z = cz - lx * s + lz * c
      if (waterLevel(x, z) > heightAt(x, z)) continue
      prop(kind, x, z, yaw + Math.atan2(bx - ax, bz - az) + Math.PI / 2, { len: L / n })
    }
  }
}

// Wrecked and parked cars along the roads, lamps in the streets, barriers at checkpoints.
function roadside() {
  const r = rng(601)
  for (const l of roadLines) {
    if (l.kind === 'runway' || l.kind === 'taxiway' || l.kind === 'apron') continue
    for (let i = 5; i < l.pts.length - 5; i++) {
      const [x, z] = l.pts[i], [nx, nz] = l.pts[i + 1], a = Math.atan2(nx - x, nz - z)
      if (l.kind === 'street' && i % 5 === 0) prop('lamp', x + Math.cos(a) * (l.w / 2 + 1), z - Math.sin(a) * (l.w / 2 + 1), a)
      if (l.kind === 'street' && i % 7 === 3) {
        // the other pavement: a bench or a bin, turned to the street
        const d = l.w / 2 + 1.5, bx = x - Math.cos(a) * d, bz = z + Math.sin(a) * d, rr = roadAt(bx, bz)
        if (!(rr && rr.d < rr.w / 2 + 0.3) && !isBuilt(bx, bz, 0.5)) prop(r() < 0.55 ? 'bench' : 'bin', bx, bz, a + Math.PI / 2)
      }
      if (l.kind === 'street' && i % 40 === 22 && r() < 0.6) {
        const d = l.w / 2 + 2.4, bx = x + Math.cos(a) * d, bz = z - Math.sin(a) * d, rr = roadAt(bx, bz)
        if (!(rr && rr.d < rr.w / 2 + 0.5) && !isBuilt(bx, bz, 1)) prop('busstop', bx, bz, a - Math.PI / 2)
      }
      if (l.kind === 'street' && r() < 0.06) prop('car', x + Math.cos(a) * (l.w / 2 - 1.3), z - Math.sin(a) * (l.w / 2 - 1.3), a, { color: Math.floor(r() * 6) })
      if (l.kind !== 'street' && r() < 0.004) prop('wreck', x + Math.cos(a) * (l.w / 2 + 3), z - Math.sin(a) * (l.w / 2 + 3), a + r() - 0.5)
    }
  }
  // checkpoints where highways meet the cities
  for (const [x, z, a] of [[-2700, 2620, 1.4], [350, 1100, 2.6], [-2300, -1600, 3.4], [3650, 1450, 0.2]]) {
    for (const s of [-1, 1]) prop('barrier', x + Math.cos(a) * 3 * s, z - Math.sin(a) * 3 * s, a)
    prop('sandbagnest', x + Math.cos(a) * 9, z - Math.sin(a) * 9, a)
    point('checkpoint', x, z, { yaw: a })
  }
}

// Power lines: wooden poles about every 48 m beside the country roads and highways, wired pole to pole;
// a line breaks at bridges, water, buildings and other roads, and starts again after.
function powerLines() {
  for (const l of roadLines) {
    if (l.kind !== 'road' && l.kind !== 'highway') continue
    let prev = null
    for (let i = 3; i < l.pts.length - 3; i += 6) {
      const [x, z, , bridge] = l.pts[i], [nx, nz] = l.pts[i + 1], a = Math.atan2(nx - x, nz - z)
      const d = l.w / 2 + 5, px = x + Math.cos(a) * d, pz = z - Math.sin(a) * d
      const rr = roadAt(px, pz), h = heightAt(px, pz)
      const ok = !bridge && waterLevel(px, pz) < h - 0.3 && !(rr && rr.d < rr.w / 2 + 1.5) && !isBuilt(px, pz, 1.5)
      if (!ok) { prev = null; continue }
      const p = prop('pole', px, pz, a)
      if (prev && Math.hypot(px - prev.x, pz - prev.z) < 70) {
        // the next pole in the previous one's own frame
        const DX = px - prev.x, DZ = pz - prev.z, c = Math.cos(prev.yaw), s = Math.sin(prev.yaw)
        prev.to = [DX * c - DZ * s, p.y - prev.y, DX * s + DZ * c]
      }
      prev = p
    }
  }
}
// Round hay bales in the fields round the villages and towns
function hayBales() {
  const r = rng(733)
  for (const P of PLACES) {
    if (P.kind !== 'village' && P.kind !== 'town') continue
    for (let k = 0; k < 60; k++) {
      const ang = r() * Math.PI * 2, dist = P.r * (1 + r() * 2.2), x = P.x + Math.cos(ang) * dist, z = P.z + Math.sin(ang) * dist
      if (fieldAt(x, z) === 0 || r() < 0.6) continue
      const rr = roadAt(x, z)
      if ((rr && rr.d < rr.w / 2 + 8) || isBuilt(x, z, 6) || forestAt(x, z) > 0.3 || waterLevel(x, z) > heightAt(x, z) - 0.5 || normalAt(x, z)[1] < 0.93) continue
      prop('haybale', x, z, r() * 3)
    }
  }
}
// Lighthouses on the coast near the harbour city and the fishing town: the first shore found walking out
// from the place, set back a little onto the land.
function lighthouses() {
  for (const [id, dirs] of [['anselm', [3.6, 3.2, 4.0, 2.8]], ['halvik', [1.6, 1.2, 2.0, 0.8]]]) {
    const P = place(id)
    if (!P) continue
    for (const ang of dirs) {
      const dx = Math.cos(ang), dz = Math.sin(ang)
      let found = null
      for (let s = P.r * 0.6; s < P.r + 1600; s += 10) {
        const x = P.x + dx * s, z = P.z + dz * s
        if (waterLevel(x, z) > heightAt(x, z)) { found = s; break }
      }
      if (!found) continue
      const x = P.x + dx * (found - 18), z = P.z + dz * (found - 18)
      if (isBuilt(x, z, 4) || roadAt(x, z)?.d < 6) continue
      prop('lighthouse', x, z, ang)
      POINTS.push({ kind: 'lighthouse', x, y: heightAt(x, z), z, place: id })
      break
    }
  }
}

let built = false
export function buildPlaces(progress = () => {}) {
  if (built) return
  anselm(); progress(0.3)
  kaldor(); progress(0.5)
  for (const id of ['halvik', 'koriv', 'dresk', 'belno', 'marsk', 'tovar', 'ilsen', 'sorn']) town(id)
  progress(0.7)
  base('sentinel', 220, 170)
  airbase()
  industry()
  roadside()
  powerLines(); hayBales(); lighthouses()
  progress(1)
  built = true
}
