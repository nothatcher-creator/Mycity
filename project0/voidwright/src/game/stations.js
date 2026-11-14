// Haven Station: a massive working space station. A round hub of eight decks (reactor, command, crew cabins,
// two farm decks, mess and medical, workshop, observation) over a hangar with doors at both ends, and the
// moving parts on rotors and pistons:
//   - a habitat ring 120 m across on a rotor above the hub, turning slowly, gravity to its outer floor
//   - two solar wings on rotors either side of the hub, slowly tracking round
//   - a radar dish on a rotor under the hangar
//   - two docking arms on pistons out of the hangar's sides, with landing pads
//   - a cargo lift on a piston in the hangar floor, up to the ladder shaft through every deck
//   - a telescoping mast (a piston on a piston) on the hangar roof
// Everything is placed through the shipyard's Yard, so nothing overlaps and every part touches the station.
import { R, F, BK, LF, RT, UPR, UPSIDE, Shape, skin } from './bpkit.js'
import { Yard } from './shipyard.js'

const HULL = 0, BAND = 7, DARK = 1, ORANGE = 4, WHITE = 3, NAVY = 12, GREEN = 8
const TAU = Math.PI * 2
// the main axis pointing out of the hub at x, z
const outOf = (x, z) => Math.abs(x) >= Math.abs(z) ? [Math.sign(x) || 1, 0, 0] : [0, 0, Math.sign(z) || 1]

function haven() {
  const Y = new Yard('Haven Station', 'large', { static: true, desc: 'Massive station: eight decks (reactor, command, 8 crew cabins, two farm decks, mess and medical, workshop, observation) over a hangar with doors at both ends; a habitat ring 120 m across turning on a rotor, solar wings and a radar on rotors, docking arms, a cargo lift and a telescoping mast on pistons. B in a seat or the terminal runs the rotors, N the pistons.' })
  const b = Y.b
  const RH = 10.4, inHub = (x, z) => x * x + z * z <= RH * RH
  const s = new Shape()
  for (let x = -11; x <= 11; x++) for (let z = -11; z <= 11; z++) if (inHub(x, z)) for (let y = -4; y <= 28; y++) s.add(x, y, z, y % 4 === 0 && y < 28 ? BAND : HULL)
  s.box(-15, 15, -16, -4, -13, 13, DARK)
  skin(b, s, 'light')
  Y.index()
  const at = (x, y, z) => Y.cell.get((x + 1024) * 4194304 + (y + 1024) * 2048 + (z + 1024))
  const put = (id, x, y, z, rot = 0, col = 0, o) => Y.put(id, x, y, z, rot, col, o)
  // a plain hull cube swapped for another block (slopes and corners stay, so the outline stays smooth)
  const swap = (id, x, y, z, rot = 0, col = 0) => { const e = at(x, y, z); if (e && e[0] !== 'light_cube') return false; return Y.put(id, x, y, z, rot, col, { over: true }) }
  // the first of several spots and turns that fits
  const any = (id, spots, rots = [0], col = 0) => { for (const [x, y, z] of spots) for (const r of rots) if (put(id, x, y, z, r, col)) return true; return false }
  const shaft = (x, z) => Math.abs(x) <= 1 && Math.abs(z) <= 1
  const polar = (r, a, y) => [Math.round(Math.cos(a) * r), y, Math.round(Math.sin(a) * r)]
  // windows on the outside of the hub at height y: every `step`th cell round
  const glaze = (y, id = 'window', step = 1) => {
    let n = 0
    for (let x = -11; x <= 11; x++) for (let z = -11; z <= 11; z++) {
      if (!inHub(x, z) || !s.has(x, y, z)) continue
      const o = outOf(x, z)
      if (s.has(x + o[0], y, z + o[2])) continue
      if (n++ % step) continue
      swap(id, x, y, z, R(o), HULL)
    }
  }
  const ceilingLights = (y, every = 4, ok = () => true) => { for (let x = -9; x <= 9; x++) for (let z = -9; z <= 9; z++) if ((x + 20) % every === 0 && (z + 20) % every === 2 && x * x + z * z < 70 && !shaft(x, z) && ok(x, z)) put('lightpanel', x, y, z, UPSIDE) }

  // ---- the decks, the shaft through them, the ladder ----
  for (const y of [-4, 0, 4, 8, 12, 16, 20, 24]) for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) {
    if (x * x + z * z > 9.9 * 9.9 || shaft(x, z)) continue
    const edge = Math.max(Math.abs(x), Math.abs(z)) === 2
    swap(y === -4 ? 'heavy_cube' : edge ? 'hull_hazard' : y === 0 ? 'hull_tech' : 'hull_grate', x, y, z, 0, y === -4 ? DARK : edge ? ORANGE : DARK)
    if (!at(x, y, z)) put(edge ? 'hull_hazard' : 'hull_grate', x, y, z, 0, DARK, { free: true })
  }
  for (const y of [0, 4, 8, 12, 16, 20, 24]) for (const [x, z, r] of [[2, -1, LF], [2, 0, LF], [2, 1, LF], [-2, -1, RT], [-2, 0, RT], [-2, 1, RT], [-1, 2, BK], [1, 2, BK]]) put('railing', x, y + 1, z, r)
  for (let y = 27; y >= -10; y--) put('ladder', 0, y, 0, 0, DARK)

  // gravity: one generator to every three decks, its base to the floor (the boxes overlap; down stays down)
  put('gravgen', 2, -3, 2); put('gravgen', 2, 9, 2); put('gravgen', 2, 21, 2)

  // ---- reactor deck (y -3..-1) ----
  for (const [x, z] of [[3, -1], [-5, -1], [-1, 3], [-1, -5]]) put('core_big', x, -3, z, 0)
  for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; for (const y of [-3, -2]) put('battery', ...polar(8.4, a, y), 0, ORANGE) }
  for (const [x, z] of [[5, 5], [-5, 5], [5, -5], [-5, -5]]) put('warnlight', x, -3, z)
  ceilingLights(-1)

  // ---- command deck (y 1..3) ----
  put('command_chair', 0, 1, -5, F, NAVY)
  for (const x of [-2, -1, 0, 1, 2]) put('console', x, 1, -7, BK, 0)
  for (const x of [-4, 4]) { put('console', x, 1, -6, BK, 0); put('seat', x, 1, -5, F, NAVY) }
  put('holotable', 0, 1, 5); put('holotable', 5, 1, 2); put('holotable', -5, 1, 2)
  for (const [x, z] of [[-3, 6], [3, 6], [-3, 4], [3, 4]]) put('sofa', x, 1, z, x < 0 ? RT : LF, NAVY)
  for (const [x, z] of [[-7, -3], [7, -3], [-7, 4], [7, 4]]) put('locker', x, 1, z, x < 0 ? RT : LF)
  put('plant', -6, 1, 6); put('plant', 6, 1, 6)
  glaze(2); glaze(3)
  ceilingLights(3)

  // ---- crew deck (y 5..7): eight cabins round a corridor ----
  {
    const doors = new Set()
    for (let c = 0; c < 8; c++) { const [x, , z] = polar(5, (c + 0.5) / 8 * TAU, 0); doors.add(x + ',' + z) }
    for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) {
      const r = Math.hypot(x, z); if (r < 4.5 || r >= 5.5) continue
      for (let y = 5; y <= 7; y++) {
        if (y === 5 && doors.has(x + ',' + z)) { put('door', x, y, z, R(outOf(x, z)), WHITE, { free: true }); continue }
        put('light_cube', x, y, z, 0, WHITE, { free: true })
      }
    }
    // the walls between cabins: a ray out from the corridor, kept four-connected
    for (let c = 0; c < 8; c++) {
      const a = c / 8 * TAU; let px = null, pz = null
      for (let t = 5; t <= 9.8; t += 0.25) {
        const x = Math.round(Math.cos(a) * t), z = Math.round(Math.sin(a) * t)
        if (x * x + z * z > 9.9 * 9.9) break
        const cells = [[x, z]]; if (px !== null && px !== x && pz !== z) cells.push([px, z])
        for (const [cx, cz] of cells) for (let y = 5; y <= 7; y++) put('light_cube', cx, y, cz, 0, WHITE, { free: true })
        px = x; pz = z
      }
    }
    for (let c = 0; c < 8; c++) {
      const a = (c + 0.5) / 8 * TAU, o = outOf(Math.cos(a), Math.sin(a)), rot = R([-o[0], 0, -o[2]])
      const near = (r, da, y = 5) => polar(r, a + da, y)
      any('bed', [near(8.2, 0.12), near(8.2, -0.12), near(7.6, 0.15), near(7.6, -0.15), near(7, 0)], [F, BK, LF, RT], [NAVY, WHITE, GREEN, ORANGE][c % 4])
      any('locker', [near(8.6, -0.26), near(8.6, 0.26), near(8, -0.3)], [rot])
      any('shelf', [near(6.3, -0.3), near(6.3, 0.3)], [rot])
      any('plant', [near(6.4, 0.3), near(6.4, -0.3), near(7, 0.3)])
      any('table', [near(7.2, -0.18), near(7.2, 0.18)])
      any('lamp', [near(7, 0, 7), near(7.5, 0.1, 7), near(6.5, 0, 7)], [UPSIDE])
      const [wx, , wz] = polar(10, a, 0); for (const d of [0, 1, -1]) { const p = outOf(wx, wz), q = [p[2], 0, p[0]]; if (swap('porthole', wx + q[0] * d, 6, wz + q[2] * d, R(p), HULL)) break }
    }
    ceilingLights(7, 3, (x, z) => Math.hypot(x, z) < 4.4)
  }

  // ---- farm decks (y 9..11 and 13..15): planters in rows under grow lights ----
  for (const [fy, along, half] of [[9, 'x', 0], [13, 'z', -1]]) {
    for (let x = -9; x <= 9; x++) for (let z = -9; z <= 9; z++) {
      if (x * x + z * z > 8.4 * 8.4 || (Math.abs(x) <= 2 && Math.abs(z) <= 2)) continue
      if (half && x > 1) continue
      const row = along === 'x' ? z : x
      if (((row % 3) + 3) % 3 === 0) continue
      if (put('planter', x, fy, z, 0, DARK) && (x + z) % 2 === 0) put('lightpanel', x, fy + 2, z, UPSIDE)
    }
    glaze(fy + 1, 'window', 2)
  }
  // the second farm's other half: a garden lounge
  for (const [x, z] of [[4, -6], [4, 6], [7, -3], [7, 3]]) { put('table', x, 13, z); any('sofa', [[x + 1, 13, z], [x - 1, 13, z], [x, 13, z + 1]], [LF, RT, BK], GREEN) }
  for (const [x, z] of [[3, -3], [3, 3], [5, 0], [8, 0], [6, -7], [6, 7], [3, -8], [3, 8]]) put('plant', x, 13, z)
  any('o2h2', [[-8, 9, 3], [-8, 9, 0], [-9, 9, 0]], [0, LF], WHITE); any('o2h2', [[-8, 9, -3], [-8, 9, -6], [-9, 9, -3]], [0, LF], WHITE); put('tank_o2', 8, 9, 0)
  ceilingLights(15, 4, (x, z) => x > 2)

  // ---- mess and medical (y 17..19) ----
  for (let z = -9; z <= 9; z++) for (let y = 17; y <= 19; y++) if (z * z + 9 <= 96 && Math.abs(z) > 1) { if (y === 17 && z === -4) put('door', 3, y, z, RT, WHITE, { free: true }); else put('wall', 3, y, z, RT, WHITE, { free: true }) }
  for (const [x, z] of [[-4, -5], [-4, 5], [-7, -2], [-7, 2], [-4, 0]]) {
    if (!put('table', x, 17, z)) continue
    put('table', x, 17, z + 1)
    for (const [dx, dz, r] of [[-1, 0, RT], [1, 0, LF], [-1, 1, RT], [1, 1, LF]]) put('sofa', x + dx, 17, z + dz, r, ORANGE)
  }
  for (const z of [-7, -6, 6, 7]) any('shelf', [[-7, 17, z], [-6, 17, z]], [z < 0 ? BK : F])
  any('assembler', [[-2, 17, -8], [-2, 17, 8]], [0], 0)
  for (const z of [-5, -2, 2]) any('medbay', [[8, 17, z], [7, 17, z], [8, 17, z + 1]], [LF], WHITE)
  put('survival_kit', 5, 17, 7); put('locker', 6, 17, -7); put('locker', 5, 17, -7); put('holotable', 5, 17, 0); put('plant', 6, 17, 5)
  glaze(18, 'window', 3)
  ceilingLights(19)

  // ---- workshop (y 21..23) ----
  any('refinery', [[4, 21, -4], [4, 21, -5]], [0], DARK)
  for (const z of [-5, -3, 0]) any('assembler', [[-5, 21, z], [-6, 21, z]], [RT], DARK)
  any('cargo_l', [[-7, 21, 2], [-6, 21, 2]], [0], ORANGE)
  any('cargo_l', [[-2, 21, 5], [-2, 21, 4]], [0], ORANGE)
  any('tank_h2', [[3, 21, 4], [4, 21, 3]], [0], WHITE)
  put('o2h2', 7, 21, -1, LF); put('survival_kit', 7, 21, 1, LF)
  for (const z of [-8, -7]) for (const x of [-3, -2, -1]) put('cargo_s', x, 21, z, 0, ORANGE)
  ceilingLights(23)

  // ---- observation deck (y 25..27): glass all round ----
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, o = outOf(Math.cos(a), Math.sin(a)); any('sofa', [polar(7.2, a, 25), polar(6.6, a, 25)], [R([-o[0], 0, -o[2]])], NAVY) }
  for (let i = 0; i < 6; i++) put('plant', ...polar(5, (i + 0.5) / 6 * TAU, 25))
  put('holotable', 4, 25, 0); put('holotable', -4, 25, 0)
  glaze(25); glaze(26); glaze(27)
  for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) { const r = Math.hypot(x, z); if (r >= 3 && r <= 7.5) swap('skylight', x, 28, z, 0, HULL) }
  ceilingLights(27, 5, (x, z) => Math.hypot(x, z) < 3)

  // ---- the hangar (inside x -14..14, y -15..-5, z -12..12): doors at both ends ----
  for (let x = -8; x <= 8; x++) for (let y = -15; y <= -8; y++) { put('hangar', x, y, 13, BK, ORANGE, { over: true }); put('hangar', x, y, -13, F, ORANGE, { over: true }) }
  for (let x = -14; x <= 14; x++) for (let z = -12; z <= 12; z++) {
    const line = Math.abs(x) === 11 || Math.abs(z) === 10 || Math.max(Math.abs(x), Math.abs(z)) === 2
    swap(line ? 'hull_hazard' : 'hull_grate', x, -16, z, 0, line ? ORANGE : DARK)
  }
  put('gravgen', 8, -15, 0); put('gravgen', -8, -15, 0)
  for (const [x, z] of [[-7, -6], [7, -6], [-7, 6], [7, 6]]) put('connector', x, -15, z, UPR, ORANGE)
  for (const [x, z] of [[-14, -12], [12, -12], [-14, 10], [12, 10]]) put('cargo_l', x, -15, z, 0, ORANGE)
  any('tank_h2', [[12, -15, -4], [12, -15, 2]], [0], WHITE); any('o2h2', [[14, -15, 5], [13, -15, 5]], [0, BK], WHITE); any('o2h2', [[-14, -15, 5], [-13, -15, 5]], [0, BK], WHITE); put('tank_o2', -14, -15, -4)
  // catwalks along both sides, with ladders up to them, consoles and a seat for the deck chief
  for (const side of [-1, 1]) {
    for (let z = -8; z <= 9; z++) { put('catwalk', side * 14, -10, z, 0, DARK); put('railing', side * 13, -9, z, side > 0 ? RT : LF, ORANGE, { free: true }) }
    for (let y = -15; y <= -10; y++) put('ladder', side * 14, y, -9, R([-side, 0, 0]), DARK)
    put('console', side * 14, -9, 3, R([-side, 0, 0])); put('console', side * 14, -9, 4, R([-side, 0, 0])); put('seat', side * 14, -9, 5, R([-side, 0, 0]), NAVY)
    for (const z of [-11, 11]) put('flood', side * 14, -5, z, UPSIDE)
    for (const z of [-12, 12]) put('warnlight', side * 9, -8, z, 0)
  }
  for (let x = -12; x <= 12; x += 4) for (let z = -10; z <= 10; z += 4) put('lightpanel', x, -5, z, UPSIDE)

  // ---- outside ----
  for (let i = 0; i < 24; i++) put('lightstrip', ...polar(11.4, i / 24 * TAU, -3), 0, BAND)
  for (const [x, z] of [[-14, -12], [14, -12], [-14, 12]]) put('turret_gatling', x, -3, z, 0, DARK)
  for (const [x, z] of [[-12, -10], [12, 10], [-12, 10]]) put('turret_missile', x, -17, z, UPSIDE, DARK)
  put('beacon', 6, 29, 0, 0); put('antenna', -6, 29, 0, 0); put('dish', -1, 29, 5, 0, 0)
  for (const [x, z] of [[8, -5], [-8, -5], [8, 5], [-8, 5]]) put('warnlight', x, 29, z, 0)
  for (let y = 29; y <= 33; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) put('heavy_cube', x, y, z, 0, DARK)

  // ---- the moving parts ----
  // the habitat ring: on a rotor on the column, turning once in about two minutes
  b.rotor(0, 34, 0, 0, DARK, h => { h.bp.blocks = habitatRing().blocks }, true, 0.1)
  // solar wings: rotors out of each side, slowly tracking round
  for (const side of [-1, 1]) b.rotor(side * 11, 16, 0, R([0, 0, -1], [side, 0, 0]), DARK, h => {
    for (let y = 1; y <= 11; y++) h.set('girder', 0, y, 0, 0, DARK)
    const pan = R([0, -1, 0], [0, 0, 1])
    for (let y = 2; y <= 10; y += 2) h.set('solar', -1, y, 0, pan, 0).set('solar', 4, y, 0, pan, 0)
    h.set('warnlight', 0, 12, 0, 0)
  }, true, 0.15)
  // radar under the hangar
  b.rotor(6, -17, 6, UPSIDE, DARK, h => {
    for (const x of [-2, -1, 1, 2]) h.set('heavy_cube', x, 0, 0, 0, DARK)
    h.set('dish', -4, 1, -1, 0, 0).set('dish', 2, 1, -1, 0, 0).set('antenna', 0, 1, 0, 0)
  }, true)
  // docking arms: pistons out of the hangar's sides, each pushing a landing pad with a connector
  for (const side of [-1, 1]) b.piston(side * 15, -10, 0, R([0, 0, -1], [side, 0, 0]), ORANGE, h => {
    // head cells: y out along the arm, z the station's z, x the station's -y on the right (+y on the left)
    const upY = side > 0 ? -1 : 1
    for (let y = 1; y <= 2; y++) for (const z of [-1, 0, 1]) h.set('heavy_cube', 0, y, z, 0, DARK)
    for (let y = 3; y <= 7; y++) for (let z = -2; z <= 2; z++) h.set(y === 3 || y === 7 || Math.abs(z) === 2 ? 'hull_hazard' : 'hull_grate', 0, y, z, 0, y === 3 || y === 7 || Math.abs(z) === 2 ? ORANGE : DARK)
    h.set('connector', upY, 5, 0, R([upY, 0, 0], [0, 1, 0]), ORANGE)
    for (const [y, z] of [[3, -2], [3, 2], [7, -2], [7, 2]]) h.set('warnlight', upY, y, z, R([0, 0, -1], [upY, 0, 0]))
  }, 0)
  // the cargo lift: a platform on a piston in the hangar floor, rising 10 m to the foot of the ladder shaft
  b.piston(0, -16, 0, 0, ORANGE, h => {
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (x || z) h.set('hull_hazard', x, 0, z, 0, ORANGE)
  }, 0)
  // a telescoping mast on the hangar roof: a piston carrying a piston, both out
  b.piston(13, -3, 10, 0, DARK, h => {
    for (let y = 1; y <= 5; y++) h.set('girder', 0, y, 0, 0, DARK)
    h.set('warnlight', 1, 5, 0, 0)
    h.piston(0, 6, 0, 0, DARK, t => { for (let y = 1; y <= 2; y++) t.set('girder', 0, y, 0, 0, DARK); t.set('antenna', 0, 3, 0, 0).set('beacon', 0, 7, 0, 0) }, 10)
  }, 10)
  return b.bp
}

// the habitat ring, in its rotor head's cells (the head at 0,0,0, its top up): a hub column, four spokes and
// a ring 5 cells deep and 4 high. Its floor is its outer wall: gravity generators pull outward.
function habitatRing() {
  const H = new Yard('ring', 'large'), s = new Shape()
  const R0 = 19.5, R1 = 24.5
  for (let x = -25; x <= 25; x++) for (let z = -25; z <= 25; z++) { const r = Math.hypot(x, z); if (r >= R0 && r <= R1) for (let y = 0; y <= 3; y++) s.add(x, y, z, y === 3 && r > 23.5 ? BAND : HULL) }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let t = 2; t <= 20; t++) for (let a = -1; a <= 1; a++) s.add(dx * t + dz * a, 1, dz * t + dx * a, DARK)
  skin(H.b, s, 'light')
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) for (let y = 0; y <= 2; y++) if (x || y || z) H.b.set('heavy_cube', x, y, z, 0, DARK)
  H.index()
  const at = (x, y, z) => H.cell.get((x + 1024) * 4194304 + (y + 1024) * 2048 + (z + 1024))
  const swap = (id, x, y, z, rot, col) => { const e = at(x, y, z); if (e && e[0] !== 'light_cube') return false; return H.put(id, x, y, z, rot, col, { over: true }) }
  const P = (r, a, y) => [Math.round(Math.cos(a) * r), y, Math.round(Math.sin(a) * r)]
  // gravity generators, base to the outer wall
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + 0.2
    for (const r of [23, 22]) { const [x, , z] = P(r, a, 0), o = outOf(x, z); if (H.put('gravgen', x, 1, z, R([0, 1, 0], [-o[0], 0, -o[2]]))) break }
  }
  // along the ring: cabins' bunks, plants, lamps, tables and lockers on the outer floor, lights on the inner
  // wall, windows in the top
  const kit = ['bed', 'plant', 'table', 'locker', 'plant', 'sofa']
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * TAU, id = kit[i % kit.length], o = outOf(Math.cos(a), Math.sin(a)), up = [-o[0], 0, -o[2]], tan = [-o[2], 0, o[0]]
    for (const r of [23, 22.5, 22]) { const [x, , z] = P(r, a, 1); if (H.put(id, x, 1, z, R(tan, up), i % 12 === 0 ? GREEN : NAVY) || H.put(id, x, 2, z, R(tan, up), NAVY)) break }
    if (i % 3 === 0) for (const r of [20.5, 21]) { const [x, , z] = P(r, a, 1); if (H.put('lightpanel', x, 2, z, R([0, 1, 0], [o[0], 0, o[2]]))) break }
  }
  for (let x = -25; x <= 25; x++) for (let z = -25; z <= 25; z++) { const r = Math.hypot(x, z); if (r > 20.4 && r < 23.6 && (x + z) % 3 === 0) swap('skylight', x, 3, z, 0, HULL) }
  // a way in: doors in the underside at the four diagonals, near the floor
  for (let i = 0; i < 4; i++) { const a = (i + 0.5) / 4 * TAU; for (const r of [23, 22]) { const [x, , z] = P(r, a, 0), o = outOf(x, z); if (swap('door', x, 0, z, R([0, -1, 0], [-o[0], 0, -o[2]]), WHITE)) break } }
  // portholes round the outer face's upper row
  for (let i = 0; i < 48; i++) { const [x, , z] = P(24.3, i / 48 * TAU, 2); swap('porthole', x, 2, z, R(outOf(x, z)), HULL) }
  return H.b.bp
}

export const STATIONS = { haven }
export const HAVEN_LIST = ['haven']
