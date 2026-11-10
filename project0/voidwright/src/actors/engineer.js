// The engineer: walks wherever there is gravity (a planet's, or a gravity generator's inside a ship), flies
// a jetpack anywhere (upright in gravity, free in all six directions out in space), with inertia dampeners
// that stop you, or hold you to the ship you are near. Collides as three spheres with rock and hulls; walks
// on moving ships. Sits in cockpits and seats.
import * as THREE from 'three'
import { Inventory } from '../game/items.js'

const UP = new THREE.Vector3(0, 1, 0)
const R = 0.34, OFFS = [0.36, 0.95, 1.5]   // sphere centres above the feet
export const EYE = 1.62

export class Engineer {
  constructor(world, pos) {
    this.world = world
    this.pos = new THREE.Vector3().copy(pos)   // the feet
    this.vel = new THREE.Vector3()
    this.quat = new THREE.Quaternion()          // the body (in gravity: yaw only round 'up')
    this.pitch = 0
    this.up = new THREE.Vector3(0, 1, 0)
    this.jetpack = false
    this.dampeners = true
    this.onGround = false
    this.ground = null                          // the grid stood on
    this.health = 100; this.energy = 100; this.fuel = 100; this.oxygen = 100
    this.inv = new Inventory(world.creative ? 4000 : 400)
    this.seat = null                             // { grid, block }
    this.crouch = false
    this.light = false
    this.dead = false
    this.thrusting = 0
    this.g = new THREE.Vector3()
    this.tmp = new THREE.Vector3(); this.n = new THREE.Vector3(); this.gv = new THREE.Vector3()
  }
  get gravity() { return this.g.length() }
  // the view: eye position and direction
  eye(out = new THREE.Vector3()) { return out.copy(this.up).multiplyScalar(this.crouch && this.onGround ? 1.05 : EYE).add(this.pos) }
  viewQuat(out = new THREE.Quaternion()) { return out.copy(this.quat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch)) }
  forward(out = new THREE.Vector3()) { return out.set(0, 0, -1).applyQuaternion(this.viewQuat()) }
  look(yaw, pitch, roll = 0) {
    if (this.gravity > 0.4 || (this.onGround)) {
      // upright: yaw about up, pitch the head
      this.quat.premultiply(new THREE.Quaternion().setFromAxisAngle(this.up, yaw))
      this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch + pitch))
    } else {
      // free: the whole body turns (pitch moves into the body so there is no gimbal limit)
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch + this.pitch, yaw, roll, 'YXZ'))
      this.pitch = 0
      this.quat.multiply(q).normalize()
    }
  }
  // the body turns to stand upright against gravity (smoothly)
  align(dt) {
    const g = this.g.length()
    if (g > 0.05) {
      const want = this.tmp.copy(this.g).multiplyScalar(-1 / g)
      const cur = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat)
      const k = Math.min(1, dt * (this.onGround ? 12 : 3.5) * Math.min(1, g / 2))
      const q = new THREE.Quaternion().setFromUnitVectors(cur, want)
      const part = new THREE.Quaternion().slerp(q, k)
      // fold the body's pitch into the head when coming down out of free flight
      this.quat.premultiply(part).normalize()
    }
    this.up.set(0, 1, 0).applyQuaternion(this.quat)
  }
  // inp: { move [x, y, z] (-1..1, z forward), sprint, jump, roll }
  update(dt, inp) {
    if (this.dead) return
    const W = this.world
    if (this.seat) { this.sit(dt); return }
    W.gravityFelt(this.pos, this.g)
    const g = this.g.length()
    this.align(dt)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat), right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat), up = this.up
    // what we stand on moves (a ship): walk relative to it
    const gvel = this.ground ? this.ground.pointVel(this.pos, this.gv) : this.gv.set(0, 0, 0)
    const rel = this.tmp.copy(this.vel).sub(gvel)
    this.thrusting = 0
    if (this.jetpack && !this.world.creative && this.fuel <= 0) { this.jetpack = false; this.outOfFuel = true }
    if (this.jetpack) {
      // thrust along the body's axes; dampeners brake toward the nearest ship's motion (or standing still)
      const acc = new THREE.Vector3().addScaledVector(right, inp.move[0]).addScaledVector(up, inp.move[1]).addScaledVector(fwd, inp.move[2])
      const a = acc.length()
      const power = (inp.sprint ? 14 : 7.5)
      if (a > 0.01) { this.vel.addScaledVector(acc.normalize(), power * dt * Math.min(1, a)); this.thrusting = Math.min(1, a) * (inp.sprint ? 1 : 0.6) }
      if (this.dampeners) {
        const ref = this.ground ? gvel : this.nearGridVel(this.gv2 || (this.gv2 = new THREE.Vector3()))
        const d = this.tmp.copy(this.vel).sub(ref)
        // only brake on the axes not being pushed
        if (a > 0.01) { const along = acc.clone().normalize(); d.addScaledVector(along, -d.dot(along)) }
        const brake = Math.min(1, dt * 3.2)
        this.vel.addScaledVector(d, -brake)
        this.thrusting = Math.max(this.thrusting, Math.min(1, d.length() * 0.3))
        // hover: cancel gravity
        this.vel.addScaledVector(this.g, -dt)
      }
      this.vel.addScaledVector(this.g, dt)
      this.energy = Math.max(0, this.energy - dt * this.thrusting * 0.25)
      this.fuel = Math.max(0, this.fuel - dt * this.thrusting * 0.35)
      if (inp.roll && g < 0.4) this.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), inp.roll * dt * 1.6))
    } else if (this.onGround) {
      // walking: move toward the speed wanted, along the ground
      const sp = this.crouch ? 1.6 : inp.sprint ? 6.4 : 3.4
      const want = new THREE.Vector3().addScaledVector(right, inp.move[0] * sp).addScaledVector(fwd, inp.move[2] * sp)
      want.addScaledVector(up, -want.dot(up))
      const horiz = rel.clone().addScaledVector(up, -rel.dot(up))
      const k = Math.min(1, dt * 11)
      horiz.lerp(want, k)
      const vert = rel.dot(up)
      this.vel.copy(gvel).add(horiz).addScaledVector(up, vert)
      if (inp.jump && g > 0.1) { this.vel.addScaledVector(up, Math.sqrt(2 * g * 0.75)); this.onGround = false }
      this.vel.addScaledVector(this.g, dt)
    } else {
      // falling (no jetpack): a little air control
      const want = new THREE.Vector3().addScaledVector(right, inp.move[0]).addScaledVector(fwd, inp.move[2])
      this.vel.addScaledVector(want, dt * 1.2)
      this.vel.addScaledVector(this.g, dt)
    }
    this.energy = Math.min(100, this.energy + dt * 0.05)
    const before = this.vel.clone()
    this.pos.addScaledVector(this.vel, dt)
    this.collide(dt)
    // fall damage from a hard stop
    const dv = before.sub(this.vel).length()
    if (dv > 13) this.hurt((dv - 13) * 7, 'impact')
  }
  // the velocity of the nearest moving grid within 60 m (the jetpack's dampeners hold you to it)
  nearGridVel(out) {
    out.set(0, 0, 0)
    let best = 60
    for (const g of this.world.grids) {
      if (g.static || !g.blocks.size) continue
      const d = g.comWorld(this.tmp).distanceTo(this.pos) - g.radius
      if (d < best) { best = d; g.pointVel(this.pos, out) }
    }
    return out
  }
  // push out of everything solid; find the ground
  collide(dt) {
    const W = this.world, up = this.up
    this.onGround = false
    let ground = null
    const c = new THREE.Vector3(), n = this.n
    const solids = W.universe.solidsNear(this.pos, 4, this._s || (this._s = []))
    const grids = W.grids.filter(g => g.blocks.size && g.comWorld(this.tmp).distanceTo(this.pos) < g.radius + 4)
    for (let it = 0; it < 3; it++) {
      for (let s = 0; s < OFFS.length; s++) {
        c.copy(up).multiplyScalar(OFFS[s]).add(this.pos)
        // rock
        for (const so of solids) {
          const d = so.sdf(c)
          if (d >= R) continue
          if (so.surface) { const su = so.surface(c, this._su || (this._su = {})); n.set(su.nx, su.ny, su.nz) }
          else { const e = 0.08; n.set(so.sdf(this.tmp.set(c.x + e, c.y, c.z)) - so.sdf(this.tmp.set(c.x - e, c.y, c.z)), so.sdf(this.tmp.set(c.x, c.y + e, c.z)) - so.sdf(this.tmp.set(c.x, c.y - e, c.z)), so.sdf(this.tmp.set(c.x, c.y, c.z + e)) - so.sdf(this.tmp.set(c.x, c.y, c.z - e))).normalize() }
          this.resolve(n, R - d, null, s)
          if (s === 0 && n.dot(up) > 0.6) { this.onGround = true; ground = null }
        }
        // hulls
        for (const g of grids) {
          const d = g.sdf(c, R + 0.1, n)
          if (d >= R) continue
          this.resolve(n, R - d, g, s)
          if (s === 0 && n.dot(up) > 0.6) { this.onGround = true; ground = g }
        }
      }
    }
    // standing still on the ground: settle (no sliding down gentle slopes)
    this.ground = this.onGround ? ground : (this.jetpack ? null : this.ground && !this.onGround ? null : this.ground)
  }
  resolve(n, pen, grid, s) {
    this.pos.addScaledVector(n, pen)
    const gv = grid ? grid.pointVel(this.pos, new THREE.Vector3()) : new THREE.Vector3()
    const rel = this.vel.clone().sub(gv)
    const vn = rel.dot(n)
    if (vn < 0) rel.addScaledVector(n, -vn)
    // friction on the feet
    if (s === 0 && !this.jetpack && n.dot(this.up) > 0.6) { const t = rel.clone().addScaledVector(n, -rel.dot(n)); if (t.length() < 0.25) rel.sub(t) }
    this.vel.copy(gv).add(rel)
  }
  hurt(amount, why) {
    if (this.dead) return
    this.health -= amount
    this.lastHurt = why
    if (this.health <= 0) { this.health = 0; this.dead = true; this.deathCause = why }
  }
  // ---- seats ----
  enterSeat(grid, block) {
    this.seat = { grid, block }
    this.jetpack = false
    this.vel.set(0, 0, 0)
    this.seatLook = { yaw: 0, pitch: 0 }
    this.sit(0)
  }
  // where the eye is in a seat, and which way the seat faces (world)
  seatFrame(outPos, outQuat) {
    const { grid, block } = this.seat
    const f = block.def.func.cockpit, e = grid.size === 'small' && f.eyeS ? f.eyeS : f.eye
    grid.toWorld(grid.blockPoint(block, e[0], e[1], e[2]), outPos)
    const fwd = grid.dirToWorld(grid.blockDir(block, 0, 0, -1)), up = grid.dirToWorld(grid.blockDir(block, 0, 1, 0))
    const z = fwd.clone().negate(), x = new THREE.Vector3().crossVectors(up, z)
    const m = new THREE.Matrix4().makeBasis(x, up, z)
    outQuat.setFromRotationMatrix(m)
    return outPos
  }
  sit(dt) {
    this.world.gravityFelt(this.pos, this.g)
    const p = new THREE.Vector3(), q = new THREE.Quaternion()
    this.seatFrame(p, q)
    this.pos.copy(p).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(q), -EYE)
    this.quat.copy(q); this.up.set(0, 1, 0).applyQuaternion(q)
    this.seat.grid.pointVel(p, this.vel)
    this.onGround = false
  }
  // out of the seat: beside it if there is room, else above the grid
  leaveSeat() {
    const { grid, block } = this.seat
    const W = this.world, tries = [[0, 0, 1.2], [1.2, 0, 0], [-1.2, 0, 0], [0, 1.2, 0], [0, 0, -1.4], [0, 2.4, 0]]
    this.seat = null
    const p = new THREE.Vector3()
    for (const t of tries) {
      const k = grid.size === 'large' ? 1 : 3
      grid.toWorld(grid.blockPoint(block, t[0] * k, t[1] * k - (grid.size === 'large' ? 0.3 : 1), t[2] * k), p)
      const feet = p.clone(), head = p.clone().addScaledVector(this.up, 1.5)
      if (grid.sdf(feet.clone().addScaledVector(this.up, 0.4), 0.6, null) > 0.36 && grid.sdf(head, 0.6, null) > 0.36 && W.universe.sdf(feet, 2) > 0.2) { this.pos.copy(feet); grid.pointVel(p, this.vel); return }
    }
    grid.toWorld(new THREE.Vector3(0, grid.radius + 1, 0).add(grid.com), this.pos)
  }
}
