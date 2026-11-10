// Survival logic without the renderer: dig a planet and an asteroid, refine, assemble, split ice, burn fuel.
import * as THREE from 'three'
import { Planet } from '../src/world/planet.js'
import { Asteroid } from '../src/world/asteroid.js'
import { Grid } from '../src/grid/grid.js'
import { Survival, netPut, netCount, netItems, gasTotal } from '../src/game/survival.js'
import { prefab } from '../src/game/prefabs.js'
import { ShipControl } from '../src/grid/ship.js'
import { ITEMS } from '../src/game/items.js'
const eng = { track: () => ({}), rel: (v, o) => o.copy(v), detailTex: null }
const P = new Planet({ id: 'h', name: 'H', R: 30000, g: 9.81, seed: 11, kind: 'terra', center: [0, 0, 0], ores: ['iron', 'nickel'], breathable: true }, eng)
const A = new Asteroid({}, { id: 'a', pos: new THREE.Vector3(200000, 0, 0), r: 80, seed: 5, stretch: [1, 0.8, 1.1], rot: [0, 0, 0], ores: ['iron', 'cobalt'], tint: [1, 1, 1] }, eng, null)
const solids = [P, A]
const world = { creative: false, grids: [], addGrid(g) { this.grids.push(g) }, sunDir: new THREE.Vector3(0, 1, 0), airAt: () => 1, gravityAt: (p, o) => o.set(0, -9.81, 0), sparks: { burst() {} },
  universe: { solidsNear: (p, pad, out) => { out.length = 0; for (const s of solids) if (s.sdf(p) < pad + 5) out.push(s); return out }, nearestPlanet: () => P } }
const S = new Survival(world)
Object.assign(world, { netCount: (g, id) => netCount(g, id), netTake: (g, id, n) => 0, gasTotal: (g, gas) => gasTotal(g, gas), gasTake: () => 0 })
// dig the planet
const d = new THREE.Vector3(0.3, 0.8, 0.5).normalize(), gp = d.clone().multiplyScalar(P.R + P.height(d.x, d.y, d.z))
const r1 = S.dig(gp, 0.9, 40); console.log('planet dig', JSON.stringify(r1), 'ground now', P.sdf(gp).toFixed(2), 'm above old point')
// dig the asteroid: march in from outside
const ap = new THREE.Vector3(200000 + 200, 0, 0); for (let i = 0; i < 300 && A.sdf(ap) > 0.1; i++) ap.x -= Math.max(0.1, A.sdf(ap) * 0.6)
const r2 = S.dig(ap, 1.0, 45); console.log('asteroid dig', JSON.stringify(r2), 'sdf after', A.sdf(ap).toFixed(2), 'digs', A.digs.length)
// a station works through ore
const g = new Grid(world, 'large', { static: true }); for (const [id, i, j, k, rot, c] of prefab('foothold').blocks) g.add(id, i, j, k, rot, c); g.updateMass()
for (const b of g.parts.tanks) b.gas = 0
netPut(g, 'ore_iron', 500); netPut(g, 'ore_ice', 100); netPut(g, 'ing_uranium', 5)
g.queue = [{ id: 'plate', n: 4 }, { id: 'construct', n: 3 }]
const sc = new ShipControl(world)
for (let i = 0; i < 240; i++) { sc.update(g, null, null, 0.25); S.update(0.25) }
const it = netItems(g); console.log('after 60 s:', [...it].map(([k, n]) => `${ITEMS[k].name} ${n.toFixed(1)}`).join(', '))
console.log('gas h2', Math.round(gasTotal(g, 'h2')), 'o2', Math.round(gasTotal(g, 'o2')), 'power', JSON.stringify(g.power), 'queue', JSON.stringify(g.queue), 'status', [...g.parts.refineries, ...g.parts.assemblers, ...g.parts.gasgens].map(b => b.name + ':' + b.status).join(' | '), 'cargo mass', Math.round(g.cargoMass || 0))
// suit
const man = { pos: gp.clone().addScaledVector(d, 2), oxygen: 50, fuel: 50, energy: 50, thrusting: 0, hurt() {}, seat: null }
world.airAt = () => 0; for (let i = 0; i < 60; i++) S.suit(man, 1); console.log('suit after 60 s in vacuum: o2', man.oxygen.toFixed(1))
world.airAt = () => 1; for (let i = 0; i < 10; i++) S.suit(man, 1); console.log('after 10 s in Halvor air: o2', man.oxygen.toFixed(1))
