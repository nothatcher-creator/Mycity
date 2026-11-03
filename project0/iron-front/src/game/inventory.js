// What a soldier wears and carries. Storage comes from clothing: a T-shirt has a pocket or two, cargo
// pants add more, a vest holds magazines and grenades, a backpack holds the most. Every item has a size
// (in slots) and a weight; the total weight slows the soldier and drains stamina.
import { weapon, AMMO, stats } from '../combat/weapons-data.js'

export const CLOTHING = {
  // shirts
  tshirt: { name: 'T-shirt', slot: 'shirt', cap: 2, weight: 0.2 },
  combatshirt: { name: 'Combat shirt', slot: 'shirt', cap: 3, weight: 0.4 },
  fieldjacket: { name: 'Field jacket', slot: 'shirt', cap: 6, weight: 1.0 },
  // trousers
  jeans: { name: 'Jeans', slot: 'pants', cap: 3, weight: 0.6 },
  combatpants: { name: 'Combat trousers', slot: 'pants', cap: 5, weight: 0.7 },
  cargopants: { name: 'Cargo trousers', slot: 'pants', cap: 8, weight: 0.9 },
  // vests and armour
  chestrig: { name: 'Chest rig', slot: 'vest', cap: 12, weight: 1.2 },
  tacvest: { name: 'Tactical vest', slot: 'vest', cap: 14, armor: { torso: 2 }, weight: 4 },
  platecarrier: { name: 'Plate carrier', slot: 'vest', cap: 10, armor: { torso: 4 }, weight: 7.5 },
  heavyarmor: { name: 'Heavy armour', slot: 'vest', cap: 6, armor: { torso: 5, arms: 1 }, weight: 12 },
  // backpacks
  daypack: { name: 'Daypack', slot: 'backpack', cap: 16, weight: 0.8 },
  assaultpack: { name: 'Assault pack', slot: 'backpack', cap: 24, weight: 1.4 },
  fieldpack: { name: 'Field pack', slot: 'backpack', cap: 36, weight: 2.2 },
  rucksack: { name: 'Large rucksack', slot: 'backpack', cap: 50, weight: 3.2 },
  // heads, faces, hands, feet
  cap: { name: 'Patrol cap', slot: 'head', weight: 0.1 },
  beret: { name: 'Beret', slot: 'head', weight: 0.1 },
  helmet: { name: 'Combat helmet', slot: 'head', armor: { head: 3 }, weight: 1.4 },
  heavyhelmet: { name: 'Heavy helmet', slot: 'head', armor: { head: 4 }, weight: 2.2 },
  balaclava: { name: 'Balaclava', slot: 'face', weight: 0.1 },
  shemagh: { name: 'Shemagh', slot: 'face', weight: 0.2 },
  glasses: { name: 'Ballistic glasses', slot: 'eyes', flashResist: 0.3, weight: 0.05 },
  gloves: { name: 'Combat gloves', slot: 'gloves', sway: 0.95, weight: 0.1 },
  boots: { name: 'Combat boots', slot: 'boots', noise: 0.9, weight: 1.2 },
}
export const ITEMS = {
  bandage: { name: 'Bandage', size: 0.5, weight: 0.05, kind: 'med', heal: 0, stop: 1 },
  firstaid: { name: 'First aid kit', size: 1, weight: 0.3, kind: 'med', heal: 35, stop: 2 },
  medkit: { name: 'Medkit', size: 2, weight: 1, kind: 'med', heal: 100, stop: 9, revive: true },
  morphine: { name: 'Painkiller', size: 0.5, weight: 0.05, kind: 'med', pain: true },
  splint: { name: 'Splint', size: 1, weight: 0.2, kind: 'med', fixLeg: true },
  frag: { name: 'Frag grenade', size: 1, weight: 0.4, kind: 'grenade' },
  smoke: { name: 'Smoke grenade', size: 1, weight: 0.4, kind: 'grenade' },
  flash: { name: 'Flashbang', size: 1, weight: 0.3, kind: 'grenade' },
  ration: { name: 'Ration', size: 1, weight: 0.5, kind: 'food', food: 40 },
  canteen: { name: 'Canteen', size: 1, weight: 1, kind: 'water', water: 50 },
  binoculars: { name: 'Binoculars', size: 1, weight: 0.8, kind: 'tool', zoom: 7 },
  rangefinder: { name: 'Rangefinder', size: 1, weight: 0.6, kind: 'tool', zoom: 6, range: true },
  nvg: { name: 'Night-vision goggles', size: 1, weight: 0.6, kind: 'tool', nvg: true },
  repairkit: { name: 'Repair kit', size: 3, weight: 3, kind: 'tool', repair: 40 },
  jerrycan: { name: 'Jerrycan', size: 4, weight: 6, kind: 'tool', fuel: 0.4 },
  radio: { name: 'Field radio', size: 1, weight: 0.8, kind: 'tool', radio: true },
  mine: { name: 'AT mine', size: 3, weight: 6, kind: 'tool', mine: true },
  sandbags: { name: 'Sandbag kit', size: 4, weight: 5, kind: 'tool', fort: true },
}
// The size of things that are not plain items.
export function itemSize(it) {
  if (it.kind === 'mag') { const a = AMMO[it.ammo]; return a?.rocket || a?.explosive ? (it.ammo === '40mm' ? 1 : 5) : it.cap > 60 ? 3 : 1 }
  if (it.kind === 'ammo') return Math.ceil(it.count / 60)
  if (it.kind === 'weapon') return weapon(it.weapon)?.cat === 'pistol' ? 3 : 10
  if (it.kind === 'clothing') return 4
  return ITEMS[it.id]?.size ?? 1
}
export function itemWeight(it) {
  if (it.kind === 'mag') { const a = AMMO[it.ammo]; return (a?.mass || 10) / 1000 * it.rounds + 0.12 }
  if (it.kind === 'ammo') return (AMMO[it.ammo]?.mass || 10) / 1000 * it.count
  if (it.kind === 'weapon') return weapon(it.weapon)?.weight || 3
  if (it.kind === 'clothing') return CLOTHING[it.id]?.weight || 0.5
  return (ITEMS[it.id]?.weight ?? 0.2) * (it.count || 1)
}
export function itemName(it) {
  if (it.kind === 'mag') return `${AMMO[it.ammo]?.name || it.ammo} ${it.belt ? 'belt' : it.ammo === 'rocket' || it.ammo === 'rocket84' || it.ammo === 'atgm' || it.ammo === 'aam' ? 'round' : 'mag'} (${it.rounds}/${it.cap})`
  if (it.kind === 'ammo') return `${AMMO[it.ammo]?.name} x${it.count}`
  if (it.kind === 'weapon') return weapon(it.weapon)?.name || it.weapon
  if (it.kind === 'clothing') return CLOTHING[it.id]?.name || it.id
  return (ITEMS[it.id]?.name || it.id) + (it.count > 1 ? ` x${it.count}` : '')
}

export const SLOTS = ['head', 'face', 'eyes', 'shirt', 'pants', 'vest', 'backpack', 'gloves', 'boots']
export class Inventory {
  constructor() {
    this.worn = {}                       // slot -> clothing id
    this.weapons = { primary: null, launcher: null, sidearm: null }   // { id, att, mag (rounds), chamber }
    this.containers = { pockets: [], vest: [], backpack: [] }
    this.quick = []                      // quick-access items (key 5)
  }
  capacity(c) {
    if (c === 'pockets') return (CLOTHING[this.worn.shirt]?.cap || 1) + (CLOTHING[this.worn.pants]?.cap || 1)
    if (c === 'vest') return CLOTHING[this.worn.vest]?.cap || 0
    if (c === 'backpack') return CLOTHING[this.worn.backpack]?.cap || 0
    return 0
  }
  used(c) { return this.containers[c].reduce((s, it) => s + itemSize(it), 0) }
  free(c) { return this.capacity(c) - this.used(c) }
  // Puts an item where it fits best (vest for magazines and grenades, pockets for small things, then the pack).
  add(it, prefer = null) {
    const order = prefer ? [prefer, 'vest', 'pockets', 'backpack'] : it.kind === 'mag' || it.kind === 'grenade' ? ['vest', 'pockets', 'backpack'] : ITEMS[it.id]?.size <= 1 ? ['pockets', 'vest', 'backpack'] : ['backpack', 'vest', 'pockets']
    // stack plain items
    if (it.kind !== 'mag' && it.kind !== 'weapon' && it.kind !== 'clothing') for (const c of order) { const same = this.containers[c].find(o => o.kind === it.kind && o.id === it.id && o.ammo === it.ammo); if (same && (it.kind !== 'ammo') && this.free(c) >= itemSize(it) * 0.999) { same.count = (same.count || 1) + (it.count || 1); return c } }
    for (const c of order) if (this.free(c) >= itemSize(it) - 1e-6) { this.containers[c].push(it); return c }
    return null
  }
  remove(it) { for (const c of Object.keys(this.containers)) { const i = this.containers[c].indexOf(it); if (i >= 0) { this.containers[c].splice(i, 1); return c } } return null }
  all() { return [...this.containers.pockets, ...this.containers.vest, ...this.containers.backpack] }
  // Changing clothes: what no longer fits spills out (returned so the game can drop it on the ground).
  wear(id) {
    const def = CLOTHING[id]; if (!def) return []
    this.worn[def.slot] = id
    return this.overflow()
  }
  takeOff(slot) { const id = this.worn[slot]; delete this.worn[slot]; return { id, spilled: this.overflow() } }
  overflow() {
    const out = []
    for (const c of Object.keys(this.containers)) while (this.used(c) > this.capacity(c) + 1e-6 && this.containers[c].length) out.push(this.containers[c].pop())
    return out
  }
  armor(part) {
    let a = 0
    for (const id of Object.values(this.worn)) { const ar = CLOTHING[id]?.armor; if (ar && ar[part]) a += ar[part] }
    return a
  }
  weight() {
    let w = 0
    for (const id of Object.values(this.worn)) w += CLOTHING[id]?.weight || 0
    for (const it of this.all()) w += itemWeight(it)
    for (const wpn of Object.values(this.weapons)) if (wpn) w += stats(weapon(wpn.id), wpn.att).weight
    return w
  }
  // The fullest magazine for this weapon (same ammunition and size), out of the containers.
  takeMag(def, cap) {
    let best = null
    for (const it of this.all()) if (it.kind === 'mag' && it.ammo === def.ammo && (it.cap === cap || def.tube || def.belt === it.belt) && it.rounds > 0 && (!best || it.rounds > best.rounds)) best = it
    if (best) this.remove(best)
    return best
  }
  countAmmo(def) { let n = 0; for (const it of this.all()) if (it.kind === 'mag' && it.ammo === def.ammo) n += it.rounds; else if (it.kind === 'ammo' && it.ammo === def.ammo) n += it.count; return n }
  // One round for a tube magazine (shotguns) or a single-shot launcher, from loose ammunition or a magazine.
  takeRound(def) {
    for (const it of this.all()) if ((it.kind === 'ammo') && it.ammo === def.ammo && it.count > 0) { it.count--; if (!it.count) this.remove(it); return true }
    for (const it of this.all()) if (it.kind === 'mag' && it.ammo === def.ammo && it.rounds > 0) { it.rounds--; if (!it.rounds) this.remove(it); return true }
    return false
  }
  count(id) { return this.all().filter(i => i.id === id).reduce((s, i) => s + (i.count || 1), 0) }
  use(id) {
    for (const it of this.all()) if (it.id === id) { if ((it.count || 1) > 1) it.count--; else this.remove(it); return true }
    return false
  }
  toJSON() { return { worn: this.worn, weapons: this.weapons, containers: this.containers } }
  static from(o) { const v = new Inventory(); if (o) { Object.assign(v.worn, o.worn); Object.assign(v.weapons, o.weapons); for (const k of Object.keys(v.containers)) v.containers[k] = o.containers?.[k] || [] } return v }
}

// A magazine full for this weapon.
export function newMag(def, s = null) {
  const cap = s ? s.mag : def.mag
  return { kind: 'mag', ammo: def.ammo, rounds: cap, cap, belt: !!def.belt }
}
// A standard kit for a role: clothes, weapons, magazines, grenades, medical.
export function kit(role, faction, F, roles) {
  const inv = new Inventory()
  const irregular = F.irregular
  inv.wear(irregular ? 'tshirt' : 'combatshirt')
  inv.wear(irregular ? 'jeans' : role === 'sniper' ? 'cargopants' : 'combatpants')
  inv.wear(irregular ? 'chestrig' : role === 'mg' || role === 'autorifleman' ? 'tacvest' : role === 'sniper' ? 'chestrig' : 'platecarrier')
  inv.wear(role === 'at' || role === 'medic' || role === 'mg' || role === 'engineer' ? 'assaultpack' : irregular ? 'daypack' : 'daypack')
  if (!irregular) { inv.wear(F.headgear === 'helmet' ? 'helmet' : 'cap'); inv.wear('gloves'); inv.wear('boots') }
  const pid = F.weapons[role] || F.weapons.rifleman
  const def = weapon(pid)
  if (def.cat === 'launcher') {
    inv.weapons.launcher = { id: pid, att: {}, mag: def.mag, chamber: 0 }
    const rid = F.weapons.rifleman
    inv.weapons.primary = { id: rid, att: defaultAtt(weapon(rid)), mag: weapon(rid).mag, chamber: 1 }
  } else inv.weapons.primary = { id: pid, att: defaultAtt(def), mag: def.mag, chamber: 1 }
  if (role === 'at' && !inv.weapons.launcher) { const l = F.weapons.at; inv.weapons.launcher = { id: l, att: {}, mag: weapon(l).mag, chamber: 0 } }
  inv.weapons.sidearm = { id: F.sidearm, att: {}, mag: weapon(F.sidearm).mag, chamber: 1 }
  const prim = weapon(inv.weapons.primary.id), ps = stats(prim, inv.weapons.primary.att)
  const nMags = prim.belt ? 2 : prim.cat === 'sniper' ? 5 : prim.cat === 'lmg' || prim.cat === 'mmg' ? 3 : 6
  for (let i = 0; i < nMags; i++) inv.add(newMag(prim, ps))
  if (prim.tube) inv.add({ kind: 'ammo', ammo: prim.ammo, count: 30 })
  const side = weapon(inv.weapons.sidearm.id)
  for (let i = 0; i < 2; i++) inv.add(newMag(side))
  if (inv.weapons.launcher) { const l = weapon(inv.weapons.launcher.id); if (!l.disposable) for (let i = 0; i < (l.mag > 1 ? 2 : 2); i++) inv.add(newMag(l)) }
  const R = roles[role] || {}
  for (let i = 0; i < (R.grenades ?? 1); i++) inv.add({ kind: 'grenade', id: 'frag' })
  for (let i = 0; i < (R.smoke ?? 1); i++) inv.add({ kind: 'grenade', id: 'smoke' })
  inv.add({ kind: 'med', id: 'bandage', count: 3 })
  inv.add({ kind: 'med', id: 'firstaid', count: 1 })
  if (R.medkits) inv.add({ kind: 'med', id: 'medkit', count: R.medkits })
  if (R.repair) inv.add({ kind: 'tool', id: 'repairkit' })
  if (role === 'officer' || role === 'sniper') inv.add({ kind: 'tool', id: role === 'sniper' ? 'rangefinder' : 'binoculars' })
  inv.add({ kind: 'tool', id: 'binoculars' })
  return inv
}
export function defaultAtt(def) {
  const a = {}
  if (def.optic && def.optic !== 'iron') a.optic = def.optic
  else if (def.rails && ['rifle', 'battle', 'lmg', 'smg'].includes(def.cat)) a.optic = def.cat === 'lmg' ? 'aco2' : def.cat === 'battle' ? 'aco2' : 'rd1'
  if (def.bipod) a.under = 'bipod'
  else if (def.rails && ['rifle', 'battle', 'smg'].includes(def.cat)) a.under = 'vgrip'
  return a
}
