// Free Roam: the whole island at war. Each place is held by a side; garrisons appear as you come near and
// stand down when you leave. Enemy patrols roam between them. Clear every enemy from a place and it is
// liberated (kept in your save). Vehicles wait at bases, airfields, harbours and in towns. With the
// sandbox tools (pause menu) you can spawn vehicles and squads, change the time and weather, teleport.
import * as THREE from 'three'
const DEBUG_AIR = false
import { Mode, nearestPlace, onRoad } from './base.js'
import { PLACES } from '../../world/blueprint.js'
import { POINTS } from '../../world/places.js'
import { heightAt } from '../../world/heightfield.js'
import { FACTIONS, hostile } from '../../actors/factions.js'
import { WEATHER } from '../../world/sky.js'
import { QUALITY } from '../../core/engine.js'
import { VEHICLES } from '../../vehicles/vehicle-data.js'
import { Inventory, ITEMS } from '../inventory.js'
import { C, text } from '../../ui/ui.js'
import { Civilians } from '../civilians.js'

export const CONTROL = { kaldor: 'vdf', tovar: 'vdf', kessel: 'vdf', sorn: 'vdf', anselm: 'cef', power: 'cef', halvik: 'res', koriv: 'res',
  dresk: 'nlf', sentinel: 'nlf', grail: 'nlf', hallen: 'nlf', quarry: 'nlf', marsk: 'nlf', lumber: 'nlf', ilsen: 'nlf', belno: 'nlf' }
const GARRISON = { city: 3, airport: 3, military: 3, town: 2, village: 1, industry: 1, landmark: 1 }
const MIL_VEH = { vdf: ['jeep', 'truck', 'apc', 'luvm', 'mbt', 'ambulance', 'ammotruck', 'spaa'], nlf: ['technical', 'truck', 'ifv', 'techgl', 'mbt', 'technical', 'spaa'], cef: ['mrap', 'truck', 'ifv', 'luvm', 'mbt', 'ambulance', 'ammotruck'], res: ['technical', 'pickup', 'techgl', 'quad', 'dirtbike'] }
const HELI = { vdf: ['transportheli', 'attackheli', 'armedheli', 'scoutheli'], nlf: ['transportheli', 'attackheli'], cef: ['armedheli', 'attackheli', 'scoutheli', 'transportheli'], res: ['scoutheli'] }
const PLANE = ['fighter', 'groundattack', 'civilplane', 'transportplane']
const BOAT = ['motorboat', 'rhib', 'patrolboat', 'speedboat']
// what is parked in the streets: buses, taxis and a police car in the cities, tractors in the villages
export const CIVIL = { city: ['bus', 'sedan', 'taxi', 'police', 'van', 'hatch', 'sports', 'minivan', 'firetruck', 'muscle', 'scooter'], town: ['sedan', 'van', 'minivan', 'hatch', 'pickup', 'police', 'muscle', 'scooter'], village: ['pickup', 'tractor', 'hatch', 'buggy', 'minivan'] }

export class FreeRoam extends Mode {
  get name() { return 'Free Roam' }
  get loadouts() { return true }      // the Arsenal and saved loadouts apply here
  setup() {
    const g = this.g, o = this.opts
    const save = g.save.data.freeroam
    const resume = o.resume && save
    this.faction = resume ? save.faction : (o.faction || 'vdf')
    this.control = { ...CONTROL }
    this.liberated = new Set(resume ? save.liberated || [] : [])
    for (const id of this.liberated) this.control[id] = this.faction
    // a side's places are its own when you play it
    this.places = PLACES.map(p => ({ p, active: false, squads: [], cleared: false, vehicles: false }))
    this.spawnedPoints = new Set()
    this.patrols = []
    this.patrolT = 40
    this.tick = 0
    this.saveT = 60
    g.difficulty = g.settings.difficulty
    g.sky.cycle = true
    if (resume) { g.sky.hour = save.hour ?? 9; g.sky.setWeather(save.weather || 'clear') }
    else { g.sky.hour = o.hour ?? 9.5; g.sky.setWeather(o.weather || 'clear') }
    // the player
    let x, z, yaw = 0
    if (resume) { x = save.x; z = save.z; yaw = save.yaw || 0 }
    else {
      const start = o.start || 'kaldor'
      const sp = this.spawnPoints(start)[0] || this.spawnPoints()[0]
      x = sp.x; z = sp.z
    }
    const s = g.spawnPlayer({ faction: this.faction, role: o.role || 'rifleman', x, z, yaw, inv: resume && save.inv ? Inventory.from(save.inv) : null, allowDown: false })
    if (resume && save.inv) { s.selectWeapon(s.inv.weapons.primary ? 'primary' : 'sidearm', true); g.player.rebuildViewmodel() }
    if ((o.squad ?? 3) > 0) this.playerSquadAround(s, o.squad ?? 3)
    // a vehicle beside the start
    const vp = this.findGround(x, z, 25)
    if (vp) this.park(this.faction === 'nlf' || this.faction === 'res' ? 'technical' : 'jeep', vp[0], vp[1], yaw + 1.2, { faction: this.faction })
    this.civ = new Civilians(g)
    this.update(0, true)
    g.hud.note(`Free Roam: ${FACTIONS[this.faction].name}. M for the map, P for the sandbox tools.`, C.gold2)
  }
  enemyOf(f) { return hostile(f, this.faction) }
  onKill(sol, killer) {
    super.onKill(sol, killer)
    if (sol.civilian && killer?.isPlayer) this.g.hud.note(`You killed a civilian, ${sol.name}.`, C.red)
  }
  update(dt, first = false) {
    super.update(dt)
    const g = this.g, s = g.player?.s
    if (!s) return
    this.civ?.update(dt)
    if (g.settings.god && !s.dead) { s.blood = 100; s.bleed = 0 }
    this.tick -= dt
    if (this.tick > 0 && !first) return
    this.tick = 1
    const px = s.pos.x, pz = s.pos.z
    // townspeople in the towns your side holds (fewer at night)
    { const { place, d } = nearestPlace(px, pz), h = g.sky.hour, held = place && d < 60 && ['city', 'town', 'village'].includes(place.kind) && this.control[place.id] === this.faction
      this.civ?.populate(px, pz, held ? place : null, held ? Math.round((place.kind === 'city' ? 8 : place.kind === 'town' ? 5 : 3) * (h >= 22 || h < 6 ? 0.25 : 1)) : 0) }
    const cap = QUALITY[g.settings.quality].aiNear + 6
    let near = 0
    for (const o of g.soldiers) if (!o.dead && !o.isPlayer && Math.hypot(o.pos.x - px, o.pos.z - pz) < 1000) near++
    // garrisons
    for (const P of this.places) {
      const p = P.p, d = Math.hypot(p.x - px, p.z - pz)
      const side = this.control[p.id]
      if (!side) continue
      if (!P.active && d < p.r + 800 && near < cap && !(P.cleared)) {
        P.active = true
        const n = Math.max(1, Math.round((GARRISON[p.kind] || 1) * (this.enemyOf(side) ? 1 : 0.5) * (g.settings.quality === 'low' ? 0.7 : 1)))
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, r = p.r * (0.15 + Math.random() * 0.45)
          const c = this.findGround(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 40) || [p.x, p.z]
          const patrol = i === 0 && p.kind !== 'landmark'
          const order = patrol ? { type: 'patrol', route: this.patrolRoute(p.x, p.z, Math.min(p.r * 0.6, 260)) } : { type: 'defend', pos: new THREE.Vector3(c[0], heightAt(c[0], c[1]), c[1]), radius: Math.min(40, p.r * 0.3) }
          const q = this.spawnSquad(side, c[0], c[1], patrol ? 4 : 3 + Math.floor(Math.random() * 3), order, { formation: patrol ? 'file' : 'wedge' })
          q.place = p.id
          P.squads.push(q)
          near += q.members.length
        }
        // an enemy-held town or base often has an armed vehicle patrolling its streets
        if (this.enemyOf(side) && ['city', 'town', 'military', 'airport'].includes(p.kind) && Math.random() < 0.6) {
          const c = this.findGround(p.x, p.z, p.r * 0.5, 30, Math.random, 3) || [p.x, p.z]
          const r = Math.random(), type = side === 'nlf' ? (r < 0.3 ? 'ifv' : r < 0.55 ? 'techgl' : 'technical') : side === 'res' ? (r < 0.35 ? 'techgl' : 'technical') : r < 0.4 ? 'luvm' : side === 'cef' ? 'mrap' : 'apc'
          const q = this.crewed(type, side, c[0], c[1], Math.random() * 6, { type: 'patrol', route: this.patrolRoute(p.x, p.z, Math.min(p.r * 0.7, 300), 5) })
          if (q) { q.place = p.id; P.squads.push(q); near += 2 }
        }
      } else if (P.active && d > p.r + 1500) this.standDown(P)
      // a hostile place with all its garrison gone is liberated
      if (P.active && !P.cleared && this.enemyOf(side) && P.squads.length && P.squads.every(q => q.alive.length === 0)) {
        P.cleared = true
        this.control[p.id] = this.faction
        this.liberated.add(p.id)
        g.hud.note(`${p.name} liberated!`, C.gold2)
        g.sfx.ui('pickup')
        this.persist()
      }
      // vehicles at the place's bases, pads, airfield and harbour; cars in the streets
      if (!P.vehicles && d < p.r + 1200) { P.vehicles = true; this.parkCars(p) }
    }
    for (const pt of POINTS) {
      if (pt.kind !== 'vehicle' && pt.kind !== 'heli' && pt.kind !== 'plane' && pt.kind !== 'boat') continue
      const k = pt.x + ',' + pt.z
      if (this.spawnedPoints.has(k) || Math.hypot(pt.x - px, pt.z - pz) > 1300) continue
      this.spawnedPoints.add(k)
      const side = this.control[pt.place] || 'vdf'
      const i = this.spawnedPoints.size
      const type = pt.kind === 'heli' ? HELI[side][i % HELI[side].length] : pt.kind === 'plane' ? PLANE[i % PLANE.length] : pt.kind === 'boat' ? BOAT[i % BOAT.length] : MIL_VEH[side][i % MIL_VEH[side].length]
      this.park(type, pt.x, pt.z, pt.yaw || 0, { faction: pt.kind === 'boat' && !pt.military ? null : side, exact: pt.kind !== 'vehicle', search: 12 })
    }
    // roaming patrols
    this.patrolT -= 1
    this.patrols = this.patrols.filter(q => q.alive.length > 0 && !q.gone)
    for (const q of this.patrols) { const L = q.leader; if (L && Math.hypot(L.pos.x - px, L.pos.z - pz) > 1800) this.removeSquad(q) }
    if (this.patrolT <= 0 && this.patrols.length < 2 && near < cap - 4) {
      this.patrolT = 70 + Math.random() * 80
      const enemy = Object.keys(FACTIONS).find(f => this.enemyOf(f)) || 'nlf'
      const a = Math.random() * Math.PI * 2, r = 550 + Math.random() * 300
      const c = this.findGround(px + Math.cos(a) * r, pz + Math.sin(a) * r, 120)
      if (c) {
        const target = this.findGround(px, pz, 150) || [px, pz]
        const route = [new THREE.Vector3(target[0], 0, target[1]), new THREE.Vector3(c[0], 0, c[1])]
        const q = this.spawnSquad(enemy, c[0], c[1], 4, { type: 'patrol', route }, { formation: 'file' })
        this.patrols.push(q)
      }
    }
    // now and then an enemy gunship sweeps the area for a few minutes, then flies home
    this.airT = (this.airT ?? (DEBUG_AIR ? 3 : 420)) - 1
    if (this.air) {
      const v = this.air.vehicle, L = this.air.leader
      if (!v?.alive || !L) this.air = null
      else {
        this.air.t++
        if (this.air.t === 210) this.air.order = { type: 'move', pos: this.air.home }
        if (this.air.t > 210 && Math.hypot(v.pos.x - px, v.pos.z - pz) > 2500) { this.removeSquad(this.air); this.air = null }
      }
    } else if (this.airT <= 0) {
      this.airT = 600 + Math.random() * 300
      const enemy = Object.keys(FACTIONS).find(f => this.enemyOf(f)) || 'nlf', a = Math.random() * Math.PI * 2
      const hx = px + Math.cos(a) * 1600, hz = pz + Math.sin(a) * 1600
      // a gunship, or now and then a ground-attack jet making strafing runs
      const jet = Math.random() < 0.4
      const q = this.crewed(jet ? 'groundattack' : 'attackheli', enemy, hx, hz, a + Math.PI, { type: 'patrol', route: this.patrolRoute(px, pz, jet ? 700 : 350, 4) }, { air: jet ? 300 : 90 })
      if (q) { q.home = new THREE.Vector3(hx, 0, hz); q.t = 0; this.air = q; g.hud.radio('Command', jet ? 'Enemy jet inbound! Get under cover, or lock it with a Skyguard.' : 'Enemy gunship in your area. Take cover, or bring it down with a launcher.') }
    }
    // keep the progress
    this.saveT -= 1
    if (this.saveT <= 0) { this.saveT = 60; this.persist() }
  }
  parkCars(p) {
    const n = p.kind === 'city' ? 8 : p.kind === 'town' ? 4 : p.kind === 'village' ? 2 : 0
    let placed = 0
    for (let i = 0; i < 80 && placed < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * p.r * 0.8
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r
      if (!onRoad(x, z)) continue
      // beside the road, along it
      const yaw = Math.random() * Math.PI * 2
      const L = CIVIL[p.kind]; if (this.park(L[placed % L.length], x, z, yaw, { search: 6 })) placed++
    }
  }
  standDown(P) {
    P.active = false
    for (const q of P.squads) this.removeSquad(q)
    P.squads = []
  }
  removeSquad(q) {
    const g = this.g
    q.gone = true
    // a crewed vehicle goes with its crew (unless the player has taken it)
    if (q.vehicle && !q.vehicle.seats.some(st => st.occupant?.isPlayer)) { for (const m of q.members) if (m.vehicle) g.vehicles.exit(m, true); g.vehicles.remove(q.vehicle) }
    for (const m of q.members) {
      if (m.isPlayer || m.vehicle) continue
      g.ai.remove(m)
      const i = g.soldiers.indexOf(m); if (i >= 0) g.soldiers.splice(i, 1)
    }
    const i = g.ai.squads.indexOf(q); if (i >= 0) g.ai.squads.splice(i, 1)
  }
  persist() {
    const g = this.g, s = g.player?.s
    if (!s || s.dead) return
    g.save.data.freeroam = { faction: this.faction, x: Math.round(s.pos.x), z: Math.round(s.pos.z), yaw: +s.yaw.toFixed(2), hour: +g.sky.hour.toFixed(2), weather: g.sky.weatherKey, liberated: [...this.liberated], inv: s.inv.toJSON() }
    g.save.store()
  }
  objectives() {
    return this.places.filter(P => this.control[P.p.id]).map(P => {
      const side = this.control[P.p.id], bad = this.enemyOf(side)
      return { x: P.p.x, z: P.p.z, color: bad ? '#e0483a' : side === this.faction ? '#5ab0ff' : '#6ab04c', label: bad ? `${P.p.name} (${FACTIONS[side].short})` : '' }
    })
  }
  stashLoot() {
    const it = [{ kind: 'med', id: 'medkit', count: 1 }, { kind: 'grenade', id: 'frag' }, { kind: 'grenade', id: 'frag' }, { kind: 'tool', id: 'nvg' }, { kind: 'tool', id: 'repairkit' }]
    // and one or two pieces of field gear
    const extra = [{ kind: 'tool', id: 'c4' }, { kind: 'tool', id: 'mine' }, { kind: 'tool', id: 'radio' }, { kind: 'tool', id: 'sandbags' }, { kind: 'clothing', id: 'ghillie' }, { kind: 'food', id: 'ration' }, { kind: 'med', id: 'splint' }, { kind: 'med', id: 'morphine' }]
    for (let i = 0; i < 2; i++) it.push(extra[Math.floor(Math.random() * extra.length)])
    const w = this.g.player.s.w
    if (w) for (let i = 0; i < 3; i++) it.push({ kind: 'mag', ammo: w.def.ammo, rounds: w.s.mag, cap: w.s.mag, belt: !!w.def.belt })
    return it
  }
  respawnOptions() {
    const out = []
    const s = this.g.player.s
    const mates = this.g.playerSquad?.alive.filter(m => !m.isPlayer) || []
    if (mates.length) out.push({ id: 'squad', label: 'Respawn with your squad', sub: `${mates.length} still fighting` })
    const own = this.places.filter(P => this.control[P.p.id] === this.faction && this.spawnPoints(P.p.id).length)
      .sort((a, b) => Math.hypot(a.p.x - s.pos.x, a.p.z - s.pos.z) - Math.hypot(b.p.x - s.pos.x, b.p.z - s.pos.z))
    for (const P of own.slice(0, 3)) out.push({ id: 'place:' + P.p.id, label: `Respawn at ${P.p.name}`, sub: `${Math.round(Math.hypot(P.p.x - s.pos.x, P.p.z - s.pos.z))} m away` })
    if (!out.length) out.push({ id: 'here', label: 'Respawn nearby', sub: '' })
    return out
  }
  respawn(id) {
    const g = this.g, old = g.player.s
    let x = old.pos.x, z = old.pos.z
    if (id === 'squad') { const m = g.playerSquad.alive.find(m => !m.isPlayer); if (m) { x = m.pos.x; z = m.pos.z } }
    else if (id.startsWith('place:')) { const sp = this.spawnPoints(id.slice(6))[0]; if (sp) { x = sp.x; z = sp.z } }
    else { const p = this.findGround(x, z, 150); if (p) { x = p[0]; z = p[1] } }
    const p = this.findGround(x, z, 6) || [x, z]
    const s = g.replacePlayer({ faction: this.faction, role: old.role, x: p[0], z: p[1], yaw: old.yaw })
    if (g.playerSquad) {
      g.playerSquad.members = g.playerSquad.members.filter(m => m !== old)
      g.playerSquad.members.unshift(s)
      g.playerSquad.order = { type: 'follow', target: s }
      // the squad is reinforced back to strength
      const want = (this.opts.squad ?? 3) - g.playerSquad.alive.filter(m => m !== s).length
      for (let i = 0; i < want; i++) {
        const q = this.findGround(s.pos.x, s.pos.z, 8) || [s.pos.x + i, s.pos.z - 2]
        const m = g.addSoldier({ faction: s.faction, role: ['autorifleman', 'medic', 'rifleman'][i % 3], x: q[0], z: q[1], team: s.team, name: `Pvt ${String.fromCharCode(65 + i)}${Math.floor(Math.random() * 90 + 10)}` })
        g.ai.add(m, g.playerSquad, 0.7); m.allowDown = true
      }
    }
  }
  // ---- sandbox tools ----
  admin(action, arg) {
    const g = this.g, s = g.player.s
    const ahead = (d) => [s.pos.x + Math.sin(s.yaw) * d, s.pos.z + Math.cos(s.yaw) * d]
    if (action === 'vehicle' && VEHICLES[arg].kind === 'plane') {
      // aircraft from the sandbox start in the air (no runway needed): 250 m up, at cruising speed, you at the controls
      if (s.vehicle) g.vehicles.exit(s, true)
      const [x, z] = ahead(60), d = VEHICLES[arg]
      const v = g.vehicles.spawn(arg, x, z, s.yaw, { faction: this.faction, y: Math.max(heightAt(x, z), 0) + 250 })
      const sp = Math.min(d.maxSpeed * 0.7, Math.max(d.minSpeed * 1.5, 60))
      v.speed = sp; v.vel.set(Math.sin(s.yaw) * sp, 0, Math.cos(s.yaw) * sp); v.throttle = 0.75; v.gearDown = false; v.onGround = false; v.engine = true
      if (g.vehicles.enter(s, v)) { g.vcontrol.entered(v); g.player.lastView = g.player.view }
      g.hud.note(`${d.name}: airborne. W/S throttle, the mouse steers, G gear, F bails out (parachute).`, C.gold2)
      return v
    }
    if (action === 'vehicle') {
      const big = arg === 'fighter' || arg === 'groundattack' || arg === 'transportplane'
      const [x, z] = ahead(big ? 40 : 14)
      const v = this.park(arg, x, z, s.yaw, { faction: this.faction, search: big ? 120 : 40 })
      g.hud.note(v ? `${v.def.name} is waiting ${Math.round(Math.hypot(v.pos.x - s.pos.x, v.pos.z - s.pos.z))} m away` : 'No clear ground for that here: try in the open')
      return v
    }
    else if (action === 'squad') { const enemy = arg === 'enemy'; const f = enemy ? (Object.keys(FACTIONS).find(k => this.enemyOf(k)) || 'nlf') : this.faction; const [x, z] = ahead(enemy ? 220 : 15); const c = this.findGround(x, z, 40) || [x, z]; const q = this.spawnSquad(f, c[0], c[1], 5, enemy ? { type: 'attack', pos: s.pos.clone() } : { type: 'defend', pos: new THREE.Vector3(c[0], 0, c[1]), radius: 20 }); this.patrols.push(q); g.hud.note(enemy ? 'Enemy squad attacking from ahead' : 'Friendly squad placed') }
    else if (action === 'time') { g.sky.hour = arg; g.hud.note(`Time ${String(Math.floor(arg)).padStart(2, '0')}:00`) }
    else if (action === 'weather') { g.sky.setWeather(arg); g.hud.note(`Weather: ${WEATHER[arg].name}`) }
    else if (action === 'cycle') { g.sky.cycle = !g.sky.cycle; g.hud.note(g.sky.cycle ? 'Day/night cycle on' : 'Time stopped') }
    else if (action === 'god') { g.settings.god = !g.settings.god; g.hud.note(g.settings.god ? 'Invulnerable' : 'Vulnerable') }
    else if (action === 'reveal') { g.settings.reveal = !g.settings.reveal; g.hud.note(g.settings.reveal ? 'All units shown on the map' : 'Only known units on the map') }
    else if (action === 'ammo') { g.resupply(s, 'all') }
    else if (action === 'teleport') { const y = heightAt(arg.x, arg.z); s.pos.set(arg.x, y, arg.z); s.vel.set(0, 0, 0); if (s.vehicle) g.vehicles.exit(s, true); s.pos.set(arg.x, y, arg.z); g.preload(arg.x, arg.z); for (const m of g.playerSquad?.alive || []) if (m !== s && !m.vehicle) { const p = this.findGround(arg.x, arg.z, 8) || [arg.x, arg.z]; m.pos.set(p[0], heightAt(p[0], p[1]), p[1]) }; if (arg.halo) { const air = (o, dx, dz) => { o.pos.set(arg.x + dx, y + 600, arg.z + dz); o.vel.set(0, 0, 0); o.onGround = false; o.parachute = true; o.chuteT = 0 }; air(s, 0, 0); (g.playerSquad?.alive || []).filter(m => m !== s && !m.vehicle).forEach((m, k) => air(m, (k % 3 - 1) * 14, -12 - Math.floor(k / 3) * 12)); g.hud.note('Jumped from 600 m: the parachute is open') } else g.hud.note('Teleported') }
    else if (action === 'clear') { for (const q of [...g.ai.squads]) if (!q.player) this.removeSquad(q); for (const P of this.places) { P.active = false; P.squads = [] } g.hud.note('All AI removed (garrisons return as you travel)') }
    else if (action === 'item') {
      if (arg === 'ghillie') { const r = s.inv.takeOff('shirt'); s.inv.wear('ghillie'); for (const it of r.spilled) s.inv.add(it); g.hud.note('Ghillie suit on: crouch or lie down to vanish') }
      else { const it = ITEMS[arg]; if (s.inv.add({ kind: it.kind, id: arg })) g.hud.note(`${it.name} added`); else g.hud.note('No room for that') }
    }
    else if (action === 'weapon') { const def = arg; s.inv.weapons[def.slot] = { id: def.id, att: def.att || {}, mag: def.mag, chamber: 1 }; for (let i = 0; i < 4; i++) s.inv.add({ kind: 'mag', ammo: def.ammo, rounds: def.mag, cap: def.mag, belt: !!def.belt }, 'backpack'); s.selectWeapon(def.slot); g.player.rebuildViewmodel(); g.hud.note(`${def.name} equipped`) }
  }
  // ---- HUD ----
  hudKey() {
    const s = this.g.player?.s; if (!s) return ''
    const { place, d } = nearestPlace(s.pos.x, s.pos.z)
    return [place?.id, d < 0, Math.floor(this.g.sky.hour * 4), this.g.sky.weatherKey, this.kills, this.liberated.size, this.control[place?.id]].join()
  }
  drawHud(c, p, k) {
    const g = this.g, s = g.player.s
    const { place, d } = nearestPlace(s.pos.x, s.pos.z)
    const side = this.control[place?.id]
    const h = g.sky.hour, hh = String(Math.floor(h)).padStart(2, '0'), mm = String(Math.floor((h % 1) * 60)).padStart(2, '0')
    const where = d < 0 ? place.name : d < 600 ? `Near ${place.name}` : 'Countryside'
    this.panelTitle(c, k, `FREE ROAM  ·  ${where}`, `${hh}:${mm}  ${WEATHER[g.sky.weatherKey]?.name || ''}   ${d < 600 && side ? 'Held by ' + FACTIONS[side].short : ''}`)
    const hostileLeft = this.places.filter(P => this.control[P.p.id] && this.enemyOf(this.control[P.p.id])).length
    text(c, `Kills ${this.kills}   Liberated ${this.liberated.size}   Enemy-held places ${hostileLeft}`, 10 * k, 62 * k, { size: 12 * k, color: C.dim, shadow: true })
  }
}
