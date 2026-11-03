// Finding a way on foot: when the straight line to where a soldier wants to go is blocked (walls, houses,
// rocks, vehicles), a grid of 0.75 m cells is laid over the area round him and the goal, every box that
// stands in the way of a walking body is drawn into it, and A* finds a route, which is then pulled tight
// (corners only). Planning reaches up to 60 m at a time; beyond that the soldier heads for a point on the
// way and plans again when he gets there. Doors (1.4 m) always leave at least one free cell.
import { heightAt } from '../world/heightfield.js'

// defaults for a soldier; vehicles use a coarser grid, a wider body and a longer reach
const DEFAULTS = { cs: 0.75, r: 0.28, reach: 60, margin: 14, lo: 0.4, hi: 1.7 }
const SKIP = new Set(['floor', 'stairs'])

export class Nav {
  constructor(collision, o = {}) {
    this.col = collision
    this.o = { ...DEFAULTS, ...o }
    this.cap = 0
    this.blocked = null; this.g = null; this.f = null; this.from = null; this.closed = null
    this.heap = []
  }
  // Is the straight walk from (sx, sz) to (gx, gz) at height y clear?
  clear(sx, y, sz, gx, gz) {
    const R = this.o.r
    const dx = gx - sx, dz = gz - sz, d = Math.hypot(dx, dz)
    if (d < 0.5) return true
    const ux = dx / d, uz = dz / d, h = { t: 0 }, skip = c => SKIP.has(c.kind) || c.kind === 'glass' && !c.alive
    for (const off of [0.5, 1.3]) {
      // two parallel rays a body's width apart
      for (const side of [-R, R]) {
        const ox = sx - uz * side, oz = sz + ux * side
        if (this.col.raycast(ox, y + off, oz, ux, 0, uz, d, h, skip)) return false
      }
    }
    return true
  }
  // A route from (sx, sy, sz) towards (gx, gz): an array of [x, z] points, the last being the goal (or a step
  // towards it), or null when there is no way.
  path(sx, sy, sz, gx, gz) {
    const { cs: CS, r: R, reach: REACH, margin: MARGIN } = this.o
    if (this.clear(sx, sy, sz, gx, gz)) return [[gx, gz]]
    let tx = gx, tz = gz
    const dd = Math.hypot(gx - sx, gz - sz)
    if (dd > REACH) { tx = sx + (gx - sx) / dd * REACH; tz = sz + (gz - sz) / dd * REACH }
    const x0 = Math.min(sx, tx) - MARGIN, z0 = Math.min(sz, tz) - MARGIN
    const W = Math.ceil((Math.abs(tx - sx) + MARGIN * 2) / CS), H = Math.ceil((Math.abs(tz - sz) + MARGIN * 2) / CS)
    const N = W * H
    if (N > this.cap) {
      this.cap = N
      this.blocked = new Uint8Array(N); this.g = new Float32Array(N); this.from = new Int32Array(N); this.closed = new Uint8Array(N)
    } else { this.blocked.fill(0, 0, N); this.closed.fill(0, 0, N) }
    const B = this.blocked
    // draw the obstacles
    const lo = sy + this.o.lo, hi = sy + this.o.hi
    this.col.query(x0, z0, x0 + W * CS, z0 + H * CS, c => {
      if (SKIP.has(c.kind) || c.maxY < lo || c.minY > hi) return
      if (Math.abs(c.ay[1]) < 0.97) return          // ramps and fallen things: walkable
      const i0 = Math.max(0, Math.floor((c.minX - R - x0) / CS)), i1 = Math.min(W - 1, Math.floor((c.maxX + R - x0) / CS))
      const j0 = Math.max(0, Math.floor((c.minZ - R - z0) / CS)), j1 = Math.min(H - 1, Math.floor((c.maxZ + R - z0) / CS))
      const ax = c.ax[0], az = c.ax[2], bx = c.az[0], bz = c.az[2]
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = x0 + (i + 0.5) * CS - c.x, pz = z0 + (j + 0.5) * CS - c.z
        if (Math.abs(px * ax + pz * az) <= c.hx + R && Math.abs(px * bx + pz * bz) <= c.hz + R) B[j * W + i] = 1
      }
    })
    // water too deep to wade and cliffs are not drawn: soldiers swim, and slopes slow them
    const cell = (x, z) => [Math.max(0, Math.min(W - 1, Math.floor((x - x0) / CS))), Math.max(0, Math.min(H - 1, Math.floor((z - z0) / CS)))]
    const [si, sj] = cell(sx, sz)
    let [ti, tj] = cell(tx, tz)
    const start = sj * W + si
    B[start] = 0
    // the goal inside something: the nearest free cell
    if (B[tj * W + ti]) {
      let best = -1, bd = 1e9
      for (let r = 1; r < Math.ceil(9 / CS) && best < 0; r++) for (let j = tj - r; j <= tj + r; j++) for (let i = ti - r; i <= ti + r; i++) {
        if (i < 0 || j < 0 || i >= W || j >= H || B[j * W + i]) continue
        const d = (i - ti) ** 2 + (j - tj) ** 2; if (d < bd) { bd = d; best = j * W + i }
      }
      if (best < 0) return null
      ti = best % W; tj = (best / W) | 0
    }
    const goal = tj * W + ti
    // A* (8 neighbours, no corner cutting)
    const G = this.g, F = this.from, Cl = this.closed, heap = this.heap
    heap.length = 0
    G[start] = 0; F[start] = -1
    const hcost = (i, j) => { const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz) }
    const open = new Map(); open.set(start, 0)
    push(heap, [hcost(si, sj), start])
    let found = false, steps = 0
    while (heap.length && steps < 30000) {
      const [, cur] = pop(heap); steps++
      if (Cl[cur]) continue
      Cl[cur] = 1
      if (cur === goal) { found = true; break }
      const ci = cur % W, cj = (cur / W) | 0, gc = G[cur]
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const ni = ci + di, nj = cj + dj
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue
        const n = nj * W + ni
        if (B[n] || Cl[n]) continue
        if (di && dj && (B[cj * W + ni] || B[nj * W + ci])) continue
        const ng = gc + (di && dj ? Math.SQRT2 : 1)
        const og = open.get(n)
        if (og !== undefined && og <= ng) continue
        open.set(n, ng); G[n] = ng; F[n] = cur
        push(heap, [ng + hcost(ni, nj), n])
      }
    }
    if (!found) return null
    // back from the goal, then keep only the corners that line of sight needs
    const cells = []
    for (let c = goal; c !== -1; c = F[c]) cells.push(c)
    cells.reverse()
    const pts = []
    let a = 0
    while (a < cells.length - 1) {
      let b = cells.length - 1
      while (b > a + 1 && !this.gridLine(cells[a], cells[b], W)) b--
      pts.push(cells[b]); a = b
    }
    const out = pts.map(c => [x0 + ((c % W) + 0.5) * CS, z0 + (((c / W) | 0) + 0.5) * CS])
    if (!out.length) out.push([tx, tz])
    return out
  }
  // Free cells all along the straight line between two cells?
  gridLine(a, b, W) {
    const B = this.blocked
    let x0 = a % W, y0 = (a / W) | 0
    const x1 = b % W, y1 = (b / W) | 0
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let err = dx - dy
    for (;;) {
      if (B[y0 * W + x0]) return false
      if (x0 === x1 && y0 === y1) return true
      const e2 = 2 * err
      if (e2 > -dy) { err -= dy; x0 += sx; if (B[y0 * W + x0]) return false }
      if (e2 < dx) { err += dx; y0 += sy }
    }
  }
}
// a small binary heap of [priority, value]
function push(h, it) { h.push(it); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p } }
function pop(h) {
  const top = h[0], last = h.pop()
  if (h.length) { h[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m } }
  return top
}
export const groundY = (x, z) => heightAt(x, z)
