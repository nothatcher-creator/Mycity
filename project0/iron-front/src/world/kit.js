// The building kit: boxes, roofs, walls with doors and windows, floors with stairwells and stairs, put
// together in a building's own frame and baked into one coloured mesh per tile, with a collider for every
// solid part (tagged with its material for the bullets) and a pane of breakable glass in every window.
import * as THREE from 'three'
import { makeBox } from './collision.js'

export class Kit {
  constructor() {
    this.pos = []; this.col = []; this.idx = []
    this.glass = []       // window panes: { x, y, z, hx, hy, hz, yaw }
    this.colliders = []
    this.ladders = []     // { x, z, y0, y1, yaw }: climbable
    this.spots = []       // tactical points: { x, y, z, kind: 'cover' | 'window' | 'roof' | 'loot' | 'spawn' }
    this.lights = []      // lamps that glow at night
    this.setFrame(0, 0, 0, 0)
  }
  // Everything after this is placed relative to (ox, oy, oz), turned by yaw.
  setFrame(ox, oy, oz, yaw) { this.ox = ox; this.oy = oy; this.oz = oz; this.yaw = yaw; this.c = Math.cos(yaw); this.s = Math.sin(yaw) }
  // local -> island
  tx(x, z) { return this.ox + x * this.c + z * this.s }
  tz(x, z) { return this.oz - x * this.s + z * this.c }
  spot(x, y, z, kind) { this.spots.push({ x: this.tx(x, z), y: this.oy + y, z: this.tz(x, z), kind }) }

  // A coloured box (cx, cy, cz: its centre in the frame; hx, hy, hz: half sizes). o.collide (default true),
  // o.mat, o.kind, o.yaw (extra turn), o.pitch (ramps), o.shade (darker bottom).
  box(cx, cy, cz, hx, hy, hz, color, o = {}) {
    const yaw = this.yaw + (o.yaw || 0), pitch = o.pitch || 0
    const wx = this.tx(cx, cz), wy = this.oy + cy, wz = this.tz(cx, cz)
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
    const base = this.pos.length / 3
    for (let k = 0; k < 8; k++) {
      const lx = k & 1 ? hx : -hx, ly = k & 2 ? hy : -hy, lz = k & 4 ? hz : -hz
      // pitch about x, then yaw about y
      const y1 = ly * cp - lz * sp, z1 = ly * sp + lz * cp
      this.pos.push(wx + lx * cyw + z1 * syw, wy + y1, wz - lx * syw + z1 * cyw)
      const sh = o.shade && !(k & 2) ? 0.82 : 1
      this.col.push(color[0] * sh, color[1] * sh, color[2] * sh)
    }
    const B = (a, b, c) => this.idx.push(base + a, base + b, base + c)
    // -x, +x, -y, +y, -z, +z faces (outward winding)
    B(0, 4, 6); B(0, 6, 2); B(1, 3, 7); B(1, 7, 5)
    if (!o.noBottom) { B(0, 1, 5); B(0, 5, 4) }
    B(2, 6, 7); B(2, 7, 3); B(0, 2, 3); B(0, 3, 1); B(4, 5, 7); B(4, 7, 6)
    if (o.collide !== false) {
      const c = makeBox(wx, wy, wz, hx, hy, hz, yaw, o.mat || 'concrete', o.kind || 'wall', pitch)
      c.vbase = base      // its 8 corners in the tile's mesh (a blast can knock it out)
      this.colliders.push(c)
      return c
    }
    return null
  }
  // A gabled roof over a w x d rectangle (ridge along local x), from height y0 rising h.
  gable(cx, y0, cz, w, d, h, color, overhang = 0.4, o = {}) {
    const hw = w / 2 + overhang, hd = d / 2 + overhang
    const P = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [-hw, h, 0], [hw, h, 0]]
    const base = this.pos.length / 3
    for (const [x, y, z] of P) {
      this.pos.push(this.tx(cx + x, cz + z), this.oy + y0 + y, this.tz(cx + x, cz + z))
      this.col.push(color[0], color[1], color[2])
    }
    const B = (a, b, c) => this.idx.push(base + a, base + b, base + c)
    B(0, 4, 5); B(0, 5, 1); B(3, 2, 5); B(3, 5, 4); B(0, 3, 4); B(1, 5, 2); B(0, 1, 2); B(0, 2, 3)
    if (o.collide !== false) {
      // two sloped slabs, so bullets and grenades meet the roof
      const slope = Math.atan2(h, hd), len = Math.hypot(h, hd) / 2
      for (const s of [-1, 1]) {
        const c = makeBox(this.tx(cx, cz + s * hd / 2), this.oy + y0 + h / 2, this.tz(cx, cz + s * hd / 2), hw, 0.12, len, this.yaw, o.mat || 'wood', 'roof', -s * slope)
        this.colliders.push(c)
      }
    }
  }
  // A wall along local x from x0 to x1 at depth z (thickness t), from y0 up h, with openings
  // [{ a, b, lo, hi, glass }] (along the wall from x0, heights from y0).
  wall(x0, x1, z, y0, h, t, color, openings = [], o = {}) {
    const L = x1 - x0
    const ops = openings.filter(p => p.b > p.a).sort((p, q) => p.a - q.a)
    let u = 0
    const piece = (a, b, lo, hi) => {
      if (b - a < 0.02 || hi - lo < 0.02) return
      this.box(x0 + (a + b) / 2, y0 + (lo + hi) / 2, z, (b - a) / 2, (hi - lo) / 2, t / 2, color, { mat: o.mat, kind: 'wall', shade: lo === 0 })
    }
    for (const p of ops) {
      piece(u, p.a, 0, h)
      piece(p.a, p.b, 0, p.lo)
      piece(p.a, p.b, p.hi, h)
      if (p.glass) this.pane(x0 + (p.a + p.b) / 2, y0 + (p.lo + p.hi) / 2, z, (p.b - p.a) / 2, (p.hi - p.lo) / 2, 0)
      if (p.glass || p.lo > 0.3) this.spot(x0 + (p.a + p.b) / 2, y0 + p.lo, z, 'window')
      u = p.b
    }
    piece(u, L, 0, h)
  }
  // The same wall along local z (from z0 to z1 at x).
  wallZ(z0, z1, x, y0, h, t, color, openings = [], o = {}) {
    const saved = [this.ox, this.oy, this.oz, this.yaw]
    // turn the frame a quarter so local x runs along the old z
    const nx = this.tx(x, z0), nz = this.tz(x, z0)
    this.setFrame(nx, this.oy, nz, this.yaw - Math.PI / 2)
    this.wall(0, z1 - z0, 0, y0, h, t, color, openings, o)
    this.setFrame(saved[0], saved[1], saved[2], saved[3])
  }
  pane(cx, cy, cz, hx, hy, yawOff) {
    this.glass.push({ x: this.tx(cx, cz), y: this.oy + cy, z: this.tz(cx, cz), hx, hy, hz: 0.03, yaw: this.yaw + yawOff })
  }
  // A floor slab over [x0, x1] x [z0, z1] at height y with an optional hole (stairwell).
  slab(x0, x1, z0, z1, y, t, color, hole = null, o = {}) {
    const S = (a, b, c, d) => { if (b - a > 0.05 && d - c > 0.05) this.box((a + b) / 2, y - t / 2, (c + d) / 2, (b - a) / 2, t / 2, (d - c) / 2, color, { mat: o.mat || 'concrete', kind: 'floor' }) }
    if (!hole) { S(x0, x1, z0, z1); return }
    const [hx0, hx1, hz0, hz1] = hole
    S(x0, x1, z0, hz0); S(x0, x1, hz1, z1); S(x0, hx0, hz0, hz1); S(hx1, x1, hz0, hz1)
  }
  // A flight of stairs rising along local +z from (x, y0, z0) by `rise` over `run`, `w` wide: steps to see,
  // a ramp to walk.
  stairs(x, y0, z0, w, rise, run, color) {
    const n = Math.max(4, Math.round(rise / 0.19)), sh = rise / n, sd = run / n
    for (let i = 0; i < n; i++) this.box(x, y0 + sh * (i + 0.5), z0 + sd * (i + 0.5), w / 2, sh / 2, sd / 2 + 0.01, color, { collide: false })
    const ang = Math.atan2(rise, run), len = Math.hypot(rise, run) / 2
    this.box(x, y0 + rise / 2, z0 + run / 2, w / 2, 0.05, len, color, { pitch: -ang, kind: 'stairs', mat: 'concrete', collide: true, noBottom: true })
  }
  ladder(x, z, y0, y1, color, yawOff = 0) {
    this.box(x - 0.22, (y0 + y1) / 2, z, 0.03, (y1 - y0) / 2, 0.03, color, { collide: false })
    this.box(x + 0.22, (y0 + y1) / 2, z, 0.03, (y1 - y0) / 2, 0.03, color, { collide: false })
    for (let y = y0 + 0.3; y < y1; y += 0.35) this.box(x, y, z, 0.22, 0.02, 0.02, color, { collide: false })
    this.ladders.push({ x: this.tx(x, z), z: this.tz(x, z), y0: this.oy + y0, y1: this.oy + y1, yaw: this.yaw + yawOff })
  }
  // Bakes what was added into a geometry (vertex colours, flat shaded by the material).
  geometry() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1))
    g.computeBoundingSphere()
    return g
  }
  get tris() { return this.idx.length / 3 }
}

// Slight variations of a colour (hash-seeded), so a street is not one paint.
export function vary(c, r, amt = 0.08) {
  const k = 1 + (r() - 0.5) * amt * 2
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]
}
