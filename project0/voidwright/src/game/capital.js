// The big ships: hulls you can live in. Each is drawn as a solid shape and skinned hollow like the others;
// then the inside is cleared and fitted out by hand: decks, bulkheads with doors, stairs, a bridge with a
// command chair, cabins with beds, a workshop, a hangar behind a wall of door panels. Cameras outside feed
// the views in the chair (V).
import { R, F, BK, UPR, DNR, LF, RT, UPSIDE, BP, Shape, skin } from './bpkit.js'

const FRONT = R([0, 0, -1]), BACK = R([0, 0, 1]), LEFT = R([-1, 0, 0]), RIGHT = R([1, 0, 0])
const HANG_BACK = R([0, 0, 1], [0, -1, 0])      // under a ceiling, looking astern
// an empty room: every block whose corner cell lies in the box goes
function hollow(b, x0, x1, y0, y1, z0, z1) { b.bp.blocks = b.bp.blocks.filter(q => !(q[1] >= x0 && q[1] <= x1 && q[2] >= y0 && q[2] <= y1 && q[3] >= z0 && q[3] <= z1)); return b }
// a wall or floor of one kind of block, with cells left out (doors, windows, stairwells)
function slab(b, id, x0, x1, y0, y1, z0, z1, col, skip = []) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) if (!skip.some(q => q[0] === x && q[1] === y && q[2] === z)) b.over(id, x, y, z, 0, col)
  return b
}
const beds = (b, list) => { for (const [x, y, z] of list) b.set('bed', x, y, z, 0, 6) }
const lights = (b, list) => { for (const [x, y, z] of list) b.set('lightpanel', x, y, z, UPSIDE) }

// ---- Ardent: a carrier. Two decks and a bridge forward, a hangar the height of both astern ----
function ardent() {
  const b = new BP('Ardent', 'large', { desc: 'Carrier with an interior: bridge, cabins, workshop, a hangar for small craft, four cameras.' })
  const P = 0, A = 12, O = 4, W = 3
  const s = new Shape()
  s.box(-5, 5, 0, 7, -8, 26, P)                                                                           // the hull
  s.box(-4, 4, 1, 7, -11, -9, P).box(-3, 3, 1, 6, -13, -12, P).box(-2, 2, 2, 5, -15, -14, P).box(-1, 1, 3, 4, -16, -16, A)   // the bow
  s.box(-3, 3, 8, 10, -6, 2, P).box(-2, 2, 8, 9, 3, 5, A).box(-1, 1, 8, 8, 6, 22, A)                      // the bridge and the spine
  s.sym(6, 8, 1, 5, 12, 26, P).sym(6, 7, 2, 4, 10, 11, A).sym(9, 10, 3, 3, 18, 25, A).sym(7, 7, 6, 7, 20, 25, A)   // engine pods, their wings and fins
  s.paint((x, y, z) => y === 4 && Math.abs(x) === 5 ? A : null)                                           // a line along the deck
  s.paint((x, y, z) => Math.abs(x) >= 6 && Math.abs(x) <= 8 && y === 5 && z >= 12 ? O : null)
  s.paint((x, y, z) => y === 10 ? A : null)
  skin(b, s, 'light', { solid: false })
  hollow(b, -4, 4, 1, 6, -7, 25); hollow(b, -2, 2, 8, 9, -5, 1)
  // --- structure inside ---
  slab(b, 'light_cube', -1, 1, 7, 7, 3, 22, P)                                                             // the roof under the spine
  for (const x of [-5, 5]) slab(b, 'light_cube', x, x, 1, 5, 10, 26, P)                                     // the hull's sides where the pods join it
  slab(b, 'light_cube', -4, 4, 1, 6, -8, -8, W)                                                            // the forward bulkhead
  slab(b, 'hull_grate', -4, 4, 4, 4, -7, 9, 1, [[-4, 4, 6], [-4, 4, 7], [-4, 4, 8]])                       // the upper deck, with the stairwell cut out
  slab(b, 'light_cube', -4, 4, 1, 6, 10, 10, W, [[0, 1, 10], [0, 5, 10], [-3, 5, 10], [-2, 5, 10], [-1, 5, 10], [1, 5, 10], [2, 5, 10], [3, 5, 10]])   // the hangar bulkhead
  b.set('blastdoor', 0, 1, 10, 0).set('door', 0, 5, 10, 0)
  for (const x of [-3, -2, -1, 1, 2, 3]) b.set('window', x, 5, 10, BACK, 0)
  for (let x = -2; x <= 2; x++) b.set('catwalk', x, 5, 11, 0, 1)                                           // a gallery over the hangar
  for (let i = 0; i < 4; i++) b.set('stairs', -4, 1 + i, 5 + i, FRONT, 1)                                  // lower deck up to upper deck
  // lower deck: engineering forward, then a corridor with the med bay and stairs to port, workshop and store to starboard
  slab(b, 'light_cube', -4, 4, 1, 3, -1, -1, W, [[0, 1, -1]]); b.set('door', 0, 1, -1, 0)
  slab(b, 'light_cube', -1, -1, 1, 3, 0, 4, W, [[-1, 1, 2]]); b.set('door', -1, 1, 2, RIGHT)
  slab(b, 'light_cube', -4, -2, 1, 3, 4, 4, W)
  slab(b, 'light_cube', 1, 1, 1, 3, 0, 9, W, [[1, 1, 2], [1, 1, 7]]); b.set('door', 1, 1, 2, RIGHT).set('door', 1, 1, 7, RIGHT)
  slab(b, 'light_cube', 2, 4, 1, 3, 5, 5, W)
  // upper deck: the mess forward, then cabins to port, the stair lobby and two cabins to starboard
  slab(b, 'light_cube', -4, 4, 5, 6, -3, -3, W, [[0, 5, -3]]); b.set('door', 0, 5, -3, 0)
  slab(b, 'light_cube', -1, -1, 5, 6, -2, 5, W, [[-1, 5, -1], [-1, 5, 3]]); b.set('door', -1, 5, -1, RIGHT).set('door', -1, 5, 3, RIGHT)
  slab(b, 'light_cube', -4, -2, 5, 6, 1, 1, W); slab(b, 'light_cube', -4, -2, 5, 6, 5, 5, W)
  slab(b, 'light_cube', 1, 4, 5, 6, 3, 3, W)
  slab(b, 'light_cube', 1, 1, 5, 6, 4, 9, W, [[1, 5, 5], [1, 5, 8]]); b.set('door', 1, 5, 5, RIGHT).set('door', 1, 5, 8, RIGHT)
  slab(b, 'light_cube', 2, 4, 5, 6, 6, 6, W)
  // the bridge: its floor, the stairs up to it from the lobby, glass forward and to the sides
  slab(b, 'hull_grate', -2, 2, 7, 7, -5, 1, 1, [[2, 7, 0], [2, 7, -1], [2, 7, -2]])
  b.set('stairs', 2, 5, 0, BACK, 1).set('light_cube', 2, 5, -1, 0, W).set('stairs', 2, 6, -1, BACK, 1).set('light_cube', 2, 5, -2, 0, W).set('light_cube', 2, 6, -2, 0, W).set('stairs', 2, 7, -2, BACK, 1)
  for (let x = -2; x <= 2; x++) for (const y of [8, 9]) b.over('window', x, y, -6, FRONT, 0)
  for (let z = -4; z <= 0; z++) b.over('window', -3, 9, z, LEFT, 0).over('window', 3, 9, z, RIGHT, 0)
  b.set('command_chair', 0, 8, -3, 0, A).set('console', -1, 8, -5, BACK, 0).set('console', 1, 8, -5, BACK, 0).set('console', -2, 8, -1, RIGHT, 0).set('sign', 0, 9, 1, 0)
  b.set('seat', -1, 8, -1, 0)
  // --- the rooms ---
  // engineering
  b.set('core_big', -1, 1, -6, 0).set('jumpdrive', 2, 1, -6, 0, 0).set('tank_h2', -4, 1, -6, 0, 1).set('gravgen', -4, 1, -2).set('o2h2', 4, 1, -3, 0, 1)
  for (const x of [-4, -3, -2]) for (const y of [1, 2, 3]) b.set('gyro', x, y, -3)
  for (const x of [2, 3]) for (const y of [1, 2]) b.set('battery', x, y, -3).set('core_small', x, y, -4)
  b.set('gyro', 2, 3, -3).set('gyro', 3, 3, -3).set('gyro', 4, 3, -4)
  // med bay, workshop, store
  b.set('medbay', -4, 1, 0, 0, 3).set('medbay', -4, 1, 2, 0, 3).set('survival_kit', -2, 1, 0, 0, 3).set('locker', -3, 1, 3, 0, 3)
  b.set('refinery', 3, 1, 0, 0, 1).set('assembler', 4, 1, 4, 0, 1).set('assembler', 3, 1, 4, 0, 1).set('console', 2, 1, 4, BACK, 0)
  for (const [x, y, z] of [[3, 1, 8], [4, 1, 8], [3, 1, 9], [4, 1, 9], [3, 2, 9], [4, 2, 9], [4, 2, 8]]) b.set('cargo_s', x, y, z, 0, O)
  b.set('locker', 4, 1, 6, 0, 3).set('tank_o2', 2, 1, 9, 0)
  // the mess
  b.set('table', -2, 5, -6, 0, 0).set('table', 2, 5, -6, 0, 0).set('table', 0, 5, -6, 0, 0).set('console', -3, 5, -7, 0, 0).set('console', 3, 5, -7, 0, 0).set('sign', 0, 6, -7, FRONT).set('locker', -4, 5, -4, 0, 3).set('locker', 4, 5, -4, 0, 3)
  for (const z of [-6, -5]) b.over('window', -5, 5, z, LEFT, 0).over('window', 5, 5, z, RIGHT, 0)
  // four cabins: a bed, a locker, a table, a porthole
  beds(b, [[-4, 5, -2], [-4, 5, 2], [4, 5, 4], [4, 5, 7], [-2, 5, 3]])
  b.set('locker', -4, 5, 0, 0, 3).set('table', -2, 5, -2, 0, 0).set('locker', -4, 5, 4, 0, 3).set('locker', 2, 5, 4, 0, 3).set('locker', 4, 5, 9, 0, 3).set('table', 2, 5, 9, 0, 0)
  b.over('porthole', -5, 5, -1, RIGHT, P).over('porthole', -5, 5, 3, RIGHT, P).over('porthole', 5, 5, 4, RIGHT, P).over('porthole', 5, 5, 8, RIGHT, P)
  lights(b, [[-3, 3, 1], [3, 3, 3], [0, 3, 1], [0, 3, 6], [3, 3, 7], [0, 3, -2], [-3, 3, 7],
    [-3, 6, -1], [-3, 6, 3], [3, 6, 4], [3, 6, 8], [0, 6, 0], [0, 6, 5], [0, 6, 8], [-2, 6, -5], [2, 6, -5], [3, 6, 0], [-3, 6, 8], [0, 9, -1], [0, 9, -4]])
  // --- the hangar: the door astern, stores along the forward wall, lights, a stripe on the floor ---
  for (let x = -3; x <= 3; x++) for (let y = 1; y <= 5; y++) b.over('hangar', x, y, 26, BACK, O)
  b.set('cargo_l', 2, 1, 11, 0, O).set('tank_h2', -4, 1, 11, 0, 1).set('cargo_s', -1, 1, 11, 0, O).set('cargo_s', -1, 2, 11, 0, O)
  lights(b, [[-2, 6, 14], [2, 6, 14], [-2, 6, 19], [2, 6, 19], [-2, 6, 24], [2, 6, 24]])
  for (let x = -3; x <= 3; x++) b.over('hull_hazard', x, 0, 25, 0, 1)
  for (let z = 14; z <= 22; z++) for (const x of [-3, 3]) b.over('hull_hazard', x, 0, z, 0, 1)
  b.set('warnlight', -4, 1, 25, 0).set('warnlight', 4, 1, 25, 0)
  // --- cameras: the bow, the stern, under the keel, in the hangar ---
  b.set('camera', 0, 6, -15, 0).set('camera', 0, 8, 25, BACK).set('camera', 0, -1, -4, R([0, -1, 0], [0, 0, -1])).set('camera', 0, 6, 12, HANG_BACK)
  // --- drive: two big ion engines and fuel jets on the pods; lift through the pods and the keel ---
  for (const sd of [-1, 1]) {
    const x0 = sd > 0 ? 6 : -8
    b.set('thr_ion_big', x0, 1, 27, F, 1)
    for (let dx = 0; dx < 3; dx++) b.set('thr_h2_small', x0 + dx, 4, 27, F, 1).set('thr_h2_small', x0 + dx, 5, 27, F, 1)
    for (const z of [13, 17, 21]) b.over('thr_h2_big', x0, 5, z, UPR, 1)
    for (const y of [2, 4]) for (const dx of [0, 1]) b.set('thr_h2_small', (sd > 0 ? 6 : -7) + dx, y, 9, BK, 1)
    b.set('thr_h2_small', sd * 9, 2, 14, sd > 0 ? LF : RT, 1).set('thr_h2_small', sd * 9, 4, 22, sd > 0 ? LF : RT, 1).set('thr_h2_small', sd * 5, 3, -10, sd > 0 ? LF : RT, 1)
    for (const z of [-4, 6, 14, 22]) b.set('thr_h2_small', sd * 4, 8, z, DNR, 1)
    for (const z of [-6, -2, 2, 6, 14, 20]) b.over('thr_h2_small', sd * 3, 0, z, UPR, 1)
    for (const z of [-10]) b.over('thr_h2_small', sd * 2, 1, z, UPR, 1)
    for (const z of [-6, 8, 24]) b.set('gear', sd * 4, -1, z, 0)
    b.set('warnlight', sd * 7, 8, 22, 0).set('lightstrip', sd * 9, 4, 20, 0)
  }
  b.over('gravgen', 4, 1, 24).set('turret_gatling', 0, 9, 13, 0, P).set('turret_missile', 0, 9, 20, 0, P).set('turret_gatling', 0, 6, -14, 0, P)
  b.set('dish', -1, 9, 10, 0, 0).set('antenna', 0, 9, 16, 0).set('beacon', 0, 11, -2, 0).set('flood', 0, 3, -17, 0).set('flood', 0, 4, -17, 0)
  return b.bp
}

// ---- Vagrant: a corvette. One deck: a raised bridge under glass, a bunk room, a bay astern for one small ship ----
function vagrant() {
  const b = new BP('Vagrant', 'large', { desc: 'Corvette with an interior: a raised bridge, a bunk room, a bay for one small ship, three cameras.' })
  const P = 3, A = 6, W = 0
  const s = new Shape()
  s.box(-3, 3, 0, 3, -6, 14, P).box(-3, 3, 0, 1, -8, -7, P).box(-2, 2, 0, 0, -10, -9, A)        // the hull and its low nose
  s.box(-2, 2, 4, 4, 6, 13, A).sym(4, 4, 1, 2, 6, 14, A).sym(3, 3, 4, 5, 11, 14, A)             // the hump over the bay, the side pods, the tail fins
  s.paint((x, y, z) => y === 3 && Math.abs(x) === 3 ? A : null)
  skin(b, s, 'light', { solid: false })
  hollow(b, -2, 2, 1, 2, -5, 13)
  slab(b, 'light_cube', -1, 1, 3, 3, 6, 13, P)                                                  // the roof under the hump
  for (const x of [-3, 3]) slab(b, 'light_cube', x, x, 1, 2, 6, 14, P)                           // the sides where the pods join
  // the bridge stands a step up, behind a row of glass
  slab(b, 'hull_grate', -2, 2, 1, 1, -5, -3, 1)
  b.set('stairs', 0, 1, -2, BACK, 1)
  for (let x = -2; x <= 2; x++) b.over('window', x, 2, -6, FRONT, 0)
  b.over('window', -3, 2, -4, LEFT, 0).over('window', 3, 2, -4, RIGHT, 0)
  b.set('command_chair', 0, 2, -4, 0, A).set('console', -1, 2, -5, BACK, 0).set('console', 1, 2, -5, BACK, 0).set('seat', -2, 2, -3, 0)
  // the common room: the reactor and stores down one side, the med bay down the other
  b.set('survival_kit', -2, 1, -1, 0, 3).set('medbay', -2, 1, 0, 0, 3).set('gyro', -2, 2, 0).set('gyro', -2, 2, 1).set('gyro', -2, 2, -1).set('gravgen', -1, 1, -2)
  b.set('core_small', 2, 1, -1).set('core_small', 2, 2, -1).set('core_small', 1, 1, -2).set('battery', 2, 1, 0).set('battery', 2, 2, 0).set('gyro', 2, 1, 1).set('gyro', 2, 2, 1).set('o2h2', 1, 2, 0, 0, 1)
  slab(b, 'light_cube', -2, 2, 1, 2, 2, 2, W, [[2, 1, 2]]); b.set('door', 2, 1, 2, 0)
  // the bunk room, off a short passage
  slab(b, 'light_cube', 1, 1, 1, 2, 3, 6, W, [[1, 1, 4]]); b.set('door', 1, 1, 4, RIGHT)
  beds(b, [[-2, 1, 3], [-2, 1, 5], [0, 1, 5]])
  b.set('locker', -1, 1, 6, 0, 3).set('table', -1, 1, 3, 0, 0).over('porthole', -3, 2, 4, RIGHT, P).over('porthole', 3, 2, 4, RIGHT, P)
  lights(b, [[-1, 2, 4], [2, 2, 5], [0, 2, 0], [1, 2, -3]])
  // the bay: a blast door in, a wall of door panels out
  slab(b, 'light_cube', -2, 2, 1, 2, 7, 7, W, [[2, 1, 7], [-1, 2, 7], [0, 2, 7]]); b.set('blastdoor', 2, 1, 7, 0).set('window', -1, 2, 7, BACK, 0).set('window', 0, 2, 7, BACK, 0)
  for (let x = -2; x <= 2; x++) for (const y of [1, 2]) b.over('hangar', x, y, 14, BACK, A)
  b.set('cargo_s', -2, 1, 8, 0, A).set('cargo_s', -2, 2, 8, 0, A)
  lights(b, [[-2, 2, 10], [2, 2, 10], [0, 2, 12]])
  for (let x = -2; x <= 2; x++) b.over('hull_hazard', x, 0, 13, 0, 1)
  // cameras: the nose, the tail, the bay
  b.set('camera', 0, 1, -9, 0).set('camera', 0, 5, 13, BACK).set('camera', 0, 2, 8, HANG_BACK)
  // drive
  b.set('tank_h2', -1, 4, -1, 0, 1)
  for (const sd of [-1, 1]) {
    b.set('thr_h2_small', sd * 4, 1, 15, F, 1).set('thr_h2_small', sd * 4, 2, 15, F, 1).set('thr_h2_small', sd * 3, 3, 15, F, 1).set('thr_h2_small', sd, 3, 15, F, 1).set('thr_h2_small', sd * 2, 0, 15, F, 1)
    b.set('thr_h2_small', sd * 3, 3, -7, BK, 1).set('thr_h2_small', sd * 3, 2, -7, BK, 1)
    for (const z of [-4, 2, 8, 12]) b.over('thr_h2_small', sd * 2, 0, z, UPR, 1)
    b.set('thr_h2_small', sd * 2, 4, -4, DNR, 1).set('thr_h2_small', sd * 2, 4, 3, DNR, 1)
    b.set('thr_h2_small', sd * 4, 2, -2, sd > 0 ? LF : RT, 1).set('thr_h2_small', sd * 5, 1, 10, sd > 0 ? LF : RT, 1)
    b.set('gear', sd * 3, -1, -5, 0).set('gear', sd * 3, -1, 13, 0)
    b.set('warnlight', sd * 3, 6, 13, 0)
  }
  b.set('turret_gatling', 0, 5, 10, 0, P)
  b.set('gear', 0, -1, 5, 0).set('antenna', 0, 5, 7, 0).set('beacon', 0, 4, 2, 0).set('flood', 0, 0, -11, 0)
  return b.bp
}

export const CAPITAL = { ardent, vagrant }
export const CAPITAL_LIST = ['ardent', 'vagrant']
