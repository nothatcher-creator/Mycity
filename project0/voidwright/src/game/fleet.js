// A second shelf of blueprints: four ships in the two great screen traditions of starship design. One side
// loves saucers, long drive pods on pylons and swept wings; the other loves split-wing fighters and dagger
// hulls with a bridge tower. These are this game's own ships in those styles, with their own names; all of
// them fly, on a planet or off it.
import { R, F, BK, UPR, DNR, LF, RT, BP, Shape, skin, disc, strut } from './bpkit.js'

const glaze = (b, x, y, z, col) => { // a cockpit under four sloped panes
  b.set('cockpit', x, y, z, 0, col)
  b.set('window_slope', x - 1, y, z, R([-1, 0, 0]), 1).set('window_slope', x + 1, y, z, R([1, 0, 0]), 1).set('window_slope', x, y, z - 1, R([0, 0, -1]), 1).set('window_slope', x, y, z + 1, R([0, 0, 1]), 1)
}

// ---- Meridian: a saucer, a neck, an engine hull, two drive pods ----
function meridian() {
  const b = new BP('Meridian', 'large', { desc: 'Explorer, classic TV style: saucer, engine hull, two drive pods.' })
  const W = 13, G = 0, D = 1, RD = 5, BL = 6
  const s = new Shape()
  disc(s, 0, 6, -9, 7, W); disc(s, 0, 7, -9, 6, W); disc(s, 0, 5, -9, 5, G); disc(s, 0, 8, -9, 2, W)   // the saucer and its bridge
  for (let t = 0; t <= 2; t++) s.box(-1, 1, 4 - t, 4 - t, -5 + t, -2 + t, G)                              // the neck
  s.box(-2, 2, 0, 3, -2, 10, W).box(-1, 1, 1, 2, -3, -3, D).box(-1, 1, 1, 2, 11, 11, D)                  // the engine hull
  for (const sd of [-1, 1]) { strut(s, sd * 3, 3, sd * 6, 6, 6, 8, G); s.box(sd > 0 ? 6 : -7, sd > 0 ? 7 : -6, 7, 8, -2, 12, W) }   // pylons and pods
  s.paint((x, y, z) => Math.abs(x) >= 6 && y >= 7 && z >= -2 ? (z <= -1 ? RD : z >= 11 ? D : (y === 7 && z % 4 === 1 ? BL : null)) : null)
  s.paint((x, y, z) => y === 6 && x * x + (z + 9) * (z + 9) >= 49 ? D : null)                            // the rim
  s.paint((x, y, z) => Math.abs(x) === 2 && y === 2 && z >= -2 && z <= 10 ? D : null)
  skin(b, s, 'light', { solid: false })
  glaze(b, 0, 9, -9, W)
  for (const [x, z] of [[7, -9], [-7, -9], [0, -16], [5, -14], [-5, -14], [5, -4], [-5, -4]]) b.over('porthole', x, 6, z, R([1, 0, 0]), D)
  for (const z of [0, 3, 6, 9]) b.over('porthole', -2, 2, z, R([1, 0, 0]), D).over('porthole', 2, 2, z, R([1, 0, 0]), D)
  // the dish at the bow of the engine hull, the bay at its stern
  b.set('flood', 0, 1, -4, 0).set('flood', 0, 2, -4, 0).over('hull_tech', -1, 1, -3, 0, BL).over('hull_tech', 1, 1, -3, 0, BL).over('hull_tech', -1, 2, -3, 0, BL).over('hull_tech', 1, 2, -3, 0, BL)
  b.over('hangar', 0, 1, 11, R([0, 0, 1]), D).over('hangar', 0, 2, 11, R([0, 0, 1]), D)
  // inside
  b.over('jumpdrive', -1, 0, 4, 0, 0)
  b.set('core_small', -1, 1, 1).set('core_small', 1, 1, 1).set('core_small', -1, 2, 1).set('core_small', 1, 2, 1)
  b.set('gyro', -1, 1, 8).set('gyro', 1, 1, 8).set('gyro', -1, 2, 8).set('gyro', 1, 2, 8).set('gyro', 0, 1, 8).set('gyro', 0, 2, 8)
  b.set('battery', -1, 1, 9).set('battery', 1, 1, 9).set('battery', -1, 2, 9).set('battery', 1, 2, 9)
  b.set('gravgen', 0, 6, -9).set('medbay', -2, 6, -10, 0, 3).set('survival_kit', 2, 6, -9, 0, 3).set('assembler', 0, 1, 3, 0, 1).set('cargo_s', -3, 6, -8, 0, 4).set('cargo_s', 3, 6, -8, 0, 4).set('o2h2', 3, 6, -11, 0, 1).set('tank_o2', 0, 1, -1, 0)
  b.set('tank_h2', -1, 4, 1, 0, 1)
  // drive: the pods and the stern; brakes at the bow; lift under the hull
  for (const sd of [-1, 1]) for (const [dx, y] of [[0, 7], [0, 8], [1, 7], [1, 8]]) b.set('thr_ion_small', sd > 0 ? 6 + dx : -7 + dx, y, 13, F, 1)
  b.set('thr_h2_small', -2, 1, 11, F, 1).set('thr_h2_small', 2, 1, 11, F, 1).set('thr_h2_small', -2, 2, 11, F, 1).set('thr_h2_small', 2, 2, 11, F, 1)
  b.set('thr_ion_small', -2, 0, -3, BK, 1).set('thr_ion_small', 2, 0, -3, BK, 1).set('thr_ion_small', -2, 3, -3, BK, 1).set('thr_ion_small', 2, 3, -3, BK, 1)
  for (const z of [-1, 2, 7, 10]) for (const x of [-2, 0, 2]) if (!(x === 0 && (z === 2 || z === 7))) b.over('thr_h2_small', x, 0, z, UPR, 1)
  b.set('thr_ion_small', -1, 4, 9, DNR, 1).set('thr_ion_small', 1, 4, 9, DNR, 1).set('thr_ion_small', -1, 4, 5, DNR, 1).set('thr_ion_small', 1, 4, 5, DNR, 1)
  b.set('thr_ion_small', -3, 1, 0, RT, 1).set('thr_ion_small', 3, 1, 0, LF, 1).set('thr_ion_small', -3, 1, 3, RT, 1).set('thr_ion_small', 3, 1, 3, LF, 1)
  for (const sd of [-1, 1]) for (const z of [1, 5, 9]) b.set('lightstrip', sd > 0 ? 6 : -6, 9, z, 0)
  b.set('gear', -1, -1, 0, 0).set('gear', 1, -1, 0, 0).set('gear', -1, -1, 9, 0).set('gear', 1, -1, 9, 0)
  b.set('antenna', 0, 8, -5, 0).set('warnlight', 0, 9, -7, 0).set('beacon', 0, 4, 10, 0)
  return b.bp
}

// ---- Talon: a warship like a stooping bird: a head on a long neck, wings swept down to gun pods ----
function talon() {
  const b = new BP('Talon', 'large', { desc: 'Raider, classic TV style: long neck, wings swept to gun pods.' })
  const P = 8, A = 2, RD = 5
  const s = new Shape()
  s.box(-1, 1, 3, 4, -15, -12, P).box(-1, 1, 3, 3, -16, -16, P).box(-2, 2, 3, 3, -14, -12, P)          // the head
  s.box(0, 0, 3, 4, -11, -5, A)                                                                         // the neck
  s.box(-3, 3, 2, 5, -4, 6, P).box(-2, 2, 6, 6, -2, 5, A).box(-5, 5, 3, 4, 0, 6, P)                     // the body and shoulders
  for (const sd of [-1, 1]) {
    let py = 4
    for (let x = 6; x <= 12; x++) {
      const y = 4 - Math.floor((x - 5) * 0.62), z0 = -1 - Math.floor((x - 6) * 0.9), z1 = 6 - Math.floor((x - 6) * 0.5)
      for (let z = z0; z <= z1; z++) { s.add(sd * x, y, z, x % 3 === 0 ? A : P); if (y !== py) s.add(sd * x, py, z, P) }
      py = y
    }
    s.box(sd > 0 ? 12 : -13, sd > 0 ? 13 : -12, 0, 1, -10, -2, A)                                       // a gun pod at each tip
  }
  s.paint((x, y, z) => y === 2 && Math.abs(x) <= 3 ? A : null)
  skin(b, s, 'light', { solid: false })
  glaze(b, 0, 5, -14, P)
  for (const x of [-1, 1]) b.over('porthole', x, 4, -16 + 1, R([0, 0, -1]), P)
  for (const sd of [-1, 1]) { const x = sd > 0 ? 12 : -13; b.set('gun_rocket', x, 0, -13, F, A).set('gun_auto', x + 1, 1, -13, F, A).set('warnlight', x, 2, -6, 0) }
  for (const z of [-2, 1, 4]) b.over('hull_vent', -3, 4, z, 0, A).over('hull_vent', 3, 4, z, 0, A)
  // inside the body
  b.set('core_small', -1, 3, 0).set('core_small', 1, 3, 0).set('core_small', -1, 4, 0).set('core_small', 1, 4, 0).set('core_small', 0, 3, 0).set('core_small', 0, 4, 0)
  b.over('tank_h2', -1, 3, 1, 0, 1)
  b.set('gyro', -1, 3, 4).set('gyro', 1, 3, 4).set('gyro', -1, 4, 4).set('gyro', 1, 4, 4).set('gyro', 0, 4, 4).set('gyro', 0, 3, 5)
  b.set('battery', -2, 3, 4).set('battery', 2, 3, 4).set('battery', -2, 4, 4).set('battery', 2, 4, 4).set('gravgen', 0, 3, 4).set('medbay', 0, 3, -3, 0, 3).set('survival_kit', -2, 3, -2, 0, 3).set('cargo_s', 2, 3, -2, 0, 4)
  // drive: a red furnace across the stern, brakes under the head, lift under the body and shoulders
  for (const x of [-2, 0, 2]) for (const y of [3, 4]) b.set('thr_h2_small', x, y, 7, F, RD)
  for (const x of [-4, 4]) b.set('thr_ion_small', x, 3, 7, F, RD).set('thr_ion_small', x, 4, 7, F, RD)
  b.set('thr_ion_small', -2, 4, -5, BK, 1).set('thr_ion_small', 2, 4, -5, BK, 1).set('thr_ion_small', -3, 3, -5, BK, 1).set('thr_ion_small', 3, 3, -5, BK, 1)
  for (const [x, z] of [[-2, -3], [2, -3], [-2, 1], [2, 1], [-2, 5], [2, 5], [0, -1], [0, 3]]) b.over('thr_h2_small', x, 2, z, UPR, 1)
  for (const [x, z] of [[-4, 2], [4, 2], [-4, 5], [4, 5]]) b.set('thr_h2_small', x, 2, z, UPR, 1)
  b.set('thr_ion_small', -1, 7, 0, DNR, 1).set('thr_ion_small', 1, 7, 0, DNR, 1).set('thr_ion_small', -1, 7, 4, DNR, 1).set('thr_ion_small', 1, 7, 4, DNR, 1)
  b.set('thr_ion_small', -4, 5, 3, RT, 1).set('thr_ion_small', 4, 5, 3, LF, 1).set('thr_ion_small', -2, 4, -13, RT, 1).set('thr_ion_small', 2, 4, -13, LF, 1)
  for (const sd of [-1, 1]) { const x = sd > 0 ? 12 : -13; b.set('gear', x, -1, -9, 0).set('gear', x + 1, -1, -3, 0) }
  b.set('antenna', 0, 7, 5, 0)
  return b.bp
}

// ---- Crossguard: a small-grid strike fighter: a long nose, four engines, four wings with a gun on each ----
function crossguard() {
  const b = new BP('Crossguard', 'small', { desc: 'Strike fighter, classic film style: four wings, four guns.' })
  const P = 3, A = 5, D = 2, G = 1
  const s = new Shape()
  s.box(-1, 1, 0, 2, -6, 9, P)                                                         // the body
  s.box(-1, 1, 0, 1, -15, -7, P).box(-1, 1, 0, 0, -19, -16, P).box(0, 0, 0, 0, -21, -20, P)   // the long nose
  s.box(-1, 1, 3, 3, 1, 8, P).box(-1, 1, -1, -1, 1, 8, P)                              // the spine behind the canopy, the keel
  for (const sd of [-1, 1]) {
    const x0 = sd > 0 ? 2 : -3
    s.box(x0, x0 + 1, 3, 4, 1, 9, G).box(x0, x0 + 1, -2, -1, 1, 9, G)                    // four engine barrels
    let pu = 4, pl = -2
    for (let x = 4; x <= 13; x++) {
      const up = 4 + Math.floor((x - 3) * 0.22), lo = -2 - Math.floor((x - 3) * 0.22)
      for (let z = 3; z <= 8; z++) {
        const c = x === 8 || x === 9 ? A : P
        s.add(sd * x, up, z, c); if (up !== pu) s.add(sd * x, pu, z, c)
        s.add(sd * x, lo, z, c); if (lo !== pl) s.add(sd * x, pl, z, c)
      }
      pu = up; pl = lo
    }
    for (const y of [pu, pl]) for (let z = -7; z <= 9; z++) s.add(sd * 14, y, z, z < -3 ? D : G)   // the guns
  }
  s.paint((x, y, z) => Math.abs(x) <= 1 && y === 2 && z >= 2 ? A : null)
  s.paint((x, y, z) => x === 0 && y <= 1 && z <= -8 && z >= -15 && y === 1 ? A : null)
  skin(b, s, 'light', { solid: true })
  b.set('canopy', -1, 3, -4, 0, D)
  b.over('detector', 0, 4, 2, 0)                                                        // the little dome behind the seat
  // four engines, lit; brakes by the nose; lift under the body and the lower barrels
  for (const sd of [-1, 1]) { const x0 = sd > 0 ? 2 : -3; for (const y of [3, 4, -2, -1]) for (const dx of [0, 1]) b.set('thr_h2_small', x0 + dx, y, 10, F, D) }
  b.set('thr_h2_small', -2, 0, -8, BK, D).set('thr_h2_small', 2, 0, -8, BK, D).set('thr_h2_small', -2, 1, -8, BK, D).set('thr_h2_small', 2, 1, -8, BK, D)
  for (const z of [-12, -9, -4, -1]) for (const x of [-1, 1]) b.over('thr_h2_small', x, 0, z, UPR, D)
  for (const sd of [-1, 1]) { const x0 = sd > 0 ? 2 : -3; for (const z of [3, 5, 7]) for (const dx of [0, 1]) b.over('thr_h2_small', x0 + dx, -2, z, UPR, D) }
  for (const sd of [-1, 1]) { const x0 = sd > 0 ? 2 : -3; for (const z of [3, 7]) b.set('thr_h2_small', x0, 5, z, DNR, D).set('thr_h2_small', x0 + 1, 5, z, DNR, D) }
  b.set('thr_h2_small', -2, 1, -3, RT, D).set('thr_h2_small', 2, 1, -3, LF, D).set('thr_h2_small', -2, 1, -11, RT, D).set('thr_h2_small', 2, 1, -11, LF, D)
  b.over('gyro', 0, 1, 2).over('gyro', 0, 1, 3).over('gyro', 0, 1, 4).over('battery', 0, 1, 6).over('battery', 0, 1, 7).over('core_small', 0, 1, 8).over('core_small', 0, 2, 8)
  b.over('tank_h2', -1, 0, -7, 0, 1).over('tank_o2', 0, 1, 0, 0, 1)
  // struts and feet below the lower barrels
  for (const sd of [-1, 1]) { const x0 = sd > 0 ? 2 : -3; for (const z of [1, 8]) { for (const y of [-3, -4]) for (const dx of [0, 1]) for (const dz of [0, 1]) b.set('light_cube', x0 + dx, y, z + dz, 0, D); b.set('gear', x0, -5, z, 0) } }
  b.set('flood', 0, 0, -22, 0)
  for (const sd of [-1, 1]) for (const y of [6, -4]) b.set('gun_auto', sd * 14, y, -10, F, D)
  for (const sd of [-1, 1]) b.set('lightstrip', sd * 6, 5, 5, 0)
  return b.bp
}

// ---- Bastion: a dagger of a warship: a wedge hull, terraces, a bridge tower, a wall of engines ----
function bastion() {
  const b = new BP('Bastion', 'large', { desc: 'Capital ship, classic film style: wedge hull, bridge tower.' })
  const G = 0, D = 1, K = 2, BL = 6
  const s = new Shape()
  const half = z => Math.floor((z + 19) * 0.34)
  for (let z = -18; z <= 10; z++) {
    const w = half(z)
    for (let x = -w; x <= w; x++) s.add(x, 2, z, G)
    if (w >= 2) for (let x = -w + 1; x <= w - 1; x++) { s.add(x, 3, z, G); s.add(x, 1, z, D) }
    if (w >= 5 && z >= -4) for (let x = -w + 4; x <= w - 4; x++) s.add(x, 0, z, D)
  }
  s.box(-2, 2, -1, -1, 1, 5, K)                                              // the belly dome
  s.box(-4, 4, 4, 4, -3, 8, G).box(-3, 3, 5, 5, 0, 8, G).box(-2, 2, 6, 6, 3, 8, D)   // the terraces
  s.box(-1, 1, 7, 8, 5, 7, G).box(-4, 4, 9, 10, 5, 7, G)                     // the tower and the bridge
  s.paint((x, y, z) => y === 2 && Math.abs(x) === half(z) ? K : null)      // the trench round the edge
  skin(b, s, 'light', { solid: false })
  for (let x = -3; x <= 3; x++) if (x) b.over('window', x, 9, 5, R([0, 0, -1]), 0)
  b.over('cockpit', 0, 9, 5, 0, G)
  b.set('beacon', -3, 11, 6, 0).set('beacon', 3, 11, 6, 0).set('antenna', 0, 11, 6, 0)
  // plating details on the upper deck, a pattern from the cell numbers
  for (let z = -12; z <= 9; z++) for (let x = -half(z) + 3; x <= half(z) - 3; x++) {
    if (s.has(x, 4, z) || !s.has(x, 3, z)) continue
    const h = ((x * 73856093) ^ (z * 19349663)) >>> 0
    if (h % 9 === 0) b.over('hull_tech', x, 3, z, 0, D); else if (h % 11 === 0) b.over('hull_vent', x, 3, z, 0, D); else if (h % 13 === 0) b.over('hull_grate', x, 3, z, 0, K)
  }
  for (const z of [-8, -4]) b.set('flood', 0, 4, z, 0)
  for (const [x, z] of [[-5, 4], [5, 4], [-3, -6], [3, -6]]) b.set('warnlight', x, 4, z, 0)
  b.set('turret_gatling', 5, 4, -1, 0, G).set('turret_gatling', -5, 4, -1, 0, G).set('turret_missile', 0, 7, 4, 0, G).set('turret_gatling', 2, 4, -8, 0, G).set('turret_gatling', -2, 4, -8, 0, G)
  // inside, under the terraces
  b.over('core_big', -1, 1, 6, 0).over('jumpdrive', -1, 1, 0, 0, 0).over('tank_h2', -1, 0, -3, 0, 1)
  for (const x of [-3, 3]) for (const z of [0, 2, 4]) b.over('gyro', x, 2, z).over('gyro', x, 3, z)
  for (const x of [-3, 3]) for (const z of [6, 7]) b.over('battery', x, 2, z).over('battery', x, 3, z)
  b.over('gravgen', 0, 5, 4).over('medbay', -2, 4, 2, 0, 3).over('survival_kit', 2, 4, 2, 0, 3).over('cargo_s', -2, 2, 0, 0, D).over('cargo_s', 2, 2, 0, 0, D).over('cargo_s', -2, 3, 0, 0, D).over('cargo_s', 2, 3, 0, 0, D)
  // the wall of engines, with small ones between; brakes forward; lift through the belly
  b.set('thr_ion_big', -1, 1, 11, F, K).set('thr_ion_big', -5, 1, 11, F, K).set('thr_ion_big', 3, 1, 11, F, K)
  for (const x of [-7, -6, 6, 7]) b.set('thr_h2_small', x, 2, 11, F, K)
  for (const x of [-2, 2]) b.set('thr_h2_small', x, 2, 11, F, K)
  for (const [x, z] of [[-2, -12], [2, -12], [-4, -6], [4, -6]]) b.over('thr_ion_small', x, 1, z, BK, 1)
  b.over('thr_h2_big', -1, 3, 2, UPR, 1)
  for (const [x, z] of [[-3, -6], [3, -6], [0, -10], [-6, 8], [6, 8], [-5, 2], [5, 2], [-1, 9], [1, 9], [0, -6]]) b.over('thr_h2_small', x, 1, z, UPR, 1)
  for (const [x, z] of [[-5, -2], [5, -2], [-6, 6], [6, 6]]) b.over('thr_ion_small', x, 3, z, DNR, 1)
  b.over('thr_ion_small', -6, 2, 0, RT, 1).over('thr_ion_small', 6, 2, 0, LF, 1).over('thr_ion_small', -8, 2, 6, RT, 1).over('thr_ion_small', 8, 2, 6, LF, 1)
  b.set('gear', -2, -3, 1, 0).set('gear', 2, -3, 1, 0).set('gear', -2, -3, 5, 0).set('gear', 2, -3, 5, 0)
  for (const [x, z] of [[-2, 1], [2, 1], [-2, 5], [2, 5]]) b.set('heavy_cube', x, -2, z, 0, K)
  return b.bp
}

export const FLEET = { meridian, talon, crossguard, bastion }
export const FLEET_LIST = ['meridian', 'talon', 'crossguard', 'bastion']
