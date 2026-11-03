// Varden's buildings, each made with the kit in its own frame (origin at the middle of its footprint on the
// ground, +z its front). Two forms of each: detail (walls with doors and windows, floors, stairs to the roof,
// furniture for cover; colliders) for the streets round the player, and a shell (one block with its
// windows painted on) for everything further away.
import { rng } from '../core/noise.js'
import { vary } from './kit.js'

export const PAL = {
  concrete: [0.68, 0.67, 0.64], concreteDark: [0.48, 0.48, 0.47], glassBand: [0.28, 0.4, 0.5], window: [0.16, 0.2, 0.26],
  plaster: [[0.86, 0.78, 0.62], [0.8, 0.68, 0.55], [0.74, 0.79, 0.72], [0.88, 0.85, 0.78], [0.78, 0.6, 0.48], [0.7, 0.74, 0.8]],
  modern: [[0.78, 0.78, 0.76], [0.58, 0.62, 0.66], [0.72, 0.66, 0.58], [0.5, 0.53, 0.56], [0.82, 0.8, 0.74], [0.62, 0.52, 0.46]],
  brick: [0.62, 0.32, 0.24], roofRed: [0.62, 0.24, 0.17], roofBrown: [0.42, 0.28, 0.2], roofGrey: [0.36, 0.38, 0.4], roofGreen: [0.3, 0.42, 0.32],
  wood: [0.55, 0.4, 0.26], woodDark: [0.36, 0.25, 0.16], barnRed: [0.6, 0.18, 0.13], white: [0.9, 0.9, 0.88],
  sheet: [0.62, 0.64, 0.66], sheetBlue: [0.32, 0.45, 0.6], olive: [0.38, 0.42, 0.26], tan: [0.68, 0.6, 0.44], military: [0.42, 0.45, 0.32],
  metal: [0.45, 0.46, 0.48], dark: [0.16, 0.16, 0.17], yellow: [0.9, 0.72, 0.12], red: [0.75, 0.15, 0.12], asphalt: [0.22, 0.22, 0.24],
  sand: [0.72, 0.64, 0.46], floorTile: [0.6, 0.58, 0.54], floorWood: [0.58, 0.44, 0.3], furniture: [0.5, 0.36, 0.24], crate: [0.58, 0.47, 0.3],
}
const FH = 3.2      // storey height
const T = 0.3       // wall thickness

// ---------- shared pieces ----------
// Windows along a wall of length L: one every `every` metres (none within `margin` of the ends).
function windows(L, every, lo, hi, w, margin = 1, skip = null) {
  const out = [], n = Math.max(0, Math.floor((L - margin * 2) / every))
  const start = (L - (n - 1) * every) / 2
  for (let i = 0; i < n; i++) {
    const c = start + i * every
    if (skip && skip(c)) continue
    out.push({ a: c - w / 2, b: c + w / 2, lo, hi, glass: true })
  }
  return out
}

// A block of `floors` storeys, w x d, with windows, doors front and back, floors, an interior wall per
// floor, a stair core (alternating flights) to the roof, and a parapet. `o`: wall colour, window style,
// ground-floor shop front, flat roof furniture.
export function block(k, w, d, floors, o) {
  const wall = o.wall, mat = o.mat || 'concrete', r = o.r
  const H = floors * FH
  const hw = w / 2, hd = d / 2
  // stair core in the back-left corner: two lanes 1.3 m wide, flights 4 m long
  const sx0 = -hw + T + 0.2, sz0 = hd - T - 4.9, lane = 1.3
  const doorX = o.doorX ?? 0
  for (let f = 0; f < floors; f++) {
    const y0 = f * FH
    const lo = f === 0 && o.shopfront ? 0.4 : 0.95, hi = f === 0 && o.shopfront ? 2.6 : 2.25
    const ww = o.ribbon ? 2.6 : 1.3, every = o.ribbon ? 3 : (o.every || 3.2)
    // front (+z) and back (-z) walls: along x
    const front = windows(w, every, lo, hi, ww, 1.2, f === 0 ? c => Math.abs(c - hw - doorX) < 1.6 : null)
    if (f === 0) front.push({ a: hw + doorX - 0.7, b: hw + doorX + 0.7, lo: 0, hi: 2.35 })
    k.wall(-hw, hw, hd - T / 2, y0, FH, T, wall, front, { mat })
    const back = windows(w, every, 0.95, 2.25, ww, 1.2, f === 0 ? c => Math.abs(c - hw) < 1.6 : null)
    if (f === 0) back.push({ a: hw - 0.7, b: hw + 0.7, lo: 0, hi: 2.35 })
    k.wall(-hw, hw, -hd + T / 2, y0, FH, T, wall, back, { mat })
    // sides: along z
    const side = windows(d - 2 * T, every, 0.95, 2.25, ww, 1.2)
    k.wallZ(-hd + T, hd - T, -hw + T / 2, y0, FH, T, wall, f === 0 ? [] : side.filter(p => p.b < d - 2 * T - 5.2), { mat })
    k.wallZ(-hd + T, hd - T, hw - T / 2, y0, FH, T, wall, side, { mat })
    // the floor of this storey (the stairwell hole is in the slab above each flight)
    const lane0 = f % 2 === 0
    const hole = f > 0 ? [sx0 + (lane0 ? lane : 0), sx0 + (lane0 ? 2 * lane : lane), sz0, sz0 + 4.4] : null
    k.slab(-hw + T, hw - T, -hd + T, hd - T, y0 + 0.12, 0.24, o.floor || PAL.floorTile, hole)
    // a flight from this storey to the next (lane alternates; direction alternates)
    const lx = sx0 + (lane0 ? lane / 2 : lane * 1.5)
    if (lane0) k.stairs(lx, y0 + 0.12, sz0 + 0.2, lane - 0.1, FH, 4.0, PAL.concreteDark)
    else stairsBack(k, lx, y0 + 0.12, sz0 + 4.2, lane - 0.1, FH, 4.0, PAL.concreteDark)
    // the stair core's inner wall, with an opening onto the floor
    k.wallZ(sz0 - 0.3, hd - T, sx0 + 2 * lane + 0.12, y0 + 0.12, FH - 0.12, 0.16, PAL.concrete, [{ a: 0.4, b: 1.6, lo: 0, hi: 2.2 }])
    // an interior wall across the floor, with a doorway, and a little furniture for cover
    if (w > 10) {
      const ix = sx0 + 2 * lane + (hw - (sx0 + 2 * lane)) * 0.55
      k.wallZ(-hd + T, sz0 - 0.4, ix, y0 + 0.12, FH - 0.12, 0.14, o.inner || PAL.white, [{ a: (sz0 - 0.4 + hd - T) / 2 - 0.6, b: (sz0 - 0.4 + hd - T) / 2 + 0.6, lo: 0, hi: 2.2 }])
    }
    furniture(k, -hw + T, hw - T, -hd + T, sz0 - 0.6, y0 + 0.24, r, o.office)
    k.spot(0, y0 + 0.3, 0, 'loot')
  }
  // the roof: slab with the stairwell hole, a parapet, a hut over the stairs, the odd machine
  const lane0 = floors % 2 === 0
  k.slab(-hw, hw, -hd, hd, H + 0.2, 0.3, PAL.concreteDark, [sx0 + (lane0 ? lane : 0), sx0 + (lane0 ? 2 * lane : lane), sz0, sz0 + 4.4])
  parapet(k, w, d, H + 0.2, 0.9, o.trim || wall)
  const hut = [sx0 - 0.15, sx0 + 2 * lane + 0.15, sz0 - 0.2, sz0 + 4.6]
  k.box((hut[0] + hut[1]) / 2, H + 0.2 + 1.25, hut[3], (hut[1] - hut[0]) / 2, 1.25, 0.12, o.trim || wall)
  k.box(hut[0], H + 0.2 + 1.25, (hut[2] + hut[3]) / 2, 0.12, 1.25, (hut[3] - hut[2]) / 2, o.trim || wall)
  k.box(hut[1], H + 0.2 + 1.25, (hut[2] + hut[3]) / 2 + 1.0, 0.12, 1.25, (hut[3] - hut[2]) / 2 - 1.0, o.trim || wall)
  k.box((hut[0] + hut[1]) / 2, H + 0.2 + 2.6, (hut[2] + hut[3]) / 2, (hut[1] - hut[0]) / 2 + 0.1, 0.1, (hut[3] - hut[2]) / 2 + 0.1, PAL.concreteDark)
  if (w > 9) {
    k.box(hw * 0.4, H + 0.2 + 0.7, -hd * 0.4, 1.0, 0.7, 0.8, PAL.metal, { mat: 'metal' })
    k.box(-hw * 0.2, H + 0.2 + 0.45, -hd * 0.5, 0.6, 0.45, 0.6, PAL.metal, { mat: 'metal' })
  }
  k.spot(hw * 0.6, H + 0.4, hd * 0.6, 'roof'); k.spot(-hw * 0.5, H + 0.4, -hd * 0.6, 'roof')
  // a plinth that meets uneven ground
  k.box(0, -0.9, 0, hw + 0.1, 1.0, hd + 0.1, PAL.concreteDark, { collide: false })
}
// A flight going the other way (-z): mirror of kit.stairs.
function stairsBack(k, x, y0, z0, w, rise, run, color) {
  const n = Math.max(4, Math.round(rise / 0.19)), sh = rise / n, sd = run / n
  for (let i = 0; i < n; i++) k.box(x, y0 + sh * (i + 0.5), z0 - sd * (i + 0.5), w / 2, sh / 2, sd / 2 + 0.01, color, { collide: false })
  const ang = Math.atan2(rise, run), len = Math.hypot(rise, run) / 2
  k.box(x, y0 + rise / 2, z0 - run / 2, w / 2, 0.05, len, color, { pitch: ang, kind: 'stairs', noBottom: true })
}
function parapet(k, w, d, y, h, color) {
  const hw = w / 2, hd = d / 2, t = 0.25
  k.box(0, y + h / 2, hd - t / 2, hw, h / 2, t / 2, color)
  k.box(0, y + h / 2, -hd + t / 2, hw, h / 2, t / 2, color)
  k.box(-hw + t / 2, y + h / 2, 0, t / 2, h / 2, hd - t, color)
  k.box(hw - t / 2, y + h / 2, 0, t / 2, h / 2, hd - t, color)
}
// Tables, shelves, sofas: things to hide behind indoors.
function furniture(k, x0, x1, z0, z1, y, r, office) {
  const n = 1 + Math.floor(r() * 3)
  for (let i = 0; i < n; i++) {
    const x = x0 + 1.2 + r() * Math.max(0.1, x1 - x0 - 2.4), z = z0 + 1.2 + r() * Math.max(0.1, z1 - z0 - 2.4)
    const t = r()
    if (t < 0.4) k.box(x, y + 0.38, z, 0.8, 0.38, 0.5, office ? PAL.metal : PAL.furniture, { mat: office ? 'sheetmetal' : 'wood', kind: 'prop' })
    else if (t < 0.7) k.box(x, y + 0.9, z, 0.5, 0.9, 0.25, PAL.woodDark, { mat: 'wood', kind: 'prop' })
    else k.box(x, y + 0.42, z, 1.0, 0.42, 0.45, [0.45, 0.38, 0.5], { mat: 'wood', kind: 'prop' })
    k.spot(x, y, z + 0.8, 'cover')
  }
}

// ---------- the types ----------
// Each takes (kit, building record) and builds in the kit's current frame.
export const TYPES = {
  // A one- or two-storey house with a pitched roof.
  house(k, b) {
    const r = rng(b.seed), w = b.w, d = b.d, fl = b.floors
    const wall = vary(b.style === 'rural' ? PAL.plaster[Math.floor(r() * 6)] : PAL.plaster[Math.floor(r() * 6)], r)
    const hw = w / 2, hd = d / 2
    for (let f = 0; f < fl; f++) {
      const y0 = f * 2.9
      const front = windows(w, 2.8, 0.9, 2.1, 1.1, 1, f === 0 ? c => Math.abs(c - hw) < 1.3 : null)
      if (f === 0) front.push({ a: hw - 0.55, b: hw + 0.55, lo: 0, hi: 2.2 })
      k.wall(-hw, hw, hd - T / 2, y0, 2.9, T, wall, front)
      k.wall(-hw, hw, -hd + T / 2, y0, 2.9, T, wall, windows(w, 2.8, 0.9, 2.1, 1.1, 1))
      k.wallZ(-hd + T, hd - T, -hw + T / 2, y0, 2.9, T, wall, windows(d - 2 * T, 2.8, 0.9, 2.1, 1.1, 1))
      k.wallZ(-hd + T, hd - T, hw - T / 2, y0, 2.9, T, wall, f === 0 && fl > 1 ? [] : windows(d - 2 * T, 2.8, 0.9, 2.1, 1.1, 1))
      k.slab(-hw + T, hw - T, -hd + T, hd - T, y0 + 0.1, 0.2, PAL.floorWood, f > 0 ? [hw - T - 1.2, hw - T, -hd + T + 0.3, -hd + T + 3.9] : null, { mat: 'wood' })
      if (f < fl - 1) k.stairs(hw - T - 0.6, y0 + 0.1, -hd + T + 0.3, 1.1, 2.9, 3.6, PAL.woodDark)
      furniture(k, -hw + T, hw - T - 1.4, -hd + T, hd - T, y0 + 0.2, r, false)
    }
    const top = fl * 2.9
    k.slab(-hw + T, hw - T, -hd + T, hd - T, top + 0.1, 0.2, PAL.floorWood, null, { mat: 'wood' })
    const roof = b.roof || [PAL.roofRed, PAL.roofBrown, PAL.roofGrey, PAL.roofGreen][Math.floor(r() * 4)]
    if (w >= d) k.gable(0, top + 0.2, 0, w, d, Math.min(3.2, d * 0.4), roof)
    else { k.setFrame(k.ox, k.oy, k.oz, k.yaw + Math.PI / 2); k.gable(0, top + 0.2, 0, d, w, Math.min(3.2, w * 0.4), roof); k.setFrame(k.ox, k.oy, k.oz, k.yaw - Math.PI / 2) }
    k.box(0, -0.7, 0, hw + 0.1, 0.8, hd + 0.1, PAL.concreteDark, { collide: false })
    // a chimney and a little porch
    k.box(-hw * 0.5, top + 2.4, -hd * 0.3, 0.35, 1.2, 0.35, PAL.brick)
    if (r() < 0.6) k.box(0, 0.12, hd + 0.9, 1.4, 0.12, 0.9, PAL.concreteDark)
  },
  // Apartments / offices: the block, 3-7 storeys.
  apartment(k, b) {
    const r = rng(b.seed)
    const wall = vary((b.style === 'modern' ? PAL.modern : PAL.plaster)[Math.floor(r() * 6)], r)
    block(k, b.w, b.d, b.floors, { wall, r, trim: vary(wall, r, 0.15), every: 3.2, shopfront: b.shop })
  },
  // A tall modern tower: ribbon windows, a stair core all the way up.
  tower(k, b) {
    const r = rng(b.seed)
    const wall = vary(PAL.modern[Math.floor(r() * 6)], r)
    block(k, b.w, b.d, b.floors, { wall, r, ribbon: true, trim: PAL.concreteDark, office: true, shopfront: true })
    // a crown on top: antenna and a band
    const H = b.floors * FH
    k.box(0, H + 0.2 + 3.5, 0, 0.12, 3.5, 0.12, PAL.metal, { collide: false })
    k.lights.push({ x: k.tx(0, 0), y: k.oy + H + 7.2, z: k.tz(0, 0), color: [1, 0.15, 0.1], blink: true })
  },
  shop(k, b) {
    const r = rng(b.seed)
    const wall = vary((b.style === 'modern' ? PAL.modern : PAL.plaster)[Math.floor(r() * 6)], r)
    block(k, b.w, b.d, b.floors, { wall, r, shopfront: true, trim: vary(wall, r, 0.2) })
    // an awning over the shop front
    const c = [PAL.red, [0.2, 0.45, 0.65], [0.25, 0.55, 0.3], PAL.yellow][Math.floor(r() * 4)]
    k.box(0, 2.85, b.d / 2 + 0.8, b.w / 2 - 0.4, 0.06, 0.8, c, { pitch: 0.18, collide: false })
  },
  // A big shed: sheet-metal walls, roller doors, racks and crates inside.
  warehouse(k, b) {
    const r = rng(b.seed), w = b.w, d = b.d, h = b.h || 8
    const wall = vary(r() < 0.5 ? PAL.sheet : PAL.sheetBlue, r)
    const hw = w / 2, hd = d / 2
    const doors = []
    for (let x = 5; x < w - 4; x += 12) doors.push({ a: x - 2.2, b: x + 2.2, lo: 0, hi: 4.6 })
    k.wall(-hw, hw, hd - 0.15, 0, h, 0.3, wall, doors, { mat: 'sheetmetal' })
    k.wall(-hw, hw, -hd + 0.15, 0, h, 0.3, wall, [{ a: hw - 0.6, b: hw + 0.6, lo: 0, hi: 2.3 }], { mat: 'sheetmetal' })
    k.wallZ(-hd + 0.3, hd - 0.3, -hw + 0.15, 0, h, 0.3, wall, windows(d - 0.6, 6, h - 2.2, h - 1.0, 3, 2), { mat: 'sheetmetal' })
    k.wallZ(-hd + 0.3, hd - 0.3, hw - 0.15, 0, h, 0.3, wall, windows(d - 0.6, 6, h - 2.2, h - 1.0, 3, 2), { mat: 'sheetmetal' })
    k.slab(-hw, hw, -hd, hd, 0.1, 0.2, PAL.concreteDark)
    k.gable(0, h, 0, w, d, Math.min(3, d * 0.12), vary(PAL.roofGrey, r), 0.3, { mat: 'sheetmetal' })
    for (let i = 0; i < 6; i++) {
      const x = -hw + 3 + r() * (w - 6), z = -hd + 3 + r() * (d - 8)
      const s = 0.6 + r() * 0.5
      k.box(x, s, z, s, s, s, PAL.crate, { mat: 'wood', kind: 'prop' })
      if (r() < 0.5) k.box(x + 0.1, 2 * s + s * 0.8, z, s * 0.8, s * 0.8, s * 0.8, PAL.crate, { mat: 'wood', kind: 'prop' })
      k.spot(x, 0.2, z + 1.5, 'cover')
    }
    // racks along the back wall
    k.box(0, 1.6, -hd + 1.5, hw - 3, 1.6, 0.5, PAL.metal, { mat: 'sheetmetal', kind: 'prop' })
    k.spot(0, 0.3, 0, 'loot')
  },
  // An aircraft hangar: an open front, a gabled sheet roof.
  hangar(k, b) {
    const r = rng(b.seed), w = b.w, d = b.d, h = b.h || 10
    const wall = vary(b.military ? PAL.military : PAL.sheet, r)
    const hw = w / 2, hd = d / 2
    k.wall(-hw, hw, -hd + 0.2, 0, h, 0.4, wall, [{ a: hw - 0.6, b: hw + 0.6, lo: 0, hi: 2.3 }], { mat: 'sheetmetal' })
    k.wallZ(-hd + 0.4, hd, -hw + 0.2, 0, h, 0.4, wall, [], { mat: 'sheetmetal' })
    k.wallZ(-hd + 0.4, hd, hw - 0.2, 0, h, 0.4, wall, [], { mat: 'sheetmetal' })
    k.box(0, h + 0.4, hd - 0.4, hw, 0.6, 0.4, wall, { mat: 'sheetmetal' })
    k.slab(-hw, hw, -hd, hd, 0.1, 0.2, PAL.concrete)
    k.gable(0, h + 0.4, 0, w, d, Math.min(5, w * 0.12), vary(b.military ? PAL.olive : PAL.roofGrey, r), 0.3, { mat: 'sheetmetal' })
    k.box(-hw + 2, 1, -hd + 2, 1.5, 1, 1, PAL.metal, { mat: 'metal', kind: 'prop' })
    k.spot(-hw + 2, 0.2, -hd + 4, 'cover'); k.spot(0, 0.2, 0, 'spawn')
  },
  // A church: a long nave and a bell tower you can climb.
  church(k, b) {
    const r = rng(b.seed), w = b.w, d = b.d
    const wall = vary(PAL.plaster[3], r, 0.05)
    const hw = w / 2, hd = d / 2, h = 9
    k.wall(-hw, hw, hd - 0.25, 0, h, 0.5, wall, [{ a: hw - 1.1, b: hw + 1.1, lo: 0, hi: 3.4 }])
    k.wall(-hw, hw, -hd + 0.25, 0, h, 0.5, wall, [])
    const tall = windows(d - 1, 4.5, 2.5, 6.5, 1.4, 2)
    k.wallZ(-hd + 0.5, hd - 0.5, -hw + 0.25, 0, h, 0.5, wall, tall)
    k.wallZ(-hd + 0.5, hd - 0.5, hw - 0.25, 0, h, 0.5, wall, tall)
    k.slab(-hw, hw, -hd, hd, 0.15, 0.3, PAL.floorTile)
    k.gable(0, h, 0, d, w, w * 0.45, PAL.roofGrey, 0.4)
    for (let z = -hd + 3; z < hd - 4; z += 2.2) { k.box(-hw * 0.45, 0.45, z, hw * 0.35, 0.45, 0.25, PAL.woodDark, { mat: 'wood', kind: 'prop' }); k.box(hw * 0.45, 0.45, z, hw * 0.35, 0.45, 0.25, PAL.woodDark, { mat: 'wood', kind: 'prop' }) }
    // the tower over the door, a ladder inside to the belfry
    const tz = hd + 2.5, th = 22
    k.wall(-2.5, 2.5, tz + 2.5 - 0.25, 0, th, 0.5, wall, [{ a: 1.6, b: 3.4, lo: 0, hi: 3 }, { a: 1.6, b: 3.4, lo: th - 4, hi: th - 1.5 }])
    k.wall(-2.5, 2.5, tz - 2.5 + 0.25, 0, th, 0.5, wall, [{ a: 1.6, b: 3.4, lo: 0, hi: 3.2 }, { a: 1.6, b: 3.4, lo: th - 4, hi: th - 1.5 }])
    k.wallZ(tz - 2, tz + 2, -2.25, 0, th, 0.5, wall, [{ a: 1.1, b: 2.9, lo: th - 4, hi: th - 1.5 }])
    k.wallZ(tz - 2, tz + 2, 2.25, 0, th, 0.5, wall, [{ a: 1.1, b: 2.9, lo: th - 4, hi: th - 1.5 }])
    k.slab(-2.5, 2.5, tz - 2.5, tz + 2.5, th - 4.2, 0.3, PAL.floorWood, [-1.6, -0.6, tz - 2.0, tz - 1.0], { mat: 'wood' })
    k.ladder(-1.1, tz - 1.6, 0.1, th - 4.1, PAL.woodDark)
    k.gable(0, th, tz, 5, 5, 6, PAL.roofGrey, 0.3)
    k.spot(0, th - 3.9, tz, 'roof')
  },
  // A barn: wide door, hay inside, a loft.
  barn(k, b) {
    const r = rng(b.seed), w = b.w, d = b.d, h = 5.5
    const wall = vary(r() < 0.6 ? PAL.barnRed : PAL.wood, r)
    const hw = w / 2, hd = d / 2
    k.wall(-hw, hw, hd - 0.15, 0, h, 0.3, wall, [{ a: hw - 2, b: hw + 2, lo: 0, hi: 4 }], { mat: 'wood' })
    k.wall(-hw, hw, -hd + 0.15, 0, h, 0.3, wall, [{ a: hw - 0.6, b: hw + 0.6, lo: 0, hi: 2.2 }], { mat: 'wood' })
    k.wallZ(-hd + 0.3, hd - 0.3, -hw + 0.15, 0, h, 0.3, wall, windows(d, 4, 2.5, 3.4, 1, 2), { mat: 'wood' })
    k.wallZ(-hd + 0.3, hd - 0.3, hw - 0.15, 0, h, 0.3, wall, windows(d, 4, 2.5, 3.4, 1, 2), { mat: 'wood' })
    k.slab(-hw, hw, -hd, hd, 0.08, 0.16, PAL.wood, null, { mat: 'wood' })
    k.gable(0, h, 0, w, d, d * 0.35, vary(PAL.roofGrey, r), 0.5, { mat: 'sheetmetal' })
    for (let i = 0; i < 5; i++) { const x = -hw + 1.5 + r() * (w - 3), z = -hd + 1.5 + r() * (d - 5); k.box(x, 0.5, z, 0.7, 0.5, 0.5, [0.85, 0.75, 0.4], { mat: 'wood', kind: 'prop' }); k.spot(x, 0.1, z + 1, 'cover') }
  },
  // A fuel station: canopy, pumps, a small shop. The pumps burn when shot enough (explosive props).
  fuel(k, b) {
    const r = rng(b.seed)
    k.box(0, 4.6, 3, 7, 0.25, 4.5, PAL.white, { mat: 'sheetmetal' })
    k.box(0, 4.85, 3, 7.05, 0.08, 4.55, [0.2, 0.55, 0.3], { collide: false })
    for (const x of [-5, 5]) k.box(x, 2.3, 3, 0.25, 2.3, 0.25, PAL.white, { mat: 'metal' })
    for (const x of [-2.5, 2.5]) { const c = k.box(x, 0.85, 3, 0.4, 0.85, 0.6, PAL.red, { mat: 'metal', kind: 'explosive' }); if (c) c.hp = 60 }
    k.setFrame(k.tx(0, -6), k.oy, k.tz(0, -6), k.yaw)
    block(k, 10, 7, 1, { wall: PAL.white, r, shopfront: true, trim: [0.2, 0.55, 0.3] })
  },
  // A watchtower: four legs, a ladder, a sandbagged platform.
  watchtower(k, b) {
    const h = b.h || 7
    for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) k.box(x, h / 2, z, 0.15, h / 2, 0.15, PAL.woodDark, { mat: 'wood' })
    k.box(0, h + 0.1, 0, 1.6, 0.1, 1.6, PAL.wood, { mat: 'wood', kind: 'floor' })
    for (const s of [-1, 1]) { k.box(0, h + 0.6, s * 1.5, 1.6, 0.45, 0.12, PAL.sand, { mat: 'sandbag' }); k.box(s * 1.5, h + 0.6, 0, 0.12, 0.45, 1.2, PAL.sand, { mat: 'sandbag' }) }
    k.box(0, h + 2.7, 0, 1.9, 0.08, 1.9, PAL.olive, { mat: 'wood' })
    for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) k.box(x, h + 1.7, z, 0.06, 1, 0.06, PAL.woodDark, { collide: false })
    k.ladder(0, -1.75, 0, h + 0.2, PAL.woodDark)
    k.spot(0, h + 0.2, 0, 'roof')
  },
  // A radio mast: a lattice tower with a ladder to a platform.
  mast(k, b) {
    const h = b.h || 30
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) k.box(x, h / 2, z, 0.08, h / 2, 0.08, PAL.metal, { mat: 'metal' })
    for (let y = 2; y < h; y += 2.5) { k.box(0, y, -0.8, 0.8, 0.05, 0.05, PAL.white, { collide: false }); k.box(0, y, 0.8, 0.8, 0.05, 0.05, PAL.red, { collide: false }); k.box(-0.8, y, 0, 0.05, 0.05, 0.8, PAL.white, { collide: false }); k.box(0.8, y, 0, 0.05, 0.05, 0.8, PAL.red, { collide: false }) }
    k.box(0, h - 4, 0, 1.6, 0.08, 1.6, PAL.metal, { mat: 'metal', kind: 'floor' })
    k.ladder(0, -0.95, 0, h - 3.9, PAL.metal)
    k.box(0, h + 1.5, 0, 0.1, 1.5, 0.1, PAL.metal, { collide: false })
    for (const s of [-1, 1]) k.box(s * 0.9, h - 2, 0, 0.35, 0.6, 0.06, PAL.white, { collide: false })
    k.lights.push({ x: k.tx(0, 0), y: k.oy + h + 3, z: k.tz(0, 0), color: [1, 0.1, 0.05], blink: true })
    k.spot(0, h - 3.9, 0, 'roof')
  },
  // A military barracks: a long low block.
  barracks(k, b) {
    const r = rng(b.seed)
    block(k, b.w, b.d, 1, { wall: vary(PAL.military, r, 0.05), r, every: 3.5, trim: PAL.olive })
  },
  // A concrete bunker with firing slits, half sunk in the ground.
  bunker(k, b) {
    const w = b.w || 7, d = b.d || 5, h = 2.4, hw = w / 2, hd = d / 2
    const c = PAL.concreteDark
    k.wall(-hw, hw, hd - 0.4, 0, h, 0.8, c, [{ a: hw - 0.6, b: hw + 0.6, lo: 0, hi: 2.0 }])
    k.wall(-hw, hw, -hd + 0.4, 0, h, 0.8, c, [{ a: 1, b: 3, lo: 1.2, hi: 1.55 }, { a: w - 3, b: w - 1, lo: 1.2, hi: 1.55 }])
    k.wallZ(-hd + 0.8, hd - 0.8, -hw + 0.4, 0, h, 0.8, c, [{ a: d / 2 - 1, b: d / 2 + 1, lo: 1.2, hi: 1.55 }])
    k.wallZ(-hd + 0.8, hd - 0.8, hw - 0.4, 0, h, 0.8, c, [{ a: d / 2 - 1, b: d / 2 + 1, lo: 1.2, hi: 1.55 }])
    k.box(0, h + 0.35, 0, hw + 0.3, 0.35, hd + 0.3, c)
    k.slab(-hw, hw, -hd, hd, 0.1, 0.2, PAL.concrete)
    k.box(1, 0.5, 0, 0.6, 0.5, 0.6, PAL.olive, { mat: 'wood', kind: 'prop' })
    k.spot(0, 0.2, -hd + 1.2, 'cover'); k.spot(0, 0.2, 0, 'loot')
  },
  // A mountain cabin: logs, a pitched roof, a porch.
  cabin(k, b) {
    b.floors = 1; b.roof = PAL.roofGreen
    TYPES.house(k, b)
  },
  // An airport control tower: a shaft with stairs and a glass cab on top.
  controltower(k, b) {
    const r = rng(b.seed)
    const floors = 6
    block(k, 9, 9, floors, { wall: PAL.white, r, every: 3, trim: PAL.concreteDark })
    const H = floors * FH + 0.2
    // the cab: glass all round
    k.setFrame(k.ox, k.oy + H, k.oz, k.yaw)
    for (const s of [-1, 1]) {
      k.box(0, 3.4, s * 6, 6.2, 0.3, 0.2, PAL.concreteDark)
      k.box(s * 6, 3.4, 0, 0.2, 0.3, 6.2, PAL.concreteDark)
      k.pane(0, 1.8, s * 6, 5.6, 1.3, 0); k.pane(s * 6, 1.8, 0, 5.6, 1.3, Math.PI / 2)
    }
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) k.box(x, 1.8, z, 0.2, 1.8, 0.2, PAL.concreteDark)
    k.slab(-6.2, 6.2, -6.2, 6.2, 0.15, 0.3, PAL.floorTile)
    k.box(0, 3.85, 0, 6.6, 0.15, 6.6, PAL.dark)
    k.box(0, 0.55, -4, 3.5, 0.55, 0.6, PAL.metal, { mat: 'sheetmetal', kind: 'prop' })
    k.lights.push({ x: k.tx(0, 0), y: k.oy + 5, z: k.tz(0, 0), color: [1, 0.15, 0.1], blink: true })
    k.spot(0, 0.3, 0, 'roof')
  },
  // A multi-storey car park: open decks joined by ramps.
  parking(k, b) {
    const w = b.w, d = b.d, decks = b.floors, hw = w / 2, hd = d / 2
    for (let f = 0; f <= decks; f++) {
      const y = f * 3
      k.slab(-hw, hw, -hd, hd, y + 0.15, 0.3, PAL.concrete, f > 0 ? [hw - 6.5, hw - 0.5, -hd + 1, -hd + 15] : null)
      if (f > 0) { k.box(0, y + 0.6, hd - 0.15, hw, 0.45, 0.15, PAL.concreteDark); k.box(0, y + 0.6, -hd + 0.15, hw, 0.45, 0.15, PAL.concreteDark); k.box(-hw + 0.15, y + 0.6, 0, 0.15, 0.45, hd, PAL.concreteDark) }
      if (f < decks) k.stairs(hw - 3.5, y + 0.3, -hd + 1, 5.5, 3, 14, PAL.concreteDark)
      for (let x = -hw + 4; x < hw - 8; x += 8) for (const z of [-hd + 6, hd - 6]) k.box(x, y + 1.6, z, 0.3, 1.45, 0.3, PAL.concreteDark)
      k.spot(-hw + 3, y + 0.4, 0, 'cover')
    }
    k.spot(0, decks * 3 + 0.4, 0, 'roof')
  },
  // A harbour crane: legs over the quay and a long jib.
  crane(k, b) {
    const h = 26
    for (const [x, z] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) k.box(x, h / 2, z, 0.5, h / 2, 0.5, PAL.yellow, { mat: 'metal' })
    k.box(0, h + 1.5, 0, 5, 1.5, 4, PAL.yellow, { mat: 'metal' })
    k.box(0, h + 2.4, 8, 1, 0.8, 22, PAL.yellow, { mat: 'metal' })
    k.box(0, h + 4.5, 0, 2, 2, 2.5, [0.85, 0.85, 0.82], { mat: 'sheetmetal' })
    k.ladder(-4, -3.6, 0, h, PAL.metal)
  },
  // A stack of shipping containers (a maze to fight through on the docks).
  containers(k, b) {
    const r = rng(b.seed)
    const cols = [[0.7, 0.2, 0.15], [0.15, 0.35, 0.6], [0.25, 0.5, 0.3], [0.85, 0.55, 0.15], [0.55, 0.55, 0.58], [0.5, 0.25, 0.45]]
    for (let i = 0; i < b.n; i++) {
      const x = (i % 3) * 3.2 - 3.2, z = Math.floor(i / 3) * 7 - 7
      const stack = 1 + Math.floor(r() * 3)
      for (let s = 0; s < stack; s++) k.box(x, 1.3 + s * 2.6, z, 1.22, 1.3, 3.0, cols[Math.floor(r() * 6)], { mat: 'sheetmetal' })
      k.spot(x + 1.8, 0.2, z, 'cover')
    }
  },
  // Fuel tanks at the airfield and the docks.
  tank(k, b) {
    const r = b.w / 2
    k.box(0, b.h / 2, 0, r * 0.71, b.h / 2, r * 0.71, PAL.white, { mat: 'metal', kind: 'explosive' })
    k.box(0, b.h / 2, 0, r * 0.71, b.h / 2, r * 0.71, PAL.white, { yaw: Math.PI / 4, mat: 'metal', collide: false })
    k.ladder(0, -r * 0.75, 0, b.h, PAL.metal)
  },
}

// The far form of any building: its block, its roof, its windows as darker bands.
export function shell(k, b) {
  const r = rng(b.seed)
  const w = b.w, d = b.d, hw = w / 2, hd = d / 2
  switch (b.type) {
    case 'house': case 'cabin': {
      const fl = b.floors || 1, h = fl * 2.9
      const wall = (b.style === 'rural' ? PAL.plaster : PAL.plaster)[Math.floor(rng(b.seed)() * 6)]
      k.box(0, h / 2 - 0.5, 0, hw, h / 2 + 0.5, hd, wall, { collide: false })
      for (let f = 0; f < fl; f++) { k.box(0, f * 2.9 + 1.5, hd + 0.01, hw * 0.75, 0.35, 0.02, PAL.window, { collide: false }); k.box(0, f * 2.9 + 1.5, -hd - 0.01, hw * 0.75, 0.35, 0.02, PAL.window, { collide: false }) }
      const roof = b.type === 'cabin' ? PAL.roofGreen : [PAL.roofRed, PAL.roofBrown, PAL.roofGrey, PAL.roofGreen][Math.floor(rng(b.seed)() * 4)]
      if (w >= d) k.gable(0, h, 0, w, d, Math.min(3.2, d * 0.4), roof, 0.4, { collide: false })
      else { k.setFrame(k.ox, k.oy, k.oz, k.yaw + Math.PI / 2); k.gable(0, h, 0, d, w, Math.min(3.2, w * 0.4), roof, 0.4, { collide: false }); k.setFrame(k.ox, k.oy, k.oz, k.yaw - Math.PI / 2) }
      return
    }
    case 'apartment': case 'tower': case 'shop': case 'barracks': case 'controltower': {
      const fl = b.type === 'controltower' ? 6 : b.floors, h = fl * FH
      const wall = b.type === 'barracks' ? PAL.military : b.type === 'controltower' ? PAL.white : (b.style === 'modern' || b.type === 'tower' ? PAL.modern : PAL.plaster)[Math.floor(r() * 6)]
      k.box(0, h / 2 - 0.5, 0, hw, h / 2 + 0.9, hd, wall, { collide: false })
      const band = b.type === 'tower' ? PAL.glassBand : PAL.window
      for (let f = 0; f < fl; f++) {
        const y = f * FH + 1.6, bh = b.type === 'tower' ? 0.75 : 0.5
        k.box(0, y, 0, hw + 0.02, bh, hd * 0.85, band, { collide: false })
        k.box(0, y, 0, hw * 0.85, bh, hd + 0.02, band, { collide: false })
      }
      if (b.type === 'controltower') k.box(0, h + 2, 0, 6.2, 2, 6.2, PAL.glassBand, { collide: false })
      return
    }
    case 'church':
      k.box(0, 4.5, 0, hw, 4.5, hd, PAL.plaster[3], { collide: false })
      k.gable(0, 9, 0, d, w, w * 0.45, PAL.roofGrey, 0.4, { collide: false })
      k.box(0, 11, hd + 2.5, 2.5, 11, 2.5, PAL.plaster[3], { collide: false })
      k.gable(0, 22, hd + 2.5, 5, 5, 6, PAL.roofGrey, 0.3, { collide: false })
      return
    case 'warehouse': case 'hangar': case 'barn': {
      const h = b.h || (b.type === 'barn' ? 5.5 : 8)
      const wall = b.type === 'barn' ? PAL.barnRed : b.military ? PAL.military : PAL.sheet
      k.box(0, h / 2, 0, hw, h / 2, hd, wall, { collide: false })
      k.gable(0, h, 0, w, d, Math.min(4, d * 0.15), b.military ? PAL.olive : PAL.roofGrey, 0.3, { collide: false })
      return
    }
    default:
      // the detail form is cheap enough for the rest (masts, towers, cranes, containers)
      TYPES[b.type]?.(k, b)
  }
}
