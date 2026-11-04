// Vehicles: cars, trucks, armour, helicopters, planes and boats, all drivable, with seats, mounted weapons,
// armour and damage. Physics per kind:
//  - wheels and tracks: each wheel finds the ground (land, bridge decks, roofs), the body takes the slope
//    and rolls with it; throttle, brakes, steering with grip (dirt tracks and grass are looser); tracked
//    vehicles turn on the spot
//  - helicopters: collective lifts along the rotor's axis, the cyclic tilts it; assisted controls hold
//    the hover and the height
//  - planes: thrust, drag and lift that falls away below the stall speed; gear for taking off and landing;
//    assisted controls steer the nose to where the mouse looks
//  - boats: float on the water, push with the throttle, turn with the rudder; they cannot climb out
// Damage: armour against each hit; burning below a quarter; then the wreck explodes.
import * as THREE from 'three'
import { VEHICLES } from './vehicle-data.js'
import { buildVehicle, PAINTS } from './vehicle-models.js'
import { weapon, AMMO } from '../combat/weapons-data.js'
import { heightAt, waterLevel, roadAt, surfaceAt } from '../world/heightfield.js'
import { rayBox, raycastTerrain, makeBox } from '../world/collision.js'
import { FACTIONS, hostile } from '../actors/factions.js'

const UP = new THREE.Vector3(0, 1, 0)
let nextId = 1

export class Vehicle {
  constructor(game, type, x, z, yaw = 0, o = {}) {
    this.game = game
    this.id = nextId++
    this.type = type
    this.def = VEHICLES[type]
    const d = this.def
    this.kind = d.kind
    this.faction = o.faction || null
    const paint = o.paint ? PAINTS[o.paint] : d.paint ? PAINTS[d.paint] : this.faction ? (this.faction === 'cef' ? PAINTS.tan : this.faction === 'nlf' ? PAINTS.grey : this.faction === 'res' ? PAINTS.green : PAINTS.olive) : [PAINTS.red, PAINTS.blue, PAINTS.white, PAINTS.yellow, PAINTS.black, PAINTS.green][this.id % 6]
    this.model = buildVehicle(d, paint, game.vehicles.mat)
    this.root = this.model.root
    game.engine.world.add(this.root)
    this.pos = new THREE.Vector3(x, 0, z)
    const g = this.groundAt(x, z)
    this.pos.y = o.y ?? (this.kind === 'boat' ? waterLevel(x, z) : g)
    this.yaw = yaw; this.pitch = 0; this.roll = 0
    this.quat = new THREE.Quaternion()
    this.vel = new THREE.Vector3()
    this.speed = 0; this.vLat = 0; this.vY = 0
    this.steer = 0; this.throttle = 0; this.brake = 0
    this.hp = d.hp; this.maxHp = d.hp
    this.armor = d.armor || 0
    this.fuel = d.fuel; this.maxFuel = d.fuel
    this.alive = true; this.burning = 0; this.wreckT = 0
    this.engine = false
    this.lights = false
    this.flares = d.flares || 0; this.flareT = 0
    this.mobility = 1                 // tracks or wheels shot out slow it down
    this.seats = d.seats.map(s => ({ ...s, occupant: null, w: s.weapon ? newMounted(s.weapon) : null, w2: s.extra ? newMounted(s.extra) : (s.coax ? newMounted(s.coax) : null), aimYaw: 0, aimPitch: 0, alt: false }))
    // aircraft state
    this.rpm = 0; this.collective = 0; this.gearDown = true; this.onGround = true
    this.alt = 0
    this.targetAlt = this.pos.y
    this.hullBoxes = this.model.hull
    this.supply = d.supply || null
    this.lastHit = null
    this.wheelSpin = 0
    this.colliders = []
    this.update(0)
  }
  get driver() { return this.seats.find(s => s.role === 'driver' || s.role === 'pilot')?.occupant || null }
  occupants() { return this.seats.filter(s => s.occupant).map(s => s.occupant) }
  seatOf(sol) { return this.seats.find(s => s.occupant === sol) }
  groundAt(x, z) {
    const land = heightAt(x, z)
    const floor = this.game.collision.floorAt(x, (this.pos?.y ?? land) + 1.5, z, 1.5, 6)
    return Math.max(land, floor)
  }
  forward(out = new THREE.Vector3()) { return out.set(0, 0, 1).applyQuaternion(this.quat) }
  // ---------- per frame ----------
  update(dt) {
    const d = this.def
    if (this.alive) {
      if (this.kind === 'heli') this.heli(dt)
      else if (this.kind === 'plane') this.plane(dt)
      else if (this.kind === 'boat') this.boat(dt)
      else this.ground(dt)
      // fuel
      if (this.engine && dt) this.fuel = Math.max(0, this.fuel - dt * (this.kind === 'plane' || this.kind === 'heli' ? 1.2 : 0.25) * (0.3 + Math.abs(this.throttle)))
      if (this.fuel <= 0) this.engine = false
      // fire: a burning vehicle loses its health and then blows up
      if (this.burning > 0) {
        this.burning += dt
        this.hp -= dt * this.maxHp * 0.035
        if (Math.random() < dt * 6) this.game.fx.burn(this.pos.x, this.pos.y + d.size[1] * 0.7, this.pos.z, 0.8 + d.size[2] / 10)
        if (this.hp <= 0) this.destroy()
      } else if (this.hp < this.maxHp * 0.25) this.burning = 0.01
      if (this.hp < this.maxHp * 0.5 && Math.random() < dt * 3) this.game.fx.puff(this.pos.x, this.pos.y + d.size[1], this.pos.z, { vy: 1.5, s0: 0.6, s1: 2.5, life: 2.5, r: 0.25, g: 0.25, b: 0.25, a: 0.4, drag: 0.5 })
    } else {
      this.wreckT += dt
      if (this.wreckT < 40 && Math.random() < dt * 4) this.game.fx.burn(this.pos.x, this.pos.y + d.size[1] * 0.6, this.pos.z, 1 + d.size[2] / 12)
      if (this.kind === 'heli' || this.kind === 'plane') {
        // a wreck falls out of the sky
        const g = this.groundAt(this.pos.x, this.pos.z)
        if (this.pos.y > g + 0.5) { this.vel.y -= 9.81 * dt; this.pos.addScaledVector(this.vel, dt); this.roll += dt * 1.5; if (this.pos.y <= g + 0.5) { this.pos.y = g + 0.3; this.vel.set(0, 0, 0); this.game.explode(this.pos.x, this.pos.y + 1, this.pos.z, { radius: 10, dmg: 120, heat: 0 }, null, null, true) } }
      }
    }
    this.flareT = Math.max(0, this.flareT - dt)
    // weapons cool down; seats aim
    for (const s of this.seats) { if (s.w) { s.w.cooldown = Math.max(0, s.w.cooldown - dt); if (s.w.reloadT > 0) { s.w.reloadT -= dt; if (s.w.reloadT <= 0) s.w.mag = s.w.def.mag } } if (s.w2) s.w2.cooldown = Math.max(0, s.w2.cooldown - dt) }
    // occupants ride along
    this.quat.setFromEuler(_e.set(-this.pitch, this.yaw, -this.roll, 'YXZ'))
    for (const s of this.seats) if (s.occupant) {
      const o = s.occupant
      const p = _v.set(s.at[0], s.at[1] - 1.1, s.at[2]).applyQuaternion(this.quat).add(this.pos)
      o.pos.copy(p)
      if (!(o.isPlayer && s.turret)) o.yaw = this.yaw + (s.turret ? s.aimYaw : 0)
      o.vel.copy(this.vel)
    }
    this.syncModel(dt)
  }
  syncModel(dt) {
    const r = this.root
    r.position.copy(this.pos)
    r.quaternion.copy(this.quat)
    const m = this.model
    // wheels spin with the speed and the front ones steer
    this.wheelSpin += this.speed * dt
    for (const w of m.wheels) {
      if (!w.track) { w.mesh.rotation.x = this.wheelSpin / w.r; w.obj.rotation.y = w.steer ? this.steer * this.def.turn : 0 }
      // the suspension follows the ground under each wheel
      if (w.dy !== undefined) w.obj.position.y = w.r + w.dy
    }
    // the turret follows the gunner's aim
    const gs = this.seats.find(s => s.turret && (s.role === 'gunner') && !s.side)
    if (m.turret && gs) { m.turret.rotation.y = gs.aimYaw; m.gun.rotation.x = -gs.aimPitch }
    // rotors and propellers
    for (const ro of m.rotors) ro.obj.rotation[ro.axis] += this.rpm * dt * 32 * ro.speed
    if (m.disc) m.disc.material.opacity = Math.min(0.25, this.rpm * 0.3)
    for (const p of m.props) p.rotation.z += (this.engine ? 0.3 + this.throttle : 0) * dt * 60
    if (m.gear) m.gear.visible = this.gearDown
    if (m.doorGuns) for (const dg of m.doorGuns) { const s = this.seats.find(q => q.side === dg.side); if (s) { dg.mesh.rotation.y = dg.side * 1.2 + s.aimYaw; dg.mesh.rotation.x = -s.aimPitch } }
    if (!this.alive) { if (!this.charred) { this.charred = true; this.root.traverse(o => { if (o.isMesh) { o.material = this.game.vehicles.wreckMat } }) } }
  }
  // ---------- ground vehicles ----------
  ground(dt) {
    const d = this.def, drv = this.driver
    const tracked = this.kind === 'tracked', bike = this.kind === 'bike'
    // the driver's wishes (player or AI) are in throttle / steer / brake
    if (!drv || !this.engine) { this.throttle = 0; if (!drv) this.brake = 1 }
    const fwd = _f.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)), right = _r.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw))
    // grip: roads hold best, then grass, dirt and sand; off-road machines suffer less
    const road = roadAt(this.pos.x, this.pos.z)
    const onRoad = road && road.d < road.w / 2 + 1
    const surf = onRoad ? 1 : (d.offroad || (tracked ? 1.15 : 0.75))
    const maxV = d.maxSpeed * this.mobility * (onRoad ? 1 : Math.min(1, surf)) * (this.boost ? 1.12 : 1)
    // water: most vehicles drown their engine; amphibious ones swim slowly
    const wl = waterLevel(this.pos.x, this.pos.z)
    const deep = wl - this.pos.y
    if (deep > 1.2 && !d.amphibious) { this.engine = false; this.throttle = 0 }
    const swim = d.amphibious && deep > 1.2
    // engine force, brakes, rolling drag, the slope
    let a = 0
    if (this.throttle > 0) a = this.speed < -0.5 ? 12 * this.throttle : d.accel * this.throttle * (1 - (Math.max(0, this.speed) / maxV) ** 2) * (swim ? 0.3 : 1)
    else if (this.throttle < 0) a = this.speed > 0.5 ? 12 * this.throttle : d.accel * 0.6 * this.throttle * (1 + Math.min(0, this.speed) / 8)
    if (this.brake) a -= Math.sign(this.speed) * Math.min(Math.abs(this.speed) / Math.max(dt, 1e-3), 14 * this.brake)
    a -= this.speed * (onRoad ? 0.02 : 0.08) + Math.sign(this.speed) * (onRoad ? 0.15 : 0.6)
    a -= 9.81 * Math.sin(this.pitch) * (this.onGround ? 1 : 0)
    if (this.onGround || swim) this.speed += a * dt
    if (Math.abs(this.speed) < 0.05 && !this.throttle) this.speed = 0
    // steering: the bicycle model; tracks pivot
    const steerMax = d.turn * (1 - Math.min(0.6, Math.abs(this.speed) / 60))
    let yawRate
    if (tracked) yawRate = this.steer * steerMax * (1.1 - Math.min(0.6, Math.abs(this.speed) / d.maxSpeed))
    else yawRate = this.speed * Math.tan(this.steer * steerMax) / Math.max(1.5, d.size[2] * 0.6)
    if (this.onGround || swim) this.yaw += yawRate * dt
    // sideways: grip pulls the slide out (handbrake and loose ground let it go)
    const grip = (d.grip || 1) * (onRoad ? 9 : 5) * surf * (this.handbrake ? 0.25 : 1)
    this.vLat += -yawRate * this.speed * 0.15 * dt
    this.vLat *= Math.exp(-grip * dt)
    // move
    this.vel.copy(fwd).multiplyScalar(this.speed).addScaledVector(right, this.vLat)
    this.vel.y = this.vY
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt
    // the ground under each wheel sets the body's height, pitch and roll
    const L = d.size[2] * 0.62, W = d.size[0] * 0.45
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw)
    const P = (lx, lz) => this.groundAt(this.pos.x + lx * c + lz * s, this.pos.z - lx * s + lz * c)
    const hFL = P(W, L / 2), hFR = P(-W, L / 2), hRL = P(W, -L / 2), hRR = P(-W, -L / 2)
    let target = (hFL + hFR + hRL + hRR) / 4
    if (swim) target = Math.max(target, wl - 1.0)
    const tp = swim ? 0 : Math.atan2((hFL + hFR) / 2 - (hRL + hRR) / 2, L), tr = swim ? 0 : Math.atan2((hFL + hRL) / 2 - (hFR + hRR) / 2, W * 2)
    if (this.pos.y > target + 0.15) {
      // in the air (over a jump or a drop)
      this.onGround = false
      this.vY -= 9.81 * dt
      this.pos.y += this.vY * dt
      if (this.pos.y <= target) { if (this.vY < -11) this.damage(Math.abs(this.vY) * 12, null, 'crash'); this.pos.y = target; this.vY = 0 }
    } else {
      this.onGround = true
      if (target > this.pos.y + 0.6 && Math.abs(this.speed) > 2) { this.speed *= 0.5; this.damage(10, null, 'crash') }   // a kerb or a wall foot
      this.vY = (target - this.pos.y) / Math.max(dt, 1e-3) * 0.3
      this.pos.y += (target - this.pos.y) * Math.min(1, dt * 14)
      this.pitch += (tp - this.pitch) * Math.min(1, dt * 8)
      this.roll += (tr - this.roll) * Math.min(1, dt * 8)
      if (bike) this.roll += (-this.steer * Math.min(1, Math.abs(this.speed) / 15) * 0.4 - this.roll) * Math.min(1, dt * 5)
    }
    // dust on dirt
    if (!onRoad && Math.abs(this.speed) > 6) this.game.fx.dustFromWheels(this.pos.x - fwd.x * L / 2, this.pos.y, this.pos.z - fwd.z * L / 2, Math.min(1, Math.abs(this.speed) / 20) * dt * 12)
    this.collide(dt)
  }
  // Pushing the hull out of walls, trees and other vehicles, and running soldiers over.
  collide(dt) {
    const d = this.def, G = this.game
    const hw = d.size[0] / 2, hl = d.size[2] / 2
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw)
    const r = Math.min(hw, 1.2)
    const n = Math.max(2, Math.ceil(hl * 2 / r / 1.4))
    let pushX = 0, pushZ = 0, hits = 0
    const h = { ground: false }
    for (let i = 0; i <= n; i++) {
      const lz = -hl + r + (hl * 2 - r * 2) * i / n
      _p.set(this.pos.x + lz * s, this.pos.y + Math.min(1.2, d.size[1] * 0.5), this.pos.z + lz * c)
      const ox = _p.x, oz = _p.z
      G.collision.pushSphere(_p, r, h, isFloor)
      if (_p.x !== ox || _p.z !== oz) { pushX += _p.x - ox; pushZ += _p.z - oz; hits++ }
    }
    if (hits) {
      this.pos.x += pushX / hits; this.pos.z += pushZ / hits
      const nx = pushX, nz = pushZ, nl = Math.hypot(nx, nz) || 1
      const into = -(this.vel.x * nx + this.vel.z * nz) / nl
      if (into > 6) this.damage((into - 6) * this.def.mass / 400, null, 'crash')
      if (into > 0.5) this.speed *= 0.6
    }
    // other vehicles
    for (const o of G.vehicles.list) {
      if (o === this) continue
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, dist = Math.hypot(dx, dz)
      const min = (hw + o.def.size[0] / 2) * 0.9
      if (dist < min && Math.abs(this.pos.y - o.pos.y) < 3 && dist > 0.01) {
        const k = (min - dist) / dist * 0.5
        this.pos.x += dx * k; this.pos.z += dz * k
        if (Math.abs(this.speed) > 8) { const dmg = Math.abs(this.speed) * 4; this.damage(dmg * 0.5, null, 'crash'); o.damage(dmg * this.def.mass / o.def.mass, null, 'crash') }
        this.speed *= 0.7
      }
    }
    // soldiers in the way
    if (Math.abs(this.speed) > 3) for (const sol of G.soldiersNear(this.pos.x, this.pos.z, hl + 1)) {
      if (sol.dead || sol.vehicle) continue
      const lx = (sol.pos.x - this.pos.x) * c - (sol.pos.z - this.pos.z) * s, lz = (sol.pos.x - this.pos.x) * s + (sol.pos.z - this.pos.z) * c
      if (Math.abs(lx) < hw + 0.3 && Math.abs(lz) < hl + 0.3 && Math.abs(sol.pos.y - this.pos.y) < 2) {
        sol.hurt('torso', Math.abs(this.speed) * 9, 0, this.driver, this.vel.clone().normalize(), 'crash')
        sol.vel.x += this.vel.x * 0.6; sol.vel.z += this.vel.z * 0.6
      }
    }
  }
  // ---------- helicopters ----------
  heli(dt) {
    const d = this.def, drv = this.driver
    const inp = this.ctl || {}
    this.rpm += ((this.engine && drv ? 1 : 0) - this.rpm) * Math.min(1, dt * 0.7)
    const g = this.groundAt(this.pos.x, this.pos.z)
    const wl = waterLevel(this.pos.x, this.pos.z)
    const floor = Math.max(g, wl)
    this.alt = this.pos.y - floor
    // cyclic: tilt towards where the controls ask
    const assist = this.game.settings.flightAssist || !drv?.isPlayer   // AI pilots always fly with the altitude hold
    // forward stick: nose down (negative pitch); right stick: bank right (the world's right is -x)
    const tp = -(inp.pitch || 0) * 0.32, tr = -(inp.roll || 0) * 0.42
    this.pitch += (tp - this.pitch) * Math.min(1, dt * 2.2)
    this.roll += (tr - this.roll) * Math.min(1, dt * 2.6)
    this.yaw += (inp.yaw || 0) * dt * 1.4
    // collective: with assist, the throttle keys set a climb rate and the machine holds it
    if (assist) {
      const climb = (inp.climb || 0) * 8
      const wantVy = climb
      const err = wantVy - this.vel.y
      this.collective = THREE.MathUtils.clamp(1 / 1.6 / Math.max(0.3, this.rpm) / Math.max(0.3, Math.cos(this.pitch) * Math.cos(this.roll)) + err * 0.08, 0, 1)
      if (this.onGround && climb <= 0) this.collective = Math.min(this.collective, 0.45)
    } else this.collective = THREE.MathUtils.clamp(this.collective + (inp.climb || 0) * dt * 0.5, 0, 1)
    // forces: lift along the rotor axis, gravity, drag
    this.quat.setFromEuler(_e.set(-this.pitch, this.yaw, -this.roll, 'YXZ'))
    const up = _u.copy(UP).applyQuaternion(this.quat)
    const lift = 9.81 * 1.6 * this.collective * this.rpm * (this.alive ? 1 : 0) * (this.alt < 4 ? 1.05 : 1)
    const acc = _a.copy(up).multiplyScalar(lift)
    acc.y -= 9.81
    // drag holds the speed in check (more sideways), and assist bleeds drift when the stick is centred
    const fwd = _f.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))
    const vF = this.vel.dot(fwd)
    acc.addScaledVector(this.vel, -0.06 - (Math.abs(vF) > d.maxSpeed ? 0.5 : 0))
    if (assist && !inp.pitch && !inp.roll && this.alt > 2) { this.vel.x *= 1 - dt * 0.5; this.vel.z *= 1 - dt * 0.5 }
    this.vel.addScaledVector(acc, dt)
    this.pos.addScaledVector(this.vel, dt)
    this.speed = vF
    // the ground and landing
    const skid = 0.2
    if (this.pos.y < floor + skid) {
      const vy = this.vel.y
      this.pos.y = floor + skid
      if (vy < -6 || Math.abs(this.roll) > 0.5 || Math.abs(this.pitch) > 0.5) this.damage((Math.abs(vy) + 4) * 45, null, 'crash')
      if (wl > g + 1) { this.damage(dt * 200, null, 'crash'); this.engine = false }
      this.vel.y = Math.max(0, this.vel.y); this.vel.x *= 1 - dt * 3; this.vel.z *= 1 - dt * 3
      this.onGround = true
      this.pitch *= 1 - dt * 4; this.roll *= 1 - dt * 4
    } else this.onGround = false
    // the rotor hits buildings and trees
    const h = { ground: false }
    _p.set(this.pos.x, this.pos.y + 3, this.pos.z)
    const ox = _p.x, oz = _p.z, oy = _p.y
    this.game.collision.pushSphere(_p, d.rotor * 0.8, h)
    if (_p.x !== ox || _p.z !== oz || _p.y !== oy) { this.damage(dt * 400 + this.vel.length() * 10, null, 'crash'); this.pos.x += _p.x - ox; this.pos.z += _p.z - oz; this.vel.multiplyScalar(0.5) }
  }
  // ---------- planes ----------
  plane(dt) {
    const d = this.def, drv = this.driver, inp = this.ctl || {}
    if (!drv || !this.engine) this.throttle = Math.max(0, this.throttle - dt * 0.5)
    else this.throttle = THREE.MathUtils.clamp(this.throttle + (inp.thrust || 0) * dt * 0.5, 0, 1)
    const speed = this.vel.length()
    const fwd = _f.set(0, 0, 1).applyQuaternion(this.quat)
    const g = this.groundAt(this.pos.x, this.pos.z)
    const wheelH = this.gearDown ? 0.0 : -0.3
    // control surfaces bite harder with speed
    const auth = Math.min(1, speed / (d.minSpeed * 1.2))
    if (!this.onGround) {
      this.pitch += (inp.pitch || 0) * dt * 1.2 * auth
      this.roll += (inp.roll || 0) * dt * 2.4 * auth
      this.yaw += Math.sin(this.roll) * dt * 0.9 * auth * Math.cos(this.pitch) + (inp.yaw || 0) * dt * 0.3 * auth
      // stall: below the minimum speed the nose drops
      if (speed < d.minSpeed) this.pitch -= dt * (d.minSpeed - speed) / d.minSpeed * 1.2
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45)
      while (this.roll > Math.PI) this.roll -= Math.PI * 2
      while (this.roll < -Math.PI) this.roll += Math.PI * 2
    } else {
      this.roll *= 1 - dt * 5
      this.yaw += (inp.yaw || inp.roll || 0) * dt * 0.5 * Math.min(1, speed / 10)
      // rotate for take-off near the minimum speed
      if (speed > d.minSpeed * 0.9 && (inp.pitch || 0) > 0) this.pitch += dt * 0.35
      this.pitch = Math.max(0, this.pitch - (speed < d.minSpeed * 0.8 ? dt * 0.5 : 0))
    }
    this.quat.setFromEuler(_e.set(-this.pitch, this.yaw, -this.roll, 'YXZ'))
    fwd.set(0, 0, 1).applyQuaternion(this.quat)
    // thrust and drag along the nose
    let sp = speed
    sp += (this.throttle * d.accel - 0.012 * sp * sp * d.accel / d.maxSpeed * 1.4 / d.maxSpeed * d.maxSpeed - 9.81 * fwd.y * 0.9) * dt
    if (this.onGround && inp.brake) sp = Math.max(0, sp - dt * 10)
    sp = Math.max(0, Math.min(d.maxSpeed * 1.1, sp))
    // lift: above the stall the velocity follows the nose; below it gravity wins
    const liftF = THREE.MathUtils.clamp((sp - d.minSpeed * 0.7) / (d.minSpeed * 0.5), 0, 1)
    const want = _a.copy(fwd).multiplyScalar(sp)
    this.vel.lerp(want, Math.min(1, dt * 3 * liftF + (this.onGround ? dt * 8 : 0)))
    this.vel.y -= 9.81 * dt * (1 - liftF)
    if (!this.onGround) { const vl = this.vel.length(); if (vl > 0) this.vel.multiplyScalar(sp / Math.max(vl, 0.001) * 0.2 + 0.8) }
    this.pos.addScaledVector(this.vel, dt)
    this.speed = sp
    this.alt = this.pos.y - Math.max(g, waterLevel(this.pos.x, this.pos.z))
    // the ground: roll on the gear, or crash
    if (this.pos.y <= g + wheelH + 0.02) {
      const vy = this.vel.y
      const bad = !this.gearDown || vy < -6 || Math.abs(this.roll) > 0.35 || this.pitch < -0.15 || waterLevel(this.pos.x, this.pos.z) > g
      if (bad && sp > 10) { this.damage(this.maxHp * 2, null, 'crash'); return }
      this.pos.y = g + wheelH; this.vel.y = Math.max(0, this.vel.y)
      this.onGround = true
      if (this.pitch < 0) this.pitch = 0
      if (this.pitch > 0.05 && sp > d.minSpeed) this.onGround = false
      // rolling friction off the runway
      const road = roadAt(this.pos.x, this.pos.z)
      if (!road || road.d > road.w / 2) this.vel.multiplyScalar(1 - dt * 0.4)
    } else this.onGround = this.pos.y < g + 0.3
    // hitting buildings
    const h = { ground: false }
    _p.set(this.pos.x, this.pos.y + 2, this.pos.z)
    const ox = _p.x, oz = _p.z
    this.game.collision.pushSphere(_p, Math.min(4, d.size[0] / 3), h)
    if ((_p.x !== ox || _p.z !== oz) && sp > 15) this.damage(this.maxHp * 2, null, 'crash')
  }
  // ---------- boats ----------
  boat(dt) {
    const d = this.def, drv = this.driver
    if (!drv || !this.engine) this.throttle = 0
    const wl = waterLevel(this.pos.x, this.pos.z)
    const g = heightAt(this.pos.x, this.pos.z)
    const depth = wl - g
    let a = this.throttle * d.accel * (1 - Math.max(0, this.speed) / d.maxSpeed) - this.speed * 0.12
    if (this.throttle < 0 && this.speed < 0) a = this.throttle * d.accel * 0.4 * (1 + this.speed / 6)
    this.speed += a * dt
    // aground: shallow water stops the hull
    if (depth < 0.7) { this.speed *= 1 - dt * 4; if (depth < 0.2) { this.speed = Math.min(this.speed, 0.5); if (Math.abs(this.speed) > 6) this.damage(30, null, 'crash') } }
    this.yaw += this.steer * d.turn * Math.min(1, Math.abs(this.speed) / 4) * Math.sign(this.speed || 1) * dt
    const fwd = _f.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))
    this.vel.copy(fwd).multiplyScalar(this.speed)
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt
    if (waterLevel(nx, nz) > heightAt(nx, nz) + 0.15) { this.pos.x = nx; this.pos.z = nz } else this.speed *= 0.3
    // ride the swell: bow up with speed, a little roll in turns
    const t = this.game.time
    const swell = (wl === 0 ? 1 : 0.2) * (this.game.sky.w.wind / 8)
    this.pos.y = wl - 0.15 + Math.sin(t * 1.3 + this.pos.x * 0.1) * 0.15 * swell
    this.pitch += ((Math.min(0.12, this.speed / 150) + Math.sin(t * 1.1) * 0.03 * swell) - this.pitch) * Math.min(1, dt * 3)
    this.roll += ((-this.steer * Math.min(1, this.speed / d.maxSpeed) * 0.12 + Math.sin(t * 0.9 + 1) * 0.04 * swell) - this.roll) * Math.min(1, dt * 3)
    if (this.speed > 6 && Math.random() < dt * 20) this.game.fx.puff(this.pos.x - fwd.x * d.size[2] / 2, wl + 0.2, this.pos.z - fwd.z * d.size[2] / 2, { vx: (Math.random() - 0.5) * 2, vy: 1.5, vz: (Math.random() - 0.5) * 2, s0: 0.4, s1: 1.4, life: 1.2, r: 0.92, g: 0.96, b: 1, a: 0.6, grav: 3 })
    this.collide(dt)
  }
  // ---------- damage ----------
  // Ray against the hull (and turret) boxes; returns the distance or -1. Fills `hit` with the normal.
  raycast(ox, oy, oz, dx, dy, dz, maxT, hit) {
    if (!this.alive && this.wreckT > 60) return -1
    const r = Math.hypot(...this.def.size) / 2 + 1
    // quick sphere test
    const px = this.pos.x - ox, py = this.pos.y + 1 - oy, pz = this.pos.z - oz
    const t0 = px * dx + py * dy + pz * dz
    const cx = px - dx * t0, cy = py - dy * t0, cz = pz - dz * t0
    if (cx * cx + cy * cy + cz * cz > r * r) return -1
    let best = -1
    const boxes = this.model.turretHull ? [...this.hullBoxes, this.model.turretHull] : this.hullBoxes
    for (const b of boxes) {
      const c = this.boxAt(b)
      if (rayBox(c, ox, oy, oz, dx, dy, dz, maxT, _bh) && (best < 0 || _bh.t < best)) { best = _bh.t; hit.t = _bh.t; hit.nx = _bh.nx; hit.ny = _bh.ny; hit.nz = _bh.nz }
    }
    return best
  }
  boxAt(b) {
    const p = _bp.set(b.x, b.y, b.z).applyQuaternion(this.quat).add(this.pos)
    const ax = _bx.set(1, 0, 0).applyQuaternion(this.quat), ay = _by.set(0, 1, 0).applyQuaternion(this.quat), az = _bz.set(0, 0, 1).applyQuaternion(this.quat)
    _box.x = p.x; _box.y = p.y; _box.z = p.z; _box.hx = b.hx; _box.hy = b.hy; _box.hz = b.hz
    _box.ax = [ax.x, ax.y, ax.z]; _box.ay = [ay.x, ay.y, ay.z]; _box.az = [az.x, az.y, az.z]
    return _box
  }
  armorThickness() { return Math.max(0.002, this.armor * 0.01) }
  bulletHit(p, energy, x, y, z, need) {
    const pen = need !== undefined && energy > need
    // damage grows with the square root of the energy: a 5.56 round 28, 7.62 NATO 40, 12.7 mm 87 (a .50 used
    // to do 270 to a car and, through armour, 540 to a tank: five rounds killed a main battle tank)
    const base = 28 * Math.sqrt(energy / 1700)
    const dmg = this.armor <= 0.5 || pen ? base : base * 0.04
    this.damage(dmg, p.owner, 'bullet')
    // exposed crew can be hit directly
    for (const s of this.seats) if (s.occupant && s.exposed) {
      const op = s.occupant.pos
      if (Math.hypot(op.x - x, op.y + 1.2 - y, op.z - z) < 0.8) s.occupant.hurt(Math.random() < 0.3 ? 'head' : 'torso', p.dmg, p.pen, p.owner, p.vel.clone().normalize())
    }
  }
  penetrated(p, x, y, z, dx, dy, dz) {
    // a round that comes through the skin may find someone inside
    const occ = this.seats.filter(s => s.occupant)
    if (occ.length && Math.random() < 0.35) { const s = occ[Math.floor(Math.random() * occ.length)]; s.occupant.hurt(Math.random() < 0.15 ? 'head' : 'torso', p.dmg * 0.8, p.pen, p.owner, new THREE.Vector3(dx, dy, dz)) }
    if (Math.random() < 0.08) this.mobility = Math.max(0.35, this.mobility - 0.15)
  }
  // Damage from a blast or a shell (heat: anti-armour power, against the armour).
  blast(dmg, heat, src, direct) {
    const arm = this.armor
    // a shaped charge or a shell gets through when its anti-armour power beats the armour: rockets defeat
    // everything up to an IFV in one hit (it burns out) and a main battle tank in three; tank shells and
    // ATGMs need two on a tank. Rounds that do not get through do little to heavy armour.
    const through = heat > arm * 65
    let d = direct ? (through ? (dmg * 3 + heat * 1.2) * (arm > 5 ? 0.62 : 1) : dmg * Math.max(0.05, 0.6 - Math.max(0, arm - 4.5) * 0.15)) : dmg * Math.max(0.05, 1 - arm * 0.12)
    if (direct && through && this.kind === 'tracked' && Math.random() < 0.3) this.mobility = Math.max(0.2, this.mobility - 0.4)
    this.damage(d, src, 'blast')
    if (direct && this.game.debug) this.game.p0.log('dbg vehicle hit', this.def.name, through ? 'through' : 'stopped', Math.round(d), 'hp', Math.round(this.hp), '/', this.maxHp)
    // crew take some of it
    for (const s of this.seats) if (s.occupant) s.occupant.hurt('torso', d * (arm > 3 ? 0.06 : 0.25) * Math.random(), 0, src, null, 'blast')
  }
  damage(n, src, kind) {
    if (!this.alive) return
    this.hp -= n
    if (src) this.lastHit = src
    if (this.hp <= 0) this.destroy()
  }
  destroy() {
    if (!this.alive) return
    this.alive = false; this.hp = 0; this.engine = false
    const d = this.def
    this.game.explode(this.pos.x, this.pos.y + d.size[1] * 0.5, this.pos.z, { radius: d.explosive ? 16 : 6 + d.size[2] / 3, dmg: d.explosive ? 200 : 100, heat: 0 }, this.lastHit, this, true)
    // occupants: inside a burning wreck few survive
    for (const s of this.seats) if (s.occupant) { const o = s.occupant; this.game.vehicles.exit(o, true); if (Math.random() < 0.7 || this.kind === 'plane') o.die(this.lastHit, null); else o.hurt('torso', 40, 0, this.lastHit, null, 'blast') }
    this.game.onVehicleDestroyed?.(this)
  }
  popFlares() {
    if (this.flares <= 0 || this.flareT > 0) return false
    this.flares -= 2; this.flareT = 3
    for (let i = 0; i < 8; i++) this.game.fx.flash(this.pos.x, this.pos.y, this.pos.z, { vx: (Math.random() - 0.5) * 30, vy: -2 + Math.random() * 10, vz: (Math.random() - 0.5) * 30, size: 0.8, life: 2.5, r: 1, g: 0.85, b: 0.5, grav: 4 })
    for (const p of this.game.ballistics.list) if (p.rocket && p.rocket.target === this && Math.random() < 0.8) p.rocket.target = null
    return true
  }
}
// a bridge deck's end face is not a wall to a vehicle driving onto it
const isFloor = c => c.kind === 'floor'
function newMounted(id) { const def = weapon(id); return { def, mag: def.mag, cooldown: 0, reloadT: 0, lock: null, lockT: 0 } }

// ---------- the manager ----------
export class Vehicles {
  constructor(game) {
    this.game = game
    this.list = []
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    this.wreckMat = new THREE.MeshLambertMaterial({ color: 0x1f1d1b, flatShading: true })
    // headlights: one real spotlight, given to your vehicle (or the nearest lit one), always in the scene so
    // switching it never recompiles the materials; every lit vehicle also shows glowing lamps
    this.spot = new THREE.SpotLight(0xfff0d2, 0, 85, 0.55, 0.45, 1.3)
    game.engine.world.add(this.spot, this.spot.target)
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
    this.glowGeo = new THREE.CircleGeometry(0.16, 10)
  }
  lamps(dt) {
    const g = this.game, night = g.sky?.night || 0, cam = g.camPos
    let best = null, bd = 150
    const me = g.player?.s.vehicle
    for (const v of this.list) {
      if (!v.alive) { if (v.glow) v.glow.visible = false; continue }
      // AI drivers light up at dusk
      const drv = v.driver
      if (drv && !drv.isPlayer && v.kind !== 'plane') v.lights = night > 0.45
      if (v.lights && !v.glow && v.model.lights.length) {
        v.glow = new THREE.Group()
        for (const [x, y, z] of v.model.lights) { const m = new THREE.Mesh(this.glowGeo, this.glowMat); m.position.set(x, y, z + 0.06); v.glow.add(m) }
        v.root.add(v.glow)
      }
      if (v.glow) v.glow.visible = !!v.lights
      // a police car's light bar flashes blue and red while its lights are on
      if (v.model.beacon) {
        if (!v.beacon) { v.beacon = v.model.beacon.map(([x, y, z, c]) => { const m = new THREE.Mesh(this.beaconGeo ||= new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y + 0.04, z); v.root.add(m); return m }) }
        const ph = Math.floor((g.time || 0) * 5) % 2
        v.beacon.forEach((m, i) => { m.visible = !!v.lights && ph === i })
      }
      if (v.lights && cam) { const d = v === me ? 0 : Math.hypot(v.pos.x - cam.x, v.pos.z - cam.z); if (d < bd) { bd = d; best = v } }
    }
    const s = this.spot
    if (!best || !best.model.lights.length) { s.intensity = 0; return }
    const L = best.model.lights, c = new THREE.Vector3()
    for (const l of L) c.x += l[0] / L.length, c.y += l[1] / L.length, c.z += l[2] / L.length
    s.position.copy(c).applyQuaternion(best.quat).add(best.pos)
    s.target.position.set(0, -1.4, 22).add(c).applyQuaternion(best.quat).add(best.pos)
    s.intensity = 700
  }
  spawn(type, x, z, yaw, o) { const v = new Vehicle(this.game, type, x, z, yaw, o); this.list.push(v); return v }
  remove(v) { this.game.engine.world.remove(v.root); const i = this.list.indexOf(v); if (i >= 0) this.list.splice(i, 1); for (const s of v.seats) if (s.occupant) this.exit(s.occupant, true) }
  nearest(pos, r = 6) {
    let best = null, bd = r
    for (const v of this.list) { if (!v.alive) continue; const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z) - Math.max(v.def.size[0], v.def.size[2]) / 2; if (d < bd && Math.abs(v.pos.y - pos.y) < 4) { bd = d; best = v } }
    return best
  }
  // Get in: the first free seat of the role wanted (the driver's seat by default).
  enter(sol, v, role = null) {
    if (!v.alive) return false
    let seat = role ? v.seats.find(s => !s.occupant && s.role === role) : null
    if (!seat) seat = v.seats.find(s => !s.occupant && (s.role === 'driver' || s.role === 'pilot')) || v.seats.find(s => !s.occupant && s.role === 'gunner') || v.seats.find(s => !s.occupant)
    if (!seat) return false
    seat.occupant = sol; sol.vehicle = v; sol.seat = seat
    sol.stance = 0; sol.ads = false
    if (seat.role === 'driver' || seat.role === 'pilot') { v.engine = v.fuel > 0; if (v.kind === 'heli') v.targetAlt = v.pos.y }
    sol.gunner = seat.role === 'gunner'
    return true
  }
  requestSeat(sol, v) { if (v.seats.some(s => !s.occupant && s.role === 'passenger')) this.enter(sol, v, 'passenger') }
  exit(sol, forced = false) {
    const v = sol.vehicle; if (!v) return
    const s = v.seatOf(sol)
    if (s) s.occupant = null
    sol.vehicle = null; sol.seat = null; sol.gunner = false
    // step out beside the door, on the ground (or parachute from an aircraft high up)
    const side = s && s.at[0] < 0 ? -1 : 1
    const c = Math.cos(v.yaw), sn = Math.sin(v.yaw)
    const ox = side * (v.def.size[0] / 2 + 0.8)
    sol.pos.set(v.pos.x + ox * c + (s ? s.at[2] : 0) * sn, v.pos.y, v.pos.z - ox * sn + (s ? s.at[2] : 0) * c)
    const g = Math.max(heightAt(sol.pos.x, sol.pos.z), this.game.collision.floorAt(sol.pos.x, sol.pos.y + 1, sol.pos.z, 1, 4))
    if (v.alt > 20 && !forced) { sol.parachute = true; sol.vel.set(v.vel.x * 0.5, 0, v.vel.z * 0.5) }
    else { sol.pos.y = Math.max(g, waterLevel(sol.pos.x, sol.pos.z) - 1.4); sol.vel.set(0, 0, 0) }
    if (!v.driver) { v.throttle = 0; if (v.kind !== 'heli' && v.kind !== 'plane') v.engine = false }
  }
  changeSeat(sol) {
    const v = sol.vehicle; if (!v) return
    const cur = v.seatOf(sol), i = v.seats.indexOf(cur)
    for (let k = 1; k < v.seats.length; k++) { const s = v.seats[(i + k) % v.seats.length]; if (!s.occupant) { cur.occupant = null; s.occupant = sol; sol.seat = s; sol.gunner = s.role === 'gunner'; if ((s.role === 'driver' || s.role === 'pilot') && v.fuel > 0) v.engine = true; return s } }
    return null
  }
  update(dt) {
    for (const v of this.list) v.update(dt)
    this.lamps(dt)
    // wrecks are cleared after a while (and far from the player)
    for (let i = this.list.length - 1; i >= 0; i--) { const v = this.list[i]; if (!v.alive && v.wreckT > 120) this.remove(v) }
  }
  // Fire a mounted weapon from a seat along `dir` (the seat's aim). Returns true when a round left.
  fireSeat(v, seat, dir, alt = false, target = null) {
    const w = alt ? seat.w2 : seat.w
    if (!w || w.cooldown > 0 || w.reloadT > 0) return false
    if (w.mag <= 0) { w.reloadT = w.def.reload || 4; return false }
    w.mag--; w.cooldown = 60 / w.def.rpm
    const a = AMMO[w.def.ammo]
    // the muzzle: from the gun's pivot along the aim (a few metres out for the big guns)
    const m = v.model
    const piv = seat.turret && m.gunPivot && !seat.side ? _v.set(m.gunPivot[0], m.gunPivot[1], m.gunPivot[2]).applyQuaternion(v.quat).add(v.pos) : _v.set(seat.at[0], seat.at[1] + 0.3, seat.at[2]).applyQuaternion(v.quat).add(v.pos)
    const len = seat.turret && m.gunLength ? m.gunLength : v.kind === 'plane' ? 6 : 1
    const origin = piv.clone().addScaledVector(dir, len)
    const spread = (w.def.moa || 2) * 0.0003
    const d2 = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread * 2, (Math.random() - 0.5) * spread * 2, (Math.random() - 0.5) * spread * 2)).normalize()
    const shooter = seat.occupant
    if (w.def.drop) {
      // a bomb falls with the aircraft's speed
      this.game.ballistics.fire({ origin: v.pos.clone().add(new THREE.Vector3(0, -1, 0)), dir: v.vel.clone().normalize(), v: v.vel.length(), ammo: w.def.ammo, owner: shooter, vehicle: v })
    } else this.game.ballistics.fire({ origin, dir: d2, v: w.def.velocity ?? a.v, ammo: w.def.ammo, owner: shooter, vehicle: v, tracer: w.def.tracerEvery ? (w.mag % w.def.tracerEvery === 0) : !!a.rocket, inherit: v.kind === 'plane' || v.kind === 'heli' ? v.vel : null, target: target || w.lock })
    this.game.fx.muzzle(origin.x, origin.y, origin.z, d2.x, d2.y, d2.z, a.mass > 100 ? 4 : a.mass > 30 ? 2 : 1.2)
    this.game.sfx?.shot(w.def.id, origin, false, shooter)
    this.game.ai.heard(origin.x, origin.y, origin.z, a.mass > 30 ? 800 : 400, shooter)
    if (w.def.ammo === '120mm') { v.pitch -= 0.04; this.game.fx.puff(origin.x, origin.y, origin.z, { s0: 2, s1: 8, life: 3, r: 0.8, g: 0.78, b: 0.72, a: 0.6, drag: 1 }) }
    return true
  }
}
const _e = new THREE.Euler(), _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _a = new THREE.Vector3(), _p = new THREE.Vector3()
const _bh = { t: 0, tOut: 0, nx: 0, ny: 0, nz: 0 }, _bp = new THREE.Vector3(), _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3()
const _box = { x: 0, y: 0, z: 0, hx: 1, hy: 1, hz: 1, ax: [1, 0, 0], ay: [0, 1, 0], az: [0, 0, 1] }
