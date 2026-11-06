// Ready-made designs (the blueprints screen, and what each start puts round you), built here block by
// block so they are part of the code, not files: a small-grid scout, a large-grid utility ship, a jump-
// capable explorer, an orbital station and a ground outpost.
import { rotFrom } from '../grid/rot.js'
import { BLOCKS } from '../grid/blocks.js'

// push: the direction the block pushes its grid (for thrusters) / faces (others); up: its top
const R = (push = [0, 0, -1], up = [0, 1, 0]) => rotFrom(push, up)
const F = R(), BK = R([0, 0, 1]), UPR = R([0, 1, 0], [0, 0, 1]), DNR = R([0, -1, 0], [0, 0, 1]), LF = R([-1, 0, 0]), RT = R([1, 0, 0])
const UPSIDE = R([0, 0, -1], [0, -1, 0])

class BP {
  constructor(name, size, o = {}) { this.bp = { name, size, static: !!o.static, ground: !!o.ground, blocks: [], desc: o.desc || '' }; this.used = new Set() }
  set(id, i, j, k, rot = 0, color = 0) { this.bp.blocks.push([id, i, j, k, rot, color]); return this }
  fill(id, i0, i1, j0, j1, k0, k1, rot = 0, color = 0) { for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) this.set(id, i, j, k, rot, color); return this }
  // the hull is laid first and functional blocks replace what they overlap
  over(id, i, j, k, rot = 0, color = 0) {
    const b = this.bp.blocks
    this.bp.blocks = b.filter(x => !(x[0].startsWith('light_') || x[0].startsWith('heavy_')) || !this.covers(id, i, j, k, rot, x[1], x[2], x[3]))
    return this.set(id, i, j, k, rot, color)
  }
  covers(id, i, j, k, rot, x, y, z) {
    const S = BLOCKS[id].sizes[this.bp.size]
    // footprint (same as Grid.footprint)
    const M = ROTM[rot]
    for (let a = 0; a < S[0]; a++) for (let b = 0; b < S[1]; b++) for (let c = 0; c < S[2]; c++) {
      const vx = M[0] * a + M[1] * b + M[2] * c, vy = M[3] * a + M[4] * b + M[5] * c, vz = M[6] * a + M[7] * b + M[8] * c
      if (i + vx === x && j + vy === y && k + vz === z) return true
    }
    return false
  }
}
import { ROTS as ROTM } from '../grid/rot.js'

// ---- Sparrow: a small-grid scout that flies on Halvor and in space ----
function sparrow() {
  const b = new BP('Sparrow', 'small', { desc: 'Small-grid scout: atmos and fuel thrusters, flies anywhere.' })
  const W = 6, P = 6
  b.fill('light_cube', -2, 2, 0, 2, -5, 5, 0, P)
  // nose slopes
  for (let i = -2; i <= 2; i++) { b.set('light_slope', i, 2, -6, R([0, 0, -1]), P); b.set('light_cube', i, 0, -6, 0, P); b.set('light_cube', i, 1, -6, 0, P); b.set('light_slope', i, 1, -7, R([0, 0, -1]), P); b.set('light_halfslope', i, 0, -7, R([0, 0, -1]), P) }
  // wings
  for (const s of [-1, 1]) for (let x = 3; x <= 6; x++) for (let z = -1; z <= 3; z++) {
    const i = s * x
    if (x === 6 && z === -1) continue
    b.set(x === 6 || z === -1 ? 'light_panel' : 'light_cube', i, 1, z, 0, x === 6 ? 4 : P)
  }
  // canopy on top, toward the nose
  b.set('canopy', -1, 3, -5, 0, 2)
  for (const x of [-2, 2]) for (let z = -5; z <= -1; z++) b.set('light_slope', x, 3, z, x < 0 ? R([0, 0, -1], [0, 1, 0]) : R([0, 0, -1]), P)
  for (let x = -2; x <= 2; x++) for (let z = 0; z <= 5; z++) b.set(z === 5 ? 'light_halfslope' : 'light_panel', x, 3, z, z === 5 ? R([0, 0, 1]) : 0, P)
  // thrusters: main drive, lift, brakes, sides
  b.over('thr_h2_small', -1, 1, 6, F, 2); b.over('thr_h2_small', 1, 1, 6, F, 2)
  b.over('thr_atmo_small', -2, 1, -3, UPR, 2).over('thr_atmo_small', 1, 1, -3, UPR, 2)
  b.over('thr_atmo_small', -2, 1, 2, UPR, 2).over('thr_atmo_small', 1, 1, 2, UPR, 2)
  b.over('thr_h2_small', -5, 0, 1, UPR, 2).over('thr_h2_small', 5, 0, 1, UPR, 2)
  b.over('thr_h2_small', -1, 4, 3, DNR, 2).over('thr_h2_small', 1, 4, 3, DNR, 2)
  b.over('thr_h2_small', -2, 0, -8, BK, 2).over('thr_h2_small', 2, 0, -8, BK, 2)
  b.over('thr_h2_small', -7, 1, 1, RT, 2).over('thr_h2_small', 7, 1, 1, LF, 2)
  b.over('gyro', 0, 1, 0).over('gyro', 0, 2, 0).over('battery', 0, 1, 4).over('battery', 0, 2, 4).over('core_small', 0, 1, 5)
  b.over('gear', -2, -1, -5, 0).over('gear', 1, -1, -5, 0).over('gear', -2, -1, 4, 0).over('gear', 1, -1, 4, 0)
  b.over('flood', 0, 0, -8, 0).over('lamp', -6, 2, 1, UPSIDE, 0).over('lamp', 6, 2, 1, UPSIDE, 0)
  return b.bp
}

// ---- Mule: a large-grid utility ship with a cargo hold ----
function mule() {
  const b = new BP('Mule', 'large', { desc: 'Large-grid utility hauler: atmos lift, fuel thrusters for space, a cargo hold.' })
  const P = 4
  b.fill('light_cube', -2, 2, 0, 2, -4, 4, 0, P)
  for (let i = -2; i <= 2; i++) { b.set('light_slope', i, 2, -5, R([0, 0, -1]), P); b.set('light_cube', i, 1, -5, 0, P); b.set('light_cube', i, 0, -5, 0, P); b.set('light_halfslope', i, 0, -6, R([0, 0, -1]), P) }
  // a cockpit at the front of the upper deck, the hold behind
  b.over('cockpit', 0, 2, -5, 0, 2)
  b.over('window_slope', -1, 2, -5, R([0, 0, -1]), 1).over('window_slope', 1, 2, -5, R([0, 0, -1]), 1)
  b.over('cargo_l', -1, 0, 0, 0, P)
  // thrust: atmos lift underneath, fuel thrusters for space, all six ways
  for (const [x, z] of [[-2, -3], [2, -3], [-2, 3], [2, 3], [0, -3], [0, 3], [-2, 0], [2, 0]]) b.set('thr_atmo_small', x, -1, z, UPR, 1)
  for (const [x, z] of [[-1, -1], [1, -1]]) b.over('thr_h2_small', x, 0, z, UPR, 1)
  b.set('thr_h2_small', -1, 1, 5, F, 1).set('thr_h2_small', 1, 1, 5, F, 1).set('thr_h2_small', -2, 0, 5, F, 1).set('thr_h2_small', 2, 0, 5, F, 1)
  b.set('thr_h2_small', -2, 1, -7, BK, 1).set('thr_h2_small', 2, 1, -7, BK, 1)
  b.set('thr_h2_small', -1, 3, 2, DNR, 1).set('thr_h2_small', 1, 3, 2, DNR, 1)
  b.set('thr_h2_small', -4, 1, 0, RT, 1).set('thr_h2_small', 4, 1, 0, LF, 1)
  b.over('gyro', -2, 1, 2).over('gyro', 2, 1, 2).over('battery', -2, 1, 3).over('battery', 2, 1, 3).over('core_small', 0, 2, 4)
  b.over('gravgen', 0, 0, -4)
  b.set('gear', -2, -1, -1, 0).set('gear', 2, -1, -1, 0).set('gear', -2, -1, 1, 0).set('gear', 2, -1, 1, 0)
  b.set('flood', -1, 0, -7, 0).set('flood', 1, 0, -7, 0).set('beacon', 0, 3, 3, 0)
  return b.bp
}

// ---- Lancer: an ion/fuel explorer with a jump drive ----
function lancer() {
  const b = new BP('Lancer', 'large', { desc: 'Long-range explorer: ion drives for space, a jump drive (J) for crossing the system.' })
  const P = 12
  b.fill('light_cube', -2, 2, 0, 2, -6, 6, 0, P)
  for (let i = -2; i <= 2; i++) { b.set('light_slope', i, 2, -7, R([0, 0, -1]), P); b.set('light_cube', i, 1, -7, 0, P); b.set('light_cube', i, 0, -7, 0, P); b.set('light_slope', i, 1, -8, R([0, 0, -1]), P); b.set('light_halfslope', i, 0, -8, R([0, 0, -1]), P) }
  for (const x of [-2, 2]) for (let z = -6; z <= 6; z++) b.set('light_slope', x, 3, z, x < 0 ? R([1, 0, 0], [0, 1, 0]) : R([-1, 0, 0], [0, 1, 0]), P)
  b.fill('light_cube', -1, 1, 3, 3, -2, 6, 0, P)
  b.over('cockpit', 0, 2, -7, 0, 7)
  b.over('window_slope', -1, 2, -7, R([0, 0, -1]), 1).over('window_slope', 1, 2, -7, R([0, 0, -1]), 1)
  b.over('jumpdrive', -1, 0, 1, 0, 0)
  b.over('core_small', 0, 1, -2).over('core_small', 0, 1, -3)
  b.over('gyro', -1, 1, 5).over('gyro', 1, 1, 5).over('gyro', -1, 2, 5).over('gyro', 1, 2, 5)
  b.over('battery', -2, 1, -1).over('battery', 2, 1, -1).over('battery', -2, 1, 4).over('battery', 2, 1, 4)
  b.over('gravgen', 0, 0, -5).over('medbay', -1, 0, -6, 0, 3)
  // ion engines at the back, fuel thrusters for gravity
  b.set('thr_ion_small', -2, 0, 7, F, 1).set('thr_ion_small', 2, 0, 7, F, 1).set('thr_ion_small', -2, 2, 7, F, 1).set('thr_ion_small', 2, 2, 7, F, 1)
  b.set('thr_h2_small', 0, 1, 7, F, 1).set('thr_h2_small', 0, 3, 7, F, 1)
  for (const [x, z] of [[-2, -4], [2, -4], [-2, 4], [2, 4], [0, -4], [0, 4]]) b.over('thr_h2_small', x, 0, z, UPR, 1)
  b.set('thr_ion_small', -2, 1, -10, BK, 1).set('thr_ion_small', 2, 1, -10, BK, 1)
  b.set('thr_ion_small', -1, 4, 0, DNR, 1).set('thr_ion_small', 1, 4, 0, DNR, 1)
  b.set('thr_ion_small', -4, 1, -3, RT, 1).set('thr_ion_small', 4, 1, -3, LF, 1).set('thr_ion_small', -4, 1, 3, RT, 1).set('thr_ion_small', 4, 1, 3, LF, 1)
  b.set('gear', -2, -1, -2, 0).set('gear', 2, -1, -2, 0).set('gear', -2, -1, 2, 0).set('gear', 2, -1, 2, 0)
  b.set('antenna', 0, 4, 4, 0).set('flood', 0, 0, -9, 0)
  return b.bp
}

// ---- Kestrel: an orbital station with a landing pad ----
function kestrel() {
  const b = new BP('Kestrel Station', 'large', { static: true, desc: 'A station: a pad to land on, a med bay, power, lights and gravity.' })
  // the pad
  for (let i = -6; i <= 6; i++) for (let k = -6; k <= 6; k++) b.set('light_cube', i, 0, k, 0, (Math.abs(i) === 6 || Math.abs(k) === 6) ? 4 : 1)
  // the hall at one end
  for (let i = -6; i <= 6; i++) for (let k = 7; k <= 11; k++) for (let j = 0; j <= 4; j++) {
    const edge = Math.abs(i) === 6 || k === 11 || j === 0 || j === 4
    if (!edge && k !== 7) continue
    if (k === 7 && j >= 1 && j <= 3 && Math.abs(i) <= 1) continue // the doorway
    b.set(j === 4 ? 'heavy_cube' : 'light_cube', i, j, k, 0, j === 4 ? 2 : 0)
  }
  for (let i = -5; i <= 5; i += 2) b.over('window', i, 2, 11, 0, 0)
  b.over('door', 0, 1, 7, 0).over('medbay', -4, 1, 9, 0, 3).over('gravgen', 4, 1, 10).over('battery', 5, 1, 10).over('battery', 5, 2, 10).over('core_small', 5, 1, 9)
  for (let i = -4; i <= 4; i += 4) b.set('lamp', i, 3, 9, UPSIDE)
  // masts, lights and solar arrays
  b.set('beacon', -6, 1, -6, 0).set('antenna', 6, 1, -6, 0)
  for (const [x, z] of [[-6, -2], [6, -2], [-6, 2], [6, 2]]) b.set('flood', x, 1, z, R(x < 0 ? [1, 0, 0] : [-1, 0, 0]))
  for (const i of [-6, -2, 2]) b.set('solar', i, 5, 7, 0)
  b.set('solar', -6, 5, 9, 0).set('solar', -2, 5, 9, 0).set('solar', 2, 5, 9, 0)
  return b.bp
}

// ---- Foothold: a small outpost on the ground ----
function foothold() {
  const b = new BP('Foothold Outpost', 'large', { static: true, ground: true, desc: 'A ground base: a pad, a hut with a med bay, power and a beacon.' })
  for (let i = -4; i <= 4; i++) for (let k = -4; k <= 4; k++) b.set('heavy_cube', i, 0, k, 0, (i + k) % 2 ? 1 : 2)
  for (let i = -4; i <= 4; i++) { b.set('light_slope', i, 0, -5, R([0, 0, -1]), 1); b.set('light_slope', i, 0, 5, R([0, 0, 1]), 1) }
  for (let k = -4; k <= 4; k++) { b.set('light_slope', -5, 0, k, R([-1, 0, 0]), 1); b.set('light_slope', 5, 0, k, R([1, 0, 0]), 1) }
  // the hut
  for (let i = 1; i <= 4; i++) for (let k = 1; k <= 4; k++) for (let j = 1; j <= 3; j++) {
    const wall = i === 1 || i === 4 || k === 1 || k === 4 || j === 3
    if (!wall) continue
    if (i === 1 && k === 2 && j <= 2) continue
    b.set('light_cube', i, j, k, 0, 9)
  }
  b.over('door', 1, 1, 2, R([1, 0, 0])).set('door', 1, 2, 2, 0)
  b.bp.blocks = b.bp.blocks.filter(x => !(x[0] === 'door' && x[2] === 2))
  b.set('light_cube', 1, 2, 2, 0, 9)
  b.over('window', 4, 2, 3, R([1, 0, 0])).over('window', 2, 2, 4, R([0, 0, 1]))
  b.set('medbay', 2, 1, 2, 0, 3).set('battery', 3, 1, 3).set('lamp', 3, 2, 2, UPSIDE)
  b.set('solar', -4, 1, -4, 0).set('solar', -4, 1, -1, 0).set('beacon', -4, 1, 3, 0).set('flood', 4, 1, -4, R([0, 0, -1]))
  return b.bp
}

export const PREFABS = { sparrow, mule, lancer, kestrel, foothold }
export const PREFAB_LIST = ['sparrow', 'mule', 'lancer', 'kestrel', 'foothold']
const cache = {}
export function prefab(id) { return cache[id] || (cache[id] = PREFABS[id]()) }
