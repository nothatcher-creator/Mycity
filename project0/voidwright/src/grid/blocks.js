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
export const CATS = ['Hull', 'Windows', 'Control', 'Thrust', 'Power', 'Utility', 'Interior', 'Lights']
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
  panel: { name: 'Plate', full: BIT.ny, coll: 'panel', build: (g, t) => g.box(-0.5, -0.5, -0.5, 0.5, -0.38, 0.5, { tile: t, cull: true, cullPartial: true }) },
}
for (const [w, tile, mass, hp, label] of [['light', T.ARMOR, [500, 25], [1, 1], 'Light Hull'], ['heavy', T.HEAVY, [3300, 150], [6, 6], 'Heavy Hull']]) {
  for (const [k, s] of Object.entries(SHAPES)) {
    const frac = k === 'cube' ? 1 : k === 'panel' ? 0.15 : k === 'half' || k === 'halfslope' ? 0.5 : k === 'corner' ? 0.2 : k === 'inv' ? 0.8 : k === 'tip' ? 0.75 : 0.5
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
  func: { cockpit: { eye: [0, 0.12, 0.02], enclosed: true } },
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
  func: { cockpit: { eye: [1, 1.05, 2.0], enclosed: true } },
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
  const z0 = -0.5, z1 = sz - 0.5, L = z1 - z0
  // the mount plate (on the block it is built against)
  g.box(-0.5, -0.5, z0, sx - 0.5, sy - 0.5, z0 + L * 0.12, { tile: T.METAL, cull: sx === 1 && sy === 1 && sz === 1, cullPartial: true })
  if (kind === 'atmo') {
    g.cyl('z', cx, cy, z0 + L * 0.56, r, L * 0.88, { tile: T.RING, seg: 16, caps: false, double: true })
    g.cyl('z', cx, cy, z0 + L * 0.45, r * 0.96, 0.04, { tile: T.FAN, paint: false, capTile: T.FAN, seg: 16 })
    g.cyl('z', cx, cy, z0 + L * 0.42, r * 0.18, L * 0.5, { tile: T.METAL, col: DARKC, paint: false, seg: 8 })
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.box(cx + Math.cos(a) * r * 0.55 - 0.03, cy + Math.sin(a) * r * 0.55 - 0.03, z0 + L * 0.12, cx + Math.cos(a) * r * 0.55 + 0.03, cy + Math.sin(a) * r * 0.55 + 0.03, z0 + L * 0.45, { tile: T.METAL, col: DARKC, paint: false }) }
  } else if (kind === 'ion') {
    g.box(cx - r * 0.95, cy - r * 0.95, z0 + L * 0.12, cx + r * 0.95, cy + r * 0.95, z0 + L * 0.45, { tile: T.VENT })
    g.cyl('z', cx, cy, z0 + L * 0.72, r * 0.62, L * 0.55, { r2: r * 0.98, tile: T.RING, seg: 16, capA: false, capB: false, double: true })
    g.cyl('z', cx, cy, z0 + L * 0.98, r * 0.98, 0.05, { tile: T.GLOW, col: THR.ion.col, paint: false, emit: 1.6, seg: 16, caps: false, double: true })
    g.cyl('z', cx, cy, z0 + L * 0.5, r * 0.62, 0.04, { tile: T.CORE, paint: false, emit: 1.2, seg: 16, capA: false })
  } else {
    g.box(cx - r * 0.8, cy - r * 0.8, z0 + L * 0.12, cx + r * 0.8, cy + r * 0.8, z0 + L * 0.35, { tile: T.PIPE })
    g.cyl('z', cx, cy, z0 + L * 0.4, r * 0.5, L * 0.12, { tile: T.METAL, seg: 12, caps: false })
    g.cyl('z', cx, cy, z0 + L * 0.73, r * 0.4, L * 0.55, { r2: r, tile: T.NOZZLE, col: DARKC, paint: false, seg: 16, capA: false, capB: false, double: true })
    g.cyl('z', cx, cy, z0 + L * 0.47, r * 0.4, 0.04, { tile: T.CORE, col: [1, 0.6, 0.3], paint: false, emit: 1.0, seg: 12, capA: false })
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
  desc: 'Storage (holds ore and parts from round two).', func: { cargo: { large: 15.6, small: 0.125 } },
  geo: g => g.box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, { cull: true, tiles: { px: T.CARGO, nx: T.CARGO, pz: T.CARGO, nz: T.CARGO, py: T.STRIPE, ny: T.METAL } }) })
def({ id: 'cargo_l', name: 'Cargo Hold', cat: 'Utility', sizes: { large: [3, 3, 3], small: [5, 3, 5] }, shape: 'box', mass: { large: 4600, small: 400 }, hp: { large: 8000, small: 600 },
  desc: 'A big hold for ore and parts.', func: { cargo: { large: 421, small: 15.6 } },
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
  desc: 'A port to dock ships to stations (docking arrives in round three).', func: { connector: true },
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
