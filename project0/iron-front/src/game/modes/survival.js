// Survival: after the outbreak. You wash up on the coast of Varden with a bottle of water and a bandage;
// the towns are full of the infected. Scavenge the houses, shops and military sites for food, water,
// clothes, medicine and weapons; eat and drink or weaken; the infected see you, hear your shots and run you
// down, and their blows make you bleed. Die and the survivor is gone: you start again. The survivor (where
// you are, what you carry, how long you have lasted) is kept in your save between visits.
import * as THREE from 'three'
import { Mode, nearestPlace, onRoad } from './base.js'
import { PLACES } from '../../world/blueprint.js'
import { BUILDINGS, isBuilt } from '../../world/places.js'
import { heightAt, roadAt, waterLevel } from '../../world/heightfield.js'
import { Inventory, ITEMS, newMag } from '../inventory.js'
import { weapon, stats } from '../../combat/weapons-data.js'
import { C, text, bar } from '../../ui/ui.js'
import { WEATHER } from '../../world/sky.js'
import { CROUCH, PRONE } from '../../actors/soldier.js'

const DAY = 24 * 60
const ROT = [[0.42, 0.45, 0.38], [0.35, 0.3, 0.28], [0.5, 0.48, 0.42], [0.3, 0.33, 0.36], [0.45, 0.38, 0.3]]   // filthy clothes
const pick = a => a[Math.floor(Math.random() * a.length)]
const angle = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d }

// what lies in a building, by the kind of place: [weight, item maker]
const gun = (id, mags = 1) => () => { const def = weapon(id); return { weapon: id, mags: Array.from({ length: mags }, () => newMag(def, stats(def, {}))) } }
const item = (kind, id, count) => () => ({ kind, id, ...(count ? { count } : {}) })
const LOOT = {
  home: [[3, item('tool', 'map')], [0.4, item('tool', 'gps')], [5, item('tool', 'matches')], [10, item('food', 'apple')], [6, item('food', 'sandwich')], [8, item('water', 'water')], [4, item('water', 'soda')], [6, item('med', 'bandage', 2)], [2, item('med', 'morphine')], [2, item('med', 'firstaid')],
    [3, item('clothing', 'hoodie')], [3, item('clothing', 'jacket')], [2, item('clothing', 'cargopants')], [3, item('clothing', 'daypack')], [2, item('clothing', 'beanie')], [2, item('tool', 'binoculars')], [2, item('water', 'canteen')],
    [2, gun('p17', 2)], [1, gun('vm9', 2)], [1.5, gun('ranch870', 0)], [1, item('ammo', null)], [0.6, gun('fjell', 1)], [1, item('tool', 'jerrycan')]],
  shop: [[3, item('tool', 'map')], [0.6, item('tool', 'gps')], [4, item('tool', 'matches')], [12, item('food', 'sandwich')], [10, item('water', 'water')], [8, item('water', 'soda')], [6, item('food', 'ration')], [5, item('food', 'apple')], [4, item('med', 'bandage', 2)], [2, item('water', 'canteen')], [2, item('clothing', 'daypack')], [1, item('tool', 'repairkit')]],
  military: [[2, item('tool', 'map')], [1.5, item('tool', 'gps')], [6, gun('brenner', 2)], [5, gun('ks47', 2)], [3, gun('vr4c', 2)], [2, gun('br51', 1)], [1, gun('halberd', 0)], [6, item('med', 'firstaid')], [3, item('med', 'medkit')], [5, item('med', 'bandage', 3)],
    [4, item('clothing', 'helmet')], [3, item('clothing', 'platecarrier')], [3, item('clothing', 'assaultpack')], [3, item('clothing', 'chestrig')], [4, item('grenade', 'frag')], [2, item('grenade', 'smoke')], [5, item('food', 'ration')], [3, item('water', 'canteen')], [1.2, item('tool', 'nvg')], [4, item('mag', null)]],
}
function roll(table) { const tot = table.reduce((n, [w]) => n + w, 0); let r = Math.random() * tot; for (const [w, f] of table) { r -= w; if (r <= 0) return f() } return table[0][1]() }

export class Survival extends Mode {
  get name() { return 'Survival' }
  setup() {
    const g = this.g, save = g.save.data.survival
    const resume = this.opts.resume && save
    this.hunger = resume ? save.hunger ?? 0.7 : 0.7; this.thirst = resume ? save.thirst ?? 0.6 : 0.6
    this.alive = resume ? save.alive || 0 : 0; this.kills = resume ? save.kills || 0 : 0
    this.inf = []; this.piles = []; this.looted = new Set(); this.townsDone = new Set()
    this.tick = 0; this.saveT = 30; this.warnT = 0; this.meleeT = 0
    g.difficulty = 0.5; g.sky.cycle = true
    g.sky.hour = resume ? save.hour ?? 8 : 7 + Math.random() * 3
    g.sky.setWeather(resume ? save.weather || 'overcast' : pick(['clear', 'overcast', 'overcast', 'fog']))
    let x, z, yaw = Math.random() * 6.28
    if (resume) { x = save.x; z = save.z; yaw = save.yaw || 0 }
    else { [x, z] = this.coast() }
    const inv = resume && save.inv ? Inventory.from(save.inv) : this.starter()
    const s = g.spawnPlayer({ faction: 'civ', role: 'rifleman', x, z, yaw, inv, team: 'surv', allowDown: false, name: 'You' })
    if (resume && save.blood) s.blood = save.blood
    this.dress(s)
    this.update(0, true)
    g.hud.note(resume ? `Still alive: ${this.days()}` : 'SURVIVAL: no map and no GPS: find them in houses and shops. You have a pistol and two magazines. Find food, water and a better gun. The infected hear gunshots and running feet. Matches (inventory) light a fire to cook on.', C.gold2)
  }
  // a quiet beach near a village or a town
  coast() {
    const towns = PLACES.filter(p => p.kind === 'village' || p.kind === 'town')
    for (let k = 0; k < 60; k++) {
      const P = pick(towns), a = Math.random() * Math.PI * 2, r = P.r * (0.6 + Math.random() * 0.5)
      const p = this.findGround(P.x + Math.cos(a) * r, P.z + Math.sin(a) * r, 60)
      if (p) return p
    }
    const P = towns[0]; return [P.x + P.r + 50, P.z]
  }
  starter() {
    const inv = new Inventory()
    inv.wear('tshirt'); inv.wear('jeans'); inv.wear('sneakers')
    inv.add({ kind: 'med', id: 'bandage', count: 1 }); inv.add({ kind: 'water', id: 'water' }); inv.add({ kind: 'food', id: 'apple' }); inv.add({ kind: 'tool', id: 'matches' })
    // a pistol, loaded, and two spare magazines
    const def = weapon('p17'), st = stats(def, {})
    inv.weapons.sidearm = { id: def.id, att: {}, mag: st.mag, chamber: 1 }
    for (let i = 0; i < 2; i++) inv.add(newMag(def, st))
    return inv
  }
  dress(s) { s.plain = true; s.noVest = !s.inv.worn.vest; s.unarmed = !s.w; s.uniform = { hoodie: [0.38, 0.4, 0.44], jacket: [0.3, 0.2, 0.14], combatshirt: [0.36, 0.42, 0.25], fieldjacket: [0.36, 0.42, 0.25] }[s.inv.worn.shirt] || [0.8, 0.8, 0.78]; s.pants = { jeans: [0.2, 0.27, 0.45], cargopants: [0.36, 0.38, 0.28], combatpants: [0.36, 0.42, 0.25] }[s.inv.worn.pants] || [0.25, 0.25, 0.27]; s.headgear = s.inv.worn.head === 'helmet' ? 'helmet' : s.inv.worn.head ? 'cap' : 'none'; s.pack = !!s.inv.worn.backpack }
  days() { const d = Math.floor(this.alive / DAY), h = Math.floor((this.alive % DAY) / 60); return d ? `${d} day${d === 1 ? '' : 's'} ${h} h` : `${h} h ${Math.floor(this.alive % 60)} min` }
  // ---- the infected ----
  spawnInfected(x, z, town) {
    const g = this.g, inv = new Inventory(); inv.wear('tshirt'); inv.wear('jeans')
    if (Math.random() < 0.25) inv.add(roll(LOOT.home))
    const s = g.addSoldier({ faction: 'inf', role: 'rifleman', x, z, yaw: Math.random() * 6.28, inv, team: 'inf', name: 'Infected' })
    s.plain = true; s.noVest = true; s.unarmed = true; s.pack = false; s.infected = true
    s.uniform = pick(ROT); s.pants = pick(ROT); s.headgear = 'none'; s.skin = 4
    this.inf.push({ s, home: { x, z }, target: null, wait: Math.random() * 3, chase: false, lostT: 0, hitT: 0, town })
  }
  removeInf(n) { const g = this.g, i = g.soldiers.indexOf(n.s); if (i >= 0 && !n.s.dead) g.soldiers.splice(i, 1); this.inf.splice(this.inf.indexOf(n), 1) }
  // how far an infected can see you: less at night, crouched, lying down, in the woods
  // how far you can be heard: running feet carry, a crouched walk barely, a moving car a long way
  noise(P) { if (!P || P.dead) return 0; if (P.vehicle) return Math.abs(P.vehicle.speed) > 1 ? 70 : P.vehicle.engine ? 25 : 0; const v = P.speed; return P.stance === PRONE ? 0 : v > 4.5 ? 24 : v > 2.2 ? (P.stance === CROUCH ? 6 : 12) : v > 0.3 ? (P.stance === CROUCH ? 1.5 : 4) : 0 }
  sight(P) { const night = this.g.sky.night || 0; return 34 * (1 - night * 0.55) * (P.stance === PRONE ? 0.35 : P.stance === CROUCH ? 0.6 : 1) * (P.speed > 4 ? 1.3 : 1) }
  infUpdate(dt) {
    const g = this.g, P = g.player?.s
    const loud = (g.dangers || []).filter(d => g.time - d.t < 1.5)
    for (const n of this.inf) {
      const s = n.s
      if (s.dead) { if (s.deadT < 3) s.step(dt, g.W); continue }
      s.stamina = 1
      const d = P && !P.dead ? Math.hypot(P.pos.x - s.pos.x, P.pos.z - s.pos.z) : 1e9
      if (!n.chase && P && !P.dead && (!P.vehicle || d < this.noise(P))) {
        const facing = Math.abs(angle(Math.atan2(P.pos.x - s.pos.x, P.pos.z - s.pos.z), s.yaw)) < 1.4
        if ((d < this.sight(P) && (facing || d < 7)) || d < this.noise(P) || loud.some(L => Math.hypot(L.x - s.pos.x, L.z - s.pos.z) < 130)) { n.chase = true; n.lostT = 0; if (d < 60) g.sfx?.ui?.('hurt') }
      }
      if (n.chase) {
        if (!P || P.dead || d > 90) { n.lostT += dt; if (n.lostT > 6) { n.chase = false; n.home = { x: s.pos.x, z: s.pos.z } } }
        else n.lostT = 0
        const tx = P ? P.pos.x : s.pos.x, tz = P ? P.pos.z : s.pos.z
        s.yaw += angle(Math.atan2(tx - s.pos.x, tz - s.pos.z), s.yaw) * Math.min(1, dt * 7)
        // in a vehicle you are out of reach (but they keep coming)
        const close = d < 1.5 && Math.abs(P.pos.y - s.pos.y) < 1.6 && !P.vehicle
        // hit: they reel for a moment
        if (s.blood < (n.lastBlood ?? 100) - 1) n.stagger = 0.8
        n.lastBlood = s.blood; n.stagger = Math.max(0, (n.stagger || 0) - dt)
        // they run at you, but slower than you can sprint: you can get away while your breath lasts
        s.input.fwd = close || n.stagger > 0 ? 0 : 1; s.input.walk = false; s.input.sprint = !close && d > 10
        n.hitT -= dt
        if (close && n.hitT <= 0 && !P.dead && !n.stagger) {
          n.hitT = 1.5 + Math.random() * 0.6
          const part = pick(['torso', 'torso', 'armL', 'armR', 'legL', 'legR'])
          P.hurt(part, 5 + Math.random() * 4, 0, s, new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw)), 'melee')
          if (Math.random() < 0.25) P.bleed += 0.08
          g.hud?.hit?.(false); g.player.camShake = Math.max(g.player.camShake || 0, 0.5)
        }
      } else {
        if (n.wait > 0) { n.wait -= dt; s.input.fwd = 0 }
        else {
          if (!n.target) { const a = Math.random() * Math.PI * 2, r = Math.random() * 20; n.target = { x: n.home.x + Math.cos(a) * r, z: n.home.z + Math.sin(a) * r } }
          const dx = n.target.x - s.pos.x, dz = n.target.z - s.pos.z
          if (Math.hypot(dx, dz) < 1 || (n.stuck || 0) > 3) { n.target = null; n.stuck = 0; n.wait = 2 + Math.random() * 8; s.input.fwd = 0 }
          else { s.yaw += angle(Math.atan2(dx, dz), s.yaw) * Math.min(1, dt * 3); s.input.fwd = 1; s.input.walk = true; s.input.sprint = false; n.stuck = s.speed < 0.2 ? (n.stuck || 0) + dt : 0 }
        }
        if (s.input.fwd === 0 && d > 40 && s.onGround) { s.speed = 0; s.vel.x = s.vel.z = 0; continue }
      }
      s.step(dt, g.W)
    }
  }
  // ---- helicopter crash sites: now and then one comes down within a kilometre, burning; a column of smoke
  // shows where; military supplies lie by it, and a few infected were drawn to the noise ----
  crashSite(s) {
    const g = this.g
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * Math.PI * 2, d = 450 + Math.random() * 550
      const p = this.findGround(s.pos.x + Math.sin(a) * d, s.pos.z + Math.cos(a) * d, 60)
      if (!p) continue
      const [x, z] = p, y = heightAt(x, z), yaw = Math.random() * 6.28
      // the wreck: a broken fuselage nose-down, the tail boom apart, a bent blade
      const m = this.wreckMat || (this.wreckMat = new THREE.MeshLambertMaterial({ color: 0x2c3024 }))
      const grp = new THREE.Group(), box = (w, h, l, px, py, pz, rx = 0, ry = 0, rz = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); b.position.set(px, py, pz); b.rotation.set(rx, ry, rz); grp.add(b) }
      box(2.6, 2.2, 7.5, 0, 1.0, 0, 0.18, 0, 0.35); box(0.6, 0.7, 5, 1.2, 0.5, -6.5, 0, 0.7, 0.2); box(0.25, 0.08, 7, -1.5, 2.6, 1, 0.3, 1.1, 0.4); box(1.4, 1.6, 0.4, 2.6, 0.7, -9.2, 0, 0.7, 0)
      grp.position.set(x, y, z); grp.rotation.y = yaw; g.engine.world.add(grp)
      const site = { x, y, z, mesh: grp, t: 1500, fx: 0, piles: [] }
      for (let i = 0; i < 2; i++) { const pl = this.makePile(x + (i ? 3.5 : -3.5), y + 0.15, z + 2.5, LOOT.military, 'Crash site supplies', 3); pl.keep = true; site.piles.push(pl) }
      for (let i = 0; i < 3; i++) this.spawnInfected(x + (Math.random() - 0.5) * 30, z + (Math.random() - 0.5) * 30, null)
      ;(this.sites || (this.sites = [])).push(site)
      const b = Math.atan2(x - s.pos.x, -(z - s.pos.z)) * 180 / Math.PI, dir = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((b % 360) + 360) % 360 / 45) % 8]
      g.hud.note(`A helicopter came down to the ${dir}, about ${Math.round(Math.hypot(x - s.pos.x, z - s.pos.z) / 100) * 100} m away: follow the smoke`, C.amber)
      g.tip('crash', 'Crash sites hold military supplies, but the noise draws the infected. The smoke lasts about 25 minutes')
      return site
    }
    return null
  }
  crashUpdate(dt, s) {
    const g = this.g
    this.crashT = (this.crashT ?? 300 + Math.random() * 300) - dt
    if (this.crashT <= 0) { this.crashT = 900 + Math.random() * 600; this.crashSite(s) }
    for (const site of this.sites || []) {
      site.t -= dt; site.fx -= dt
      // the smoke column (fire low down while it is fresh), seen from afar
      if (site.fx <= 0 && Math.hypot(site.x - s.pos.x, site.z - s.pos.z) < 2600) {
        site.fx = 0.22
        g.fx.puff(site.x + (Math.random() - 0.5) * 2, site.y + 2, site.z + (Math.random() - 0.5) * 2, { vx: 0.6, vy: 4 + Math.random() * 2, vz: 0.4, s0: 2.5, s1: 12, life: 14, r: 0.14, g: 0.14, b: 0.14, a: 0.65, drag: 0.15, fadeIn: 0.1 })
        if (site.t > 900) g.fx.burn(site.x + (Math.random() - 0.5) * 3, site.y + 0.8, site.z + (Math.random() - 0.5) * 3, 1.4)
      }
    }
    for (const site of [...(this.sites || [])]) if (site.t <= 0) { g.engine.world.remove(site.mesh); for (const pl of site.piles) pl.keep = false; this.sites.splice(this.sites.indexOf(site), 1) }
  }
  // A pile of things to search: `count` rolls on the table (1-3 if not given)
  makePile(x, y, z, table, name, count) {
    const g = this.g
    const items = [], fake = new Inventory()
    for (let j = 0; j < (count ?? 1 + Math.floor(Math.random() * 3)); j++) {
      const it = roll(table)
      if (it.weapon) { const def = weapon(it.weapon), slot = def.slot; if (!fake.weapons[slot]) { fake.weapons[slot] = { id: def.id, att: {}, mag: Math.floor(def.mag * Math.random()), chamber: 0 }; items.push(...it.mags); if (def.tube) items.push({ kind: 'ammo', ammo: def.ammo, count: 4 + Math.floor(Math.random() * 8) }) } }
      else if (it.kind === 'ammo') items.push({ kind: 'ammo', ammo: '12g', count: 5 + Math.floor(Math.random() * 6) })
      else if (it.kind === 'mag') { const def = weapon(pick(['brenner', 'ks47', 'vr4c'])); items.push(newMag(def, stats(def, {}))) }
      else items.push(it)
    }
    const pile = { x, y, z, items, name, body: { inv: fake }, t: g.time, pile: true }
    pile.mesh = new THREE.Mesh(this.boxGeo || (this.boxGeo = new THREE.BoxGeometry(0.55, 0.32, 0.4)), this.boxMat || (this.boxMat = new THREE.MeshLambertMaterial({ color: 0x7a6040 })))
    pile.mesh.position.set(x, y, z); pile.mesh.rotation.y = Math.random() * 3; g.engine.world.add(pile.mesh)
    g.loot.push(pile); this.piles.push(pile)
    return pile
  }
  // ---- supplies in the buildings ----
  stock(px, pz) {
    const g = this.g
    for (const [bi, b] of BUILDINGS.entries()) {
      if (this.looted.has(bi) || Math.abs(b.x - px) > 110 || Math.abs(b.z - pz) > 110) continue
      const P = PLACES.find(q => q.id === b.place)
      const mil = b.type === 'barracks' || b.type === 'bunker' || b.type === 'hangar' || b.military || b.command || P?.kind === 'military' || P?.kind === 'airport'
      const shop = b.type === 'shop' || b.type === 'fuel' || (b.type === 'apartment' && b.shop)
      if (!mil && !shop && b.type !== 'house' && b.type !== 'apartment' && b.type !== 'warehouse' && b.type !== 'barn' && b.type !== 'church') continue
      this.looted.add(bi)
      const n = Math.random() < (mil ? 0.85 : 0.6) ? 1 + (Math.random() < 0.35 ? 1 : 0) : 0
      for (let k = 0; k < n; k++) {
        const c = Math.cos(b.yaw), s = Math.sin(b.yaw), lx = (Math.random() - 0.5) * (b.w - 3), lz = (Math.random() - 0.5) * (b.d - 3)
        const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c, y = (b.y ?? heightAt(x, z)) + 0.15
        this.makePile(x, y, z, mil ? LOOT.military : shop ? LOOT.shop : LOOT.home, mil ? 'Military supplies' : shop ? 'Shop shelves' : 'Household things')
      }
    }
    // emptied or far-off piles go
    for (const pl of [...this.piles]) {
      const far = !pl.keep && Math.hypot(pl.x - px, pl.z - pz) > 260, empty = !pl.items.length && !Object.values(pl.body.inv.weapons).some(Boolean)
      if (far || empty) { g.engine.world.remove(pl.mesh); this.piles.splice(this.piles.indexOf(pl), 1); const i = g.loot.indexOf(pl); if (i >= 0) g.loot.splice(i, 1) }
    }
  }
  // ---- the loop ----
  update(dt, first = false) {
    super.update(dt)
    const g = this.g, s = g.player?.s
    if (!s) return
    if (!s.dead) { this.alive += dt * (g.sky.cycle ? 1 : 0) * 1; this.needs(dt, s) }
    this.infUpdate(dt)
    this.firesUpdate(dt)
    this.crashUpdate(dt, s)
    if (s.inv.count('map')) g.tip('foundmap', 'You found a map: M opens it. It does not show where you are: read the land, or find a GPS', 'You found a map: MAP opens it. It does not show where you are: find a GPS for that')
    if (s.inv.count('gps')) g.tip('foundgps', 'You found a GPS: the map and the minimap now show where you are')
    s.unarmed = !s.w
    this.tick -= dt
    if (this.tick > 0 && !first) return
    this.tick = 1
    this.dress(s)
    const px = s.pos.x, pz = s.pos.z
    this.stock(px, pz)
    // abandoned cars, low on fuel, in each town you come near
    for (const P of PLACES) {
      if (this.townsDone.has(P.id) || Math.hypot(P.x - px, P.z - pz) > P.r + 400) continue
      this.townsDone.add(P.id)
      const n = P.kind === 'city' ? 4 : P.kind === 'town' ? 2 : 1
      for (let i = 0, k = 0; i < n && k < 40; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * P.r * 0.8, x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r
        if (!onRoad(x, z)) continue
        const v = this.park(pick(['hatch', 'sedan', 'pickup', 'van', 'motorbike']), x, z, Math.random() * 6.28, { search: 8 })
        if (v) { v.fuel = v.maxFuel * (0.05 + Math.random() * 0.2); v.hp = v.maxHp * (0.4 + Math.random() * 0.5); i++ }
      }
    }
    // the infected: more in towns, more at night; they drift away far from you
    const { place, d } = nearestPlace(px, pz), night = g.sky.night || 0
    const inTown = place && d < 80, base = inTown ? ({ city: 16, town: 12, village: 7, military: 12, airport: 10 }[place.kind] || 6) : 3
    const want = Math.round(base * (1 + night * 0.4))
    const alive = this.inf.filter(n => !n.s.dead)
    if (alive.length < want) for (let k = 0; k < 6 && alive.length + k < want; k++) {
      const a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 100
      const p = this.findGround(px + Math.cos(a) * r, pz + Math.sin(a) * r, 25)
      if (p) this.spawnInfected(p[0], p[1], place?.id)
    }
    for (const n of [...this.inf]) { const dd = Math.hypot(n.s.pos.x - px, n.s.pos.z - pz); if ((dd > 240 && !n.chase) || (n.s.dead && dd > 160)) this.removeInf(n) }
    this.saveT -= 1
    if (this.saveT <= 0) { this.saveT = 30; this.persist() }
  }
  needs(dt, s) {
    const g = this.g, work = s.sprint ? 2.2 : 1
    this.hunger = Math.max(0, this.hunger - dt / (DAY * 1.2) * work)
    this.thirst = Math.max(0, this.thirst - dt / (DAY * 0.8) * work)
    const low = Math.min(this.hunger, this.thirst)
    if (low < 0.15) s.stamina = Math.min(s.stamina, 0.25 + low * 3)
    if (low <= 0) s.blood = Math.max(0, s.blood - dt * 0.35)
    if (s.blood <= 0 && !s.dead) { s.deathCause = this.hunger <= this.thirst ? 'starve' : 'thirst'; s.die(null, null) }
    this.warnT -= dt
    if (this.warnT <= 0 && low < 0.2) { this.warnT = 60; g.hud.note(this.hunger < this.thirst ? 'You are starving: eat something' : 'You are parched: drink something', C.amber) }
  }
  onConsume(s, def) {
    if (def.food) this.hunger = Math.min(1, this.hunger + def.food / 100); if (def.water) this.thirst = Math.min(1, this.thirst + def.water / 100)
    // raw meat: a fair chance of being sick (you lose water and some of what you ate)
    if (def.raw && Math.random() < 0.45) { this.thirst = Math.max(0, this.thirst - 0.2); this.hunger = Math.max(0, this.hunger - def.food / 150); s.stamina = Math.min(s.stamina, 0.2); this.g.hud.note('That was raw: you are sick. Cook meat on a fire.', C.amber) }
  }
  // ---- campfires: lit with matches, burn four minutes, cook meat and fish ----
  actions(s) {
    const g = this.g, out = []
    if (s.vehicle || s.dead) return out
    const fire = (this.fires || []).find(f => Math.hypot(f.x - s.pos.x, f.z - s.pos.z) < 2.6)
    if (fire) {
      const raw = s.inv.count('venison'), fish = s.inv.count('fish')
      if (raw) out.push({ label: `Cook venison (${raw})`, fn: () => this.cook(s, 'venison', 'cookedvenison', 'venison') })
      if (fish) out.push({ label: `Cook fish (${fish})`, fn: () => this.cook(s, 'fish', 'cookedfish', 'fish') })
      if (!raw && !fish) out.push({ label: `Campfire (${Math.ceil(fire.t / 60)} min left): cook meat and fish here`, fn: null })
    }
    return out
  }
  // DayZ: no map until you find one, and a paper map does not show where you are; a GPS does (and the minimap)
  navAccess(s) { const inv = s?.inv; return { map: !!(inv && (inv.count('map') || inv.count('gps'))), gps: !!inv?.count('gps') } }
  // matches, from the inventory: a campfire in front of you (not in water, not in a vehicle)
  lightFire(s) {
    const g = this.g
    if (s.vehicle || !s.onGround || waterLevel(s.pos.x, s.pos.z) > s.pos.y - 0.3) { g.hud.note('You cannot light a fire here'); return false }
    if (!s.inv.use('matches')) return false
    const x = s.pos.x + Math.sin(s.yaw) * 1.4, z = s.pos.z + Math.cos(s.yaw) * 1.4
    ;(this.fires || (this.fires = [])).push({ x, z, y: heightAt(x, z), t: 240, fx: 0 })
    g.hud.note('The fire catches. Stand by it to cook (F).'); g.sfx.ui('click')
    return true
  }
  cook(s, from, to, what) {
    let n = 0
    while (s.inv.count(from)) { s.inv.use(from); if (!s.inv.add({ kind: 'food', id: to })) break; n++ }
    this.g.hud.note(`Cooked ${n} ${what}`, C.gold2); this.g.sfx.ui('pickup')
  }
  firesUpdate(dt) {
    const g = this.g
    for (const f of this.fires || []) {
      f.t -= dt; f.fx -= dt
      if (f.fx <= 0) { f.fx = 0.22; g.fx.burn(f.x + (Math.random() - 0.5) * 0.4, f.y + 0.25, f.z + (Math.random() - 0.5) * 0.4, 0.45) }
    }
    if (this.fires) this.fires = this.fires.filter(f => f.t > 0)
  }
  onKill(sol, killer) {
    super.onKill(sol, killer)
    if (sol.isPlayer) { this.g.save.data.survival = null; this.g.save.store(); this.diedAfter = this.days() }
  }
  // ---- death: the survivor is gone ----
  respawnOptions() { return [{ id: 'new', label: 'Start again', sub: `You lasted ${this.diedAfter || this.days()} and killed ${this.kills}. A new survivor washes up.` }] }
  respawn() {
    const g = this.g
    for (const pl of this.piles) g.engine.world.remove(pl.mesh)
    g.start('survival', {})
  }
  persist() {
    const g = this.g, s = g.player?.s
    if (!s || s.dead) return
    g.save.data.survival = { x: Math.round(s.pos.x), z: Math.round(s.pos.z), yaw: +s.yaw.toFixed(2), hour: +g.sky.hour.toFixed(2), weather: g.sky.weatherKey, inv: s.inv.toJSON(), hunger: +this.hunger.toFixed(3), thirst: +this.thirst.toFixed(3), blood: Math.round(s.blood), alive: Math.round(this.alive), kills: this.kills }
    g.save.store()
  }
  dispose() { this.persist(); for (const pl of this.piles) this.g.engine.world.remove(pl.mesh); for (const site of this.sites || []) this.g.engine.world.remove(site.mesh) }
  // ---- HUD ----
  hudKey() { return [this.g.player?.s.inv.count('map'), this.g.player?.s.inv.count('gps'), Math.round(this.noise(this.g.player?.s) / 4), this.inf.filter(n => n.chase && !n.s.dead).length, Math.round(this.hunger * 40), Math.round(this.thirst * 40), Math.floor(this.alive / 60), this.kills, Math.floor(this.g.sky.hour * 4), nearestPlace(this.g.player?.s.pos.x || 0, this.g.player?.s.pos.z || 0).place?.id].join() }
  drawHud(c, p, k) {
    const g = this.g, s = g.player.s, { place, d } = nearestPlace(s.pos.x, s.pos.z)
    const h = g.sky.hour, hh = String(Math.floor(h)).padStart(2, '0'), mm = String(Math.floor((h % 1) * 60)).padStart(2, '0')
    this.panelTitle(c, k, `SURVIVAL  ·  ${d < 0 ? place.name : d < 600 ? 'Near ' + place.name : 'Wilderness'}`, `${hh}:${mm}  ${WEATHER[g.sky.weatherKey]?.name || ''}    alive ${this.days()}    killed ${this.kills}`)
    let y = 54 * k
    for (const [label, v, col] of [['FOOD', this.hunger, '#e0a526'], ['WATER', this.thirst, '#5ab0ff']]) {
      text(c, label, 10 * k, y + 8 * k, { size: 10 * k, weight: 700, color: C.dim, shadow: true }); bar(c, 58 * k, y, 120 * k, 8 * k, v, v < 0.2 ? C.red : col); y += 14 * k
    }
    // how loud you are, and whether anything is after you
    const nz = this.noise(s), chasing = this.inf.filter(n => n.chase && !n.s.dead).length
    text(c, 'NOISE', 10 * k, y + 8 * k, { size: 10 * k, weight: 700, color: C.dim, shadow: true }); bar(c, 58 * k, y, 120 * k, 8 * k, Math.min(1, nz / 24), nz > 15 ? C.red : nz > 5 ? C.amber : C.green, { segments: 0 }); y += 14 * k
    const nv = this.navAccess(s)
    text(c, `MAP ${nv.map ? '✓' : '✗'}   GPS ${nv.gps ? '✓' : '✗'}`, 186 * k, 54 * k + 8 * k, { size: 10 * k, weight: 700, color: nv.map ? C.dim : C.amber, shadow: true })
    if (chasing) text(c, `${chasing} INFECTED AFTER YOU`, 10 * k, y + 9 * k, { size: 10.5 * k, weight: 800, color: C.red, shadow: true })
  }
}
