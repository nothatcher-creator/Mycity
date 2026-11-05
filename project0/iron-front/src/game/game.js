// OPERATION: IRON FRONT - the game. Boots the island (land, places, map) while the loading screen runs,
// then runs the frame: input, the player, the AI, vehicles, bullets, effects, the mode's rules, the
// interface. Also the shared services every system calls: shooting, explosions, grenades, finding
// soldiers near a point, and the player's interactions with the world.
import * as THREE from 'three'
import { Engine, QUALITY } from '../core/engine.js'
import { Input } from '../core/input.js'
import { initHeightfieldAsync, heightAt, normalAt, waterLevel as waterLevelAt, forestAt } from '../world/heightfield.js'
import { Terrain } from '../world/terrain.js'
import { Sky, WEATHER } from '../world/sky.js'
import { Water } from '../world/water.js'
import { Rain } from '../world/rain.js'
import { Birds } from '../world/birds.js'
import { Fauna } from '../world/fauna.js'
import { Beacons } from '../world/beacons.js'
import { Chutes } from '../actors/chutes.js'
import { Collision, raycastTerrain, makeBox } from '../world/collision.js'
import { buildPlaces, POINTS, BUILDINGS, PROPS } from '../world/places.js'
import { Roads } from '../world/roads.js'
import { Vegetation } from '../world/vegetation.js'
import { Grass } from '../world/grass.js'
import { CityStream } from '../world/citystream.js'
import { UI, C, loadFonts } from '../ui/ui.js'
import { HUD } from '../ui/hud.js'
import { MapView } from '../ui/mapview.js'
import { buildMapImage } from '../ui/mapimage.js'
import { Menus } from '../ui/menus.js'
import { InventoryUI } from '../ui/invui.js'
import { Effects } from '../combat/effects.js'
import { Ballistics } from '../combat/ballistics.js'
import { AMMO, weapon } from '../combat/weapons-data.js'
import { Rig } from '../actors/rig.js'
import { Soldier, PRONE } from '../actors/soldier.js'
import { Player } from '../actors/player.js'
import { AI } from '../actors/ai.js'
import { FACTIONS, ROLES, hostile } from '../actors/factions.js'
import { kit, ITEMS } from './inventory.js'
import { buildInventory } from './loadout.js'
import { openArsenal } from '../ui/arsenal.js'
import { Vehicles } from '../vehicles/vehicles.js'
import { VehicleControl } from '../vehicles/vcontrol.js'
import { SFX } from './sfx.js'
import { Gear } from './gear.js'
import { Touch } from '../core/touch.js'
import { Save } from './save.js'
import { MODES } from './modes/index.js'

// debug logs and test keys (F5-F9) only when the game is served from this machine (the dev kit)
let DEBUG = false
const pause = () => new Promise(r => setTimeout(r, 0))
const _v = new THREE.Vector3()

export class Game {
  constructor(p0) {
    this.p0 = p0
    try { DEBUG = /\/\/(127\.0\.0\.1|localhost)[:/]/.test(p0.asset('main.js')) } catch {}
    this.debug = DEBUG
    this.time = 0
    this.state = 'boot'
    this.difficulty = 0.5
    this.grenades = []
    this.soldiers = []
    this.loot = []           // things to search: { x, y, z, items, weapons, name }
    this.waypoint = null
    this.flashT = 0
    this.rangeAt = 0
    this.grid = new Map(); this.gridCell = 50
    this.save = new Save(p0)
    this.settings = this.save.settings
    this.discoveredSet = new Set(this.save.data.found || [])
  }
  // ---------- boot ----------
  async boot() {
    const p0 = this.p0, t0 = performance.now()
    const L = (f, label) => p0.loading(Math.min(0.99, f), label)
    L(0.01, 'raising the island')
    await initHeightfieldAsync((f, label) => L(f * 0.45, label))
    L(0.47, 'building towns'); await pause()
    buildPlaces()
    L(0.55, 'drawing the map'); await pause()
    await buildMapImage(1024, pause)
    p0.log('world built in', Math.round(performance.now() - t0), 'ms; buildings', BUILDINGS.length)
    const q = this.settings.quality
    this.engine = new Engine(p0)
    this.engine.setQuality(q)
    this.collision = new Collision()
    this.sky = new Sky(this.engine.scene, this.engine.world, q)
    L(0.62, 'land'); await pause()
    this.terrain = new Terrain(this.engine.world, q)
    this.terrain.setQuality(q, QUALITY[q].view)
    this.water = new Water(this.engine.world, this.engine.scene)
    this.rain = new Rain(this.engine, q)
    this.birds = new Birds(this.engine, q)
    this.fauna = new Fauna(this.engine, q)
    this.beacons = new Beacons(this.engine)
    this.chutes = new Chutes(this.engine)
    this.roads = new Roads(this.engine.world, this.collision)
    this.veg = new Vegetation(this.engine.world, this.collision, q)
    this.grass = new Grass(this.engine.world, q)
    this.city = new CityStream(this.engine.world, this.collision, q)
    this.fx = new Effects(this.engine.world, q)
    this.ballistics = new Ballistics(this)
    this.rig = new Rig(this.engine.world)
    this.gear = new Gear(this)
    this.ai = new AI(this)
    this.vehicles = new Vehicles(this)
    this.vcontrol = new VehicleControl(this)
    this.input = new Input(p0)
    Object.assign(this.input.binds, this.settings.binds || {})
    this.input.sens = this.settings.sens; this.input.invertY = this.settings.invertY
    this.sfx = new SFX(this)
    this.ui = new UI(this.engine)
    // the display face: embedded, loaded in the background; everything redraws in it when ready
    loadFonts(() => { for (const p of this.ui.panels) p.dirty = true; if (this.debug) this.p0.log('fonts loaded') })
    this.W = { collision: this.collision, ladders: [] }
    L(0.7, 'warming up'); await pause()
    this.camPos = new THREE.Vector3(560, heightAt(560, 1100) + 60, 1100)
    this.camQuat = new THREE.Quaternion()
    this.fov = 60
    this.menuCam = { t: 0 }
    this.preload(this.camPos.x, this.camPos.z)
    this.hud = new HUD(this)
    this.touchCtl = new Touch(this)
    this.hud.show(false)
    this.map = new MapView(this)
    this.invui = new InventoryUI(this)
    this.menus = new Menus(this)
    this.engine.onResize = () => { this.hud.layout(); this.map.layout(); this.menus.layout(); this.invui.layout() }
    this.bindPointer()
    // compile every material once before the first frame
    this.menuFrame(0)
    this.engine.setView(this.camPos, this.camQuat, this.fov)
    this.sky.update(0, this.engine.camera.position)
    // The title screen is 2D only (the island map behind the menus): it draws at once on any machine. The 3D
    // world is compiled and warmed up on the first deploy, behind the deploying screen.
    this.engine.uiOnly = true
    p0.log('boot', Math.round(performance.now() - t0), 'ms')
    L(1, 'ready')
    this.state = 'menu'
    this.menus.open('main')
    // invited to a server: straight to the server browser with it selected
    try { const inv = p0.invitation; if (inv?.data?.srv) { this.menus.osel = String(inv.data.srv); this.menus.open('online', true) } } catch {}
    p0.hud('OPERATION: IRON FRONT. Click to start and for sound. WASD move, mouse aim/fire, Shift sprint, C crouch, Z prone, Q/E lean, R reload, F use/enter, V view, M map, Tab inventory, T squad, P pause. Enter is chat, Esc leaves.')
    p0.loop((dt) => this.frame(Math.min(dt, 0.1)))
    // the session: other players' messages and the shared state go to the mode that uses them (Online Battle)
    p0.on('message', (data, from) => this.mode?.onNet?.('message', data, from))
    p0.on('state', (key, value, from) => { this.mode?.onNet?.('state', key, value, from); if (this.menus?.page === 'online') this.menus.panel.dirty = true })
    p0.on('leave', p => this.mode?.onNet?.('leave', p))
    p0.on('join', () => { if (this.menus?.page === 'online') this.menus.panel.dirty = true })
    p0.on('update', () => this.hud?.note('A new version of the game is out: re-enter to play it.', C.gold2))
  }
  // A soldier drawn once so his materials compile before play.
  // Everything play draws for the first time (a soldier, the first-person weapon and arms, the flashlight,
  // a vehicle and its wreck) put up once while loading, so their shaders compile before the first frame of
  // play rather than freezing it; then taken away again.
  async warmup() {
    const e = this.engine
    const s = new Soldier({ x: this.camPos.x, z: this.camPos.z + 20, faction: 'vdf', inv: kit('rifleman', 'vdf', FACTIONS.vdf, ROLES) })
    this.rig.begin(); this.rig.draw(s, this.camPos); this.rig.end()
    const pl = new Player(this, s)
    pl.view = 'fp'; pl.updateViewmodel(0); pl.light = true; pl.updateLight()
    const v = this.vehicles.spawn('jeep', this.camPos.x, this.camPos.z + 30, 0)
    const wreck = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.vehicles.wreckMat)
    wreck.position.set(this.camPos.x, this.camPos.y, this.camPos.z + 25); e.world.add(wreck)
    this.player = pl
    this.hud.show(true)
    try { this.ui.update() } catch (err) { this.p0.log('warmup hud', err.message) }
    const W0 = performance.now()
    await this.compileInSteps(e.scene, e.camera)
    await this.compileInSteps(e.vmScene, e.vmCamera)
    const W1 = performance.now()
    // draw it and wait for the GPU to finish (reading a pixel back waits): the shaders link now, not in play
    const gl = e.renderer.getContext(), px = new Uint8Array(4)
    const sync = () => { try { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) } catch {} }
    // a second frame shows how fast this machine draws once the shaders are ready
    await this.drawInSteps(e.scene, e.camera, sync)
    const W2 = performance.now()
    const t = performance.now(); e.render(true); sync(); this.warmFrame = performance.now() - t
    if (this.debug) this.p0.log('dbg warmup compile', Math.round(W1 - W0), 'longest step', Math.round(this.longStep || 0), 'programs', this.engine.renderer.info.programs?.length, 'first draw', Math.round(W2 - W1), 'second', Math.round(this.warmFrame))
    // and away
    this.player = null
    this.hud.show(false)
    e.world.remove(wreck); wreck.geometry.dispose()
    this.vehicles.remove(v)
    e.vmScene.remove(pl.vm); for (const a of pl.arms) e.vmScene.remove(a)
    pl.light = false; pl.updateLight()
    this.rig.begin(); this.rig.end()
  }
  // Builds the land, roads, trees and buildings round (x, z) at once (before a spawn).
  preload(x, z) {
    this.terrain.update(x, heightAt(x, z) + 2, z, 600)
    this.city.update(x, z, 600)
    this.veg.update(x, z, 400, 0)
    this.roads.update(x, z, QUALITY[this.settings.quality].view)
    this.W.ladders = this.city.ladders
  }
  setQuality(q, chosen = false) {
    this.settings.quality = q
    if (chosen) { this.settings.qualityChosen = true; this.engine.relief = 0 }
    this.engine.setQuality(q)
    this.terrain.setQuality(q, QUALITY[q].view)
    this.veg.setQuality(q); this.grass.setQuality(q); this.city.setQuality(q); this.sky.setQuality(q)
    this.save.store()
  }
  touchPlay() { return this.state === 'play' && !!this.player && !this.menus.visible && !this.map.visible && !this.invui.visible && !this.mode?.uiOpen }
  bindPointer() {
    const p0 = this.p0
    p0.on('pointerdown', e => {
      this.sfx.unlock()
      if (e.touch && !this.touchSeen) { this.touchSeen = true; this.input.touch = true; this.hud.layout(); this.menus.layout(); this.invui.layout(); this.map.layout() }
      // in play on a touch screen every finger is tracked (stick, look, buttons at once)
      if (e.touch && this.touchPlay()) { this.touchCtl.down(e); return }
      if (this.map.visible) { this.ui.click(e.x, e.y); if (this.map.visible) this.map.pointerDown(e.x, e.y, e.button); return }
      if (this.invui.visible) this.invui.press = { x: e.x - this.invui.panel.x, y: e.y - this.invui.panel.y, button: e.button, touch: !!e.touch }
      if (this.ui.click(e.x, e.y)) { this.input.mouse.left = false; return }
      if (this.invui.visible) { this.invui.pointerDown(e.x, e.y, e.button); return }
      // a finger on the screen (not on a button, not on the city's stick at the bottom left) turns the view
      if (e.touch && this.state === 'play' && !this.ui.blocking && (e.x > this.engine.width * 0.35 || e.y < this.engine.height * 0.45)) { this.touchLook = { x: e.x, y: e.y }; return }
      if (this.state === 'play' && !e.touch && !this.ui.blocking) p0.input.lockPointer()
    })
    p0.on('keydown', () => this.sfx.unlock())
    if (DEBUG) p0.on('keydown', e => {
      if (e.code === 'F9' && this.state === 'menu') { this.start('freeroam', { ...this.menus.setup }); return }
      if (e.code === 'Home' && this.state === 'menu') { this.start('life', {}); return }
      if (e.code === 'PageUp' && this.state === 'menu') { this.start('survival', {}); return }
      if (e.code === 'Insert' && this.state !== 'play') { if (this.menus.page !== 'arsenal') openArsenal(this.menus); else { const T = ['primary', 'att', 'sidearm', 'launcher', 'clothing', 'items', 'slots']; this.menus.ars.tab = T[(T.indexOf(this.menus.ars.tab) + 1) % T.length]; this.menus.panel.dirty = true } return }
      if (e.code === 'F10' && this.state === 'menu') { const kinds = ['domination', 'tdm', 'conquest', 'koth', 'ctf', 'sector', 'survival']; this.dbgKind = (this.dbgKind ?? -1) + 1; const kind = kinds[this.dbgKind % kinds.length]; p0.log('dbg battle', kind); this.start('battle', { ...this.menus.bsetup, kind, limit: null, teamSize: 8 }); return }
      if (e.code === 'F11' && this.state === 'play') { this.quitToMenu(); return }
      if (e.code === 'F3' && this.state === 'menu') { const room = p0.room; try { if (room && !Object.keys(room.state).some(k => k.startsWith('srv:'))) { room.set('srv:dbg1', { id: 'dbg1', name: 'Kaldor nights', host: p0.me.id, hostName: p0.me.name, kind: 'domination', place: 'kaldor', minutes: 20, max: 12, hour: 23, weather: 'fog', seed: 7, start: Date.now(), round: 1, created: Date.now(), limit: 250 }); room.set('srv:dbg2', { id: 'dbg2', name: 'Casual', host: 'nobody', hostName: 'Someone', kind: 'tdm', place: 'tovar', minutes: 12, max: 8, hour: 13, weather: 'clear', seed: 9, start: Date.now() - 300000, round: 2, created: Date.now(), limit: 30 }); room.set('pl:' + p0.me.id, { match: 'dbg1.1', team: 'A', k: 3, d: 1, name: p0.me.name }) } } catch (err) { p0.log('dbg srv', err.message) } this.menus.open('online', true); return }
      if (e.code === 'NumpadSubtract' && this.state === 'menu') { this.start('online', { fresh: true }); return }
      if (e.code === 'NumpadDivide' && this.state === 'menu') { this.start('online', { fresh: true, kind: 'domination' }); return }
      if (e.code === 'NumpadMultiply' && this.modeId === 'online') { p0.log('dbg online', JSON.stringify({ flags: this.mode.flags?.map(f => (f.owner || '-') + f.progress.toFixed(1)), score: p0.room?.state?.score,  players: p0.room?.players, host: p0.room?.isHost, me: p0.me?.id, team: this.mode.team, remotes: [...this.mode.remotes.keys()], rows: this.mode.rows().map(r => r.id + ':' + r.team), stateKeys: Object.keys(p0.room?.state || {}) })) }
      if (e.code === 'F12' && this.state === 'menu') { this.dbgMission = ((this.dbgMission ?? -1) + 1) % 12; this.start('campaign', { mission: 'm' + (this.dbgMission + 1) }); p0.log('dbg mission', this.dbgMission + 1); return }
      if (e.code === 'Pause') { const m = this.playerSquad?.alive.find(q => q !== this.player.s); if (m) { const s = this.player.s; s.yaw = Math.atan2(m.pos.x - s.pos.x, m.pos.z - s.pos.z); this.player.pitch = -0.05 } }
      if (e.code === 'End' && this.mode?.markers) {
        // to 70 m short of the objective (the nearest living enemy of a 'clear' objective), with the squad
        const s = this.player.s, o = this.mode.obj
        const e1 = o?.squads?.flatMap(q => q.alive)[0]
        const m = e1 ? e1.pos : this.mode.markers()[0]; if (!m) return
        const dx = s.pos.x - m.x, dz = s.pos.z - m.z, d = Math.hypot(dx, dz) || 1
        const k = o ? 70 : 3, x = m.x + dx / d * k, z = m.z + dz / d * k
        s.pos.set(x, heightAt(x, z), z); s.yaw = Math.atan2(m.x - x, m.z - z); this.preload(x, z)
        for (const q of this.playerSquad?.alive || []) if (q !== s) q.pos.set(x + Math.random() * 6 - 3, heightAt(x, z), z - 4)
        p0.log('dbg moved near objective')
      }
      if (e.code === 'Home' && this.modeId === 'campaign') { this.mode.dbgSkip = true; p0.log('dbg skip objective', this.mode.idx) }
      if (this.state !== 'play' || !(this.mode?.admin || this.mode?.npcs || this.mode?.inf)) return
      const s = this.player.s
      if (e.code === 'F8') { const x = s.pos.x + Math.sin(s.yaw) * 90, z = s.pos.z + Math.cos(s.yaw) * 90; const q = this.mode.spawnSquad('nlf', x, z, 4, { type: 'attack', pos: s.pos.clone() }); this.mode.patrols.push(q); p0.log('dbg enemy squad at', x.toFixed(0), z.toFixed(0)) }
      if (e.code === 'F7' || e.code === 'F6' || e.code === 'F5' || e.code === 'F3') { const type = { F7: 'jeep', F6: 'scoutheli', F5: 'mbt', F3: 'fighter' }[e.code]; const v = this.mode.admin('vehicle', type); if (v && !s.vehicle && this.vehicles.enter(s, v)) { this.vcontrol.entered(v); p0.log('dbg entered', type) } }
      if (e.code === 'F1') { this.vcontrol.aim.yaw += 1.2; this.vcontrol.aim.pitch = 0.25; p0.log('dbg aim left+up') }
      if (e.code === 'Numpad1') { const x = s.pos.x + Math.sin(s.yaw) * 2500, z = s.pos.z + Math.cos(s.yaw) * 2500; const q = this.mode.crewed('groundattack', 'nlf', x, z, s.yaw + Math.PI, { type: 'attack', pos: s.pos.clone() }, { air: 300 }); this.dbgVeh = q?.vehicle; p0.log('dbg jet', !!q) }
      if (e.code === 'NumpadAdd') { const x = s.pos.x + Math.sin(s.yaw) * 600, z = s.pos.z + Math.cos(s.yaw) * 600; const q = this.mode.crewed('attackheli', 'nlf', x, z, s.yaw + Math.PI, { type: 'attack', pos: s.pos.clone() }, { air: 80 }); this.dbgVeh = q?.vehicle; p0.log('dbg heli', !!q, q?.members.map(m => m.seat?.role).join()) }
      if (e.code === 'Insert') { const x = s.pos.x + Math.sin(s.yaw) * 160, z = s.pos.z + Math.cos(s.yaw) * 160; const q = this.mode.crewed('technical', 'nlf', x, z, s.yaw + Math.PI, { type: 'attack', pos: s.pos.clone() }); p0.log('dbg crewed technical', !!q, q?.members.map(m => m.seat?.role).join()); this.dbgVeh = q?.vehicle }
      if (e.code === 'Delete') { const b = POINTS.filter(pt => pt.kind === 'boat').sort((a, c) => Math.hypot(a.x - s.pos.x, a.z - s.pos.z) - Math.hypot(c.x - s.pos.x, c.z - s.pos.z))[0]; this.mode.admin('teleport', { x: b.x, z: b.z + 15 }); const v = this.mode.park('rhib', b.x, b.z, b.yaw || 0, {}); s.pos.set(v.pos.x + 3, 0, v.pos.z); if (this.vehicles.enter(s, v)) this.vcontrol.entered(v); p0.log('dbg boat at', b.x.toFixed(0), b.z.toFixed(0)) }
      if (e.code === 'Numpad0') { const t = performance.now(); let hx = s.pos.x, hz = s.pos.z, hy = s.pos.y + 1.5; const h = { t: 0 }; const d = this.player.aimDirection(); if (this.collision.raycast(this.player.camPos.x, this.player.camPos.y, this.player.camPos.z, d.x, d.y, d.z, 200, h)) { hx = this.player.camPos.x + d.x * (h.t - 0.3); hy = this.player.camPos.y + d.y * (h.t - 0.3); hz = this.player.camPos.z + d.z * (h.t - 0.3) } this.explode(hx, hy, hz, { radius: 6, dmg: 200, heat: 1400 }, s); p0.log('dbg blast', Math.round(performance.now() - t), 'ms walls', this.city.destroyed.size, 'hit', h.t?.toFixed(1)) }
      if (e.code === 'Numpad5') { this.input.touch = true; this.player.touchAds = !this.player.touchAds; p0.log('dbg ads', this.player.touchAds, this.player.s.w?.rec.att?.optic) }
      if (e.code === 'Numpad8') { const x = s.pos.x + Math.sin(s.yaw) * 2.5, z = s.pos.z + Math.cos(s.yaw) * 2.5, y = heightAt(x, z); this.collision.add(makeBox(x, y + 0.5, z, 1.5, 0.5, 0.2, s.yaw, 'sandbag', 'wall')); const m = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.4), new THREE.MeshLambertMaterial({ color: 0xa68f5f })); m.position.set(x, y + 0.5, z); m.rotation.y = s.yaw; this.engine.world.add(m); p0.log('dbg wall placed') }
      // an enemy anti-tank team 160 m ahead (tests AI rockets), and a wound for yourself (tests medics)
      if (e.code === 'Numpad2') { const a0 = s.vehicle ? s.vehicle.yaw : s.yaw; let x = 0, z = 0; for (let k = 0; k < 24; k++) { const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.26, r = 150 - (k % 3) * 25; x = s.pos.x + Math.sin(a) * r; z = s.pos.z + Math.cos(a) * r; const hy = heightAt(x, z) + 1.6, dx = s.pos.x - x, dy = s.pos.y + 1.5 - hy, dz = s.pos.z - z, d = Math.hypot(dx, dy, dz); if (raycastTerrain(x, hy, z, dx / d, dy / d, dz / d, d - 2, 2) < 0) break } const q = this.mode?.spawnSquad?.('nlf', x, z, 3, { type: 'hold', pos: new THREE.Vector3(x, 0, z) }, { roles: ['at'] }); p0.log('dbg at team', !!q, Math.round(x), Math.round(z)) }
      if (e.code === 'Backslash') { const K = ['low', 'medium', 'high'], q = K[(K.indexOf(this.engine.qualityKey) + 1) % 3]; this.settings.qualityChosen = true; this.settings.quality = q; this.setQuality(q, true); p0.log('dbg quality', q) }
      if (e.code === 'BracketRight') { this.sky.hour = (this.sky.hour + 2) % 24; this.sky.cycle = false; p0.log('dbg hour', this.sky.hour.toFixed(1)) }
      if (e.code === 'BracketLeft') { const K = Object.keys(WEATHER), k = K[(K.indexOf(this.sky.weatherKey) + 1) % K.length]; this.sky.setWeather(k); this.sky.w = { ...WEATHER[k] }; p0.log('dbg weather', k) }
      if (e.code === 'Numpad6') { for (const id of ['radio', 'c4', 'mine', 'sandbags', 'ration']) s.inv.add({ kind: id === 'ration' ? 'food' : 'tool', id }); this.player.pitch = -0.012; p0.log('dbg gear', this.gear.owned(s).join(','), 'sel', this.gear.selected(s)) }
      if (e.code === 'Numpad4') { const L = ['firetruck', 'minivan', 'muscle', 'buggy', 'bus', 'sports', 'police', 'tractor', 'scooter', 'van', 'taxi', 'luvm', 'techgl', 'ambulance', 'spaa', 'armedheli']; this.dbgV = ((this.dbgV ?? -1) + 1) % L.length; const v = this.mode?.admin?.('vehicle', L[this.dbgV]); p0.log('dbg spawned', L[this.dbgV], !!v, v ? Math.round(v.pos.distanceTo(s.pos)) : -1); if (v && !s.vehicle && this.vehicles.enter(s, v)) this.vcontrol.entered(v) }
      if (e.code === 'Numpad3') { s.blood = 40; s.bleed = 0.2; s.stamina = 0.08; p0.log('dbg wounded', s.blood) }
      if (e.code === 'Numpad9') for (const [m, b] of this.ai.brains) if (!m.dead && m !== s) p0.log('dbg ai', m.team, m.name, m.role, Math.round(m.pos.x), Math.round(m.pos.z), Math.round(m.blood), b.state, 'target', b.target?.name || '-', 'spot', (b.spot.get(s) || 0).toFixed(2), 'slot', m.slot, 'd', Math.round(m.pos.distanceTo(s.pos)), 'yaw', m.yaw.toFixed(1), 'react', b.reactT.toFixed(1), 'cover', !!b.cover, 'peek', b.peeking, 'seen', (this.ai.time - b.lastSeen).toFixed(1), 'gtime', (this.time - b.lastSeen).toFixed(1), 'rk', b.dbgR || '-', 'spd', m.speed.toFixed(1), 'st', m.stance, 'mv', b.move ? Math.round(b.move.distanceTo(m.pos)) : -1, 'path', b.path ? b.path.length : -1, 'stuck', b.stuckT.toFixed(1), 'fwd', m.input.fwd.toFixed(2), 'spr', m.input.sprint, 'pause', (b.pause || 0).toFixed(1))
      if (e.code === 'ScrollLock' && this.mode?.dbgVisit) this.mode.dbgVisit()
      if (e.code === 'F2' && this.mode?.dbgVisit) this.mode.dbgVisit('dealer')
      if (e.code === 'Period') this.input.look.dx += 200
      if (e.code === 'F10') { const F = this.birds.flocks[0]; if (F) { F.cx = s.pos.x + Math.sin(s.yaw) * 45; F.cz = s.pos.z + Math.cos(s.yaw) * 45; F.alt = 18; F.r = 20; F.flee = 0 } this.input.look.dy -= 120; this.fauna.spawnHerd(s.pos.x + Math.sin(s.yaw) * 60, s.pos.z + Math.cos(s.yaw) * 60, true); p0.log('dbg deer', this.fauna.herds.length, this.fauna.list.length, this.fauna.list.filter(d => d.dead).length); p0.log('dbg birds', this.birds.shown, this.birds.flocks.map(f => f.flee > 0 ? 'flee' : Math.round(Math.hypot(f.cx - s.pos.x, f.cz - s.pos.z))).join(','), 'night', this.sky.night.toFixed(2)) }
      if (e.code === 'Home' && this.modeId !== 'campaign') {
        // to the foot of the nth nearest staircase (each press the next), facing up it
        const L = []; this.collision.query(s.pos.x - 150, s.pos.z - 150, s.pos.x + 150, s.pos.z + 150, c => { if (c.kind === 'stairs') L.push(c) })
        L.sort((a, b) => Math.hypot(a.x - s.pos.x, a.z - s.pos.z) - Math.hypot(b.x - s.pos.x, b.z - s.pos.z))
        this.dbgStair = ((this.dbgStair ?? -1) + 1) % Math.max(1, L.length); const c = L[this.dbgStair]
        if (c) { const sg = c.az[1] > 0 ? 1 : -1, hx = c.az[0] * sg, hz = c.az[2] * sg, n = Math.hypot(hx, hz), bx = c.x - c.az[0] * c.hz * sg, by = c.y - c.az[1] * c.hz * sg, bz = c.z - c.az[2] * c.hz * sg
          s.pos.set(bx - hx / n * 0.6, by + 0.05, bz - hz / n * 0.6); s.vel.set(0, 0, 0); s.yaw = Math.atan2(hx, hz); this.player.pitch = 0.2
          this.dbgTop = c.y + c.az[1] * c.hz * sg; this.dbgT0 = this.time; p0.log('dbg stair', L.length, 'at', bx.toFixed(1), by.toFixed(2), bz.toFixed(1), 'top', (c.y + c.az[1] * c.hz * sg).toFixed(2), 'slope', Math.round(Math.asin(Math.abs(c.az[1])) * 57)) }
      }
      if (e.code === 'End' && this.modeId !== 'campaign') p0.log('dbg y', s.pos.y.toFixed(2), 'top', (this.dbgTop || 0).toFixed(2), 't', (this.time - (this.dbgT0 || 0)).toFixed(1), 'spd', s.speed.toFixed(1), 'ground', s.onGround, 'xz', s.pos.x.toFixed(1), s.pos.z.toFixed(1))
      if (e.code === 'Slash') { const x = s.pos.x + Math.sin(s.yaw) * 180 + 40, z = s.pos.z + Math.cos(s.yaw) * 180; this.waypoint = { x, z, y: heightAt(x, z) }; p0.log('dbg waypoint') }
      if (e.code === 'Semicolon') { const x = s.pos.x + Math.sin(s.yaw) * 1.2, z = s.pos.z + Math.cos(s.yaw) * 1.2; const o = this.addSoldier({ faction: 'vdf', role: 'rifleman', x, z }); o.die(null, null); p0.log('dbg body', this.loot.length, s.inv.countAmmo(s.w.def)) }
      if (e.code === 'Quote') p0.log('dbg ammo', s.inv.countAmmo(s.w.def), this.loot.map(l => l.items.length).join())
      if (e.code === 'Equal' && this.mode?.dbgJob) { this.mode.money += 5000; p0.log('dbg money', this.mode.money) }
      if (e.code === 'Minus' && this.mode?.dbgJob) { const sp = s.inv.add({ kind: 'tool', id: 'fishingrod' }); this.mode.dbgShore(); p0.log('dbg rod', sp) }
      if (e.code === 'NumLock' && this.mode?.dbgJob) this.mode.dbgJob(this.dbgJobKind || 'bus')
      if (e.code === 'Insert' && this.state === 'play' && this.mode?.dbgJob) { this.dbgJobKind = 'fire'; this.mode.dbgJob('fire') }
      if (e.code === 'CapsLock' && this.mode?.dbgJob) { this.dbgJobKind = 'taxi'; this.mode.dbgJob('taxi') }
      if (e.code === 'Digit9' && this.mode?.inf) { const x = s.pos.x + Math.sin(s.yaw) * 2.2, z = s.pos.z + Math.cos(s.yaw) * 2.2; this.mode.spawnInfected(x, z); const n = this.mode.inf[this.mode.inf.length - 1]; n.chase = true; n.s.yaw = s.yaw + Math.PI; p0.log('dbg infected in front') }
      if (e.code === 'Comma') { this.noteDanger(s.pos.x + 5, s.pos.z); p0.log('dbg noise') }
      if (e.code === 'Numpad9' && this.mode?.inf) { const M = this.mode; p0.log('dbg surv inf', M.inf.length, 'chasing', M.inf.filter(n => n.chase).length, 'dead', M.inf.filter(n => n.s.dead).length, 'piles', M.piles.length, 'items', M.piles.reduce((n, q) => n + q.items.length, 0), 'guns', M.piles.filter(q => Object.values(q.body.inv.weapons).some(Boolean)).length, 'blood', Math.round(s.blood), 'food', M.hunger.toFixed(2), M.thirst.toFixed(2), 'near', Math.round(Math.min(...M.inf.filter(n => !n.s.dead).map(n => n.s.pos.distanceTo(s.pos)), 999))) }
      if (e.code === 'Numpad9' && this.mode?.civ) { const L = this.mode.civ.list; p0.log('dbg civ', L.length, 'scared', L.filter(n => n.scared).length, 'crouched', L.filter(n => n.s.stance === 1).length, 'dead', L.filter(n => n.s.dead).length, 'dangers', (this.dangers || []).length) }
      if (e.code === 'Numpad9' && this.mode?.npcs) { const M = this.mode, by = {}; for (const n of M.npcs) by[n.kind] = (by[n.kind] || 0) + 1; p0.log('dbg life', 'ui', M.uiOpen, this.touchCtl.panel.visible, this.ui.blocking, JSON.stringify(by), 'traffic', M.traffic.length, 'money', M.money, 'food', M.hunger.toFixed(2), M.thirst.toFixed(2), 'home', Math.round(M.home.x), Math.round(M.home.z), 'me', Math.round(s.pos.x), Math.round(s.pos.z), 'job', M.job?.kind || '-', M.job?.i, 'shops', [...new Set(M.npcs.filter(n => n.shop).map(n => n.shop))].join('|')) }
      if (e.code === 'Numpad9' && s.vehicle) { const v = s.vehicle; p0.log('dbg veh', v.def.name, 'pos', v.pos.x.toFixed(1), v.pos.y.toFixed(2), v.pos.z.toFixed(2), 'land', heightAt(v.pos.x, v.pos.z).toFixed(2), 'floor', this.collision.floorAt(v.pos.x, v.pos.y + 1.5, v.pos.z, 1.5, 6).toFixed(2), 'water', waterLevelAt(v.pos.x, v.pos.z).toFixed(2), 'spd', v.speed.toFixed(1), 'eng', v.engine, 'hp', Math.round(v.hp)) }
      if (e.code === 'Numpad9') p0.log('dbg look yaw', s.yaw.toFixed(2), 'free', this.player.freeLook.yaw.toFixed(2), this.player.freeLooking, 'walk', !!this.player.walking); p0.log('dbg state stam', s.stamina.toFixed(2), 'spr', s.sprint, s.winded, 'spd', s.speed.toFixed(1), 'blood', Math.round(s.blood), 'bleed', s.bleed.toFixed(2), 'y', s.pos.y.toFixed(2), 'ladder', !!s.ladder, 'ground', s.onGround, 'fwd', s.input.fwd, 'vy', s.vel.y.toFixed(2), 'xz', s.pos.x.toFixed(1), s.pos.z.toFixed(1), 'yaw', s.yaw.toFixed(2), 'ammo', s.w?.rec.mag, 'fingers', this.touchCtl.fingers.map(f => f.role + (f.hold ? ':' + f.hold : '')).join('|'), 'stick', this.input.stick ? this.input.stick.x.toFixed(2) + ',' + this.input.stick.y.toFixed(2) : '-')
      if (e.code === 'Numpad7') { const L = [...this.W.ladders].sort((a, b) => Math.hypot(a.x - s.pos.x, a.z - s.pos.z) - Math.hypot(b.x - s.pos.x, b.z - s.pos.z))[0]; if (L) { const bx = L.x - Math.sin(L.yaw) * 0.8, bz = L.z - Math.cos(L.yaw) * 0.8; s.pos.set(bx, L.y0, bz); s.yaw = L.yaw; p0.log('dbg ladder', this.W.ladders.length, JSON.stringify({ x: L.x.toFixed(1), z: L.z.toFixed(1), y0: L.y0.toFixed(1), y1: L.y1.toFixed(1), yaw: L.yaw.toFixed(2) })) } else p0.log('dbg no ladders', this.W.ladders.length) }
      if (e.code === 'NumpadDecimal') { this.sky.setWeather('storm'); p0.log('dbg storm') }
      if (e.code === 'NumpadSubtract' && this.state !== 'menu' && !s.w && this.modeId === 'survival') { s.inv.add({ kind: 'food', id: 'venison' }); s.inv.add({ kind: 'food', id: 'venison' }) }
      if (e.code === 'NumpadSubtract' && this.state !== 'menu') { const cd = this.fauna.list.find(d => d.dead && d.meat > 0); if (cd && !this.fauna.carcass(s.pos.x, s.pos.z)) { s.pos.x = cd.x + 1.2; s.pos.z = cd.z; s.pos.y = heightAt(s.pos.x, s.pos.z) + 0.05 } else this.fauna.spawnHerd(s.pos.x + Math.sin(s.yaw) * 12, s.pos.z + Math.cos(s.yaw) * 12, true, s.yaw + Math.PI); p0.log('dbg deer', this.fauna.herds.length, this.fauna.list.length, 'dead', this.fauna.list.filter(d => d.dead).length, 'venison', s.inv.count('venison'), 'cooked', s.inv.count('cookedvenison'), 'fires', (this.mode?.fires || []).length, 'fleeing', this.fauna.herds.filter(h => h.flee > 0).length) }
      if (e.code === 'NumpadDivide' && this.state !== 'menu') { const K = ['pole', 'busstop', 'bench', 'haybale', 'lighthouse'], i = this.dbgProp = ((this.dbgProp ?? -1) + 1) % K.length, L = PROPS.filter(p => p.kind === K[i] && (K[i] !== 'pole' || (p.to && forestAt(p.x, p.z) < 0.05))), p = L[Math.floor(L.length * 0.37)], back = K[i] === 'lighthouse' ? 45 : K[i] === 'pole' ? 22 : 9, a = p.yaw + (K[i] === 'pole' ? Math.PI / 2 + 0.5 : K[i] === 'busstop' ? 0.3 : Math.PI); s.pos.x = p.x + Math.sin(a) * back; s.pos.z = p.z + Math.cos(a) * back; s.pos.y = heightAt(s.pos.x, s.pos.z) + 0.1; s.yaw = Math.atan2(p.x - s.pos.x, p.z - s.pos.z); p0.log('dbg prop', K[i], L.length, Math.round(p.x), Math.round(p.z)) }
      if (e.code === 'NumpadMultiply' && this.modeId !== 'online' && this.state === 'play') { if (this.mode?.admin) this.mode.admin('teleport', { x: s.pos.x + 200, z: s.pos.z + 200, halo: true }); else { s.pos.y += 260; s.vel.set(0, 0, 0); s.onGround = false; s.parachute = true; s.chuteT = 0 } p0.log('dbg chute', Math.round(s.pos.y), 'squad chutes', this.soldiers.filter(o => o.parachute).length) }
      if (e.code === 'F4') { const T = [{ x: 60, z: 1650, yaw: 0 }, { x: -3000, z: -360, yaw: Math.PI / 2 }, { x: 1010, z: -196, yaw: 1.06 }]; this.dbgTp = ((this.dbgTp ?? -1) + 1) % T.length; const P = T[this.dbgTp]; this.mode.admin('teleport', P); s.yaw = P.yaw; this.player.pitch = 0.02; p0.log('dbg teleported', this.dbgTp) }
      if (e.code === 'F2') { const v = s.vehicle; p0.log('dbg veh', v ? JSON.stringify({ t: v.type, sp: v.speed.toFixed(2), thr: v.throttle, eng: v.engine, ground: v.onGround, y: v.pos.y.toFixed(2), alt: v.alt?.toFixed(1), rpm: v.rpm?.toFixed(2), hp: v.hp.toFixed(0), fuel: v.fuel.toFixed(0), pitch: v.pitch.toFixed(2), roll: v.roll.toFixed(2), aim: [this.vcontrol.aim.yaw.toFixed(2), this.vcontrol.aim.pitch.toFixed(2)], vyaw: v.yaw.toFixed(2), locked: p0.input.pointer.locked, ctl: v.ctl }) : 'none') }
    })
    if (DEBUG) for (const ev of ['pointerdown', 'pointermove', 'pointerup']) p0.on(ev, e => { if (e.touch && (this.dbgPtr = (this.dbgPtr || 0) + 1) < 60) p0.log('dbg ptr', ev, JSON.stringify(e)) })
    p0.on('pointermove', e => {
      if (e.touch && this.touchPlay()) { this.touchCtl.move(e); return }
      if (e.touch && this.touchLook) {
        const k = 2.4
        // a jump of more than 120 px is another finger (the platform reports one touch at a time): not a drag
        if (Math.abs(e.x - this.touchLook.x) > 120 || Math.abs(e.y - this.touchLook.y) > 120) { this.touchLook = null; return }
        this.input.look.dx += (e.x - this.touchLook.x) * k; this.input.look.dy += (e.y - this.touchLook.y) * k
        this.touchLook.x = e.x; this.touchLook.y = e.y
        return
      }
      this.ui.move(e.x, e.y)
      if (this.map.visible) this.map.pointerMove(e.x, e.y)
      if (this.invui.visible) this.invui.pointerMove(e.x, e.y)
    })
    p0.on('pointerup', e => { if (e.touch && this.touchPlay()) { this.touchCtl.up(e); return } if (e.touch) { this.touchLook = null; if (this.player) { const P = this.player; P.touchFire = P.touchAlt = P.touchUp = P.touchDown = false } } if (this.map.visible) this.map.pointerUp(e.x, e.y); if (this.invui.visible) this.invui.pointerUp(e.x, e.y) })
    p0.on('wheel', e => {
      const dy = e.dy ?? e.deltaY ?? 0
      if (this.map.visible) { this.input.mouse.wheel = 0; this.map.wheel(dy, this.ui.pointer.x, this.ui.pointer.y) }
      else if (this.menus.visible) { this.input.mouse.wheel = 0; this.menus.wheel(dy) }
    })
  }

  // ---------- starting a game ----------
  // Shows the deploying screen for a frame, then builds the game (the build takes a moment).
  start(modeId, opts = {}) {
    if (this.pendingStart) return
    this.pendingStart = { modeId, opts }
    this.menus.open('deploying')
  }
  // The first time: every shader of the 3D world compiled and timed (a slow machine drops to the light version).
  async prepareWorld() {
    if (this.worldReady) return
    const t0 = performance.now(), q = this.settings.quality
    this.engine.uiOnly = false
    const T = [performance.now()], mark = () => T.push(performance.now())
    this.preload(this.camPos.x, this.camPos.z); mark()
    this.engine.setView(this.camPos, this.camQuat, this.fov)
    this.sky.update(0, this.engine.camera.position)
    await this.warmup(); mark()
    await this.compileInSteps(this.engine.scene, this.engine.camera); mark()
    const tw = performance.now(); this.engine.render(false); const warm = performance.now() - tw; mark()
    if (this.debug) this.p0.log('dbg prepare preload/warmup/compile/render', T.slice(1).map((t, i) => Math.round(t - T[i])).join(' '))
    this.p0.log('world ready in', Math.round(performance.now() - t0), 'ms; warm frame', Math.round(this.warmFrame), 'ms')
    if ((warm > 250 || this.warmFrame > 120) && q !== 'low' && !this.settings.qualityChosen) {
      this.setQuality('low')
      // the light version's materials, compiled now (in steps) rather than all at once in the first frame of play
      this.preload(this.camPos.x, this.camPos.z)
      await this.compileInSteps(this.engine.scene, this.engine.camera)
      const gl = this.engine.renderer.getContext(), px = new Uint8Array(4)
      await this.drawInSteps(this.engine.scene, this.engine.camera, () => { try { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) } catch {} })
    }
    this.worldReady = true
  }
  // The first draw of everything, a growing handful of objects at a time (the rest hidden), waiting for the
  // GPU after each and pausing between: the driver's first-use work and the uploads are spread out too.
  async drawInSteps(scene, camera, sync, budget = 150) {
    const r = this.engine.renderer, groups = new Map(), all = []
    scene.traverse(o => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.visible || !o.material) return
      const key = (Array.isArray(o.material) ? o.material.map(m => m.uuid).join() : o.material.uuid) + (o.isInstancedMesh ? 'i' : '')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(o); all.push(o)
    })
    for (const o of all) o.visible = false
    const list = [...groups.values()]
    // into a 32-pixel corner: the driver's first-use work is the same at any size, the pixels are not
    const vp = r.getViewport(new THREE.Vector4()), shadows = r.shadowMap.autoUpdate
    const corner = () => { r.setViewport(0, 0, 32, 32); r.setScissor(0, 0, 32, 32); r.setScissorTest(true) }
    const whole = () => { r.setScissorTest(false); r.setViewport(vp) }
    corner()
    r.shadowMap.autoUpdate = false
    let i = 0, n = 1, t = performance.now(), worst = 0, steps = 0
    try {
      while (i < list.length) {
        const s0 = performance.now()
        for (const g of list.slice(i, i + n)) for (const o of g) o.visible = true
        i += n; steps++
        r.setRenderTarget(null); r.render(scene, camera); sync()
        const took = performance.now() - s0
        worst = Math.max(worst, took)
        n = took < budget / 2 ? n * 2 : Math.max(1, n >> 1)
        // the screen shows whatever was drawn last when we pause: put the deploying screen back first (each
        // render clears the whole canvas, not just the corner, and an empty canvas shows white)
        if (performance.now() - t > budget) { whole(); this.showUI(); await new Promise(res => setTimeout(res, 16)); corner(); t = performance.now() }
      }
    } finally { for (const o of all) o.visible = true; whole(); r.shadowMap.autoUpdate = shadows; r.shadowMap.needsUpdate = true; this.showUI() }
    if (this.debug) this.p0.log('dbg draw in steps', list.length, 'materials', all.length, 'objects,', steps, 'steps, worst', Math.round(worst), 'ms')
  }
  // the 2D screens only (the deploying screen while the world warms up behind it)
  showUI() { const e = this.engine, u = e.uiOnly; e.uiOnly = true; try { e.render(false) } finally { e.uiOnly = u } }
  // Every shader the scene needs, compiled and linked a few at a time with a pause between, so a slow
  // graphics driver never holds the game up for long in one go. (The city stops a game that has not
  // answered for 12 s: players on slower devices were stopped while everything compiled at once.)
  async compileInSteps(scene, camera, budget = 100) {
    const r = this.engine.renderer, gl = r.getContext(), done = this.linked || (this.linked = new WeakSet())
    const objs = [], seen = new Set()
    scene.traverseVisible(o => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material) return
      const key = (Array.isArray(o.material) ? o.material.map(m => m.uuid).join() : o.material.uuid) + (o.isInstancedMesh ? 'i' : '') + (o.isSkinnedMesh ? 's' : '') + (o.geometry?.attributes.color ? 'c' : '')
      if (!seen.has(key)) { seen.add(key); objs.push(o) }
    })
    let t = performance.now()
    for (const o of objs) {
      try { r.compile(o, camera, scene) } catch (e) { this.p0.log('compile', e.message) }
      // wait for the driver to finish linking what was just queued (this is where the time goes)
      for (const p of r.info.programs || []) if (!done.has(p)) { done.add(p); try { gl.getProgramParameter(p.program, gl.LINK_STATUS) } catch {} }
      const dt = performance.now() - t
      if (dt > budget) { this.longStep = Math.max(this.longStep || 0, dt); this.showUI(); await new Promise(res => setTimeout(res, 16)); t = performance.now() }
    }
  }
  async startNow(modeId, opts) {
    if (this.starting) return
    this.starting = true
    try { await this.prepareWorld() } catch (e) { this.p0.log('prepare failed', e.message) }
    this.starting = false
    this.pendingStart = null
    const t1 = performance.now()
    this.clearWorld()
    const M = MODES[modeId]
    this.modeId = modeId
    this.mode = new M(this, opts)
    this.mode.setup()
    if (this.debug) this.p0.log('dbg start clear+setup', Math.round(performance.now() - t1), 'ms')
    this.state = 'play'
    this.menus.close()
    this.hud.show(true)
    this.hud.layout()
    if (!this.input.touch) this.p0.input.lockPointer()
    this.p0.log('mode', modeId)
  }
  clearWorld() {
    for (const v of [...this.vehicles.list]) this.vehicles.remove(v)
    this.gear?.clear()
    this.soldiers = []; this.ai = new AI(this); this.grenades = []; this.loot = []
    if (this.player) {
      this.player.light = false; this.player.updateLight()
      this.engine.vmScene.remove(this.player.vm)
      for (const a of this.player.arms) this.engine.vmScene.remove(a)
    }
    this.player = null; this.playerSquad = null; this.waypoint = null
    this.fx.smokeClouds = []
    this.deadHandled = false
    this.mode?.dispose?.()
    this.mode = null
  }
  quitToMenu() {
    this.clearWorld()
    this.state = 'menu'
    this.hud.show(false); this.map.close(); this.invui.close()
    this.p0.input.unlockPointer()
    this.menus.open('main')
  }
  // Out of a wall or a hole: the nearest clear, level ground within 40 m (outside buildings)
  unstuck() {
    const s = this.player?.s; if (!s || s.dead || s.vehicle) return
    const p = (this.mode?.findGround || (() => null)).call(this.mode, s.pos.x, s.pos.z, 40, 40, Math.random, 1)
    if (!p) { this.hud.note('No clear ground near: try the map teleport or respawn'); return }
    s.pos.set(p[0], heightAt(p[0], p[1]) + 0.05, p[1]); s.vel.set(0, 0, 0); s.ladder = null; s.vault = null; s.vaultT = 0
    this.preload(p[0], p[1])
    this.hud.note('Moved to clear ground')
  }
  // Eat or drink something: stamina back (and in Life, hunger and thirst)
  consume(s, id) {
    const def = ITEMS[id]
    if (!def || !s.inv.count(id)) return false
    s.inv.use(id)
    s.stamina = Math.min(1, s.stamina + (def.stamina ? 0.6 : 0.25)); if (def.food) s.fedT = Math.max(s.fedT || 0, 60 + def.food * 2)
    this.mode?.onConsume?.(s, def)
    if (s.isPlayer) { this.hud.note(`${def.kind === 'food' ? 'You eat' : 'You drink'}: ${def.name}`); this.sfx.ui('pickup') }
    return true
  }
  // A new soldier on the island. o: { faction, role, x, z, yaw, name, team, inv }
  addSoldier(o) {
    const F = FACTIONS[o.faction]
    const inv = o.inv || kit(o.role || 'rifleman', o.faction, F, ROLES)
    const s = new Soldier({ ...o, inv })
    const land = heightAt(s.pos.x, s.pos.z)
    s.pos.y = Math.max(land, this.collision.floorAt(s.pos.x, (o.y ?? land) + 1, s.pos.z, 1.5, 3))
    s.onDeath = (sol, killer) => this.onDeath(sol, killer)
    this.soldiers.push(s)
    return s
  }
  spawnPlayer(o) {
    // a saved loadout marked for deploying (Free Roam, Battle)
    const d = this.save.data, LO = d.loadoutUse != null && d.loadouts?.[d.loadoutUse]
    if (!o.inv && LO && this.mode?.loadouts) o = { ...o, inv: buildInventory(LO).inv }
    const s = this.addSoldier({ ...o, name: o.name || 'You' })
    s.allowDown = !!o.allowDown
    this.player = new Player(this, s)
    this.player.view = this.settings.view || 'fp'
    this.preload(s.pos.x, s.pos.z)
    s.pos.y = Math.max(heightAt(s.pos.x, s.pos.z), this.collision.floorAt(s.pos.x, s.pos.y + 1, s.pos.z, 1.5, 3))
    this.deadHandled = false
    return s
  }
  // After death: a fresh soldier for the player (the body stays where it fell).
  replacePlayer(o) {
    const old = this.player
    if (old) {
      this.engine.vmScene.remove(old.vm)
      for (const a of old.arms) this.engine.vmScene.remove(a)
      old.s.isPlayer = false
      old.light = false; old.updateLight()
    }
    const view = old?.view
    const s = this.spawnPlayer(o)
    if (view) this.player.view = view
    this.menus.close()
    this.state = 'play'
    if (!this.input.touch) this.p0.input.lockPointer()
    return s
  }
  // ---------- services ----------
  normalAt(x, z) { return normalAt(x, z, [0, 1, 0], 0.8) }
  // Soldiers near a point (from a grid rebuilt every frame).
  soldiersNear(x, z, r) {
    const out = [], G = this.gridCell
    const x0 = Math.floor((x - r) / G), x1 = Math.floor((x + r) / G), z0 = Math.floor((z - r) / G), z1 = Math.floor((z + r) / G)
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 300) return this.soldiers.filter(s => Math.abs(s.pos.x - x) < r && Math.abs(s.pos.z - z) < r)
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const a = this.grid.get(i * 100000 + j); if (a) for (const s of a) out.push(s) }
    return out
  }
  rebuildGrid() {
    this.grid.clear()
    const G = this.gridCell
    for (const s of this.soldiers) { const k = Math.floor(s.pos.x / G) * 100000 + Math.floor(s.pos.z / G); let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(s) }
  }
  // A soldier fired (the shots from soldier.trigger): the bullet, the flash, the sound, the AI hearing it.
  shoot(s, sh) {
    // a guided missile from the shoulder locks on to the vehicle it was fired at (within a narrow cone)
    const guided = AMMO[sh.ammo]?.rocket?.guided
    const target = guided ? this.findLockTarget(sh.origin, sh.dir, guided, s.vehicle) : null
    if (target && s.isPlayer) this.hud.note('Missile locked')
    this.ballistics.fire({ origin: sh.origin, dir: sh.dir, v: sh.v, ammo: sh.ammo, owner: s, tracer: sh.tracer, suppressed: sh.suppressed, target })
    this.mode?.onShot?.(s, sh)
    this.noteDanger(sh.origin.x, sh.origin.z)
    const a = AMMO[sh.ammo]
    const fp = s.isPlayer && this.player.view === 'fp'
    const m = fp ? this.player.camPos.clone().addScaledVector(sh.dir, 0.9).add(_v.set(0, -0.08, 0)) : sh.origin.clone().addScaledVector(sh.dir, 0.7)
    if (s.fireCount % (a.pellets ? 1 : 1) === 0) this.fx.muzzle(m.x, m.y, m.z, sh.dir.x, sh.dir.y, sh.dir.z, a.mass > 20 ? 1.8 : a.pellets ? 1.4 : 1, sh.suppressed)
    this.sfx.shot(sh.weapon, sh.origin, sh.suppressed, s)
    this.ai.heard(sh.origin.x, sh.origin.y, sh.origin.z, sh.suppressed ? 60 : a.mass > 20 ? 900 : 450, s)
    if (a.rocket || a.explosive) this.fx.puff(sh.origin.x, sh.origin.y, sh.origin.z, { s0: 1, s1: 3, life: 2, r: 0.8, g: 0.8, b: 0.78, a: 0.6, drag: 1.5 })
  }
  // An explosion: blast for everyone in range (less behind cover), vehicles by armour, windows break,
  // fuel and ammunition nearby go up, the AI hears it, the camera shakes.
  // where shots and blasts were lately (townspeople run from them): one entry a second per spot
  noteDanger(x, z) {
    const D = this.dangers || (this.dangers = [])
    if (D.some(d => this.time - d.t < 1 && Math.abs(d.x - x) < 20 && Math.abs(d.z - z) < 20)) return
    D.push({ x, z, t: this.time }); if (D.length > 24) D.shift()
  }
  explode(x, y, z, ex, src, directVehicle = null, big = false) {
    this.noteDanger(x, z)
    if (DEBUG) this.p0.log('dbg explode', x.toFixed(1), y.toFixed(1), z.toFixed(1), ex.radius, ex.heat || 0)
    const r = ex.radius
    this.fx.explosion(x, y, z, r, { fire: big })
    this.sfx.explosion(x, y, z, r)
    this.ai.heard(x, y, z, 1200, src || { team: '__none' })
    for (const s of this.soldiersNear(x, z, r * 2)) {
      if (s.dead || s.vehicle) continue
      const dx = s.pos.x - x, dy = s.pos.y + 1 - y, dz = s.pos.z - z, d = Math.hypot(dx, dy, dz) || 0.01
      if (d > r * 2) continue
      s.suppression = Math.min(1, s.suppression + 0.8)
      if (d > r) continue
      const h = { t: 0 }
      const blocked = this.collision.raycast(x, y + 0.3, z, dx / d, dy / d, dz / d, Math.max(0, d - 0.5), h) || raycastTerrain(x, y + 0.3, z, dx / d, dy / d, dz / d, Math.max(0, d - 0.5), 1) >= 0
      const k = (1 - d / r) ** 1.4 * (blocked ? 0.25 : 1) * (s.stance === PRONE ? 0.6 : 1)
      if (k > 0.02) s.hurt(d < r * 0.3 ? 'torso' : ['legL', 'legR', 'torso', 'armL', 'armR'][Math.floor(Math.random() * 5)], ex.dmg * k, 0, src, new THREE.Vector3(dx, dy, dz).normalize(), 'blast')
      if (s.isPlayer || s.brain) this.onHit(src, s, 'torso', ex.dmg * k)
    }
    for (const v of this.vehicles.list) {
      if (!v.alive) continue
      const d = Math.hypot(v.pos.x - x, v.pos.y + 1 - y, v.pos.z - z) - Math.max(v.def.size[0], v.def.size[2]) / 2
      if (v === directVehicle) v.blast(ex.dmg, ex.heat || 0, src, true)
      else if (d < r) v.blast(ex.dmg * (1 - Math.max(0, d) / r), 0, src, false)
    }
    // heavy blasts (tank shells, rockets, missiles, bombs) knock holes in walls: rubble and dust where they stood
    if ((ex.heat || 0) >= 300 || r >= 12) {
      const reach = Math.min(8, 1.5 + r * 0.45)
      for (const p of this.city.blastWalls(x, y, z, reach, this.collision)) {
        this.fx.puff(p.x, p.y, p.z, { s0: 1.5, s1: 4 + p.size, life: 3.5, r: 0.62, g: 0.6, b: 0.55, a: 0.7, drag: 1.2, vy: 0.6 })
        for (let k = 0; k < 3; k++) this.fx.impact(p.x + (Math.random() - 0.5) * p.size, p.y, p.z + (Math.random() - 0.5) * p.size, 0, 1, 0, 'chips')
      }
    }
    this.collision.query(x - r, z - r, x + r, z + r, c => {
      if (!c.alive && c.alive !== undefined) return
      if (Math.hypot(c.x - x, c.y - y, c.z - z) > r) return
      if (c.kind === 'glass') this.city.breakGlass(c)
      else if (c.kind === 'explosive' && Math.hypot(c.x - x, c.z - z) < r * 0.6) { c.alive = false; setTimeout(() => this.explode(c.x, c.y, c.z, { radius: 8, dmg: 150, heat: 200 }, src, null, true), 300) }
    })
    if (this.player && !this.player.s.dead) { const pd = this.player.camPos.distanceTo(_v.set(x, y, z)); if (pd < r * 6) this.player.camShake = Math.max(this.player.camShake, 1.2 * (1 - pd / (r * 6))) }
  }
  // Grenades: thrown along `dir` at `speed` m/s, bounce off the land and walls, then frag, smoke or flash.
  throwGrenade(s, type, dir, speed = 16) {
    const t = s.throwGrenade(type)
    if (!t) return false
    const e = s.eye(new THREE.Vector3())
    const d = dir.clone().normalize()
    const n = { type, def: t.def, pos: e.addScaledVector(d, 0.5), vel: d.multiplyScalar(speed).add(s.vel), t: 0, owner: s, done: false }
    n.vel.y += 2.5
    this.grenades.push(n)
    this.mode?.onGrenade?.(s, n)
    this.sfx.ui('throw')
    if (s.isPlayer) this.hud.note(`${t.def.name} out!`)
    else this.radioNear(s, 'Grenade out!')
    return true
  }
  updateGrenades(dt) {
    const h = { t: 0, nx: 0, ny: 0, nz: 0 }
    for (const n of this.grenades) {
      if (n.done) continue
      n.t += dt
      n.vel.y -= 9.81 * dt
      const sx = n.vel.x * dt, sy = n.vel.y * dt, sz = n.vel.z * dt, len = Math.hypot(sx, sy, sz)
      let bounced = false, nx = 0, ny = 1, nz = 0
      if (len > 1e-5 && this.collision.raycast(n.pos.x, n.pos.y, n.pos.z, sx / len, sy / len, sz / len, len + 0.06, h)) { bounced = true; nx = h.nx; ny = h.ny; nz = h.nz }
      else {
        const g = heightAt(n.pos.x + sx, n.pos.z + sz)
        if (n.pos.y + sy < g + 0.06) { const nn = normalAt(n.pos.x, n.pos.z); bounced = true; nx = nn[0]; ny = nn[1]; nz = nn[2]; n.pos.y = g + 0.06 }
      }
      if (bounced) {
        const vn = n.vel.x * nx + n.vel.y * ny + n.vel.z * nz
        if (vn < 0) { n.vel.x -= 1.5 * vn * nx; n.vel.y -= 1.5 * vn * ny; n.vel.z -= 1.5 * vn * nz }
        n.vel.multiplyScalar(0.55)
        if (Math.abs(vn) > 2) this.sfx.impact('grenade', n.pos.x, n.pos.y, n.pos.z)
        if (n.vel.lengthSq() < 0.05) n.vel.set(0, 0, 0)
      } else n.pos.set(n.pos.x + sx, n.pos.y + sy, n.pos.z + sz)
      if (n.t > n.def.fuse) this.detonate(n)
      else this.fx.puff(n.pos.x, n.pos.y, n.pos.z, { s0: 0.12, s1: 0.12, life: 0.04, r: 0.12, g: 0.15, b: 0.1, a: 1 })
    }
    this.grenades = this.grenades.filter(n => !n.done)
  }
  detonate(n) {
    n.done = true
    const d = n.def
    if (d.explosive) this.explode(n.pos.x, n.pos.y + 0.2, n.pos.z, d.explosive, n.owner)
    else if (d.smoke) this.fx.smokeGrenade(n.pos.x, n.pos.y, n.pos.z, n.owner?.team === 'nlf' ? [0.9, 0.6, 0.5] : [0.88, 0.88, 0.86])
    else if (d.flashbang) {
      this.fx.flash(n.pos.x, n.pos.y + 0.5, n.pos.z, { s0: 6, s1: 12, life: 0.25, r: 1, g: 1, b: 1 })
      this.sfx.explosion(n.pos.x, n.pos.y, n.pos.z, 3)
      for (const s of this.soldiersNear(n.pos.x, n.pos.z, d.flashbang)) {
        if (s.dead) continue
        const e = s.eye(new THREE.Vector3())
        const dist = e.distanceTo(n.pos)
        if (dist > d.flashbang || !this.ai.canSee(e.x, e.y, e.z, n.pos.x, n.pos.y + 0.3, n.pos.z)) continue
        const k = 1 - dist / d.flashbang
        s.suppression = 1
        if (s.brain) { s.brain.reactT = 3 * k; s.brain.burst = 0 }
        if (s.isPlayer) this.flashT = Math.max(this.flashT, 3 * k)
      }
    }
  }
  // What a missile can lock on to: the vehicle nearest the aim within a narrow cone.
  findLockTarget(from, dir, kind, self) {
    let best = null, bestDot = 0.985
    for (const v of this.vehicles.list) {
      if (v === self || !v.alive) continue
      const air = v.kind === 'heli' || v.kind === 'plane'
      if ((kind === 'air') !== air || (air && v.alt < 5)) continue
      const d = _v.copy(v.pos).sub(from); d.y += 1
      const dist = d.length(); if (dist > (air ? 4000 : 2000) || dist < 30) continue
      const dot = d.divideScalar(dist).dot(dir)
      if (dot > bestDot) { bestDot = dot; best = v }
    }
    return best
  }
  onDeath(sol, killer) {
    this.mode?.onKill?.(sol, killer)
    if (killer?.isPlayer && sol !== killer) { this.hud.kill(`${hostile(killer.team, sol.team) ? 'You killed' : 'FRIENDLY FIRE: you killed'} ${sol.name}`); this.save.data.kills = (this.save.data.kills || 0) + 1 }
    else if (sol.isPlayer) this.hud.kill(`You were killed${killer && killer !== sol ? ' by ' + killer.name : ''}`)
    else if (this.player && sol.team === this.player.s.team && sol.pos.distanceTo(this.player.s.pos) < 200) this.hud.kill(`${sol.name} is down`)
    if (sol.vehicle) this.vehicles.exit(sol, true)
    if (!sol.isPlayer) {
      this.loot.push({ x: sol.pos.x, y: sol.pos.y, z: sol.pos.z, items: sol.inv.all().slice(), weapons: sol.inv, name: `${FACTIONS[sol.faction].short} ${sol.name}`, t: this.time, body: sol })
      if (this.loot.length > 60) this.loot.shift()
    }
  }
  onHit(shooter, victim, part, dmg) {
    if (shooter?.isPlayer && victim !== shooter) this.hud.hit(victim.dead)
    if (victim.isPlayer) { const d = shooter ? Math.atan2(shooter.pos.x - victim.pos.x, -(shooter.pos.z - victim.pos.z)) : 0; this.hud.damage(d); this.sfx.ui('hurt') }
    const b = victim.brain
    if (b && shooter && hostile(victim.team, shooter.team)) {
      if (b.state !== 'combat') b.state = 'combat'
      if (!b.target) { b.target = shooter; b.targetPos.copy(shooter.pos); b.lastSeen = this.time - 2 }
      b.squad.share(shooter, shooter.pos, this.time - 1)
    }
  }
  onNearMiss(p, d, x, y, z) { this.sfx.crack(x, y, z) }
  onVehicleDestroyed(v, src) { this.mode?.onVehicleDestroyed?.(v, src); if (src?.isPlayer) this.hud.kill(`You destroyed a ${v.def.name}`) }
  radioNear(s, text) { if (this.player && s.team === this.player.s.team && s.pos.distanceTo(this.player.s.pos) < 150) this.hud.radio(s.name, text) }
  orderSquad(type, o = {}) {
    const q = this.playerSquad; if (!q || !this.player) return
    const p = this.player.s
    if (type === 'follow' || type === 'regroup') q.order = { type: 'follow', target: p }
    else if (type === 'hold') q.order = { type: 'hold', pos: null }
    else if (type === 'move') q.order = { type: 'move', pos: new THREE.Vector3(o.x, heightAt(o.x, o.z), o.z) }
    else if (type === 'attack') q.order = { type: 'attack', pos: new THREE.Vector3(o.x, heightAt(o.x, o.z), o.z) }
    else if (type === 'defend') q.order = { type: 'defend', pos: p.pos.clone(), radius: 25 }
    else if (type === 'formation') q.formation = o.formation
    else if (type === 'posture') q.posture = o.posture
    for (const m of q.members) if (m.brain) { m.brain.cover = null; m.brain.move = null }
    this.sfx.ui('radio')
  }
  // Markers for the compass and the map.
  markers() {
    const out = []
    if (this.waypoint) out.push({ x: this.waypoint.x, z: this.waypoint.z, color: C.gold2 })
    if (this.mode?.markers) out.push(...this.mode.markers())
    return out
  }
  radar(all = false) {
    const out = [], me = this.player?.s
    if (!me) return out
    const known = new Set()
    for (const q of this.ai.squads) if (q.team === me.team) for (const [e, k] of q.knowledge) if (this.time - k.t < 15 && !e.dead) known.add(e)
    for (const s of this.soldiers) {
      if (s === me || s.dead) continue
      if (s.team === me.team) out.push({ x: s.pos.x, z: s.pos.z, color: this.playerSquad?.members.includes(s) ? '#5ab0ff' : '#6ab04c', kind: 'unit' })
      else if (known.has(s) || (all && this.settings.reveal)) out.push({ x: s.pos.x, z: s.pos.z, color: '#e0483a', kind: 'unit' })
    }
    for (const v of this.vehicles.list) {
      if (!v.alive || (!all && v.pos.distanceTo(me.pos) > 400)) continue
      // an enemy vehicle only once someone in it has been spotted (or with the reveal setting)
      const bad = v.faction && hostile(v.faction, me.team)
      if (bad && !(this.settings.reveal || v.seats.some(q => q.occupant && known.has(q.occupant)))) continue
      out.push({ x: v.pos.x, z: v.pos.z, color: bad ? '#e0483a' : '#c9c3a0', kind: 'vehicle' })
    }
    if (this.mode?.objectives) for (const o of this.mode.objectives()) out.push({ ...o, kind: 'objective' })
    return out
  }
  discovered() { return POINTS.filter(p => (p.kind === 'secret' || p.kind === 'stash') && this.discoveredSet.has(p.x + ',' + p.z)) }
  camHeading() { const f = _v.set(0, 0, -1).applyQuaternion(this.camQuat); return Math.atan2(f.x, -f.z) }
  openMap() { this.map.open(); this.p0.input.unlockPointer() }
  closeMap() { this.map.close(); if (this.state === 'play' && !this.input.touch) this.p0.input.lockPointer() }

  // ---------- the frame ----------
  frame(dt) {
    this.time += dt
    const t0 = performance.now()
    this.lastFrameGap = this.lastFrameT ? t0 - this.lastFrameT : 0
    if (this.debug && this.lastFrameT && t0 - this.lastFrameT > 1500) this.p0.log("dbg stall", Math.round(t0 - this.lastFrameT), "ms between frames, state", this.state)
    this.lastFrameT = t0
    if (this.debug && this.city?.slowTile?.ms > 40) { this.p0.log('dbg slow tile', Math.round(this.city.slowTile.ms), 'ms, items', this.city.slowTile.n); this.city.slowTile = null }
    // Hitches in play (a frame more than a second after the last): three within half a minute and the graphics
    // step down (a lower setting, then fewer pixels below Low), so a struggling phone or laptop keeps going
    // instead of freezing until the city gives up on it. Not during loading or with the game paused.
    if (this.state === 'play' && !this.starting && this.lastFrameGap > 1000) {
      const H = this.hitches = (this.hitches || []).filter(t => t0 - t < 30000); H.push(t0)
      if (H.length >= 3 && t0 - (this.reliefT || 0) > 20000) {
        this.hitches = []; this.reliefT = t0
        const q = this.settings.quality
        if (q !== 'low') { this.setQuality(q === 'high' ? 'medium' : 'low'); this.hud?.note(`The game was struggling: graphics lowered to ${QUALITY[this.settings.quality].name} (Settings to change)`, C.amber) }
        else if ((this.engine.relief || 0) < 1) { this.engine.relief = Math.min(1, (this.engine.relief || 0) + 0.5); this.engine.resize(); this.hud?.note('The game was struggling: fewer pixels drawn', C.amber) }
        if (this.debug) this.p0.log('dbg relief', this.settings.quality, this.engine.relief || 0)
      }
    }
    // (debug) a shader compiled during play is a hitch: say which
    if (this.debug && this.state === 'play') { const P = this.engine.renderer.info.programs || [], n = P.length; if (this.progN != null && n > this.progN) this.p0.log('dbg late programs', n - this.progN, P.slice(this.progN).map(q => q.name + ':' + (q.cacheKey || '').split(',').slice(0, 3).join('/')).join(' | ').slice(0, 900)); this.progN = n }
    this.rebuildGrid()
    if (this.pendingStart && !this.starting && this.menus.page === 'deploying' && !this.menus.panel.dirty) { const p = this.pendingStart; this.startNow(p.modeId, p.opts) }
    if (this.state === 'menu') this.menuFrame(dt)
    else if (this.state === 'play') this.playFrame(dt)
    else if (this.state === 'paused') { this.input.takeLook(); this.menus.update(dt); if (this.input.hit('pause')) this.resume() }
    this.input.endFrame()
    const T = [performance.now()]
    // the world round the camera (not while the title screen is up before the first deploy)
    const cp = this.camPos
    // (and while the world warms up behind the deploying screen: those frames draw the 2D screen only, so
    // the warm-up's small steps are not undone by a full frame doing all the first-time work at once)
    if (this.engine.uiOnly || this.starting) { const u = this.engine.uiOnly; this.engine.uiOnly = true; this.ui.update(); this.engine.render(false); this.engine.uiOnly = u; return }
    this.terrain.update(cp.x, cp.y, cp.z, this.settings.quality === 'low' ? 3 : 5); T.push(performance.now())
    this.city.update(cp.x, cp.z, 4); T.push(performance.now())
    this.veg.update(cp.x, cp.z, 3, dt); this.grass.update(cp.x, cp.y, cp.z, dt); T.push(performance.now())
    this.roads.update(cp.x, cp.z, QUALITY[this.settings.quality].view)
    this.W.ladders = this.city.ladders
    this.engine.setView(cp, this.camQuat, this.fov || 70)
    this.sky.update(this.state === 'paused' ? 0 : dt, this.engine.camera.position)
    this.city.night.value = Math.max(0, Math.min(1, (this.sky.night - 0.35) / 0.4))
    if (this.debug && this.sky.flashT > 0.3 && !this.dbgFlash) { this.dbgFlash = true; this.p0.log('dbg lightning, hemi', this.sky.hemi.intensity.toFixed(2), 'thunder in', this.sky.thunder.toFixed(1)) } else if (!(this.sky.flashT > 0.3)) this.dbgFlash = false
    this.water.update(dt, cp, this.sky)
    this.rain.update(this.state === 'paused' ? 0 : dt, cp, this.sky, this.sfx)
    this.birds.update(this.state === 'paused' ? 0 : dt, cp, this.sky, this.dangers, this.time)
    this.beacons.update(dt, cp, this.sky)
    this.chutes.update(this.state === 'paused' ? 0 : dt, this.state === 'play' ? this.soldiers : [])
    if (this.player && this.state !== 'menu') this.fauna.update(this.state === 'paused' ? 0 : dt, this)
    this.fx.update(this.state === 'paused' ? 0 : dt, cp); T.push(performance.now())
    // soldiers
    const fpPlayer = this.player && this.player.view === 'fp' && !this.player.s.dead
    this.rig.begin()
    for (const s of this.soldiers) {
      if (s.isPlayer && fpPlayer && !s.vehicle) continue
      if (s.vehicle && !s.seat?.exposed) continue
      if (s.isPlayer && s.vehicle && this.vcontrol.firstPerson) continue
      if (s.dead && s.deadT > 180) continue
      if ((s.pos.x - cp.x) ** 2 + (s.pos.z - cp.z) ** 2 > 1000 * 1000) continue
      this.rig.draw(s, cp)
    }
    this.rig.end()
    this.ui.update(); T.push(performance.now())
    // the weapon in your hands on foot; the dashboard when driving in first person
    const inVeh = this.player?.s.vehicle, dash = !!(inVeh && this.vcontrol.dash?.visible && this.vcontrol.firstPerson)
    if (this.vcontrol.dash && !inVeh) this.vcontrol.dash.visible = false
    if (inVeh && this.player) { this.player.vm.visible = false; for (const a of this.player.arms) a.visible = false }
    this.engine.render(this.state === 'play' && ((fpPlayer && !inVeh) || dash))
    this.flashT = Math.max(0, this.flashT - dt * 0.6)
    this.perf(dt)
    T.push(performance.now())
    if (DEBUG && this.traceN > 0 && this.player) { this.traceN--; const s = this.player.s; this.p0.log('trace dt', dt.toFixed(3), 'ms', Math.round(T[T.length - 1] - t0), 'fwd', s.input.fwd, 'vel', s.vel.x.toFixed(2), s.vel.z.toFixed(2), 'pos', s.pos.x.toFixed(2), s.pos.y.toFixed(2), s.pos.z.toFixed(2), 'blk', this.ui.blocking, 'keys', [...this.p0.input.keys].join('+')) }
    if (DEBUG && T[T.length - 1] - t0 > 300) this.p0.log('dbg slow frame', Math.round(T[T.length - 1] - t0), 'sim', Math.round(T[0] - t0), 'terrain/city/veg/sky-fx/rig-ui/render', T.slice(1).map((t, i) => Math.round(t - T[i])).join(' '))
    if (DEBUG) {
      this.dbgT = (this.dbgT || 0) + dt; this.dbgN = (this.dbgN || 0) + 1
      if (this.dbgT > 1.5) {
        const s = this.player?.s
        const veh = s?.vehicle, dv = this.dbgVeh, gun = dv?.seats.find(q => q.role === 'gunner')
        const where = s ? `pos ${s.pos.x.toFixed(1)} ${s.pos.y.toFixed(1)} ${s.pos.z.toFixed(1)} hp ${s.blood.toFixed(0)} ${s.dead ? 'DEAD' : ''} ${veh ? 'in ' + veh.type + ' v' + veh.speed.toFixed(1) + ' alt' + veh.alt.toFixed(0) : ''}` : ''
        const crews = this.vehicles.list.filter(v => v.driver && !v.driver.isPlayer).map(v => `${v.type}:${v.alive ? v.speed.toFixed(1) : 'X'}`).join(' ')
        const dvs = dv ? `${dv.alive ? 'alive' : 'WRECK'} d${dv.pos.distanceTo(this.player.s.pos).toFixed(0)} v${dv.speed.toFixed(1)} alt${dv.alt?.toFixed(0)} run:${dv.driver?.brain?.run} gun:${dv.seats.find(q => q.role === 'pilot')?.w?.mag} g:${gun?.occupant?.brain?.state} ammo${gun?.w?.mag}` : ''
        const P = this.player
        this.p0.log('dbg', this.state, 'fps', (this.dbgN / this.dbgT).toFixed(1), where, 'soldiers', this.soldiers.filter(o => !o.dead).length, 'dead', this.soldiers.filter(o => o.dead).length, 'veh', this.vehicles.list.length, 'q', this.settings.quality, 'crews', crews, 'dbgveh', dvs, 'walls', this.city.destroyed.size)
        if (this.modeId === 'campaign' && this.mode) { const o = this.mode.obj; this.p0.log('dbgc', 'obj', this.mode.idx, o?.type, 'enemies', o?.squads?.reduce((n, q) => n + q.alive.length, 0), 'squad', this.playerSquad?.alive.length, 'hp', this.player?.s.blood.toFixed(0), 'kills', this.mode.kills) }
        this.p0.log('dbg2', 'y', P?.s.pos.y.toFixed(1), 'swim', P?.s.swimming, 'ladder', !!P?.s.ladder, 'vault', (P?.s.vaultT || 0) > 0, 'ground', P?.s.onGround, 'score', this.mode?.scoreText?.(), 'assist', P?.assistTarget?.name, 'pitch', P?.pitch.toFixed(2), 'yaw', P?.s.yaw.toFixed(2), 'kills', this.mode?.kills, 'scope', P?.scoped, P?.binoculars, P?.s.ads, P?.adsT?.toFixed(2), this.input.mouse.right, P?.view, this.hud?.scope.visible, this.hud?.visible)
        if (s) { let e = null, ed = 1e9; for (const o of this.soldiers) if (!o.dead && o.brain && hostile(o.team, s.team)) { const d = o.pos.distanceTo(s.pos); if (d < ed) { ed = d; e = o } }
          if (e) this.p0.log('dbg enemy', ed.toFixed(0), 'm', e.brain.state, 'tgt', e.brain.target?.name, 'move', e.brain.move ? e.brain.move.distanceTo(e.pos).toFixed(0) : '-', 'spd', e.speed.toFixed(1), 'ammo', e.ammoInWeapon, 'keys', [...this.p0.input.keys].join('+'), 'fwd', s.input.fwd, 'spd', s.speed.toFixed(2), 'ground', s.onGround)
          if (e) { const ey = e.eye(new THREE.Vector3()); const dx = s.pos.x - e.pos.x, dz = s.pos.z - e.pos.z, d = Math.hypot(dx, dz); const ty = s.pos.y + 1.35; const u = new THREE.Vector3(s.pos.x - ey.x, ty - ey.y, s.pos.z - ey.z); const L = u.length(); u.divideScalar(L); const h = { t: 0 }
            this.p0.log('dbg see cos', ((dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / d).toFixed(2), 'terrain', raycastTerrain(ey.x, ey.y, ey.z, u.x, u.y, u.z, L, 3).toFixed(1), 'coll', !!this.collision.raycast(ey.x, ey.y, ey.z, u.x, u.y, u.z, L - 0.4, h), h.t?.toFixed(1), JSON.stringify(h.c ? { k: h.c.kind, m: h.c.mat, hx: h.c.hx, hy: h.c.hy, hz: h.c.hz, y: h.c.y } : {}), 'eyeY', ey.y.toFixed(1), 'landY', heightAt(e.pos.x, e.pos.z).toFixed(1), 'spot', (e.brain.spot.get(s) || 0).toFixed(2), 'vis', this.sky.visibility().toFixed(0), 'smoke', this.fx.smokeBlocks(ey.x, ey.y, ey.z, s.pos.x, ty, s.pos.z)) } }
        this.dbgT = 0; this.dbgN = 0
      }
    }
  }
  menuFrame(dt) {
    // a slow flight over Kaldor and the bay behind the menus
    const m = this.menuCam
    m.t += dt
    const a = m.t * 0.025 + 0.6, cx = 500, cz = 900
    this.camPos.set(cx + Math.cos(a) * 560, 0, cz + Math.sin(a) * 560)
    this.camPos.y = Math.max(heightAt(this.camPos.x, this.camPos.z), 0) + 90
    const look = _v.set(cx - this.camPos.x, heightAt(cx, cz) + 20 - this.camPos.y, cz - this.camPos.z).normalize()
    this.camQuat.setFromEuler(new THREE.Euler(Math.asin(look.y), Math.atan2(look.x, look.z) + Math.PI, 0, 'YXZ'))
    this.fov = 60
    this.menus.update(dt)
    // Space on the title screen: straight into Free Roam with the last setup
    if (this.menus.page === 'main' && this.input.hit('jump')) this.start('freeroam', { ...this.menus.setup })
  }
  resume() { this.menus.close(); this.state = 'play'; if (!this.input.touch) this.p0.input.lockPointer() }
  playFrame(dt) {
    this.touchCtl.update()
    const p = this.player, s = p.s, inp = this.input
    if (inp.hit('pause') && !this.map.visible && !this.invui.visible) { this.state = 'paused'; this.menus.open('pause'); this.p0.input.unlockPointer(); return }
    if (inp.hit('map')) { if (this.map.visible) this.closeMap(); else { this.invui.close(); this.openMap() } }
    // the inventory: with the storage of the vehicle you are in or standing at alongside
    if (inp.hit('inventory') && !s.dead && !this.mode?.uiOpen) { if (this.invui.visible) this.invui.close(); else { this.map.close(); const v = s.vehicle || this.vehicles.nearest(s.pos, 2.5); this.invui.open(v && v.alive && !v.occupants().some(o => o !== s && hostile(o.team, s.team)) ? this.vehicleStore(v) : null) } }
    if (inp.hit('squad') && this.playerSquad && !s.dead) this.menus.toggleSquad()
    this.ui.blocking = this.map.visible || this.invui.visible || this.menus.visible || !!this.mode?.uiOpen
    // a menu open at the wheel: let go of the throttle
    if (this.ui.blocking && s.vehicle && s.vehicle.driver === s) s.vehicle.throttle = 0
    if (!this.ui.blocking || s.dead) {
      if (s.vehicle && !s.dead) {
        this.hud.prompt = ''
        this.vcontrol.update(dt, s, inp)
        if (s.vehicle) { this.camPos.copy(this.vcontrol.camPos); this.camQuat.copy(this.vcontrol.camQuat); this.fov = this.vcontrol.fov }
      } else {
        // the wheel opens the action menu when there is something to do here (else it changes weapon)
        if (inp.mouse.wheel && !s.ads && !p.binoculars && this.acts?.length) this.actionWheel(inp.takeWheel())
        p.update(dt, inp, this.ui)
        this.camPos.copy(p.camPos); this.camQuat.copy(p.camQuat); this.fov = p.fov
        this.interactions()
      }
    } else { inp.takeLook(); inp.takeWheel(); s.input.fwd = s.input.side = 0; s.input.sprint = false }
    // the simulation
    s.step(dt, this.W)
    this.ai.update(dt, s.pos)
    this.vehicles.update(dt)
    this.ballistics.update(dt)
    this.updateGrenades(dt)
    this.gear.update(dt)
    this.mode?.update(dt)
    this.discover()
    // the scope and the rangefinder read the range to what is under the crosshair
    if (p.scoped || p.binoculars) {
      const d = p.aimDirection(), o = p.camPos, h = { t: 0 }
      let t = raycastTerrain(o.x, o.y, o.z, d.x, d.y, d.z, 3000, 3)
      if (this.collision.raycast(o.x, o.y, o.z, d.x, d.y, d.z, t > 0 ? t : 3000, h)) t = h.t
      this.rangeAt = t > 0 ? t : 0
    }
    if (this.map.visible) this.map.update()
    if (this.invui.visible) this.invui.update(dt)
    this.hud.update(dt)
    this.engine.renderer.toneMappingExposure = p.nvg && !s.dead ? 3.2 : 1
    this.sfx.update(dt)
    if (s.dead && !this.deadHandled) { this.deadHandled = true; this.deadAt = this.time; this.p0.input.unlockPointer() }
    if (s.dead && this.deadHandled && this.time - this.deadAt > 2.5 && !this.menus.visible && !this.mode?.spectate) this.menus.open('dead')
  }
  // What the player can do here (Arma's action menu): everything near, nearest first. The first is the
  // default ([F] or USE); the mouse wheel (or the ••• button on a touch screen) opens the whole list, the wheel
  // picks and F does it. An action may also have its own key (R repairs, takes ammo; H refuels).
  gatherActions(s) {
    const out = [...(this.mode?.actions?.(s) || [])]
    const SEAT = { driver: 'driver', pilot: 'pilot', copilot: 'co-pilot', gunner: 'gunner', commander: 'commander', passenger: 'passenger' }
    const down = this.soldiers.find(o => o.down && !o.dead && o !== s && o.team === s.team && o.pos.distanceTo(s.pos) < 2)
    if (down) out.push({ label: `Revive ${down.name}`, fn: () => { if (s.treat('medkit', down) || s.treat('firstaid', down)) { down.down = false; down.blood = Math.max(down.blood, 40); this.hud.note(`${down.name} revived`) } else this.hud.note('You need a medkit or a first aid kit') } })
    // a body at your feet comes before a vehicle further off (both close: the nearer one)
    const body = this.loot.find(l => Math.hypot(l.x - s.pos.x, l.z - s.pos.z) < 2 && Math.abs(l.y - s.pos.y) < 2.5)
    const v = this.vehicles.nearest(s.pos, 3)
    const bodyActs = [], vActs = []
    if (body) {
      bodyActs.push({ label: `Search ${body.name}`, fn: () => this.invui.open(body) })
      // the magazines and rounds there that fit your weapons, in one go
      const want = new Set(['primary', 'sidearm', 'launcher'].map(k => s.inv.weapons[k] && weapon(s.inv.weapons[k].id).ammo).filter(Boolean))
      const fits = body.items.filter(it => (it.kind === 'mag' || it.kind === 'ammo') && want.has(it.ammo) && (it.rounds ?? it.count ?? 1) > 0)
      if (fits.length) bodyActs.push({ label: `Take ammo (${fits.length})`, key: 'reload', fn: () => {
        let n = 0
        for (const it of fits) { if (!s.inv.add(it)) break; body.items.splice(body.items.indexOf(it), 1); n++ }
        this.hud.note(n ? `Took ${n} magazine${n === 1 ? '' : 's'} of ammo${n < fits.length ? ' (no room for the rest)' : ''}` : 'No room for more ammo'); if (n) this.sfx.ui('pickup')
      } })
    }
    if (v) {
      const name = v.def.name, roles = [...new Set(v.seats.filter(q => !q.occupant).map(q => q.role))]
      const enter = role => () => { if (this.vehicles.enter(s, v, role)) { this.player.lastView = this.player.view; this.vcontrol.entered(v); this.hud.note(`${name}: ${s.seat.role}`); this.mode?.onEnterVehicle?.(v) } }
      if (!roles.length) vActs.push({ label: `${name}: full`, fn: null })
      else { vActs.push({ label: `Get in ${name}`, fn: enter(null) }); if (roles.length > 1) for (const r of roles) vActs.push({ label: `Get in ${name} as ${SEAT[r] || r}`, fn: enter(r) }) }
      if (v.hp < v.maxHp && s.inv.count('repairkit')) vActs.push({ label: `Repair the ${name}`, key: 'reload', fn: () => { s.inv.use('repairkit'); v.hp = Math.min(v.maxHp, v.hp + v.maxHp * 0.45); v.burning = 0; v.mobility = 1; this.hud.note('Vehicle repaired') } })
      if (s.inv.count('jerrycan') && v.fuel < v.maxFuel) vActs.push({ label: 'Refuel from the jerrycan', key: 'heal', fn: () => { s.inv.use('jerrycan'); v.fuel = Math.min(v.maxFuel, v.fuel + v.maxFuel * 0.4); this.hud.note('Refuelled') } })
      if (!v.seats.some(q => q.occupant && hostile(q.occupant.team, s.team))) vActs.push({ label: `Open the ${name}'s storage`, fn: () => { this.map.close(); this.invui.open(this.vehicleStore(v)) } })
    }
    const bodyFirst = body && (!v || Math.hypot(body.x - s.pos.x, body.z - s.pos.z) < Math.hypot(v.pos.x - s.pos.x, v.pos.z - s.pos.z) - Math.max(v.def.size[0], v.def.size[2]) / 2 + 0.5)
    out.push(...(bodyFirst ? [...bodyActs, ...vActs] : [...vActs, ...bodyActs]))
    for (const tv of this.vehicles.list) if (tv.supply && tv.alive && tv.pos.distanceTo(s.pos) < 9) { out.push({ label: `${tv.supply === 'ammo' ? 'Rearm' : tv.supply === 'medical' ? 'Heal' : 'Resupply'} at the ${tv.def.name}`, fn: () => this.resupply(s, tv.supply) }); break }
    const deer = this.fauna?.carcass(s.pos.x, s.pos.z)
    if (deer && !s.vehicle) out.push({ label: `Take venison (${deer.meat} left)`, fn: () => { if (s.inv.add({ kind: 'food', id: 'venison' })) { deer.meat--; this.hud.note('Venison taken'); this.sfx.ui('pickup') } else this.hud.note('No room for the venison') } })
    const ladder = this.W.ladders.find(L => Math.hypot(L.x - s.pos.x, L.z - s.pos.z) < 1.5 && s.pos.y < L.y1 - 0.5 && s.pos.y > L.y0 - 1)
    if (ladder && !s.ladder) out.push({ label: 'Climb the ladder: walk into it (W)', fn: null })
    return out
  }
  interactions() {
    const s = this.player.s, hud = this.hud, inp = this.input, A = this.actMenu || (this.actMenu = { open: false, sel: 0, t: 0 })
    hud.prompt = ''; hud.actions = null
    if (s.dead) { this.acts = []; A.open = false; return }
    if (s.parachute) { const alt = Math.max(0, Math.round(s.pos.y - Math.max(heightAt(s.pos.x, s.pos.z), waterLevelAt(s.pos.x, s.pos.z)))); hud.prompt = `Parachute · ${alt} m · ${inp.touch ? 'stick' : 'W faster, S flare, A D drift'}, look to steer`; this.acts = []; A.open = false; return }
    const acts = this.gatherActions(s), live = acts.filter(a => a.fn)
    this.acts = live
    // an action's own key
    for (const a of live) if (a.key && inp.hit(a.key)) { a.fn(); inp.pressed.delete(a.key); A.open = false; return }
    if (A.open) { A.t -= 1 / 60; if (A.t <= 0 || !live.length) A.open = false; A.sel = Math.min(A.sel, live.length - 1) }
    if (A.open) hud.actions = { list: live.map(a => a.label), sel: A.sel }
    const def = A.open ? live[A.sel] : live[0] || acts[0]
    if (def) hud.prompt = def.fn ? `[F] ${def.label}${!A.open && live.length > 1 ? (this.input.touch ? `   (••• ${live.length - 1} more)` : `   (scroll: ${live.length - 1} more)`) : ''}` : def.label
    if (inp.hit('interact') && def?.fn) { A.open = false; def.fn() }
  }
  // the wheel (or the ••• button) with actions near: open the list, or move along it
  actionWheel(w) {
    const A = this.actMenu || (this.actMenu = { open: false, sel: 0, t: 0 })
    if (!this.acts?.length) return false
    if (!A.open) { A.open = true; A.sel = 0 } else A.sel = (A.sel + (w > 0 ? 1 : -1) + this.acts.length) % this.acts.length
    A.t = this.input.touch ? 10 : 4
    return true
  }
  doAction(i) { const a = this.acts?.[i]; if (this.actMenu) this.actMenu.open = false; a?.fn?.() }
  // A vehicle's storage: a pile of items that rides with it, up to the space it has. Military vehicles start
  // with a few supplies, civilian ones with odds and ends.
  vehicleStore(v) {
    if (!v.store) {
      const d = v.def, cap = d.cargo || { bike: 4, car: 24, tracked: 40, heli: 50, plane: 40, boat: 20 }[v.kind] || 24
      const big = !d.cargo && /truck|ambulance/.test(v.type) ? 3 : 1
      const items = []
      if (v.faction) items.push({ kind: 'med', id: 'firstaid', count: 2 }, { kind: 'grenade', id: 'frag' }, { kind: 'tool', id: 'repairkit' })
      else items.push({ kind: 'food', id: 'ration' }, { kind: 'water', id: 'canteen' })
      if (v.kind === 'car' || v.kind === 'tracked') items.push({ kind: 'tool', id: 'jerrycan' })
      v.store = { items, name: `${d.name}: storage`, cap: cap * big, vehicle: v, x: v.pos.x, y: v.pos.y, z: v.pos.z }
    }
    v.store.x = v.pos.x; v.store.y = v.pos.y; v.store.z = v.pos.z
    return v.store
  }
  // Ammunition and medical supplies from a truck or a crate.
  resupply(s, kind) {
    if (kind === 'medical' || kind === 'all') { s.blood = 100; s.bleed = 0; for (const k in s.parts) s.parts[k] = 0 }
    if (kind === 'fuel') {
      const near = this.vehicles.list.filter(v => v.alive && !v.def.supply && v.pos.distanceTo(s.pos) < 15)
      for (const v of near) v.fuel = v.maxFuel
      this.hud.note(near.length ? `Refuelled ${near.map(v => v.def.name).join(', ')}` : 'Bring a vehicle within 15 m to refuel it'); this.sfx.ui('pickup'); return
    }
    if (kind === 'ammo' || kind === 'all') {
      const r = this.mode?.refill?.(s) ?? defaultRefill(s)
      this.hud.note(r ? 'Rearmed' : 'Nothing to rearm')
    } else this.hud.note('Treated')
    this.sfx.ui('pickup')
  }
  // Finding secret places: walking near one marks it on the map, for good.
  discover() {
    this.discT = (this.discT || 0) - 1
    if (this.discT > 0 || !this.player) return
    this.discT = 30
    const s = this.player.s
    for (const p of POINTS) {
      if ((p.kind !== 'secret' && p.kind !== 'stash') || Math.hypot(p.x - s.pos.x, p.z - s.pos.z) > 35) continue
      const k = p.x + ',' + p.z
      if (this.discoveredSet.has(k)) continue
      this.discoveredSet.add(k)
      this.hud.note(`Discovered: ${p.name || 'a hidden place'}`, C.gold2)
      this.save.data.found = [...this.discoveredSet]
      this.save.store()
      if (p.kind === 'stash' && this.mode?.stashLoot) this.loot.push({ x: p.x, y: p.y ?? heightAt(p.x, p.z), z: p.z, items: this.mode.stashLoot(p), weapons: null, name: 'a supply stash', t: this.time })
    }
  }
  // Slow frames add up: drop to a lighter version (unless the player chose the quality).
  perf(dt) {
    if (this.state === 'boot') return
    this.slowT = Math.max(0, (this.slowT || 0) + (dt > 0.07 ? dt : -dt * 0.5))
    if (this.slowT > 4 && this.settings.quality !== 'low' && !this.settings.qualityChosen) {
      this.setQuality(this.settings.quality === 'high' ? 'medium' : 'low'); this.slowT = 0
      this.hud?.note('Graphics lowered to keep the game smooth (change it in Settings)')
    }
  }
}

// Fills the soldier's magazines and grenades back to his role's kit.
function defaultRefill(s) {
  const fresh = kit(s.role, s.faction, FACTIONS[s.faction], ROLES)
  let n = 0
  for (const it of fresh.all()) if (it.kind === 'mag' || it.kind === 'ammo' || it.id === 'frag' || it.id === 'smoke' || it.id === 'bandage') {
    const have = s.inv.all().filter(x => x.kind === it.kind && x.id === it.id && x.ammo === it.ammo).length
    const want = fresh.all().filter(x => x.kind === it.kind && x.id === it.id && x.ammo === it.ammo).length
    if (have < want && s.inv.add(JSON.parse(JSON.stringify(it)))) n++
  }
  for (const k of ['primary', 'sidearm', 'launcher']) { const w = fresh.weapons[k]; if (w && !s.inv.weapons[k]) { s.inv.weapons[k] = w; n++ } }
  return n > 0
}
