// node tools/roadgen.mjs: routes Varden's roads over the land with A* (steepness and water cost extra, so
// mountain roads find their own switchbacks) and writes src/world/roads-data.js, which the game loads.
// Run it again whenever the blueprint's land or road waypoints change.
import { writeFileSync } from 'node:fs'
import { initHeightfield, base, GRID, CELL, waterLevel, flatMask } from '../src/world/heightfield.js'
import { HALF, ROAD_ROUTES } from '../src/world/blueprint.js'

initHeightfield({ noRoads: true })
const N1 = GRID + 1
const H = (ix, iz) => base[iz * N1 + ix]
const water = new Uint8Array(N1 * N1)
for (let iz = 0; iz < N1; iz++) for (let ix = 0; ix < N1; ix++) {
  const x = ix * CELL - HALF, z = iz * CELL - HALF, w = waterLevel(x, z)
  water[iz * N1 + ix] = w > H(ix, iz) - 0.3 ? (w > 0.5 || H(ix, iz) > 1 ? 1 : 2) : 0   // 1 river/lake, 2 sea
}
// 16 neighbours (the knight's moves too), for gentler bends and switchbacks
const NB = []
for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
  if (!dx && !dz) continue
  if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue
  if ((Math.abs(dx) === 2 && dz === 0) || (Math.abs(dz) === 2 && dx === 0)) continue
  NB.push([dx, dz, Math.hypot(dx, dz) * CELL])
}
class Heap {
  constructor() { this.a = []; this.f = [] }
  push(n, f) { const a = this.a, F = this.f; a.push(n); F.push(f); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (F[p] <= F[i]) break;[a[p], a[i]] = [a[i], a[p]];[F[p], F[i]] = [F[i], F[p]]; i = p } }
  pop() { const a = this.a, F = this.f, top = a[0], last = a.pop(), lf = F.pop(); if (a.length) { a[0] = last; F[0] = lf; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && F[l] < F[m]) m = l; if (r < a.length && F[r] < F[m]) m = r; if (m === i) break;[a[m], a[i]] = [a[i], a[m]];[F[m], F[i]] = [F[i], F[m]]; i = m } } return top }
  get size() { return this.a.length }
}
const LIMIT = { highway: [0.07, 0.16], road: [0.09, 0.2], dirt: [0.14, 0.42] }
const g = new Float32Array(N1 * N1), from = new Int32Array(N1 * N1), seen = new Uint8Array(N1 * N1)
// paths already laid make the next ones cheaper, so roads share their way where they can
const used = new Uint8Array(N1 * N1)
function route(ax, az, bx, bz, kind) {
  const [soft, hard] = LIMIT[kind]
  const gi = (x, z) => Math.round((z + HALF) / CELL) * N1 + Math.round((x + HALF) / CELL)
  const s = gi(ax, az), t = gi(bx, bz), tx = t % N1, tz = (t / N1) | 0
  g.fill(Infinity); seen.fill(0); from.fill(-1)
  g[s] = 0
  const heap = new Heap(); heap.push(s, 0)
  while (heap.size) {
    const c = heap.pop()
    if (seen[c]) continue
    seen[c] = 1
    if (c === t) break
    const cx = c % N1, cz = (c / N1) | 0, hc = H(cx, cz)
    for (const [dx, dz, d] of NB) {
      const nx = cx + dx, nz = cz + dz
      if (nx < 1 || nz < 1 || nx >= N1 - 1 || nz >= N1 - 1) continue
      const n = nz * N1 + nx
      if (seen[n] || water[n] === 2) continue
      const gr = Math.abs(H(nx, nz) - hc) / d
      if (gr > hard) continue
      let cost = d * (1 + 60 * Math.max(0, gr - soft) ** 2 * 10 + gr * 2)
      if (water[n] === 1) cost += d * 12              // bridges are costly: cross where it is narrow
      if (flatMask[n] > 200) cost *= 0.85             // through towns
      if (used[n]) cost *= kind === 'dirt' ? 0.6 : 0.75
      const ng = g[c] + cost
      if (ng < g[n]) { g[n] = ng; from[n] = c; heap.push(n, ng + Math.hypot(nx - tx, nz - tz) * CELL) }
    }
  }
  if (!seen[t]) { console.warn('no route', kind, ax, az, bx, bz); return [[ax, az], [bx, bz]] }
  const cells = []
  for (let c = t; c !== -1; c = from[c]) cells.push(c)
  cells.reverse()
  for (const c of cells) used[c] = 1
  return cells.map(c => [(c % N1) * CELL - HALF, ((c / N1) | 0) * CELL - HALF])
}
// Douglas-Peucker in 3D (height counts), then the curve is smoothed by the game's Catmull-Rom sampling.
function simplify(pts, tol) {
  if (pts.length < 3) return pts
  const h = p => p[2]
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let md = 0, mi = -1
    const A = pts[a], B = pts[b], dx = B[0] - A[0], dz = B[1] - A[1], dh = h(B) - h(A), l2 = dx * dx + dz * dz || 1
    for (let i = a + 1; i < b; i++) {
      const P = pts[i], t = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dz) / l2))
      const d = Math.hypot(P[0] - A[0] - dx * t, P[1] - A[1] - dz * t, (h(P) - h(A) - dh * t) * 3)
      if (d > md) { md = d; mi = i }
    }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]) }
  }
  return pts.filter((_, i) => keep[i])
}
const out = []
const t0 = Date.now()
for (const r of ROAD_ROUTES) {
  let pts = []
  for (let i = 0; i < r.via.length - 1; i++) {
    const seg = route(r.via[i][0], r.via[i][1], r.via[i + 1][0], r.via[i + 1][1], r.kind)
    pts.push(...(i ? seg.slice(1) : seg))
  }
  pts[0] = r.via[0].slice(); pts[pts.length - 1] = r.via[r.via.length - 1].slice()
  const withH = pts.map(([x, z]) => [x, z, H(Math.round((x + HALF) / CELL), Math.round((z + HALF) / CELL))])
  const simple = simplify(withH, r.kind === 'dirt' ? 14 : 20).map(p => [Math.round(p[0]), Math.round(p[1])])
  out.push({ id: r.id, kind: r.kind, pts: simple })
  console.log(r.id, r.kind, 'cells', pts.length, '->', simple.length, 'points')
}
const body = `// Generated by tools/roadgen.mjs from blueprint.js ROAD_ROUTES (A* over the land): do not edit by hand.
// Each road: its kind and the control points of its curve (metres).
export const ROADS = [
${out.map(r => `  { id: '${r.id}', kind: '${r.kind}', pts: [\n${chunk(r.pts.map(p => `[${p[0]}, ${p[1]}]`), 12).map(l => '    ' + l.join(', ')).join(',\n')}] },`).join('\n')}
]
`
writeFileSync(new URL('../src/world/roads-data.js', import.meta.url), body)
console.log('routed in', Date.now() - t0, 'ms')
// lines of at most n items (the platform refuses source lines over 1,000 characters)
function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
