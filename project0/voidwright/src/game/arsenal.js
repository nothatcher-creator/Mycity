// The eighth round's designs: ships that fight (a player gunship, and the two pirate designs that come
// hunting), things that drive (a buggy, a mining rover, a tracked crawler) and two huge stations.
import { R, F, BK, UPR, DNR, LF, RT, UPSIDE, BP, Shape, skin, roof, disc } from './bpkit.js'

const FRONT = R([0, 0, -1]), BACK = R([0, 0, 1]), LEFTF = R([-1, 0, 0]), RIGHTF = R([1, 0, 0])
const glaze = (b, x, y, z, col) => {
  b.over('cockpit', x, y, z, 0, col)
  b.over('window_slope', x - 1, y, z, R([-1, 0, 0]), 1).over('window_slope', x + 1, y, z, R([1, 0, 0]), 1).over('window_slope', x, y, z - 1, R([0, 0, -1]), 1)
}

// ---- Marauder: the pirates' fighter (small grid) ----
function marauder() {
  const b = new BP('Marauder', 'small', { desc: 'Pirate fighter: two autocannons on forward-swept wings, a rocket pod under the nose.' })
  const P = 2, A = 5
  const s = new Shape()
  s.box(-2, 2, 0, 2, -7, 7, P).box(-2, 2, 0, 1, -8, -8, P).box(-1, 1, 0, 1, -10, -9, P).box(0, 0, 0, 0, -11, -11, A)
  for (let x = 3; x <= 8; x++) { const z0 = 2 - (x - 3), z1 = 6 - Math.floor((x - 3) / 2); for (let z = z0; z <= z1; z++) { s.add(x, 1, z, x >= 7 ? A : P); s.add(-x, 1, z, x >= 7 ? A : P) } }
  s.sym(2, 2, 3, 4, 5, 7, A)
  s.paint((x, y, z) => y === 2 && Math.abs(x) <= 1 && z < -2 ? A : null)
  skin(b, s, 'light', { solid: true })
  b.set('canopy', -1, 3, -6, 0, P)
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 7; z++) b.set(z === 7 ? 'light_halfslope' : 'light_panel', x, 3, z, z === 7 ? R([0, 0, 1]) : 0, P)
  // weapons
  b.set('gun_auto', 8, 1, -6, F, P).set('gun_auto', -8, 1, -6, F, P).set('gun_rocket', 0, -1, -9, F, P)
  // thrust
  for (const [x, y] of [[-1, 1], [1, 1], [-2, 0], [2, 0]]) b.set('thr_h2_small', x, y, 8, F, 2)
  b.set('thr_h2_small', -3, 0, -7, BK, 2).set('thr_h2_small', 3, 0, -7, BK, 2)
  for (const [x, z] of [[-1, -6], [1, -6], [-1, 2], [1, 2]]) b.over('thr_h2_small', x, 0, z, UPR, 2)
  b.set('thr_h2_small', -2, 3, 3, DNR, 2).set('thr_h2_small', 2, 3, 3, DNR, 2)
  b.set('thr_h2_small', -3, 1, -3, RT, 2).set('thr_h2_small', 3, 1, -3, LF, 2)
  b.over('gyro', 0, 1, 0).over('gyro', 0, 1, 1).over('gyro', 0, 2, 1).over('battery', 0, 1, 4).over('battery', 0, 2, 4).over('core_small', 0, 1, 5)
  b.over('tank_h2', -1, 3, 1, 0, 1)
  for (const [x, z] of [[-1, 2], [1, 2], [-1, 6], [1, 6]]) b.over('cargo_s', x, 1, z, 0, P)
  b.set('gear', -2, -1, -4, 0).set('gear', 1, -1, -4, 0).set('gear', -2, -1, 4, 0).set('gear', 1, -1, 4, 0)
  b.set('warnlight', 2, 5, 6, 0).set('warnlight', -2, 5, 6, 0)
  return b.bp
}

// ---- Reaver: the pirates' gunship (large grid) ----
function reaver() {
  const b = new BP('Reaver', 'large', { desc: 'Pirate gunship: two gatling turrets and two autocannons, a cargo hold for what it takes from you.' })
  const P = 2, A = 5
  const s = new Shape()
  s.box(-3, 3, 0, 3, -8, 8, P).box(-2, 2, 0, 2, -10, -9, P).box(-1, 1, 1, 2, -11, -11, A)
  s.box(-1, 1, 4, 4, -4, 6, A).sym(4, 5, 0, 2, -2, 7, P)
  s.paint((x, y, z) => y === 3 && Math.abs(x) === 3 ? A : null)
  skin(b, s, 'light', { solid: false })
  glaze(b, 0, 4, -4, P)
  b.set('turret_gatling', -1, 5, 0, 0, P).set('turret_gatling', 1, 5, 4, 0, P).set('turret_gatling', 0, -1, 0, UPSIDE, P)
  for (const x of [-4, 4, -5, 5]) b.set('gun_auto', x, 1, -5, F, P)
  for (const x of [-2, 0, 2]) for (const y of [1, 2]) b.set('thr_h2_small', x, y, 9, F, 1)
  for (const x of [-5, -4, 4, 5]) b.set('thr_h2_small', x, 1, 8, F, 1)
  for (const x of [-3, 3]) b.set('thr_h2_small', x, 1, -9, BK, 1).set('thr_h2_small', x, 2, -9, BK, 1)
  for (const [x, z] of [[-2, -6], [2, -6], [-2, -1], [2, -1], [-2, 5], [2, 5], [0, -3], [0, 3], [-4, 2], [4, 2], [-5, 5], [5, 5]]) b.over('thr_h2_small', x, 0, z, UPR, 1)
  for (const [x, z] of [[-3, -5], [3, -5], [-3, 5], [3, 5]]) b.set('thr_h2_small', x, 4, z, DNR, 1)
  b.set('thr_h2_small', -6, 1, 0, RT, 1).set('thr_h2_small', 6, 1, 0, LF, 1).set('thr_h2_small', -4, 1, -7, RT, 1).set('thr_h2_small', 4, 1, -7, LF, 1)
  for (const x of [-2, -1, 1, 2]) b.over('gyro', x, 1, -7).over('gyro', x, 2, -7)
  for (const x of [-2, 2]) b.over('core_small', x, 1, -1).over('core_small', x, 2, -1).over('battery', x, 1, 0).over('battery', x, 2, 0)
  b.over('cargo_l', -1, 1, 3, 0, P).over('tank_h2', -1, 1, -4, 0, 1)
  b.set('gear', -3, -1, -6, 0).set('gear', 3, -1, -6, 0).set('gear', -3, -1, 6, 0).set('gear', 3, -1, 6, 0)
  b.set('warnlight', -3, 4, -7, 0).set('warnlight', 3, 4, -7, 0).set('antenna', 0, 5, 6, 0)
  return b.bp
}

// ---- Warden: a gunship to fight them with (large grid) ----
function warden() {
  const b = new BP('Warden', 'large', { desc: 'Gunship: gatling and missile turrets that shoot pirates by themselves, four autocannons and two rocket launchers for the pilot, a jump drive.' })
  const P = 0, A = 6
  const s = new Shape()
  s.box(-3, 3, 0, 3, -10, 9, P).box(-2, 2, 0, 2, -13, -11, P).box(-1, 1, 0, 1, -15, -14, A)
  s.box(-2, 2, 4, 5, -6, -1, P).box(-1, 1, 4, 4, 0, 9, A).sym(4, 7, 1, 1, 0, 8, A)
  s.paint((x, y, z) => y === 1 && Math.abs(x) === 3 ? A : null)
  skin(b, s, 'light', { solid: false })
  glaze(b, 0, 5, -6, P)
  for (let x = -2; x <= 2; x++) if (x) b.over('window', x, 4, -6, FRONT, 0)
  // weapons
  b.set('turret_gatling', 0, 5, 4, 0, P).set('turret_gatling', 0, 5, 8, 0, P).set('turret_missile', 0, 6, -3, 0, P).set('turret_gatling', 0, -1, -3, UPSIDE, P)
  for (const x of [-3, 3]) b.set('gun_auto', x, 0, -13, F, P).set('gun_auto', x, 1, -13, F, P)
  b.set('gun_rocket', 6, 0, 0, F, P).set('gun_rocket', -6, 0, 0, F, P)
  // thrust
  for (const x of [-2, 0, 2]) for (const y of [1, 2]) b.set('thr_ion_small', x, y, 10, F, 1)
  for (const x of [-3, 3]) b.set('thr_h2_small', x, 1, 10, F, 1).set('thr_h2_small', x, 2, 10, F, 1)
  for (const x of [-6, 6]) b.set('thr_h2_small', x, 1, 9, F, 1)
  for (const x of [-3, 3]) b.set('thr_h2_small', x, 2, -11, BK, 1).set('thr_ion_small', x, 3, -11, BK, 1)
  for (const [x, z] of [[-2, -9], [2, -9], [-2, -4], [2, -4], [-2, 2], [2, 2], [-2, 7], [2, 7], [0, -7], [0, 5], [-5, 4], [5, 4]]) b.over('thr_h2_small', x, 0, z, UPR, 1)
  for (const [x, z] of [[-3, -9], [3, -9], [-3, 6], [3, 6]]) b.set('thr_ion_small', x, 4, z, DNR, 1)
  b.set('thr_ion_small', -8, 1, 2, RT, 1).set('thr_ion_small', 8, 1, 2, LF, 1).set('thr_ion_small', -4, 1, -9, RT, 1).set('thr_ion_small', 4, 1, -9, LF, 1)
  // inside
  b.over('jumpdrive', -1, 1, 0, 0, 0)
  for (const x of [-2, 2]) for (const z of [-8, -7, -6]) b.over('gyro', x, 1, z).over('gyro', x, 2, z)
  for (const x of [-2, 2]) b.over('core_small', x, 1, 4).over('core_small', x, 2, 4).over('battery', x, 1, 5).over('battery', x, 2, 5)
  b.over('gravgen', 0, 1, -4).over('medbay', -2, 1, -3, 0, 3).over('survival_kit', 2, 1, -3, 0, 3).over('cargo_l', -1, 1, 6, 0, P)
  b.over('tank_h2', -1, 1, -10 + 0, 0, 1)
  b.set('gear', -3, -1, -8, 0).set('gear', 3, -1, -8, 0).set('gear', -3, -1, 7, 0).set('gear', 3, -1, 7, 0)
  b.set('antenna', -1, 6, -2, 0).set('flood', 0, 0, -16, 0).set('beacon', 1, 5, 1, 0)
  return b.bp
}

// ---- Buggy: a small car, four wheels and a seat ----
function buggy() {
  const b = new BP('Buggy', 'small', { desc: 'A small car: four sprung wheels, a seat under a roll cage. W/S drive, A/D steer, dampeners are the brake.' })
  const P = 4, A = 2
  const s = new Shape()
  s.box(-3, 3, 0, 1, -6, 6, P).box(-2, 2, 0, 0, -8, -7, P).box(-2, 2, 2, 2, 3, 6, A)
  s.paint((x, y, z) => y === 1 && Math.abs(x) === 3 ? A : null)
  skin(b, s, 'light', { solid: true })
  b.set('seat', -1, 2, -2, 0, A)
  for (const z of [-5, 3]) { b.set('wheel', 4, -1, z, 0, A); b.set('wheel', -6, -1, z, 0, A) }
  b.over('battery', 0, 1, 4).over('battery', 1, 1, 4).over('core_small', -1, 1, 4).over('gyro', 0, 0, 4)
  // a roll cage
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 2], [3, 2]]) for (let y = 2; y <= 5; y++) b.set('girder', x, y, z, 0, A)
  for (let x = -2; x <= 2; x++) b.set('girder', x, 5, -3, 0, A).set('girder', x, 5, 2, 0, A)
  for (let z = -2; z <= 1; z++) b.set('girder', -3, 5, z, 0, A).set('girder', 3, 5, z, 0, A)
  b.set('flood', -2, 0, -9, 0).set('flood', 2, 0, -9, 0).set('lightstrip', 0, 3, 6, 0).set('antenna', 3, 6, 2, 0)
  return b.bp
}

// ---- Prospector: a six-wheeled mining rover with a drill on the front ----
function rover() {
  const b = new BP('Prospector', 'large', { desc: 'Mining rover: six sprung wheels, a drill on the nose (left button), a cargo hold, a cab with a cockpit.' })
  const P = 9, A = 2
  const s = new Shape()
  s.box(-1, 1, 0, 1, -3, 4, P).box(-1, 1, 2, 2, -3, -1, A)
  s.paint((x, y, z) => y === 1 && Math.abs(x) === 1 ? A : null)
  skin(b, s, 'heavy', { solid: true })
  b.over('cockpit', 0, 2, -3, 0, P).over('window', -1, 2, -3, FRONT, 0).over('window', 1, 2, -3, FRONT, 0)
  b.over('window', -1, 2, -2, R([-1, 0, 0]), 0).over('window', 1, 2, -2, R([1, 0, 0]), 0)
  for (const z of [-2, 1, 3]) b.set('wheel', 2, 0, z, 0, A).set('wheel', -2, 0, z, 0, A)
  b.set('drill', -1, 0, -6, F, A)
  b.set('cargo_l', -1, 2, 1, 0, P)
  b.over('battery', -1, 1, 0).over('battery', 1, 1, 0).over('core_small', 0, 1, 0).over('core_small', 0, 1, 1).over('gyro', 0, 1, 2)
  b.set('flood', -1, 3, -2, 0).set('flood', 1, 3, -2, 0).set('beacon', 1, 2, 4, 0).set('warnlight', -1, 3, -1, 0).set('detector', 0, 3, -2, 0)
  return b.bp
}

// ---- Crawler: a tracked machine with a turret ----
function crawler() {
  const b = new BP('Crawler', 'large', { desc: 'Tracked crawler: four track units (A/D turn it on the spot), a gatling turret on its back, an autocannon and a rocket launcher forward.' })
  const P = 8, A = 2
  const s = new Shape()
  s.box(-1, 1, 0, 1, -3, 2, P).box(-1, 1, 2, 2, -1, 1, A)
  skin(b, s, 'heavy', { solid: true })
  b.over('cockpit', 0, 1, -3, 0, P).set('window_slope', 0, 2, -3, FRONT, 1)
  for (const x of [-1, 1]) b.set('track', x, -1, -3, 0, A).set('track', x, -1, 0, 0, A)
  b.set('turret_gatling', 0, 3, 0, 0, P)
  b.set('gun_auto', 1, 1, -6, F, P).set('gun_rocket', -1, 1, -6, F, P)
  b.over('battery', -1, 1, 0).over('battery', 1, 1, 0).over('core_small', 0, 1, 0).over('core_small', 0, 0, 1).over('gyro', 0, 0, -1).over('cargo_s', 0, 0, 0, 0, P)
  b.set('flood', -1, 2, -3, 0).set('warnlight', 1, 2, 2, 0).set('antenna', -1, 3, 1, 0)
  return b.bp
}

// ---- Citadel: a ring station, its hub and four spokes ----
function citadel() {
  const b = new BP('Citadel', 'large', { static: true, desc: 'Huge ring station: a hub with docking decks, four spokes, a ring 120 m across with gravity pointing outward, solar masts.' })
  const P = 13, A = 7, D = 1
  const s = new Shape()
  for (let x = -24; x <= 24; x++) for (let z = -24; z <= 24; z++) { const r = Math.hypot(x, z); if (r > 20.6 && r < 23.6) for (let y = -1; y <= 1; y++) s.add(x, y, z, y === 1 && r > 22.6 ? A : P) }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let t = 5; t <= 21; t++) for (let a = -1; a <= 1; a++) for (let y = -1; y <= 1; y++) s.add(dx * t + dz * a, y, dz * t + dx * a, D)
  for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) if (x * x + z * z <= 26) for (let y = -4; y <= 4; y++) s.add(x, y, z, Math.abs(y) === 4 ? A : P)
  skin(b, s, 'light', { solid: false })
  // the ring's floor faces outward: gravity generators round it, each with its base to the outside
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.26, x = Math.round(Math.cos(a) * 22), z = Math.round(Math.sin(a) * 22)
    const out = Math.abs(x) > Math.abs(z) ? [Math.sign(x), 0, 0] : [0, 0, Math.sign(z)]
    b.over('gravgen', x, 0, z, R([0, 1, 0], [-out[0], 0, -out[2]]))
  }
  // windows round the outside of the ring
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2, x = Math.round(Math.cos(a) * 23), z = Math.round(Math.sin(a) * 23)
    if (Math.abs(x) < 2 || Math.abs(z) < 2) continue
    if (Math.hypot(x, z) > 22.6 && Math.abs(Math.abs(x) - 16) + Math.abs(Math.abs(z) - 16) > 0) b.over('porthole', x, 0, z, 0, P)
  }
  // the hub: decks top and bottom to land on, the machines inside, a mast
  for (const y of [5, -5]) for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) if (x * x + z * z <= 52) b.set(x * x + z * z > 40 ? 'hull_hazard' : 'hull_grate', x, y, z, 0, D)
  b.over('refinery', -2, -3, -2, 0, 1).over('assembler', 2, -3, -2, 0, 1).over('assembler', 2, -3, 0, 0, 1).over('survival_kit', -2, -3, 2, 0, 3).over('medbay', 0, -3, 2, 0, 3)
  b.over('core_big', -1, 0, -1, 0).over('cargo_s', -4, -3, -1, 0, D).over('cargo_s', -4, -3, 0, 0, D).over('cargo_s', -4, -3, 1, 0, D).over('o2h2', 3, -3, 2, 0, 1).over('tank_o2', 3, -3, -3, 0).over('tank_h2', -4 + 0, 1, -1, 0, 1)
  b.over('gravgen_sphere', 0, 3, 0, 0)
  for (let y = 6; y <= 13; y++) b.set('girder', 0, y, 0, 0, 1)
  for (const y of [8, 10, 12]) b.set('solar', 1, y, -1, 0).set('solar', -4, y, -1, 0)
  b.set('beacon', 0, 14, 0, 0).set('dish', -1, 6, 3, 0, 0).set('antenna', 5, 6, 3, 0)
  for (const [x, z] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) b.set('warnlight', x, 6, z, 0)
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b.set('lightstrip', Math.round(Math.cos(a) * 22), 2, Math.round(Math.sin(a) * 22), 0) }
  b.set('turret_gatling', 0, -6, 0, UPSIDE, P).set('turret_missile', 0, 16, 0, 0, P)
  return b.bp
}

// ---- Bulwark: a shipyard: a long spine, two building cradles, a tower, a hangar, solar wings ----
function bulwark() {
  const b = new BP('Bulwark Yard', 'large', { static: true, desc: 'Huge shipyard station: a 150 m spine, two cradles to build ships in, a control tower, a hangar, workshops, turrets.' })
  const P = 1, A = 4, W = 0
  const s = new Shape()
  s.box(-2, 2, -2, 2, -30, 30, P)
  s.box(-6, 6, -2, 4, 22, 32, A)              // the hangar block at one end
  s.box(-3, 3, 3, 4, -28, -18, P)            // the tower's base
  skin(b, s, 'light', { solid: false })
  b.bp.blocks = b.bp.blocks.filter(q => !(q[1] >= -5 && q[1] <= 5 && q[2] >= -1 && q[2] <= 3 && q[3] >= 23 && q[3] <= 31))   // the hangar hollow
  for (let x = -5; x <= 5; x++) for (let y = -1; y <= 3; y++) b.over('hangar', x, y, 32, BACK, A)
  for (let x = -5; x <= 5; x++) for (let z = 23; z <= 31; z++) b.over(Math.abs(x) === 5 ? 'hull_hazard' : 'hull_grate', x, -2, z, 0, 2)
  b.over('gravgen', 0, -1, 26).over('gravgen', 0, -1, -10).over('gravgen', 0, -1, 10)
  // the tower: a column and a glazed top
  for (let y = 5; y <= 10; y++) for (const [x, z] of [[-1, -24], [1, -24], [-1, -22], [1, -22]]) b.set('light_cube', x, y, z, 0, P)
  for (let x = -3; x <= 3; x++) for (let z = -26; z <= -20; z++) b.set('heavy_cube', x, 11, z, 0, 2)
  for (let x = -3; x <= 3; x++) for (let z = -26; z <= -20; z++) { const edge = Math.abs(x) === 3 || z === -26 || z === -20; if (edge) b.set(Math.abs(x) === 3 && (z === -26 || z === -20) ? 'light_cube' : 'window', x, 12, z, Math.abs(x) === 3 && (z === -26 || z === -20) ? 0 : x === -3 ? R([-1, 0, 0]) : x === 3 ? R([1, 0, 0]) : z === -26 ? FRONT : BACK, x === 3 || x === -3 ? P : 0) }
  roof(b, -3, 3, 13, -26, -20, 'heavy', 6)
  b.set('command_chair', 0, 12, -23, 0, 6).set('console', -1, 12, -25, BACK, 0).set('console', 1, 12, -25, BACK, 0).set('holotable', 0, 12, -21, 0)
  b.set('dish', -1, 14, -24, 0, 0).set('antenna', 3, 14, -20, 0).set('beacon', -3, 14, -26, 0)
  // two cradles: girder frames either side of the spine to build ships in
  for (const side of [-1, 1]) for (const z0 of [-12, 4]) {
    for (let z = z0; z <= z0 + 12; z += 4) { for (let x = 3; x <= 14; x++) b.set('girder', side * x, -2, z, 0, A); for (let y = -1; y <= 8; y++) b.set('girder', side * 14, y, z, 0, A); for (let x = 9; x <= 13; x++) b.set('girder', side * x, 8, z, 0, A) }
    for (let z = z0; z <= z0 + 12; z++) if ((z - z0) % 4) b.set('girder', side * 14, 8, z, 0, A).set('girder', side * 14, -2, z, 0, A)
    for (const z of [z0 + 2, z0 + 10]) b.set('flood', side * 14, 7, z, R([-side, 0, 0]))
    b.set('warnlight', side * 14, 9, z0, 0).set('warnlight', side * 14, 9, z0 + 12, 0)
  }
  // workshops along the spine
  b.over('refinery', -1, -1, -14, 0, 1).over('refinery', -1, -1, -2, 0, 1).over('assembler', 1, -1, 4, 0, 1).over('assembler', 0, -1, 4, 0, 1).over('survival_kit', -1, -1, 6, 0, 3).over('medbay', 1, -1, 8, 0, 3)
  b.over('cargo_l', -1, -1, 14, 0, P).over('cargo_l', -1, -1, 18, 0, P).over('core_big', -1, -1, -8, 0).over('o2h2', 1, -1, 0, 0, 1).over('tank_h2', -1, -1, -28, 0, 1)
  for (const z of [-14, -4, 2, 10]) b.set('lightpanel', 0, 1, z, UPSIDE)
  // solar wings and turrets
  for (const side of [-1, 1]) { for (let x = 3; x <= 30; x++) if (x !== 14) b.set('girder', side * x, 2, 0, 0, 1); for (let k = 0; k < 6; k++) for (const z of [-3, 1]) b.set('solar', side > 0 ? 6 + k * 4 : -9 - k * 4, 3, z, 0) }
  b.set('turret_gatling', 0, 3, -6, 0, P).set('turret_gatling', 0, 3, 14, 0, P).set('turret_missile', 0, 5, 26, 0, P).set('turret_gatling', 0, -3, 0, UPSIDE, P).set('turret_missile', 0, -3, -20, UPSIDE, P)
  return b.bp
}

export const ARSENAL = { warden, marauder, reaver, buggy, rover, crawler, citadel, bulwark }
export const ARSENAL_LIST = ['warden', 'marauder', 'reaver', 'buggy', 'rover', 'crawler']
export const STATION_LIST = ['citadel', 'bulwark']
