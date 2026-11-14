// Machines that move: designs built round pistons (grid/pistons.js). The Piston Lift carries you up to a
// raised deck; the Strider is a lander on four piston legs that lift its body off the ground; the Bore Rig
// pushes a drill straight down on two pistons in a row.
import { R, F, BK, UPR, DNR, LF, RT, UPSIDE, BP, Shape, skin } from './bpkit.js'
import { INV } from '../grid/rot.js'

// ---- Piston Lift: a platform on a piston, up to a deck 10 m above the ground floor ----
function lift() {
  const b = new BP('Piston Lift', 'large', { static: true, ground: true, desc: 'A lift: a platform on a piston (F on it, or on the piston, to send it up or down) between a ground floor and a deck 10 m up, with a hold and power on the deck.' })
  const D = 1, A = 7, H = 5
  // the foundation: two layers, with a pit for the piston and the platform flush with the floor
  for (let x = -6; x <= 6; x++) for (let z = -4; z <= 4; z++) {
    const pit = Math.abs(x) <= 1 && Math.abs(z) <= 1
    if (!pit) b.set(Math.abs(x) === 6 || Math.abs(z) === 4 ? 'hull_hazard' : 'heavy_cube', x, -1, z, 0, D)
    if (!(x === 0 && z === 0)) b.set('heavy_cube', x, -2, z, 0, D)
  }
  // the piston in the pit; on its head, a 3 x 3 platform with railings round three sides
  b.piston(0, -2, 0, 0, H, s => {
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (x || z) s.set('heavy_cube', x, 0, z, 0, H)
    for (let x = -1; x <= 1; x++) s.set('railing', x, 1, -1, 0, A).set('railing', x, 1, 1, R([0, 0, 1]), A)
    s.set('railing', -1, 1, 0, R([-1, 0, 0]), A)
  })
  // the deck, level with the platform when it is all the way up (four cells: 10 m), on girder columns
  for (let x = 2; x <= 6; x++) for (let z = -4; z <= 4; z++) b.set(x === 6 || Math.abs(z) === 4 ? 'hull_hazard' : 'hull_grate', x, 3, z, 0, D)
  for (const [x, z] of [[2, -4], [2, 4], [6, -4], [6, 4], [4, -4], [4, 4]]) for (let y = 0; y <= 2; y++) b.set('girder', x, y, z, 0, 1)
  for (let z = -3; z <= 3; z++) b.set('railing', 6, 4, z, R([1, 0, 0]), A)
  for (let x = 3; x <= 5; x++) b.set('railing', x, 4, -4, 0, A).set('railing', x, 4, 4, R([0, 0, 1]), A)
  // on the deck: a hold, power, light, a beacon
  b.set('cargo_l', 3, 4, -3, 0, D)
  b.set('battery', 5, 4, 2, 0).set('battery', 5, 4, 3, 0).set('core_small', 4, 4, 3, 0).set('beacon', 2, 4, -3, 0).set('flood', 3, 4, 3, 0)
  // on the ground floor: a survival kit and a medbay, floodlights, warning lights by the pit
  b.set('survival_kit', -4, 0, -3, 0, 3).set('medbay', -5, 0, 2, 0, 3).set('flood', -6, 0, 0, R([1, 0, 0]))
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2]]) b.set('warnlight', x, 0, z, 0)
  b.set('core_small', -5, 0, -1, 0).set('lamp', -5, 1, -1, 0)
  return b.bp
}

// ---- Strider: a lander on four piston legs ----
function strider() {
  const b = new BP('Strider', 'large', { desc: 'Lander on four piston legs: land on its feet, then N (or the PISTONS button) stands it up 10 m over the ground, and back down to fly.' })
  const P = 11, A = 2
  const s = new Shape()
  s.box(-2, 2, 0, 1, -4, 4, P).box(-1, 1, 2, 2, -4, 0, A)
  s.paint((x, y, z) => y === 1 && Math.abs(x) === 2 ? A : null)
  skin(b, s, 'light', { solid: true })
  b.over('cockpit', 0, 2, -4, 0, P).over('window_slope', -1, 2, -4, R([0, 0, -1]), 1).over('window_slope', 1, 2, -4, R([0, 0, -1]), 1)
  // lift underneath (between the legs), and fuel thrusters every way
  for (const [x, z] of [[0, -3], [0, 3], [-1, 0], [1, 0], [0, -1], [0, 1]]) b.set('thr_atmo_small', x, -1, z, UPR, 1)
  for (const [x, z] of [[-1, -2], [1, -2], [-1, 2], [1, 2]]) b.over('thr_h2_small', x, 0, z, UPR, 1)
  b.set('thr_h2_small', -1, 1, 5, F, 1).set('thr_h2_small', 1, 1, 5, F, 1)
  b.set('thr_h2_small', -1, 0, -5, BK, 1).set('thr_h2_small', 1, 0, -5, BK, 1)
  b.set('thr_h2_small', -1, 5, 2, DNR, 1).set('thr_h2_small', 1, 5, 2, DNR, 1)
  b.set('thr_h2_small', -3, 0, 1, RT, 1).set('thr_h2_small', 3, 0, 1, LF, 1)
  b.over('gyro', -1, 1, 1).over('gyro', 1, 1, 1).over('battery', -1, 1, 3).over('battery', 1, 1, 3).over('core_small', 0, 1, 2).set('tank_h2', -1, 2, 1, 0, 1)
  // the legs: pistons in the corners pushing down; on each head a foot
  for (const [x, z] of [[-2, -4], [2, -4], [-2, 4], [2, 4]]) b.piston(x, 0, z, UPSIDE, A, h => h.set('heavy_cube', 0, 1, 0, 0, A))
  b.set('flood', -1, -1, -4, 0).set('flood', 1, -1, -4, 0).set('beacon', 0, 5, 2, 0).set('warnlight', 0, 3, -2, 0)
  return b.bp
}

// ---- Bore Rig: two pistons in a row push a drill straight down ----
function borer() {
  const b = new BP('Bore Rig', 'large', { static: true, ground: true, desc: 'A drilling rig: two pistons in a row push a drill 20 m straight down. Sit in its seat: N runs the pistons, the left button runs the drill; the ore goes into its hold.' })
  const D = 1, A = 5
  // a pad with a hole in the middle, a frame over it, a cab beside it
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) if (Math.abs(x) > 1 || Math.abs(z) > 1) b.set(Math.abs(x) === 4 || Math.abs(z) === 4 ? 'hull_hazard' : 'heavy_cube', x, -1, z, 0, D)
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) for (let y = 0; y <= 9; y++) b.set('girder', x, y, z, 0, 1)
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (!(x === 0 && z === 0)) b.set('heavy_cube', x, 10, z, 0, A)
  // the first piston hangs from the top of the frame pointing down; the second rides its head; the drill
  // rides the second head, its bit pointing down (the heads' own +Y is down)
  b.piston(0, 10, 0, UPSIDE, A, h1 => {
    h1.set('heavy_cube', -1, 0, 0, 0, A).set('heavy_cube', 1, 0, 0, 0, A)
    h1.over('piston', 0, 1, 0, 0, A)
  })
  // (the second piston's head: a plate, and the drill under it, its bit down)
  b.bp.heads[0].sub = { at: [0, 1, 0], ext: 0, blocks: [['heavy_cube', -1, 0, 0, 0, A], ['heavy_cube', 1, 0, 0, 0, A], ['drill', -1, 3, -1, UPR, A]] }
  b.set('cockpit', 3, 0, -3, R([-1, 0, 0]), A).set('window', 3, 1, -3, 0, 0)
  b.set('cargo_l', -4, 0, -1, 0, D).set('battery', -3, 0, 3, 0).set('battery', -3, 1, 3, 0).set('core_small', -3, 0, 2, 0)
  b.set('flood', -2, 10, -3, 0).set('flood', 2, 10, 3, 0).set('beacon', 0, 11, 2, 0).set('warnlight', -2, 11, -2, 0).set('warnlight', 2, 11, 2, 0)
  return b.bp
}

// ---- Mastodon: a heavy walker on four legs, a gun turret turning on a rotor ----
function mastodon() {
  const b = new BP('Mastodon', 'large', { desc: 'Heavy walker: an armoured hull on four 9 m legs. W and S walk, A and D turn it on the spot; B turns the gun turret on its rotor (B again stops it), the left button fires its guns.' })
  const P = 4, A = 2, D = 10
  const s = new Shape()
  s.box(-4, 4, 0, 2, -5, 5, P).box(-3, 3, 3, 3, -4, 4, P)                       // the hull and its upper deck
  s.box(-2, 2, 0, 2, -8, -6, A).box(-1, 1, 3, 3, -6, -5, A)                     // the cab out front
  s.sym(5, 5, 0, 1, -4, 4, D)                                                   // armour skirts along the sides
  s.paint((x, y, z) => y === 2 && Math.abs(x) === 4 ? A : null)
  skin(b, s, 'light', { solid: true })
  b.over('cockpit', 0, 1, -8, 0, A).over('window', -1, 2, -8, R([0, 0, -1]), 0).over('window', 1, 2, -8, R([0, 0, -1]), 0).over('window', 0, 2, -8, R([0, 0, -1]), 0)
  // the legs under the four corners
  for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) b.set('leg', x, -1, z, 0, D)
  // the turret: a rotor on the deck; on its head a ring, a gun house with two autocannons and two rocket
  // launchers, a gatling turret on its roof
  b.rotor(0, 4, 0, 0, A, h => {
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if ((x || z) && Math.abs(x) + Math.abs(z) < 4) h.set('heavy_cube', x, 0, z, 0, P)
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) h.set('heavy_cube', x, 1, z, 0, A)
    h.set('gun_auto', -1, 1, -4, F, A).set('gun_auto', 1, 1, -4, F, A).set('gun_rocket', -2, 0, -4, F, A).set('gun_rocket', 2, 0, -4, F, A)
    h.set('turret_gatling', 0, 2, 0, 0, A).set('flood', 0, 2, -1, 0)
  })
  b.over('battery', -1, 1, 2).over('battery', 1, 1, 2).over('core_small', 0, 1, 3).over('core_small', 0, 1, 1).over('gyro', -2, 1, 0).over('gyro', 2, 1, 0)
  b.over('cargo_s', -2, 1, 3, 0, P).over('survival_kit', 2, 1, 3, 0, 3)
  b.set('flood', -2, 1, -9, 0).set('flood', 2, 1, -9, 0).set('beacon', 0, 4, 4, 0).set('warnlight', -3, 4, -3, 0).set('warnlight', 3, 4, -3, 0).set('antenna', 3, 4, 3, 0)
  return b.bp
}

// ---- Watchtower: a radar station, its dish array turning on a rotor ----
function watchtower() {
  const b = new BP('Watchtower', 'large', { static: true, ground: true, desc: 'Radar station: a girder tower carrying a dish array on a rotor, turning from the moment it is built (F on the rotor stops it). A hut with power at its foot.' })
  const D = 1, A = 7
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) b.set(Math.abs(x) === 4 || Math.abs(z) === 4 ? 'hull_hazard' : 'heavy_cube', x, -1, z, 0, D)
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let y = 0; y <= 9; y++) b.set('girder', x, y, z, 0, 1)
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) b.set('heavy_cube', x, 10, z, 0, A)
  for (const y of [3, 6]) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (!(Math.abs(x) === 1 && Math.abs(z) === 1)) b.set('girder', x, y, z, 0, 1)
  b.rotor(0, 11, 0, 0, A, h => {
    for (const x of [-2, -1, 1, 2]) h.set('heavy_cube', x, 0, 0, 0, D)
    h.set('dish', -4, 1, -1, 0, 0).set('dish', 2, 1, -1, 0, 0).set('antenna', 0, 1, 0, 0)
  }, true)
  // the hut: power and a seat
  for (let x = 2; x <= 3; x++) for (let z = 2; z <= 3; z++) for (let y = 0; y <= 1; y++) b.set('light_cube', x, y, z, 0, A)
  b.set('battery', -3, 0, 3, 0).set('battery', -2, 0, 3, 0).set('core_small', -3, 0, 2, 0).set('beacon', 3, 2, 3, 0).set('flood', -3, 0, -3, 0).set('lamp', 2, 2, 2, 0)
  return b.bp
}

export const MACHINES = { lift, strider, borer, mastodon, watchtower }
export const MACHINE_LIST = ['strider', 'mastodon', 'lift', 'borer', 'watchtower']
