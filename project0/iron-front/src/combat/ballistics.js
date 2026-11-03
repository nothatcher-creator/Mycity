// Bullets as projectiles. Each one flies with its own velocity under gravity and air drag (so it drops and
// slows, and takes time to arrive), and each frame its path is swept as a segment so no wall is skipped.
// What it meets decides what happens next:
//  - soldiers: a hitbox per body part; arms and legs can be shot through
//  - walls and props: by material, a shallow hit on something hard glances off (ricochet) with less
//    energy, otherwise it passes through if it has the energy for that thickness (wood, sheet metal,
//    glass, sometimes brick), or stops and leaves a hole
//  - the ground and the water stop it (a splash, a puff of dirt)
//  - vehicles: their armour decides; explosive rounds blow up on contact
// Near misses suppress the soldiers they pass.
import * as THREE from 'three'
import { AMMO } from './weapons-data.js'
import { MATERIALS, raycastTerrain } from '../world/collision.js'
import { heightAt, waterLevel, surfaceAt } from '../world/heightfield.js'

const G = 9.81
const MAXP = 2400
const ARMOR_RESIST = 400000      // joules per metre of armour plate (scaled by the vehicle's armour)

// Hitboxes in the soldier's own frame (x right... +x is his left, +z forward), by stance.
const BOXES = {
  stand: [['head', -0.13, 0.13, 1.5, 1.8, -0.13, 0.14], ['torso', -0.2, 0.2, 0.97, 1.5, -0.15, 0.16], ['armR', -0.33, -0.2, 0.95, 1.5, -0.12, 0.35], ['armL', 0.2, 0.33, 0.95, 1.5, -0.12, 0.35], ['legR', -0.19, 0, 0, 0.97, -0.12, 0.14], ['legL', 0, 0.19, 0, 0.97, -0.12, 0.14]],
  crouch: [['head', -0.13, 0.13, 1.02, 1.3, -0.05, 0.22], ['torso', -0.2, 0.2, 0.55, 1.04, -0.15, 0.2], ['armR', -0.33, -0.2, 0.55, 1.0, -0.05, 0.4], ['armL', 0.2, 0.33, 0.55, 1.0, -0.05, 0.4], ['legR', -0.2, 0, 0, 0.6, -0.2, 0.4], ['legL', 0, 0.2, 0, 0.6, -0.2, 0.4]],
  prone: [['head', -0.13, 0.13, 0.05, 0.35, 0.55, 0.82], ['torso', -0.22, 0.22, 0.0, 0.32, -0.1, 0.56], ['armR', -0.38, -0.2, 0, 0.3, 0.2, 0.75], ['armL', 0.2, 0.38, 0, 0.3, 0.2, 0.75], ['legR', -0.22, 0, 0, 0.28, -1.05, -0.1], ['legL', 0, 0.22, 0, 0.28, -1.05, -0.1]],
}

export class Ballistics {
  constructor(game) {
    this.game = game
    this.list = []
    this.free = []
    this.hit = { t: 0, tOut: 0, nx: 0, ny: 0, nz: 0, c: null }
    this.stats = { fired: 0, hits: 0, ricochets: 0, penetrations: 0 }
  }
  // A shot: { origin, dir, ammo, v, owner (soldier), tracer, suppressed, vehicle (to skip), dmgMul }
  fire(o) {
    const a = AMMO[o.ammo]
    if (!a) return null
    let p = this.free.pop()
    if (!p) { if (this.list.length >= MAXP) return null; p = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), prev: new THREE.Vector3() } }
    p.alive = true
    p.pos.copy(o.origin); p.prev.copy(o.origin)
    p.vel.copy(o.dir).multiplyScalar(o.v ?? a.v)
    if (o.inherit) p.vel.add(o.inherit)
    p.v0 = o.v ?? a.v
    p.mass = a.mass / 1000
    p.drag = a.drag
    p.dmg = a.dmg * (o.dmgMul || 1)
    p.pen = a.pen || 0
    p.ammo = o.ammo
    p.a = a
    p.owner = o.owner || null
    p.team = o.owner?.team ?? o.team ?? null
    p.vehicle = o.vehicle || null
    p.tracer = !!o.tracer || !!a.rocket
    p.tracerColor = o.tracerColor || (p.team === 'nlf' ? [0.4, 1, 0.3] : [1, 0.45, 0.2])
    p.age = 0
    p.travel = 0
    p.ricochets = 0
    p.rocket = a.rocket ? { ...a.rocket, target: o.target || null, speed: a.v } : null
    p.passed = new Set()   // soldiers already passed through
    p.fuse = o.fuse || 0
    p.drop = !!o.drop
    this.list.push(p)
    this.stats.fired++
    return p
  }
  update(dt) {
    const G_ = this.game
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]
      if (!p.alive) { this.list[i] = this.list[this.list.length - 1]; this.list.pop(); this.free.push(p); continue }
      p.age += dt
      this.step(p, dt, G_)
      if (p.age > (p.rocket ? 12 : 7) || (p.alive && !p.rocket && !p.a.explosive && p.vel.lengthSq() < 90 * 90)) p.alive = false
    }
  }
  step(p, dt, G_) {
    const v = p.vel
    // rockets and missiles accelerate, guided ones steer to their target
    if (p.rocket) {
      const r = p.rocket
      r.speed = Math.min(r.max, r.speed + r.accel * dt)
      const dir = _d.copy(v).normalize()
      if (r.target && r.target.alive !== false && p.age > 0.3) {
        const tp = r.target.pos || r.target
        const want = _w.set(tp.x - p.pos.x, (tp.y + 1.2) - p.pos.y, tp.z - p.pos.z)
        if (r.guided === 'ground' && want.length() > 60) want.y += Math.min(80, want.length() * 0.25)   // a top-attack climb
        want.normalize()
        // flares can pull a missile away
        if (r.target.flares > 0 && Math.random() < dt * 2) r.target = null
        dir.lerp(want, Math.min(1, dt * (r.guided === 'air' ? 3.5 : 2.2))).normalize()
      }
      v.copy(dir).multiplyScalar(r.speed)
      if (Math.random() < 0.7) G_.fx.puff(p.pos.x, p.pos.y, p.pos.z, { s0: 0.3, s1: 1.6, life: 1.8, r: 0.85, g: 0.85, b: 0.85, a: 0.5, drag: 1 })
      G_.fx.flash(p.pos.x, p.pos.y, p.pos.z, { size: 0.5, life: 0.05, r: 1, g: 0.7, b: 0.3 })
    } else {
      // gravity and drag: dv = g dt - k |v| v dt
      const sp = v.length()
      const k = p.drag * sp * dt
      v.x -= v.x * k; v.z -= v.z * k; v.y -= v.y * k + G * dt
    }
    const len = v.length() * dt
    if (len <= 0) { p.alive = false; return }
    const dx = v.x / (len / dt), dy = v.y / (len / dt), dz = v.z / (len / dt)
    p.prev.copy(p.pos)
    this.trace(p, dx, dy, dz, len, G_, 0)
    if (p.alive) p.travel += len
    if (p.tracer && p.alive) G_.fx.tracer(p.pos.x, p.pos.y, p.pos.z, v.x, v.y, v.z, p.tracerColor)
  }
  // Follow the segment from p.pos along d for `len`, resolving what it hits (recursing after a ricochet or a
  // penetration, at most a few times).
  trace(p, dx, dy, dz, len, G_, depth) {
    if (depth > 4) { p.alive = false; return }
    const ox = p.pos.x, oy = p.pos.y, oz = p.pos.z
    let best = len, kind = null, obj = null, part = null
    const H = this.hit
    // the ground
    const tg = raycastTerrain(ox, oy, oz, dx, dy, dz, len, 0.8)
    if (tg >= 0 && tg < best) { best = tg; kind = 'ground' }
    // water
    const wl = waterLevel(ox, oz)
    if (wl > -50 && oy > wl && oy + dy * len < wl) { const tw = (oy - wl) / -dy; if (tw < best) { best = tw; kind = 'water' } }
    // walls and props
    const skip = c => (c.kind === 'glass' && !c.alive) || (p.vehicle && c.vehicle === p.vehicle)
    let wallHit = null
    if (G_.collision.raycast(ox, oy, oz, dx, dy, dz, best, H, skip)) { if (H.t < best) { best = H.t; kind = 'box'; obj = H.c; wallHit = { ...H } } }
    // vehicles
    if (G_.vehicles) for (const veh of G_.vehicles.list) {
      if (veh === p.vehicle || !veh.alive && veh.wreckT > 30) continue
      const t = veh.raycast(ox, oy, oz, dx, dy, dz, best, _vh)
      if (t >= 0 && t < best) { best = t; kind = 'vehicle'; obj = veh; wallHit = { ..._vh } }
    }
    // soldiers
    for (const s of G_.soldiersNear(ox + dx * len / 2, oz + dz * len / 2, len / 2 + 2)) {
      if (s === p.owner || s.dead || s.vehicle || p.passed.has(s)) continue
      const r = this.hitSoldier(s, ox, oy, oz, dx, dy, dz, best)
      if (r) { best = r.t; kind = 'soldier'; obj = s; part = r.part }
    }
    // near misses: suppress anyone the bullet passes close to
    if (!p.a.explosive || p.rocket) this.suppress(p, ox, oy, oz, dx, dy, dz, best, G_)
    const hx = ox + dx * best, hy = oy + dy * best, hz = oz + dz * best
    if (!kind) { p.pos.set(hx, hy, hz); return }
    // explosive rounds go off on anything
    if (p.a.explosive) {
      p.alive = false
      p.pos.set(hx - dx * 0.2, hy - dy * 0.2, hz - dz * 0.2)
      G_.explode(p.pos.x, p.pos.y, p.pos.z, p.a.explosive, p.owner, kind === 'vehicle' ? obj : null)
      if (kind === 'soldier' && obj) obj.hurt('torso', p.a.explosive.dmg, 3, p.owner, _d.set(dx, dy, dz), 'blast')
      return
    }
    const speed = p.vel.length()
    const energy = 0.5 * p.mass * speed * speed
    if (kind === 'ground' || kind === 'water') {
      p.alive = false
      p.pos.set(hx, hy, hz)
      if (kind === 'water') { G_.fx.impact(hx, wl, hz, 0, 1, 0, 'water'); G_.sfx?.impact('water', hx, wl, hz); return }
      const surf = surfaceAt(hx, hz, hy)
      const n = G_.normalAt(hx, hz)
      // a shallow hit on rock skips off
      if (surf === 'rock' || surf === 'asphalt') {
        const cos = -(dx * n[0] + dy * n[1] + dz * n[2])
        if (cos < 0.22 && Math.random() < 0.6 && p.ricochets < 2) { this.ricochet(p, hx, hy, hz, dx, dy, dz, n[0], n[1], n[2], speed, G_); return }
      }
      const col = surf === 'sand' ? [0.85, 0.78, 0.55] : surf === 'rock' ? [0.6, 0.58, 0.55] : surf === 'asphalt' ? [0.35, 0.35, 0.36] : [0.45, 0.36, 0.25]
      G_.fx.impact(hx, hy, hz, n[0], n[1], n[2], surf === 'rock' || surf === 'asphalt' ? 'chips' : 'dirt', col)
      G_.sfx?.impact(surf, hx, hy, hz)
      return
    }
    if (kind === 'soldier') {
      p.passed.add(obj)
      this.stats.hits++
      const dmg = p.dmg * Math.pow(Math.min(1.2, speed / p.v0), 1.6)
      const done = obj.hurt(part, dmg, p.pen, p.owner, _d.set(dx, dy, dz), 'bullet')
      G_.onHit?.(p.owner, obj, part, done)
      G_.fx.impact(hx, hy, hz, -dx, -dy, -dz, 'hit')
      // limbs and soft tissue: a full-power round goes on with what is left
      const loss = part.startsWith('arm') || part.startsWith('leg') ? 1300 : 2600
      if (energy > loss * 1.3 && p.pen >= 0.9) {
        const left = energy - loss
        p.vel.multiplyScalar(Math.sqrt(left / energy))
        p.pos.set(hx + dx * 0.05, hy + dy * 0.05, hz + dz * 0.05)
        this.trace(p, dx, dy, dz, Math.max(0, len - best), G_, depth + 1)
      } else { p.alive = false; p.pos.set(hx, hy, hz) }
      return
    }
    // a wall, a prop or a vehicle: its material and the angle decide
    const nx = wallHit.nx, ny = wallHit.ny, nz = wallHit.nz
    const isVeh = kind === 'vehicle'
    const M = isVeh ? MATERIALS[obj.armor > 0 ? 'armor' : 'sheetmetal'] : (MATERIALS[obj.mat] || MATERIALS.concrete)
    const cos = -(dx * nx + dy * ny + dz * nz)
    if (!isVeh && obj.kind === 'glass') {
      G_.city.breakGlass(obj)
      G_.fx.impact(hx, hy, hz, nx, ny, nz, 'glass')
      G_.sfx?.impact('glass', hx, hy, hz)
      p.vel.multiplyScalar(0.96)
      p.pos.set(hx + dx * 0.1, hy + dy * 0.1, hz + dz * 0.1)
      this.trace(p, dx, dy, dz, Math.max(0, len - best - 0.1), G_, depth + 1)
      return
    }
    if (!isVeh && obj.kind === 'explosive') {
      obj.hp = (obj.hp || 40) - p.dmg * 0.6
      if (obj.hp <= 0 && obj.alive) { obj.alive = false; G_.explode(obj.x, obj.y, obj.z, { radius: 8, dmg: 150, heat: 200 }, p.owner, null, true) }
    }
    // glancing off something hard
    if (M.ricochet > 0 && cos < 0.26 && Math.random() < M.ricochet * (1 - cos / 0.26) * 1.2 && p.ricochets < 3) {
      if (isVeh) obj.bulletHit?.(p, energy * 0.1, hx, hy, hz)
      this.ricochet(p, hx, hy, hz, dx, dy, dz, nx, ny, nz, speed, G_)
      return
    }
    // through it, or not: energy against resistance times the thickness crossed
    const thick = isVeh ? obj.armorThickness() : Math.max(0.005, Math.min(wallHit.tOut - wallHit.t, M.thin ?? 1.5))
    const need = (isVeh ? ARMOR_RESIST * Math.max(0.0005, obj.armor * 0.004) : M.resist * thick) / Math.max(0.2, p.pen) / Math.max(0.3, cos)
    if (isVeh) obj.bulletHit?.(p, energy, hx, hy, hz, need)
    if (energy > need && !(isVeh && obj.armor > 2)) {
      this.stats.penetrations++
      const left = energy - need
      p.vel.multiplyScalar(Math.sqrt(left / energy))
      // a little deflection on the way through
      const j = 0.04 * (1 - left / energy)
      const ndx = dx + (Math.random() - 0.5) * j, ndy = dy + (Math.random() - 0.5) * j, ndz = dz + (Math.random() - 0.5) * j, l = Math.hypot(ndx, ndy, ndz)
      p.vel.set(ndx / l, ndy / l, ndz / l).multiplyScalar(Math.sqrt(2 * left / p.mass))
      G_.fx.impact(hx, hy, hz, nx, ny, nz, M.fx, M.color)
      const out = isVeh ? 0.05 : Math.max(0.02, wallHit.tOut - wallHit.t + 0.02)
      p.pos.set(hx + dx * out, hy + dy * out, hz + dz * out)
      if (isVeh) obj.penetrated?.(p, hx, hy, hz, dx, dy, dz)
      this.trace(p, ndx / l, ndy / l, ndz / l, Math.max(0, len - best - out), G_, depth + 1)
      return
    }
    p.alive = false
    p.pos.set(hx, hy, hz)
    G_.fx.impact(hx, hy, hz, nx, ny, nz, M.fx, M.color)
    if (!isVeh && obj.kind !== 'tree') G_.fx.decal(hx, hy, hz, nx, ny, nz, 0.05 + p.mass * 3)
    G_.sfx?.impact(isVeh ? 'metal' : obj.mat, hx, hy, hz)
  }
  ricochet(p, hx, hy, hz, dx, dy, dz, nx, ny, nz, speed, G_) {
    this.stats.ricochets++
    p.ricochets++
    const d = dx * nx + dy * ny + dz * nz
    let rx = dx - 2 * d * nx, ry = dy - 2 * d * ny, rz = dz - 2 * d * nz
    rx += (Math.random() - 0.5) * 0.14; ry += (Math.random() - 0.5) * 0.1 + 0.02; rz += (Math.random() - 0.5) * 0.14
    const l = Math.hypot(rx, ry, rz)
    const keep = 0.35 + Math.random() * 0.25
    p.vel.set(rx / l, ry / l, rz / l).multiplyScalar(speed * keep)
    p.dmg *= keep
    p.pos.set(hx + nx * 0.02, hy + ny * 0.02, hz + nz * 0.02)
    p.tracer = p.tracer || Math.random() < 0.15
    G_.fx.impact(hx, hy, hz, nx, ny, nz, 'sparks')
    G_.sfx?.ricochet(hx, hy, hz)
  }
  hitSoldier(s, ox, oy, oz, dx, dy, dz, maxT) {
    // quick reject: distance from the segment to the soldier's middle
    const cy = s.pos.y + 0.9
    const px = s.pos.x - ox, py = cy - oy, pz = s.pos.z - oz
    const t0 = Math.max(0, Math.min(maxT, px * dx + py * dy + pz * dz))
    const qx = ox + dx * t0 - s.pos.x, qy = oy + dy * t0 - cy, qz = oz + dz * t0 - s.pos.z
    if (qx * qx + qy * qy + qz * qz > 1.7 * 1.7) return null
    // into his frame: +z forward, +x his left (the rig's frame)
    const c = Math.cos(s.yaw), sn = Math.sin(s.yaw)
    const lx0 = ox - s.pos.x, ly0 = oy - s.pos.y, lz0 = oz - s.pos.z
    const Lx = lx0 * c - lz0 * sn, Lz = lx0 * sn + lz0 * c
    const Dx = dx * c - dz * sn, Dz = dx * sn + dz * c
    const boxes = s.stanceT > 1.5 || s.down ? BOXES.prone : s.stanceT > 0.5 ? BOXES.crouch : BOXES.stand
    const shift = (s.lean || 0) * 0.3
    let best = null
    for (const [part, x0, x1, y0, y1, z0, z1] of boxes) {
      const up = part === 'head' || part === 'torso' || part.startsWith('arm')
      const t = slab(Lx, ly0, Lz, Dx, dy, Dz, x0 + (up ? shift : 0), x1 + (up ? shift : 0), y0, y1, z0, z1, maxT)
      if (t >= 0 && (!best || t < best.t)) best = { t, part }
    }
    return best
  }
  suppress(p, ox, oy, oz, dx, dy, dz, len, G_) {
    const energy = p.mass * p.vel.lengthSq()
    if (energy < 200) return
    for (const s of G_.soldiersNear(ox + dx * len / 2, oz + dz * len / 2, len / 2 + 5)) {
      if (s.dead || s === p.owner || s.team === p.team) continue
      const px = s.pos.x - ox, py = s.pos.y + 1.2 - oy, pz = s.pos.z - oz
      const t = Math.max(0, Math.min(len, px * dx + py * dy + pz * dz))
      const d = Math.hypot(ox + dx * t - s.pos.x, oy + dy * t - s.pos.y - 1.2, oz + dz * t - s.pos.z)
      if (d < 4) {
        s.suppression = Math.min(1, s.suppression + (4 - d) / 4 * 0.12 * (p.a.mass > 9 ? 1.6 : 1))
        s.underFire = p.owner?.pos ? p.owner.pos.clone() : null
        s.underFireT = s.time
        if (s.isPlayer) G_.onNearMiss?.(p, d, ox + dx * t, oy + dy * t, oz + dz * t)
      }
    }
  }
}
// Segment against an axis-aligned box: entry distance or -1.
function slab(ox, oy, oz, dx, dy, dz, x0, x1, y0, y1, z0, z1, maxT) {
  let tmin = 0, tmax = maxT
  for (const [o, d, a, b] of [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]]) {
    if (Math.abs(d) < 1e-9) { if (o < a || o > b) return -1; continue }
    let t1 = (a - o) / d, t2 = (b - o) / d
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t }
    if (t1 > tmin) tmin = t1
    if (t2 < tmax) tmax = t2
    if (tmin > tmax) return -1
  }
  return tmin
}
const _d = new THREE.Vector3(), _w = new THREE.Vector3(), _vh = { t: 0, nx: 0, ny: 0, nz: 0 }

// The angle to aim up so a bullet of this ammunition hits the line of sight at `range` metres (zeroing):
// a few iterations of the flight equations.
export function zeroAngle(ammoId, range, vmul = 1) {
  const a = AMMO[ammoId]; if (!a || range <= 0) return 0
  let ang = 0
  for (let it = 0; it < 6; it++) {
    let x = 0, y = 0, vx = Math.cos(ang) * a.v * vmul, vy = Math.sin(ang) * a.v * vmul
    const dt = 0.005
    while (x < range && Math.hypot(vx, vy) > 50) { const sp = Math.hypot(vx, vy), k = a.drag * sp * dt; vx -= vx * k; vy -= vy * k + G * dt; x += vx * dt; y += vy * dt }
    ang -= y / range
  }
  return ang
}
