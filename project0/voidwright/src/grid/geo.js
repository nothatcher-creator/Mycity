// Building block shapes out of flat faces, in cell units (one cell spans -0.5..0.5 on each axis; a block
// more than one cell big extends to +x, +y, +z). Each face lands in a "part" tagged with the cell side it
// lies on (so it can be left out when a neighbour covers it) and whether it is glass.
import { tileUV } from './atlas.js'
import { lin } from '../core/color.js'

export const SIDES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
export const SIDE = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 }
const AX = [[0, [0, 0, -1], [0, 1, 0]], [0, [0, 0, 1], [0, 1, 0]], [1, [1, 0, 0], [0, 0, -1]], [1, [1, 0, 0], [0, 0, 1]], [2, [1, 0, 0], [0, 1, 0]], [2, [-1, 0, 0], [0, 1, 0]]]

export class Geo {
  constructor() { this.parts = new Map() }
  get(side, glass) {
    const k = side + (glass ? 'g' : '')
    let p = this.parts.get(k)
    if (!p) { p = { side, glass, p: [], n: [], u: [], c: [], e: [], k: [] }; this.parts.set(k, p) }
    return p
  }
  // a flat convex polygon; `inside`: a point inside the solid, so the face is turned outward
  poly(V, o = {}) {
    if (V.length < 3) return
    let [a, b, c] = V
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1])
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    if (o.inside) {
      let cx = 0, cy = 0, cz = 0; for (const v of V) { cx += v[0]; cy += v[1]; cz += v[2] } cx /= V.length; cy /= V.length; cz /= V.length
      if (nx * (cx - o.inside[0]) + ny * (cy - o.inside[1]) + nz * (cz - o.inside[2]) < 0) { V = [...V].reverse(); nx = -nx; ny = -ny; nz = -nz }
    }
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l
    // texture: projected on the plane the face mostly faces; per cell, or fitted to the face
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz)
    const proj = ax >= ay && ax >= az ? v => [nx > 0 ? -v[2] : v[2], v[1]] : ay >= az ? v => [v[0], ny > 0 ? -v[2] : v[2]] : v => [nz > 0 ? v[0] : -v[0], v[1]]
    let P = V.map(proj)
    if (o.fit !== false && !o.cellUV) {
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
      for (const [u, v] of P) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v) }
      P = P.map(([u, v]) => [(u - u0) / (u1 - u0 || 1), (v - v0) / (v1 - v0 || 1)])
    } else P = P.map(([u, v]) => [u + 0.5, v + 0.5])
    const R = tileUV(o.tile ?? 0)
    const part = this.get(o.side ?? -1, !!o.glass)
    const col = o.col || [1, 1, 1], C = [lin(col[0]), lin(col[1]), lin(col[2])], e = o.emit || 0, pk = o.paint === false ? 0 : 1
    const push = (i) => {
      const v = V[i], [u, w] = P[i]
      part.p.push(v[0], v[1], v[2]); part.n.push(nx, ny, nz)
      part.u.push(R[0] + (R[2] - R[0]) * Math.min(1, Math.max(0, u)), R[1] + (R[3] - R[1]) * Math.min(1, Math.max(0, w)))
      part.c.push(C[0], C[1], C[2]); part.e.push(e); part.k.push(pk)
    }
    for (let i = 1; i < V.length - 1; i++) { push(0); push(i); push(i + 1) }
    if (o.double) { const back = [...V].reverse(); this.poly(back, { ...o, double: false, inside: null }) }
  }
  // an axis-aligned box; faces on the outside of a one-cell block are tagged with their side when `cull`
  box(x0, y0, z0, x1, y1, z1, o = {}) {
    const lo = [x0, y0, z0], hi = [x1, y1, z1]
    for (let s = 0; s < 6; s++) {
      const name = ['px', 'nx', 'py', 'ny', 'pz', 'nz'][s]
      if (o.skip && o.skip.includes(name)) continue
      const [a, U, Vv] = AX[s], sign = SIDES[s][a]
      const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]; c[a] = sign > 0 ? hi[a] : lo[a]
      const hu = U.map((v, i) => v * (hi[i] - lo[i]) / 2), hv = Vv.map((v, i) => v * (hi[i] - lo[i]) / 2)
      const V = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => [c[0] + hu[0] * p + hv[0] * q, c[1] + hu[1] * p + hv[1] * q, c[2] + hu[2] * p + hv[2] * q])
      // on the cell's own face and covering all of it: may be culled against a neighbour
      let side = -1
      if (o.cull) { const onFace = Math.abs(c[a] - sign * 0.5) < 1e-6, full = [0, 1, 2].every(i => i === a || (Math.abs(lo[i] + 0.5) < 1e-6 && Math.abs(hi[i] - 0.5) < 1e-6)); if (onFace && (full || o.cullPartial)) side = s }
      const tile = o.tiles?.[name] ?? o.tile
      this.poly(V, { ...o, tile, side, inside: null, emit: o.emits?.[name] ?? o.emit, col: o.cols?.[name] ?? o.col, glass: o.glass })
    }
  }
  // a cylinder (or a cone with `r2`) along an axis
  cyl(axis, cx, cy, cz, r, len, o = {}) {
    const seg = o.seg || 12, r2 = o.r2 ?? r
    const ax = { x: 0, y: 1, z: 2 }[axis]
    const P = (ang, rad, t) => { const p = [cx, cy, cz], u = Math.cos(ang) * rad, v = Math.sin(ang) * rad; const i1 = (ax + 1) % 3, i2 = (ax + 2) % 3; p[i1] += u; p[i2] += v; p[ax] += t; return p }
    const h = len / 2
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2
      if (o.sides !== false) this.poly([P(a0, r, -h), P(a1, r, -h), P(a1, r2, h), P(a0, r2, h)], { ...o, inside: [cx, cy, cz], tile: o.tile, fit: true, side: -1, double: o.double })
      if (o.caps !== false) {
        if (o.capA !== false && r > 0.001) this.poly([P(a0, r, -h), P(a1, r, -h), [cx + (ax === 0 ? -h : 0), cy + (ax === 1 ? -h : 0), cz + (ax === 2 ? -h : 0)]], { ...o, tile: o.capTile ?? o.tile, inside: [cx + (ax === 0 ? h : 0), cy + (ax === 1 ? h : 0), cz + (ax === 2 ? h : 0)], emit: o.capEmitA ?? o.emit, side: -1 })
        if (o.capB !== false && r2 > 0.001) this.poly([P(a0, r2, h), P(a1, r2, h), [cx + (ax === 0 ? h : 0), cy + (ax === 1 ? h : 0), cz + (ax === 2 ? h : 0)]], { ...o, tile: o.capTile ?? o.tile, inside: [cx - (ax === 0 ? h : 0), cy - (ax === 1 ? h : 0), cz - (ax === 2 ? h : 0)], emit: o.capEmitB ?? o.emit, side: -1 })
      }
    }
  }
  // a low ball (an octahedron-ish sphere)
  ball(cx, cy, cz, r, o = {}) {
    const st = o.seg || 6, sl = st * 2
    for (let j = 0; j < st; j++) for (let i = 0; i < sl; i++) {
      const t0 = j / st * Math.PI, t1 = (j + 1) / st * Math.PI, p0 = i / sl * Math.PI * 2, p1 = (i + 1) / sl * Math.PI * 2
      const S = (t, p) => [cx + Math.sin(t) * Math.cos(p) * r, cy + Math.cos(t) * r, cz + Math.sin(t) * Math.sin(p) * r]
      const V = j === 0 ? [S(t0, p0), S(t1, p0), S(t1, p1)] : j === st - 1 ? [S(t0, p0), S(t1, p0), S(t0, p1)] : [S(t0, p0), S(t1, p0), S(t1, p1), S(t0, p1)]
      this.poly(V, { ...o, inside: [cx, cy, cz], side: -1 })
    }
  }
  // the finished parts as typed arrays
  finish() {
    const out = []
    for (const p of this.parts.values()) {
      if (!p.p.length) continue
      out.push({ side: p.side, glass: p.glass, n: p.p.length / 3, pos: new Float32Array(p.p), nor: new Float32Array(p.n), uv: new Float32Array(p.u), col: new Float32Array(p.c), emit: new Float32Array(p.e), paint: new Uint8Array(p.k) })
    }
    return out
  }
}
