// Loadouts: a soldier's kit written down (weapons and their attachments, what he wears, how many magazines
// and which items), saved in six slots, edited in the Arsenal and worn when deploying in Free Roam and
// Battle. buildInventory turns one into a real inventory; whatever does not fit is counted and left out.
import { Inventory, ITEMS, CLOTHING, SLOTS, newMag, defaultAtt } from './inventory.js'
import { weapon, stats } from '../combat/weapons-data.js'

export const LOADOUT_SLOTS = 6
// what the Arsenal offers as items, by group
export const ARSENAL_ITEMS = {
  Medical: ['bandage', 'firstaid', 'medkit', 'morphine', 'splint'],
  Grenades: ['frag', 'smoke', 'flash'],
  Tools: ['binoculars', 'rangefinder', 'nvg', 'repairkit', 'jerrycan'],
  Gear: ['radio', 'c4', 'mine', 'sandbags'],
  Food: ['ration', 'canteen', 'water'],
}

export function blankLoadout() {
  return {
    weapons: { primary: { id: 'brenner', att: defaultAtt(weapon('brenner')) }, sidearm: { id: 'p17', att: {} }, launcher: null },
    worn: { head: 'helmet', shirt: 'combatshirt', pants: 'combatpants', vest: 'platecarrier', backpack: 'daypack', gloves: 'gloves', boots: 'boots' },
    mags: { primary: 6, sidearm: 2, launcher: 2 },
    items: { bandage: 3, firstaid: 1, frag: 2, smoke: 1 },
  }
}
export const copyLoadout = L => JSON.parse(JSON.stringify(L))
export function loadoutName(L) {
  const p = L.weapons.primary && weapon(L.weapons.primary.id), l = L.weapons.launcher && weapon(L.weapons.launcher.id)
  return [p?.name || 'No rifle', l?.name].filter(Boolean).join(' + ')
}

// The kit a loadout makes, and how many things did not fit
export function buildInventory(L) {
  const inv = new Inventory()
  for (const slot of SLOTS) if (L.worn?.[slot] && CLOTHING[L.worn[slot]]) inv.wear(L.worn[slot])
  let missed = 0
  for (const k of ['primary', 'launcher', 'sidearm']) {
    const w = L.weapons?.[k], def = w && weapon(w.id)
    if (!def) continue
    const st = stats(def, w.att || {})
    inv.weapons[k] = { id: def.id, att: { ...(w.att || {}) }, mag: st.mag, chamber: def.cat === 'launcher' ? 0 : 1 }
    const n = def.disposable ? 0 : (L.mags?.[k] ?? 0)
    for (let i = 0; i < n; i++) if (!inv.add(newMag(def, st))) missed++
    if (def.tube && n) inv.add({ kind: 'ammo', ammo: def.ammo, count: def.mag * 3 })
  }
  for (const [id, n] of Object.entries(L.items || {})) {
    const def = ITEMS[id]; if (!def || !(n > 0)) continue
    if (def.kind === 'med') { if (!inv.add({ kind: 'med', id, count: n })) missed += n }
    else for (let i = 0; i < n; i++) if (!inv.add({ kind: def.kind, id })) missed++
  }
  return { inv, missed, weight: inv.weight() }
}

// A loadout written from what a soldier carries now
export function loadoutFrom(inv) {
  const L = { weapons: { primary: null, sidearm: null, launcher: null }, worn: { ...inv.worn }, mags: { primary: 0, sidearm: 0, launcher: 0 }, items: {} }
  for (const k of ['primary', 'launcher', 'sidearm']) { const w = inv.weapons[k]; if (w) L.weapons[k] = { id: w.id, att: { ...(w.att || {}) } } }
  for (const it of inv.all()) {
    if (it.kind === 'mag') { for (const k of ['primary', 'launcher', 'sidearm']) { const w = L.weapons[k]; if (w && weapon(w.id).ammo === it.ammo) { L.mags[k]++; break } } }
    else if (ITEMS[it.id]) L.items[it.id] = (L.items[it.id] || 0) + (it.count || 1)
  }
  return L
}
