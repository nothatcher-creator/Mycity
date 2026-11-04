// Static collision: every wall, floor, stair, crate, tree trunk and rock is an oriented box (OBB) in a
// grid of 10 m cells. Bullets and sight lines cast rays through it, soldiers and vehicles push out of it,
// feet find the floor under them. The ground itself is the heightfield (raycastTerrain).
import { heightAt } from './heightfield.js'

const CELL = 10
// What things are made of, for bullets: how much energy a metre of it takes (joules per metre; `thin` is the
// real thickness of sheets drawn as thicker boxes), how often bullets glance off it at a shallow angle, and
// what flies off when hit. A 5.56 round carries about 1,700 J, 7.62 NATO 3,300 J, 12.7 mm 16,000 J.
export const MATERIALS = {
  concrete: { resist: 45000, ricochet: 0.55, hard: true, fx: 'chips', color: [0.75, 0.74, 0.7] },
  brick: { resist: 30000, ricochet: 0.35, hard: true, fx: 'chips', color: [0.7, 0.4, 0.3] },
  metal: { resist: 400000, thin: 0.02, ricochet: 0.8, hard: true, fx: 'sparks', color: [0.6, 0.6, 0.62] },
  sheetmetal: { resist: 200000, thin: 0.004, ricochet: 0.6, hard: true, fx: 'sparks', color: [0.6, 0.6, 0.62] },
  wood: { resist: 7000, ricochet: 0.12, hard: false, fx: 'splinters', color: [0.6, 0.45, 0.28] },
  glass: { resist: 2000, thin: 0.01, ricochet: 0, hard: false, fx: 'glass', color: [0.8, 0.9, 1] },
  sandbag: { resist: 60000, ricochet: 0.05, hard: false, fx: 'dust', color: [0.7, 0.62, 0.45] },
  rock: { resist: 90000, ricochet: 0.65, hard: true, fx: 'chips', color: [0.55, 0.54, 0.5] },
  tree: { resist: 7000, ricochet: 0.1, hard: false, fx: 'splinters', color: [0.45, 0.32, 0.2] },
  soil: { resist: 50000, ricochet: 0.2, hard: false, fx: 'dirt', color: [0.45, 0.35, 0.25] },
  armor: { resist: 400000, ricochet: 0.85, hard: true, fx: 'sparks', color: [0.5, 0.5, 0.5] },
  flesh: { resist: 1800, ricochet: 0, hard: false, fx: 'hit', color: [0.6, 0.1, 0.1] },
}

let nextId = 1
// An oriented box: centre, half-sizes, a yaw (about up) and an optional pitch (about the box's own x: ramps).
export function makeBox(x, y, z, hx, hy, hz, yaw = 0, mat = 'concrete', kind = 'wall', pitch = 0) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
  // columns of the rotation: the box's local x, y and z axes in the world
  const ax = [cy, 0, -sy]
  const ay = [sy * sp, cp, cy * sp]
  const az = [sy * cp, -sp, cy * cp]
  const r = Math.abs(ax[0]) * hx + Math.abs(ay[0]) * hy + Math.abs(az[0]) * hz
  const rz = Math.abs(ax[2]) * hx + Math.abs(ay[2]) * hy + Math.abs(az[2]) * hz
  const ry = Math.abs(ax[1]) * hx + Math.abs(ay[1]) * hy + Math.abs(az[1]) * hz
  return { id: nextId++, x, y, z, hx, hy, hz, ax, ay, az, mat, kind, alive: true, hp: 0,
    minX: x - r, maxX: x + r, minZ: z - rz, maxZ: z + rz, minY: y - ry, maxY: y + ry, stamp: 0, owner: null }
}

export class Collision {
  constructor() { this.cells = new Map(); this.stamp = 1; this.count = 0 }
  key(ix, iz) { return (ix + 2000) * 4000 + (iz + 2000) }
  add(c) {
    for (let ix = Math.floor(c.minX / CELL); ix <= Math.floor(c.maxX / CELL); ix++)
      for (let iz = Math.floor(c.minZ / CELL); iz <= Math.floor(c.maxZ / CELL); iz++) {
        const k = this.key(ix, iz); let a = this.cells.get(k); if (!a) this.cells.set(k, a = []); a.push(c)
      }
    this.count++
    return c
  }
  remove(c) {
    for (let ix = Math.floor(c.minX / CELL); ix <= Math.floor(c.maxX / CELL); ix++)
      for (let iz = Math.floor(c.minZ / CELL); iz <= Math.floor(c.maxZ / CELL); iz++) {
        const a = this.cells.get(this.key(ix, iz)); if (!a) continue
        const i = a.indexOf(c); if (i >= 0) { a[i] = a[a.length - 1]; a.pop() }
      }
    this.count--
  }
  // Every live box touching the rectangle, once each.
  query(minX, minZ, maxX, maxZ, fn) {
    const s = ++this.stamp
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++)
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const a = this.cells.get(this.key(ix, iz)); if (!a) continue
        for (let i = 0; i < a.length; i++) { const c = a[i]; if (c.stamp === s || !c.alive) continue; c.stamp = s; if (fn(c) === false) return }
      }
  }

  // The nearest box a ray from o along unit d hits before maxT: { t, c, nx, ny, nz, tOut } into `hit`, or null.
  // `skip(c)` may pass over boxes (the shooter's own vehicle, glass already broken).
  raycast(ox, oy, oz, dx, dy, dz, maxT, hit, skip = null) {
    let best = maxT, found = null
    const s = ++this.stamp
    // walk the cells the ray crosses (2D DDA in x and z)
    let ix = Math.floor(ox / CELL), iz = Math.floor(oz / CELL)
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1
    const tdx = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity, tdz = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : Infinity
    let tmx = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (ix + 1) * CELL - ox : ox - ix * CELL) / Math.abs(dx)) : Infinity
    let tmz = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (iz + 1) * CELL - oz : oz - iz * CELL) / Math.abs(dz)) : Infinity
    let t = 0
    for (let guard = 0; guard < 400; guard++) {
      const a = this.cells.get(this.key(ix, iz))
      if (a) for (let i = 0; i < a.length; i++) {
        const c = a[i]
        if (c.stamp === s || !c.alive) continue
        c.stamp = s
        if (skip && skip(c)) continue
        if (rayBox(c, ox, oy, oz, dx, dy, dz, best, tmpHit)) { best = tmpHit.t; found = c; copyHit(hit, tmpHit) }
      }
      if (found && best <= Math.min(tmx, tmz)) break
      if (tmx < tmz) { t = tmx; tmx += tdx; ix += stepX } else { t = tmz; tmz += tdz; iz += stepZ }
      if (t > best) break
    }
    if (found) { hit.c = found; return hit }
    return null
  }

  // Pushes a sphere out of every box it overlaps; returns how far it moved up (for steps) and sets
  // `out.ground` when it rests on something nearly flat.
  // `skip(c)`: colliders to ignore (vehicles ignore floors: they ride on them, see groundAt)
  pushSphere(p, r, out, skip = null) {
    let up = 0
    out.ground = false; out.wall = false
    this.query(p.x - r, p.z - r, p.x + r, p.z + r, c => {
      if (p.y + r < c.minY || p.y - r > c.maxY) return
      if (skip && skip(c)) return
      if (c.kind === 'glass' && c.broken) return
      // the closest point of the box to the sphere's centre
      const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z
      let lx = dx * c.ax[0] + dy * c.ax[1] + dz * c.ax[2]
      let ly = dx * c.ay[0] + dy * c.ay[1] + dz * c.ay[2]
      let lz = dx * c.az[0] + dy * c.az[1] + dz * c.az[2]
      const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qy = Math.max(-c.hy, Math.min(c.hy, ly)), qz = Math.max(-c.hz, Math.min(c.hz, lz))
      let ex = lx - qx, ey = ly - qy, ez = lz - qz
      let d2 = ex * ex + ey * ey + ez * ez
      if (d2 >= r * r) return
      let nx, ny, nz, depth
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2); depth = r - d; ex /= d; ey /= d; ez /= d
      } else {
        // centre inside: leave by the nearest face
        const fx = c.hx - Math.abs(lx), fy = c.hy - Math.abs(ly), fz = c.hz - Math.abs(lz)
        ex = ey = ez = 0
        if (fx < fy && fx < fz) { ex = Math.sign(lx) || 1; depth = fx + r } else if (fy < fz) { ey = Math.sign(ly) || 1; depth = fy + r } else { ez = Math.sign(lz) || 1; depth = fz + r }
      }
      nx = ex * c.ax[0] + ey * c.ay[0] + ez * c.az[0]
      ny = ex * c.ax[1] + ey * c.ay[1] + ez * c.az[1]
      nz = ex * c.ax[2] + ey * c.ay[2] + ez * c.az[2]
      p.x += nx * depth; p.y += ny * depth; p.z += nz * depth
      if (ny > 0.6) { out.ground = true; up += ny * depth } else out.wall = true
      if (out.normals) out.normals.push(nx, ny, nz)
    })
    return up
  }

  // The highest surface under (x, z) between y - down and y + up (box tops, ramps), or -Infinity. Boxes the
  // probe starts inside (a wall the soldier leans into) do not count as floor.
  floorAt(x, y, z, up = 0.5, down = 50) {
    const top = y + up
    let best = -Infinity
    const a = this.cells.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)))
    if (!a) return best
    for (let i = 0; i < a.length; i++) {
      const c = a[i]
      if (!c.alive || c.maxY < y - down || c.minY > top || (c.kind === 'glass')) continue
      if (rayBox(c, x, top, z, 0, -1, 0, up + down, floorHit) && floorHit.t > 1e-4) best = Math.max(best, top - floorHit.t)
    }
    return best
  }
}
const floorHit = { t: 0, tOut: 0, nx: 0, ny: 0, nz: 0 }

const tmpHit = { t: 0, tOut: 0, nx: 0, ny: 0, nz: 0, c: null }
function copyHit(a, b) { a.t = b.t; a.tOut = b.tOut; a.nx = b.nx; a.ny = b.ny; a.nz = b.nz }

// Ray against one oriented box (slab test in the box's frame). Fills `hit` and returns true when it
// enters the box before maxT.
export function rayBox(c, ox, oy, oz, dx, dy, dz, maxT, hit) {
  const px = ox - c.x, py = oy - c.y, pz = oz - c.z
  const o0 = px * c.ax[0] + py * c.ax[1] + pz * c.ax[2], d0 = dx * c.ax[0] + dy * c.ax[1] + dz * c.ax[2]
  const o1 = px * c.ay[0] + py * c.ay[1] + pz * c.ay[2], d1 = dx * c.ay[0] + dy * c.ay[1] + dz * c.ay[2]
  const o2 = px * c.az[0] + py * c.az[1] + pz * c.az[2], d2 = dx * c.az[0] + dy * c.az[1] + dz * c.az[2]
  let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0
  const slab = (o, d, h, ax) => {
    if (Math.abs(d) < 1e-9) return o >= -h && o <= h
    let t1 = (-h - o) / d, t2 = (h - o) / d, s = -1
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1 }
    if (t1 > tmin) { tmin = t1; axis = ax; sign = s }
    if (t2 < tmax) tmax = t2
    return tmin <= tmax
  }
  if (!slab(o0, d0, c.hx, 0) || !slab(o1, d1, c.hy, 1) || !slab(o2, d2, c.hz, 2)) return false
  if (tmax < 0 || tmin > maxT) return false
  const t = Math.max(tmin, 0)
  hit.t = t; hit.tOut = tmax
  if (tmin < 0) { hit.nx = -dx; hit.ny = -dy; hit.nz = -dz; return true }   // started inside
  const A = axis === 0 ? c.ax : axis === 1 ? c.ay : c.az
  hit.nx = A[0] * sign; hit.ny = A[1] * sign; hit.nz = A[2] * sign
  return true
}

// Where a ray first meets the ground, within maxT: returns t or -1. Steps along it (bigger steps while it is
// high above the land), then refines by halving.
export function raycastTerrain(ox, oy, oz, dx, dy, dz, maxT, minStep = 1.5) {
  let t = 0, prevT = 0
  let prevAbove = oy - heightAt(ox, oz)
  if (prevAbove < 0) return 0
  while (t < maxT) {
    const step = Math.max(minStep, Math.min(40, prevAbove * 0.6))
    t = Math.min(maxT, t + step)
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t
    const above = y - heightAt(x, z)
    if (above < 0) {
      let a = prevT, b = t
      for (let i = 0; i < 8; i++) {
        const m = (a + b) / 2
        if (oy + dy * m - heightAt(ox + dx * m, oz + dz * m) < 0) b = m; else a = m
      }
      return b
    }
    prevT = t; prevAbove = above
    if (t >= maxT) break
  }
  return -1
}
