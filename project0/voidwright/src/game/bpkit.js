// The blueprint kit: placing blocks by cell, a hull as a set of cells, and the "skin" that turns that set
// into bevelled plating (every outer edge gets the slope or corner piece that chamfers it).
import { rotFrom, apply, ROTS as ROTM } from '../grid/rot.js'
import { BLOCKS } from '../grid/blocks.js'

// push: the direction the block pushes its grid (for thrusters) / faces (others); up: its top
export const R = (push = [0, 0, -1], up = [0, 1, 0]) => rotFrom(push, up)
export const F = R(), BK = R([0, 0, 1]), UPR = R([0, 1, 0], [0, 0, 1]), DNR = R([0, -1, 0], [0, 0, 1]), LF = R([-1, 0, 0]), RT = R([1, 0, 0])
export const UPSIDE = R([0, 0, -1], [0, -1, 0])
const isHull = id => id.startsWith('light_') || id.startsWith('heavy_') || id.startsWith('hull_')

export class BP {
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
export class Shape {
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
const EDGES = [[1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1], [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1]]
export function skin(b, s, weight = 'light', o = {}) {
  const eq = (a, v) => a[0] === v[0] && a[1] === v[1] && a[2] === v[2]
  for (const [x, y, z, col] of s.c.values()) {
    const U = s.has(x, y + 1, z), D = s.has(x, y - 1, z)
    const open = DIRS.filter(d => !s.has(x + d[0], y, z + d[2])), backed = d => s.has(x - d[0], y, z - d[2])
    if (U && D && !open.length) {
      // inside: left empty in a hollow hull, unless a step in the hull above or below needs it to hold on to
      const deep = EDGES.every(e => s.has(x + e[0], y + e[1], z + e[2]))
      if (o.solid || !deep) b.set(`${weight}_cube`, x, y, z, 0, col)
      continue
    }
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

// a flat roof with bevelled edges: a rectangle of plating at height y
export function roof(b, x0, x1, y, z0, z1, weight = 'heavy', col = 2) {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const ex = x === x0 ? -1 : x === x1 ? 1 : 0, ez = z === z0 ? -1 : z === z1 ? 1 : 0
    if (ex && ez) {
      let rot = 0
      for (const [a, c] of [[[ex, 0, 0], [0, 0, ez]], [[0, 0, ez], [ex, 0, 0]]]) { const r = rotFrom(a, [0, 1, 0]), v = apply(r, -1, 0, 0, [0, 0, 0]); if (v[0] === c[0] && v[2] === c[2]) rot = r }
      b.set(`${weight}_corner`, x, y, z, rot, col)
    } else if (ex || ez) b.set(`${weight}_slope`, x, y, z, rotFrom([ex, 0, ez], [0, 1, 0]), col)
    else b.set(`${weight}_cube`, x, y, z, 0, col)
  }
  return b
}
// a disc of cells at height y round (cx, cz)
export function disc(s, cx, y, cz, r, col = 0) { for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) if (x * x + z * z <= r * r + r * 0.8) s.add(cx + x, y, cz + z, col); return s }
// lays a staircase of cells from (x0, y0) to (x1, y1) at each z, joined face to face
export function strut(s, x0, y0, x1, y1, z0, z1, col = 0) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)), sx = Math.sign(x1 - x0)
  let px = x0, py = y0
  for (let t = 0; t <= n; t++) {
    const x = Math.round(x0 + (x1 - x0) * t / n), y = Math.round(y0 + (y1 - y0) * t / n)
    for (let z = z0; z <= z1; z++) { s.add(x, y, z, col); if (x !== px && y !== py) s.add(x, py, z, col) }
    px = x; py = y
  }
  return s
}
