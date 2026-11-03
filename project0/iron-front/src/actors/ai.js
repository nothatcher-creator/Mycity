// Soldier AI. Each soldier has a brain with limited senses: a field of view, sight lines that walls,
// terrain and smoke block, spotting that takes time (longer at range, against prone or still targets, at
// night or in fog), and ears for gunfire. Squads share what they know. In a fight they look for cover,
// peek out to fire bursts, keep their heads down under suppression, throw grenades at enemies behind cover,
// get away from grenades, flank a pinned enemy and fall back when the fight goes against them.
// Updates are spread over frames: senses a few times a second, decisions about twice a second.
import * as THREE from 'three'
import { hostile, FACTIONS } from './factions.js'
import { STAND, CROUCH, PRONE } from './soldier.js'
import { raycastTerrain } from '../world/collision.js'
import { heightAt, waterLevel } from '../world/heightfield.js'
import { Nav } from './nav.js'

export const FORMATIONS = {
  wedge: (i) => [((i % 2) ? 1 : -1) * Math.ceil(i / 2) * 4, -Math.ceil(i / 2) * 4],
  line: (i) => [((i % 2) ? 1 : -1) * Math.ceil(i / 2) * 5, -1],
  column: (i) => [0, -i * 4],
  file: (i) => [((i % 2) ? 1 : -1) * 1.5, -i * 3.5],
  diamond: (i) => [[0, -4], [-4, -8], [4, -8], [0, -12], [-6, -4], [6, -4]][(i - 1) % 6],
}

let squadId = 1
export class Squad {
  constructor(faction, o = {}) {
    this.id = squadId++
    this.faction = faction
    this.team = o.team ?? faction
    this.members = []
    this.order = o.order || { type: 'hold', pos: null }
    this.formation = o.formation || 'wedge'
    this.posture = o.posture || 'combat'   // 'aware' | 'combat' | 'stealth' | 'hold-fire'
    this.knowledge = new Map()              // enemy soldier -> { pos, t }
    this.player = !!o.player
    this.name = o.name || null
    this.home = o.home || null
    this.losses = 0
  }
  get leader() { return this.members.find(m => !m.dead) || null }
  get alive() { return this.members.filter(m => !m.dead) }
  share(enemy, pos, t) { const k = this.knowledge.get(enemy); if (!k || t > k.t) this.knowledge.set(enemy, { pos: pos.clone(), t }) }
}

export class Brain {
  constructor(s, squad, skill = 0.5) {
    this.s = s; this.squad = squad
    this.skill = skill                 // 0..1: reaction, accuracy, cover use
    this.state = 'idle'
    this.target = null; this.targetPos = new THREE.Vector3(); this.lastSeen = -99
    this.spot = new Map()              // enemy -> spotting progress 0..1
    this.senseT = Math.random() * 0.4; this.thinkT = Math.random() * 0.6
    this.move = null                   // where to go: Vector3
    this.cover = null; this.coverUntil = 0
    this.peekT = 0; this.peeking = false
    this.burst = 0; this.reactT = 0
    this.stuckT = 0; this.lastPos = s.pos.clone()
    this.nadeT = 10 + Math.random() * 10
    this.wpIdx = 0
    this.aimErr = new THREE.Vector2()
    this.alertDir = null
    this.flank = null
    this.holdFire = false
  }
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _h = { t: 0 }

export class AI {
  constructor(game) {
    this.game = game
    this.squads = []
    this.brains = new Map()
    this.time = 0
    this.nav = new Nav(game.collision)
    this.pathBudget = 3
  }
  add(s, squad, skill) {
    const b = new Brain(s, squad, skill ?? (FACTIONS[s.faction]?.skill || 0.5))
    this.brains.set(s, b)
    if (!squad.members.includes(s)) squad.members.push(s)
    s.brain = b
    s.ai = true
    s.allowDown = false
    return b
  }
  remove(s) { this.brains.delete(s); for (const q of this.squads) { const i = q.members.indexOf(s); if (i >= 0) q.members.splice(i, 1) } }
  squad(faction, o) { const q = new Squad(faction, o); this.squads.push(q); return q }
  // A shot was heard at (x, y, z): soldiers near enough turn towards it.
  heard(x, y, z, loud, shooter) {
    const r = loud
    for (const s of this.game.soldiersNear(x, z, r)) {
      const b = this.brains.get(s)
      if (!b || s.dead || !shooter || !hostile(s.team, shooter.team)) continue
      const d = Math.hypot(s.pos.x - x, s.pos.z - z)
      if (d > r) continue
      // they know roughly where it came from
      const err = d * 0.15
      b.alertDir = new THREE.Vector3(x + (Math.random() - 0.5) * err, y, z + (Math.random() - 0.5) * err)
      if (b.state === 'idle' || b.state === 'patrol') b.state = 'alert'
      b.squad.alertT = this.time
    }
  }
  update(dt, playerPos) {
    this.time += dt
    this.pathBudget = 3
    const G = this.game
    for (const [s, b] of this.brains) {
      if (s.dead) { if (!b.counted) { b.counted = true; b.squad.losses++ } continue }
      if (s.vehicle && !s.gunner) { this.inVehicle(s, b, dt); continue }
      const far = playerPos ? Math.hypot(s.pos.x - playerPos.x, s.pos.z - playerPos.z) : 0
      // far from the player they only walk their orders (cheap)
      if (far > 900) { this.farStep(s, b, dt); continue }
      b.senseT -= dt; b.thinkT -= dt
      if (b.senseT <= 0) { b.senseT = far < 250 ? 0.2 : 0.45; this.sense(s, b, b.senseT + 0.0001) }
      if (b.thinkT <= 0) { b.thinkT = 0.4 + Math.random() * 0.2; this.think(s, b) }
      this.act(s, b, dt)
      s.step(dt, G.W)
    }
  }
  // ---------- senses ----------
  sense(s, b, dt) {
    const G = this.game
    const vis = G.sky.visibility() * (s.nvg ? 2.5 : 1)
    const range = Math.min(vis, 900)
    const eye = s.eye(_v)
    const fwdx = Math.sin(s.yaw), fwdz = Math.cos(s.yaw)
    let best = null, bestScore = -1
    for (const e of G.soldiersNear(s.pos.x, s.pos.z, range)) {
      if (e.dead || !hostile(s.team, e.team)) continue
      const dx = e.pos.x - s.pos.x, dz = e.pos.z - s.pos.z, d = Math.hypot(dx, dz)
      if (d > range) { b.spot.delete(e); continue }
      // field of view: 130 degrees ahead, all round within 12 m or when alert
      const cos = (dx * fwdx + dz * fwdz) / (d || 1)
      if (cos < (b.state === 'combat' || b.state === 'alert' ? -0.3 : 0.42) && d > 12) { this.decay(b, e, dt); continue }
      // a line to the chest (or to the head of someone lying down)
      const ty = e.pos.y + (e.stanceT > 1.5 ? 0.3 : e.stanceT > 0.5 ? 0.9 : 1.35)
      // the chest, or failing that the head (someone behind low cover still shows his head)
      if (!this.canSee(eye.x, eye.y, eye.z, e.pos.x, ty, e.pos.z, e.vehicle) && !(e.stanceT < 1.5 && this.canSee(eye.x, eye.y, eye.z, e.pos.x, e.pos.y + e.eyeHeight + 0.1, e.pos.z, e.vehicle))) { this.decay(b, e, dt); continue }
      // how quickly he is spotted
      const stanceVis = e.stanceT > 1.5 ? 0.35 : e.stanceT > 0.5 ? 0.65 : 1
      const motion = e.speed > 0.5 ? 1.6 : 1
      const firing = G.time - (e.lastShotT ?? -99) < 1.5 && !e.w?.s.suppressed ? 3 : 1
      const rate = (1.2 + this.game.difficulty) * (0.5 + b.skill) * stanceVis * motion * firing / (1 + d / 70) * (e.vehicle ? 3 : 1) * (1 - G.sky.night * 0.5)
      const p = Math.min(1.5, (b.spot.get(e) || 0) + rate * dt * 2.5)
      b.spot.set(e, p)
      if (p >= 1) {
        b.squad.share(e, e.pos, this.time)
        const score = 1 / (d + 5) * (e === b.target ? 2 : 1) * (e.isPlayer ? 1.2 : 1)
        if (score > bestScore) { bestScore = score; best = e }
      }
    }
    if (best) {
      if (b.target !== best) b.reactT = 0.25 + (1 - b.skill) * 0.8 + Math.random() * 0.3
      b.target = best; b.targetPos.copy(best.pos); b.lastSeen = this.time
      if (b.state !== 'combat') b.state = 'combat'
    } else if (b.target && this.time - b.lastSeen > 8) {
      // lost him: go and look where he was last seen (unless told to hold)
      b.state = this.squadOrder(b).type === 'hold' || this.squadOrder(b).type === 'defend' ? 'alert' : 'search'
      b.alertDir = b.targetPos.clone()
      b.target = null
    }
    // enemies known to the squad but not seen by this soldier make him alert
    if (!best && b.state !== 'combat') for (const [e, k] of b.squad.knowledge) if (!e.dead && this.time - k.t < 10) { b.alertDir = k.pos.clone(); if (b.state === 'idle' || b.state === 'patrol') b.state = 'alert' }
  }
  decay(b, e, dt) { const p = (b.spot.get(e) || 0) - dt * 0.4; if (p <= 0) b.spot.delete(e); else b.spot.set(e, Math.min(p, 1.2)) }
  canSee(ax, ay, az, bx, by, bz, ignoreVeh) {
    const G = this.game
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz)
    if (d < 0.5) return true
    const ux = dx / d, uy = dy / d, uz = dz / d
    if (raycastTerrain(ax, ay, az, ux, uy, uz, d, 3) >= 0) return false
    if (G.collision.raycast(ax, ay, az, ux, uy, uz, d - 0.4, _h, c => c.kind === 'glass' || c.kind === 'fence' || (ignoreVeh && c.vehicle === ignoreVeh))) return false
    if (G.fx.smokeBlocks(ax, ay, az, bx, by, bz)) return false
    // foliage hides beyond 40 m
    return true
  }
  squadOrder(b) { return b.squad.order || { type: 'hold' } }
  // ---------- decisions ----------
  think(s, b) {
    const G = this.game, q = b.squad, order = this.squadOrder(b)
    // grenades nearby: run
    for (const n of G.grenades) if (n.type === 'frag' && n.pos.distanceTo(s.pos) < 9 && !n.exploded) { const away = _v.subVectors(s.pos, n.pos).setY(0).normalize().multiplyScalar(12).add(s.pos); b.move = away; b.flee = 2; s.setStance(STAND); return }
    if (b.flee > 0) { b.flee -= 0.5; return }
    // morale: lose half the squad and the rest fall back
    const lossFrac = q.losses / Math.max(1, q.members.length)
    if (b.state === 'combat' && (lossFrac > 0.6 || s.blood < 35) && q.home && Math.random() < 0.2 && !q.player) { b.state = 'retreat' }
    if (b.state === 'retreat') {
      b.move = q.home.clone(); s.setStance(STAND)
      if (s.pos.distanceTo(q.home) < 20) b.state = 'alert'
      return
    }
    if (b.state === 'combat' && b.target) {
      const d = s.pos.distanceTo(b.targetPos)
      // a grenade for an enemy we cannot hit behind cover at a throwable range
      b.nadeT -= 0.5
      if (b.nadeT <= 0 && d > 12 && d < 38 && this.time - b.lastSeen > 1.5 && s.inv.count('frag')) {
        b.nadeT = 18 + Math.random() * 12
        const dir = this.lob(s, b.targetPos)
        if (dir) { G.throwGrenade(s, 'frag', dir.clone().normalize(), dir.length() * 16); return }
      }
      // reload behind cover
      if (s.w && s.ammoInWeapon === 0) { s.reload(); b.wantCover = true }
      // find cover if exposed (the order may say hold the ground instead)
      if (!b.cover || this.time > b.coverUntil || !this.coverGood(b.cover, b.targetPos)) {
        const c = order.type !== 'hold-position' ? this.findCover(s, b.targetPos, d < 60 ? 25 : 40) : null
        if (c) { b.cover = c; b.coverUntil = this.time + 10 + Math.random() * 8; b.move = c.clone(); b.peeking = false }
        else { b.cover = null; b.move = null; s.setStance(d > 120 ? PRONE : CROUCH) }
      }
      // a squad leader sends one man round the side of a pinned enemy
      if (q.leader === s && !q.player && q.alive.length >= 3 && this.time - b.lastSeen < 3 && !q.flanker && Math.random() < 0.08) {
        const fl = q.alive.find(m => m !== s && m.brain && !m.brain.flank)
        if (fl) { const side = Math.random() < 0.5 ? 1 : -1; const dir = _v.subVectors(b.targetPos, s.pos).setY(0).normalize(); fl.brain.flank = new THREE.Vector3(b.targetPos.x - dir.x * 25 + dir.z * 35 * side, 0, b.targetPos.z - dir.z * 25 - dir.x * 35 * side); q.flanker = fl }
      }
      if (b.flank) { b.move = b.flank; if (s.pos.distanceTo(b.flank) < 6 || this.time - b.lastSeen > 15) { b.flank = null; if (q.flanker === s) q.flanker = null } }
      return
    }
    // no enemy in sight: follow the squad's orders in formation
    b.cover = null
    if (b.state === 'search' && b.alertDir) {
      b.move = b.alertDir.clone()
      if (s.pos.distanceTo(b.alertDir) < 8) { b.state = 'alert'; b.alertDir = null }
      s.setStance(CROUCH)
      return
    }
    const leader = q.leader
    const posture = q.posture
    if (order.type === 'follow' && order.target) {
      const L = order.target
      const i = Math.max(1, q.members.indexOf(s) + (q.player ? 1 : 0))
      const [ox, oz] = (FORMATIONS[q.formation] || FORMATIONS.wedge)(i)
      const c = Math.cos(L.yaw), sn = Math.sin(L.yaw)
      const tx = L.pos.x + ox * c + oz * sn, tz = L.pos.z - ox * sn + oz * c
      b.move = _v2.set(tx, 0, tz).clone()
      if (s.pos.distanceTo(b.move) < 2.5) b.move = null
      if (L.stance !== undefined) s.setStance(posture === 'stealth' ? (L.stance === PRONE ? PRONE : CROUCH) : L.stance)
      if (L.vehicle && !s.vehicle) G.vehicles?.requestSeat(s, L.vehicle)
      if (!L.vehicle && s.vehicle) G.vehicles?.exit(s)
    } else if (order.type === 'move' || order.type === 'attack') {
      if (leader === s || !leader) b.move = order.pos.clone()
      else {
        const i = q.members.indexOf(s)
        const [ox, oz] = (FORMATIONS[q.formation] || FORMATIONS.wedge)(i)
        const c = Math.cos(leader.yaw), sn = Math.sin(leader.yaw)
        b.move = new THREE.Vector3(leader.pos.x + ox * c + oz * sn, 0, leader.pos.z - ox * sn + oz * c)
      }
      if (leader === s && s.pos.distanceTo(order.pos) < 15) { if (order.type === 'attack') order.type = 'defend'; else order.type = 'hold'; order.radius = 25 }
    } else if (order.type === 'patrol' && order.route) {
      if (leader === s) {
        const wp = order.route[b.wpIdx % order.route.length]
        b.move = wp.clone()
        if (s.pos.distanceTo(wp) < 6) { b.wpIdx++; b.pause = 4 + Math.random() * 6 }
      } else {
        const i = q.members.indexOf(s)
        const [ox, oz] = (FORMATIONS[q.formation] || FORMATIONS.file)(i)
        const c = Math.cos(leader.yaw), sn = Math.sin(leader.yaw)
        b.move = new THREE.Vector3(leader.pos.x + ox * c + oz * sn, 0, leader.pos.z - ox * sn + oz * c)
        if (s.pos.distanceTo(b.move) < 2) b.move = null
      }
      s.setStance(b.state === 'alert' ? CROUCH : STAND)
    } else if (order.type === 'defend' || order.type === 'hold') {
      // spread round the point, at cover or windows if there are any
      if (!b.post && order.pos) {
        const spots = (G.city.spots || []).filter(p => (p.kind === 'window' || p.kind === 'roof' || p.kind === 'cover' || p.kind === 'mg') && Math.hypot(p.x - order.pos.x, p.z - order.pos.z) < (order.radius || 30))
        const sp = spots.length ? spots[Math.floor(Math.random() * spots.length)] : null
        const a = Math.random() * Math.PI * 2, r = Math.random() * (order.radius || 20)
        b.post = sp ? new THREE.Vector3(sp.x, sp.y, sp.z) : new THREE.Vector3(order.pos.x + Math.cos(a) * r, 0, order.pos.z + Math.sin(a) * r)
      }
      if (b.post) { b.move = s.pos.distanceTo(b.post) > 1.5 ? b.post.clone() : null }
      if (!b.move) s.setStance(b.state === 'alert' ? CROUCH : (posture === 'stealth' ? CROUCH : STAND))
    }
  }
  // A throw that lands near the target (a 45-degree lob), or null if the arc would hit something close.
  lob(s, tp) {
    const dx = tp.x - s.pos.x, dz = tp.z - s.pos.z, d = Math.hypot(dx, dz)
    const v = Math.sqrt(9.81 * Math.min(d, 38) / Math.sin(2 * 0.75))
    const dir = new THREE.Vector3(dx / d * Math.cos(0.75), Math.sin(0.75), dz / d * Math.cos(0.75))
    dir.multiplyScalar(v / 16)
    return dir
  }
  // Cover: a spot behind something solid, between us and the enemy, not too far, not further from him.
  findCover(s, enemy, radius) {
    const G = this.game
    let best = null, bestScore = Infinity
    const cands = []
    G.collision.query(s.pos.x - radius, s.pos.z - radius, s.pos.x + radius, s.pos.z + radius, c => {
      if (c.kind === 'glass' || c.kind === 'fence' || c.kind === 'floor' || c.kind === 'roof' || c.kind === 'stairs') return
      if (c.maxY - c.minY < 0.8 || c.maxY < s.pos.y + 0.7 || c.minY > s.pos.y + 1.5) return
      cands.push(c)
      if (cands.length > 60) return false
    })
    for (const spot of (G.city.spots || [])) if ((spot.kind === 'cover' || spot.kind === 'window') && Math.hypot(spot.x - s.pos.x, spot.z - s.pos.z) < radius) cands.push({ spot })
    for (const c of cands) {
      let px, pz
      if (c.spot) { px = c.spot.x; pz = c.spot.z }
      else {
        const ex = c.x - enemy.x, ez = c.z - enemy.z, el = Math.hypot(ex, ez) || 1
        const r = Math.max(c.hx, c.hz) + 0.7
        px = c.x + ex / el * r; pz = c.z + ez / el * r
      }
      const py = Math.max(heightAt(px, pz), G.collision.floorAt(px, s.pos.y + 1, pz, 0.5, 3))
      if (Math.abs(py - s.pos.y) > 3) continue
      if (waterLevel(px, pz) > py - 0.5) continue
      const dSelf = Math.hypot(px - s.pos.x, pz - s.pos.z), dEnemy = Math.hypot(px - enemy.x, pz - enemy.z)
      if (dEnemy < 8) continue
      // the spot must be hidden from him when crouching
      if (this.canSee(px, py + 0.9, pz, enemy.x, enemy.y + 1.4, enemy.z)) continue
      const score = dSelf * 1.2 + Math.max(0, dEnemy - s.pos.distanceTo(enemy)) * 0.6 + Math.random() * 3
      if (score < bestScore) { bestScore = score; best = new THREE.Vector3(px, py, pz) }
    }
    return best
  }
  coverGood(c, enemy) { return !this.canSee(c.x, c.y + 0.9, c.z, enemy.x, enemy.y + 1.4, enemy.z) }
  // ---------- doing ----------
  act(s, b, dt) {
    const G = this.game, inp = s.input
    inp.fwd = 0; inp.side = 0; inp.sprint = false; inp.jump = false
    s.leanTarget = 0
    let lookAt = null
    // move towards b.move with simple obstacle avoidance
    if (b.move && !(b.pause > 0)) {
      let dx = b.move.x - s.pos.x, dz = b.move.z - s.pos.z
      const d = Math.hypot(dx, dz)
      if (d > 1.2) {
        // a route round walls and houses (planned a few at a time per frame, and again when the goal moves)
        if ((!b.path || !b.pathFor || b.pathFor.distanceTo(b.move) > 4 || G.time - b.pathT > 6) && this.pathBudget > 0) {
          this.pathBudget--
          b.path = this.nav.path(s.pos.x, s.pos.y, s.pos.z, b.move.x, b.move.z)
          b.pathFor = b.move.clone(); b.pathT = G.time
        }
        if (b.path && b.path.length) {
          let wp = b.path[0]
          while (b.path.length > 1 && Math.hypot(wp[0] - s.pos.x, wp[1] - s.pos.z) < 1) { b.path.shift(); wp = b.path[0] }
          dx = wp[0] - s.pos.x; dz = wp[1] - s.pos.z
        }
        let yaw = Math.atan2(dx, dz)
        // feel ahead: if blocked, try left or right
        const fx = Math.sin(yaw), fz = Math.cos(yaw)
        if (G.collision.raycast(s.pos.x, s.pos.y + 0.6, s.pos.z, fx, 0, fz, 1.6, _h)) {
          const l = !G.collision.raycast(s.pos.x, s.pos.y + 0.6, s.pos.z, Math.sin(yaw + 0.9), 0, Math.cos(yaw + 0.9), 2, _h)
          yaw += l ? 0.9 : -0.9
          if (b.stuckT > 1.5) inp.jump = true
        }
        const fighting = b.state === 'combat' && b.target && G.time - b.lastSeen < 2
        if (!fighting) s.yaw = turn(s.yaw, yaw, dt * 4)
        // move in the wanted direction relative to the facing (strafing while fighting)
        const rel = yaw - s.yaw
        inp.fwd = Math.cos(rel); inp.side = -Math.sin(rel)
        const urgent = b.flee > 0 || (b.cover && b.move && b.state === 'combat') || b.state === 'retreat' || (b.squad.order.type === 'follow' && d > 15)
        inp.sprint = urgent && d > 4
        if (inp.sprint && s.stance !== STAND) s.setStance(STAND)
        if (!fighting && !urgent && b.squad.posture === 'stealth') s.setStance(CROUCH)
      } else if (b.cover && b.move) { b.move = null; s.setStance(CROUCH) }
      // stuck?
      if (s.pos.distanceTo(b.lastPos) < dt * 0.4 && (inp.fwd || inp.side)) b.stuckT += dt; else b.stuckT = Math.max(0, b.stuckT - dt)
      if (b.stuckT > 3) { b.move = null; b.stuckT = 0; b.cover = null; b.path = null }
    }
    if (b.pause > 0) b.pause -= dt
    b.lastPos.copy(s.pos)
    // fighting: aim, peek out of cover, shoot bursts
    const t = b.target
    if (b.state === 'combat' && t && !t.dead) {
      const seen = G.time - b.lastSeen < 1.2
      lookAt = seen ? t.pos : b.targetPos
      const sup = s.suppression
      if (b.cover && !b.move) {
        // cycle: duck for a while, then up to shoot
        b.peekT -= dt
        if (b.peekT <= 0) { b.peeking = !b.peeking; b.peekT = b.peeking ? 1.5 + Math.random() * 2 * b.skill : 1 + Math.random() * 2 + sup * 3 }
        if (sup > 0.6 && Math.random() < dt) b.peeking = false
        s.setStance(b.peeking ? (this.lowEnough(s, t) ? CROUCH : STAND) : CROUCH)
      } else if (!b.move) s.setStance(s.pos.distanceTo(t.pos) > 150 ? PRONE : CROUCH)
      if (seen && b.reactT > 0) b.reactT -= dt
      const canShoot = seen && b.reactT <= 0 && (!b.cover || b.peeking || b.move) && !b.squad.holdFire && b.squad.posture !== 'hold-fire'
      if (canShoot) this.shoot(s, b, t, dt)
    } else if (b.alertDir) lookAt = b.alertDir
    else if (b.state === 'alert' && b.squad.knowledge.size) { for (const [e, k] of b.squad.knowledge) if (!e.dead) { lookAt = k.pos; break } }
    // aim the body and the gun
    if (lookAt) {
      const dx = lookAt.x - s.pos.x, dz = lookAt.z - s.pos.z
      s.yaw = turn(s.yaw, Math.atan2(dx, dz), dt * (2.5 + b.skill * 3))
      const dy = (lookAt.y + 1.2) - (s.pos.y + s.eyeHeight)
      s.aimPitch += (Math.atan2(dy, Math.hypot(dx, dz)) - s.aimPitch) * Math.min(1, dt * 5)
      s.aimW = Math.min(1, (s.aimW || 0) + dt * 3)
    } else { s.aimPitch *= 0.95; s.aimW = Math.max(0.2, (s.aimW || 0) - dt) }
  }
  lowEnough(s, t) { return t.pos.y < s.pos.y + 6 }
  shoot(s, b, t, dt) {
    const G = this.game, w = s.w
    if (!w) return
    if (s.ammoInWeapon === 0) { s.reload(); return }
    // bursts: a few rounds, a pause; snipers take their time
    const cat = w.def.cat
    if (b.burst <= 0) {
      b.burstPause = (b.burstPause || 0) - dt
      if (b.burstPause > 0) return
      b.burst = cat === 'mmg' || cat === 'lmg' ? 5 + Math.floor(Math.random() * 8) : cat === 'sniper' || cat === 'dmr' ? 1 : w.def.modes.includes('auto') ? 2 + Math.floor(Math.random() * 3) : 1
      b.burstPause = cat === 'sniper' ? 2.5 + Math.random() * 2 : 0.4 + Math.random() * 0.8
      // a fresh aim error for this burst: worse at range, suppressed, moving, unskilled
      const d = s.pos.distanceTo(t.pos)
      const err = (0.004 + (1 - b.skill) * 0.016 + s.suppression * 0.03 + (s.speed > 0.5 ? 0.012 : 0) + (t.speed > 2 ? 0.006 : 0)) * (1 + d / 400) * (1.4 - G.difficulty * 0.4)
      b.aimErr.set((Math.random() - 0.5) * 2 * err, (Math.random() - 0.5) * 2 * err)
    }
    const eye = s.eye(_v)
    const aimY = t.pos.y + (t.stanceT > 1.5 ? 0.25 : t.stanceT > 0.5 ? 0.85 : 1.25)
    const dist = Math.hypot(t.pos.x - eye.x, t.pos.z - eye.z)
    // lead a moving target, and hold over for the drop at range
    const tof = dist / 800
    const ax = t.pos.x + t.vel.x * tof, az = t.pos.z + t.vel.z * tof
    const drop = 0.5 * 9.81 * tof * tof
    const dir = _v2.set(ax - eye.x, aimY + drop - eye.y, az - eye.z).normalize()
    const yaw = Math.atan2(dir.x, dir.z) + b.aimErr.x, pitch = Math.asin(Math.max(-1, Math.min(1, dir.y))) + b.aimErr.y
    dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    const shots = s.trigger(true, true, eye.clone().addScaledVector(dir, 0.5), dir, 0)
    if (shots && shots.length) { for (const sh of shots) G.shoot(s, sh); b.burst--; b.aimErr.multiplyScalar(1.15) }
  }
  // Far from the player: walk the orders, no senses (they wake up when the player comes near).
  farStep(s, b, dt) {
    const o = this.squadOrder(b)
    let tgt = o.type === 'patrol' && o.route ? o.route[b.wpIdx % o.route.length] : (o.type === 'move' || o.type === 'attack') ? o.pos : null
    if (tgt && b.squad.leader !== s && b.squad.leader) tgt = b.squad.leader.pos
    if (tgt) {
      const dx = tgt.x - s.pos.x, dz = tgt.z - s.pos.z, d = Math.hypot(dx, dz)
      if (d > 5) { s.yaw = Math.atan2(dx, dz); s.pos.x += dx / d * 3 * dt; s.pos.z += dz / d * 3 * dt; s.pos.y = heightAt(s.pos.x, s.pos.z); s.speed = 3; s.phase += dt * 7 }
      else { s.speed = 0; if (o.type === 'patrol') b.wpIdx++ }
    }
  }
  inVehicle(s, b, dt) {
    // passengers just ride; drivers are handled by the vehicle's own driving AI
    s.speed = 0
  }
}
function turn(a, b, max) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + Math.max(-max, Math.min(max, d))
}
