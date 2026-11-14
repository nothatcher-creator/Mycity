// Weapons. Guns on a grid fire along their fronts while the pilot holds the left button; turrets turn by
// themselves onto enemies in reach; the engineer carries a rifle. Bullets fly as glowing tracers and break
// the block they hit; rockets accelerate (the turret's steer onto their target), burst on what they hit,
// break every block round the blast and blow a crater in rock. A destroyed warhead bursts too.
import * as THREE from 'three'
import { works } from '../grid/grid.js'
import { QUATS } from '../grid/rot.js'
import { patchMaterial } from '../world/atmo-glsl.js'

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion()
const Y = new THREE.Vector3(0, 1, 0), Xa = new THREE.Vector3(1, 0, 0), Za = new THREE.Vector3(0, 0, 1)
const MAXB = 400, MAXR = 80, MAXE = 48, MAXH = 64

// the turning heads of the turrets, in cell units with the pivot at the origin and the guns along -Z
function gatlingHead() {
  const parts = []
  const put = (geo, col, m) => { const g = geo.toNonIndexed(); g.applyMatrix4(m); const c = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) c.set(col, i); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); parts.push(g) }
  const M = (x, y, z, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(1, 1, 1))
  put(new THREE.BoxGeometry(0.62, 0.42, 0.62), [0.5, 0.52, 0.55], M(0, 0.06, 0.05))
  put(new THREE.BoxGeometry(0.66, 0.08, 0.5), [0.86, 0.55, 0.16], M(0, 0.29, 0.08))
  put(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10), [0.2, 0.21, 0.23], M(0, 0.06, -0.38, Math.PI / 2))
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; put(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 6), [0.16, 0.17, 0.18], M(Math.cos(a) * 0.09, 0.06 + Math.sin(a) * 0.09, -0.75, Math.PI / 2)) }
  put(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 10), [0.3, 0.31, 0.33], M(0, 0.06, -1.0, Math.PI / 2))
  put(new THREE.BoxGeometry(0.2, 0.22, 0.3), [0.25, 0.26, 0.28], M(0.38, 0.0, 0.1))
  return mergeAll(parts)
}
function missileHead() {
  const parts = []
  const put = (geo, col, m) => { const g = geo.toNonIndexed(); g.applyMatrix4(m); const c = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) c.set(col, i); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); parts.push(g) }
  const M = (x, y, z, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(1, 1, 1))
  put(new THREE.BoxGeometry(0.22, 0.34, 0.4), [0.45, 0.47, 0.5], M(0, 0.04, 0.12))
  for (const s of [-1, 1]) {
    put(new THREE.BoxGeometry(0.34, 0.4, 0.9), [0.76, 0.78, 0.8], M(s * 0.3, 0.1, -0.15))
    put(new THREE.BoxGeometry(0.36, 0.06, 0.92), [0.76, 0.2, 0.16], M(s * 0.3, 0.33, -0.15))
    for (const [dx, dy] of [[-0.08, 0.02], [0.08, 0.02], [-0.08, 0.18], [0.08, 0.18]]) put(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 8), [0.08, 0.08, 0.09], M(s * 0.3 + dx, dy, -0.61, Math.PI / 2))
  }
  return mergeAll(parts)
}
function mergeAll(parts) {
  let n = 0; for (const p of parts) n += p.attributes.position.count
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3)
  let o = 0
  for (const p of parts) { p.computeVertexNormals(); P.set(p.attributes.position.array, o * 3); N.set(p.attributes.normal.array, o * 3); C.set(p.attributes.color.array, o * 3); o += p.attributes.position.count }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3))
  return g
}

export class Combat {
  constructor(world) {
    this.W = world
    const e = this.engine = world.engine
    this.shots = []; this.rockets = []; this.blasts = []; this.pendingBlasts = []
    const add = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false })
    this.tracers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), add, MAXB)
    this.fire = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 8).translate(0, -0.5, 0).rotateX(-Math.PI / 2), add, MAXR)
    this.balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), add.clone(), MAXE)
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.45, envMap: world.env, envMapIntensity: 0.5 }), e.spaceUniforms, {})
    this.bodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.11, 1, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.6, roughness: 0.4 }), MAXR)
    this.heads = { gatling: new THREE.InstancedMesh(gatlingHead(), mat, MAXH), missile: new THREE.InstancedMesh(missileHead(), mat, MAXH) }
    for (const m of [this.tracers, this.fire, this.balls, this.bodies, this.heads.gatling, this.heads.missile]) {
      m.frustumCulled = false; e.scene.add(m)
      if (m.material.blending === THREE.AdditiveBlending) m.setColorAt(0, new THREE.Color(1, 1, 1))
      m.count = 0
    }
    this.m = new THREE.Matrix4(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(); this.c = new THREE.Color()
    this.warnT = 0; this.soundT = new Map(); this.time = 0
  }
  get game() { return this.W.game }
  // ---- firing ----
  // ammo for one shot from the grid's cargo (the engineer's own pack for the rifle); free in creative
  ammo(b, f, inv, grid) {
    if (this.W.creative) return true
    if ((b.ammoLeft || 0) > 0) { b.ammoLeft--; return true }
    const got = inv ? inv.take(f.ammo, 1) : this.W.netTake(grid, f.ammo, 1)
    if (got < 1) return false
    b.ammoLeft = Math.round(1 / f.per) - 1
    return true
  }
  sound(key, name, vol, at) {
    const t = this.soundT.get(key) || 0
    if (this.time - t < (name === 'gun' ? 0.11 : 0.05)) return
    this.soundT.set(key, this.time)
    const P = this.game.player
    let k = 1
    if (at && P) { const d = at.distanceTo(P.pos); const air = this.W.airAt(P.pos); k = Math.max(0, 1 - d / (air > 0.1 ? 1800 : 500)) * (air > 0.1 || d < 80 ? 1 : 0.35) }
    if (k > 0.03) this.game.sfx.play(name, vol * k, 0.92 + Math.random() * 0.16)
  }
  // a grid's fixed guns, while its pilot (or its pirate) holds the trigger
  fireGuns(g, dt, on) {
    if (!on || !g.parts?.guns.length) return 0
    let n = 0
    const ratio = g.power ? g.power.ratio : 1
    if (ratio < 0.05) return 0
    for (const b of g.parts.guns) {
      if (!works(b)) continue
      const f = b.def.func.gun
      b.cool = (b.cool || 0) - dt
      if (b.cool > 0) continue
      if (!this.ammo(b, f, null, g)) { if (g === this.game.player?.seat?.grid && this.time - this.warnT > 3) { this.warnT = this.time; this.game.hud.toast(`${b.def.name}: no ${f.ammo === 'ammo' ? 'ammo boxes' : 'rockets'} in the cargo`, '#ff5a45') } continue }
      b.cool += 1 / f.rate
      if (b.cool < 0) b.cool = 0
      const m = f.tubes ? f.tubes[(b.tube = ((b.tube || 0) + 1) % f.tubes.length)] : [f.muzzle[0], f.muzzle[1]]
      const S = b.def.sizes[g.size]
      const mp = g.toWorld(g.blockPoint(b, (S[0] - 1) / 2 + m[0], (S[1] - 1) / 2 + m[1], f.muzzle[2]))
      const dir = g.dirToWorld(g.blockDir(b, 0, 0, -1))
      this.spawn(f, g.size, mp, dir, g, g.pointVel(mp, new THREE.Vector3()), null)
      n++
    }
    if (n) this.sound('g' + g.id, g.parts.guns[0].def.func.gun.kind === 'rocket' ? 'rocket' : 'gun', g.size === 'large' ? 0.7 : 0.5, g.comWorld())
    return n
  }
  spawn(f, size, p, dir, src, baseVel, target) {
    const sp = f.spread || 0
    const d = dir.clone()
    if (sp) d.add(v1.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(sp * 2)).normalize()
    const rec = { p: p.clone(), d, src, dmg: f.dmg[size] ?? f.dmg, life: 0, range: f.range, owner: src?.faction || 'player' }
    if (f.kind === 'rocket') {
      Object.assign(rec, { v: d.clone().multiplyScalar(f.speed).add(baseVel || v2.set(0, 0, 0)), accel: f.accel, max: f.max, blast: f.blast[size] ?? f.blast, target, homing: !!f.homing && target })
      if (this.rockets.length < MAXR) this.rockets.push(rec)
    } else {
      rec.v = d.clone().multiplyScalar(f.speed).add(baseVel || v2.set(0, 0, 0))
      if (this.shots.length < MAXB) this.shots.push(rec)
    }
    this.flash(p, size === 'large' ? 0.9 : 0.35, 0.07, f.kind === 'rocket' ? [1, 0.6, 0.3] : [1, 0.8, 0.45])
  }
  // the engineer's rifle: from the eye along the view
  rifle(P, eye, dir, dt) {
    const f = RIFLE
    this.rifleCool = (this.rifleCool || 0) - dt
    if (this.rifleCool > 0) return
    if (!this.ammo(P, f, P.inv, null)) { if (this.time - this.warnT > 2) { this.warnT = this.time; this.game.hud.toast('Rifle: no ammo boxes in your inventory', '#ff5a45') } this.rifleCool = 0.3; return }
    this.rifleCool = 1 / f.rate
    const side = v1.set(0.18, -0.16, 0).applyQuaternion(this.engine.camQuat)
    this.spawn(f, 'small', eye.clone().add(side), dir, 'player', P.vel, null)
    this.sound('rifle', 'gun', 0.35, null)
  }
  // ---- turrets: aim and shoot at whoever is the enemy of their grid ----
  enemiesOf(g) {
    const out = [], P = this.game.player
    if (g.faction === 'pirate') {
      const t = g.ai?.target
      if (t && t !== 'player' && this.W.grids.includes(t)) out.push(t)
      if (t === 'player' && P && !P.dead) out.push('player')
      return out
    }
    for (const o of this.W.grids) if (o.faction === 'pirate' && !o.ai?.disabled && o.blocks.size) out.push(o)
    return out
  }
  turrets(dt) {
    const P = this.game.player, cam = this.engine.camPos
    for (const g of this.W.grids) {
      const T = g.parts?.turrets
      if (!T?.length || g.frozen) continue
      const foes = this.enemiesOf(g)
      const ratio = g.power ? g.power.ratio : 1
      for (const b of T) {
        if (!works(b)) continue
        const f = b.def.func.turret, S = b.def.sizes[g.size], k = S[0], cs = g.cs
        const pivot = g.toWorld(g.blockPoint(b, (k - 1) / 2, (k - 1) / 2 - 0.5 * k + 0.62 * k, (k - 1) / 2), b.pivot || (b.pivot = new THREE.Vector3()))
        // the nearest enemy in reach
        let best = null, bd = f.range
        for (const o of foes) {
          const tp = o === 'player' ? v1.copy(P.pos).addScaledVector(P.up, 1) : o.comWorld(v1)
          const d = tp.distanceTo(pivot)
          if (d < bd) { bd = d; best = o }
        }
        b.yaw = b.yaw || 0; b.pitch = b.pitch || 0
        if (!best || ratio < 0.05) { b.pitch += (0 - b.pitch) * Math.min(1, dt * 0.8); continue }
        const tp = best === 'player' ? v1.copy(P.pos).addScaledVector(P.up, 1) : best.comWorld(v1)
        const tv = best === 'player' ? P.vel : best.vel
        const lead = tp.clone().addScaledVector(v2.copy(tv).sub(g.vel), f.kind === 'rocket' ? 0 : bd / f.speed)
        const bq = q1.copy(g.quat).multiply(QUATS[b.rot])
        const dl = lead.sub(pivot).applyQuaternion(bq.clone().invert())
        const wy = Math.atan2(-dl.x, -dl.z), wp = Math.max(-0.12, Math.min(1.45, Math.atan2(dl.y, Math.hypot(dl.x, dl.z))))
        let ey = wy - b.yaw; ey = Math.atan2(Math.sin(ey), Math.cos(ey))
        const ep = wp - b.pitch, st = f.turn * dt
        b.yaw += Math.max(-st, Math.min(st, ey)); b.pitch += Math.max(-st, Math.min(st, ep))
        b.cool = (b.cool || 0) - dt
        if (Math.abs(ey) < 0.06 && Math.abs(ep) < 0.06 && b.cool <= 0) {
          if (!this.ammo(b, f, null, g)) continue
          b.cool = 1 / f.rate
          const hq = bq.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Y, b.yaw)).multiply(new THREE.Quaternion().setFromAxisAngle(Xa, b.pitch))
          const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(hq)
          const off = f.kind === 'rocket' ? new THREE.Vector3((b.side = -(b.side || 1)) * 0.3, 0.1, -0.7) : new THREE.Vector3(0, 0.06, -1.05)
          const mp = pivot.clone().add(off.multiplyScalar(cs * k).applyQuaternion(hq))
          this.spawn(f, g.size, mp, dir, g, g.pointVel(mp, new THREE.Vector3()), best)
          this.sound('t' + g.id, f.kind === 'rocket' ? 'rocket' : 'gun', g.size === 'large' ? 0.55 : 0.4, pivot)
        }
      }
    }
  }
  // ---- what is in flight ----
  update(dt) {
    this.time += dt
    if (this.pendingBlasts.length) { const list = this.pendingBlasts.splice(0); for (const x of list) this.explode(...x) }
    this.turrets(dt)
    const W = this.W, P = this.game.player
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]
      const step = s.v.length() * dt
      s.life += step
      if (s.life > s.range) { this.shots.splice(i, 1); continue }
      const d = v1.copy(s.v).normalize()
      const hit = this.cast(s, d, step)
      if (hit) { this.hit(s, hit); this.shots.splice(i, 1); continue }
      s.p.addScaledVector(s.v, dt)
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]
      // speed up along the nose; a guided rocket turns its nose onto the target
      if (r.homing && r.target) {
        const tp = r.target === 'player' ? (P ? v2.copy(P.pos) : null) : (W.grids.includes(r.target) ? r.target.comWorld(v2) : null)
        if (tp) { const want = tp.sub(r.p).normalize(); r.d.lerp(want, Math.min(1, dt * 2.2)).normalize() }
      }
      const sp = Math.min(r.max, r.v.length() + r.accel * dt)
      r.v.lerp(v2.copy(r.d).multiplyScalar(sp), Math.min(1, dt * 3))
      r.d.copy(r.v).normalize()
      const step = r.v.length() * dt
      r.life += step
      if (r.life > r.range) { this.blast(r.p, r.blast, r.dmg, r.src); this.rockets.splice(i, 1); continue }
      const hit = this.cast(r, r.d, step)
      if (hit) { this.blast(hit.point, r.blast, r.dmg, r.src); this.rockets.splice(i, 1); continue }
      r.p.addScaledVector(r.v, dt)
      if (Math.random() < 0.5) W.sparks.burst(r.p.clone().addScaledVector(r.d, -0.6), 1, 0.6, 0xff9a50)
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) { const x = this.blasts[i]; x.t += dt; if (x.t > x.life) this.blasts.splice(i, 1) }
  }
  // the first thing along the path: a block, rock, or the engineer
  cast(s, d, len) {
    const W = this.W, P = this.game.player
    const skip = s.src && s.src !== 'player' ? s.src : (P?.seat?.grid || null)
    const h = W.raycast(s.p, d, len, skip)
    if (P && !P.dead && s.src !== 'player') {
      // the engineer as a capsule 1.8 m tall
      const a = v3.copy(P.pos).addScaledVector(P.up, 0.9)
      const t = Math.max(0, Math.min(len, v2.subVectors(a, s.p).dot(d)))
      if (v2.copy(s.p).addScaledVector(d, t).distanceTo(a) < 0.75 && (!h || t < h.dist) && !P.seat) return { player: true, dist: t, point: v2.clone() }
    }
    return h
  }
  hit(s, h) {
    const W = this.W
    if (h.player) { this.game.player.hurt(s.dmg > 200 ? 35 : 9, 'shot'); this.game.hud.flashHit?.(); return }
    if (h.block) {
      h.grid.lastHit = { by: s.src, t: this.time }
      if (h.grid.sleep > 1.5) h.grid.sleep = 0
      W.damage(h.grid, h.block, s.dmg)
      W.sparks.burst(h.point, 6, 3, 0xffc070)
      // a little push
      if (!h.grid.static && !h.grid.locked) h.grid.vel.addScaledVector(s.v, Math.min(0.02, 4 / h.grid.mass))
    } else if (h.solid) W.sparks.burst(h.point, 4, 2, 0xb0a090)
    this.flash(h.point, 0.5, 0.08, [1, 0.75, 0.4])
  }
  // a burst: blocks round it lose health by distance, rock is blown out, the engineer is hurt
  blast(p, r, dmg, src) { this.pendingBlasts.push([p.clone(), r, dmg, src]) }
  explode(p, r, dmg, src) {
    const W = this.W, P = this.game.player
    this.flash(p, r * 1.4, 0.55, [1, 0.62, 0.28])
    this.flash(p, r * 0.6, 0.25, [1, 0.95, 0.8])
    W.sparks.burst(p, 40, 9, 0xffa050)
    for (const g of [...W.grids]) {
      if (!g.blocks.size) continue
      if (g.comWorld(v1).distanceTo(p) > g.radius + r) continue
      const l = g.toLocal(p, v2).divideScalar(g.cs), R = Math.ceil(r / g.cs) + 1
      const hitList = new Set()
      for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let c = -R; c <= R; c++) {
        const bl = g.at(Math.round(l.x) + a, Math.round(l.y) + b, Math.round(l.z) + c)
        if (bl) hitList.add(bl)
      }
      for (const bl of hitList) {
        const d = g.toWorld(g.blockCenter(bl, v3)).distanceTo(p)
        if (d > r + g.cs * 0.5) continue
        g.lastHit = { by: src, t: this.time }
        W.damage(g, bl, dmg * Math.max(0.15, 1 - d / (r + g.cs * 0.5)))
      }
      if (!g.static && !g.locked && g.blocks.size) { g.vel.addScaledVector(g.comWorld(v1).sub(p).normalize(), Math.min(8, dmg * r * 0.3 / g.mass)); g.sleep = 0 }
    }
    // rock
    if (W.universe.solidsNear(p, r, []).length) W.survival.dig(p, r * 0.7, 0)
    if (P && !P.dead) { const d = P.pos.distanceTo(p); if (d < r * 2.2) P.hurt(Math.min(100, 120 * (1 - d / (r * 2.2))), 'blast') }
    const cd = this.engine.camPos.distanceTo(p)
    if (cd < 400) this.game.shake = Math.max(this.game.shake || 0, Math.min(1.2, r * 12 / Math.max(20, cd)))
    this.sound('b' + Math.round(p.x) + Math.round(p.z), 'boom', Math.min(1, r / 3), p)
  }
  flash(p, size, life, col) { if (this.blasts.length < MAXE) this.blasts.push({ p: p.clone(), size, life, t: 0, col }) }
  // ---- drawing ----
  draw() {
    const e = this.engine, m = this.m, P = this.p, S = this.s, q = q1
    let n = 0
    for (const s of this.shots) {
      if (n >= MAXB) break
      const len = Math.min(26, s.v.length() * 0.028)
      e.rel(v1.copy(s.p).addScaledVector(s.d, -len * 0.5), P)
      q.setFromUnitVectors(Za, s.d)
      const w = s.src === 'player' ? 0.05 : s.dmg > 100 ? 0.14 : 0.08
      m.compose(P, q, S.set(w, w, len)); this.tracers.setMatrixAt(n, m)
      this.tracers.setColorAt(n, this.c.setRGB(s.owner === 'pirate' ? 2.2 : 2.6, s.owner === 'pirate' ? 0.5 : 1.6, s.owner === 'pirate' ? 0.35 : 0.6)); n++
    }
    this.tracers.count = n
    let nr = 0
    for (const r of this.rockets) {
      if (nr >= MAXR) break
      e.rel(r.p, P); q.setFromUnitVectors(Za, r.d)
      m.compose(P, q, S.set(1, 1, 1.2)); this.bodies.setMatrixAt(nr, m)
      e.rel(v1.copy(r.p).addScaledVector(r.d, 0.6), P)
      const fl = 1.6 + Math.random() * 0.8
      m.compose(P, q, S.set(0.35, 0.35, fl)); this.fire.setMatrixAt(nr, m); this.fire.setColorAt(nr, this.c.setRGB(2.4, 1.3, 0.5)); nr++
    }
    this.bodies.count = nr; this.fire.count = nr
    let nb = 0
    for (const x of this.blasts) {
      if (nb >= MAXE) break
      const k = x.t / x.life, sz = x.size * (0.35 + 0.65 * Math.sqrt(k)), a = (1 - k) * (1 - k)
      e.rel(x.p, P); m.compose(P, q.identity(), S.set(sz, sz, sz)); this.balls.setMatrixAt(nb, m)
      this.balls.setColorAt(nb, this.c.setRGB(x.col[0] * 2.4 * a, x.col[1] * 2.4 * a, x.col[2] * 2.4 * a)); nb++
    }
    this.balls.count = nb
    // the turret heads where their blocks point them
    const cnt = { gatling: 0, missile: 0 }
    const cam = e.camPos
    for (const g of this.W.grids) {
      const T = g.parts?.turrets
      if (!T?.length || g.comWorld(v1).distanceTo(cam) > 3000 + g.radius) continue
      for (const b of T) {
        if (b.build < 1) continue
        const f = b.def.func.turret, k = b.def.sizes[g.size][0], hm = this.heads[f.head]
        if (cnt[f.head] >= MAXH) continue
        const pivot = g.toWorld(g.blockPoint(b, (k - 1) / 2, (k - 1) / 2 - 0.5 * k + 0.62 * k, (k - 1) / 2), v1)
        e.rel(pivot, P)
        q.copy(g.quat).multiply(QUATS[b.rot]).multiply(v2q.setFromAxisAngle(Y, b.yaw || 0)).multiply(v3q.setFromAxisAngle(Xa, b.pitch || 0))
        const sc = g.cs * k
        m.compose(P, q, S.set(sc, sc, sc)); hm.setMatrixAt(cnt[f.head]++, m)
      }
    }
    this.heads.gatling.count = cnt.gatling; this.heads.missile.count = cnt.missile
    for (const im of [this.tracers, this.fire, this.balls, this.bodies, this.heads.gatling, this.heads.missile]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true }
  }
}
const v2q = new THREE.Quaternion(), v3q = new THREE.Quaternion()
export const RIFLE = { kind: 'bullet', rate: 6, dmg: 38, speed: 600, range: 900, spread: 0.004, ammo: 'ammo', per: 0.02 }
