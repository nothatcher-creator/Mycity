// parktest.mjs: ships set down on the floor of the Haven hangar in 1 g: do they come to rest and fall asleep,
// and what does each physics step cost while they settle? (no renderer; a stand-in world)
import * as THREE from 'three'
import { prefab } from '../src/game/prefabs.js'
import { Grid } from '../src/grid/grid.js'
import { ShipControl } from '../src/grid/ship.js'
import { Physics } from '../src/grid/physics.js'
import { load } from '../src/game/build.js'

const world = {
  creative: true, grids: [], addGrid(g) { this.grids.push(g) }, gridMat: null, glassMat: null, sunDir: new THREE.Vector3(0, 1, 0),
  airAt: () => 0, gravityAt: (p, o = new THREE.Vector3()) => o.set(0, -9.81, 0), gravityFelt(p, o = new THREE.Vector3()) { return o.set(0, -9.81, 0) },
  gasTotal: () => 1, gasTake: () => 1, gasPut: () => 0, netCount: () => 1, netTake: () => 0, netPut: () => 0, impact() {}, followLock() {}, inShadow: () => false,
  universe: { solidsNear: (p, pad, out = []) => { out.length = 0; return out }, sdf: () => 1e9, nearestPlanet: () => null },
  raycast() { return null },
}
const ships = new ShipControl(world), phys = new Physics(world)
const st = new Grid(world, 'large', { static: true }); load(st, prefab(process.env.STATION || 'haven')); st.updateMass()
const cs = st.cs, fleet = []
for (const [id, x, y, z] of [['sparrow', -7, -14, -4], ['pick', 7, -14, -3], ['hornet', 6, -13, 6]]) {
  const g = new Grid(world, prefab(id).size, {}); load(g, prefab(id)); g.updateMass(); g.pos.set(x * cs, y * cs, z * cs)
  // stood on the floor (its top at y -15.5 cells), sunk a few centimetres
  let low = Infinity; for (let i = 1; i < g.points.length; i += 3) low = Math.min(low, g.points[i])
  if (process.env.FLOOR) g.pos.y = -15.5 * cs - low + g.cs * 0.5 - 0.03
  fleet.push([id, g])
}
let calls = 0; const sdf0 = Grid.prototype.sdf; Grid.prototype.sdf = function (...a) { calls++; return sdf0.apply(this, a) }
const dt = 1 / 60
for (let sec = 1; sec <= (+process.env.SECS || 12); sec++) {
  calls = 0; const t0 = performance.now()
  for (let i = 0; i < 60; i++) { for (const [, g] of fleet) ships.update(g, null, null, dt); phys.step(dt / 2); phys.step(dt / 2) }
  const ms = (performance.now() - t0) / 60
  if (sec % 2 === 0 || sec === 1) console.log(`t ${String(sec).padStart(2)} s  ${ms.toFixed(2)} ms/frame  ${(calls / 60).toFixed(0)} hull tests/frame  ` + fleet.map(([id, g]) => `${id} v ${g.vel.length().toFixed(3)} w ${g.angVel.length().toFixed(3)} sleep ${g.sleep.toFixed(1)} y ${(g.pos.y / cs).toFixed(2)}`).join(' | '))
}
