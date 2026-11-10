// Things you carry and store: ores from the rock, ingots from the refinery, parts from the assembler.
// Ores and ingots are counted in kilograms, parts one by one. Every block is built from a list of parts, in
// order (the first is what a frame needs), and gives them back when it is cut apart.

// kg: mass of one unit (a kilogram for ores and ingots); L: litres one unit takes up
export const ITEMS = {
  ore_stone: { name: 'Stone', kind: 'ore', kg: 1, L: 0.37, col: '#8a8580' },
  ore_iron: { name: 'Iron Ore', kind: 'ore', kg: 1, L: 0.37, col: '#a0705a' },
  ore_nickel: { name: 'Nickel Ore', kind: 'ore', kg: 1, L: 0.37, col: '#a8a890' },
  ore_silicon: { name: 'Silicon Ore', kind: 'ore', kg: 1, L: 0.37, col: '#b0b0bc' },
  ore_cobalt: { name: 'Cobalt Ore', kind: 'ore', kg: 1, L: 0.37, col: '#5870a8' },
  ore_magnesium: { name: 'Magnesium Ore', kind: 'ore', kg: 1, L: 0.37, col: '#b0a0c0' },
  ore_silver: { name: 'Silver Ore', kind: 'ore', kg: 1, L: 0.37, col: '#c8ccd4' },
  ore_gold: { name: 'Gold Ore', kind: 'ore', kg: 1, L: 0.37, col: '#d0a040' },
  ore_uranium: { name: 'Uranium Ore', kind: 'ore', kg: 1, L: 0.37, col: '#70a060' },
  ore_platinum: { name: 'Platinum Ore', kind: 'ore', kg: 1, L: 0.37, col: '#dcdee4' },
  ore_ice: { name: 'Ice', kind: 'ore', kg: 1, L: 0.37, col: '#c8e8ff' },
  ing_gravel: { name: 'Gravel', kind: 'ingot', kg: 1, L: 0.37, col: '#8a8580' },
  ing_iron: { name: 'Iron Ingot', kind: 'ingot', kg: 1, L: 0.127, col: '#9aa0a8' },
  ing_nickel: { name: 'Nickel Ingot', kind: 'ingot', kg: 1, L: 0.112, col: '#b8b8a0' },
  ing_silicon: { name: 'Silicon Wafer', kind: 'ingot', kg: 1, L: 0.429, col: '#c0c4d0' },
  ing_cobalt: { name: 'Cobalt Ingot', kind: 'ingot', kg: 1, L: 0.112, col: '#6080c0' },
  ing_magnesium: { name: 'Magnesium Powder', kind: 'ingot', kg: 1, L: 0.575, col: '#c0b0d0' },
  ing_silver: { name: 'Silver Ingot', kind: 'ingot', kg: 1, L: 0.095, col: '#dde0e8' },
  ing_gold: { name: 'Gold Ingot', kind: 'ingot', kg: 1, L: 0.052, col: '#e8b850' },
  ing_uranium: { name: 'Uranium Ingot', kind: 'ingot', kg: 1, L: 0.052, col: '#80c070' },
  ing_platinum: { name: 'Platinum Ingot', kind: 'ingot', kg: 1, L: 0.047, col: '#e8eaee' },
  // parts: recipe in ingot kg, build time in seconds at an assembler
  plate: { name: 'Steel Plate', kind: 'part', kg: 20, L: 3, recipe: { ing_iron: 21 }, t: 1 },
  interior: { name: 'Interior Plate', kind: 'part', kg: 3, L: 5, recipe: { ing_iron: 3 }, t: 1 },
  construct: { name: 'Construction Part', kind: 'part', kg: 8, L: 2, recipe: { ing_iron: 8 }, t: 1, basic: true },
  girder: { name: 'Girder', kind: 'part', kg: 6, L: 2, recipe: { ing_iron: 6 }, t: 1, basic: true },
  tube_s: { name: 'Small Tube', kind: 'part', kg: 4, L: 2, recipe: { ing_iron: 5 }, t: 1, basic: true },
  tube_l: { name: 'Large Tube', kind: 'part', kg: 25, L: 38, recipe: { ing_iron: 30 }, t: 2 },
  grid: { name: 'Metal Grid', kind: 'part', kg: 6, L: 15, recipe: { ing_iron: 12, ing_nickel: 5, ing_cobalt: 3 }, t: 2 },
  motor: { name: 'Motor', kind: 'part', kg: 24, L: 8, recipe: { ing_iron: 20, ing_nickel: 5 }, t: 2, basic: true },
  computer: { name: 'Computer', kind: 'part', kg: 0.2, L: 1, recipe: { ing_iron: 0.5, ing_silicon: 0.2 }, t: 1, basic: true },
  display: { name: 'Display', kind: 'part', kg: 8, L: 6, recipe: { ing_iron: 1, ing_silicon: 5 }, t: 1 },
  glass: { name: 'Armoured Glass', kind: 'part', kg: 4, L: 8, recipe: { ing_silicon: 15 }, t: 1 },
  cell: { name: 'Power Cell', kind: 'part', kg: 25, L: 40, recipe: { ing_iron: 10, ing_nickel: 2, ing_silicon: 1 }, t: 2 },
  solarcell: { name: 'Solar Cell', kind: 'part', kg: 6, L: 12, recipe: { ing_nickel: 3, ing_silicon: 6 }, t: 2 },
  thrust: { name: 'Thruster Part', kind: 'part', kg: 40, L: 10, recipe: { ing_iron: 30, ing_cobalt: 10, ing_gold: 1, ing_platinum: 0.4 }, t: 4 },
  supercon: { name: 'Superconductor', kind: 'part', kg: 15, L: 8, recipe: { ing_iron: 10, ing_gold: 2 }, t: 3 },
  reactor: { name: 'Reactor Part', kind: 'part', kg: 25, L: 8, recipe: { ing_iron: 15, ing_silver: 5 }, t: 3 },
  gravity: { name: 'Gravity Part', kind: 'part', kg: 800, L: 200, recipe: { ing_silver: 5, ing_gold: 10, ing_cobalt: 220, ing_iron: 600 }, t: 8 },
  detector: { name: 'Detector Part', kind: 'part', kg: 5, L: 6, recipe: { ing_iron: 5, ing_nickel: 15 }, t: 2 },
  radio: { name: 'Radio Part', kind: 'part', kg: 8, L: 70, recipe: { ing_iron: 8, ing_silicon: 1 }, t: 2 },
  medical: { name: 'Medical Part', kind: 'part', kg: 150, L: 160, recipe: { ing_iron: 60, ing_nickel: 70, ing_silver: 20 }, t: 4 },
}
export const PART_LIST = Object.keys(ITEMS).filter(k => ITEMS[k].kind === 'part')
// what a kilogram of ore gives at a refinery (the survival kit refines only the first few, slowly)
export const REFINE = {
  ore_stone: { ing_gravel: 0.014, ing_iron: 0.03, ing_nickel: 0.0024, ing_silicon: 0.004 },
  ore_iron: { ing_iron: 0.7 }, ore_nickel: { ing_nickel: 0.4 }, ore_silicon: { ing_silicon: 0.7 }, ore_cobalt: { ing_cobalt: 0.3 },
  ore_magnesium: { ing_magnesium: 0.007 }, ore_silver: { ing_silver: 0.1 }, ore_gold: { ing_gold: 0.01 },
  ore_uranium: { ing_uranium: 0.01 }, ore_platinum: { ing_platinum: 0.005 },
}
export const BASIC_REFINE = new Set(['ore_stone', 'ore_iron', 'ore_nickel', 'ore_silicon'])
export const GAS = { ice_h2: 1000, ice_o2: 500 }   // litres of gas per kg of ice

// ---- what each block is built from (large grid; small grid scales down) ----
const R = {
  light: [['plate', 25]], heavy: [['plate', 150], ['grid', 50]],
  window: [['girder', 6], ['glass', 10]], window_slope: [['girder', 8], ['glass', 12]],
  cockpit: [['interior', 20], ['construct', 20], ['motor', 2], ['display', 8], ['computer', 100], ['glass', 60]],
  canopy: [['interior', 10], ['construct', 20], ['motor', 1], ['display', 4], ['computer', 20], ['glass', 10]],
  seat: [['interior', 20], ['construct', 20], ['display', 4], ['computer', 20]],
  gyro: [['plate', 600], ['construct', 40], ['tube_l', 4], ['grid', 50], ['motor', 4], ['computer', 5]],
  battery: [['plate', 80], ['construct', 30], ['cell', 80], ['computer', 25]],
  core_small: [['plate', 80], ['construct', 40], ['grid', 4], ['tube_l', 8], ['reactor', 100], ['motor', 6], ['computer', 25]],
  core_big: [['plate', 1000], ['construct', 70], ['grid', 40], ['tube_l', 40], ['supercon', 100], ['reactor', 2000], ['motor', 20], ['computer', 75]],
  solar: [['plate', 4], ['construct', 14], ['girder', 12], ['computer', 4], ['solarcell', 32], ['glass', 4]],
  cargo_s: [['interior', 40], ['construct', 40], ['grid', 4], ['motor', 4], ['display', 1], ['computer', 2]],
  cargo_l: [['interior', 360], ['construct', 80], ['grid', 24], ['tube_s', 60], ['motor', 20], ['display', 1], ['computer', 8]],
  medbay: [['interior', 240], ['construct', 80], ['grid', 60], ['tube_s', 20], ['tube_l', 5], ['display', 10], ['computer', 10], ['medical', 15]],
  beacon: [['plate', 80], ['construct', 30], ['tube_l', 20], ['computer', 10], ['radio', 40]],
  antenna: [['plate', 80], ['construct', 40], ['tube_s', 60], ['tube_l', 40], ['computer', 8], ['radio', 40]],
  gravgen: [['plate', 150], ['construct', 60], ['gravity', 6], ['tube_l', 4], ['motor', 6], ['computer', 40]],
  jumpdrive: [['plate', 60], ['construct', 40], ['grid', 50], ['gravity', 20], ['detector', 20], ['cell', 120], ['supercon', 1000], ['computer', 300]],
  gear: [['plate', 150], ['construct', 20], ['motor', 6]],
  connector: [['plate', 150], ['construct', 40], ['tube_s', 12], ['motor', 8], ['computer', 20]],
  conveyor: [['interior', 20], ['construct', 30], ['tube_s', 20], ['motor', 6]],
  duct: [['interior', 14], ['construct', 20], ['tube_s', 12], ['motor', 6]],
  catwalk: [['construct', 16], ['girder', 4], ['tube_s', 20]], stairs: [['interior', 50], ['construct', 20]],
  door: [['interior', 10], ['construct', 40], ['tube_s', 4], ['motor', 4], ['display', 1], ['computer', 2], ['plate', 8]],
  passage: [['interior', 74], ['construct', 20], ['tube_s', 48]], girder: [['construct', 4], ['girder', 8]],
  lamp: [['construct', 2]], flood: [['interior', 6], ['construct', 8], ['glass', 2]],
  thr_atmo_small: [['plate', 60], ['construct', 50], ['tube_l', 8], ['tube_s', 10], ['motor', 50], ['grid', 8]],
  thr_atmo_big: [['plate', 230], ['construct', 60], ['tube_l', 50], ['tube_s', 40], ['motor', 1100], ['grid', 40]],
  thr_ion_small: [['plate', 25], ['construct', 60], ['tube_l', 8], ['thrust', 80]],
  thr_ion_big: [['plate', 150], ['construct', 100], ['tube_l', 40], ['thrust', 960]],
  thr_h2_small: [['plate', 25], ['construct', 60], ['tube_l', 8], ['grid', 40]],
  thr_h2_big: [['plate', 150], ['construct', 180], ['tube_l', 250], ['grid', 250]],
  survival_kit: [['plate', 30], ['construct', 2], ['tube_s', 2], ['motor', 4], ['display', 1], ['computer', 5], ['medical', 3]],
  refinery: [['plate', 1200], ['construct', 40], ['tube_l', 20], ['motor', 16], ['grid', 20], ['computer', 20]],
  assembler: [['plate', 140], ['construct', 80], ['motor', 20], ['display', 10], ['grid', 10], ['computer', 160]],
  o2h2: [['plate', 120], ['construct', 5], ['tube_l', 2], ['motor', 4], ['computer', 5]],
  tank_h2: [['plate', 280], ['tube_l', 80], ['tube_s', 60], ['computer', 8], ['construct', 40]],
  tank_o2: [['plate', 80], ['tube_l', 40], ['tube_s', 60], ['computer', 8], ['construct', 40]],
  drill: [['plate', 300], ['construct', 40], ['tube_l', 12], ['motor', 5], ['computer', 5]],
  crusher: [['plate', 420], ['construct', 60], ['tube_l', 16], ['motor', 12], ['grid', 30], ['computer', 5]],
  detector: [['plate', 50], ['construct', 40], ['motor', 5], ['computer', 25], ['detector', 20]],
  turbine: [['interior', 40], ['motor', 8], ['construct', 20], ['girder', 24], ['computer', 2]],
  dish: [['plate', 60], ['construct', 40], ['tube_s', 40], ['tube_l', 20], ['computer', 12], ['radio', 60]],
  ramp: [['plate', 12], ['girder', 4]], porthole: [['plate', 16], ['glass', 6]], skylight: [['girder', 4], ['glass', 8]], wall: [['interior', 12], ['construct', 4]],
  pillar: [['plate', 8], ['girder', 6]], railing: [['girder', 4], ['tube_s', 4]], ladder: [['tube_s', 8]], bed: [['interior', 20], ['construct', 10]],
  console: [['interior', 10], ['construct', 10], ['display', 4], ['computer', 20]], locker: [['interior', 20], ['construct', 10]], table: [['interior', 8], ['tube_s', 4]],
  sign: [['interior', 4], ['display', 6], ['computer', 4]], blastdoor: [['plate', 140], ['grid', 40], ['construct', 40], ['motor', 8], ['computer', 4]],
  hangar: [['plate', 30], ['construct', 20], ['tube_s', 10], ['motor', 4]], lightstrip: [['construct', 2], ['interior', 1]], lightpanel: [['construct', 4], ['interior', 4]], warnlight: [['construct', 2], ['computer', 1]],
  hull_hazard: [['plate', 25]], hull_vent: [['plate', 22], ['tube_s', 4]], hull_grate: [['plate', 25]], hull_tech: [['plate', 20], ['interior', 6]],
}
// small-grid blocks need about a twelfth as many of each (and at least one)
export function blockRecipe(def, size) {
  const id = def.id, base = def.armor ? (def.group === 'heavy' ? R.heavy : R.light) : R[id]
  let r = base || [['construct', 10], ['plate', 10], ['computer', 2]]
  const frac = def.armor ? Math.min(1, def.mass.large / (def.group === 'heavy' ? 3300 : 500)) : 1
  if (def.armor) r = r.map(([k, n]) => [k, Math.max(1, Math.round(n * frac))])
  if (size === 'small') r = r.map(([k, n]) => [k, Math.max(1, Math.round(n / (def.armor ? 25 : 12)))])
  return r
}
export function recipeTotal(r) { return r.reduce((s, [, n]) => s + n, 0) }

// ---- inventories ----
export class Inventory {
  constructor(L = 400) { this.max = L; this.items = new Map() }
  get volume() { let v = 0; for (const [k, n] of this.items) v += n * ITEMS[k].L; return v }
  get mass() { let m = 0; for (const [k, n] of this.items) m += n * ITEMS[k].kg; return m }
  free() { return this.max - this.volume }
  count(id) { return this.items.get(id) || 0 }
  // adds what fits; returns how much went in
  add(id, n) {
    if (n <= 0) return 0
    const it = ITEMS[id], room = this.free() / it.L
    let put = Math.min(n, room)
    if (it.kind === 'part') put = Math.floor(put + 1e-9)
    if (put <= 0) return 0
    this.items.set(id, (this.items.get(id) || 0) + put)
    return put
  }
  take(id, n) {
    const have = this.items.get(id) || 0, t = Math.min(have, n)
    if (t <= 0) return 0
    if (have - t < 1e-6) this.items.delete(id); else this.items.set(id, have - t)
    return t
  }
  list() { return [...this.items.entries()].sort((a, b) => ITEMS[a[0]].kind.localeCompare(ITEMS[b[0]].kind) || ITEMS[a[0]].name.localeCompare(ITEMS[b[0]].name)) }
  toJSON() { return [...this.items.entries()] }
}
export const fmtAmount = (id, n) => ITEMS[id].kind === 'part' ? `${Math.round(n)}` : n >= 1000 ? `${(n / 1000).toFixed(2)} t` : n >= 10 ? `${Math.round(n)} kg` : `${n.toFixed(2)} kg`
