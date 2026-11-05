// Life: Varden after the war. You are a civilian with a home in Kaldor, a little money and an empty fridge.
// Townspeople walk the streets, live in the houses (knock and talk) and keep the shops: a general store, a
// café, a chemist, a clothes shop, a hardware store, the fuel station and a car dealer, each with its own
// counter (buy and sell). Earn a living driving the city bus, delivering parcels or driving a taxi. Eat and
// drink or you weaken; sleep at home; your things, money and vehicles are kept in your save.
// Nobody here is a soldier and nothing here is multiplayer: the townspeople are the game's own characters.
import * as THREE from 'three'
import { Mode, nearestPlace, onRoad } from './base.js'
import { CIVIL } from './freeroam.js'
import { PLACES } from '../../world/blueprint.js'
import { BUILDINGS, isBuilt } from '../../world/places.js'
import { heightAt, waterLevel, roadLines, roadAt } from '../../world/heightfield.js'
import { Inventory, ITEMS, CLOTHING, itemName } from '../inventory.js'
import { Panel, C, FONT, text, bar, chip } from '../../ui/ui.js'
import { VEHICLES } from '../../vehicles/vehicle-data.js'
import { WEATHER } from '../../world/sky.js'

const FIRST = ['Anna', 'Boris', 'Clara', 'Dmitri', 'Elena', 'Filip', 'Greta', 'Hugo', 'Ines', 'Jakob', 'Katja', 'Lev', 'Mila', 'Nikolai', 'Olga', 'Pavel', 'Rosa', 'Stefan', 'Tamara', 'Viktor', 'Wanda', 'Yara', 'Zora', 'Emil', 'Lena', 'Marko', 'Nadia', 'Oskar', 'Petra', 'Ruben']
const LAST = ['Adler', 'Berg', 'Corvin', 'Dorn', 'Esk', 'Falk', 'Halden', 'Ivanek', 'Jorn', 'Kessler', 'Lind', 'Morava', 'Novak', 'Orlov', 'Pell', 'Rask', 'Sorel', 'Tovar', 'Vance', 'Weller']
// clothes colours (shirts, trousers)
const SHIRTS = [[0.85, 0.85, 0.82], [0.25, 0.35, 0.6], [0.6, 0.18, 0.15], [0.3, 0.5, 0.35], [0.82, 0.68, 0.3], [0.35, 0.35, 0.38], [0.55, 0.4, 0.6], [0.9, 0.55, 0.3], [0.2, 0.22, 0.25], [0.5, 0.7, 0.8]]
const PANTS = [[0.2, 0.25, 0.4], [0.25, 0.25, 0.27], [0.45, 0.38, 0.28], [0.15, 0.15, 0.16], [0.55, 0.5, 0.42], [0.3, 0.33, 0.45]]
// what each piece of clothing looks like on you
const WEAR_COLOR = { tshirt: [0.85, 0.85, 0.82], hoodie: [0.38, 0.4, 0.44], shirt: [0.55, 0.7, 0.85], jacket: [0.3, 0.2, 0.14], workjacket: [0.95, 0.75, 0.1], suit: [0.16, 0.17, 0.2], fieldjacket: [0.36, 0.42, 0.25], combatshirt: [0.36, 0.42, 0.25] }
const PANTS_COLOR = { jeans: [0.2, 0.27, 0.45], chinos: [0.6, 0.52, 0.38], shorts: [0.45, 0.42, 0.35], workpants: [0.3, 0.3, 0.28], cargopants: [0.36, 0.38, 0.28], combatpants: [0.36, 0.42, 0.25] }

// The counters. price in dollars; a shop buys back what it sells at 40%.
export const SHOPS = {
  grocer: { name: 'General store', hours: [7, 21], greet: 'Fresh bread came in this morning.', items: { sandwich: 6, apple: 2, water: 3, soda: 4, hotmeal: 14, ration: 9, canteen: 12 }, buys: ['fish', 'venison'] },
  cafe: { name: 'Café', hours: [7, 23], greet: 'Coffee? It is the only thing that kept us going through the war.', items: { coffee: 3, sandwich: 6, hotmeal: 12, soda: 4, water: 3 } },
  chemist: { name: 'Chemist', hours: [8, 20], greet: 'Take care of yourself out there.', items: { bandage: 4, firstaid: 22, morphine: 12, splint: 10, medkit: 75 } },
  clothes: { name: 'Clothes shop', hours: [9, 19], greet: 'New season, old stock. Have a look.', clothing: { tshirt: 12, shirt: 25, hoodie: 30, jacket: 90, suit: 140, workjacket: 35, jeans: 30, chinos: 35, shorts: 15, workpants: 40, beanie: 10, sunglasses: 20, sneakers: 45, daypack: 40, assaultpack: 75 } },
  hardware: { name: 'Hardware & outdoor', hours: [8, 18], greet: 'If it is broken, I have something for it.', items: { repairkit: 55, jerrycan: 30, binoculars: 70, fishingrod: 40, canteen: 12 }, buys: ['fish'] },
  fuel: { name: 'Fuel station', greet: 'Pump is working again. Cash only.', items: { jerrycan: 32, water: 3, soda: 4, sandwich: 7, coffee: 3 }, refuel: true },
  dealer: { name: 'Car dealer', hours: [9, 18], greet: 'Every one of these survived the war. Mostly.', cars: { scooter: 350, hatch: 900, quad: 800, motorbike: 1100, buggy: 1400, sedan: 1600, minivan: 2000, pickup: 2200, van: 2600, muscle: 6500, sports: 9500 } },
}
const SHOP_KINDS = ['grocer', 'cafe', 'clothes', 'chemist', 'hardware']
const LINES = {
  morning: ['Morning! The bakery on the corner opens at seven.', 'Another quiet morning. I could get used to that.', 'Have you had breakfast? You look hungry.'],
  day: ['They say the bus runs again. Driver wanted, I heard.', 'My cousin got a job delivering parcels. Pays well enough.', 'Nice to hear birds instead of guns.', 'Watch the traffic, people drive like it is still a war.', 'The car dealer by the warehouses has a red sports car. Imagine.'],
  evening: ['Getting late. You should head home.', 'The café does a good hot meal in the evening.', 'Lights are back on in half the city. Progress.'],
  night: ['Do you know what time it is?', 'Go home and sleep, friend.', 'Shh, the children are asleep.'],
  rain: ['Bring an umbrella next time.', 'Good weather for the farmers, at least.'],
}
const JOBS = {
  bus: { name: 'Bus driver', desc: 'Drive the city bus round five stops. $30 a stop, $40 bonus for the round.', vehicle: 'bus' },
  delivery: { name: 'Parcel delivery', desc: 'Load three parcels into the van and deliver them to the doors. $45 each.', vehicle: 'van' },
  taxi: { name: 'Taxi driver', desc: 'Pick up the fare and drive them where they want to go. Paid by the distance.', vehicle: 'taxi' },
  fire: { name: 'Firefighter', desc: 'Drive the fire engine to the burning building and hose it down (near the engine). $120 a fire, faster is better.', vehicle: 'firetruck' },
}
const DAY = 24 * 60          // seconds of play in a game day at the sky's speed (only used for needs)
const money = n => '$' + Math.round(n).toLocaleString('en-US')

export class Life extends Mode {
  get name() { return 'Life' }
  setup() {
    const g = this.g, save = g.save.data.life
    const resume = this.opts.resume && save
    this.money = resume ? save.money ?? 150 : 150
    this.hunger = resume ? save.hunger ?? 0.8 : 0.8      // 1 full .. 0 starving
    this.thirst = resume ? save.thirst ?? 0.8 : 0.8
    this.owned = resume ? save.owned || [] : []
    this.stash = resume ? save.stash || [] : [{ kind: 'food', id: 'sandwich', count: 2 }, { kind: 'water', id: 'water', count: 2 }, { kind: 'clothing', id: 'hoodie' }]
    this.earned = resume ? save.earned || 0 : 0
    this.npcs = []; this.cars = []; this.traffic = []
    this.housed = new Set(); this.shopsDone = new Set(); this.townsDone = new Set()
    this.tick = 0; this.saveT = 30; this.warnT = 0
    this.job = null; this.fishT = 0
    g.difficulty = 0
    g.sky.cycle = true
    g.sky.hour = resume ? save.hour ?? 8 : 8
    g.sky.setWeather(resume ? save.weather || 'clear' : 'clear')
    // home: a house near the middle of Kaldor (the nearest one to the city's first spawn point)
    const city = PLACES.find(p => p.id === 'kaldor') || PLACES[0]
    const sp = this.spawnPoints(city.id)[0] || { x: city.x, z: city.z }
    let best = null, bd = Infinity
    for (const b of BUILDINGS) if (b.type === 'house' || (b.type === 'apartment' && !b.shop && !b.police && !b.command && b.style !== 'military')) { const d = Math.hypot(b.x - sp.x, b.z - sp.z) * (b.type === 'house' ? 0.7 : 1); if (d < bd && d < 900) { bd = d; best = b } }
    this.homeB = best
    this.home = best ? this.local(best, 0, best.d / 2 + 2.2) : { x: sp.x, z: sp.z, y: heightAt(sp.x, sp.z) }
    this.homeIn = best ? this.local(best, 0, best.d / 2 - 1.6, 0.3) : this.home
    // you
    const x = resume ? save.x ?? this.home.x : this.home.x, z = resume ? save.z ?? this.home.z : this.home.z
    const inv = resume && save.inv ? Inventory.from(save.inv) : this.starterInv()
    const s = g.spawnPlayer({ faction: 'civ', role: 'rifleman', x, z, yaw: resume ? save.yaw || 0 : (best?.yaw ?? 0), inv, allowDown: false, name: 'You' })
    this.dress(s)
    // your vehicles wait outside home
    for (const [i, type] of this.owned.entries()) this.parkOwned(type, i)
    this.update(0, true)
    g.hud.note(resume ? `Welcome back. ${money(this.money)} in your wallet.` : 'LIFE: your home is behind you. Find work, eat, sleep, explore. F talks, shops, works.', C.gold2)
    if (!resume) g.hud.radio('Neighbour', 'Morning! The job centre is the café counter these days: ask any shopkeeper about work.')
  }
  // (local testing) stand in front of the next shopkeeper, or a given kind of shop
  dbgVisit(kind) {
    const g = this.g, s = g.player.s
    const list = this.npcs.filter(n => n.kind === 'merchant' && (kind ? n.shop === kind : n.shop !== 'dealer')).sort((a, b) => a.s.pos.distanceTo(s.pos) - b.s.pos.distanceTo(s.pos))
    if (!list.length) return
    this.dbgI = ((this.dbgI ?? -1) + 1) % Math.min(6, list.length)
    const n = list[this.dbgI], a = n.s.yaw
    const x = n.s.pos.x + Math.sin(a) * 1.6, z = n.s.pos.z + Math.cos(a) * 1.6
    g.preload(x, z)
    s.pos.set(x, n.s.pos.y + 0.1, z); s.vel.set(0, 0, 0)
    s.yaw = a + Math.PI; g.player.pitch = -0.1
    g.p0.log('dbg visit', n.shop, n.name, Math.round(n.s.pos.x), Math.round(n.s.pos.y), Math.round(n.s.pos.z), 'me', Math.round(s.pos.x), Math.round(s.pos.y), Math.round(s.pos.z))
  }
  // (local testing) stand on the nearest shore, facing the water
  dbgShore() {
    const g = this.g, s = g.player.s
    for (let r = 20; r < 3000; r += 20) for (let k = 0; k < 48; k++) {
      const a = k / 48 * Math.PI * 2, x = s.pos.x + Math.cos(a) * r, z = s.pos.z + Math.sin(a) * r
      if (waterLevel(x, z) > heightAt(x, z) + 0.3) continue
      for (let q = 0; q < 8; q++) {
        const b = q / 8 * Math.PI * 2, fx = x + Math.sin(b) * 3, fz = z + Math.cos(b) * 3
        if (waterLevel(fx, fz) > heightAt(fx, fz) + 0.3 && !isBuilt(x, z, 0.5)) { g.preload(x, z); s.pos.set(x, heightAt(x, z), z); s.vel.set(0, 0, 0); s.yaw = b; g.p0.log('dbg shore', Math.round(x), Math.round(z)); return }
      }
    }
  }
  // (local testing) take a job and sit in its vehicle; then each call puts the vehicle at the next stop
  dbgJob(kind) {
    const g = this.g, s = g.player.s
    if (!this.job) { this.startJob(kind, null); if (this.job && g.vehicles.enter(s, this.job.v, 'driver')) g.vcontrol.entered(this.job.v); return }
    const j = this.job, t = j.kind === 'taxi' && j.i === 0 && j.fare ? { x: j.fare.s.pos.x + 4, z: j.fare.s.pos.z } : j.stops[j.i]
    if (!t) return
    const v = j.v
    v.pos.set(t.x, heightAt(t.x, t.z) + 0.5, t.z); v.vel.set(0, 0, 0); v.speed = 0; v.throttle = 0
    g.preload(t.x, t.z)
    g.p0.log('dbg job', j.kind, 'stop', j.i, 'of', j.stops.length, 'riders', (j.riders || []).length, 'fare', !!j.fare, 'money', Math.round(this.money))
  }
  dispose() { this.persist(); this.closeUI(); for (const m of this.beacons || []) this.g.engine.world.remove(m) }
  // a point in a building's own frame (x along its width, z to its front), on its floor
  local(b, lx, lz, dy = 0) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw)
    const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c
    return { x, z, y: (b.y ?? heightAt(x, z)) + dy }
  }
  starterInv() {
    const inv = new Inventory()
    inv.wear('tshirt'); inv.wear('jeans'); inv.wear('sneakers')
    inv.add({ kind: 'food', id: 'sandwich' }); inv.add({ kind: 'water', id: 'water' })
    inv.add({ kind: 'med', id: 'bandage', count: 2 })
    return inv
  }
  // you look like what you wear
  dress(s) {
    s.plain = true; s.noVest = true; s.unarmed = !s.w
    s.uniform = WEAR_COLOR[s.inv.worn.shirt] || [0.7, 0.6, 0.5]
    s.pants = PANTS_COLOR[s.inv.worn.pants] || [0.25, 0.25, 0.27]
    s.headgear = s.inv.worn.head ? 'cap' : 'none'
    s.helmetColor = s.inv.worn.head === 'beanie' ? [0.6, 0.15, 0.12] : [0.3, 0.3, 0.32]
    s.pack = !!s.inv.worn.backpack
  }
  parkOwned(type, i) {
    const g = this.g, a = (this.homeB?.yaw ?? 0) + Math.PI / 2
    const x = this.home.x + Math.sin(a) * (6 + i * 5), z = this.home.z + Math.cos(a) * (6 + i * 5)
    const v = this.park(type, x, z, a, { search: 30 })
    if (v) { v.owned = true; this.cars.push(v) }
    return v
  }
  // ---- townspeople ----
  person(x, z, o = {}) {
    const g = this.g, r = Math.random
    const inv = new Inventory(); inv.wear('tshirt'); inv.wear('jeans')
    const name = o.name || `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`
    const s = g.addSoldier({ faction: 'civ', role: 'rifleman', x, z, y: o.y, yaw: r() * 6.28, inv, name, team: 'civ' })
    s.plain = true; s.noVest = true; s.unarmed = true; s.pack = false
    s.uniform = SHIRTS[Math.floor(r() * SHIRTS.length)]; s.pants = PANTS[Math.floor(r() * PANTS.length)]
    s.headgear = r() < 0.25 ? 'cap' : 'none'; s.helmetColor = SHIRTS[Math.floor(r() * SHIRTS.length)]
    const n = { s, kind: o.kind || 'walker', home: { x, z, y: o.y }, target: null, wait: r() * 4, shop: o.shop || null, name, radius: o.radius ?? 40, b: o.b || null }
    this.npcs.push(n)
    return n
  }
  remove(n) {
    const g = this.g
    if (n.s.vehicle) g.vehicles.exit(n.s, true)
    const i = g.soldiers.indexOf(n.s); if (i >= 0) g.soldiers.splice(i, 1)
    const j = this.npcs.indexOf(n); if (j >= 0) this.npcs.splice(j, 1)
  }
  // Each town near you comes alive once: people in the streets, a resident in some houses, the shopkeepers
  populate(px, pz) {
    const g = this.g
    for (const p of PLACES) {
      if (!['city', 'town', 'village'].includes(p.kind)) continue
      const d = Math.hypot(p.x - px, p.z - pz)
      if (d < p.r + 500 && !this.townsDone.has(p.id)) {
        this.townsDone.add(p.id)
        this.parkCars(p)
        // traffic: a few cars driving round the streets
        const nTraffic = p.kind === 'city' ? 3 : p.kind === 'town' ? 1 : 0
        for (let i = 0; i < nTraffic; i++) this.addTraffic(p, i)
        // the car dealer: in front of the largest warehouse (or by the road at the edge of the city)
        if (p.kind === 'city' || p.kind === 'town') {
          const wh = BUILDINGS.filter(b => b.place === p.id && (b.type === 'warehouse' || b.type === 'parking')).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]
          if (wh && p.kind === 'city') { const q = this.local(wh, 0, wh.d / 2 + 4); this.person(q.x, q.z, { kind: 'merchant', shop: 'dealer', radius: 2, name: `${FIRST[(wh.seed || 3) % FIRST.length]} the dealer` }) }
        }
      }
      if (d > p.r + 1400 && this.townsDone.has(p.id)) {
        this.townsDone.delete(p.id)
        for (const n of [...this.npcs]) if (n.town === p.id) this.remove(n)
      }
    }
    // people round you: walkers on the streets, residents and shopkeepers in the buildings within 140 m
    const { place, d } = nearestPlace(px, pz)
    if (place && d < 50 && ['city', 'town', 'village'].includes(place.kind)) {
      // busy by day, a few night owls after ten
      const h = this.g.sky.hour, busy = h >= 22 || h < 6 ? 0.2 : h < 8 || h >= 20 ? 0.55 : 1
      const want = Math.round((place.kind === 'city' ? 14 : place.kind === 'town' ? 8 : 4) * busy)
      const walkers = this.npcs.filter(n => n.kind === 'walker' && !n.s.dead).length
      for (let i = walkers, tries = 0; i < want && tries < 30; tries++) {
        const a = Math.random() * Math.PI * 2, r = 25 + Math.random() * 90
        const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r
        if (!this.sidewalk(x, z)) continue
        const n = this.person(x, z); n.town = place.id; i++
      }
      // as it gets late, people go home: one at a time, out of your sight (more than 50 m off)
      if (walkers > want) { const n = this.npcs.find(n => n.kind === 'walker' && !n.s.dead && Math.hypot(n.s.pos.x - px, n.s.pos.z - pz) > 50); if (n) this.remove(n) }
    }
    for (const [bi, b] of BUILDINGS.entries()) {
      if (Math.abs(b.x - px) > 140 || Math.abs(b.z - pz) > 140) continue
      const dist = Math.hypot(b.x - px, b.z - pz)
      if (dist > 140) continue
      const shop = this.shopOf(b, bi)
      if (shop && !this.shopsDone.has(bi)) {
        this.shopsDone.add(bi)
        const q = this.local(b, b.type === 'fuel' ? 0 : 0, b.type === 'fuel' ? 0 : b.d / 2 - 1.8, 0.3)
        const n = this.person(q.x, q.z, { kind: 'merchant', shop, radius: 1.5, y: q.y, b })
        n.town = b.place; n.s.yaw = b.yaw
      } else if (!shop && (b.type === 'house' || (b.type === 'apartment' && !b.shop)) && b !== this.homeB && !this.housed.has(bi) && dist < 100) {
        this.housed.add(bi)
        if ((bi * 7919) % 10 < 5) {
          const q = this.local(b, ((bi % 3) - 1) * 1.2, b.d / 2 - 2.2, 0.3)
          const n = this.person(q.x, q.z, { kind: 'resident', radius: 2.5, y: q.y, b })
          n.town = b.place
        }
      }
    }
    // the far ones go
    for (const n of [...this.npcs]) {
      const far = Math.hypot(n.s.pos.x - px, n.s.pos.z - pz)
      if ((n.kind === 'walker' && far > 260) || (n.kind !== 'walker' && n.kind !== 'driver' && far > 320 && n.shop !== 'dealer')) {
        if (n.kind === 'merchant' && n.b) this.shopsDone.delete(BUILDINGS.indexOf(n.b))
        if (n.kind === 'resident' && n.b) this.housed.delete(BUILDINGS.indexOf(n.b))
        if (!n.passenger) this.remove(n)
      }
    }
  }
  // which shop a building holds (shops, shop fronts on apartment blocks, fuel stations), the same every time
  shopOf(b, i) {
    if (b.type === 'fuel') return 'fuel'
    if (b.type === 'shop' || (b.type === 'apartment' && b.shop)) return SHOP_KINDS[(i * 31 + 7) % SHOP_KINDS.length]
    return null
  }
  // on a street or its pavement
  sidewalk(x, z) { const r = roadAt(x, z); return !!r && r.d > r.w / 2 + 0.4 && r.d < r.w / 2 + 3.2 && !isBuilt(x, z, 0.5) }
  parkCars(p) {
    const n = p.kind === 'city' ? 8 : p.kind === 'town' ? 4 : 2
    let placed = 0
    for (let i = 0; i < 80 && placed < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * p.r * 0.8
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r
      if (!onRoad(x, z)) continue
      const L = CIVIL[p.kind]; if (this.park(L[placed % L.length], x, z, Math.random() * 6.28, { search: 6 })) placed++
    }
  }
  // a car driven by a townsperson up and down a street of the town
  addTraffic(p, i) {
    const g = this.g
    const lines = roadLines.filter(L => L.pts.some(q => Math.hypot(q[0] - p.x, q[1] - p.z) < p.r * 0.8))
    if (!lines.length) return
    const L = lines[(i * 3 + 1) % lines.length]
    const inside = L.pts.filter(q => Math.hypot(q[0] - p.x, q[1] - p.z) < p.r * 0.9)
    if (inside.length < 6) return
    const step = Math.max(1, Math.floor(inside.length / 6)), route = []
    for (let k = 0; k < inside.length; k += step) route.push(new THREE.Vector3(inside[k][0], inside[k][2] ?? heightAt(inside[k][0], inside[k][1]), inside[k][1]))
    for (let k = route.length - 2; k > 0; k--) route.push(route[k].clone())
    const type = ['sedan', 'hatch', 'taxi', 'van', 'pickup', 'minivan', 'muscle'][(i + p.r) % 7 | 0]
    const v = this.park(type, route[0].x, route[0].z, 0, { search: 10 })
    if (!v) return
    v.speedLimit = 11
    const q = g.ai.squad('civ', { team: 'civ', order: { type: 'patrol', route }, name: v.def.name })
    const n = this.person(v.pos.x, v.pos.z, { kind: 'driver' })
    n.town = p.id
    g.ai.add(n.s, q, 0.5)
    g.vehicles.enter(n.s, v, 'driver')
    q.vehicle = v
    this.traffic.push({ q, v, n })
  }
  // walking: towards a target, a pause, a new target near home (shopkeepers stay at the counter)
  walk(n, dt) {
    const s = n.s
    if (s.dead) { if (s.deadT < 3) s.step(dt, this.g.W); return }
    if (s.vehicle || s.brain) return
    const P = this.g.player?.s
    // stop and face you when you are close
    const near = P && Math.hypot(P.pos.x - s.pos.x, P.pos.z - s.pos.z) < 2.6
    if (n.wait > 0 || near) {
      n.wait -= dt
      s.input.fwd = 0
      if (near) { const want = Math.atan2(P.pos.x - s.pos.x, P.pos.z - s.pos.z); s.yaw += angleDiff(want, s.yaw) * Math.min(1, dt * 4) }
    } else {
      if (!n.target) {
        const r = n.radius
        for (let k = 0; k < 8; k++) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * r
          const x = n.home.x + Math.cos(a) * d, z = n.home.z + Math.sin(a) * d
          if (n.kind === 'walker' && !this.sidewalk(x, z) && k < 7) continue
          n.target = { x, z }; break
        }
      }
      const t = n.target
      const dx = t.x - s.pos.x, dz = t.z - s.pos.z, dd = Math.hypot(dx, dz)
      if (dd < 0.8 || (n.stuck || 0) > 3) { n.target = null; n.stuck = 0; n.wait = 2 + Math.random() * (n.kind === 'walker' ? 6 : 10); s.input.fwd = 0 }
      else {
        s.yaw += angleDiff(Math.atan2(dx, dz), s.yaw) * Math.min(1, dt * 5)
        s.input.fwd = 1; s.input.walk = true
        n.stuck = s.speed < 0.3 ? (n.stuck || 0) + dt : 0
      }
    }
    // standing still and not close to you: no need to simulate the body
    const pd = P ? Math.hypot(P.pos.x - s.pos.x, P.pos.z - s.pos.z) : 0
    if (s.input.fwd === 0 && pd > 25 && s.onGround) { s.speed = 0; s.vel.x = s.vel.z = 0; return }
    s.step(dt, this.g.W)
  }
  // ---- the loop ----
  update(dt, first = false) {
    super.update(dt)
    const g = this.g, s = g.player?.s
    if (!s) return
    for (const n of this.npcs) this.walk(n, dt)
    if (!s.dead) this.needs(dt, s)
    this.jobUpdate(dt, s)
    if (this.fishT > 0) this.fishing(dt, s)
    if (this.ui) this.uiUpdate()
    // you can't shoot what you do not carry: no weapon, empty hands
    s.unarmed = !s.w
    this.tick -= dt
    if (this.tick > 0 && !first) return
    this.tick = 1
    this.dress(s)
    this.populate(s.pos.x, s.pos.z)
    this.traffic = this.traffic.filter(t => { if (!t.v.alive || t.n.s.dead || !this.npcs.includes(t.n)) { const i = g.ai.squads.indexOf(t.q); if (i >= 0) g.ai.squads.splice(i, 1); return false } return true })
    for (const t of [...this.traffic]) if (Math.hypot(t.v.pos.x - s.pos.x, t.v.pos.z - s.pos.z) > 1600 && s.vehicle !== t.v) { g.ai.remove(t.n.s); this.remove(t.n); g.vehicles.remove(t.v); const i = g.ai.squads.indexOf(t.q); if (i >= 0) g.ai.squads.splice(i, 1); this.traffic.splice(this.traffic.indexOf(t), 1) }
    this.saveT -= 1
    if (this.saveT <= 0) { this.saveT = 30; this.persist() }
  }
  // Hunger runs out in about two game days' worth of play, thirst faster. Weak and slow when low, then hurt.
  needs(dt, s) {
    const g = this.g
    const work = s.sprint ? 2 : 1
    this.hunger = Math.max(0, this.hunger - dt / (DAY * 1.4) * work)
    this.thirst = Math.max(0, this.thirst - dt / (DAY * 0.9) * work * (g.sky.hour > 11 && g.sky.hour < 17 && g.sky.weatherKey === 'clear' ? 1.3 : 1))
    const low = Math.min(this.hunger, this.thirst)
    if (low < 0.15) s.stamina = Math.min(s.stamina, 0.25 + low * 3)
    if (low <= 0) s.blood = Math.max(1, s.blood - dt * 0.4)
    this.warnT -= dt
    if (this.warnT <= 0 && low < 0.2) { this.warnT = 60; g.hud.note(this.hunger < this.thirst ? 'You are hungry: eat something (Tab, or buy food)' : 'You are thirsty: drink something', C.amber) }
  }
  onConsume(s, def) {
    if (def.food) this.hunger = Math.min(1, this.hunger + def.food / 100)
    if (def.water) this.thirst = Math.min(1, this.thirst + def.water / 100)
  }
  onKill(sol, killer) {
    super.onKill(sol, killer)
    const g = this.g
    if (g.debug) g.p0.log('dbg civ died', sol.name, 'killer', killer?.name || '-', killer?.vehicle?.def.name || '', 'y', sol.pos.y.toFixed(1), 'vel', sol.vel.y.toFixed(1), 'blood', Math.round(sol.blood), 'parts', JSON.stringify(sol.parts))
    if (killer?.isPlayer && sol !== killer && sol.faction === 'civ') { const fine = Math.min(this.money, 250); this.money -= fine; g.hud.note(`${sol.name} is dead. The police fine you ${money(fine)}.`, C.red) }
  }
  // ---- what F does here: talk, shop, work, home, fish ----
  // What you can do here (the game's action list, nearest first)
  actions(s) {
    const g = this.g, out = []
    if (this.fishT > 0) return [{ label: 'Stop fishing', fn: () => { this.fishT = 0; g.hud.note('You reel in') } }]
    if (Math.hypot(s.pos.x - this.homeIn.x, s.pos.z - this.homeIn.z) < 2.2 || Math.hypot(s.pos.x - this.home.x, s.pos.z - this.home.z) < 2)
      out.push({ label: 'Home: sleep, stash, wardrobe', fn: () => this.openUI({ kind: 'home' }) })
    if (this.job?.kind === 'delivery') {
      const t = this.job.stops[this.job.i]
      if (t && !s.vehicle && Math.hypot(s.pos.x - t.x, s.pos.z - t.z) < 2.5)
        out.push(s.inv.count('parcel') ? { label: 'Deliver the parcel', fn: () => { s.inv.use('parcel'); this.pay(45, 'Parcel delivered'); this.job.i++; this.nextStop() } } : { label: 'Fetch a parcel from the van (Tab by the van)', fn: null })
    }
    if (this.job?.kind === 'fire' && this.job.fire && !s.vehicle) {
      const F = this.job.fire, fp = this.job.stops[0], dF = Math.hypot(s.pos.x - fp.x, s.pos.z - fp.z), dE = Math.hypot(s.pos.x - this.job.v.pos.x, s.pos.z - this.job.v.pos.z)
      if (dF < 18) out.push(dE > 30 ? { label: 'The hose does not reach: bring the engine closer', fn: null } : F.hosing ? { label: `Stop hosing (fire ${Math.max(0, Math.round(F.hp))}%)`, fn: () => { F.hosing = false } } : { label: `Hose down the fire (${Math.max(0, Math.round(F.hp))}%): stand still`, fn: () => { F.hosing = true; const b = this.local(F.b, 0, 0); s.yaw = Math.atan2(b.x - s.pos.x, b.z - s.pos.z); g.player.pitch = 0.1 } })
    }
    let best = null, bd = 2.4
    for (const n of this.npcs) { if (n.s.dead || n.s.vehicle) continue; const d = Math.hypot(n.s.pos.x - s.pos.x, n.s.pos.z - s.pos.z); if (d < bd && Math.abs(n.s.pos.y - s.pos.y) < 2) { bd = d; best = n } }
    if (best) {
      const sh = best.shop && SHOPS[best.shop], first = best.name.split(' ')[0]
      if (sh && this.isOpen(best.shop)) {
        out.push({ label: `${sh.name}: buy and sell (${first})`, fn: () => this.openUI({ kind: 'shop', shop: best.shop, npc: best }) })
        out.push({ label: `Ask ${first} for work`, fn: () => { this.openUI({ kind: 'shop', shop: best.shop, npc: best }); this.ui.tab = 'work'; this.ui.panel.dirty = true } })
      } else if (sh) out.push({ label: `${sh.name}: closed, opens at ${String(sh.hours[0]).padStart(2, '0')}:00`, fn: () => g.hud.radio(best.name, 'We are closed. Come back in the morning.') })
      out.push({ label: `Talk to ${best.name}`, fn: () => this.talk(best) })
    }
    if (s.inv.count('fishingrod') && !s.vehicle) {
      const fx = s.pos.x + Math.sin(s.yaw) * 3, fz = s.pos.z + Math.cos(s.yaw) * 3
      if (waterLevel(fx, fz) > heightAt(fx, fz) + 0.3) out.push({ label: 'Fish', fn: () => { this.fishT = 8 + Math.random() * 10; g.hud.note('You cast the line. Wait for a bite...') } })
    }
    return out
  }
  fishing(dt, s) {
    this.fishT -= dt
    if (s.speed > 0.5 || s.vehicle) { this.fishT = 0; this.g.hud.note('The fish got away'); return }
    if (this.fishT <= 0) {
      if (Math.random() < 0.7) { if (s.inv.add({ kind: 'food', id: 'fish' })) this.g.hud.note('You caught a fish! Eat it or sell it at the general store.', C.gold2); else this.g.hud.note('A fish, but no room to carry it') }
      else this.g.hud.note('Nothing bit this time')
    }
  }
  // opening hours (the fuel station never closes)
  isOpen(kind) { const H = SHOPS[kind]?.hours, h = this.g.sky.hour; return !H || (h >= H[0] && h < H[1]) }
  talk(n) {
    const g = this.g, h = g.sky.hour
    const set = g.sky.weatherKey !== 'clear' && Math.random() < 0.4 ? LINES.rain : h < 6 || h > 22 ? LINES.night : h < 10 ? LINES.morning : h > 18 ? LINES.evening : LINES.day
    let line = set[Math.floor(Math.random() * set.length)]
    if (n.kind === 'resident') line = (h < 6 || h > 22 ? '(through the door) ' : '') + line
    g.hud.radio(n.name, line)
  }
  pay(n, why) { if (this.g.debug) this.g.p0.log('dbg pay', Math.round(n), why); this.money += n; this.earned += n; this.g.hud.note(`${why}: +${money(n)}  (${money(this.money)})`, C.gold2); this.g.sfx.ui('pickup') }
  // ---- jobs ----
  startJob(kind, npc) {
    const g = this.g, s = g.player.s, J = JOBS[kind]
    if (this.job) this.endJob(false)
    const base = npc?.s.pos || s.pos
    // the work vehicle, at the kerb
    const v = this.park(J.vehicle, base.x + 8, base.z + 8, s.yaw, { search: 90 })
    if (!v) { g.hud.note('No room for the work vehicle here: try a wider street'); return }
    v.work = true
    const job = { kind, v, i: 0, stops: [], start: { x: v.pos.x, z: v.pos.z } }
    const { place } = nearestPlace(base.x, base.z)
    if (kind === 'bus') job.stops = this.roadStops(place, 5, 160)
    if (kind === 'delivery') {
      const houses = BUILDINGS.filter(b => b.place === place?.id && (b.type === 'house' || b.type === 'apartment') && b !== this.homeB).sort(() => Math.random() - 0.5).slice(0, 3)
      job.stops = houses.map(b => this.local(b, 0, b.d / 2 + 1.2))
      const store = g.vehicleStore(v)
      store.items.length = 0
      for (let i = 0; i < job.stops.length; i++) store.items.push({ kind: 'cargo', id: 'parcel' })
    }
    if (kind === 'taxi') job.stops = []
    if (kind === 'fire') {
      // a house or shop somewhere in the place (not yours), at least 120 m from the station
      const B = BUILDINGS.filter(b => b.place === place?.id && (b.type === 'house' || b.type === 'shop' || b.type === 'apartment') && b !== this.homeB && Math.hypot(b.x - v.pos.x, b.z - v.pos.z) > 120)
      const b = B[Math.floor(Math.random() * B.length)]
      if (b) { const f = this.local(b, 0, b.d / 2 + 4); job.fire = { b, hp: 100, t0: g.time, h: Math.max(3, (b.floors || 1) * 3) }; job.stops = [f] }
    }
    if ((kind === 'bus' || kind === 'delivery' || kind === 'fire') && !job.stops.length) { g.vehicles.remove(v); g.hud.note('No work in this place right now'); return }
    this.job = job
    if (kind === 'taxi') this.newFare()
    g.hud.radio(npc?.name || 'Dispatch', kind === 'bus' ? 'The bus is outside. Five stops: stop by each marker and let the passengers on and off.' : kind === 'delivery' ? `The van is outside with ${job.stops.length} parcels. Take one from the van (Tab beside it) and bring it to the door.` : kind === 'fire' ? 'Fire reported! The engine is outside: get to the marker, park near the building and hose it down.' : 'Your taxi is outside. A fare is waiting: follow the marker.')
    this.nextStop()
  }
  roadStops(place, n, gap) {
    const out = []
    if (!place) return out
    for (let k = 0; k < 400 && out.length < n; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * place.r * 0.85
      const x = place.x + Math.cos(a) * r, z = place.z + Math.sin(a) * r
      if (!onRoad(x, z)) continue
      if (out.some(o => Math.hypot(o.x - x, o.z - z) < gap)) continue
      out.push({ x, z, y: heightAt(x, z) })
    }
    // a round in a sensible order: each time the nearest next stop
    const ordered = [out.shift()].filter(Boolean)
    while (out.length) { const L = ordered[ordered.length - 1]; out.sort((a, b) => Math.hypot(a.x - L.x, a.z - L.z) - Math.hypot(b.x - L.x, b.z - L.z)); ordered.push(out.shift()) }
    return ordered
  }
  newFare() {
    const g = this.g, j = this.job, s = g.player.s
    const { place } = nearestPlace(s.pos.x, s.pos.z)
    const two = this.roadStops(place, 2, 300)
    if (two.length < 2) { g.hud.note('No fares here: drive into a town'); return }
    j.stops = two; j.i = 0
    const n = this.person(two[0].x + 2, two[0].z + 2, { kind: 'fare', radius: 0.5 })
    j.fare = n; n.passenger = true
  }
  nextStop() {
    const j = this.job
    if (!j) return
    this.beacon(j.stops[j.i] || null)
    if (j.i >= j.stops.length && j.kind !== 'taxi') {
      if (j.kind === 'bus') this.pay(40, 'Round finished, bonus')
      this.g.hud.radio('Dispatch', 'Good work. Bring the vehicle back or keep going: ask again for another round.')
      this.endJob(true)
    }
  }
  endJob(done) {
    const g = this.g, j = this.job
    if (!j) return
    if (j.fare) { if (j.fare.s.vehicle) g.vehicles.exit(j.fare.s, true); this.remove(j.fare) }
    for (const p of j.riders || []) { if (p.s.vehicle) g.vehicles.exit(p.s, true); this.remove(p) }
    // the work vehicle goes back to the depot when you are not in it
    if (j.v?.alive && g.player.s.vehicle !== j.v) g.vehicles.remove(j.v)
    else if (j.v) j.v.work = false
    this.job = null
    this.beacon(null)
    g.sfx.stopLoop('jobfire')
    if (!done) g.hud.note('Job ended')
  }
  jobUpdate(dt, s) {
    const j = this.job, g = this.g
    if (!j) return
    if (!j.v.alive) { g.hud.note('The work vehicle is wrecked. Job lost.', C.red); this.endJob(false); return }
    if (j.kind === 'fire' && j.fire) this.fireUpdate(dt, s, j)
    const t = j.stops[j.i]
    if (!t) return
    const d = Math.hypot(j.v.pos.x - t.x, j.v.pos.z - t.z)
    if (j.kind === 'bus') {
      if (s.vehicle === j.v && d < 14 && Math.abs(j.v.speed) < 1.5) {
        j.dwell = (j.dwell || 0) + dt
        if (j.dwell > 0.1 && !j.boarded) {
          j.boarded = true
          // the ones who rode here get off; a few get on
          j.riders = j.riders || []
          for (const p of [...j.riders]) if (Math.random() < 0.6) { g.vehicles.exit(p.s, true); p.passenger = false; p.kind = 'walker'; p.home = { x: p.s.pos.x, z: p.s.pos.z }; j.riders.splice(j.riders.indexOf(p), 1) }
          const on = 1 + Math.floor(Math.random() * 3)
          for (let k = 0; k < on; k++) { const p = this.person(t.x + 2, t.z + 2, { kind: 'fare' }); p.passenger = true; if (g.vehicles.enter(p.s, j.v, 'passenger')) j.riders.push(p); else this.remove(p) }
          g.hud.note(`Stop ${j.i + 1} of ${j.stops.length}: passengers boarding...`)
        }
        if (j.dwell > 3) { j.dwell = 0; j.boarded = false; this.pay(30, `Stop ${j.i + 1}`); j.i++; this.nextStop() }
      } else j.dwell = 0
    }
    if (j.kind === 'taxi' && j.fare) {
      const f = j.fare
      if (j.i === 0 && s.vehicle === j.v && Math.hypot(j.v.pos.x - f.s.pos.x, j.v.pos.z - f.s.pos.z) < 10 && Math.abs(j.v.speed) < 1.5) {
        if (g.vehicles.enter(f.s, j.v, 'passenger')) { j.i = 1; j.pickup = { x: j.v.pos.x, z: j.v.pos.z }; g.hud.radio(f.name, 'Thanks for stopping. Take me to the marker, please.'); this.beacon(j.stops[1]) }
      } else if (j.i === 1 && s.vehicle === j.v && d < 14 && Math.abs(j.v.speed) < 1.5) {
        const fare = 10 + Math.hypot(t.x - j.pickup.x, t.z - j.pickup.z) * 0.05
        g.vehicles.exit(f.s, true); f.passenger = false; f.kind = 'walker'; f.home = { x: f.s.pos.x, z: f.s.pos.z }
        g.hud.radio(f.name, Math.random() < 0.5 ? 'Keep the change.' : 'Smooth ride. Thank you!')
        this.pay(fare, 'Fare'); j.fare = null
        this.newFare(); this.beacon(j.stops[0])
      }
    }
  }
  // The burning building: flames and smoke at its front and roof (fewer as the fire weakens), its roar
  // nearby; on foot within reach of the fire and of the engine, hosing knocks it down.
  fireUpdate(dt, s, j) {
    const g = this.g, F = j.fire, b = F.b, k = F.hp / 100
    F.fxT = (F.fxT || 0) - dt
    if (F.fxT <= 0 && k > 0) {
      F.fxT = 0.18
      const at = this.local(b, (Math.random() - 0.5) * b.w * 0.8, b.d / 2 + 0.3, 0.5 + Math.random() * F.h)
      g.fx.burn(at.x, at.y, at.z, 0.6 + k * 1.2)
      if (Math.random() < 0.5) { const r = this.local(b, (Math.random() - 0.5) * b.w * 0.6, (Math.random() - 0.5) * b.d * 0.6, F.h + 0.5); g.fx.burn(r.x, r.y, r.z, 0.8 + k * 1.6) }
    }
    const fp = j.stops[0], dFire = Math.hypot(s.pos.x - fp.x, s.pos.z - fp.z)
    g.sfx.loop('jobfire', 'loop_fire', k > 0 ? Math.max(0, 0.6 * k * (1 - dFire / 120)) : 0)
    if (F.hosing) {
      const dEng = Math.hypot(s.pos.x - j.v.pos.x, s.pos.z - j.v.pos.z)
      if (s.vehicle || dFire > 18 || dEng > 30 || s.speed > 1.2) { F.hosing = false; g.hud.note(dEng > 30 ? 'The hose does not reach: stay near the engine' : 'You stop hosing') }
      else {
        F.hp -= dt * 9
        // the water: a stream of white spray from your hands towards the flames
        const tx = fp.x - s.pos.x, tz = fp.z - s.pos.z, L = Math.hypot(tx, tz) || 1
        for (let i = 0; i < 3; i++) g.fx.puff(s.pos.x + tx / L * 0.8, s.pos.y + 1.3, s.pos.z + tz / L * 0.8, { vx: tx / L * 15 + (Math.random() - 0.5) * 1.5, vy: 3.5 + Math.random() * 1.5, vz: tz / L * 15 + (Math.random() - 0.5) * 1.5, s0: 0.2, s1: 1.8, life: 1.0, r: 0.88, g: 0.93, b: 1, a: 0.6, drag: 0.5 })
        if (Math.random() < dt * 6) g.fx.puff(fp.x + (Math.random() - 0.5) * 4, fp.y + 1 + Math.random() * 3, fp.z + (Math.random() - 0.5) * 4, { vx: 0, vy: 1.5, vz: 0, s0: 1, s1: 4, life: 3, r: 0.9, g: 0.9, b: 0.9, a: 0.45, drag: 0.4 })   // steam
        if (F.hp <= 0) {
          F.hosing = false
          const mins = (g.time - F.t0) / 60, bonus = Math.max(0, Math.round(60 - mins * 12))
          this.pay(120 + bonus, bonus ? `Fire out (quick work, +${money(bonus)})` : 'Fire out')
          g.hud.radio('Dispatch', 'Fire is out. Good job. Bring the engine back or ask again for the next call.')
          j.fire = null; g.sfx.stopLoop('jobfire'); j.i++; this.nextStop()
        }
      }
    }
  }
  // a tall column of light over the next stop
  beacon(t) {
    const g = this.g
    if (!this.beam) {
      this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }))
      this.beacons = [this.beam]
      g.engine.world.add(this.beam)
    }
    this.beam.visible = !!t
    if (t) this.beam.position.set(t.x, (t.y ?? heightAt(t.x, t.z)) + 30, t.z)
  }
  markers() {
    const out = []
    const t = this.job?.stops[this.job.i]
    if (t) out.push({ x: t.x, z: t.z, color: C.gold2 })
    out.push({ x: this.home.x, z: this.home.z, color: '#7fc7ff' })
    return out
  }
  objectives() {
    const out = [{ x: this.home.x, z: this.home.z, color: '#7fc7ff', label: 'Home' }]
    const t = this.job?.stops[this.job.i]
    if (t) out.push({ x: t.x, z: t.z, color: '#ffc94a', label: JOBS[this.job.kind].name })
    return out
  }
  // ---- death: you wake up at home, the hospital sends a bill ----
  respawnOptions() { return [{ id: 'home', label: 'Wake up at home', sub: `The hospital bill: ${money(Math.min(this.money, 100))}` }] }
  respawn() {
    const g = this.g, old = g.player.s
    if (this.job) this.endJob(false)
    const bill = Math.min(this.money, 100); this.money -= bill
    const inv = old.inv
    const s = g.replacePlayer({ faction: 'civ', role: 'rifleman', x: this.home.x, z: this.home.z, yaw: this.homeB?.yaw || 0, inv, allowDown: false, name: 'You' })
    old.inv = new Inventory()
    this.hunger = Math.max(this.hunger, 0.5); this.thirst = Math.max(this.thirst, 0.5)
    this.dress(s)
    g.hud.note(`You wake up at home. Hospital bill ${money(bill)}.`)
  }
  persist() {
    const g = this.g, s = g.player?.s
    if (!s || s.dead) return
    g.save.data.life = { money: Math.round(this.money), hunger: +this.hunger.toFixed(3), thirst: +this.thirst.toFixed(3), x: Math.round(s.pos.x), z: Math.round(s.pos.z), yaw: +s.yaw.toFixed(2), hour: +g.sky.hour.toFixed(2), weather: g.sky.weatherKey, inv: s.inv.toJSON(), stash: this.stash.slice(0, 40), owned: this.owned.slice(0, 6), earned: Math.round(this.earned) }
    g.save.store()
  }
  // ---- HUD ----
  hudKey() {
    const s = this.g.player?.s; if (!s) return ''
    const t = this.job?.stops[this.job.i]
    return [Math.round(this.money), Math.round(this.hunger * 40), Math.round(this.thirst * 40), Math.floor(this.g.sky.hour * 4), this.job?.kind, this.job?.i, t ? Math.round(Math.hypot(t.x - s.pos.x, t.z - s.pos.z) / 10) : 0, nearestPlace(s.pos.x, s.pos.z).place?.id].join()
  }
  drawHud(c, p, k) {
    const g = this.g, s = g.player.s
    const { place, d } = nearestPlace(s.pos.x, s.pos.z)
    const h = g.sky.hour, hh = String(Math.floor(h)).padStart(2, '0'), mm = String(Math.floor((h % 1) * 60)).padStart(2, '0')
    this.panelTitle(c, k, `LIFE  ·  ${d < 0 ? place.name : d < 600 ? 'Near ' + place.name : 'Countryside'}`, `${hh}:${mm}  ${WEATHER[g.sky.weatherKey]?.name || ''}    ${money(this.money)}`)
    let y = 54 * k
    for (const [label, v, col] of [['FOOD', this.hunger, '#e0a526'], ['WATER', this.thirst, '#5ab0ff']]) {
      text(c, label, 10 * k, y + 8 * k, { size: 10 * k, weight: 700, color: C.dim, shadow: true })
      bar(c, 58 * k, y, 120 * k, 8 * k, v, v < 0.2 ? C.red : col)
      y += 14 * k
    }
    const j = this.job, t = j?.stops[j.i]
    if (j) text(c, `${JOBS[j.kind].name}${t ? `  ·  ${j.kind === 'taxi' ? (j.i === 0 ? 'pick up' : 'drop off') : `stop ${j.i + 1}/${j.stops.length}`}  ${Math.round(Math.hypot(t.x - s.pos.x, t.z - s.pos.z))} m` : ''}`, 10 * k, y + 10 * k, { size: 12 * k, weight: 700, color: C.gold2, shadow: true })
  }
  // ---- the counter / home screen ----
  get uiOpen() { return !!this.ui?.panel.visible }
  openUI(o) {
    const g = this.g
    if (!this.ui) { this.ui = { panel: g.ui.add(new Panel(g.ui, 0, 0, 10, 10, (c, p) => this.drawUI(c, p), { modal: true, order: 12 })), tab: 'buy' }; }
    Object.assign(this.ui, o, { tab: o.kind === 'home' ? 'home' : 'buy', scroll: 0, openT: g.time })
    const e = g.engine, t = g.input.touch, safe = t ? 60 : 0
    this.ui.panel.place(0, safe, e.width, e.height - safe); this.ui.k = t ? Math.max(0.72, Math.min(1.15, Math.min(e.width, e.height - safe) / 640)) : Math.max(0.8, Math.min(1.25, e.height / 760))
    this.ui.panel.show(true); this.ui.panel.dirty = true
    g.p0.input.unlockPointer()
    if (o.kind === 'shop') g.hud.radio(o.npc.name, SHOPS[o.shop].greet)
  }
  closeUI() {
    const g = this.g
    if (!this.ui?.panel.visible) return
    this.ui.panel.show(false)
    if (g.state === 'play' && !g.input.touch && !g.menus.visible) g.p0.input.lockPointer()
  }
  uiUpdate() {
    const g = this.g, U = this.ui
    if (!U.panel.visible) return
    if (g.time - U.openT > 0.25 && (g.input.hit('inventory') || g.input.hit('interact') || g.input.hit('pause'))) { this.closeUI(); g.input.pressed.clear() }
    const s = g.player.s
    if (U.npc && Math.hypot(U.npc.s.pos.x - s.pos.x, U.npc.s.pos.z - s.pos.z) > 4) this.closeUI()
    const key = [Math.round(this.money), s.inv.all().length, s.inv.weight().toFixed(1), this.stash.length, U.tab].join()
    if (key !== U.key) { U.key = key; U.panel.dirty = true }
  }
  drawUI(c, p) {
    const g = this.g, U = this.ui, k = U.k, W = p.w, H = p.h, s = g.player.s
    c.fillStyle = 'rgba(8,10,7,0.86)'; c.fillRect(0, 0, W, H)
    const title = U.kind === 'home' ? 'HOME' : SHOPS[U.shop].name.toUpperCase()
    text(c, title, 24 * k, 38 * k, { size: 24 * k, weight: 900 })
    text(c, `Wallet ${money(this.money)}`, 24 * k, 60 * k, { size: 14 * k, weight: 700, color: C.gold2 })
    p.button(c, 'close', W - 130 * k, 14 * k, 110 * k, 36 * k, g.input.touch ? 'CLOSE' : 'CLOSE [F]', () => this.closeUI(), { align: 'center', font: FONT(13 * k, 700) })
    const tabs = U.kind === 'home' ? [['home', 'HOME'], ['stash', 'STASH']] : [['buy', 'BUY'], ['sell', 'SELL'], ['work', 'ASK FOR WORK']]
    let x = 24 * k
    for (const [id, label] of tabs) { p.button(c, 'tab' + id, x, 74 * k, 150 * k, 32 * k, label, () => { U.tab = id; U.panel.dirty = true }, { align: 'center', selected: U.tab === id, font: FONT(12.5 * k, 700) }); x += 158 * k }
    const nCars = U.tab === 'buy' && U.kind !== 'home' ? Object.keys(SHOPS[U.shop]?.cars || {}).length : 0
    const colW = Math.min(W - 48 * k, 560 * k), x0 = 24 * k, rowH = nCars ? Math.max(26 * k, Math.min(34 * k, (H - 136 * k) / nCars)) : 34 * k
    let y = 120 * k
    const row = (id, label, sub, price, fn, o = {}) => {
      if (y + rowH > H - 8 * k) return
      p.button(c, id, x0, y, colW, rowH - 4 * k, label, fn, { font: FONT(13 * k, 600), disabled: !fn, ...o })
      if (sub) text(c, sub, x0 + colW * 0.52, y + 19 * k, { size: 11 * k, color: C.dim })
      if (price != null) text(c, price, x0 + colW - 10 * k, y + 19 * k, { size: 13 * k, weight: 700, align: 'right', color: fn ? C.gold2 : C.dim })
      y += rowH
    }
    if (U.tab === 'buy') {
      const sh = SHOPS[U.shop]
      for (const [id, pr] of Object.entries(sh.items || {})) row('b' + id, ITEMS[id].name, ITEMS[id].food ? `food +${ITEMS[id].food}` : ITEMS[id].water ? `drink +${ITEMS[id].water}` : '', money(pr), this.money >= pr ? () => this.buy({ kind: ITEMS[id].kind, id }, pr) : null)
      for (const [id, pr] of Object.entries(sh.clothing || {})) row('c' + id, CLOTHING[id].name, CLOTHING[id].cap ? `+${CLOTHING[id].cap} space` : CLOTHING[id].slot, money(pr), this.money >= pr ? () => this.buy({ kind: 'clothing', id }, pr) : null)
      for (const [id, pr] of Object.entries(sh.cars || {})) row('v' + id, VEHICLES[id].name, `${VEHICLES[id].cls}${this.owned.includes(id) ? ' · you own one' : ''}`, money(pr), this.money >= pr ? () => this.buyCar(id, pr) : null)
      if (sh.refuel) {
        const v = g.vehicles.nearest(s.pos, 12)
        const need = v ? Math.max(0, v.maxFuel - v.fuel) : 0, pr = Math.ceil(need * 0.5)
        row('refuel', v ? `Fill up the ${v.def.name}` : 'Fill up (bring a vehicle to the pumps)', v ? `${Math.round(v.fuel)} / ${Math.round(v.maxFuel)}` : '', v && need > 0.5 ? money(pr) : '', v && need > 0.5 && this.money >= pr ? () => { this.money -= pr; v.fuel = v.maxFuel; g.hud.note(`Tank full: ${money(pr)}`); U.panel.dirty = true } : null)
      }
    } else if (U.tab === 'sell') {
      const sh = SHOPS[U.shop], prices = { ...(sh.items || {}), ...(sh.clothing || {}) }
      for (const id of sh.buys || []) prices[id] = prices[id] || 15 / 0.4
      const seen = new Set()
      for (const it of s.inv.all()) {
        if (!prices[it.id] || seen.has(it.id)) continue
        seen.add(it.id)
        const pr = Math.max(1, Math.floor(prices[it.id] * 0.4))
        row('s' + it.id, itemName(it), `you have ${s.inv.count(it.id)}`, money(pr), () => { s.inv.use(it.id); this.money += pr; g.sfx.ui('pickup'); U.panel.dirty = true })
      }
      if (!seen.size) text(c, 'Nothing you carry interests this shop.', x0, y + 16 * k, { size: 13 * k, color: C.dim })
    } else if (U.tab === 'work') {
      text(c, 'Work going in town:', x0, y + 10 * k, { size: 13 * k, color: C.dim }); y += 22 * k
      for (const [id, J] of Object.entries(JOBS)) row('j' + id, J.name, '', this.job?.kind === id ? 'ON SHIFT' : 'TAKE', () => { this.closeUI(); this.startJob(id, U.npc) })
      if (this.job) row('quit', `Quit the ${JOBS[this.job.kind].name.toLowerCase()} job`, '', '', () => { this.endJob(false); U.panel.dirty = true })
      y += 6 * k
      for (const J of Object.values(JOBS)) { text(c, `${J.name}: ${J.desc}`, x0, y + 10 * k, { size: 11 * k, color: C.dim, max: colW }); y += 18 * k }
    } else if (U.tab === 'home') {
      row('sleep', g.sky.hour >= 19 || g.sky.hour < 6 ? 'Sleep until morning' : 'Take a nap (3 hours)', 'Saves your game. You wake hungry.', '', () => this.sleep())
      row('save', 'Save now', '', '', () => { this.persist(); g.hud.note('Saved') })
      row('reset', U.confirm ? 'Really start over? Click again' : 'Start a new life', 'Money, things and vehicles are lost', '', () => { if (!U.confirm) { U.confirm = true; U.panel.dirty = true; return } g.save.data.life = null; g.save.store(); this.closeUI(); g.start('life', {}) })
      text(c, `Earned so far: ${money(this.earned)}    Vehicles: ${this.owned.map(t => VEHICLES[t].name).join(', ') || 'none'}`, x0, y + 14 * k, { size: 12 * k, color: C.dim }); y += 28 * k
      text(c, 'WARDROBE: change clothes from your inventory (Tab), or keep spare clothes in the stash.', x0, y + 10 * k, { size: 11 * k, color: C.dim, max: colW })
    } else if (U.tab === 'stash') {
      text(c, 'Click to move things between your pockets and your stash.', x0, y + 10 * k, { size: 12 * k, color: C.dim }); y += 22 * k
      const half = (colW - 10 * k) / 2, y0 = y
      text(c, 'YOU', x0, y + 10 * k, { size: 12 * k, weight: 800, color: C.gold }); y += 18 * k
      for (const [i, it] of s.inv.all().entries()) { if (y + 28 * k > H) break; p.button(c, 'iy' + i, x0, y, half, 26 * k, itemName(it) + (it.count > 1 ? ' x' + it.count : ''), () => { s.inv.remove(it); this.stash.push(it); U.panel.dirty = true }, { font: FONT(12 * k, 600) }); y += 29 * k }
      y = y0
      text(c, 'STASH', x0 + half + 10 * k, y + 10 * k, { size: 12 * k, weight: 800, color: C.gold }); y += 18 * k
      for (const [i, it] of this.stash.entries()) { if (y + 28 * k > H) break; p.button(c, 'is' + i, x0 + half + 10 * k, y, half, 26 * k, itemName(it) + (it.count > 1 ? ' x' + it.count : ''), () => { if (it.kind === 'clothing' ? s.inv.add(it) : s.inv.add(it)) { this.stash.splice(this.stash.indexOf(it), 1) } else g.hud.note('No room'); U.panel.dirty = true }, { font: FONT(12 * k, 600) }); y += 29 * k }
    }
  }
  buy(it, pr) {
    const g = this.g, s = g.player.s
    if (this.money < pr) return
    if (!s.inv.add({ ...it })) { g.hud.note('No room: wear a bag or leave things in your stash'); return }
    this.money -= pr; g.sfx.ui('pickup')
    g.hud.note(`Bought: ${itemName(it)}${it.kind === 'clothing' ? ' (Tab to put it on)' : ''}`)
    this.ui.panel.dirty = true
  }
  buyCar(type, pr) {
    const g = this.g, s = g.player.s
    const base = this.ui.npc?.s.pos || s.pos
    const v = this.park(type, base.x + 6, base.z + 6, s.yaw, { search: 40 })
    if (!v) { g.hud.note('No space to bring it round here'); return }
    this.money -= pr; v.owned = true; this.cars.push(v)
    if (!this.owned.includes(type)) this.owned.push(type)
    g.hud.note(`The ${v.def.name} is yours! It waits outside your home from now on.`, C.gold2); g.sfx.ui('pickup')
    this.persist(); this.ui.panel.dirty = true
  }
  sleep() {
    const g = this.g, s = g.player.s
    // at night until seven in the morning; in the day a three-hour nap
    const h = g.sky.hour, night = h >= 19 || h < 6
    const slept = night ? ((7 - h) + 24) % 24 : 3
    g.sky.hour = (h + slept) % 24
    this.hunger = Math.max(0.05, this.hunger - slept / 60); this.thirst = Math.max(0.05, this.thirst - slept / 40)
    s.stamina = 1; s.blood = Math.min(100, s.blood + 40)
    this.closeUI(); this.persist()
    g.hud.note(night ? `You sleep ${Math.round(slept)} hours. Good morning!` : 'You take a three-hour nap.', C.gold2)
  }
}
function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d }
