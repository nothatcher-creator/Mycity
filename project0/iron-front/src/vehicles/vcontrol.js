// The player at the controls of a vehicle: driving, flying, steering a boat, or aiming a turret, and the
// cameras for each (a chase camera that orbits with the mouse; the gunner's optic; the pilot's view).
import * as THREE from 'three'
import { heightAt } from '../world/heightfield.js'
import { raycastTerrain } from '../world/collision.js'
import { C } from '../ui/ui.js'

export class VehicleControl {
  constructor(game) {
    this.game = game
    this.orbit = { yaw: 0, pitch: 0.18 }
    this.camPos = new THREE.Vector3(); this.camQuat = new THREE.Quaternion()
    this.fov = 70
    this.firstPerson = false
    this.zoom = 1
    this.aim = { yaw: 0, pitch: 0 }     // mouse-aim for planes and helicopters (world)
  }
  update(dt, sol, input) {
    const v = sol.vehicle, seat = sol.seat, g = this.game
    const look = input.takeLook(this.zoom > 1 ? 1 / this.zoom : 1)
    const wheel = input.takeWheel()
    if (input.hit('interact')) { g.vehicles.exit(sol); g.player.view = g.player.lastView || 'fp'; return }
    if (input.hit('vSeat')) { const s = g.vehicles.changeSeat(sol); if (s) g.hud.note(`Seat: ${s.role}`) }
    if (input.hit('view')) this.firstPerson = !this.firstPerson
    if (input.hit('vLight')) { v.lights = !v.lights; g.hud.note(v.lights ? 'Lights on' : 'Lights off') }
    // the engine: off and it stays off (the throttle no longer starts it) until switched on again
    if (input.hit('vEngine') && (seat.role === 'driver' || seat.role === 'pilot')) {
      if (v.engine) { v.engine = false; v.engineOff = true; g.hud.note('Engine off') }
      else if (v.fuel > 0 && v.alive) { v.engine = true; v.engineOff = false; g.hud.note('Engine on') } else g.hud.note(v.fuel > 0 ? 'The engine is wrecked' : 'No fuel')
    }
    if (input.hit('vHorn')) g.sfx?.horn(v)
    if (input.hit('vFlares') && v.popFlares()) g.hud.note('Flares!')
    const driving = seat.role === 'driver' || seat.role === 'pilot'
    // warnings, once each: fuel running low, the engine badly damaged, on fire
    if (driving) {
      const W = v.warned || (v.warned = {})
      if (v.fuel < v.maxFuel * 0.15 && v.fuel > 0 && !W.fuel) { W.fuel = true; g.hud.note('Low fuel: find a fuel station or a jerrycan', C.amber) }
      if (v.fuel >= v.maxFuel * 0.3) W.fuel = false
      if (v.hp < v.maxHp * 0.4 && !W.hp) { W.hp = true; g.hud.note('Heavy damage: repair it with a repair kit', C.amber) }
      if (v.hp >= v.maxHp * 0.6) W.hp = false
      if (v.burning > 0 && !W.fire) { W.fire = true; g.hud.note('ON FIRE: get out before it blows!', C.red) }
    }
    // the touch buttons stand in for the mouse buttons and the up and down keys
    const P = g.player
    const fire = input.mouse.left || P.touchFire, alt = input.mouse.right || P.touchAlt
    const up = input.down('vUp') || P.touchUp, down = input.down('vDown') || P.touchDown
    const touchTurn = input.touch
    // ---- driving / flying ----
    if (driving) {
      if (v.kind === 'heli') {
        const assist = g.settings.flightAssist
        v.ctl = {
          pitch: (input.down('forward') ? 1 : 0) - (input.down('back') ? 1 : 0),
          // on touch the stick's left and right turn the helicopter (one thumb flies it); with keys they roll
          roll: touchTurn ? 0 : (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0),
          climb: (up ? 1 : 0) - (down ? 1 : 0),
          // (gentler while flying forward, so the speed can build along the new heading)
          yaw: touchTurn ? ((input.down('left') ? 1 : 0) - (input.down('right') ? 1 : 0)) * (input.down('forward') ? 0.4 : 0.8) : assist ? THREE.MathUtils.clamp(look.yaw * 18, -1, 1) : (input.down('leanR') ? -1 : 0) + (input.down('leanL') ? 1 : 0),
        }
        if (!assist) { this.orbit.yaw += look.yaw; this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch - look.pitch, -0.6, 1.2) }
        else this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch - look.pitch, -0.6, 1.2)
      } else if (v.kind === 'plane') {
        const assist = g.settings.flightAssist
        const thrust = (input.down('forward') ? 1 : 0) - (input.down('back') ? 1 : 0)
        if (input.hit('vGear')) { if (!v.onGround) { v.gearDown = !v.gearDown; g.hud.note(v.gearDown ? 'Gear down' : 'Gear up') } }
        if (assist) {
          // mouse aim: the camera looks where the mouse goes; the plane flies there
          this.aim.yaw += look.yaw; this.aim.pitch = THREE.MathUtils.clamp(this.aim.pitch + look.pitch, -1.3, 1.3)
          // the autopilot: bank towards the aim (at most ~60 degrees, so it never rolls over), hold the aim's climb.
          // A positive heading error is to the left (the world's left is +x): bank left (positive roll) to turn there.
          let e = this.aim.yaw - v.yaw
          while (e > Math.PI) e -= Math.PI * 2
          while (e < -Math.PI) e += Math.PI * 2
          const kb = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0)
          const bankWant = kb ? -kb * 1.2 : THREE.MathUtils.clamp(e * 2.5, -1.05, 1.05)
          const pitchWant = THREE.MathUtils.clamp(this.aim.pitch, -1.1, 1.1)
          v.ctl = {
            thrust, brake: down,
            pitch: THREE.MathUtils.clamp((pitchWant - v.pitch) * 3, -1, 1),
            roll: THREE.MathUtils.clamp((bankWant - v.roll) * 2.5, -1, 1),
            yaw: THREE.MathUtils.clamp(e * 2, -1, 1),
          }
          if (v.onGround) v.ctl.pitch = up || this.aim.pitch > 0.1 ? 1 : 0
        } else {
          v.ctl = { thrust, brake: input.down('vDown'), pitch: THREE.MathUtils.clamp(look.pitch * 25, -1, 1) + (input.down('vUp') ? 1 : 0), roll: THREE.MathUtils.clamp(look.yaw * 25, -1, 1) - ((input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0)), yaw: (input.down('leanR') ? -1 : 0) + (input.down('leanL') ? 1 : 0) }
        }
      } else {
        // cars, tracks, boats
        const t = (input.down('forward') ? 1 : 0) - (input.down('back') ? 1 : 0)
        const st = (input.down('left') ? 1 : 0) - (input.down('right') ? 1 : 0)
        v.throttle = t
        v.steer += (st - v.steer) * Math.min(1, dt * (st ? 6 : 9))
        v.handbrake = input.down('jump')
        v.brake = v.handbrake ? 1 : 0
        v.boost = input.down('vBoost')
        if (!v.engine && !v.engineOff && t && v.fuel > 0 && v.alive) v.engine = true
        this.orbit.yaw += look.yaw; this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch - look.pitch, -0.5, 1.2)
        // the orbit drifts back behind the vehicle while driving
        if (!look.yaw && Math.abs(v.speed) > 3) this.orbit.yaw *= 1 - dt * 1.2
      }
      // the pilot's own guns
      if (seat.w && (seat.pilotWeapon || v.kind === 'plane' || v.kind === 'heli')) {
        const dir = v.kind === 'plane' || v.kind === 'heli' ? v.forward(new THREE.Vector3()).add(new THREE.Vector3(0, v.kind === 'heli' ? -0.06 : 0, 0)).normalize() : v.forward(new THREE.Vector3())
        if (fire) g.vehicles.fireSeat(v, seat, dir, false)
        if (alt && seat.w2) this.lockAndFire(v, seat, dir, dt, input)
      }
    } else if (seat.w) {
      // ---- the gunner aims the turret ----
      seat.aimYaw += look.yaw
      if (seat.side) seat.aimYaw = THREE.MathUtils.clamp(seat.aimYaw, -1.6, 1.6)
      seat.aimPitch = THREE.MathUtils.clamp(seat.aimPitch + look.pitch, -0.35, seat.side ? 0.6 : 0.95)
      if (wheel) this.zoom = THREE.MathUtils.clamp(this.zoom * (wheel < 0 ? 1.5 : 1 / 1.5), 1, seat.optic || 1.5)
      const dir = this.gunDir(v, seat)
      if (fire) g.vehicles.fireSeat(v, seat, dir, false)
      if (alt && seat.w2) { if (seat.w2.def.lock) this.lockAndFire(v, seat, dir, dt, input); else g.vehicles.fireSeat(v, seat, dir, true) }
      if (input.hit('reload') && seat.w.mag < seat.w.def.mag) seat.w.reloadT = seat.w.def.reload || 4
    } else {
      // a passenger looks about
      this.orbit.yaw += look.yaw; this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch - look.pitch, -0.5, 1.2)
    }
    this.camera(dt, v, seat)
    this.cockpit(v, seat, this.firstPerson)
  }
  gunDir(v, seat) {
    const yaw = v.yaw + seat.aimYaw + (seat.side ? seat.side * 1.2 : 0), pitch = seat.aimPitch + v.pitch * 0.5
    return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
  }
  // Missiles lock on to what is under the crosshair after holding it there for a moment.
  lockAndFire(v, seat, dir, dt, input) {
    const w = seat.w2, g = this.game
    if (!w) return
    if (w.def.lock) {
      const t = g.findLockTarget(v.pos, dir, w.def.lock, v)
      if (t && t === w.lock) w.lockT += dt; else { w.lock = t; w.lockT = 0 }
      if (w.lockT > 1.2) { if (g.vehicles.fireSeat(v, seat, dir, true, w.lock)) { g.hud.note('Missile away'); w.lockT = 0 } }
    } else g.vehicles.fireSeat(v, seat, dir, true)
  }
  camera(dt, v, seat) {
    const g = this.game, d = v.def
    const size = Math.max(d.size[2], d.size[0] * 0.6)
    if (seat.role === 'gunner' && seat.w && (this.firstPerson || seat.optic)) {
      // the gunner's view: a turret's optic looks from the gun along the aim; at an open mount you stand
      // behind the gun and see it in front of you
      const dir = this.gunDir(v, seat)
      const piv = v.model.gunPivot && !seat.side ? new THREE.Vector3(...v.model.gunPivot).applyQuaternion(v.quat).add(v.pos) : new THREE.Vector3(seat.at[0], seat.at[1] + 0.5, seat.at[2]).applyQuaternion(v.quat).add(v.pos)
      if (seat.optic) this.camPos.copy(piv).addScaledVector(dir, 0.5).add(new THREE.Vector3(0, 0.35, 0))
      else this.camPos.copy(piv).addScaledVector(dir, -0.75).add(new THREE.Vector3(0, 0.3, 0))
      const yaw = Math.atan2(dir.x, dir.z), pitch = Math.asin(dir.y)
      this.camQuat.setFromEuler(new THREE.Euler(pitch, yaw + Math.PI, 0, 'YXZ'))
      this.fov = g.settings.fov / this.zoom
      return
    }
    if (this.firstPerson) {
      // the driver's or pilot's seat
      const p = new THREE.Vector3(seat.at[0], seat.at[1] + (d.eye ?? 0.55), seat.at[2] + 0.1).applyQuaternion(v.quat).add(v.pos)
      this.camPos.copy(p)
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.orbit.pitch * 0.5 - 0.05, this.orbit.yaw + Math.PI, 0, 'YXZ'))
      this.camQuat.copy(v.quat).multiply(q)
      this.fov = g.settings.fov
      return
    }
    // the chase camera: behind and above, orbiting with the mouse; aircraft cameras follow the flight path
    let yaw = v.yaw + this.orbit.yaw, pitch = this.orbit.pitch
    if ((v.kind === 'plane' && g.settings.flightAssist)) { yaw = this.aim.yaw; pitch = -this.aim.pitch * 0.7 + 0.15 }
    const dist = size * 1.4 + 4
    const back = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
    const target = v.pos.clone().add(new THREE.Vector3(0, d.size[1] * 0.8 + 1, 0))
    let dd = dist
    const tt = raycastTerrain(target.x, target.y, target.z, back.x, back.y, back.z, dist, 1)
    if (tt >= 0) dd = Math.max(2, tt - 0.5)
    const h = { t: 0 }
    if (g.collision.raycast(target.x, target.y, target.z, back.x, back.y, back.z, dd, h)) dd = Math.max(2, h.t - 0.4)
    const want = target.clone().addScaledVector(back, dd)
    want.y = Math.max(want.y, heightAt(want.x, want.z) + 0.6)
    this.camPos.lerp(want, this.camPos.lengthSq() === 0 ? 1 : Math.min(1, dt * 10))
    const look = target.clone().sub(this.camPos).normalize()
    if (v.kind === 'plane' && g.settings.flightAssist) look.set(Math.sin(this.aim.yaw) * Math.cos(this.aim.pitch), Math.sin(this.aim.pitch), Math.cos(this.aim.yaw) * Math.cos(this.aim.pitch)).lerp(look, 0.25).normalize()
    this.camQuat.setFromEuler(new THREE.Euler(Math.asin(look.y), Math.atan2(look.x, look.z) + Math.PI, 0, 'YXZ'))
    this.fov = g.settings.fov + Math.min(12, Math.abs(v.speed) * 0.15)
  }
  // in first person on foot, first person in the vehicle too
  entered(v) {
    // headlights on by themselves when you take the wheel in the dark
    const g = this.game, seat = g.player?.s.seat
    if ((seat?.role === 'driver' || seat?.role === 'pilot') && (g.sky?.night ?? 0) > 0.45 && !v.lights) { v.lights = true; g.hud.note('Headlights on (L)') }
    if (g.debug) g.p0.log('dbg entered', v.def.name, 'lights', v.lights, 'night', (g.sky?.night ?? 0).toFixed(2))
    this.orbit.yaw = 0; this.orbit.pitch = 0.18; this.aim.yaw = v.yaw; this.aim.pitch = v.pitch; this.zoom = 1; this.camPos.set(0, 0, 0); this.firstPerson = (this.game.player?.lastView || this.game.player?.view) === 'fp'; v.engineOff = false }
  // A dashboard and a steering wheel (or an instrument panel) drawn with the first-person weapon's camera, so
  // the driver's first-person view has something to hold.
  cockpit(v, seat, show) {
    const g = this.game
    if (!this.dash) {
      const mat = new THREE.MeshLambertMaterial({ color: 0x23251f, flatShading: true }), metal = new THREE.MeshLambertMaterial({ color: 0x3a3c38, flatShading: true })
      this.dash = new THREE.Group()
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.42), mat); panel.position.set(0, -0.47, -0.9); panel.rotation.x = 0.2; this.dash.add(panel)
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 14), metal); dial.rotation.x = Math.PI / 2 - 0.35; dial.position.set(0.0, -0.37, -0.74); this.dash.add(dial)
      this.wheel = new THREE.Group(); this.wheel.position.set(0, -0.33, -0.62); this.wheel.rotation.x = -0.5
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 6, 18), mat); this.wheel.add(rim)
      for (const a of [0, 2.1, 4.2]) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.02), metal); sp.rotation.z = a; sp.position.set(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0); this.wheel.add(sp) }
      this.dash.add(this.wheel)
      g.engine.vmScene.add(this.dash)
    }
    const air = v.kind === 'heli' || v.kind === 'plane', on = show && (seat.role === 'driver' || seat.role === 'pilot') && v.kind !== 'bike'
    this.dash.visible = on
    if (!on) return
    this.wheel.visible = !air
    this.wheel.rotation.z = v.steer * 1.6
    this.dash.position.set(seat.at[0] > 0 ? 0.0 : 0.0, 0, 0)
    this.dash.quaternion.identity()
  }
}
