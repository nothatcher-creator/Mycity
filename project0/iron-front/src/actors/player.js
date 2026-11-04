// The player's soldier: controls, cameras and the first-person weapon.
// First person: the eye at the head (leaning moves it), the weapon drawn in its own scene so it never
// clips into walls; aiming down sights lines the sight up with the centre of the screen and zooms by the
// optic; scopes black out the rest. Third person: over the shoulder (switchable), pulled in by walls; the
// bullets still leave the muzzle and go where the crosshair points. Breathing sway, recoil kick and its
// recovery, a hold-breath for scopes, zeroing for range.
import * as THREE from 'three'
import { lin } from '../core/color.js'
import { buildWeapon } from '../combat/weapon-models.js'
import { ATTACHMENTS, AMMO, weapon } from '../combat/weapons-data.js'
import { zeroAngle } from '../combat/ballistics.js'
import { raycastTerrain } from '../world/collision.js'
import { heightAt } from '../world/heightfield.js'
import { FACTIONS, hostile } from './factions.js'
import { STAND, CROUCH, PRONE } from './soldier.js'
import { ITEMS } from '../game/inventory.js'

export class Player {
  constructor(game, soldier) {
    this.game = game
    this.s = soldier
    soldier.isPlayer = true
    this.view = 'fp'            // 'fp' | 'tp'
    this.shoulder = 1           // 1 right, -1 left
    this.tpDist = 2.6
    this.pitch = 0
    this.sway = { x: 0, y: 0, t: 0 }
    this.breath = 1             // hold-breath reserve
    this.holding = false
    this.zoomIdx = 0
    this.zero = 100             // zeroing distance (m)
    this.fov = 70
    this.adsT = 0
    this.kick = 0
    this.camShake = 0
    this.bob = 0
    this.fireHeld = false
    this.camPos = new THREE.Vector3()
    this.camQuat = new THREE.Quaternion()
    this.aimDir = new THREE.Vector3(0, 0, 1)
    this.binoculars = false
    this.nvg = false
    this.light = false
    this.freeLook = { yaw: 0, pitch: 0 }
    // the first-person weapon and arms
    const e = game.engine
    this.vm = new THREE.Group()
    e.vmScene.add(this.vm)
    // the weapon in your hands catches the light: a little shine on metal edges reads its shape
    this.vmMat = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 42, specular: 0x2c2c2a })
    this.armMat = new THREE.MeshLambertMaterial({ color: 0x55603a, flatShading: true })
    this.gloveMat = new THREE.MeshLambertMaterial({ color: 0x222222, flatShading: true })
    this.arms = []
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), i % 2 ? this.gloveMat : this.armMat); e.vmScene.add(m); this.arms.push(m) }
    this.weaponKey = null
    // one flashlight for the game, kept in the scene (adding or removing a light recompiles every shader)
    if (!game.flashlight) {
      game.flashlight = new THREE.SpotLight(0xfff2d8, 0, 70, 0.42, 0.45, 1.2)
      game.flashlight.target = new THREE.Object3D()
      e.scene.add(game.flashlight, game.flashlight.target)
    }
    this.flashlight = game.flashlight
    this.rebuildViewmodel()
  }
  get ads() { return this.s.ads }
  // The weapon in hand changed (or its attachments): rebuild its model.
  rebuildViewmodel() {
    const w = this.s.w
    const key = w ? w.def.id + JSON.stringify(w.rec.att) : 'none'
    if (key === this.weaponKey) return
    this.weaponKey = key
    if (this.vmMesh) { this.vm.remove(this.vmMesh); this.vmMesh.geometry.dispose() }
    if (!w) { this.model = null; this.vmMesh = null; return }
    this.model = buildWeapon(w.def, w.rec.att)
    this.vmMesh = new THREE.Mesh(this.model.geometry, this.vmMat)
    this.vm.add(this.vmMesh)
    const F = FACTIONS[this.s.faction]
    this.armMat.color.setRGB(lin(F.uniform[0] * 0.75), lin(F.uniform[1] * 0.75), lin(F.uniform[2] * 0.75))
    this.zoomIdx = 0
    this.zeroAng = null
  }
  get optic() { return this.model?.optic || ATTACHMENTS.iron }
  get zoom() {
    if (this.binoculars) return 7
    const o = this.optic
    return o.zooms ? o.zooms[this.zoomIdx % o.zooms.length] : o.zoom
  }
  // Is a magnified scope covering the screen right now?
  get scoped() { return !this.binoculars && this.s.ads && this.adsT > 0.85 && this.optic.scope && this.view === 'fp' }

  // ---------- per frame ----------
  update(dt, input, ui) {
    const s = this.s, g = this.game
    const look = input.takeLook(this.s.ads || this.binoculars ? 1 / Math.max(1, this.zoom * 0.7) : 1)
    const wheel = input.takeWheel()
    if (s.dead) { this.deathCam(dt); return }
    if (s.vehicle) return     // the vehicle drives the camera
    // look (free look turns the head only)
    if (input.down('freeLook') && this.view === 'fp') {
      this.freeLook.yaw = Math.max(-1.6, Math.min(1.6, this.freeLook.yaw + look.yaw))
      this.freeLook.pitch = Math.max(-1.2, Math.min(1.2, this.freeLook.pitch + look.pitch))
    } else {
      this.freeLook.yaw *= 0.8; this.freeLook.pitch *= 0.8
      s.yaw += look.yaw
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + look.pitch))
    }
    // touch aim assist: aiming or firing, the view drifts onto the nearest enemy you can see within ~5 degrees
    if (input.touch && g.settings.aimAssist !== false && (s.ads || this.touchFire) && s.w) this.assist(dt)
    // recoil: the view kicks up and recovers
    const rk = s.recoil
    this.pitch = Math.min(1.45, this.pitch + rk.pitch * 0.55 * dt * 14)
    s.yaw += rk.yaw * 0.5 * dt * 14
    // movement keys
    const inp = s.input
    inp.fwd = (input.down('forward') ? 1 : 0) - (input.down('back') ? 1 : 0)
    inp.side = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0)
    // the touch stick is analogue: walk slowly with a small push
    if (input.stick) { inp.fwd = Math.max(-1, Math.min(1, input.stick.y * 1.2)); inp.side = Math.max(-1, Math.min(1, input.stick.x * 1.2)) }
    // a setting lets the stick's left and right turn you instead of strafing (one-thumb play); aiming down
    // sights it always strafes, for fine aim
    if (input.touch && g.settings.stickTurns && !s.ads && !this.binoculars) {
      s.yaw -= inp.side * dt * (1.2 + Math.min(1, s.speed / 4) * 0.4)
      inp.side = 0
    }
    inp.sprint = input.down('sprint') && !s.ads
    inp.walk = input.down('walk')
    if (input.hit('jump')) inp.jump = true
    if (input.hit('crouch')) s.setStance(s.stance === CROUCH ? STAND : CROUCH)
    if (input.hit('prone')) s.setStance(s.stance === PRONE ? CROUCH : PRONE)
    if (inp.sprint && s.stance !== STAND && inp.fwd > 0) s.setStance(STAND)
    s.leanTarget = (input.down('leanR') ? 1 : 0) - (input.down('leanL') ? 1 : 0)
    if (input.hit('view')) this.view = this.view === 'fp' ? 'tp' : 'fp'
    if (input.hit('shoulder')) this.shoulder = -this.shoulder
    // weapons
    if (input.hit('slot1') && s.inv.weapons.primary) { s.selectWeapon('primary'); this.rebuildViewmodel() }
    if (input.hit('slot2') && s.inv.weapons.launcher) { s.selectWeapon('launcher'); this.rebuildViewmodel() }
    if (input.hit('slot3') && s.inv.weapons.sidearm) { s.selectWeapon('sidearm'); this.rebuildViewmodel() }
    if (!s.w && s.inv.weapons.primary) { s.selectWeapon('primary'); this.rebuildViewmodel() }
    if (s.droppedLauncher && s.w && !s.inv.weapons[s.slot]) { s.droppedLauncher = false; s.selectWeapon(s.inv.weapons.primary ? 'primary' : 'sidearm'); this.rebuildViewmodel() }
    if (input.hit('reload')) { if (s.reload()) g.sfx?.reload(s) }
    if (input.hit('fireMode')) { const m = s.cycleMode(); if (m) g.hud?.note(`Fire mode: ${m.toUpperCase()}`); g.sfx?.ui('click') }
    if (input.hit('zeroUp')) { this.zero = Math.min(1500, this.zero + 100); this.zeroAng = null; g.hud?.note(`Zeroing ${this.zero} m`) }
    if (input.hit('zeroDown')) { this.zero = Math.max(100, this.zero - 100); this.zeroAng = null; g.hud?.note(`Zeroing ${this.zero} m`) }
    if (input.hit('binoculars')) { this.binoculars = !this.binoculars && (s.inv.count('binoculars') + s.inv.count('rangefinder')) > 0 }
    if (input.hit('nvg')) { this.nvg = !this.nvg; g.hud?.note(this.nvg ? 'Night vision on' : 'Night vision off') }
    if (input.hit('light')) { this.light = !this.light }
    if (input.hit('bipod')) { s.bipod = !s.bipod && s.w?.s.bipod && (s.stance === PRONE || this.restingOnSomething()); g.hud?.note(s.bipod ? 'Bipod deployed' : 'Bipod folded') }
    if (s.bipod && (s.speed > 0.3 || (s.stance !== PRONE && !this.restingOnSomething()))) s.bipod = false
    // heal: stop the bleeding first, then a splint for a broken leg, then health, then a painkiller
    if (input.hit('heal')) {
      const has = id => s.inv.count(id) > 0, hurt = s.blood < 92
      const id = s.bleed > 0.05 && has('bandage') ? 'bandage' : s.legHurt && has('splint') ? 'splint' : hurt && has('firstaid') ? 'firstaid' : hurt && has('medkit') ? 'medkit' : (s.legHurt || s.armHurt) && has('morphine') ? 'morphine' : s.bleed > 0.05 && has('firstaid') ? 'firstaid' : null
      if (id && s.treat(id)) g.hud?.note('Used ' + ITEMS[id].name.toLowerCase()); else if (!id) g.hud?.note(hurt || s.bleed > 0.05 ? 'Nothing to treat that with' : 'Not hurt')
    }
    if (input.hit('gear')) { if (!g.gear.use(s) && !g.gear.selected(s)) g.hud?.note('No gear: mines, charges, sandbags, a radio or rations') }
    if (input.hit('gearNext')) g.gear.next(s)
    if (input.hit('grenade')) { const t = s.inv.count('frag') ? 'frag' : s.inv.count('smoke') ? 'smoke' : s.inv.count('flash') ? 'flash' : null; if (t) g.throwGrenade(s, t, this.aimDirection()) }
    // aiming down sights: hold the right button (or the touch button)
    const wantAds = (input.mouse.right || this.touchAds) && s.w && s.switchT <= 0 && !s.sprint && !s.ladder && !s.swimming
    s.ads = !!wantAds
    if (this.binoculars) s.ads = false
    const adsTime = s.w ? s.w.s.ads : 0.25
    this.adsT = Math.max(0, Math.min(1, this.adsT + (s.ads || this.binoculars ? dt / adsTime : -dt / (adsTime * 0.8))))
    if (wheel && (s.ads || this.binoculars) && this.optic.zooms) this.zoomIdx = Math.max(0, Math.min(this.optic.zooms.length - 1, this.zoomIdx - wheel))
    else if (wheel && !s.ads) { const order = ['primary', 'launcher', 'sidearm'].filter(k => s.inv.weapons[k]); if (order.length > 1) { const i = order.indexOf(s.slot); s.selectWeapon(order[(i + (wheel > 0 ? 1 : order.length - 1)) % order.length]); this.rebuildViewmodel() } }
    // hold breath while scoped steadies the sway, for a few seconds
    this.holding = s.ads && input.down('holdBreath') && this.breath > 0 && this.optic.scope
    this.breath = Math.max(0, Math.min(1, this.breath + (this.holding ? -dt / 5 : dt / 7)))
    // sway: a slow figure of eight, bigger when tired, hurt, standing, or moving; a bipod nearly stops it
    this.sway.t += dt
    let amp = (s.w ? s.w.s.sway : 1) * (s.stance === PRONE ? 0.35 : s.stance === CROUCH ? 0.6 : 1) * (1.4 - s.stamina * 0.6) * (s.armHurt ? 1.8 : 1) * (1 + s.suppression * 1.5)
    if (this.holding) amp *= 0.15
    if (s.bipod) amp *= 0.1
    amp *= s.ads ? 0.009 : 0.022
    amp *= 1 + Math.min(1, s.speed / 3) * (s.ads ? 2 : 1)
    this.sway.x = Math.sin(this.sway.t * 0.9) * amp + Math.sin(this.sway.t * 2.3) * amp * 0.2
    this.sway.y = Math.sin(this.sway.t * 1.8) * amp * 0.6
    // fire
    const left = input.mouse.left || this.touchFire
    const just = left && !this.fireHeld
    this.fireHeld = left
    if (s.w && s.w.def.tube && s.reloading && just) s.stopReload = true
    if (left && s.w && !this.binoculars && !g.ui.blocking) {
      const dir = this.aimDirection(true)
      const origin = this.view === 'fp' ? this.camPos.clone() : this.muzzleWorld()
      if (this.view === 'tp') {
        // where the crosshair points, from the camera; the bullet goes there from the muzzle
        const target = this.crosshairTarget()
        dir.subVectors(target, origin).normalize()
      }
      const hip = s.ads ? 0 : (s.w.s.hip || 1) * (s.w.def.cat === 'sniper' ? 0.05 : s.w.def.cat === 'pistol' ? 0.025 : 0.03) * (1 + Math.min(1, s.speed / 3))
      const shots = s.trigger(left, just, origin, dir, hip + s.suppression * 0.004)
      if (shots && shots.length) {
        for (const sh of shots) g.shoot(s, sh)
        this.kick = 1
        this.camShake = Math.max(this.camShake, AMMO[s.w.def.ammo].mass > 20 ? 0.6 : 0.15)
      } else if (just && s.w && s.ammoInWeapon === 0 && !s.reloading) { g.sfx?.dry(); if (s.reload()) g.sfx?.reload(s) }
    }
    // automatic reload when empty and the trigger is released
    if (s.w && !left && s.ammoInWeapon === 0 && !s.reloading && s.w.def.modes[0] !== 'single' && s.inv.countAmmo(s.w.def) > 0) { if (s.reload()) g.sfx?.reload(s) }
    if (s.w && s.w.def.modes[0] === 'single' && s.ammoInWeapon === 0 && !s.reloading && !left && s.inv.countAmmo(s.w.def) > 0) s.reload()
    // the camera
    this.kick = Math.max(0, this.kick - dt * 10)
    this.camShake = Math.max(0, this.camShake - dt * 2.5)
    this.bob += dt * s.speed * (s.sprint ? 1.6 : 1.2)
    this.updateCamera(dt)
    this.updateViewmodel(dt)
    this.updateLight()
  }
  assist(dt) {
    const s = this.s, g = this.game, e = s.eye(_v1)
    this.assistT = (this.assistT || 0) - dt
    if (this.assistT <= 0) {
      // choose a target a few times a second (the nearest to the aim line that can be seen)
      this.assistT = 0.25; this.assistTarget = null
      const fx = Math.sin(s.yaw) * Math.cos(this.pitch), fy = Math.sin(this.pitch), fz = Math.cos(s.yaw) * Math.cos(this.pitch)
      let best = 0.087, bestS = null
      for (const o of g.soldiersNear(e.x, e.z, 350)) {
        if (o.dead || o === s || !hostile(o.team, s.team)) continue
        const dx = o.pos.x - e.x, dy = o.pos.y + 1.2 - e.y, dz = o.pos.z - e.z, d = Math.hypot(dx, dy, dz)
        if (d > 350 || d < 1) continue
        const ang = Math.acos(Math.min(1, (dx * fx + dy * fy + dz * fz) / d))
        if (ang < best && g.ai.canSee(e.x, e.y, e.z, o.pos.x, o.pos.y + 1.2, o.pos.z, o.vehicle)) { best = ang; bestS = o }
      }
      this.assistTarget = bestS
    }
    const t = this.assistTarget
    if (!t || t.dead) return
    const dx = t.pos.x - e.x, dz = t.pos.z - e.z, dy = t.pos.y + (t.stanceT > 1.5 ? 0.3 : 1.2) - e.y
    let dyaw = Math.atan2(dx, dz) - s.yaw
    while (dyaw > Math.PI) dyaw -= Math.PI * 2
    while (dyaw < -Math.PI) dyaw += Math.PI * 2
    const dpitch = Math.atan2(dy, Math.hypot(dx, dz)) - this.pitch
    const k = Math.min(1, dt * 3.5)
    s.yaw += dyaw * k; this.pitch += dpitch * k
  }
  restingOnSomething() {
    // a wall or sandbags at chest height in front: a rest for the bipod
    const s = this.s, h = { t: 0 }
    const e = s.eye(_v1)
    return !!this.game.collision.raycast(e.x, e.y - 0.35, e.z, Math.sin(s.yaw), 0, Math.cos(s.yaw), 0.8, h)
  }
  // The direction the weapon points (with sway, recoil and zeroing when asked).
  aimDirection(withSway = false) {
    const s = this.s
    let pitch = this.pitch, yaw = s.yaw
    if (withSway) {
      pitch += this.sway.y; yaw += this.sway.x
      if (s.ads || this.view === 'tp') {
        if (this.zeroAng == null) this.zeroAng = s.w ? zeroAngle(s.w.def.ammo, this.zero, s.w.s.vmul) : 0
        pitch += this.zeroAng
      }
    }
    const cp = Math.cos(pitch)
    return this.aimDir.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).clone()
  }
  muzzleWorld() {
    const s = this.s, e = s.eye(_v1)
    const r = _v2.set(-Math.cos(s.yaw), 0, Math.sin(s.yaw))
    const f = this.aimDirection()
    return e.clone().addScaledVector(r, 0.18).addScaledVector(f, 0.6).add(_v3.set(0, -0.15, 0))
  }
  crosshairTarget() {
    const d = this.aimDirection(true)
    const o = this.camPos
    const h = { t: 0 }
    let t = 800
    const tt = raycastTerrain(o.x, o.y, o.z, d.x, d.y, d.z, t, 2)
    if (tt >= 0) t = tt
    if (this.game.collision.raycast(o.x, o.y, o.z, d.x, d.y, d.z, t, h)) t = h.t
    return o.clone().addScaledVector(d, t)
  }
  updateCamera(dt) {
    const s = this.s, e = s.eye(_v1)
    const fl = this.freeLook
    const yaw = s.yaw + fl.yaw, pitch = this.pitch + fl.pitch
    const shake = this.camShake * 0.01
    const roll = -s.lean * 0.18 * (s.stance === PRONE ? 0 : 1)
    const q = _q.setFromEuler(_e.set(pitch + (Math.random() - 0.5) * shake + this.kick * 0.004, yaw + Math.PI + (Math.random() - 0.5) * shake, roll, 'YXZ'))
    if (this.view === 'fp') {
      // a little head bob when walking
      const bob = s.ads ? 0 : Math.sin(this.bob * 2) * 0.025 * Math.min(1, s.speed / 3)
      this.camPos.set(e.x, e.y + bob, e.z)
    } else {
      // over the shoulder, pulled in when something is behind
      const back = _v2.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(-1)
      const right = _v3.set(-Math.cos(yaw), 0, Math.sin(yaw))
      const dist = s.ads ? 1.2 : this.tpDist
      const want = e.clone().addScaledVector(right, 0.55 * this.shoulder).add(_v4.set(0, 0.25, 0))
      const dir = back.clone()
      let d = dist
      const h = { t: 0 }
      if (this.game.collision.raycast(want.x, want.y, want.z, dir.x, dir.y, dir.z, dist + 0.3, h)) d = Math.max(0.3, h.t - 0.3)
      // vehicles are not in the collision grid: test the ones close by on their own
      for (const v of this.game.vehicles.list) {
        if (v.pos.distanceTo(want) > 14) continue
        const t = v.raycast(want.x, want.y, want.z, dir.x, dir.y, dir.z, d + 0.3, h)
        if (t >= 0) d = Math.max(0.3, Math.min(d, t - 0.3))
      }
      const tg = raycastTerrain(want.x, want.y, want.z, dir.x, dir.y, dir.z, d + 0.3, 0.3)
      if (tg >= 0) d = Math.max(0.3, tg - 0.3)
      this.camPos.copy(want).addScaledVector(dir, d)
      this.camPos.y = Math.max(this.camPos.y, heightAt(this.camPos.x, this.camPos.z) + 0.25)
    }
    this.camQuat.copy(q)
    // field of view: zoom by the optic when aiming
    const base = this.game.settings.fov
    const z = (this.s.ads || this.binoculars) ? 1 + (this.zoom - 1) * this.adsT : 1
    this.fov = base / z
  }
  updateViewmodel(dt) {
    const s = this.s, m = this.model
    const show = this.view === 'fp' && m && !this.scoped && !this.binoculars && !s.dead && !s.vehicle
    this.vm.visible = !!show
    for (const a of this.arms) a.visible = !!show
    if (!show) return
    const a = this.adsT, w = s.w
    // hip and sights positions in camera space (camera looks down -z)
    const relief = this.optic.scope ? 0.1 : this.optic.reticle === 'iron' ? 0.2 : 0.16
    const hip = _v1.set(0.16, -0.185, -0.45)
    const ads = _v2.set(-m.sight.x, -m.sight.y, -relief - m.sight.z)
    const pos = hip.lerp(ads, easeInOut(a))
    // sprint, reload, switch and bolt animations
    let rx = 0, ry = 0, rz = 0
    if (s.sprint) { rx -= 0.45; ry += 0.55; pos.x -= 0.05; pos.y -= 0.04 }
    if (w && w.reloadT > 0) {
      const t = 1 - w.reloadT / w.reloadDur
      const k = Math.sin(Math.min(1, t * 1.15) * Math.PI)
      rz += k * 0.6; rx -= k * 0.35; pos.y -= k * 0.06
    }
    if (s.switchT > 0) { pos.y -= Math.sin(Math.min(1, s.switchT / 0.6) * Math.PI) * 0.25 }
    if (w && w.boltT > 0) { const t = w.boltT / (w.def.modes[0] === 'bolt' ? 0.95 : 0.5); rz += Math.sin(t * Math.PI) * 0.25; pos.z += Math.sin(t * Math.PI) * 0.02 }
    if (s.ladder || s.swimming) { pos.y -= 0.3 }
    // sway and bob lag behind the view a little; recoil pushes it back and up
    const bob = Math.min(1, s.speed / 3) * (1 - a * 0.85)
    pos.x += Math.sin(this.bob) * 0.012 * bob + this.sway.x * (1 - a) * 0.3
    pos.y += Math.abs(Math.cos(this.bob)) * 0.01 * bob + this.sway.y * (1 - a) * 0.3
    pos.z += this.kick * 0.035
    rx += this.kick * 0.05
    this.vm.position.copy(pos)
    this.vm.rotation.set(rx + this.sway.y * 2, ry + this.sway.x * 2, rz)
    // arms from off-screen shoulders to the grip and the handguard
    this.vm.updateMatrixWorld(true)
    const grip = _v3.set(0, -0.05, 0.02).applyMatrix4(this.vm.matrixWorld)
    const sup = _v4.copy(m.support).setY(m.support.y - 0.03).applyMatrix4(this.vm.matrixWorld)
    // sleeves from off-screen shoulders to the wrists; gloved hands round the grip and the handguard
    limb(this.arms[0], _v5.set(0.24, -0.5, 0.06), _v7.copy(grip).add(_v6.set(0.01, -0.04, 0.07)), 0.085)
    limb(this.arms[2], _v5.set(-0.3, -0.52, 0.04), _v7.copy(sup).add(_v6.set(-0.01, -0.04, 0.06)), 0.08)
    for (const [mesh, at, sx] of [[this.arms[1], grip, 0.055], [this.arms[3], sup, 0.06]]) {
      mesh.position.copy(at).add(_v6.set(0, -0.025, 0))
      mesh.quaternion.copy(this.vm.quaternion)
      mesh.scale.set(sx, 0.07, 0.11)
    }
    const vc = this.game.engine.vmCamera, vf = this.game.engine.widen(55)
    if (Math.abs(vc.fov - vf) > 0.01) { vc.fov = vf; vc.updateProjectionMatrix() }
  }
  updateLight() {
    const L = this.flashlight
    const on = this.light && !this.s.dead
    L.intensity = on ? 60 : 0
    if (!on) return
    const e = this.game.engine
    e.toScene(this.camPos, L.position)
    const d = this.aimDirection()
    L.target.position.copy(L.position).addScaledVector(d, 10)
  }
  deathCam(dt) {
    // you go down with him: the view drops to the ground and rolls over (0.8 s), stays there a moment,
    // then rises behind and above to look down at the body
    const s = this.s, d = s.deadT
    if (d < 1.4) {
      const k = Math.min(1, d / 0.8), fall = k * k, back = (s.fallDir || 1) < 0
      const roll = (s.id % 2 ? 1 : -1) * 1.15 * fall
      const eye = 1.6 - 1.35 * fall
      this.camPos.set(s.pos.x - Math.sin(s.yaw) * (back ? 0.6 : -0.6) * fall, s.pos.y + Math.max(0.22, eye), s.pos.z - Math.cos(s.yaw) * (back ? 0.6 : -0.6) * fall)
      this.camQuat.setFromEuler(_e.set(this.pitch * (1 - fall) + (back ? 0.9 : -0.5) * fall, s.yaw + Math.PI, roll, 'YXZ'))
    } else {
      const t = Math.min(1, (d - 1.4) / 2.2), e = t * t * (3 - 2 * t)
      this.camPos.set(s.pos.x - Math.sin(s.yaw) * 3 * e, s.pos.y + 0.25 + 5.3 * e, s.pos.z - Math.cos(s.yaw) * 3 * e)
      const look = _v1.set(s.pos.x, s.pos.y + 0.3, s.pos.z).sub(this.camPos).normalize()
      const yaw = Math.atan2(look.x, look.z), pitch = Math.asin(Math.max(-1, Math.min(1, look.y)))
      this.camQuat.setFromEuler(_e.set(pitch, yaw + Math.PI, 0, 'YXZ'))
    }
    this.vm.visible = false
    for (const a of this.arms) a.visible = false
    this.fov = this.game.settings.fov
  }
}
function easeInOut(t) { return t * t * (3 - 2 * t) }
// A box stretched from a to b (an arm segment), `r` thick.
function limb(mesh, a, b, r) {
  const d = _v7.subVectors(b, a)
  const len = d.length()
  mesh.position.copy(a).addScaledVector(d, 0.5)
  mesh.scale.set(r, r, Math.max(0.01, len + r * 0.5))
  mesh.quaternion.setFromUnitVectors(_zz, d.normalize())
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3()
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _zz = new THREE.Vector3(0, 0, 1)
