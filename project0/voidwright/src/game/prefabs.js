// Ready-made designs (the blueprints screen, and what each start puts round you), built here block by
// block so they are part of the code, not files. Hulls are drawn as solid shapes of cells and then
// "skinned": every outer edge gets the slope or corner piece that bevels it, so ships come out with clean
// chamfered lines. Working blocks are then set into and onto the hull.
import { R, F, BK, UPR, DNR, LF, RT, UPSIDE, BP, Shape, skin, roof } from './bpkit.js'
import { FLEET, FLEET_LIST } from './fleet.js'
import { CAPITAL, CAPITAL_LIST } from './capital.js'
import { ARSENAL, ARSENAL_LIST, STATION_LIST } from './arsenal.js'

// ---- Sparrow: a small-grid scout that flies on Halvor and in space ----
function sparrowHull(P, A) {
  const s = new Shape()
  s.box(-2, 2, 0, 2, -6, 5, P)                       // the body
  s.box(-2, 2, 0, 1, -7, -7, P).box(-1, 1, 0, 1, -8, -8, P).box(0, 0, 0, 0, -9, -9, P)   // the nose
  for (let x = 3; x <= 6; x++) for (let z = -1 + Math.floor((x - 3) / 2); z <= 3; z++) { s.add(x, 1, z, x === 6 ? A : P); s.add(-x, 1, z, x === 6 ? A : P) }  // swept wings
  s.sym(2, 2, 3, 3, 3, 5, A).sym(2, 2, 4, 4, 4, 5, A)   // tail fins
  s.paint((x, y, z, c) => y === 1 && Math.abs(x) === 2 && z > -6 ? A : null)                // a stripe down each side
  return s
}
function sparrowParts(b, P) {
  // the canopy and its shoulders, the deck behind it
  b.set('canopy', -1, 3, -5, 0, 2)
  for (const x of [-2, 2]) for (let z = -5; z <= -1; z++) b.set('light_slope', x, 3, z, R([x < 0 ? -1 : 1, 0, 0]), P)
  for (let x = -1; x <= 1; x++) for (let z = 0; z <= 5; z++) b.set(z === 5 ? 'light_halfslope' : 'light_panel', x, 3, z, z === 5 ? R([0, 0, 1]) : 0, P)
  // thrust: main drive, lift, brakes, sides
  b.set('thr_h2_small', -1, 1, 6, F, 2).set('thr_h2_small', 1, 1, 6, F, 2)
  b.over('thr_atmo_small', -2, 1, -3, UPR, 2).over('thr_atmo_small', 1, 1, -3, UPR, 2).over('thr_atmo_small', -2, 1, 2, UPR, 2).over('thr_atmo_small', 1, 1, 2, UPR, 2)
  b.set('thr_h2_small', -5, 0, 1, UPR, 2).set('thr_h2_small', 5, 0, 1, UPR, 2)
  b.set('thr_h2_small', -1, 4, 3, DNR, 2).set('thr_h2_small', 1, 4, 3, DNR, 2)
  b.set('thr_h2_small', -2, 0, -8, BK, 2).set('thr_h2_small', 2, 0, -8, BK, 2)
  b.set('thr_h2_small', -7, 1, 1, RT, 2).set('thr_h2_small', 7, 1, 1, LF, 2)
  b.over('gyro', 0, 1, 0).over('gyro', 0, 2, 0).over('battery', 0, 1, 4).over('battery', 0, 2, 4).over('core_small', 0, 1, 5)
  b.over('tank_h2', -1, 3, 0, 0, 1).over('tank_o2', 0, 1, -4, 0, 1)
  b.set('gear', -2, -1, -5, 0).set('gear', 1, -1, -5, 0).set('gear', -2, -1, 4, 0).set('gear', 1, -1, 4, 0)
  b.set('flood', 0, 0, -10, 0).set('lightstrip', -6, 2, 2, 0).set('lightstrip', 6, 2, 2, 0)
}
function sparrow() {
  const b = new BP('Sparrow', 'small', { desc: 'Scout: atmos and fuel thrusters, flies anywhere.' })
  skin(b, sparrowHull(6, 3), 'light', { solid: true })
  sparrowParts(b, 6)
  return b.bp
}
// ---- Pick: the scout's frame with two drills and room for ore ----
function pick() {
  const b = new BP('Pick', 'small', { desc: 'Miner: two drills at the nose (left button in the seat).' })
  const s = sparrowHull(4, 2)
  s.sym(3, 5, 0, 2, -3, -2, 4)        // shoulders to carry the drills
  skin(b, s, 'light', { solid: true })
  sparrowParts(b, 4)
  b.set('drill', -5, 0, -7, F, 2).set('drill', 3, 0, -7, F, 2)
  b.over('cargo_s', -1, 2, -2, 0, 4).over('cargo_s', 1, 2, -2, 0, 4).over('cargo_s', -1, 2, 2, 0, 4).over('cargo_s', 1, 2, 2, 0, 4)
  return b.bp
}

// ---- Mule: a large-grid utility ship with a cargo hold ----
function mule() {
  const b = new BP('Mule', 'large', { desc: 'Hauler: atmos lift, fuel thrusters, a cargo hold.' })
  const P = 4, A = 2
  const s = new Shape()
  s.box(-2, 2, 0, 2, -5, 4, P).box(-2, 2, 0, 1, -6, -6, P)
  s.box(-1, 1, 3, 3, 1, 4, A)                                   // the engine hump
  s.sym(2, 2, 3, 4, 3, 4, A).sym(2, 2, 5, 5, 4, 4, A)            // twin tail fins
  s.paint((x, y, z, c) => y === 1 && Math.abs(x) === 2 ? A : null)
  skin(b, s, 'light', { solid: true })
  b.over('cockpit', 0, 2, -5, 0, 2).over('window_slope', -1, 2, -5, R([0, 0, -1]), 1).over('window_slope', 1, 2, -5, R([0, 0, -1]), 1)
  b.over('cargo_l', -1, 0, 0, 0, P).over('gravgen', 0, 0, -4)
  b.set('tank_h2', -1, 3, -3, 0, 1)
  for (const [x, z] of [[-2, -3], [2, -3], [-2, 3], [2, 3], [0, -3], [0, 3], [-2, 0], [2, 0]]) b.set('thr_atmo_small', x, -1, z, UPR, 1)
  for (const [x, z] of [[-1, -1], [1, -1]]) b.over('thr_h2_small', x, 0, z, UPR, 1)
  b.set('thr_h2_small', -1, 1, 5, F, 1).set('thr_h2_small', 1, 1, 5, F, 1).set('thr_h2_small', -2, 0, 5, F, 1).set('thr_h2_small', 2, 0, 5, F, 1)
  b.set('thr_h2_small', -2, 1, -7, BK, 1).set('thr_h2_small', 2, 1, -7, BK, 1)
  b.set('thr_h2_small', -2, 3, 2, DNR, 1).set('thr_h2_small', 2, 3, 2, DNR, 1)
  b.set('thr_h2_small', -3, 1, 0, RT, 1).set('thr_h2_small', 3, 1, 0, LF, 1)
  b.over('gyro', -2, 1, 2).over('gyro', 2, 1, 2).over('battery', -2, 1, 3).over('battery', 2, 1, 3).over('core_small', 0, 2, 4)
  b.over('porthole', -2, 1, -2, R([1, 0, 0]), P).over('porthole', 2, 1, -2, R([1, 0, 0]), P)
  b.set('gear', -2, -1, -1, 0).set('gear', 2, -1, -1, 0).set('gear', -2, -1, 1, 0).set('gear', 2, -1, 1, 0)
  b.set('flood', -1, 0, -7, 0).set('flood', 1, 0, -7, 0).set('beacon', 0, 4, 3, 0).set('warnlight', 0, 3, 0, 0)
  return b.bp
}

// ---- Mole: a large-grid mining ship: a rock crusher between two drills ----
function mole() {
  const b = new BP('Mole', 'large', { desc: 'Miner: a rock crusher between two drills, two holds.' })
  const P = 4, A = 2
  const s = new Shape()
  s.box(-4, 4, 0, 3, -2, 8, P)
  s.box(-1, 1, 4, 4, -2, 2, A)                                   // the bridge
  s.paint((x, y, z, c) => (y === 3 && (Math.abs(x) === 4 || z === 8)) ? A : null)
  skin(b, s, 'heavy', { solid: false })
  // the tools across the front
  b.set('drill', -4, 0, -5, F, 2).set('crusher', -1, 0, -4, F, 2).set('drill', 2, 0, -5, F, 2)
  for (let x = -4; x <= 4; x++) b.over('hull_hazard', x, 3, -2, 0, 0)
  b.over('cockpit', 0, 4, -2, 0, 2).over('window_slope', -1, 4, -2, R([0, 0, -1]), 1).over('window_slope', 1, 4, -2, R([0, 0, -1]), 1)
  b.over('cargo_l', -4, 0, -1, 0, P).over('cargo_l', 2, 0, -1, 0, P).over('tank_h2', -1, 0, -1, 0, 1)
  // lift: four big fans and a big fuel engine; drive, brakes, sides, down
  b.over('thr_atmo_big', -4, 2, 2, UPR, 1).over('thr_atmo_big', 2, 2, 2, UPR, 1).over('thr_atmo_big', -4, 2, 5, UPR, 1).over('thr_atmo_big', 2, 2, 5, UPR, 1)
  b.over('thr_h2_big', -1, 3, 3, UPR, 1)
  for (const x of [-3, -1, 1, 3]) b.set('thr_h2_small', x, 1, 9, F, 1)
  b.set('thr_h2_small', -3, 3, 9, F, 1).set('thr_h2_small', 3, 3, 9, F, 1)
  b.set('thr_h2_small', -4, 3, -3, BK, 1).set('thr_h2_small', 4, 3, -3, BK, 1).set('thr_h2_small', -2, 3, -3, BK, 1).set('thr_h2_small', 2, 3, -3, BK, 1)
  b.set('thr_h2_small', -5, 3, 4, RT, 1).set('thr_h2_small', 5, 3, 4, LF, 1).set('thr_h2_small', -5, 3, 7, RT, 1).set('thr_h2_small', 5, 3, 7, LF, 1)
  b.set('thr_h2_small', -3, 4, 6, DNR, 1).set('thr_h2_small', 3, 4, 6, DNR, 1)
  b.over('gyro', -3, 3, 8).over('gyro', 3, 3, 8).over('gyro', -1, 3, 8).over('gyro', 1, 3, 8)
  b.over('battery', -2, 3, 8).over('battery', 2, 3, 8).over('core_small', 0, 3, 8).over('core_small', 0, 3, 7).over('gravgen', 0, 3, 1)
  b.set('detector', 0, 5, 1, 0).set('beacon', 0, 4, 4, 0).set('warnlight', -4, 4, -2, 0).set('warnlight', 4, 4, -2, 0)
  b.set('flood', -3, 4, -1, 0).set('flood', 3, 4, -1, 0)
  b.set('gear', -4, -1, -2, 0).set('gear', 4, -1, -2, 0).set('gear', -4, -1, 8, 0).set('gear', 4, -1, 8, 0).set('gear', 0, -1, 8, 0)
  return b.bp
}

// ---- Lancer: an ion/fuel explorer with a jump drive ----
function lancer() {
  const b = new BP('Lancer', 'large', { desc: 'Explorer: ion drives and a jump drive (J).' })
  const P = 12, A = 7
  const s = new Shape()
  s.box(-2, 2, 0, 2, -7, 6, P).box(-2, 2, 0, 1, -8, -8, P).box(-1, 1, 0, 1, -9, -9, P)
  s.box(-1, 1, 3, 3, -2, 6, P)                                   // the spine
  s.sym(3, 4, 1, 1, 2, 6, A).sym(5, 5, 1, 1, 4, 6, A)             // stub wings
  s.box(0, 0, 4, 4, 5, 6, A).box(0, 0, 5, 5, 6, 6, A)            // a dorsal fin
  s.paint((x, y, z, c) => y === 1 && Math.abs(x) === 2 ? A : null)
  skin(b, s, 'light', { solid: true })
  b.over('cockpit', 0, 2, -7, 0, 7).over('window_slope', -1, 2, -7, R([0, 0, -1]), 1).over('window_slope', 1, 2, -7, R([0, 0, -1]), 1)
  b.over('jumpdrive', -1, 0, 1, 0, 0)
  b.over('core_small', 0, 1, -2).over('core_small', 0, 1, -3)
  b.over('gyro', -1, 1, 5).over('gyro', 1, 1, 5).over('gyro', -1, 2, 5).over('gyro', 1, 2, 5)
  b.over('battery', -2, 2, -1).over('battery', 2, 2, -1).over('battery', -2, 2, 4).over('battery', 2, 2, 4)
  b.over('gravgen', 0, 0, -5).over('medbay', -1, 0, -6, 0, 3).over('survival_kit', 1, 0, -6, 0, 3)
  for (const z of [-5, -3, 0]) b.over('porthole', -2, 1, z, R([1, 0, 0]), P).over('porthole', 2, 1, z, R([1, 0, 0]), P)
  b.set('thr_ion_small', -2, 0, 7, F, 1).set('thr_ion_small', 2, 0, 7, F, 1).set('thr_ion_small', -2, 2, 7, F, 1).set('thr_ion_small', 2, 2, 7, F, 1)
  b.set('thr_h2_small', 0, 1, 7, F, 1).set('thr_h2_small', 0, 3, 7, F, 1).set('thr_ion_small', -4, 1, 7, F, 1).set('thr_ion_small', 4, 1, 7, F, 1)
  for (const [x, z] of [[-2, -4], [2, -4], [-2, 4], [2, 4], [0, -4], [0, 4]]) b.over('thr_h2_small', x, 0, z, UPR, 1)
  b.set('thr_ion_small', -2, 1, -9, BK, 1).set('thr_ion_small', 2, 1, -9, BK, 1)
  b.set('thr_ion_small', -1, 4, -2, DNR, 1).set('thr_ion_small', 1, 4, -2, DNR, 1)
  b.set('tank_h2', -1, 4, -1, 0, 1)
  b.set('thr_ion_small', -3, 1, -3, RT, 1).set('thr_ion_small', 3, 1, -3, LF, 1).set('thr_ion_small', -6, 1, 5, RT, 1).set('thr_ion_small', 6, 1, 5, LF, 1)
  b.set('gear', -2, -1, -2, 0).set('gear', 2, -1, -2, 0).set('gear', -2, -1, 2, 0).set('gear', 2, -1, 2, 0)
  b.set('antenna', 0, 4, 4, 0).set('flood', 0, 0, -10, 0).set('detector', 0, 4, 2, 0)
  return b.bp
}

// a deck with a hazard border, dark plates and a painted landing ring
function deck(b, r, cx, cz, ring) {
  for (let i = -r; i <= r; i++) for (let k = -r; k <= r; k++) {
    const edge = Math.abs(i) === r || Math.abs(k) === r, d = Math.round(Math.hypot(i - cx, k - cz))
    const mark = !edge && (d === ring || (i === cx && Math.abs(k - cz) <= 1) || (k === cz && Math.abs(i - cx) <= 1))
    b.set(edge ? 'hull_hazard' : mark ? 'light_cube' : (i + k) % 5 === 0 ? 'hull_grate' : 'heavy_cube', i, 0, k, 0, mark ? 9 : edge ? 1 : 2)
  }
}
// ---- Kestrel: an orbital station: a landing deck between a hall and a hangar, a control tower, a reactor
// keel below, solar wings on booms ----
function kestrel() {
  const b = new BP('Kestrel Station', 'large', { static: true, desc: 'Deck, hall, hangar, control tower, reactor keel, solar wings.' })
  deck(b, 6, 0, 0, 4)
  // the hall at one end: white walls on a grey course, a teal band under a dark bevelled roof
  const wall = j => j === 1 ? 1 : j === 3 ? 7 : 3
  for (let i = -6; i <= 6; i++) for (let k = 7; k <= 11; k++) for (let j = 0; j <= 3; j++) {
    const edge = Math.abs(i) === 6 || k === 11 || j === 0
    if (!edge && k !== 7) continue
    if (k === 7 && j >= 1 && j <= 3 && Math.abs(i) <= 1) continue // the doorway
    b.set(j === 0 ? 'hull_grate' : 'light_cube', i, j, k, 0, j === 0 ? 2 : wall(j))
  }
  roof(b, -6, 6, 4, 7, 11, 'heavy', 2)
  for (let i = -5; i <= 5; i++) b.over('window', i, 2, 11, 0, 0)
  for (const k of [8, 9, 10]) b.over('window', -6, 2, k, R([-1, 0, 0]), 0).over('window', 6, 2, k, R([1, 0, 0]), 0)
  for (const i of [-5, -4, -3, 3, 4, 5]) b.over('porthole', i, 2, 7, 0, 3)
  for (const i of [-1, 0, 1]) b.set('hull_hazard', i, 3, 7, 0, 1)
  b.set('hull_hazard', -1, 1, 7, 0, 1).set('hull_hazard', 1, 1, 7, 0, 1).set('light_cube', -1, 2, 7, 0, 3).set('light_cube', 1, 2, 7, 0, 3)
  b.set('door', 0, 1, 7, 0).set('window', 0, 2, 7, 0, 0)
  b.over('medbay', -4, 1, 9, 0, 3).over('gravgen', 4, 1, 10).over('battery', 5, 1, 10).over('battery', 5, 2, 10).over('core_small', 5, 1, 9)
  b.set('survival_kit', -2, 1, 10, R([0, 0, -1]), 3).set('refinery', 1, 1, 8, 0, 1).set('assembler', -1, 1, 10, R([0, 0, -1]), 1).set('o2h2', 3, 1, 8, 0, 1)
  b.set('tank_o2', -5, 1, 8, 0).set('cargo_s', -3, 1, 8, 0, 4).set('locker', -5, 1, 10, 0, 4).set('console', -3, 1, 10, 0, 0)
  for (let i = -4; i <= 4; i += 4) b.set('lightpanel', i, 3, 9, UPSIDE)
  // the hangar at the other end, behind a striped frame and a door of panels
  for (let i = -5; i <= 5; i++) for (let k = -11; k <= -8; k++) for (let j = 0; j <= 3; j++) {
    const edge = Math.abs(i) === 5 || k === -11 || j === 0
    if (!edge) continue
    b.set(j === 0 ? 'hull_grate' : 'light_cube', i, j, k, 0, j === 0 ? 2 : wall(j))
  }
  b.fill('hull_grate', -5, 5, 0, 0, -7, -7, 0, 2)
  for (let i = -5; i <= 5; i++) for (let j = 1; j <= 3; j++) if (!(Math.abs(i) <= 3)) b.set(Math.abs(i) === 4 ? 'hull_hazard' : 'light_cube', i, j, -7, 0, Math.abs(i) === 4 ? 1 : wall(j))
  roof(b, -5, 5, 4, -11, -7, 'heavy', 2)
  for (let i = -3; i <= 3; i++) for (let j = 1; j <= 3; j++) b.set('hangar', i, j, -7, R([0, 0, 1]), 4)
  for (const k of [-10, -9]) b.over('window', -5, 2, k, R([-1, 0, 0]), 0).over('window', 5, 2, k, R([1, 0, 0]), 0)
  b.set('lightpanel', -1, 3, -9, UPSIDE).set('lightpanel', 1, 3, -9, UPSIDE).set('tank_h2', -4, 1, -10, 0, 1).set('cargo_l', 2, 1, -10, 0, 4)
  b.set('flood', -4, 5, -7, R([0, 0, 1])).set('flood', 4, 5, -7, R([0, 0, 1])).set('warnlight', 0, 5, -7, 0)
  // the tower on the hall: a stem, a glazed control room that overhangs it, a dish and a mast
  b.fill('light_cube', -5, -3, 5, 6, 8, 10, 0, 3)
  for (let i = -6; i <= -2; i++) for (let k = 7; k <= 11; k++) {
    const edge = i === -6 || i === -2 || k === 7 || k === 11, corner = (i === -6 || i === -2) && (k === 7 || k === 11)
    b.set('heavy_cube', i, 7, k, 0, 2)
    if (corner) b.set('light_cube', i, 8, k, 0, 3)
    else if (edge) b.set('window', i, 8, k, i === -6 ? R([-1, 0, 0]) : i === -2 ? R([1, 0, 0]) : k === 7 ? R([0, 0, -1]) : R([0, 0, 1]), 0)
  }
  roof(b, -6, -2, 9, 7, 11, 'heavy', 7)
  b.set('console', -4, 8, 8, 0, 0).set('lightpanel', -4, 8, 10, 0)
  b.set('dish', -5, 10, 8, 0, 0).set('antenna', -2, 10, 11, 0).set('warnlight', -6, 10, 7, 0)
  // the keel: a reactor hung under the deck, tanks beside it, an aerial pointing down
  b.fill('heavy_cube', -1, 1, -1, -1, -1, 1, 0, 2)
  b.set('core_big', -1, -4, -1, 0)
  b.fill('heavy_cube', -1, 1, -5, -5, -1, 1, 0, 2)
  for (const [x, z] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) for (let j = -4; j <= -2; j++) b.set(j === -3 ? 'hull_vent' : 'girder', x, j, z, 0, 1)
  for (const [x, z] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) b.set('lightstrip', x, -5, z, UPSIDE)
  b.set('antenna', 0, -6, 0, UPSIDE).set('warnlight', 1, -6, 1, UPSIDE)
  // solar wings on booms either side, and a light on a post at each corner of the deck
  for (const side of [-1, 1]) {
    for (let x = 7; x <= 16; x++) b.set('girder', side * x, 0, 0, 0, 1)
    for (const x0 of [8, 12]) for (const k of [-4, -2, 1, 3]) b.set('solar', side > 0 ? x0 : -x0 - 3, 1, k, 0)
    for (const x0 of [8, 12]) for (const k of [-4, -3, -2, -1, 1, 2, 3, 4]) for (const x of [x0, x0 + 3]) b.set('girder', side * x, 0, k, 0, 1)
    b.set('warnlight', side * 16, 1, 0, 0)
  }
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) b.set('girder', x, 1, z, 0, 1).set('flood', x, 2, z, R([x < 0 ? 1 : -1, 0, 0]))
  b.set('beacon', -6, 1, 0, 0).set('beacon', 6, 1, 0, 0).set('solar', -1, 5, 8, 0).set('solar', 3, 5, 8, 0)
  return b.bp
}

// ---- Foothold: an outpost on the ground: a landing ring, a habitat with a lookout, a workshop under a
// roof, a tank yard, a mast with a dish, sun and wind for power ----
function foothold() {
  const b = new BP('Foothold Outpost', 'large', { static: true, ground: true, desc: 'Landing ring, habitat, workshop, tank yard, mast and dish.' })
  deck(b, 6, -2, -2, 3)
  for (let i = -6; i <= 6; i++) { b.set('light_slope', i, 0, -7, R([0, 0, -1]), 1); b.set('light_slope', i, 0, 7, R([0, 0, 1]), 1) }
  for (let k = -6; k <= 6; k++) { b.set('light_slope', -7, 0, k, R([-1, 0, 0]), 1); b.set('light_slope', 7, 0, k, R([1, 0, 0]), 1) }
  // the habitat: white walls, a teal band, a dark bevelled roof
  for (let i = 1; i <= 5; i++) for (let k = 1; k <= 5; k++) for (let j = 1; j <= 3; j++) {
    if (!(i === 1 || i === 5 || k === 1 || k === 5)) continue
    if (i === 1 && k === 3 && j === 1) continue
    b.set('light_cube', i, j, k, 0, j === 3 ? 7 : 3)
  }
  roof(b, 1, 5, 4, 1, 5, 'heavy', 2)
  b.set('door', 1, 1, 3, R([1, 0, 0]))
  b.over('window', 5, 2, 2, R([1, 0, 0]), 0).over('window', 5, 2, 4, R([1, 0, 0]), 0).over('window', 2, 2, 5, R([0, 0, 1]), 0).over('window', 4, 2, 5, R([0, 0, 1]), 0).over('window', 3, 2, 1, R([0, 0, -1]), 0)
  b.over('porthole', 1, 2, 2, R([1, 0, 0]), 3).over('porthole', 1, 2, 4, R([1, 0, 0]), 3)
  b.set('medbay', 4, 1, 2, 0, 3).set('survival_kit', 2, 1, 2, R([-1, 0, 0]), 3).set('battery', 4, 1, 4).set('locker', 3, 1, 4, 0, 4).set('table', 2, 1, 4, 0, 0).set('lightpanel', 3, 3, 3, UPSIDE)
  // the lookout on the roof: glass all round under a teal cap, an aerial
  for (let i = 3; i <= 5; i++) for (let k = 3; k <= 5; k++) {
    if (i === 4 && k === 4) continue
    const corner = i !== 4 && k !== 4
    b.set(corner ? 'light_cube' : 'window', i, 5, k, corner ? 0 : i === 3 ? R([-1, 0, 0]) : i === 5 ? R([1, 0, 0]) : k === 3 ? R([0, 0, -1]) : R([0, 0, 1]), corner ? 3 : 0)
  }
  roof(b, 3, 5, 6, 3, 5, 'heavy', 7)
  b.set('antenna', 4, 7, 4, 0).set('railing', 1, 5, 1, 0, 1).set('railing', 2, 5, 1, 0, 1).set('railing', 1, 5, 2, 0, 1).set('solar', 1, 5, 3, R([1, 0, 0]))
  // the workshop: machines under an orange roof on posts
  b.set('refinery', 4, 1, -2, 0, 1).set('assembler', 3, 1, -2, 0, 1).set('cargo_s', 3, 1, 0, 0, 4).set('cargo_s', 3, 2, 0, 0, 4).set('core_small', 2, 1, -2, 0).set('console', 2, 1, 0, 0, 0)
  for (const k of [-2, 0]) b.set('girder', 1, 1, k, 0, 1).set('girder', 1, 2, k, 0, 1)
  roof(b, 1, 5, 3, -2, 0, 'light', 4)
  b.set('lightpanel', 3, 2, -1, UPSIDE)
  // the tank yard
  b.set('tank_h2', 3, 1, -5, 0, 1).set('tank_o2', 2, 1, -5, 0).set('tank_o2', 2, 1, -3, 0).set('o2h2', 1, 1, -5, 0, 1).set('duct', 2, 1, -4, 0, 1)
  // the mast and its dish, the power, the lights
  for (let j = 1; j <= 5; j++) b.set('girder', -1, j, 5, 0, 1)
  b.set('dish', -2, 6, 4, 0, 0).set('warnlight', -1, 3, 4, 0)
  b.set('solar', -6, 1, 2, 0).set('solar', -6, 1, 4, 0).set('turbine', -6, 1, -6, 0).set('turbine', 6, 1, -6, 0)
  b.set('girder', 0, 1, -6, 0, 1).set('girder', 0, 2, -6, 0, 1).set('flood', 0, 3, -6, R([0, 0, 1]))
  b.set('girder', -6, 1, 0, 0, 1).set('girder', -6, 2, 0, 0, 1).set('flood', -6, 3, 0, R([1, 0, 0]))
  b.set('beacon', 6, 1, 6, 0).set('detector', 0, 1, 5, 0).set('warnlight', -6, 1, 6, 0).set('warnlight', 6, 1, 0, 0)
  return b.bp
}

export const PREFABS = { sparrow, pick, mule, mole, lancer, kestrel, foothold, ...FLEET, ...CAPITAL, ...ARSENAL }
export const PREFAB_LIST = ['sparrow', 'pick', 'mule', 'mole', 'lancer', ...FLEET_LIST, ...CAPITAL_LIST, ...ARSENAL_LIST, 'kestrel', 'foothold', ...STATION_LIST]
const cache = {}
export function prefab(id) { return cache[id] || (cache[id] = PREFABS[id]()) }
