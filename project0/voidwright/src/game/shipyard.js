// The shipyard: designs drawn as hull profiles (a half-width and a floor and roof at points along the
// length, round or square in section, plus wings, pods and towers), skinned with bevelled plating, then
// fitted out by rule: a cockpit at the front of the highest deck, decks inside the bigger hulls, gyros,
// power and tanks on the decks, guns, turrets, drills or holds for the ship's job, lights and masts, and
// last of all thrusters on all six sides, mirrored left and right, until each way has the push it needs.
// Every part is placed only where its cells are free and it touches the ship, so each design is one piece.
import { R, F, BK, UPR, DNR, LF, RT, UPSIDE, BP, Shape, skin } from './bpkit.js'
import { BLOCKS } from '../grid/blocks.js'
import { ROTS } from '../grid/rot.js'
import { SHIPYARD_DATA } from './shipyard-data.js'

const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
const HULL = id => /^(light|heavy)_/.test(id) || id.startsWith('hull_')
const G = 9.81
const kk = (x, y, z) => (x + 1024) * 4194304 + (y + 1024) * 2048 + (z + 1024)

// ---- a blueprint that knows which cells are taken ----
class Yard {
  constructor(name, size, o) { this.b = new BP(name, size, o); this.size = size; this.cell = new Map() }
  get blocks() { return this.b.bp.blocks }
  foot(id, i, j, k, rot) {
    const S = BLOCKS[id]?.sizes[this.size]; if (!S) return null
    const M = ROTS[rot], out = []
    for (let a = 0; a < S[0]; a++) for (let b = 0; b < S[1]; b++) for (let c = 0; c < S[2]; c++) out.push([i + M[0] * a + M[1] * b + M[2] * c, j + M[3] * a + M[4] * b + M[5] * c, k + M[6] * a + M[7] * b + M[8] * c])
    return out
  }
  index() { this.cell.clear(); for (const e of this.blocks) for (const c of this.foot(e[0], e[1], e[2], e[3], e[4]) || []) this.cell.set(kk(...c), e) }
  has(x, y, z) { return this.cell.has(kk(x, y, z)) }
  // place a block if its cells are free (hull may give way with `over`) and it touches the ship
  put(id, i, j, k, rot = 0, col = 0, o = {}) {
    const f = this.foot(id, i, j, k, rot); if (!f) return false
    const kill = new Set()
    for (const c of f) { const e = this.cell.get(kk(...c)); if (e) { if (o.over && HULL(e[0])) kill.add(e); else return false } }
    if (!o.free) {
      const own = new Set(f.map(c => kk(...c)))
      let t = false
      for (const c of f) { for (const s of N6) { const q = kk(c[0] + s[0], c[1] + s[1], c[2] + s[2]); if (own.has(q)) continue; const e = this.cell.get(q); if (e && !kill.has(e)) { t = true; break } } if (t) break }
      if (!t) return false
    }
    if (kill.size) { this.b.bp.blocks = this.blocks.filter(e => !kill.has(e)); for (const e of kill) for (const c of this.foot(e[0], e[1], e[2], e[3], e[4])) this.cell.delete(kk(...c)) }
    const e = [id, i, j, k, rot, col]
    this.blocks.push(e); for (const c of f) this.cell.set(kk(...c), e)
    return true
  }
  // the same block mirrored across x = 0 (for left-right symmetric parts)
  mirror(id, i, j, k, rot, col, o) {
    const f = this.foot(id, i, j, k, rot); if (!f) return false
    const xs = f.map(c => c[0]), lo = Math.min(...xs), hi = Math.max(...xs)
    if (lo === -hi) return true                       // on the centre line already
    return this.put(id, -hi + (i - lo), j, k, rot, col, o)
  }
  mass() { let m = 0; for (const e of this.blocks) m += BLOCKS[e[0]].mass[this.size] || 0; return m }
  bounds() {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]
    for (const q of this.cell.keys()) { const x = Math.floor(q / 4194304) - 1024, y = Math.floor(q / 2048) % 2048 - 1024, z = q % 2048 - 1024; const v = [x, y, z]; for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], v[a]); hi[a] = Math.max(hi[a], v[a]) } }
    return { lo, hi }
  }
  // places on the face of the ship looking along n (the outward normal): for each spot across that face, the
  // block slid in from outside until it meets the hull. Best spots first: nearest the middle, then `pick`.
  mount(id, rot, n, want, col = 0, o = {}) {
    const { lo, hi } = this.bounds(), ax = n[0] ? 0 : n[1] ? 1 : 2, u = (ax + 1) % 3, v = (ax + 2) % 3, sgn = n[ax]
    const S = BLOCKS[id]?.sizes[this.size]; if (!S) return 0
    const spots = []
    const step = o.step || 1
    for (let a = lo[u] - 2; a <= hi[u] + 2; a += step) for (let b = lo[v] - 2; b <= hi[v] + 2; b += step) {
      if (o.filter && !o.filter(a, b)) continue
      // slide in from outside
      const start = sgn > 0 ? hi[ax] + 8 : lo[ax] - 8, end = sgn > 0 ? lo[ax] - 1 : hi[ax] + 1
      let last = null
      for (let t = start; sgn > 0 ? t >= end : t <= end; t -= sgn) {
        const O = [0, 0, 0]; O[ax] = t; O[u] = a; O[v] = b
        const f = this.foot(id, O[0], O[1], O[2], rot)
        if (f.some(c => this.cell.has(kk(...c)))) break
        last = O
      }
      if (!last) continue
      const f = this.foot(id, last[0], last[1], last[2], rot)
      // must actually touch the hull on the inner side
      const own = new Set(f.map(c => kk(...c)))
      if (!f.some(c => { const q = kk(c[0] - n[0], c[1] - n[1], c[2] - n[2]); return !own.has(q) && this.cell.has(q) })) continue
      spots.push(last)
    }
    const mid = [0, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
    spots.sort((p, q) => (o.pick ? o.pick(p) - o.pick(q) : 0) || (Math.abs(p[0]) + Math.abs(p[1] - mid[1]) + Math.abs(p[2] - mid[2]) * 0.5) - (Math.abs(q[0]) + Math.abs(q[1] - mid[1]) + Math.abs(q[2] - mid[2]) * 0.5))
    let n0 = 0
    for (const p of spots) {
      if (n0 >= want) break
      if (o.spacing && this.blocks.some(e => e[0] === id && Math.abs(e[1] - p[0]) + Math.abs(e[2] - p[1]) + Math.abs(e[3] - p[2]) < o.spacing)) continue
      if (!this.put(id, p[0], p[1], p[2], rot, col)) continue
      n0++
      if (o.mirror !== false && ax !== 0 && n0 < want) { if (this.mirror(id, p[0], p[1], p[2], rot, col) && this.foot(id, ...p, rot).some(c => c[0] !== 0)) n0++ }
    }
    return n0
  }
  // interior: free cells inside the hull standing on a floor (a deck or the bottom plating)
  floorSpots(shape) {
    const out = []
    for (const [x, y, z] of shape.c.values()) {
      if (this.has(x, y, z) || !this.has(x, y - 1, z)) continue
      out.push([x, y, z])
    }
    return out
  }
}

// ---- hull drawing ----
// keys: [z, half-width, floor, roof], straight lines between; round: elliptical in section
function hull(s, keys, col = 0, o = {}) {
  for (let i = 0; i + 1 < keys.length; i++) {
    const [z0, w0, b0, t0] = keys[i], [z1, w1, b1, t1] = keys[i + 1]
    for (let z = z0; z <= z1; z++) {
      const f = z1 === z0 ? 0 : (z - z0) / (z1 - z0), w = w0 + (w1 - w0) * f, yb = b0 + (b1 - b0) * f, yt = t0 + (t1 - t0) * f
      const W = Math.round(w), yc = (yb + yt) / 2, hh = (yt - yb) / 2 + 0.5
      for (let x = -W; x <= W; x++) for (let y = Math.round(yb); y <= Math.round(yt); y++) {
        if (o.round && (x / (w + 0.5)) ** 2 + ((y - yc) / hh) ** 2 > 1.04) continue
        s.add(x, y, z, col)
      }
    }
  }
  return s
}
const ring = (s, z0, z1, r0, r1, yc, col) => { for (let z = z0; z <= z1; z++) for (let x = -r1; x <= r1; x++) for (let y = yc - r1; y <= yc + r1; y++) { const d = Math.hypot(x, y - yc); if (d <= r1 + 0.4 && d >= r0 - 0.4) s.add(x, y, z, col) } }

// ---- fitting out ----
function fit(spec) {
  const size = spec.size, big = size === 'large', P = spec.P ?? 0, A = spec.A ?? 2
  const s = new Shape()
  spec.hull(s, P, A)
  if (spec.paint) s.paint(spec.paint)
  const Y = new Yard(spec.name, size, { desc: spec.desc, static: false })
  skin(Y.b, s, spec.weight || 'light', { solid: !!spec.solid })
  Y.index()
  const { lo, hi } = Y.bounds()
  // the cockpit: on the highest deck, as far forward as it goes
  const topAt = z => { for (let y = hi[1]; y >= lo[1]; y--) if (s.has(0, y, z)) return y; return null }
  let maxTop = -1e9; for (let z = lo[2]; z <= hi[2]; z++) { const t = topAt(z); if (t != null) maxTop = Math.max(maxTop, t) }
  let seated = false
  for (let z = lo[2]; z <= hi[2] && !seated; z++) {
    const t = topAt(z); if (t == null || t < maxTop - (spec.bridgeDrop ?? 1)) continue
    if (big) seated = Y.put('cockpit', 0, t, z, F, A, { over: true }) && (Y.put('window_slope', 0, t + 1, z, F, 0) || true)
    else seated = Y.put('canopy', -1, t + 1, z, 0, A)
  }
  if (!seated) Y.mount(big ? 'cockpit' : 'canopy', 0, [0, 1, 0], 1, A, { mirror: false })
  // decks inside a hollow hull
  if (!spec.solid && spec.decks) {
    for (let y = lo[1] + 1; y < hi[1] - 1; y += spec.decks) for (const [x, yy, z] of s.c.values()) if (yy === y && !Y.has(x, y, z)) Y.put('hull_grate', x, y, z, 0, 1, { free: true })
  }
  // machines: on the floors inside, or set into a solid hull
  const inside = !spec.solid
  let spots = inside ? Y.floorSpots(s) : []
  const cz = (lo[2] + hi[2]) / 2
  spots.sort((p, q) => (Math.abs(p[0]) + Math.abs(p[2] - cz) * 0.3) - (Math.abs(q[0]) + Math.abs(q[2] - cz) * 0.3))
  let deepList = null
  const deep = () => deepList || (deepList = [...s.c.values()].filter(([x, y, z]) => N6.every(d => s.has(x + d[0], y + d[1], z + d[2]))).sort((p, q) => (Math.abs(p[0]) + Math.abs(p[2] - cz) * 0.3) - (Math.abs(q[0]) + Math.abs(q[2] - cz) * 0.3)))
  const place = (id, n, rot = 0, col = 0) => {
    let k = 0
    if (inside) { for (const p of spots) { if (k >= n) break; if (Y.put(id, p[0], p[1], p[2], rot, col)) k++ } }
    if (k < n) for (const p of deep()) { if (k >= n) break; if (Y.put(id, p[0], p[1], p[2], rot, col, { over: true })) k++ }
    if (k < n && inside) for (const p of spots) { if (k >= n) break; if (Y.put(id, p[0], p[1], p[2], rot, col, { over: true })) k++ }
    return k
  }
  const est = Y.mass() * 1.35
  const kit = spec.kit || {}
  if (big) {
    if (est > 400000) place('core_big', Math.max(1, Math.round(est / 3e6)))
    place('core_small', kit.cores ?? 2); place('battery', kit.batteries ?? 2)
    if (kit.tanks) place('tank_h2', kit.tanks, 0, 1)
    if (kit.holds) place('cargo_l', kit.holds, 0, P)
    if (kit.gravgens) place('gravgen', kit.gravgens)
    if (kit.medbay) place('medbay', 1, 0, 3)
    if (kit.kit) place('survival_kit', 1, 0, 3)
    if (kit.beds) place('bed', kit.beds, 0, 6)
    if (kit.jump) place('jumpdrive', 1)
  } else {
    place('battery', kit.batteries ?? 1); place('core_small', 1)
    if (kit.holds) place('cargo_l', kit.holds, 0, P)
    if (kit.jump) place('jumpdrive', 1)
  }
  // the ship's job
  if (spec.guns) { Y.mount('gun_auto', F, [0, 0, -1], spec.guns, A, { pick: p => -Math.abs(p[0]) * 0.2 }); if (spec.rockets) Y.mount('gun_rocket', F, [0, 0, -1], spec.rockets, A) }
  if (spec.turrets) { Y.mount('turret_gatling', 0, [0, 1, 0], spec.turrets, A, { spacing: 7, step: 2 }); if (spec.missiles) Y.mount('turret_missile', 0, [0, 1, 0], spec.missiles, A, { spacing: 9, step: 2 }); if (spec.underTurrets) Y.mount('turret_gatling', UPSIDE, [0, -1, 0], spec.underTurrets, A, { spacing: 8, step: 2 }) }
  if (spec.drills) Y.mount('drill', F, [0, 0, -1], spec.drills, A, { spacing: 3 })
  // lights and masts
  Y.mount('beacon', 0, [0, 1, 0], 1, 0, { mirror: false, pick: p => p[2] })
  if (big) { Y.mount('antenna', 0, [0, 1, 0], spec.masts ?? 1, 0, { pick: p => -p[2] }); if (spec.dish) Y.mount('dish', 0, [0, 1, 0], 1, 0, { mirror: false, pick: p => -p[2] * 0.5 }) }
  Y.mount('flood', 0, [0, 0, -1], 2, 0)
  Y.mount('warnlight', 0, [0, 1, 0], big ? 4 : 2, 0, { spacing: 6, pick: p => Math.abs(p[2] - cz) < 3 ? 0 : 1 })
  if (big && spec.portholes !== false) {
    const midY = Math.round((lo[1] + hi[1]) / 2)
    for (let z = lo[2] + 3; z <= hi[2] - 3; z += 3) for (const sx of [1, -1]) {
      let x = null; for (let xx = hi[0] * sx; Math.abs(xx) >= 0; xx -= sx) { if (s.has(xx, midY, z)) { x = xx; break } if (xx === 0) break }
      if (x == null) continue
      const e = Y.cell.get(kk(x, midY, z))
      if (e && e[0].endsWith('_cube') && !Y.has(x + sx, midY, z)) Y.put('porthole', x, midY, z, R([sx, 0, 0]), P, { over: true })
    }
  }
  // gyros: enough to turn the ship
  const m1 = Y.mass() * 1.3
  place('gyro', Math.max(1, Math.min(big ? 70 : 12, Math.ceil(m1 / (big ? 1.4e5 : 9000)))))
  // thrust last, until each way has its push (accel in m/s/s; up counts gravity)
  const acc = spec.accel || {}
  const want = { f: acc.f ?? (big ? 8 : 18), b: acc.b ?? (acc.f ?? (big ? 8 : 18)) * 0.6, up: acc.up ?? 1.4 * G, down: acc.down ?? (big ? 4 : 8), side: acc.side ?? (big ? 4 : 8) }
  const axes = [['f', F, [0, 0, 1]], ['b', BK, [0, 0, -1]], ['up', UPR, [0, -1, 0]], ['down', DNR, [0, 1, 0]], ['side', RT, [-1, 0, 0]], ['side', LF, [1, 0, 0]]]
  for (let pass = 0; pass < 2; pass++) {
    const m = Y.mass()
    for (const [k, rot, n] of axes) {
      let have = Y.blocks.filter(e => e[0].startsWith('thr_') && e[4] === rot).reduce((t, e) => t + BLOCKS[e[0]].func.thruster.force[size], 0)
      const need = want[k] * m
      for (const id of ['thr_h2_big', 'thr_h2_small']) {
        const f = BLOCKS[id].func.thruster.force[size]
        if (have >= need || (id === 'thr_h2_big' && need - have < f * 0.6)) continue
        let count = Math.ceil((need - have) / f); if (count > 1 && count % 2) count++
        have += Y.mount(id, rot, n, count, 1) * f
      }
    }
  }
  Y.b.bp.desc = (spec.desc || '').replace('{n}', Y.blocks.length.toLocaleString('en'))
  return Y.b.bp
}

// ---- the designs ----
const SPECS = {
  // small grid
  wasp: { name: 'Wasp', size: 'small', solid: true, P: 8, A: 2, desc: 'Interceptor: two autocannons and two rocket pods, very fast.',
    hull: (s, P, A) => { hull(s, [[-15, 0.5, 1, 1], [-11, 2, 0, 2], [-2, 3, 0, 3], [8, 3, 0, 3], [11, 2, 1, 3]], P); for (let x = 4; x <= 10; x++) for (let z = -3 + (x - 4); z <= 6; z++) { s.add(x, 1, z, x > 8 ? A : P); s.add(-x, 1, z, x > 8 ? A : P) } s.sym(2, 2, 4, 6, 6, 10, A) },
    guns: 2, rockets: 2, accel: { f: 30 } },
  kite: { name: 'Kite', size: 'small', solid: true, P: 5, A: 6, desc: 'Racer: a slim hull on long glider wings, the fastest thing in the yard.',
    hull: (s, P, A) => { hull(s, [[-20, 0.5, 1, 1], [-14, 1.5, 0, 2], [6, 2, 0, 2], [11, 1, 1, 2]], P); for (let x = 3; x <= 14; x++) for (let z = -2 + Math.floor((x - 3) / 3); z <= 3; z++) { s.add(x, 1, z, x > 12 ? A : P); s.add(-x, 1, z, x > 12 ? A : P) } s.add(0, 3, 9, A).add(0, 4, 10, A).add(0, 3, 10, A) },
    accel: { f: 40, side: 14 } },
  hornet: { name: 'Hornet', size: 'small', solid: true, P: 11, A: 2, desc: 'Strike craft: heavy plating, four autocannons and four rocket pods under stub wings.', weight: 'heavy',
    hull: (s, P, A) => { hull(s, [[-13, 1, 0, 2], [-8, 3, 0, 4], [8, 4, 0, 4], [12, 3, 1, 4]], P); s.sym(5, 9, 1, 2, -3, 5, P).sym(10, 10, 1, 3, 0, 5, A) },
    guns: 4, rockets: 4, accel: { f: 22 } },
  skiff: { name: 'Skiff', size: 'small', P: 9, A: 7, desc: 'Hauler: a boxy hull round a cargo hold, a canopy on its nose.',
    hull: (s, P, A) => { hull(s, [[-12, 2, 0, 3], [-8, 5, 0, 7], [12, 5, 0, 7]], P); s.sym(6, 6, 2, 5, -4, 10, A) }, decks: 0, kit: { holds: 2 }, accel: { f: 12 } },
  // large grid
  courier: { name: 'Courier', size: 'large', P: 13, A: 7, desc: 'Fast light freighter: a hold, a jump drive and long fins.',
    hull: (s, P, A) => { hull(s, [[-11, 0.5, 1, 1], [-8, 2, 0, 3], [7, 3, 0, 4], [10, 2, 1, 3]], P); s.sym(4, 6, 2, 2, 3, 9, A).sym(3, 3, 5, 6, 6, 9, A) }, decks: 0, kit: { holds: 1, jump: true }, accel: { f: 10 } },
  pelican: { name: 'Pelican', size: 'large', P: 3, A: 12, desc: 'Dropship: a wide body on broad wings, room inside for a crew and their gear.',
    hull: (s, P, A) => { hull(s, [[-10, 1, 1, 2], [-7, 3, 0, 4], [8, 3, 0, 5], [11, 2, 1, 5]], P); for (let x = 4; x <= 10; x++) for (let z = -2 + Math.floor((x - 4) / 2); z <= 7; z++) { s.add(x, 1, z, x > 9 ? A : P); s.add(-x, 1, z, x > 9 ? A : P) } s.sym(2, 2, 6, 8, 8, 11, A) },
    decks: 0, kit: { medbay: true, kit: true, beds: 2 }, guns: 2, accel: { f: 9 } },
  harrow: { name: 'Harrow', size: 'large', P: 4, A: 5, weight: 'heavy', desc: 'Mining barge: four drills across a wide flat bow, two big holds behind.',
    hull: (s, P, A) => { hull(s, [[-8, 6, 0, 3], [10, 6, 0, 5], [13, 4, 1, 5]], P); s.box(-2, 2, 6, 7, 2, 8, A) }, decks: 0, drills: 4, kit: { holds: 2, cores: 2 }, accel: { f: 6, up: 1.25 * G } },
  sentinel: { name: 'Sentinel', size: 'large', P: 0, A: 12, desc: 'Frigate: a long wedge with eight gatling turrets (two underneath) and two missile turrets, a raised bridge.',
    hull: (s, P, A) => { hull(s, [[-20, 1, 1, 1], [-13, 3, 0, 3], [4, 5, 0, 5], [15, 5, 0, 5], [17, 4, 1, 5]], P); s.box(-2, 2, 6, 8, 5, 11, P).box(-1, 1, 9, 9, 6, 10, A); s.sym(6, 8, 1, 3, 4, 15, A) },
    decks: 4, turrets: 6, missiles: 2, underTurrets: 2, kit: { gravgens: 1, medbay: true, beds: 4, jump: true }, accel: { f: 7 } },
  tortoise: { name: 'Tortoise', size: 'large', P: 9, A: 5, desc: 'Bulk hauler: a long spine carrying two rows of container bays, a cab forward.',
    hull: (s, P, A) => { hull(s, [[-14, 1, 0, 2], [-10, 3, 0, 4], [-4, 3, 0, 4], [34, 2, 1, 3]], P); for (let z = -2; z <= 30; z += 8) s.sym(3, 8, -1, 6, z, z + 6, (z / 8) % 2 ? A : 10) },
    decks: 0, kit: { holds: 6, tanks: 2, jump: true }, accel: { f: 4, up: 1.2 * G } },
  monarch: { name: 'Monarch', size: 'large', P: 14, A: 7, desc: 'Cruiser: three decks inside, a tower bridge, fourteen turrets and a jump drive.',
    hull: (s, P, A) => { hull(s, [[-32, 1, 1, 2], [-24, 4, 0, 5], [-4, 8, 0, 9], [24, 8, 0, 9], [30, 6, 1, 8]], P); s.box(-3, 3, 10, 15, 12, 22, P).box(-2, 2, 15, 16, 13, 18, A); s.sym(9, 12, 2, 6, 6, 26, A) },
    decks: 4, turrets: 8, missiles: 2, underTurrets: 4, masts: 2, dish: true, kit: { gravgens: 3, medbay: true, kit: true, beds: 8, holds: 2, jump: true, tanks: 2 }, accel: { f: 5, up: 1.2 * G } },
  // massive
  leviathan: { name: 'Leviathan', size: 'large', P: 0, A: 12, desc: 'Dreadnought, 270 m long: a vast armoured wedge with gun decks, a citadel tower, fifty turrets. Too heavy to hover on a world: a ship for space.',
    hull: (s, P, A) => { hull(s, [[-60, 2, 2, 4], [-46, 8, 0, 10], [-12, 14, 0, 16], [44, 14, 0, 16], [56, 10, 2, 13]], P); s.box(-5, 5, 17, 27, 20, 36, P).box(-3, 3, 28, 31, 24, 32, A); s.sym(15, 19, 3, 10, -8, 40, A) },
    decks: 8, turrets: 30, missiles: 10, underTurrets: 10, masts: 3, dish: true, kit: { gravgens: 8, medbay: true, kit: true, beds: 16, holds: 4, jump: true, tanks: 4, cores: 4, batteries: 6 }, accel: { f: 2.5, b: 1.5, up: 2, down: 1.5, side: 1.2 } },
  ark: { name: 'Ark', size: 'large', P: 10, A: 7, desc: 'Colony ship, 300 m long: a round hull with three great rings, decks for a town inside, fourteen turrets to keep it safe.',
    hull: (s, P, A) => { hull(s, [[-62, 3, 6, 10], [-52, 11, 0, 16], [52, 11, 0, 16], [62, 6, 3, 13]], P, { round: true }); for (const z of [-30, 0, 30]) { ring(s, z, z + 4, 16, 19, 8, A); s.sym(9, 17, 7, 9, z + 1, z + 3, P).box(-1, 1, 15, 25, z + 1, z + 3, P).box(-1, 1, -9, 1, z + 1, z + 3, P) } },
    decks: 8, missiles: 6, turrets: 8, masts: 4, dish: true, kit: { gravgens: 10, medbay: true, kit: true, beds: 30, holds: 6, jump: true, tanks: 6, cores: 4, batteries: 6 }, accel: { f: 2, b: 1.2, up: 1.5, down: 1.2, side: 1 } },
  colossus: { name: 'Colossus', size: 'large', P: 5, A: 9, desc: 'Super hauler, 250 m long: a spine and bridge carrying sixteen container bays.',
    hull: (s, P, A) => { hull(s, [[-52, 2, 0, 3], [-46, 6, 0, 8], [40, 6, 0, 8], [48, 3, 1, 5]], P); s.box(-3, 3, 9, 14, -46, -38, P); for (let z = -32; z <= 32; z += 9) { s.sym(7, 15, -4, 12, z, z + 7, ((z + 32) / 9) % 2 ? A : 13) } },
    decks: 0, missiles: 4, masts: 2, dish: true, kit: { holds: 12, tanks: 4, jump: true, cores: 3, batteries: 4, gravgens: 1 }, accel: { f: 2, b: 1.2, up: 1.6, down: 1.2, side: 1 } },
}

// the designs as the game loads them: built ahead of time by tools/shipyard-bake.mjs into shipyard-data.js
// (drawing and fitting out a 16,000-block ship takes seconds; reading it back takes milliseconds)
export const SHIPYARD_BUILD = Object.fromEntries(Object.entries(SPECS).map(([id, spec]) => [id, () => fit(spec)]))
function unpack(d) {
  const bp = { name: d.name, size: d.size, static: false, ground: false, desc: d.desc, blocks: [] }
  const v = d.b.join('').split(',').map(Number)
  for (let i = 0; i + 5 < v.length + 1; i += 6) if (d.ids[v[i]] && BLOCKS[d.ids[v[i]]]) bp.blocks.push([d.ids[v[i]], v[i + 1], v[i + 2], v[i + 3], v[i + 4], v[i + 5]])
  return bp
}
export const SHIPYARD = Object.fromEntries(Object.keys(SPECS).map(id => [id, () => SHIPYARD_DATA[id] ? unpack(SHIPYARD_DATA[id]) : fit(SPECS[id])]))
export const SHIPYARD_SMALL = ['wasp', 'kite', 'hornet', 'skiff']
export const SHIPYARD_LARGE = ['courier', 'pelican', 'harrow', 'sentinel', 'tortoise', 'monarch']
export const SHIPYARD_MASSIVE = ['leviathan', 'ark', 'colossus']
