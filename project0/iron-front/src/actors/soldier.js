// A soldier: the player, an AI or another player's stand-in. Movement (stances, lean, sprint and stamina,
// weight, steps, vaulting, ladders, swimming, falls), body (damage by part, armour, bleeding, being
// knocked down, death) and weapon handling (magazine and chamber, fire modes, bolt and pump actions,
// reloads, recoil). A controller (player.js or ai.js) fills `input` and calls step() and fire().
import * as THREE from 'three'
import { heightAt, waterLevel, normalAt } from '../world/heightfield.js'
import { weapon, AMMO, stats, THROWABLES } from '../combat/weapons-data.js'
import { Inventory, newMag, ITEMS, CLOTHING } from '../game/inventory.js'

let nextId = 1
const STAND = 0, CROUCH = 1, PRONE = 2
const EYE = [1.65, 1.15, 0.38]
export const PARTS = ['head', 'torso', 'armL', 'armR', 'legL', 'legR']
const PART_MUL = { head: 3.2, torso: 1, armL: 0.55, armR: 0.55, legL: 0.65, legR: 0.65 }

export class Soldier {
  constructor(o = {}) {
    this.id = o.id ?? nextId++
    this.name = o.name || 'Soldier'
    this.faction = o.faction || 'vdf'
    this.team = o.team ?? this.faction
    this.role = o.role || 'rifleman'
    this.ai = !!o.ai
    this.inv = o.inv || new Inventory()
    this.pos = new THREE.Vector3(o.x || 0, o.y ?? heightAt(o.x || 0, o.z || 0), o.z || 0)
    this.vel = new THREE.Vector3()
    this.yaw = o.yaw || 0
    this.aimPitch = 0
    this.stance = STAND; this.stanceT = 0
    this.lean = 0; this.leanTarget = 0
    this.speed = 0; this.phase = 0
    this.stamina = 1
    this.onGround = true
    this.input = { fwd: 0, side: 0, sprint: false, walk: false, jump: false }
    // body
    this.blood = 100
    this.parts = { head: 0, torso: 0, armL: 0, armR: 0, legL: 0, legR: 0 }   // damage taken by each
    this.bleed = 0
    this.down = false; this.downT = 0
    this.dead = false; this.deadT = 0
    this.suppression = 0
    this.lastHitT = -99; this.lastHitDir = null; this.killer = null
    this.skin = o.skin ?? (this.id * 7) % 5
    this.pack = !!this.inv.worn.backpack
    // weapon
    this.slot = 'primary'
    this.w = null
    this.switchT = 0
    this.aimW = 0             // how far the weapon is raised (0 lowered .. 1 aiming)
    this.ads = false
    this.recoil = { pitch: 0, yaw: 0 }
    this.fireCount = 0
    this.lastShotT = -9
    this.selectWeapon(this.inv.weapons.primary ? 'primary' : this.inv.weapons.sidearm ? 'sidearm' : 'launcher', true)
    this.vehicle = null; this.seat = null
    this.ladder = null; this.swimming = false; this.vaultT = 0
    this.fallSpeed = 0
    this.time = 0
  }
  get eyeHeight() { const s = this.stanceT; return s <= 1 ? EYE[0] + (EYE[1] - EYE[0]) * s : EYE[1] + (EYE[2] - EYE[1]) * (s - 1) }
  get alive() { return !this.dead }
  get canAct() { return !this.dead && !this.down }
  get health() { return Math.max(0, this.blood) }
  eye(out = new THREE.Vector3()) {
    const r = this.lean * 0.38 * (this.stance === PRONE ? 0 : 1)
    return out.set(this.pos.x - Math.cos(this.yaw) * r, this.pos.y + this.eyeHeight - Math.abs(this.lean) * 0.06, this.pos.z + Math.sin(this.yaw) * r)
  }
  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.aimPitch)
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.aimPitch), Math.cos(this.yaw) * cp)
  }

  // ---------- weapons ----------
  selectWeapon(slot, instant = false) {
    const rec = this.inv.weapons[slot]
    if (!rec) return false
    const def = weapon(rec.id)
    this.slot = slot
    this.w = { rec, def, s: stats(def, rec.att), modeIdx: 0, cooldown: 0, burst: 0, boltT: 0, reloadT: 0, reloadDur: 0, tube: 0 }
    this.switchT = instant ? 0 : 0.6
    this.ads = false
    this.weaponKind = def.cat === 'pistol' ? 'pistol' : def.cat === 'launcher' ? 'launcher' : def.cat === 'smg' ? 'smg' : def.cat === 'lmg' || def.cat === 'mmg' ? 'lmg' : def.cat === 'sniper' || def.cat === 'dmr' ? 'sniper' : def.cat === 'shotgun' ? 'shotgun' : 'rifle'
    return true
  }
  refreshWeapon() { if (this.w) { this.w.s = stats(this.w.def, this.w.rec.att) } }
  get mode() { return this.w ? this.w.def.modes[this.w.modeIdx % this.w.def.modes.length] : 'semi' }
  cycleMode() { if (this.w && this.w.def.modes.length > 1) { this.w.modeIdx = (this.w.modeIdx + 1) % this.w.def.modes.length; return this.mode } return null }
  get ammoInWeapon() { const r = this.w?.rec; return r ? r.mag + (r.chamber || 0) : 0 }
  get reloading() { return this.w && this.w.reloadT > 0 }
  canFire() {
    const w = this.w
    return this.canAct && w && this.switchT <= 0 && w.reloadT <= 0 && w.cooldown <= 0 && w.boltT <= 0 && !this.swimming && !this.ladder && this.vaultT <= 0 && (this.input.sprint ? this.speed < 2 : true)
  }
  // Pulls the trigger: `held` is true while it stays down. Returns the shots fired ([] when none) as
  // { origin, dir, ammo, v } for the ballistics; `origin` and `dir` come from the controller.
  trigger(held, justPressed, origin, dir, spreadExtra = 0) {
    const w = this.w
    if (!w || !this.canFire()) return null
    const mode = this.mode
    if (!justPressed && mode !== 'auto' && !(mode === 'burst' && w.burst > 0)) return null
    if (w.rec.chamber <= 0) {
      if (w.rec.mag > 0 && (mode !== 'bolt' && mode !== 'pump')) { w.rec.mag--; w.rec.chamber = 1 }
      else { if (justPressed) this.dryFire = (this.dryFire || 0) + 1; return null }
    }
    // the round leaves
    w.rec.chamber = 0
    if (w.rec.mag > 0 && mode !== 'bolt' && mode !== 'pump' && mode !== 'single') { w.rec.mag--; w.rec.chamber = 1 }
    w.cooldown = 60 / (w.def.rpm || 600)
    if (mode === 'burst') { if (justPressed) w.burst = 3; w.burst--; if (w.burst <= 0) w.cooldown = Math.max(w.cooldown, 0.18) }
    if (mode === 'bolt' || mode === 'pump') w.boltT = mode === 'bolt' ? 0.95 : 0.5
    this.lastShotT = this.time
    this.fireCount++
    const a = AMMO[w.def.ammo]
    const shots = []
    const pellets = a.pellets || 1
    const moa = (w.def.moa || 2) * 0.00029 * (a.pellets ? 1 : 1)
    for (let i = 0; i < pellets; i++) {
      const sp = moa + spreadExtra
      const d = dir.clone()
      // a random direction within the cone
      const r = Math.sqrt(Math.random()) * sp, t = Math.random() * Math.PI * 2
      const up = Math.abs(d.y) < 0.99 ? _up : _x
      const u = _u.crossVectors(d, up).normalize(), v = _v.crossVectors(d, u)
      d.addScaledVector(u, Math.cos(t) * r).addScaledVector(v, Math.sin(t) * r).normalize()
      shots.push({ origin: origin.clone(), dir: d, ammo: w.def.ammo, v: a.v * (w.s.vmul || 1), suppressed: w.s.suppressed, tracer: w.def.tracerEvery ? (this.fireCount % w.def.tracerEvery === 0) : (w.def.cat === 'lmg' || w.def.cat === 'mmg' ? this.fireCount % 3 === 0 : false), weapon: w.def.id })
    }
    // recoil: the controller turns this into camera kick (player) or extra spread (AI)
    const stance = this.stance === PRONE ? 0.55 : this.stance === CROUCH ? 0.8 : 1
    const bip = this.bipod ? 0.35 : 1
    this.recoil.pitch += w.s.recoilV * stance * bip * (0.85 + Math.random() * 0.3) * Math.PI / 180
    this.recoil.yaw += w.s.recoilH * stance * bip * (Math.random() * 2 - 1) * Math.PI / 180
    if (w.def.disposable) { this.inv.weapons.launcher = null; this.droppedLauncher = true }
    return shots
  }
  // Reload from the inventory: magazines (tactical or empty), shell by shell for tubes, belts, rockets.
  reload() {
    const w = this.w
    if (!w || w.reloadT > 0 || this.switchT > 0 || !this.canAct) return false
    const def = w.def
    if (def.disposable) return false
    if (def.tube) {
      if (w.rec.mag >= w.s.mag) return false
      if (!this.inv.countAmmo(def)) return false
      w.reloadDur = def.reload; w.reloadT = def.reload; w.tube = 1
      return true
    }
    if (w.rec.mag >= w.s.mag) return false
    if (!this.inv.all().some(it => it.kind === 'mag' && it.ammo === def.ammo && it.rounds > 0)) return false
    const empty = w.rec.mag + w.rec.chamber === 0
    w.reloadDur = (empty ? w.s.reloadEmpty : w.s.reload) * (this.parts.armL + this.parts.armR > 50 ? 1.4 : 1)
    w.reloadT = w.reloadDur; w.tube = 0
    return true
  }
  finishReload() {
    const w = this.w, def = w.def
    if (w.tube) {
      if (this.inv.takeRound(def)) { w.rec.mag++; if (!w.rec.chamber && w.rec.mag) { /* pumped on the next shot */ } }
      // keep loading shell by shell while there is room, ammunition and the trigger stays off
      if (w.rec.mag < w.s.mag && this.inv.countAmmo(def) && !this.stopReload) { w.reloadT = def.reload; return }
      if (!w.rec.chamber && w.rec.mag) { w.rec.mag--; w.rec.chamber = 1 }
      w.tube = 0; this.stopReload = false
      return
    }
    const mag = this.inv.takeMag(def, w.s.mag)
    if (!mag) return
    // the old magazine goes back in a pouch if it still has rounds (a tactical reload)
    if (w.rec.mag > 0 && !def.belt) this.inv.add({ kind: 'mag', ammo: def.ammo, rounds: w.rec.mag, cap: w.s.mag, belt: !!def.belt })
    w.rec.mag = mag.rounds
    if (!w.rec.chamber && w.rec.mag > 0 && def.modes[0] !== 'single') { w.rec.mag--; w.rec.chamber = 1 }
    if (def.modes[0] === 'single') { w.rec.chamber = 1; w.rec.mag = 0 }
  }

  // ---------- body ----------
  // A hit on `part` for `dmg` (before armour), with penetration `pen` from direction `dir`.
  hurt(part, dmg, pen = 1, src = null, dir = null, kind = 'bullet') {
    // another player's stand-in: only their own game can hurt them (it hears our shots)
    if (this.dead || this.remote) return 0
    // no friendly fire from team-mates in an online battle
    if (src?.remote && src.team === this.team) return 0
    const armorPart = part === 'head' ? 'head' : part === 'torso' ? 'torso' : part.startsWith('arm') ? 'arms' : 'legs'
    const armor = this.inv.armor(armorPart)
    // body armour slows rifle rounds rather than stopping them (a plate carrier turns three 5.56 hits into
    // four) and does most against pistol and SMG rounds; a helmet can save you from a rifle headshot
    const red = kind !== 'bullet' ? Math.max(0.5, 1 - armor * 0.06)
      : part === 'head' ? Math.max(0.15, Math.min(1, 1 - armor * 0.2 + pen * 0.1))
      : Math.max(0.15, Math.min(1, 1 - armor * 0.12 + pen * 0.28))
    const d = dmg * (kind === 'bullet' ? PART_MUL[part] : 1) * red
    this.blood -= d
    this.parts[part] = Math.min(100, (this.parts[part] || 0) + d)
    this.bleed += d * (kind === 'fall' ? 0.005 : 0.018) * (armor > 2 && part === 'torso' ? 0.6 : 1)
    this.lastHitT = this.time; this.lastHitDir = dir ? dir.clone() : null
    this.suppression = Math.min(1, this.suppression + 0.4)
    if (src) this.lastAttacker = src
    if (this.blood <= 0 || (part === 'head' && d > 60)) this.die(src, dir)
    else if (this.blood < 18 && !this.down && this.allowDown) { this.down = true; this.downT = 0 }
    return d
  }
  die(src, dir) {
    if (this.dead) return
    this.dead = true; this.down = false; this.deadT = 0
    this.killer = src
    this.fallDir = dir && (Math.sin(this.yaw) * dir.x + Math.cos(this.yaw) * dir.z) < 0 ? -1 : 1
    this.deathProne = this.stanceT > 1.5 || this.down
    this.blood = 0
    if (this.onDeath) this.onDeath(this, src)
  }
  // Medical: a bandage stops bleeding, a first aid kit heals some, a medkit heals all and can revive.
  treat(id, target = this) {
    const it = ITEMS[id]; if (!it || !this.inv.count(id)) return false
    this.inv.use(id)
    if (it.stop) target.bleed = Math.max(0, target.bleed - it.stop * 0.35)
    if (it.heal) { target.blood = Math.min(100, target.blood + it.heal); for (const p of PARTS) target.parts[p] = Math.max(0, target.parts[p] - it.heal * 0.8) }
    if (it.revive && target.down) { target.down = false; target.blood = Math.max(target.blood, 45) }
    if (it.fixLeg) { target.parts.legL = Math.min(target.parts.legL, 20); target.parts.legR = Math.min(target.parts.legR, 20) }
    if (it.pain) target.painkiller = 60
    return true
  }
  get legHurt() { return Math.max(this.parts.legL, this.parts.legR) > 45 && !(this.painkiller > 0) }
  get armHurt() { return Math.max(this.parts.armL, this.parts.armR) > 40 }

  // ---------- movement ----------
  setStance(s) {
    if (this.dead || this.down) return
    if (s === STAND || s === CROUCH) {
      // standing needs headroom
      if (this.W && s < this.stance) { const h = { t: 0 }; if (this.W.collision.raycast(this.pos.x, this.pos.y + 0.6, this.pos.z, 0, 1, 0, s === STAND ? 1.25 : 0.7, h)) return }
    }
    this.stance = s
  }
  step(dt, W) {
    this.W = W
    this.time += dt
    if (this.painkiller > 0) this.painkiller -= dt
    if (this.fedT > 0) this.fedT -= dt
    this.suppression = Math.max(0, this.suppression - dt * 0.35)
    // timers
    const w = this.w
    if (this.switchT > 0) this.switchT -= dt
    if (w) {
      if (w.cooldown > 0) w.cooldown -= dt
      if (w.boltT > 0) { w.boltT -= dt; if (w.boltT <= 0 && w.rec.mag > 0 && !w.rec.chamber) { w.rec.mag--; w.rec.chamber = 1 } }
      if (w.reloadT > 0) { w.reloadT -= dt; if (w.reloadT <= 0) this.finishReload() }
    }
    // recoil settles
    this.recoil.pitch *= Math.max(0, 1 - dt * 9); this.recoil.yaw *= Math.max(0, 1 - dt * 9)
    // body
    if (this.dead) { this.deadT += dt; this.speed = 0; return }
    if (this.bleed > 0) { this.blood -= this.bleed * dt; this.bleed = Math.max(0, this.bleed - dt * 0.01); if (this.blood <= 0) this.die(this.lastAttacker, null) }
    if (this.down) { this.downT += dt; this.stance = PRONE; if (this.downT > 90 && this.allowDown) this.die(this.lastAttacker, null) }
    if (this.vehicle) { this.speed = 0; this.stanceT += (0 - this.stanceT) * Math.min(1, dt * 6); return }
    const inp = this.input
    if (this.down) { inp.fwd = 0; inp.side = 0; inp.sprint = false }
    // stance and lean
    const target = this.stance
    this.stanceT += Math.max(-dt * 2.2, Math.min(dt * 2.2, target - this.stanceT))
    if (this.stance === PRONE || inp.sprint) this.leanTarget = 0
    this.lean += (this.leanTarget - this.lean) * Math.min(1, dt * 9)
    // speed
    const weight = this.inv.weight()
    // a standard 21 kg kit costs almost nothing; heavy loads slow you (36 kg of launcher and rockets: about
    // 0.78), down to 0.62 for the heaviest
    const load = Math.max(0.62, Math.min(1.05, 1.12 - Math.max(0, weight - 12) / 70))
    const hurt = this.legHurt ? 0.55 : 1
    let sprint = inp.sprint && this.stance !== PRONE && this.stamina > 0.05 && inp.fwd > 0 && !this.ads && !this.legHurt
    let maxV = this.stance === PRONE ? 0.9 : this.stance === CROUCH ? 2.1 : 3.6
    if (sprint) maxV = 6.2
    if (inp.walk || this.ads) maxV = Math.min(maxV, this.stance === PRONE ? 0.6 : 1.5)
    if (this.swimming) maxV = sprint ? 2.2 : 1.4
    maxV *= load * hurt * (this.reloading ? 0.8 : 1)
    this.sprint = sprint && this.speed > 3
    // stamina
    if (sprint && this.speed > 2) this.stamina = Math.max(0, this.stamina - dt * (0.09 + weight * 0.0025))
    else this.stamina = Math.min(1, this.stamina + dt * (this.stance === STAND ? 0.08 : 0.12) * (inp.fwd || inp.side ? 0.6 : 1) * (this.fedT > 0 ? 1.5 : 1))
    // ladders: climb when facing one and pushing forward
    if (this.ladder) { this.climb(dt, W); return }
    if (W.ladders) for (const L of W.ladders) {
      if (Math.abs(this.pos.x - L.x) < 0.6 && Math.abs(this.pos.z - L.z) < 0.6 && this.pos.y > L.y0 - 0.5 && this.pos.y < L.y1 - 0.3 && inp.fwd > 0 && this.stance === STAND) { this.ladder = L; this.vel.set(0, 0, 0); return }
    }
    // swimming
    const wl = waterLevel(this.pos.x, this.pos.z)
    this.swimming = wl - this.pos.y > 1.25
    // horizontal velocity towards what the stick asks
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw)
    let ix = inp.side, iz = inp.fwd
    const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il }
    const tx = (s * iz - c * ix) * maxV, tz = (c * iz + s * ix) * maxV
    const acc = this.onGround || this.swimming ? 14 : 2
    this.vel.x += (tx - this.vel.x) * Math.min(1, dt * acc)
    this.vel.z += (tz - this.vel.z) * Math.min(1, dt * acc)
    // vaulting over low walls, or a small jump
    if (inp.jump && this.onGround && this.stance === STAND && this.vaultT <= 0) {
      inp.jump = false
      if (!this.tryVault(W)) { this.vel.y = 3.6; this.onGround = false; this.stamina = Math.max(0, this.stamina - 0.05) }
    }
    if (this.vaultT > 0) { this.vaultStep(dt); return }
    if (this.swimming) { this.vel.y = (wl - 1.45 - this.pos.y) * 3 }
    else this.vel.y -= 9.81 * dt
    // move and collide
    this.pos.addScaledVector(this.vel, dt)
    this.collide(W)
    // the ground: the land or anything solid under the feet (floors, roofs, stairs)
    const land = heightAt(this.pos.x, this.pos.z)
    const floor = W.collision.floorAt(this.pos.x, this.pos.y, this.pos.z, 0.5, 2)
    const g = Math.max(land, floor)
    if (this.pos.y <= g + 0.03 && this.vel.y <= 0.01) {
      if (!this.onGround && this.fallSpeed < -8 && !this.swimming) this.hurt(Math.random() < 0.5 ? 'legL' : 'legR', (-this.fallSpeed - 8) * 14, 0, null, null, 'fall')
      this.pos.y = g; this.vel.y = 0; this.onGround = true
      // too steep: slide down
      if (g === land && !this.swimming) { const n = normalAt(this.pos.x, this.pos.z, _n, 1); if (n[1] < 0.62) { this.vel.x += n[0] * 9 * dt; this.vel.z += n[2] * 9 * dt } }
    } else if (this.pos.y > g + 0.25) this.onGround = false
    else if (this.onGround && this.pos.y > g) this.pos.y = Math.max(g, this.pos.y - dt * 4)
    this.fallSpeed = this.vel.y
    if (land > this.pos.y) this.pos.y = land
    // the island's edge
    this.pos.x = Math.max(-5950, Math.min(5950, this.pos.x)); this.pos.z = Math.max(-5950, Math.min(5950, this.pos.z))
    // walk cycle
    this.speed = Math.hypot(this.vel.x, this.vel.z)
    this.phase += dt * this.speed * (this.stance === PRONE ? 2.2 : 2.6)
  }
  collide(W) {
    const r = this.stance === PRONE ? 0.3 : 0.32
    const heights = this.stanceT < 0.5 ? [0.38, 0.95, 1.5] : this.stanceT < 1.5 ? [0.38, 0.9] : [0.3]
    _hit.normals = null
    for (const h of heights) {
      _c.set(this.pos.x, this.pos.y + h, this.pos.z)
      W.collision.pushSphere(_c, r, _hit)
      const dx = _c.x - this.pos.x, dz = _c.z - this.pos.z, dy = _c.y - (this.pos.y + h)
      this.pos.x = _c.x; this.pos.z = _c.z
      if (dy < -0.01 && h > 0.5 && this.vel.y > 0) this.vel.y = 0       // bumped the head
      if (dx || dz) { /* slide along walls: the push already removed the into-wall motion */ }
    }
    if (this.stance === PRONE || this.stanceT > 1.5) {
      // lying down, the body reaches forward and back
      for (const k of [0.75, -0.55]) {
        _c.set(this.pos.x + Math.sin(this.yaw) * k, this.pos.y + 0.28, this.pos.z + Math.cos(this.yaw) * k)
        const ox = _c.x, oz = _c.z
        W.collision.pushSphere(_c, 0.28, _hit)
        this.pos.x += _c.x - ox; this.pos.z += _c.z - oz
      }
    }
  }
  tryVault(W) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), h = { t: 0 }
    const low = W.collision.raycast(this.pos.x, this.pos.y + 0.55, this.pos.z, fx, 0, fz, 1.2, h)
    if (!low) return false
    const dist = h.t
    if (W.collision.raycast(this.pos.x, this.pos.y + 1.55, this.pos.z, fx, 0, fz, dist + 0.8, { t: 0 })) return false
    const tx = this.pos.x + fx * (dist + 0.75), tz = this.pos.z + fz * (dist + 0.75)
    const top = W.collision.floorAt(this.pos.x + fx * (dist + 0.1), this.pos.y + 1.5, this.pos.z + fz * (dist + 0.1), 0, 1.6)
    if (top - this.pos.y > 1.45 || top < this.pos.y + 0.3) return false
    const land = Math.max(heightAt(tx, tz), W.collision.floorAt(tx, top + 0.2, tz, 0.3, 3))
    this.vault = { from: this.pos.clone(), over: top + 0.15, to: new THREE.Vector3(tx, land, tz) }
    this.vaultT = 0.55
    this.stamina = Math.max(0, this.stamina - 0.08)
    return true
  }
  vaultStep(dt) {
    this.vaultT -= dt
    const t = 1 - Math.max(0, this.vaultT) / 0.55, v = this.vault
    this.pos.lerpVectors(v.from, v.to, t)
    this.pos.y = THREE.MathUtils.lerp(v.from.y, v.to.y, t) + Math.sin(t * Math.PI) * (v.over - Math.min(v.from.y, v.to.y) + 0.1) * 0.9 + (t < 0.5 ? t * 2 * (v.over - v.from.y) * 0.4 : 0)
    if (this.vaultT <= 0) { this.pos.copy(v.to); this.vel.set(0, 0, 0); this.vault = null }
  }
  climb(dt, W) {
    const L = this.ladder, inp = this.input
    this.pos.x += (L.x - Math.sin(L.yaw) * 0.0 - this.pos.x) * Math.min(1, dt * 8)
    this.pos.z += (L.z - this.pos.z) * Math.min(1, dt * 8)
    this.pos.y += inp.fwd * 1.7 * dt
    this.vel.set(0, 0, 0)
    this.speed = Math.abs(inp.fwd) * 1.2
    if (this.pos.y >= L.y1 - 0.05) {
      // step off onto the platform at the top
      this.pos.y = L.y1 + 0.1
      this.pos.x += Math.sin(this.yaw) * 0.9; this.pos.z += Math.cos(this.yaw) * 0.9
      this.ladder = null
    } else if (this.pos.y <= L.y0 + 0.02 && inp.fwd < 0) { this.ladder = null; this.pos.x -= Math.sin(this.yaw) * 0.5; this.pos.z -= Math.cos(this.yaw) * 0.5 }
    if (inp.jump) { inp.jump = false; this.ladder = null; this.pos.x -= Math.sin(this.yaw) * 0.6; this.pos.z -= Math.cos(this.yaw) * 0.6 }
  }

  // ---------- grenades ----------
  canThrow(type) { return this.canAct && this.inv.count(type) > 0 && this.switchT <= 0 && (!this.w || this.w.reloadT <= 0) }
  throwGrenade(type) {
    if (!this.canThrow(type)) return null
    this.inv.use(type)
    this.switchT = 0.5
    return { type, def: THROWABLES[type] }
  }
}
const _up = new THREE.Vector3(0, 1, 0), _x = new THREE.Vector3(1, 0, 0), _u = new THREE.Vector3(), _v = new THREE.Vector3()
const _c = new THREE.Vector3(), _hit = { ground: false, wall: false, normals: null }, _n = [0, 1, 0]
export { STAND, CROUCH, PRONE }
