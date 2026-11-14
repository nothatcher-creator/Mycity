// The block catalogue. Every block comes in large-grid cells (2.5 m) and/or small-grid cells (0.5 m);
// its shape is built in cell units (see geo.js) and its function described by plain numbers: thrust in
// newtons, torque in newton-metres, power in megawatts, storage in megawatt-hours, mass in kilograms.
// Local axes: -Z is a block's front (where a seat faces, where a lamp shines), +Y its top; a thruster blows
// its exhaust out of +Z and so pushes its grid toward -Z.
import { Geo, SIDE } from './geo.js'
import { T } from './atlas.js'

export const CELL = { large: 2.5, small: 0.5 }
export const BLOCKS = {}
export const ORDER = []
export const CATS = ['Hull', 'Windows', 'Control', 'Thrust', 'Power', 'Production', 'Utility', 'Interior', 'Lights']
const BIT = { px: 1, nx: 2, py: 4, ny: 8, pz: 16, nz: 32 }
function def(d) {
  d.sizes = d.sizes || { large: [1, 1, 1], small: [1, 1, 1] }
  d.full = d.full ?? 0
  BLOCKS[d.id] = d; ORDER.push(d.id); return d
}
const DARKC = [0.32, 0.34, 0.37], STEEL = [0.62, 0.65, 0.68], GOLD = [0.88, 0.62, 0.18], TEAL = [0.25, 0.92, 0.85]
const np = { paint: false }

// ---------- hull: eight shapes, light and heavy ----------
const sq = (y, z0 = -0.5, z1 = 0.5) => [[-0.5, y, z0], [0.5, y, z0], [0.5, y, z1], [-0.5, y, z1]]
const SHAPES = {
  cube: { name: 'Block', full: 63, coll: 'cube', build: (g, t) => g.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, { tile: t, cull: true }) },
  slope: { name: 'Slope', full: BIT.ny | BIT.pz, coll: 'slope', build(g, t) {
    const I = { inside: [0, -0.17, 0.17], tile: t }
    g.poly(sq(-0.5), { ...I, side: SIDE.ny })
    g.poly([[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], { ...I, side: SIDE.pz })
    g.poly([[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], I)
    g.poly([[0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5]], { ...I, side: SIDE.px })
    g.poly([[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5]], { ...I, side: SIDE.nx })
  } },
  corner: { name: 'Corner', full: 0, coll: 'corner', build(g, t) {
    const A = [-0.5, -0.5, 0.5], B = [0.5, -0.5, 0.5], C = [0.5, -0.5, -0.5], D = [0.5, 0.5, 0.5], I = { inside: [0.25, -0.25, 0.25], tile: t }
    g.poly([A, B, C], { ...I, side: SIDE.ny }); g.poly([A, B, D], { ...I, side: SIDE.pz }); g.poly([B, C, D], { ...I, side: SIDE.px }); g.poly([A, C, D], I)
  } },
  inv: { name: 'Inverted Corner', full: BIT.ny | BIT.pz | BIT.px, coll: 'inv', build(g, t) {
    const I = { inside: [0.1, -0.1, 0.1], tile: t }
    g.poly(sq(-0.5), { ...I, side: SIDE.ny })
    g.poly([[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], { ...I, side: SIDE.pz })
    g.poly([[0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]], { ...I, side: SIDE.px })
    g.poly([[0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], { ...I, side: SIDE.py })
    g.poly([[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5]], { ...I, side: SIDE.nz })
    g.poly([[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5]], { ...I, side: SIDE.nx })
    g.poly([[0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, -0.5]], I)
  } },
  half: { name: 'Half Block', full: BIT.ny, coll: 'half', build: (g, t) => g.box(-0.5, -0.5, -0.5, 0.5, 0, 0.5, { tile: t, cull: true, cullPartial: true }) },
  halfslope: { name: 'Slope 2x1 Base', full: BIT.ny, coll: 'halfslope', build(g, t) {
    const I = { inside: [0, -0.35, 0.2], tile: t }
    g.poly(sq(-0.5), { ...I, side: SIDE.ny })
    g.poly([[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]], { ...I, side: SIDE.pz })
    g.poly([[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]], I)
    g.poly([[0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [0.5, 0, 0.5]], { ...I, side: SIDE.px })
    g.poly([[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0, 0.5]], { ...I, side: SIDE.nx })
  } },
  tip: { name: 'Slope 2x1 Tip', full: BIT.ny | BIT.pz, coll: 'tip', build(g, t) {
    const I = { inside: [0, -0.15, 0.15], tile: t }
    g.poly(sq(-0.5), { ...I, side: SIDE.ny })
    g.poly([[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], { ...I, side: SIDE.pz })
    g.poly([[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0, -0.5], [-0.5, 0, -0.5]], { ...I, side: SIDE.nz })
    g.poly([[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], I)
    g.poly([[0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0, -0.5]], { ...I, side: SIDE.px })
    g.poly([[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0, -0.5]], { ...I, side: SIDE.nx })
  } },
  round: { name: 'Round Slope', full: BIT.ny | BIT.pz, coll: 'round', build(g, t) {
    // a quarter cylinder bulging out: from the front-bottom edge round to the back-top edge
    const I = { inside: [0, -0.3, 0.3], tile: t }, n = 5, P = k => { const a = k / n * Math.PI / 2; return [0.5 - Math.cos(a), -0.5 + Math.sin(a)] }
    g.poly(sq(-0.5), { ...I, side: SIDE.ny })
    g.poly([[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], { ...I, side: SIDE.pz })
    for (let k = 0; k < n; k++) { const [z0, y0] = P(k), [z1, y1] = P(k + 1); g.poly([[-0.5, y0, z0], [0.5, y0, z0], [0.5, y1, z1], [-0.5, y1, z1]], I) }
    for (const x of [-0.5, 0.5]) { const fan = [[x, -0.5, 0.5]]; for (let k = 0; k <= n; k++) { const [z, y] = P(k); fan.push([x, y, z]) } g.poly(fan, { ...I, side: x > 0 ? SIDE.px : SIDE.nx }) }
  } },
  roundcorner: { name: 'Round Corner', full: 0, coll: 'roundcorner', build(g, t) {
    // an eighth of a ball round the back-right-bottom corner
    const I = { inside: [0.3, -0.3, 0.3], tile: t }, n = 4, C = [0.5, -0.5, 0.5]
    const S = (a, b) => [C[0] - Math.cos(b) * Math.sin(a), C[1] + Math.sin(b), C[2] - Math.cos(b) * Math.cos(a)]
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a0 = i / n * Math.PI / 2, a1 = (i + 1) / n * Math.PI / 2, b0 = j / n * Math.PI / 2, b1 = (j + 1) / n * Math.PI / 2
      g.poly(j === n - 1 ? [S(a0, b0), S(a1, b0), S(a0, b1)] : [S(a0, b0), S(a1, b0), S(a1, b1), S(a0, b1)], I)
    }
    const fan = (f, side) => { const pts = [C.slice()]; for (let k = 0; k <= n; k++) pts.push(f(k / n * Math.PI / 2)); g.poly(pts, { ...I, side }) }
    fan(a => S(a, 0), SIDE.ny); fan(b => S(0, b), SIDE.px); fan(b => S(Math.PI / 2, b), SIDE.pz)
  } },
  panel: { name: 'Plate', full: BIT.ny, coll: 'panel', build: (g, t) => g.box(-0.5, -0.5, -0.5, 0.5, -0.38, 0.5, { tile: t, cull: true, cullPartial: true }) },
}
for (const [w, tile, mass, hp, label] of [['light', T.ARMOR, [500, 25], [1, 1], 'Light Hull'], ['heavy', T.HEAVY, [3300, 150], [6, 6], 'Heavy Hull']]) {
  for (const [k, s] of Object.entries(SHAPES)) {
    const frac = k === 'cube' ? 1 : k === 'round' ? 0.78 : k === 'panel' ? 0.15 : k === 'half' || k === 'halfslope' ? 0.5 : k === 'corner' ? 0.2 : k === 'inv' ? 0.8 : k === 'tip' ? 0.75 : 0.5
    def({ id: `${w}_${k}`, name: `${label} ${s.name}`, cat: 'Hull', group: w, shape: s.coll, full: s.full, armor: true,
      mass: { large: mass[0] * frac, small: mass[1] * frac }, hp: { large: 2000 * hp[0] * Math.max(0.3, frac), small: 120 * hp[1] * Math.max(0.3, frac) },
      desc: w === 'heavy' ? 'Thick armour plate: six times tougher, heavier.' : 'Light armour: cheap and quick to build.',
      geo: (g) => s.build(g, tile) })
  }
}

// ---------- windows ----------
def({ id: 'window', name: 'Window Pane', cat: 'Windows', shape: 'pane', mass: { large: 280, small: 14 }, hp: { large: 900, small: 60 }, desc: 'Armoured glass in a frame, flush with the back of the cell.',
  geo(g) {
    const z0 = 0.3, z1 = 0.5, f = 0.09, F = { tile: T.METAL, col: STEEL }
    g.box(-0.5, -0.5, z0, 0.5, -0.5 + f, z1, F); g.box(-0.5, 0.5 - f, z0, 0.5, 0.5, z1, F); g.box(-0.5, -0.5 + f, z0, -0.5 + f, 0.5 - f, z1, F); g.box(0.5 - f, -0.5 + f, z0, 0.5, 0.5 - f, z1, F)
    g.box(-0.5 + f, -0.5 + f, 0.38, 0.5 - f, 0.5 - f, 0.42, { tile: T.GLASS, glass: true, paint: false })
  } })
def({ id: 'window_slope', name: 'Window Slope', cat: 'Windows', shape: 'slope', mass: { large: 300, small: 15 }, hp: { large: 900, small: 60 }, full: BIT.ny, desc: 'Glass on a slope, for canopies and bridges.',
  geo(g) {
    const F = { tile: T.METAL, col: STEEL, inside: [0, -0.2, 0.2] }
    g.box(-0.5, -0.5, -0.5, 0.5, -0.42, 0.5, { tile: T.METAL, cull: true, cullPartial: true })
    g.box(-0.5, -0.42, 0.42, 0.5, 0.5, 0.5, { tile: T.METAL })
    for (const x of [-0.5, 0.42]) g.poly([[x, -0.42, -0.5], [x + 0.08, -0.42, -0.5], [x + 0.08, 0.5, 0.42], [x, 0.5, 0.42]], { ...F, double: true })
    g.poly([[-0.42, -0.42, -0.46], [0.42, -0.42, -0.46], [0.42, 0.46, 0.42], [-0.42, 0.46, 0.42]], { tile: T.GLASS, glass: true, paint: false, double: true })
  } })

// ---------- control ----------
function seat(g, x, y, z, s = 1) {
  const D = { tile: T.DARK, col: DARKC, paint: false }
  g.box(x - 0.18 * s, y - 0.5 * s, z - 0.15 * s, x + 0.18 * s, y - 0.33 * s, z + 0.2 * s, D)
  g.box(x - 0.18 * s, y - 0.33 * s, z + 0.12 * s, x + 0.18 * s, y + 0.15 * s, z + 0.22 * s, D)
  g.box(x - 0.06 * s, y - 0.62 * s, z - 0.05 * s, x + 0.06 * s, y - 0.5 * s, z + 0.1 * s, { tile: T.METAL, col: STEEL, paint: false })
}
def({ id: 'cockpit', name: 'Cockpit', cat: 'Control', sizes: { large: [1, 1, 1] }, shape: 'cube', mass: { large: 1200 }, hp: { large: 2400 },
  desc: 'An enclosed seat with windows: fly the grid from here. F to sit, F to leave.',
  func: { cockpit: { eye: [0, 0.12, 0.02], enclosed: true }, inv: { large: 1000 } },
  geo(g) {
    g.box(-0.5, -0.5, -0.5, 0.5, -0.38, 0.5, { tile: T.FLOOR, cull: true, cullPartial: true })
    g.box(-0.5, -0.38, 0.38, 0.5, 0.5, 0.5, { tile: T.ARMOR, cull: true, cullPartial: true })
    for (const x of [-0.5, 0.38]) { g.box(x, -0.38, -0.5, x + 0.12, -0.05, 0.38, { tile: T.ARMOR }); g.box(x, -0.05, -0.1, x + 0.12, 0.5, 0.38, { tile: T.ARMOR }) }
    g.box(-0.5, 0.38, -0.1, 0.5, 0.5, 0.38, { tile: T.ARMOR })
    g.poly([[-0.5, -0.05, -0.5], [0.5, -0.05, -0.5], [0.5, 0.38, -0.1], [-0.5, 0.38, -0.1]], { tile: T.GLASS, glass: true, paint: false, double: true })
    for (const x of [-0.5, 0.5]) g.poly([[x, -0.05, -0.5], [x, 0.38, -0.1], [x, -0.05, -0.1]], { tile: T.GLASS, glass: true, paint: false, double: true })
    g.box(-0.36, -0.38, -0.5, 0.36, -0.1, -0.3, { tile: T.DASH, col: [1, 1, 1], paint: false, emits: { py: 0.5 } })
    seat(g, 0, -0.05, 0.08, 0.9)
  } })
def({ id: 'canopy', name: 'Fighter Canopy', cat: 'Control', sizes: { small: [3, 3, 5] }, shape: 'box', mass: { small: 900 }, hp: { small: 500 },
  desc: 'A small-grid cockpit under a glass bubble.',
  func: { cockpit: { eye: [1, 1.05, 2.0], enclosed: true }, inv: { small: 120 } },
  geo(g) {
    g.box(-0.5, -0.5, -0.5, 2.5, 0.4, 4.5, { tile: T.ARMOR })
    g.box(-0.5, 0.4, 3.2, 2.5, 1.7, 4.5, { tile: T.ARMOR })
    g.box(0.2, 0.4, 0, 1.8, 0.75, 0.8, { tile: T.DASH, paint: false, emits: { py: 0.5 } })
    seat(g, 1, 1.0, 2.2, 2.4)
    // the bubble: an arch of glass from the nose to the back
    const seg = 8
    for (let i = 0; i < seg; i++) {
      const a0 = Math.PI * i / seg, a1 = Math.PI * (i + 1) / seg, P = (a, z, rx, ry) => [1 + Math.cos(a) * rx, 0.4 + Math.sin(a) * ry, z]
      g.poly([P(a0, -0.4, 1.4, 0.7), P(a1, -0.4, 1.4, 0.7), P(a1, 3.2, 1.5, 1.4), P(a0, 3.2, 1.5, 1.4)], { tile: T.GLASS, glass: true, paint: false, double: true })
    }
  } })
def({ id: 'seat', name: 'Control Seat', cat: 'Control', sizes: { large: [1, 1, 1], small: [3, 3, 3] }, shape: 'panel', mass: { large: 300, small: 60 }, hp: { large: 600, small: 100 },
  desc: 'An open seat with controls. No cover, no air.',
  func: { cockpit: { eye: [0, 0.18, 0.05], eyeS: [1, 1.1, 1.1], enclosed: false } },
  geo(g, S) {
    const k = S[0] === 3 ? 3 : 1, o = (k - 1) / 2
    g.box(-0.5, -0.5, -0.5, k - 0.5, -0.42, k - 0.5, { tile: T.FLOOR, cull: k === 1, cullPartial: true })
    seat(g, o, o + 0.05, o + 0.1, k * 0.95)
    g.box(o - 0.32 * k, -0.42, o - 0.45 * k, o + 0.32 * k, o - 0.12 * k, o - 0.28 * k, { tile: T.DASH, paint: false, emits: { py: 0.4 } })
  } })
def({ id: 'command_chair', name: 'Command Chair', cat: 'Control', sizes: { large: [1, 1, 1], small: [3, 3, 3] }, shape: 'panel', mass: { large: 420, small: 80 }, hp: { large: 800, small: 140 },
  desc: 'A cockpit you can stand anywhere: a high-backed chair with its own controls and air line. Put it on a bridge deep inside a ship and fly from there; V in the seat steps through the views, the ship\'s cameras among them.',
  func: { cockpit: { eye: [0, 0.2, 0.06], eyeS: [1, 1.12, 1.12], enclosed: true } },
  geo(g, S) {
    const k = S[0] === 3 ? 3 : 1, o = (k - 1) / 2, D = { tile: T.DARK, col: DARKC, paint: false }, M2 = { tile: T.METAL, col: STEEL, paint: false }
    const B = (x0, y0, z0, x1, y1, z1, opt) => g.box(o + x0 * k, o + y0 * k, o + z0 * k, o + x1 * k, o + y1 * k, o + z1 * k, opt)
    g.box(-0.5, -0.5, -0.5, k - 0.5, -0.44, k - 0.5, { tile: T.FLOOR, cull: k === 1, cullPartial: true })
    g.cyl('y', o, o - 0.42 * k, o + 0.05 * k, 0.3 * k, 0.05 * k, { tile: T.RING, seg: 12, paint: false, emits: { py: 0.5 } })   // a lit ring in the floor
    g.cyl('y', o, o - 0.3 * k, o + 0.05 * k, 0.07 * k, 0.2 * k, { ...M2, seg: 8 })                                              // the pedestal
    B(-0.2, -0.2, -0.14, 0.2, -0.1, 0.24, D)                                                                                    // the seat
    B(-0.2, -0.1, 0.16, 0.2, 0.34, 0.26, D); B(-0.12, 0.34, 0.17, 0.12, 0.46, 0.25, D)                                          // the back and the head rest
    B(-0.23, -0.14, 0.1, -0.2, 0.3, 0.28, { tile: T.STRIPE }); B(0.2, -0.14, 0.1, 0.23, 0.3, 0.28, { tile: T.STRIPE })          // painted wings on the back
    for (const sx of [-1, 1]) {
      B(sx * 0.2, -0.1, -0.2, sx * 0.3, 0.0, 0.2, M2)                                                                           // arm rests
      B(sx * 0.19, 0.0, -0.22, sx * 0.31, 0.02, -0.02, { tile: T.DASH, paint: false, emits: { py: 0.7 } })                      // with keys under each hand
      B(sx * 0.3, -0.44, -0.36, sx * 0.44, -0.02, -0.22, D)                                                                     // two side desks
      g.poly([[o + sx * 0.3 * k, o - 0.02 * k, o - 0.36 * k], [o + sx * 0.44 * k, o - 0.02 * k, o - 0.36 * k], [o + sx * 0.44 * k, o + 0.16 * k, o - 0.42 * k], [o + sx * 0.3 * k, o + 0.16 * k, o - 0.42 * k]], { tile: T.SCREEN, paint: false, emit: 0.9, double: true })
    }
  } })
def({ id: 'camera', name: 'Camera', cat: 'Control', shape: 'boxes', boxes: [[-0.2, -0.5, -0.32, 0.2, -0.06, 0.3]], mass: { large: 90, small: 8 }, hp: { large: 240, small: 30 },
  desc: 'An eye for the ship. It sits on the surface under it and looks along its front. From any seat on the same grid, V steps through first person, third person and each camera in turn; hold Alt to look round.',
  func: { camera: { eye: [0, -0.24, -0.44] } },
  geo(g) {
    g.box(-0.1, -0.5, -0.08, 0.1, -0.38, 0.12, { tile: T.METAL, col: STEEL, paint: false })
    g.box(-0.15, -0.4, -0.24, 0.15, -0.1, 0.28, { tile: T.DARK, col: DARKC, paint: false })
    g.box(-0.16, -0.12, -0.26, 0.16, -0.08, 0.3, { tile: T.STRIPE })
    g.cyl('z', 0, -0.25, -0.31, 0.1, 0.14, { tile: T.PIPE, seg: 10, col: STEEL, paint: false })
    g.cyl('z', 0, -0.25, -0.385, 0.075, 0.02, { tile: T.GLASS, seg: 10, paint: false, emit: 0.5 })
    g.box(0.09, -0.08, 0.2, 0.13, -0.05, 0.24, { tile: T.GLOW, col: [1, 0.25, 0.15], paint: false, emit: 1 })
  } })
def({ id: 'gyro', name: 'Gyro Stabiliser', cat: 'Control', shape: 'cube', full: 0, mass: { large: 1200, small: 60 }, hp: { large: 1800, small: 160 },
  desc: 'Spinning rings that turn the grid. More gyros, faster turns.',
  func: { gyro: { large: 33.6e6, small: 4.5e5 }, power: { use: { large: 0.002, small: 0.0005 } } },
  geo(g) {
    const F = { tile: T.METAL }, w = 0.08
    for (const [a, b] of [[-0.5, 0.5 - w]]) for (const y of [a, b]) for (const z of [a, b]) g.box(-0.5, y, z, 0.5, y + w, z + w, F)
    for (const x of [-0.5, 0.5 - w]) for (const z of [-0.5, 0.5 - w]) g.box(x, -0.5 + w, z, x + w, 0.5 - w, z + w, F)
    for (const x of [-0.5, 0.5 - w]) for (const y of [-0.5, 0.5 - w]) g.box(x, y, -0.5 + w, x + w, y + w, 0.5 - w, F)
    g.box(-0.5, -0.5, -0.5, 0.5, -0.44, 0.5, { tile: T.METAL, cull: true, cullPartial: true, skip: ['py'] })
    g.cyl('y', 0, 0, 0, 0.36, 0.06, { tile: T.RING, col: GOLD, paint: false, seg: 16, caps: false, double: true })
    g.cyl('x', 0, 0, 0, 0.3, 0.06, { tile: T.RING, col: STEEL, paint: false, seg: 16, caps: false, double: true })
    g.ball(0, 0, 0, 0.16, { tile: T.CORE, paint: false, emit: 0.8 })
  } })

// ---------- thrust ----------
// kind: atmo (fans: air only), ion (best in vacuum), h2 (works everywhere; fuel in round two)
const THR = {
  atmo: { name: 'Atmos', col: [0.9, 0.85, 0.7], flame: [1, 0.86, 0.6] },
  ion: { name: 'Ion', col: [0.55, 0.85, 1], flame: [0.45, 0.75, 1] },
  h2: { name: 'Fuel', col: [1, 0.6, 0.3], flame: [1, 0.62, 0.28] },
}
function thrusterGeo(g, S, kind) {
  const [sx, sy, sz] = S, cx = (sx - 1) / 2, cy = (sy - 1) / 2, r = Math.min(sx, sy) * 0.46
  const z0 = -0.5, z1 = sz - 0.5, L = z1 - z0, D = { col: DARKC, paint: false }
  const fin = (a, r0, r1, za, zb, o) => g.poly([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, za], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, za], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, zb], [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, zb]], { double: true, ...o })
  // the mount plate (on the block it is built against), with a bolted collar
  g.box(-0.5, -0.5, z0, sx - 0.5, sy - 0.5, z0 + L * 0.1, { tile: T.METAL, cull: sx === 1 && sy === 1 && sz === 1, cullPartial: true })
  g.cyl('z', cx, cy, z0 + L * 0.13, r * 0.8, L * 0.06, { tile: T.RING, seg: 16, ...D })
  if (kind === 'atmo') {
    // a ducted fan: shell with a flared lip, stators, a spinner hub, the fan, a hazard band
    g.cyl('z', cx, cy, z0 + L * 0.55, r, L * 0.8, { tile: T.RING, seg: 20, caps: false })
    g.cyl('z', cx, cy, z0 + L * 0.55, r * 0.93, L * 0.8, { tile: T.DARK, seg: 20, caps: false, double: true, ...D })
    g.cyl('z', cx, cy, z0 + L * 0.97, r, L * 0.06, { r2: r * 1.06, tile: T.METAL, seg: 20, caps: false, double: true })
    g.cyl('z', cx, cy, z0 + L * 0.3, r * 1.02, L * 0.08, { tile: T.HAZARD, col: [1, 1, 1], paint: false, seg: 20, caps: false })
    g.cyl('z', cx, cy, z0 + L * 0.5, r * 0.92, 0.03, { tile: T.FAN, paint: false, capTile: T.FAN, seg: 20 })
    g.cyl('z', cx, cy, z0 + L * 0.42, r * 0.2, L * 0.5, { tile: T.METAL, seg: 10, ...D })
    g.cyl('z', cx, cy, z0 + L * 0.75, r * 0.2, L * 0.18, { r2: 0.01, tile: T.METAL, seg: 10, col: GOLD, paint: false })
    for (let i = 0; i < 5; i++) fin(i / 5 * Math.PI * 2 + 0.3, r * 0.2, r * 0.93, z0 + L * 0.6, z0 + L * 0.78, { tile: T.METAL, ...D })
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.box(cx + Math.cos(a) * r * 0.62 - 0.04, cy + Math.sin(a) * r * 0.62 - 0.04, z0 + L * 0.1, cx + Math.cos(a) * r * 0.62 + 0.04, cy + Math.sin(a) * r * 0.62 + 0.04, z0 + L * 0.2, { tile: T.METAL, ...D }) }
  } else if (kind === 'ion') {
    // a vented power block, coils, stacked emitter rings and a finned nozzle round a glowing grid
    g.box(cx - r * 0.95, cy - r * 0.95, z0 + L * 0.1, cx + r * 0.95, cy + r * 0.95, z0 + L * 0.4, { tiles: { px: T.VENT, nx: T.VENT, py: T.PANEL, ny: T.VENT, pz: T.METAL, nz: T.METAL } })
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) g.cyl('z', cx + dx * r * 0.72, cy + dy * r * 0.72, z0 + L * 0.5, r * 0.14, L * 0.22, { tile: T.COIL, paint: false, seg: 8 })
    for (let k = 0; k < 3; k++) g.cyl('z', cx, cy, z0 + L * (0.44 + k * 0.07), r * (0.74 - k * 0.07), L * 0.045, { tile: T.RING, seg: 20, ...D })
    g.cyl('z', cx, cy, z0 + L * 0.78, r * 0.6, L * 0.44, { r2: r * 0.98, tile: T.RING, seg: 20, capA: false, capB: false, double: true })
    for (let i = 0; i < 8; i++) fin(i / 8 * Math.PI * 2, r * 0.66, r * 1.0, z0 + L * 0.58, z0 + L * 0.9, { tile: T.METAL })
    g.cyl('z', cx, cy, z0 + L * 0.99, r * 0.99, 0.04, { tile: T.GLOW, col: THR.ion.col, paint: false, emit: 1.8, seg: 20, caps: false, double: true })
    g.cyl('z', cx, cy, z0 + L * 0.6, r * 0.58, 0.03, { tile: T.CORE, paint: false, emit: 1.3, seg: 20, capA: false })
    g.cyl('z', cx, cy, z0 + L * 0.66, r * 0.2, L * 0.14, { r2: 0.02, tile: T.GLOW, col: THR.ion.col, paint: false, emit: 1.5, seg: 8 })
  } else {
    // a rocket: turbopump block and feed pipes, a ribbed chamber, a two-stage bell on struts
    g.box(cx - r * 0.85, cy - r * 0.85, z0 + L * 0.1, cx + r * 0.85, cy + r * 0.85, z0 + L * 0.28, { tiles: { px: T.PIPE, nx: T.PIPE, py: T.PANEL, ny: T.PIPE, pz: T.METAL, nz: T.METAL } })
    g.cyl('z', cx, cy, z0 + L * 0.37, r * 0.46, L * 0.18, { tile: T.PIPE, seg: 14, caps: false })
    for (const a of [0.6, 2.2, 3.8, 5.4]) g.cyl('z', cx + Math.cos(a) * r * 0.66, cy + Math.sin(a) * r * 0.66, z0 + L * 0.4, r * 0.07, L * 0.26, { tile: T.COIL, paint: false, seg: 6 })
    g.cyl('z', cx, cy, z0 + L * 0.47, r * 0.36, L * 0.05, { tile: T.RING, seg: 14, col: GOLD, paint: false })
    g.cyl('z', cx, cy, z0 + L * 0.6, r * 0.36, L * 0.22, { r2: r * 0.72, tile: T.NOZZLE, seg: 20, capA: false, capB: false, double: true, ...D })
    g.cyl('z', cx, cy, z0 + L * 0.855, r * 0.72, L * 0.29, { r2: r, tile: T.RING, seg: 20, capA: false, capB: false, double: true, col: [0.5, 0.5, 0.52], paint: false })
    g.cyl('z', cx, cy, z0 + L * 0.71, r * 0.74, L * 0.03, { tile: T.RING, seg: 20, caps: false, col: GOLD, paint: false })
    g.cyl('z', cx, cy, z0 + L * 0.5, r * 0.34, 0.03, { tile: T.CORE, col: [1, 0.6, 0.3], paint: false, emit: 1.2, seg: 14, capA: false })
    for (let i = 0; i < 4; i++) fin(i * Math.PI / 2 + Math.PI / 4, r * 0.5, r * 0.86, z0 + L * 0.28, z0 + L * 0.62, { tile: T.METAL, ...D })
  }
}
for (const [kind, sizes] of Object.entries({
  atmo: { small: { large: [1, 1, 1], small: [2, 2, 3] }, big: { large: [3, 3, 3], small: [5, 5, 6] }, force: [[6.5e5, 9.6e4], [6.5e6, 5.8e5]], mass: [[4000, 700], [32000, 2900]], mw: [[2.4, 0.07], [16.4, 0.6]] },
  ion: { small: { large: [1, 1, 2], small: [1, 1, 2] }, big: { large: [3, 3, 4], small: [3, 3, 4] }, force: [[3.5e5, 1.45e4], [4.3e6, 1.73e5]], mass: [[4380, 120], [43200, 720]], mw: [[3.4, 0.08], [33.6, 1.0]] },
  h2: { small: { large: [1, 1, 2], small: [1, 1, 2] }, big: { large: [3, 3, 5], small: [3, 3, 5] }, force: [[1.08e6, 9.8e4], [7.2e6, 4.8e5]], mass: [[1420, 330], [6940, 1222]], mw: [[0, 0], [0, 0]] },
})) {
  for (const [i, sz] of [[0, 'small'], [1, 'big']]) {
    const S = sizes[sz]
    def({ id: `thr_${kind}_${sz}`, name: `${sz === 'big' ? 'Large ' : ''}${THR[kind].name} Thruster`, cat: 'Thrust', sizes: S, shape: 'box', mass: { large: sizes.mass[i][0], small: sizes.mass[i][1] }, hp: { large: sz === 'big' ? 6000 : 2000, small: sz === 'big' ? 800 : 200 },
      desc: kind === 'atmo' ? 'Big fans: strong in thick air, useless in space.' : kind === 'ion' ? 'Ion drive: full thrust in space, a third of it in thick air.' : 'Burns hydrogen: strong anywhere (unlimited fuel in creative).',
      func: { thruster: { kind, force: { large: sizes.force[i][0], small: sizes.force[i][1] }, mw: { large: sizes.mw[i][0], small: sizes.mw[i][1] }, flame: THR[kind].flame } },
      geo: (g, Sz) => thrusterGeo(g, Sz, kind) })
  }
}

// ---------- power ----------
def({ id: 'battery', name: 'Battery', cat: 'Power', shape: 'cube', full: 63, mass: { large: 3800, small: 260 }, hp: { large: 2400, small: 200 },
  desc: 'Stores power and gives it back. Charges from cores and solar arrays.',
  func: { power: { store: { large: 3, small: 0.05 }, out: { large: 12, small: 0.2 } } },
  geo: g => g.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, { cull: true, tiles: { px: T.BATTERY, nx: T.BATTERY, pz: T.BATTERY, nz: T.BATTERY, py: T.METAL, ny: T.METAL }, emits: { px: 0.25, nx: 0.25, pz: 0.25, nz: 0.25 } }) })
def({ id: 'core_small', name: 'Fusion Core', cat: 'Power', shape: 'cube', mass: { large: 4600, small: 150 }, hp: { large: 2400, small: 200 },
  desc: 'Steady power (endless fuel in creative).',
  func: { power: { out: { large: 15, small: 0.5 } } },
  geo(g) {
    g.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, { cull: true, tiles: { px: T.VENT, nx: T.VENT, pz: T.FRAME, nz: T.FRAME, py: T.METAL, ny: T.METAL }, skip: ['nz'] })
    g.box(-0.5, -0.5, -0.5, 0.5, 0.5, -0.44, { tile: T.FRAME, skip: ['pz'] })
    g.box(-0.3, -0.3, -0.5, 0.3, 0.3, -0.48, { tile: T.CORE, paint: false, emit: 1.3, skip: ['pz'] })
  } })
def({ id: 'core_big', name: 'Large Fusion Core', cat: 'Power', sizes: { large: [3, 3, 3], small: [3, 3, 3] }, shape: 'box', mass: { large: 73000, small: 1500 }, hp: { large: 12000, small: 900 },
  desc: 'A lot of power for a big ship or station.',
  func: { power: { out: { large: 300, small: 14.75 } } },
  geo(g) {
    g.box(-0.5, -0.5, -0.5, 2.5, 0.2, 2.5, { tile: T.HEAVY }); g.box(-0.5, 1.8, -0.5, 2.5, 2.5, 2.5, { tile: T.HEAVY })
    for (const [x, z] of [[-0.5, -0.5], [2.1, -0.5], [-0.5, 2.1], [2.1, 2.1]]) g.box(x, 0.2, z, x + 0.4, 1.8, z + 0.4, { tile: T.METAL })
    g.cyl('y', 1, 1, 1, 1.05, 1.6, { tile: T.CORE, paint: false, emit: 1.1, seg: 16, caps: false, double: true })
    g.cyl('y', 1, 1, 1, 0.4, 1.6, { tile: T.COIL, paint: false, seg: 10 })
  } })
def({ id: 'solar', name: 'Solar Array', cat: 'Power', sizes: { large: [4, 1, 2], small: [4, 1, 2] }, shape: 'box', mass: { large: 420, small: 50 }, hp: { large: 600, small: 80 },
  desc: 'Power from the star when its face is lit. Face it toward the light.',
  func: { power: { out: { large: 0.16, small: 0.04 }, solar: true } },
  geo(g) {
    g.box(-0.5, -0.5, -0.5, 3.5, -0.38, 1.5, { tiles: { py: T.SOLAR, ny: T.METAL, px: T.METAL, nx: T.METAL, pz: T.METAL, nz: T.METAL }, cols: { py: [1, 1, 1] }, paint: true })
    g.box(1.35, -0.38, -0.5, 1.65, -0.34, 1.5, { tile: T.METAL })
  } })

// ---------- utility ----------
def({ id: 'cargo_s', name: 'Cargo Box', cat: 'Utility', shape: 'cube', full: 63, mass: { large: 1200, small: 60 }, hp: { large: 2000, small: 160 },
  desc: 'Storage for ore, ingots and parts; every inventory on a grid is linked.', func: { cargo: { large: 15.6, small: 0.125 }, inv: { large: 15625, small: 125 } },
  geo: g => g.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, { cull: true, tiles: { px: T.CARGO, nx: T.CARGO, pz: T.CARGO, nz: T.CARGO, py: T.STRIPE, ny: T.METAL } }) })
def({ id: 'cargo_l', name: 'Cargo Hold', cat: 'Utility', sizes: { large: [3, 3, 3], small: [5, 3, 5] }, shape: 'box', mass: { large: 4600, small: 400 }, hp: { large: 8000, small: 600 },
  desc: 'A big hold for ore, ingots and parts.', func: { cargo: { large: 421, small: 15.6 }, inv: { large: 421875, small: 15625 } },
  geo(g, S) { g.box(-0.5, -0.5, -0.5, S[0] - 0.5, S[1] - 0.5, S[2] - 0.5, { tiles: { px: T.CARGO, nx: T.CARGO, pz: T.CARGO, nz: T.CARGO, py: T.HAZARD, ny: T.METAL }, cols: { py: [1, 1, 1] } }) } })
def({ id: 'medbay', name: 'Med Bay', cat: 'Utility', sizes: { large: [1, 1, 2] }, shape: 'panel', mass: { large: 3000 }, hp: { large: 1600 },
  desc: 'Heals you, and you come back here when you die.', func: { medbay: true },
  geo(g) {
    g.box(-0.5, -0.5, -0.5, 0.5, -0.36, 1.5, { tile: T.MED, cull: false })
    g.box(-0.5, -0.36, 1.32, 0.5, 0.5, 1.5, { tile: T.PANEL })
    for (const x of [-0.5, 0.4]) g.box(x, -0.36, 0.2, x + 0.1, 0.5, 0.36, { tile: T.METAL })
    g.box(-0.4, 0.4, 0.2, 0.4, 0.5, 0.36, { tile: T.METAL })
    g.box(-0.4, 0.36, 0.22, 0.4, 0.4, 0.34, { tile: T.GLOW, col: TEAL, paint: false, emit: 1.4 })
  } })
def({ id: 'beacon', name: 'Beacon', cat: 'Utility', sizes: { large: [1, 2, 1], small: [1, 2, 1] }, shape: 'box', mass: { large: 500, small: 50 }, hp: { large: 800, small: 100 },
  desc: 'Shows its grid on everyone\'s helmet display from far off.', func: { beacon: { range: 50000 }, light: { color: [1, 0.45, 0.2], range: 12, blink: true, at: [0, 1.25, 0] } },
  geo(g) { g.box(-0.4, -0.5, -0.4, 0.4, -0.2, 0.4, { tile: T.METAL }); g.cyl('y', 0, 0.5, 0, 0.1, 1.4, { tile: T.PIPE, seg: 8 }); g.ball(0, 1.25, 0, 0.18, { tile: T.GLOW, col: [1, 0.45, 0.2], paint: false, emit: 2 }) } })
def({ id: 'antenna', name: 'Antenna Mast', cat: 'Utility', sizes: { large: [1, 4, 1], small: [1, 6, 1] }, shape: 'box', mass: { large: 1600, small: 120 }, hp: { large: 1000, small: 120 },
  desc: 'Broadcasts the grid\'s name to the helmet display.', func: { beacon: { range: 30000 } },
  geo(g, S) {
    const h = S[1] - 0.5
    g.box(-0.45, -0.5, -0.45, 0.45, -0.3, 0.45, { tile: T.METAL })
    for (const [x, z] of [[-0.3, -0.3], [0.24, -0.3], [-0.3, 0.24], [0.24, 0.24]]) g.box(x, -0.3, z, x + 0.06, h, z + 0.06, { tile: T.METAL, col: STEEL, paint: false })
    for (let y = 0; y < h; y += 0.6) { g.box(-0.3, y, -0.3, 0.3, y + 0.04, -0.26, np); g.box(-0.3, y, 0.24, 0.3, y + 0.04, 0.28, np) }
    g.cyl('z', 0, h - 0.4, -0.35, 0.3, 0.05, { r2: 0.05, tile: T.PLAIN, seg: 12, paint: false, double: true })
  } })
def({ id: 'gravgen', name: 'Gravity Generator', cat: 'Utility', sizes: { large: [1, 1, 1] }, shape: 'cube', full: 63, mass: { large: 2600 }, hp: { large: 1800 },
  desc: 'Artificial gravity in a 30 x 20 x 30 m box round it (pointing to its base), so you can walk inside a ship.', func: { gravgen: { half: [15, 10, 15], g: 9.81 }, power: { use: { large: 0.5 } } },
  geo(g) { g.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, { cull: true, tiles: { px: T.RING, nx: T.RING, pz: T.RING, nz: T.RING, py: T.CORE, ny: T.METAL }, emits: { py: 0.9 } }) } })
def({ id: 'jumpdrive', name: 'Jump Drive', cat: 'Utility', sizes: { large: [3, 3, 2] }, shape: 'box', mass: { large: 22000 }, hp: { large: 6000 },
  desc: 'Charges, then folds space: jump the whole grid up to 2,000 km. J in a seat.', func: { jumpdrive: { range: 2000000, charge: 10 }, power: { use: { large: 32 } } },
  geo(g) {
    g.box(-0.5, -0.5, -0.5, 2.5, 0.0, 1.5, { tile: T.HEAVY }); g.box(-0.5, 2.0, -0.5, 2.5, 2.5, 1.5, { tile: T.HEAVY })
    g.cyl('z', 1, 1, 0.5, 1.15, 1.6, { tile: T.RING, seg: 20, caps: false, double: true })
    g.cyl('z', 1, 1, 0.5, 0.75, 1.7, { tile: T.CORE, paint: false, emit: 1.0, seg: 16 })
  } })
def({ id: 'gear', name: 'Landing Clamp', cat: 'Utility', sizes: { large: [1, 1, 1], small: [2, 1, 2] }, shape: 'box', mass: { large: 700, small: 30 }, hp: { large: 1200, small: 150 },
  desc: 'Locks onto ground, rock or another grid it touches (P in a seat).', func: { gear: true },
  geo(g, S) {
    const sx = S[0] - 0.5, sz = S[2] - 0.5, cx = (S[0] - 1) / 2, cz = (S[2] - 1) / 2
    g.box(-0.5, 0.3, -0.5, sx, 0.5, sz, { tile: T.METAL, cull: S[0] === 1, cullPartial: true })
    g.cyl('y', cx, 0, cz, 0.12 * S[0], 0.6, { tile: T.PIPE, seg: 8, caps: false })
    g.box(-0.45, -0.5, -0.45, sx - 0.05, -0.3, sz - 0.05, { tiles: { ny: T.GEAR, py: T.METAL, px: T.HAZARD, nx: T.HAZARD, pz: T.HAZARD, nz: T.HAZARD }, cols: { px: [1, 1, 1], nx: [1, 1, 1], pz: [1, 1, 1], nz: [1, 1, 1], ny: [1, 1, 1] } })
  } })
def({ id: 'connector', name: 'Docking Port', cat: 'Utility', shape: 'cube', mass: { large: 1800, small: 120 }, hp: { large: 1500, small: 150 },
  desc: 'A port to dock ships to stations (docking arrives in round three).', func: { connector: true, inv: { large: 8000, small: 1150 } },
  geo(g) {
    g.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, { cull: true, tiles: { px: T.METAL, nx: T.METAL, py: T.METAL, ny: T.METAL, pz: T.METAL, nz: T.GEAR }, cols: { nz: [1, 1, 1] }, skip: ['nz'] })
    g.box(-0.5, -0.5, -0.56, 0.5, 0.5, -0.5, { tile: T.GEAR, col: [1, 1, 1], skip: ['pz'] })
  } })
def({ id: 'conveyor', name: 'Duct Junction', cat: 'Utility', shape: 'cube', full: 63, mass: { large: 1100, small: 40 }, hp: { large: 1200, small: 100 },
  desc: 'Joins ducts that carry ore and parts between blocks (from round two).',
  geo(g) { g.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, { cull: true, tile: T.PIPE }); for (let s = 0; s < 6; s++) { const a = Math.floor(s / 2), d = s % 2 ? -1 : 1, c = [0, 0, 0]; c[a] = d * 0.505; g.cyl('xyz'[a], c[0], c[1], c[2], 0.22, 0.01, { tile: T.DARK, paint: false, seg: 10 }) } } })
def({ id: 'duct', name: 'Duct', cat: 'Utility', shape: 'box', mass: { large: 300, small: 20 }, hp: { large: 400, small: 60 },
  desc: 'A straight duct.',
  geo(g) { g.cyl('z', 0, 0, 0, 0.25, 1, { tile: T.PIPE, seg: 10, caps: false }); for (const z of [-0.45, 0.45]) g.cyl('z', 0, 0, z, 0.3, 0.1, { tile: T.METAL, seg: 10 }) } })

// ---------- interior ----------
def({ id: 'catwalk', name: 'Catwalk', cat: 'Interior', sizes: { large: [1, 1, 1] }, shape: 'panel', mass: { large: 300 }, hp: { large: 600 },
  desc: 'A grated floor with rails.',
  geo(g) {
    g.box(-0.5, -0.5, -0.5, 0.5, -0.44, 0.5, { tile: T.GRATE, cull: true, cullPartial: true })
    for (const x of [-0.48, 0.44]) { g.box(x, -0.44, -0.5, x + 0.04, 0.0, -0.46, np); g.box(x, -0.44, 0.46, x + 0.04, 0.0, 0.5, np); g.box(x, -0.04, -0.5, x + 0.04, 0.0, 0.5, np) }
  } })
def({ id: 'stairs', name: 'Stairway', cat: 'Interior', sizes: { large: [1, 1, 1] }, shape: 'slope', mass: { large: 500 }, hp: { large: 800 },
  desc: 'Steps up from the front to the back.',
  geo(g) { for (let i = 0; i < 5; i++) g.box(-0.42, -0.5, -0.5 + i * 0.2, 0.42, -0.5 + (i + 1) * 0.2, -0.3 + i * 0.2, { tiles: { py: T.GRATE, ny: T.METAL, px: T.METAL, nx: T.METAL, pz: T.METAL, nz: T.METAL } }); for (const x of [-0.5, 0.42]) g.poly([[x, -0.5, -0.5], [x, -0.5, 0.5], [x, 0.5, 0.5], [x, 0.3, 0.5]], { tile: T.METAL, double: true }) } })
def({ id: 'door', name: 'Sliding Door', cat: 'Interior', sizes: { large: [1, 1, 1] }, shape: 'door', mass: { large: 800 }, hp: { large: 1600 },
  desc: 'Two panels that slide apart. Look at it and press F.', func: { door: true }, variant: b => b.open ? 'open' : '',
  geo(g, S, grid, st) {
    const f = 0.1, F = { tile: T.METAL }
    g.box(-0.5, -0.5, -0.12, 0.5, -0.5 + f, 0.12, F); g.box(-0.5, 0.5 - f, -0.12, 0.5, 0.5, 0.12, F)
    g.box(-0.5, -0.5 + f, -0.12, -0.5 + f, 0.5 - f, 0.12, F); g.box(0.5 - f, -0.5 + f, -0.12, 0.5, 0.5 - f, 0.12, F)
    const o = st === 'open' ? 0.38 : 0
    g.box(-0.4 - o, -0.4, -0.05, 0 - o, 0.4, 0.05, { tile: T.DOOR }); g.box(0 + o, -0.4, -0.05, 0.4 + o, 0.4, 0.05, { tile: T.DOOR })
  } })
def({ id: 'passage', name: 'Passage', cat: 'Interior', sizes: { large: [1, 1, 1] }, shape: 'passage', full: BIT.px | BIT.nx | BIT.py | BIT.ny, mass: { large: 1000 }, hp: { large: 2000 },
  desc: 'A walk-through corridor section, open at the front and back.',
  geo(g) {
    const t = 0.08
    g.box(-0.5, -0.5, -0.5, 0.5, -0.5 + t, 0.5, { tiles: { py: T.FLOOR, ny: T.ARMOR }, tile: T.ARMOR, cull: true, cullPartial: true })
    g.box(-0.5, 0.5 - t, -0.5, 0.5, 0.5, 0.5, { tiles: { ny: T.PANEL, py: T.ARMOR }, tile: T.ARMOR, cull: true, cullPartial: true })
    g.box(-0.5, -0.5 + t, -0.5, -0.5 + t, 0.5 - t, 0.5, { tiles: { px: T.PANEL, nx: T.ARMOR }, tile: T.ARMOR, cull: true, cullPartial: true })
    g.box(0.5 - t, -0.5 + t, -0.5, 0.5, 0.5 - t, 0.5, { tiles: { nx: T.PANEL, px: T.ARMOR }, tile: T.ARMOR, cull: true, cullPartial: true })
    g.box(-0.1, 0.5 - t - 0.02, -0.45, 0.1, 0.5 - t, 0.45, { tile: T.LIGHT, paint: false, emit: 1.2 })
  } })
def({ id: 'girder', name: 'Girder Frame', cat: 'Interior', shape: 'cube', mass: { large: 400, small: 15 }, hp: { large: 600, small: 50 },
  desc: 'An open frame of beams: light structure.',
  geo: g => g.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, { tile: T.TRUSS, double: true }) })

// ---------- lights ----------
def({ id: 'lamp', name: 'Interior Lamp', cat: 'Lights', shape: 'panel', mass: { large: 50, small: 10 }, hp: { large: 200, small: 30 },
  desc: 'A flat lamp on the face below it.', func: { light: { color: [1, 0.95, 0.85], range: 14, at: [0, -0.3, 0] } },
  geo(g) { g.box(-0.3, -0.5, -0.3, 0.3, -0.42, 0.3, { tile: T.METAL }); g.box(-0.24, -0.42, -0.24, 0.24, -0.4, 0.24, { tile: T.LIGHT, paint: false, emit: 1.6, skip: ['ny'] }) } })
def({ id: 'flood', name: 'Floodlight', cat: 'Lights', shape: 'box', mass: { large: 200, small: 25 }, hp: { large: 300, small: 40 },
  desc: 'A spotlight shining forward.', func: { light: { color: [1, 0.97, 0.9], range: 140, spot: true, at: [0, 0, -0.3] } },
  geo(g) {
    g.box(-0.3, -0.5, -0.1, 0.3, -0.38, 0.4, { tile: T.METAL })
    g.box(-0.04, -0.38, 0.1, 0.04, -0.1, 0.18, np)
    g.cyl('z', 0, 0.02, 0, 0.26, 0.5, { r2: 0.2, tile: T.METAL, seg: 12, capA: false })
    g.cyl('z', 0, 0.02, -0.25, 0.25, 0.02, { tile: T.LIGHT, paint: false, emit: 2, seg: 12, capB: false })
  } })


// ---------- production (round two) ----------
const WHITE = [0.86, 0.88, 0.9], ORANGE = [0.9, 0.5, 0.15], BLUE = [0.25, 0.5, 0.9]
def({ id: 'survival_kit', name: 'Survival Kit', cat: 'Production', sizes: { large: [1, 1, 1], small: [2, 2, 2] }, shape: 'box', mass: { large: 1700, small: 380 }, hp: { large: 1600, small: 300 },
  desc: 'Respawn point and first workshop: heals and refills your suit, refines stone and iron slowly, makes basic parts.',
  func: { kit: true, medbay: true, inv: { large: 2000, small: 400 }, refine: { rate: 0.6, basic: true }, assemble: { rate: 0.3, basic: true }, power: { use: { large: 0.05, small: 0.05 } } },
  geo(g, S) {
    const k = S[0], e = k - 0.5
    g.box(-0.5, -0.5, -0.5, e, e * 0.55, e, { tiles: { px: T.VENT, nx: T.VENT, pz: T.CARGO, nz: T.MED, py: T.PANEL, ny: T.METAL }, cols: { nz: [1, 1, 1] } })
    g.box(-0.4, e * 0.55, -0.4, e - 0.1, e - 0.05, e - 0.1, { tiles: { nz: T.SCREEN, px: T.METAL, nx: T.METAL, py: T.FRAME, pz: T.METAL, ny: T.METAL }, emits: { nz: 0.8 }, cols: { nz: [1, 1, 1] } })
  } })
def({ id: 'refinery', name: 'Refinery', cat: 'Production', sizes: { large: [2, 2, 3] }, shape: 'box', mass: { large: 90000 }, hp: { large: 9000 },
  desc: 'Melts ore from the grid\'s cargo into ingots, which go back into cargo.', func: { inv: { large: 7500 }, refine: { rate: 4 }, power: { use: { large: 1 } } },
  geo(g) {
    g.box(-0.5, -0.5, -0.5, 1.5, 0.9, 2.5, { tiles: { px: T.VENT, nx: T.VENT, nz: T.FRAME, pz: T.HEAVY, py: T.HEAVY, ny: T.METAL } })
    g.box(0, -0.3, -0.52, 1, 0.5, -0.5, { tile: T.CORE, col: [1, 0.55, 0.25], paint: false, emit: 1.4, skip: ['pz'] })
    g.cyl('y', 1, 1.15, 2.0, 0.35, 0.5, { tile: T.PIPE, seg: 10 })
    g.cyl('y', 0, 1.1, 2.0, 0.22, 0.4, { tile: T.PIPE, seg: 8 })
    g.box(-0.5, 0.9, -0.5, 1.5, 1.5, 0.6, { tiles: { nz: T.HAZARD, py: T.METAL }, tile: T.METAL, cols: { nz: [1, 1, 1] } })
  } })
def({ id: 'assembler', name: 'Assembler', cat: 'Production', sizes: { large: [1, 2, 1] }, shape: 'box', mass: { large: 4000 }, hp: { large: 2400 },
  desc: 'Makes parts from ingots in the grid\'s cargo. Queue them at the terminal (K).', func: { inv: { large: 4000 }, assemble: { rate: 1 }, power: { use: { large: 0.6 } } },
  geo(g) {
    g.box(-0.5, -0.5, -0.5, 0.5, 0.2, 0.5, { tiles: { nz: T.PANEL, pz: T.CARGO, px: T.VENT, nx: T.VENT, py: T.FLOOR, ny: T.METAL } })
    g.box(-0.5, 0.2, 0.1, 0.5, 1.5, 0.5, { tiles: { nz: T.DASH, px: T.METAL, nx: T.METAL, py: T.METAL, pz: T.METAL }, emits: { nz: 0.5 }, cols: { nz: [1, 1, 1] } })
    g.cyl('y', 0, 0.6, -0.05, 0.06, 0.8, { tile: T.PIPE, seg: 6 })
    g.box(-0.05, 0.95, -0.35, 0.05, 1.05, 0.05, { tile: T.METAL, col: GOLD, paint: false })
    g.cyl('y', 0, 0.85, -0.3, 0.05, 0.2, { tile: T.GLOW, col: TEAL, paint: false, emit: 1.5, seg: 6 })
  } })
def({ id: 'o2h2', name: 'Oxygen-Hydrogen Splitter', cat: 'Production', sizes: { large: [1, 1, 2], small: [1, 1, 2] }, shape: 'box', mass: { large: 2600, small: 500 }, hp: { large: 1600, small: 300 },
  desc: 'Splits ice into oxygen and hydrogen for the tanks, and refills your suit nearby.', func: { inv: { large: 4000, small: 1000 }, gasgen: { large: 5, small: 1 }, power: { use: { large: 0.5, small: 0.1 } } },
  geo(g) {
    g.box(-0.5, -0.5, -0.5, 0.5, 0.1, 1.5, { tiles: { px: T.PIPE, nx: T.PIPE, py: T.METAL, ny: T.METAL, pz: T.VENT, nz: T.PANEL } })
    g.cyl('z', -0.22, 0.3, 0.5, 0.2, 1.8, { tile: T.PLAIN, col: BLUE, paint: false, seg: 10 })
    g.cyl('z', 0.22, 0.3, 0.5, 0.2, 1.8, { tile: T.PLAIN, col: WHITE, paint: false, seg: 10 })
  } })
def({ id: 'tank_h2', name: 'Hydrogen Tank', cat: 'Production', sizes: { large: [3, 3, 3], small: [3, 3, 3] }, shape: 'box', mass: { large: 25000, small: 3000 }, hp: { large: 4000, small: 500 },
  desc: 'Stores hydrogen for fuel thrusters and jetpacks.', func: { tank: { gas: 'h2', large: 5e6, small: 1.5e5 } },
  geo(g) {
    g.box(-0.5, -0.5, -0.5, 2.5, -0.2, 2.5, { tile: T.METAL })
    g.cyl('y', 1, 1.1, 1, 1.38, 2.6, { tile: T.PLAIN, col: WHITE, paint: false, seg: 18 })
    g.cyl('y', 1, 1.1, 1, 1.4, 0.3, { tile: T.PLAIN, col: ORANGE, paint: false, seg: 18, caps: false, double: true })
    for (const [x, z] of [[-0.5, -0.5], [2.3, -0.5], [-0.5, 2.3], [2.3, 2.3]]) g.box(x, -0.2, z, x + 0.2, 2.5, z + 0.2, { tile: T.METAL })
  } })
def({ id: 'tank_o2', name: 'Oxygen Tank', cat: 'Production', sizes: { large: [1, 2, 1], small: [1, 1, 1] }, shape: 'box', mass: { large: 6000, small: 300 }, hp: { large: 1500, small: 150 },
  desc: 'Stores oxygen; refills your suit when you sit on its grid.', func: { tank: { gas: 'o2', large: 1e5, small: 5e4 } },
  geo(g, S) {
    const h = S[1] - 0.5
    g.box(-0.5, -0.5, -0.5, 0.5, -0.35, 0.5, { tile: T.METAL })
    g.cyl('y', 0, (h - 0.35) / 2, 0, 0.42, h + 0.35, { tile: T.PLAIN, col: BLUE, paint: false, seg: 14 })
    g.cyl('y', 0, (h - 0.35) / 2, 0, 0.44, 0.15, { tile: T.PLAIN, col: WHITE, paint: false, seg: 14, caps: false, double: true })
  } })
// the heads of drills and the rollers of crushers turn while they work: drawn apart from the block (see
// world.js Spinners), so the block's own shape leaves them out in the world ('bare') and keeps them for
// the pictures and the ghost
def({ id: 'drill', name: 'Drill', cat: 'Production', sizes: { large: [3, 3, 3], small: [3, 3, 4] }, shape: 'box', mass: { large: 22000, small: 1200 }, hp: { large: 3000, small: 300 },
  desc: 'Mount it on the front of a ship: it bores into rock ahead while you hold the left button in the seat, and keeps everything it cuts, stone and ore, in the ship\'s cargo.',
  func: { drill: { large: 2.4, small: 1.0 }, inv: { large: 6000, small: 900 }, power: { use: { large: 0.5, small: 0.05 } }, spinner: 'drill' }, variant: b => b ? 'bare' : '',
  geo(g, S, grid, st) {
    const z1 = S[2] - 0.5
    g.box(-0.5, -0.5, z1 - 1.2, 2.5, 2.5, z1, { tiles: { pz: T.METAL, px: T.HAZARD, nx: T.HAZARD, py: T.VENT, ny: T.VENT, nz: T.METAL }, cols: { px: [1, 1, 1], nx: [1, 1, 1] } })
    g.cyl('z', 1, 1, z1 - 1.45, 1.25, 0.5, { tile: T.RING, seg: 18 })
    g.cyl('z', 1, 1, z1 - 1.75, 1.05, 0.12, { tile: T.GEAR, col: [1, 1, 1], paint: false, seg: 18 })
    for (const [x, y] of [[-0.3, -0.3], [2.3, -0.3], [-0.3, 2.3], [2.3, 2.3]]) g.cyl('z', x, y, z1 - 1.5, 0.14, 0.7, { tile: T.PIPE, seg: 6, col: DARKC, paint: false })
    if (st !== 'bare') drillHead(g, 1, 1, -0.5, z1 - 1.8)
  } })
function drillHead(g, cx, cy, za, zb) {
  const L = zb - za
  g.cyl('z', cx, cy, (za + zb) / 2, 0.06, L, { r2: 1.08, tile: T.RING, col: [0.62, 0.62, 0.64], paint: false, seg: 14, capA: false, capB: false })
  // teeth in three spirals
  for (let k = 0; k < 3; k++) for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6, a = k * 2.094 + t * 4.2, rr = 0.1 + t * 0.95, z = za + t * L
    g.cyl('z', cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z - 0.12, 0.02, 0.3, { r2: 0.13, tile: T.METAL, col: GOLD, paint: false, seg: 5, capA: false })
  }
}
def({ id: 'crusher', name: 'Rock Crusher', cat: 'Production', sizes: { large: [3, 3, 2], small: [5, 3, 3] }, shape: 'box', mass: { large: 30000, small: 1800 }, hp: { large: 4200, small: 420 },
  desc: 'Mount it on the front of a ship: a wide mouth with toothed rollers that chews through rock fast (hold the left button in the seat). It throws the stone away and keeps only the ore.',
  func: { crusher: { large: 3.6, small: 1.7 }, inv: { large: 9000, small: 1400 }, power: { use: { large: 0.9, small: 0.1 } }, spinner: 'crusher' }, variant: b => b ? 'bare' : '',
  geo(g, S, grid, st) {
    const x1 = S[0] - 0.5, y1 = S[1] - 0.5, z1 = S[2] - 0.5, zm = z1 - (S[2] > 2 ? 1.3 : 0.9)
    g.box(-0.5, -0.5, zm, x1, y1, z1, { tiles: { pz: T.METAL, px: T.VENT, nx: T.VENT, py: T.HEAVY, ny: T.HEAVY, nz: T.DARK } })
    // the jaw: side cheeks, a lip above and below, hazard edges
    for (const x of [-0.5, x1 - 0.22]) g.box(x, -0.5, -0.5, x + 0.22, y1, zm, { tiles: { nz: T.HAZARD }, tile: T.HEAVY, cols: { nz: [1, 1, 1] } })
    g.box(-0.28, y1 - 0.2, -0.5, x1 - 0.22, y1, zm, { tiles: { nz: T.HAZARD }, tile: T.HEAVY, cols: { nz: [1, 1, 1] } })
    g.box(-0.28, -0.5, -0.5, x1 - 0.22, -0.3, zm, { tiles: { nz: T.HAZARD }, tile: T.HEAVY, cols: { nz: [1, 1, 1] } })
    if (st !== 'bare') for (const y of rollerYs(S)) crusherRoll(g, -0.28, x1 - 0.22, y, (zm - 0.5) / 2 - 0.1, (S[1] - 0.9) / 4.6)
  } })
export function rollerYs(S) { const y1 = S[1] - 0.5, m = (y1 - 0.5) / 2; return [m - (S[1] - 0.8) / 4, m + (S[1] - 0.8) / 4] }
function crusherRoll(g, xa, xb, y, z, r) {
  g.cyl('x', (xa + xb) / 2, y, z, r, xb - xa, { tile: T.RING, col: [0.5, 0.5, 0.52], paint: false, seg: 12 })
  const n = Math.max(3, Math.round((xb - xa) / 0.55))
  for (let i = 0; i < n; i++) for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + i * 0.5, x = xa + (i + 0.5) / n * (xb - xa); g.cyl('y', x, y + Math.cos(a) * r, z + Math.sin(a) * r, 0.1, 0.02, { tile: T.METAL, col: GOLD, paint: false, seg: 4 }); g.ball(x, y + Math.cos(a) * r * 1.12, z + Math.sin(a) * r * 1.12, 0.11, { tile: T.METAL, col: GOLD, paint: false, seg: 2 }) }
}
def({ id: 'detector', name: 'Ore Detector', cat: 'Production', shape: 'box', mass: { large: 1800, small: 120 }, hp: { large: 900, small: 90 },
  desc: 'Finds ore: marks the nearest patch of each kind on your display while you are on or beside its grid.', func: { detector: { large: 220, small: 90 }, power: { use: { large: 0.1, small: 0.02 } } },
  geo(g) { g.box(-0.4, -0.5, -0.4, 0.4, -0.2, 0.4, { tile: T.PANEL }); g.cyl('y', 0, -0.05, 0, 0.08, 0.3, { tile: T.PIPE, seg: 6 }); g.cyl('y', 0, 0.22, 0, 0.05, 0.22, { r2: 0.44, tile: T.PLAIN, seg: 14, paint: false, capA: false, capB: false, double: true }); g.ball(0, 0.3, 0, 0.07, { tile: T.GLOW, col: TEAL, paint: false, emit: 1.6, seg: 3 }) } })

// ---------- more hull, interior, lights and utility (the third round) ----------
const deco = (id, name, tiles, desc) => def({ id, name, cat: 'Hull', shape: 'cube', full: 63, mass: { large: 500, small: 25 }, hp: { large: 2000, small: 120 }, desc, geo: g => g.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, { cull: true, ...tiles }) })
deco('hull_hazard', 'Hazard Hull Block', { tile: T.HAZARD, col: [1, 1, 1], paint: false }, 'Hull painted in warning stripes: for pads, doors and edges.')
deco('hull_vent', 'Vented Hull Block', { tiles: { px: T.VENT, nx: T.VENT, pz: T.VENT, nz: T.VENT, py: T.ARMOR, ny: T.ARMOR } }, 'Hull with louvres on four sides.')
deco('hull_grate', 'Deck Plate Block', { tiles: { py: T.FLOOR, ny: T.GRATE }, tile: T.ARMOR }, 'Hull with a tread-plate top: flooring you can build on.')
deco('hull_tech', 'Panelled Hull Block', { tiles: { px: T.PANEL, nx: T.PANEL, pz: T.CARGO, nz: T.CARGO }, tile: T.METAL }, 'Hull dressed with service panels: engine rooms and corridors.')
def({ id: 'ramp', name: 'Ramp', cat: 'Interior', shape: 'slope', full: BIT.ny | BIT.pz, mass: { large: 420, small: 20 }, hp: { large: 1200, small: 90 }, desc: 'A walkable ramp with a tread surface, front (low) to back (high).',
  geo(g) { const I = { inside: [0, -0.17, 0.17], tile: T.METAL }
    g.poly(sq(-0.5), { ...I, side: SIDE.ny }); g.poly([[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], { ...I, side: SIDE.pz })
    g.poly([[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], { ...I, tile: T.FLOOR })
    g.poly([[0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5]], { ...I, side: SIDE.px, tile: T.HAZARD, col: [1, 1, 1], paint: false }); g.poly([[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5]], { ...I, side: SIDE.nx, tile: T.HAZARD, col: [1, 1, 1], paint: false }) } })
def({ id: 'porthole', name: 'Porthole Block', cat: 'Windows', shape: 'cube', mass: { large: 460, small: 22 }, hp: { large: 1800, small: 110 }, desc: 'A hull block with a round window through it, front to back.',
  geo(g) {
    g.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, { tile: T.ARMOR, cull: true, skip: ['pz', 'nz'] })
    // front and back faces as rings of hull round the glass
    const n = 12, R = 0.3
    for (const z of [-0.5, 0.5]) for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, sqp = a => { const c = Math.cos(a), s2 = Math.sin(a), m = 0.5 / Math.max(Math.abs(c), Math.abs(s2)); return [c * m, s2 * m] }
      const [x0, y0] = sqp(a0), [x1, y1] = sqp(a1)
      g.poly([[Math.cos(a0) * R, Math.sin(a0) * R, z], [x0, y0, z], [x1, y1, z], [Math.cos(a1) * R, Math.sin(a1) * R, z]], { tile: T.ARMOR, inside: [0, 0, 0], fit: false, cellUV: true })
    }
    g.cyl('z', 0, 0, 0, R, 1.0, { tile: T.METAL, seg: n, caps: false, double: true, col: STEEL, paint: false })
    g.cyl('z', 0, 0, 0, R * 0.98, 0.04, { tile: T.GLASS, glass: true, paint: false, seg: n })
  } })
def({ id: 'skylight', name: 'Glass Plate', cat: 'Windows', shape: 'panel', mass: { large: 220, small: 10 }, hp: { large: 700, small: 50 }, desc: 'A sheet of armoured glass on the face below: glass floors and roofs.',
  geo(g) { const f = 0.06; for (const [a, b, c2, d] of [[-0.5, -0.5, 0.5, -0.5 + f], [-0.5, 0.5 - f, 0.5, 0.5], [-0.5, -0.5 + f, -0.5 + f, 0.5 - f], [0.5 - f, -0.5 + f, 0.5, 0.5 - f]]) g.box(a, -0.5, b, c2, -0.4, d, { tile: T.METAL, col: STEEL }); g.box(-0.5 + f, -0.48, -0.5 + f, 0.5 - f, -0.43, 0.5 - f, { tile: T.GLASS, glass: true, paint: false }) } })
def({ id: 'wall', name: 'Interior Wall', cat: 'Interior', shape: 'pane', mass: { large: 260, small: 12 }, hp: { large: 800, small: 60 }, desc: 'A thin wall at the back of the cell, panelled on its front.',
  geo: g => g.box(-0.5, -0.5, 0.36, 0.5, 0.5, 0.5, { tiles: { nz: T.PANEL, pz: T.ARMOR }, tile: T.METAL }) })
def({ id: 'pillar', name: 'Pillar', cat: 'Interior', shape: 'boxes', boxes: [[-0.16, -0.5, -0.16, 0.16, 0.5, 0.16]], mass: { large: 300, small: 12 }, hp: { large: 1500, small: 80 }, desc: 'A column: holds up a hangar roof.',
  geo(g) { g.box(-0.14, -0.5, -0.14, 0.14, 0.5, 0.14, { tile: T.METAL }); for (const y of [-0.5, 0.42]) g.box(-0.22, y, -0.22, 0.22, y + 0.08, 0.22, { tile: T.METAL, col: DARKC, paint: false }) } })
def({ id: 'railing', name: 'Railing', cat: 'Interior', shape: 'boxes', boxes: [[-0.5, -0.5, 0.42, 0.5, 0.0, 0.5]], mass: { large: 80, small: 5 }, hp: { large: 300, small: 30 }, desc: 'A rail along the back edge of the cell.',
  geo(g) { for (const x of [-0.48, -0.02, 0.44]) g.box(x, -0.5, 0.44, x + 0.04, 0.0, 0.48, np); g.box(-0.5, -0.04, 0.43, 0.5, 0.02, 0.49, { tile: T.METAL }); g.box(-0.5, -0.3, 0.45, 0.5, -0.27, 0.47, np) } })
def({ id: 'ladder', name: 'Ladder', cat: 'Interior', shape: 'boxes', boxes: [[-0.3, -0.5, 0.42, 0.3, 0.5, 0.5]], mass: { large: 60, small: 4 }, hp: { large: 250, small: 25 }, desc: 'Rungs on the back face of the cell.',
  geo(g) { for (const x of [-0.28, 0.24]) g.box(x, -0.5, 0.42, x + 0.04, 0.5, 0.47, np); for (let y = -0.4; y < 0.5; y += 0.2) g.box(-0.26, y, 0.43, 0.26, y + 0.03, 0.46, { tile: T.METAL, col: GOLD, paint: false }) } })
def({ id: 'bed', name: 'Bunk', cat: 'Interior', sizes: { large: [1, 1, 2] }, shape: 'boxes', boxes: [[-0.5, -0.5, -0.5, 0.5, -0.12, 1.5]], mass: { large: 300 }, hp: { large: 500 }, desc: 'A bunk for the crew quarters.',
  geo(g) { g.box(-0.45, -0.5, -0.5, 0.45, -0.3, 1.5, { tile: T.METAL }); g.box(-0.4, -0.3, -0.45, 0.4, -0.18, 1.45, { tile: T.PLAIN, col: [0.25, 0.4, 0.6], paint: false }); g.box(-0.34, -0.18, 1.05, 0.34, -0.1, 1.4, { tile: T.PLAIN, col: [0.9, 0.9, 0.88], paint: false }); g.box(-0.45, -0.3, 1.45, 0.45, 0.2, 1.5, { tile: T.METAL }) } })
def({ id: 'console', name: 'Console Desk', cat: 'Interior', shape: 'boxes', boxes: [[-0.5, -0.5, 0.0, 0.5, 0.05, 0.5]], mass: { large: 200, small: 15 }, hp: { large: 400, small: 40 }, desc: 'A desk with a lit screen: bridges and control rooms.',
  geo(g) { g.box(-0.5, -0.5, 0.05, 0.5, -0.1, 0.5, { tile: T.CARGO }); g.box(-0.5, -0.1, 0.0, 0.5, -0.04, 0.5, { tile: T.DASH, paint: false, emits: { py: 0.5 }, cols: { py: [1, 1, 1] } }); g.poly([[-0.42, -0.04, 0.42], [0.42, -0.04, 0.42], [0.42, 0.34, 0.5], [-0.42, 0.34, 0.5]], { tile: T.SCREEN, paint: false, emit: 0.9, double: true }) } })
def({ id: 'locker', name: 'Locker', cat: 'Interior', shape: 'boxes', boxes: [[-0.5, -0.5, 0.05, 0.5, 0.5, 0.5]], mass: { large: 200, small: 15 }, hp: { large: 500, small: 50 }, desc: 'A cabinet that holds 400 litres: part of the grid\'s cargo.', func: { inv: { large: 400, small: 80 }, cargo: { large: 0.4, small: 0.08 } },
  geo: g => g.box(-0.48, -0.5, 0.08, 0.48, 0.46, 0.5, { tiles: { nz: T.DOOR, px: T.METAL, nx: T.METAL, py: T.METAL, pz: T.METAL } }) })
def({ id: 'table', name: 'Table', cat: 'Interior', shape: 'boxes', boxes: [[-0.5, -0.5, -0.5, 0.5, -0.05, 0.5]], mass: { large: 120, small: 8 }, hp: { large: 300, small: 30 }, desc: 'A table for the mess.',
  geo(g) { g.box(-0.46, -0.13, -0.46, 0.46, -0.07, 0.46, { tile: T.METAL }); g.cyl('y', 0, -0.32, 0, 0.07, 0.38, { tile: T.PIPE, seg: 8, col: DARKC, paint: false }); g.cyl('y', 0, -0.48, 0, 0.26, 0.04, { tile: T.METAL, seg: 10, col: DARKC, paint: false }) } })
def({ id: 'sign', name: 'Display Screen', cat: 'Interior', shape: 'pane', mass: { large: 120, small: 8 }, hp: { large: 300, small: 30 }, desc: 'A wide lit screen on the back of the cell.', func: { light: { color: [0.3, 0.95, 0.85], range: 7, at: [0, 0, 0.2] } },
  geo(g) { g.box(-0.48, -0.3, 0.44, 0.48, 0.3, 0.5, { tile: T.DARK, col: DARKC, paint: false }); g.box(-0.44, -0.26, 0.42, 0.44, 0.26, 0.44, { tile: T.SCREEN, paint: false, emit: 1.0, skip: ['pz'] }) } })
def({ id: 'blastdoor', name: 'Blast Door', cat: 'Interior', sizes: { large: [1, 1, 1] }, shape: 'door', mass: { large: 3200 }, hp: { large: 9000 }, desc: 'A heavy armoured sliding door. Look at it and press F.', func: { door: true }, variant: b => b.open ? 'open' : '',
  geo(g, S, grid, st) { const f = 0.1, F = { tile: T.HEAVY }
    g.box(-0.5, -0.5, -0.16, 0.5, -0.5 + f, 0.16, F); g.box(-0.5, 0.5 - f, -0.16, 0.5, 0.5, 0.16, F); g.box(-0.5, -0.5 + f, -0.16, -0.5 + f, 0.5 - f, 0.16, F); g.box(0.5 - f, -0.5 + f, -0.16, 0.5, 0.5 - f, 0.16, F)
    const o = st === 'open' ? 0.38 : 0
    g.box(-0.4 - o, -0.4, -0.1, 0 - o, 0.4, 0.1, { tiles: { pz: T.HAZARD, nz: T.HAZARD }, tile: T.HEAVY, cols: { pz: [1, 1, 1], nz: [1, 1, 1] } }); g.box(0 + o, -0.4, -0.1, 0.4 + o, 0.4, 0.1, { tiles: { pz: T.HAZARD, nz: T.HAZARD }, tile: T.HEAVY, cols: { pz: [1, 1, 1], nz: [1, 1, 1] } }) } })
def({ id: 'hangar', name: 'Hangar Door Panel', cat: 'Interior', sizes: { large: [1, 1, 1] }, shape: 'hdoor', mass: { large: 900 }, hp: { large: 2400 }, desc: 'A panel of a big door, at the back of its cell. F opens every hangar panel on the grid together.', func: { door: true, hangar: true }, variant: b => b.open ? 'open' : '',
  geo(g, S, grid, st) { if (st === 'open') g.box(-0.5, 0.42, 0.34, 0.5, 0.5, 0.5, { tile: T.HAZARD, col: [1, 1, 1], paint: false }); else { g.box(-0.5, -0.5, 0.36, 0.5, 0.5, 0.5, { tiles: { nz: T.CARGO, pz: T.CARGO }, tile: T.METAL }); g.box(-0.5, -0.5, 0.34, 0.5, -0.38, 0.36, { tile: T.HAZARD, col: [1, 1, 1], paint: false, skip: ['pz'] }) } } })
def({ id: 'lightstrip', name: 'Light Strip', cat: 'Lights', shape: 'panel', mass: { large: 30, small: 4 }, hp: { large: 150, small: 20 }, desc: 'A long thin lamp on the face below.', func: { light: { color: [0.85, 0.95, 1], range: 11, at: [0, -0.3, 0] } },
  geo(g) { g.box(-0.5, -0.5, -0.07, 0.5, -0.45, 0.07, { tile: T.METAL }); g.box(-0.48, -0.45, -0.04, 0.48, -0.43, 0.04, { tile: T.LIGHT, col: [0.85, 0.95, 1], paint: false, emit: 2, skip: ['ny'] }) } })
def({ id: 'lightpanel', name: 'Light Panel', cat: 'Lights', shape: 'panel', mass: { large: 80, small: 8 }, hp: { large: 250, small: 30 }, desc: 'A whole face of soft light: ceilings.', func: { light: { color: [1, 0.97, 0.9], range: 18, at: [0, -0.2, 0] } },
  geo(g) { g.box(-0.5, -0.5, -0.5, 0.5, -0.44, 0.5, { tile: T.METAL }); g.box(-0.42, -0.44, -0.42, 0.42, -0.42, 0.42, { tile: T.LIGHT, paint: false, emit: 1.5, skip: ['ny'] }) } })
def({ id: 'warnlight', name: 'Warning Light', cat: 'Lights', shape: 'boxes', boxes: [[-0.2, -0.5, -0.2, 0.2, -0.1, 0.2]], mass: { large: 40, small: 5 }, hp: { large: 150, small: 20 }, desc: 'A flashing amber lamp: pads, doors, hazards.', func: { light: { color: [1, 0.6, 0.1], range: 14, blink: true, at: [0, -0.2, 0] } },
  geo(g) { g.cyl('y', 0, -0.46, 0, 0.2, 0.08, { tile: T.METAL, seg: 10, col: DARKC, paint: false }); g.cyl('y', 0, -0.3, 0, 0.14, 0.26, { tile: T.GLOW, col: [1, 0.6, 0.1], paint: false, emit: 2.2, seg: 10 }); g.cyl('y', 0, -0.16, 0, 0.15, 0.03, { tile: T.METAL, seg: 10, col: DARKC, paint: false }) } })
def({ id: 'turbine', name: 'Wind Turbine', cat: 'Power', sizes: { large: [1, 3, 1] }, shape: 'boxes', boxes: [[-0.2, -0.5, -0.2, 0.2, 2.5, 0.2]], mass: { large: 1400 }, hp: { large: 900 }, desc: 'Power from moving air: only on a world with an atmosphere, more in thicker air.', func: { power: { out: { large: 0.4 }, wind: true } },
  geo(g) { g.box(-0.4, -0.5, -0.4, 0.4, -0.3, 0.4, { tile: T.METAL }); g.cyl('y', 0, 0.9, 0, 0.1, 2.4, { r2: 0.06, tile: T.PIPE, seg: 8 }); g.box(-0.12, 2.0, -0.3, 0.12, 2.24, 0.3, { tile: T.METAL }); g.cyl('z', 0, 2.12, -0.36, 0.1, 0.14, { r2: 0.02, tile: T.METAL, seg: 8, col: GOLD, paint: false })
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; g.poly([[0, 2.12, -0.34], [Math.cos(a) * 0.2 - Math.sin(a) * 0.12, 2.12 + Math.sin(a) * 0.2 + Math.cos(a) * 0.12, -0.34], [Math.cos(a) * 1.3, 2.12 + Math.sin(a) * 1.3, -0.3], [Math.cos(a) * 0.2 + Math.sin(a) * 0.12, 2.12 + Math.sin(a) * 0.2 - Math.cos(a) * 0.12, -0.34]], { tile: T.PLAIN, col: [0.92, 0.92, 0.9], paint: false, double: true }) } } })
def({ id: 'dish', name: 'Comms Dish', cat: 'Utility', sizes: { large: [3, 3, 3] }, shape: 'boxes', boxes: [[0.5, -0.5, 0.5, 1.5, 1.2, 1.5]], mass: { large: 3200 }, hp: { large: 1600 }, desc: 'A big dish: its grid shows on helmet displays from far away.', func: { beacon: { range: 200000 } },
  geo(g) { g.box(0.4, -0.5, 0.4, 1.6, -0.2, 1.6, { tile: T.METAL }); g.cyl('y', 1, 0.3, 1, 0.16, 1.0, { tile: T.PIPE, seg: 8 }); g.cyl('y', 1, 1.25, 1, 0.2, 0.9, { r2: 1.45, tile: T.PLAIN, col: [0.9, 0.9, 0.88], paint: false, seg: 18, capA: false, capB: false, double: true }); g.cyl('y', 1, 1.7, 1, 0.04, 1.0, { tile: T.PIPE, seg: 6, col: DARKC, paint: false }); g.ball(1, 2.2, 1, 0.12, { tile: T.GLOW, col: TEAL, paint: false, emit: 1.5, seg: 3 }) } })

// ---------- grids and cells ----------
export function sizesOf(id) { const d = BLOCKS[id]; return Object.keys(d.sizes) }
export function hasSize(id, size) { return !!BLOCKS[id]?.sizes[size] }
// a block's geometry, built once per block, size and variant
const CACHE = new Map()
export function blockGeo(id, size, variant = '') {
  const k = id + '|' + size + '|' + variant
  let g = CACHE.get(k)
  if (!g) { const d = BLOCKS[id], geo = new Geo(); d.geo(geo, d.sizes[size], size, variant); g = geo.finish(); CACHE.set(k, g) }
  return g
}
