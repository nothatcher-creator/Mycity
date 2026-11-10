// Ready-made designs (the blueprints screen, and what each start puts round you), built here block by
// block so they are part of the code, not files. Hulls are drawn as solid shapes of cells and then
// "skinned": every outer edge gets the slope or corner piece that bevels it, so ships come out with clean
// chamfered lines. Working blocks are then set into and onto the hull.
import { rotFrom, apply, ROTS as ROTM } from '../grid/rot.js'
import { BLOCKS } from '../grid/blocks.js'

// push: the direction the block pushes its grid (for thrusters) / faces (others); up: its top
const R = (push = [0, 0, -1], up = [0, 1, 0]) => rotFrom(push, up)
const F = R(), BK = R([0, 0, 1]), UPR = R([0, 1, 0], [0, 0, 1]), DNR = R([0, -1, 0], [0, 0, 1]), LF = R([-1, 0, 0]), RT = R([1, 0, 0])
const UPSIDE = R([0, 0, -1], [0, -1, 0])
const isHull = id => id.startsWith('light_') || id.startsWith('heavy_') || id.startsWith('hull_')

class BP {
  constructor(name, size, o = {}) { this.bp = { name, size, static: !!o.static, ground: !!o.ground, blocks: [], desc: o.desc || '' } }
  set(id, i, j, k, rot = 0, color = 0) { this.bp.blocks.push([id, i, j, k, rot, color]); return this }
  fill(id, i0, i1, j0, j1, k0, k1, rot = 0, color = 0) { for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) this.set(id, i, j, k, rot, color); return this }
  // working blocks replace the hull they overlap
  over(id, i, j, k, rot = 0, color = 0) {
    this.bp.blocks = this.bp.blocks.filter(x => !isHull(x[0]) || !this.covers(id, i, j, k, rot, x[1], x[2], x[3]))
    return this.set(id, i, j, k, rot, color)
  }
  covers(id, i, j, k, rot, x, y, z) {
    const S = BLOCKS[id].sizes[this.bp.size], M = ROTM[rot]
    for (let a = 0; a < S[0]; a++) for (let b = 0; b < S[1]; b++) for (let c = 0; c < S[2]; c++) {
      if (i + M[0] * a + M[1] * b + M[2] * c === x && j + M[3] * a + M[4] * b + M[5] * c === y && k + M[6] * a + M[7] * b + M[8] * c === z) return true
    }
    return false
  }
  clear(x, y, z) { this.bp.blocks = this.bp.blocks.filter(b => !(b[1] === x && b[2] === y && b[3] === z)); return this }
}

// ---- a hull as a set of cells, and its skin ----
class Shape {
  constructor() { this.c = new Map() }
  add(x, y, z, col = 0) { this.c.set(x + ',' + y + ',' + z, [x, y, z, col]); return this }
  del(x, y, z) { this.c.delete(x + ',' + y + ',' + z); return this }
  has(x, y, z) { return this.c.has(x + ',' + y + ',' + z) }
  box(x0, x1, y0, y1, z0, z1, col = 0) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.add(x, y, z, col); return this }
  cut(x0, x1, y0, y1, z0, z1) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.del(x, y, z); return this }
  // mirrored left and right
  sym(x0, x1, y0, y1, z0, z1, col = 0) { this.box(x0, x1, y0, y1, z0, z1, col); return this.box(-x1, -x0, y0, y1, z0, z1, col) }
  paint(fn) { for (const c of this.c.values()) { const v = fn(c[0], c[1], c[2], c[3]); if (v != null) c[3] = v } return this }
}
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 0, -1], [0, 0, 1]]
function skin(b, s, weight = 'light', o = {}) {
  const eq = (a, v) => a[0] === v[0] && a[1] === v[1] && a[2] === v[2]
  for (const [x, y, z, col] of s.c.values()) {
    const U = s.has(x, y + 1, z), D = s.has(x, y - 1, z)
    const open = DIRS.filter(d => !s.has(x + d[0], y, z + d[2])), backed = d => s.has(x - d[0], y, z - d[2])
    if (U && D && !open.length) { if (o.solid) b.set(`${weight}_cube`, x, y, z, 0, col); continue }
    let id = 'cube', rot = 0
    const perp = open.length === 2 && open[0][0] * open[1][0] + open[0][2] * open[1][2] === 0 && backed(open[0]) && backed(open[1])
    const up = !U && D ? [0, 1, 0] : !D && U ? [0, -1, 0] : null
    if (up && !o.blocky) {
      if (open.length === 1 && backed(open[0])) { id = 'slope'; rot = rotFrom(open[0], up) }
      else if (perp) {
        // the corner piece opens toward its -z, its -x and its top
        for (const [a, c] of [[open[0], open[1]], [open[1], open[0]]]) { const r = rotFrom(a, up); if (eq(apply(r, -1, 0, 0, [0, 0, 0]), c)) { id = 'corner'; rot = r } }
      }
    } else if (U && D && perp && !o.blocky) { id = 'slope'; rot = rotFrom(open[0], open[1]) }
    b.set(`${weight}_${id}`, x, y, z, rot, col)
  }
  return b
}

// ---- Sparrow: a small-grid scout that flies on Halvor and in space ----
function sparrowHull(P, A) {
  const s = new Shape()
  s.box(-2, 2, 0, 2, -6, 5, P)                       // the body
  s.box(-2, 2, 0, 1, -7, -7, P).box(-1, 1, 0, 1, -8, -8, P).box(0, 0, 0, 0, -9, -9, P)   // the nose
  for (let x = 3; x <= 6; x++) for (let z = -1 + Math.floor((x - 3) / 2); z <= 3; z++) { s.add(x, 1, z, x === 6 ? A : P); s.add(-x, 1, z, x === 6 ? A : P) }  // swept wings
  s.sym(2, 2, 3, 3, 3, 5, A).sym(2, 2, 4, 4, 4, 5, A)   // tail fins
  s.paint((x, y, z, c) => y === 1 && Math.abs(x) === 2 && z > -6 ? A : null)                // a stripe down each side
  return s
}
function sparrowParts(b, P) {
  // the canopy and its shoulders, the deck behind it
  b.set('canopy', -1, 3, -5, 0, 2)
  for (const x of [-2, 2]) for (let z = -5; z <= -1; z++) b.set('light_slope', x, 3, z, R([x < 0 ? -1 : 1, 0, 0]), P)
  for (let x = -1; x <= 1; x++) for (let z = 0; z <= 5; z++) b.set(z === 5 ? 'light_halfslope' : 'light_panel', x, 3, z, z === 5 ? R([0, 0, 1]) : 0, P)
  // thrust: main drive, lift, brakes, sides
  b.set('thr_h2_small', -1, 1, 6, F, 2).set('thr_h2_small', 1, 1, 6, F, 2)
  b.over('thr_atmo_small', -2, 1, -3, UPR, 2).over('thr_atmo_small', 1, 1, -3, UPR, 2).over('thr_atmo_small', -2, 1, 2, UPR, 2).over('thr_atmo_small', 1, 1, 2, UPR, 2)
  b.set('thr_h2_small', -5, 0, 1, UPR, 2).set('thr_h2_small', 5, 0, 1, UPR, 2)
  b.set('thr_h2_small', -1, 4, 3, DNR, 2).set('thr_h2_small', 1, 4, 3, DNR, 2)
  b.set('thr_h2_small', -2, 0, -8, BK, 2).set('thr_h2_small', 2, 0, -8, BK, 2)
  b.set('thr_h2_small', -7, 1, 1, RT, 2).set('thr_h2_small', 7, 1, 1, LF, 2)
  b.over('gyro', 0, 1, 0).over('gyro', 0, 2, 0).over('battery', 0, 1, 4).over('battery', 0, 2, 4).over('core_small', 0, 1, 5)
  b.over('tank_h2', -1, 3, 0, 0, 1).over('tank_o2', 0, 1, -4, 0, 1)
  b.set('gear', -2, -1, -5, 0).set('gear', 1, -1, -5, 0).set('gear', -2, -1, 4, 0).set('gear', 1, -1, 4, 0)
  b.set('flood', 0, 0, -10, 0).set('lightstrip', -6, 2, 2, 0).set('lightstrip', 6, 2, 2, 0)
}
function sparrow() {
  const b = new BP('Sparrow', 'small', { desc: 'Small-grid scout: atmos and fuel thrusters, flies anywhere.' })
  skin(b, sparrowHull(6, 3), 'light', { solid: true })
  sparrowParts(b, 6)
  return b.bp
}
// ---- Pick: the scout's frame with two drills and room for ore ----
function pick() {
  const b = new BP('Pick', 'small', { desc: 'Small-grid miner: two drills at the nose (hold the left button in the seat).' })
  const s = sparrowHull(4, 2)
  s.sym(3, 5, 0, 2, -3, -2, 4)        // shoulders to carry the drills
  skin(b, s, 'light', { solid: true })
  sparrowParts(b, 4)
  b.set('drill', -5, 0, -7, F, 2).set('drill', 3, 0, -7, F, 2)
  b.over('cargo_s', -1, 2, -2, 0, 4).over('cargo_s', 1, 2, -2, 0, 4).over('cargo_s', -1, 2, 2, 0, 4).over('cargo_s', 1, 2, 2, 0, 4)
  return b.bp
}

// ---- Mule: a large-grid utility ship with a cargo hold ----
function mule() {
  const b = new BP('Mule', 'large', { desc: 'Large-grid utility hauler: atmos lift, fuel thrusters for space, a cargo hold.' })
  const P = 4, A = 2
  const s = new Shape()
  s.box(-2, 2, 0, 2, -5, 4, P).box(-2, 2, 0, 1, -6, -6, P)
  s.box(-1, 1, 3, 3, 1, 4, A)                                   // the engine hump
  s.paint((x, y, z, c) => y === 1 && Math.abs(x) === 2 ? A : null)
  skin(b, s, 'light', { solid: true })
  b.over('cockpit', 0, 2, -5, 0, 2).over('window_slope', -1, 2, -5, R([0, 0, -1]), 1).over('window_slope', 1, 2, -5, R([0, 0, -1]), 1)
  b.over('cargo_l', -1, 0, 0, 0, P).over('gravgen', 0, 0, -4)
  b.set('tank_h2', -1, 3, -3, 0, 1)
  for (const [x, z] of [[-2, -3], [2, -3], [-2, 3], [2, 3], [0, -3], [0, 3], [-2, 0], [2, 0]]) b.set('thr_atmo_small', x, -1, z, UPR, 1)
  for (const [x, z] of [[-1, -1], [1, -1]]) b.over('thr_h2_small', x, 0, z, UPR, 1)
  b.set('thr_h2_small', -1, 1, 5, F, 1).set('thr_h2_small', 1, 1, 5, F, 1).set('thr_h2_small', -2, 0, 5, F, 1).set('thr_h2_small', 2, 0, 5, F, 1)
  b.set('thr_h2_small', -2, 1, -7, BK, 1).set('thr_h2_small', 2, 1, -7, BK, 1)
  b.set('thr_h2_small', -2, 3, 2, DNR, 1).set('thr_h2_small', 2, 3, 2, DNR, 1)
  b.set('thr_h2_small', -3, 1, 0, RT, 1).set('thr_h2_small', 3, 1, 0, LF, 1)
  b.over('gyro', -2, 1, 2).over('gyro', 2, 1, 2).over('battery', -2, 1, 3).over('battery', 2, 1, 3).over('core_small', 0, 2, 4)
  b.over('porthole', -2, 1, -2, R([1, 0, 0]), P).over('porthole', 2, 1, -2, R([1, 0, 0]), P)
  b.set('gear', -2, -1, -1, 0).set('gear', 2, -1, -1, 0).set('gear', -2, -1, 1, 0).set('gear', 2, -1, 1, 0)
  b.set('flood', -1, 0, -7, 0).set('flood', 1, 0, -7, 0).set('beacon', 0, 4, 3, 0).set('warnlight', 0, 3, 0, 0)
  return b.bp
}

// ---- Mole: a large-grid mining ship: a rock crusher between two drills ----
function mole() {
  const b = new BP('Mole', 'large', { desc: 'Large-grid miner: a rock crusher between two drills, two cargo holds. Hold the left button in the seat to dig.' })
  const P = 4, A = 2
  const s = new Shape()
  s.box(-4, 4, 0, 3, -2, 8, P)
  s.box(-1, 1, 4, 4, -2, 2, A)                                   // the bridge
  s.paint((x, y, z, c) => (y === 3 && (Math.abs(x) === 4 || z === 8)) ? A : null)
  skin(b, s, 'heavy', { solid: false })
  // the tools across the front
  b.set('drill', -4, 0, -5, F, 2).set('crusher', -1, 0, -4, F, 2).set('drill', 2, 0, -5, F, 2)
  for (let x = -4; x <= 4; x++) b.over('hull_hazard', x, 3, -2, 0, 0)
  b.over('cockpit', 0, 4, -2, 0, 2).over('window_slope', -1, 4, -2, R([0, 0, -1]), 1).over('window_slope', 1, 4, -2, R([0, 0, -1]), 1)
  b.over('cargo_l', -4, 0, -1, 0, P).over('cargo_l', 2, 0, -1, 0, P).over('tank_h2', -1, 0, -1, 0, 1)
  // lift: four big fans and a big fuel engine; drive, brakes, sides, down
  b.over('thr_atmo_big', -4, 2, 2, UPR, 1).over('thr_atmo_big', 2, 2, 2, UPR, 1).over('thr_atmo_big', -4, 2, 5, UPR, 1).over('thr_atmo_big', 2, 2, 5, UPR, 1)
  b.over('thr_h2_big', -1, 3, 3, UPR, 1)
  for (const x of [-3, -1, 1, 3]) b.set('thr_h2_small', x, 1, 9, F, 1)
  b.set('thr_h2_small', -3, 3, 9, F, 1).set('thr_h2_small', 3, 3, 9, F, 1)
  b.set('thr_h2_small', -4, 3, -3, BK, 1).set('thr_h2_small', 4, 3, -3, BK, 1).set('thr_h2_small', -2, 3, -3, BK, 1).set('thr_h2_small', 2, 3, -3, BK, 1)
  b.set('thr_h2_small', -5, 3, 4, RT, 1).set('thr_h2_small', 5, 3, 4, LF, 1).set('thr_h2_small', -5, 3, 7, RT, 1).set('thr_h2_small', 5, 3, 7, LF, 1)
  b.set('thr_h2_small', -3, 4, 6, DNR, 1).set('thr_h2_small', 3, 4, 6, DNR, 1)
  b.over('gyro', -3, 3, 8).over('gyro', 3, 3, 8).over('gyro', -1, 3, 8).over('gyro', 1, 3, 8)
  b.over('battery', -2, 3, 8).over('battery', 2, 3, 8).over('core_small', 0, 3, 8).over('core_small', 0, 3, 7).over('gravgen', 0, 3, 1)
  b.set('detector', 0, 5, 1, 0).set('beacon', 0, 4, 4, 0).set('warnlight', -4, 4, -2, 0).set('warnlight', 4, 4, -2, 0)
  b.set('flood', -3, 4, -1, 0).set('flood', 3, 4, -1, 0)
  b.set('gear', -4, -1, -2, 0).set('gear', 4, -1, -2, 0).set('gear', -4, -1, 8, 0).set('gear', 4, -1, 8, 0).set('gear', 0, -1, 8, 0)
  return b.bp
}

// ---- Lancer: an ion/fuel explorer with a jump drive ----
function lancer() {
  const b = new BP('Lancer', 'large', { desc: 'Long-range explorer: ion drives for space, a jump drive (J) for crossing between groups of worlds.' })
  const P = 12, A = 7
  const s = new Shape()
  s.box(-2, 2, 0, 2, -7, 6, P).box(-2, 2, 0, 1, -8, -8, P).box(-1, 1, 0, 1, -9, -9, P)
  s.box(-1, 1, 3, 3, -2, 6, P)                                   // the spine
  s.sym(3, 4, 1, 1, 2, 6, A).sym(5, 5, 1, 1, 4, 6, A)             // stub wings
  s.paint((x, y, z, c) => y === 1 && Math.abs(x) === 2 ? A : null)
  skin(b, s, 'light', { solid: true })
  b.over('cockpit', 0, 2, -7, 0, 7).over('window_slope', -1, 2, -7, R([0, 0, -1]), 1).over('window_slope', 1, 2, -7, R([0, 0, -1]), 1)
  b.over('jumpdrive', -1, 0, 1, 0, 0)
  b.over('core_small', 0, 1, -2).over('core_small', 0, 1, -3)
  b.over('gyro', -1, 1, 5).over('gyro', 1, 1, 5).over('gyro', -1, 2, 5).over('gyro', 1, 2, 5)
  b.over('battery', -2, 2, -1).over('battery', 2, 2, -1).over('battery', -2, 2, 4).over('battery', 2, 2, 4)
  b.over('gravgen', 0, 0, -5).over('medbay', -1, 0, -6, 0, 3).over('survival_kit', 1, 0, -6, 0, 3)
  for (const z of [-5, -3, 0]) b.over('porthole', -2, 1, z, R([1, 0, 0]), P).over('porthole', 2, 1, z, R([1, 0, 0]), P)
  b.set('thr_ion_small', -2, 0, 7, F, 1).set('thr_ion_small', 2, 0, 7, F, 1).set('thr_ion_small', -2, 2, 7, F, 1).set('thr_ion_small', 2, 2, 7, F, 1)
  b.set('thr_h2_small', 0, 1, 7, F, 1).set('thr_h2_small', 0, 3, 7, F, 1).set('thr_ion_small', -4, 1, 7, F, 1).set('thr_ion_small', 4, 1, 7, F, 1)
  for (const [x, z] of [[-2, -4], [2, -4], [-2, 4], [2, 4], [0, -4], [0, 4]]) b.over('thr_h2_small', x, 0, z, UPR, 1)
  b.set('thr_ion_small', -2, 1, -9, BK, 1).set('thr_ion_small', 2, 1, -9, BK, 1)
  b.set('thr_ion_small', -1, 4, -2, DNR, 1).set('thr_ion_small', 1, 4, -2, DNR, 1)
  b.set('tank_h2', -1, 4, -1, 0, 1)
  b.set('thr_ion_small', -3, 1, -3, RT, 1).set('thr_ion_small', 3, 1, -3, LF, 1).set('thr_ion_small', -6, 1, 5, RT, 1).set('thr_ion_small', 6, 1, 5, LF, 1)
  b.set('gear', -2, -1, -2, 0).set('gear', 2, -1, -2, 0).set('gear', -2, -1, 2, 0).set('gear', 2, -1, 2, 0)
  b.set('antenna', 0, 4, 4, 0).set('flood', 0, 0, -10, 0).set('detector', 0, 4, 2, 0)
  return b.bp
}

// ---- Kestrel: an orbital station: a landing pad between a hall and a hangar, a tower, solar wings ----
function kestrel() {
  const b = new BP('Kestrel Station', 'large', { static: true, desc: 'A station: a pad to land on, a hall with a workshop and med bay, a hangar, a control tower.' })
  // the pad, edged in warning stripes
  for (let i = -6; i <= 6; i++) for (let k = -6; k <= 6; k++) b.set(Math.abs(i) === 6 || Math.abs(k) === 6 ? 'hull_hazard' : (i + k) % 2 ? 'hull_grate' : 'light_cube', i, 0, k, 0, 1)
  // the hall at one end
  for (let i = -6; i <= 6; i++) for (let k = 7; k <= 11; k++) for (let j = 0; j <= 4; j++) {
    const edge = Math.abs(i) === 6 || k === 11 || j === 0 || j === 4
    if (!edge && k !== 7) continue
    if (k === 7 && j >= 1 && j <= 3 && Math.abs(i) <= 1) continue // the doorway
    b.set(j === 4 ? 'heavy_cube' : j === 0 ? 'hull_grate' : 'light_cube', i, j, k, 0, j === 4 ? 2 : 0)
  }
  for (let i = -5; i <= 5; i += 2) b.over('window', i, 2, 11, 0, 0)
  for (const i of [-4, 3]) b.over('porthole', i, 2, 7, 0, 0).over('porthole', i + 1, 2, 7, 0, 0)
  b.over('door', 0, 1, 7, 0).over('medbay', -4, 1, 9, 0, 3).over('gravgen', 4, 1, 10).over('battery', 5, 1, 10).over('battery', 5, 2, 10).over('core_small', 5, 1, 9)
  b.set('survival_kit', -2, 1, 10, R([0, 0, -1]), 3).set('refinery', 1, 1, 8, 0, 1).set('assembler', -1, 1, 10, R([0, 0, -1]), 1).set('o2h2', 3, 1, 8, 0, 1)
  b.set('tank_o2', -5, 1, 8, 0).set('cargo_s', -3, 1, 8, 0, 4).set('locker', -5, 1, 10, 0, 4).set('console', -3, 1, 10, 0, 0)
  for (let i = -4; i <= 4; i += 4) b.set('lightpanel', i, 3, 9, UPSIDE)
  // the hangar at the other end: open to the pad behind a door of panels
  for (let i = -5; i <= 5; i++) for (let k = -11; k <= -7; k++) for (let j = 0; j <= 4; j++) {
    const edge = Math.abs(i) === 5 || k === -11 || j === 0 || j === 4
    if (!edge || (k === -7 && j > 0)) continue
    b.set(j === 4 ? 'heavy_cube' : j === 0 ? 'hull_grate' : 'light_cube', i, j, k, 0, j === 4 ? 2 : 0)
  }
  for (let i = -5; i <= 5; i++) for (let j = 1; j <= 4; j++) if (!(j <= 3 && Math.abs(i) <= 3)) b.set(j === 4 ? 'heavy_cube' : 'light_cube', i, j, -7, 0, j === 4 ? 2 : 0)
  for (let i = -3; i <= 3; i++) for (let j = 1; j <= 3; j++) b.set('hangar', i, j, -7, R([0, 0, 1]), 4)
  b.set('lightpanel', -1, 3, -9, UPSIDE).set('lightpanel', 1, 3, -9, UPSIDE).set('tank_h2', -4, 1, -10, 0, 1).set('cargo_l', 2, 1, -10, 0, 4)
  // the tower on the hall, with the dish
  for (let i = -5; i <= -3; i++) for (let k = 8; k <= 10; k++) for (let j = 5; j <= 8; j++) {
    if (i === -4 && k === 9 && j < 8) continue
    b.set(j === 6 && !(i !== -4 && k !== 9) ? 'window' : j === 8 ? 'heavy_cube' : 'light_cube', i, j, k, j === 6 ? (i === -5 ? R([-1, 0, 0]) : i === -3 ? R([1, 0, 0]) : k === 8 ? R([0, 0, -1]) : R([0, 0, 1])) : 0, j === 8 ? 2 : 0)
  }
  b.set('dish', -5, 9, 8, 0, 0)
  // masts, lights and solar wings
  b.set('beacon', -6, 1, -6, 0).set('antenna', 6, 1, -6, 0)
  for (const [x, z] of [[-6, -2], [6, -2], [-6, 2], [6, 2]]) b.set('flood', x, 1, z, R(x < 0 ? [1, 0, 0] : [-1, 0, 0]))
  for (const [x, z] of [[-6, 6], [6, 6], [-6, -5], [6, -5]]) b.set('warnlight', x, 1, z, 0)
  for (const i of [-1, 3]) for (const k of [7, 9]) b.set('solar', i, 5, k, 0)
  for (const side of [-1, 1]) { for (let x = 7; x <= 12; x++) b.set('girder', side * x, 0, 0, 0, 0); for (const k of [-3, -1, 1, 3]) b.set('solar', side > 0 ? 8 : -11, 1, k < 0 ? k - 1 : k, 0) ; for (let k = -4; k <= 4; k++) for (let x = 8; x <= 11; x++) if (k !== 0) b.set('girder', side * x, 0, k, 0, 0) }
  return b.bp
}

// ---- Foothold: an outpost on the ground ----
function foothold() {
  const b = new BP('Foothold Outpost', 'large', { static: true, ground: true, desc: 'A ground base: a pad, a hut with a med bay, a workshop, power and a beacon.' })
  for (let i = -4; i <= 4; i++) for (let k = -4; k <= 4; k++) b.set(Math.abs(i) === 4 || Math.abs(k) === 4 ? 'hull_hazard' : 'heavy_cube', i, 0, k, 0, (i + k) % 2 ? 1 : 2)
  for (let i = -4; i <= 4; i++) { b.set('light_slope', i, 0, -5, R([0, 0, -1]), 1); b.set('light_slope', i, 0, 5, R([0, 0, 1]), 1) }
  for (let k = -4; k <= 4; k++) { b.set('light_slope', -5, 0, k, R([-1, 0, 0]), 1); b.set('light_slope', 5, 0, k, R([1, 0, 0]), 1) }
  // the hut
  for (let i = 1; i <= 4; i++) for (let k = 1; k <= 4; k++) for (let j = 1; j <= 3; j++) {
    const wall = i === 1 || i === 4 || k === 1 || k === 4 || j === 3
    if (!wall) continue
    if (i === 1 && k === 2 && j === 1) continue
    b.set(j === 3 ? 'heavy_cube' : 'light_cube', i, j, k, 0, j === 3 ? 2 : 9)
  }
  b.set('door', 1, 1, 2, R([1, 0, 0]))
  b.over('window', 4, 2, 3, R([1, 0, 0])).over('window', 2, 2, 4, R([0, 0, 1])).over('porthole', 1, 2, 3, R([1, 0, 0]), 9)
  b.set('medbay', 2, 1, 2, 0, 3).set('battery', 3, 1, 3).set('lightpanel', 3, 2, 2, UPSIDE).set('survival_kit', 3, 1, 2, R([-1, 0, 0]), 3)
  b.set('solar', -4, 1, -4, 0).set('solar', -4, 1, -1, 0).set('beacon', -1, 1, 3, 0).set('flood', 4, 1, -4, R([0, 0, -1]))
  b.set('refinery', 1, 1, -4, 0, 1).set('assembler', 3, 1, -2, R([0, 0, 1]), 1).set('o2h2', 4, 1, -2, 0, 1).set('tank_o2', 0, 1, -4, 0).set('tank_h2', -4, 1, 1, 0, 1)
  b.set('cargo_s', 0, 1, -1, 0, 4).set('core_small', 0, 1, -2, 0)
  b.set('turbine', 0, 1, 4, 0).set('detector', -1, 1, 1, 0).set('warnlight', -4, 1, 4, 0).set('warnlight', 4, 1, 0, 0).set('dish', 1, 4, 1, 0, 0)
  return b.bp
}

export const PREFABS = { sparrow, pick, mule, mole, lancer, kestrel, foothold }
export const PREFAB_LIST = ['sparrow', 'pick', 'mule', 'mole', 'lancer', 'kestrel', 'foothold']
const cache = {}
export function prefab(id) { return cache[id] || (cache[id] = PREFABS[id]()) }
