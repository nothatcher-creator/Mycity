// crashtest.mjs: ships flown into flat ground and into each other at a few speeds. How much breaks, how
// many pieces fly off, how big a crater the ground takes? (no renderer; the world's own crash code)
import * as THREE from 'three'
import { prefab } from '../src/game/prefabs.js'
import { Grid } from '../src/grid/grid.js'
import { Physics } from '../src/grid/physics.js'
import { load } from '../src/game/build.js'
import { World } from '../src/game/world.js'

const ground = { sdf: p => p.y, surface: () => ({ nx: 0, ny: 1, nz: 0, ux: 0, uy: 1, uz: 0, h: 0 }), dig() {} }
const craters = []
const W = {
  creative: true, grids: [], time: 0, gridMat: null, glassMat: null, sunDir: new THREE.Vector3(0, 1, 0),
  addGrid(g) { this.grids.push(g) }, removeGrid(g) { this.grids = this.grids.filter(x => x !== g) },
  airAt: () => 1, gravityAt: (p, o = new THREE.Vector3()) => o.set(0, -9.81, 0), gravityFelt(p, o = new THREE.Vector3()) { return o.set(0, -9.81, 0) },
  gasTotal: () => 1, gasTake: () => 1, gasPut: () => 0, netCount: () => 1, netTake: () => 0, netPut: () => 0, followLock() {}, inShadow: () => false,
  universe: { solidsNear: (p, pad, out = []) => { out.length = 0; if (p.y < pad + 60) out.push(ground); return out }, sdf: p => p.y, nearestPlanet: () => null },
  raycast: () => null, sparks: { burst() {} }, combat: { flash() {}, sound() {} }, game: {},
  survival: { dig: (p, r) => craters.push(r) },
  onBlockRemoved(g) { g.splitPending = true },
  newGrid(size, pos, quat, o = {}) { return new Grid(this, size, { pos, quat, ...o }) },
}
for (const k of ['impact', 'damage', 'splitGrids']) W[k] = World.prototype[k]
const phys = new Physics(W)
const mk = (id, y, vy) => { const g = new Grid(W, prefab(id).size, {}); load(g, prefab(id)); g.updateMass(); g.pos.set(0, y, 0); g.vel.set(0, vy, 0); g.dampeners = false; return g }
for (const [id, speeds] of [['sparrow', [12, 25, 45, 80]], ['mule', [12, 25, 45, 80]], ['talon', [25, 60]]]) {
  for (const v of speeds) {
    W.grids.length = 0; craters.length = 0; W.time = 0
    const g = mk(id, 12, -v), n0 = g.blocks.size
    for (let i = 0; i < 180; i++) { W.time += 1 / 60; phys.step(1 / 120); phys.step(1 / 120); W.splitGrids() }
    const left = W.grids.reduce((s, x) => s + x.blocks.size, 0), pieces = W.grids.filter(x => x.blocks.size).length
    const fast = W.grids.filter(x => x !== g && x.vel.length() > 3).length
    console.log(`${id.padEnd(8)} into the ground at ${String(v).padStart(2)} m/s: ${n0 - left} of ${n0} blocks broken, ${pieces} pieces (${fast} still flying), crater ${craters.length ? Math.max(...craters).toFixed(1) + ' m' : 'none'}`)
  }
}
// two ships head on
for (const v of [20, 50]) {
  W.grids.length = 0; W.time = 0
  const a = mk('sparrow', 200, 0), b = mk('mule', 200, 0)
  a.pos.set(-30, 200, 0); b.pos.set(30, 200, 0); a.vel.set(v, 0, 0); b.vel.set(-v * 0.3, 0, 0)
  W.gravityFelt = (p, o = new THREE.Vector3()) => o.set(0, 0, 0)
  const na = a.blocks.size, nb = b.blocks.size
  for (let i = 0; i < 240; i++) { W.time += 1 / 60; phys.step(1 / 120); phys.step(1 / 120); W.splitGrids() }
  console.log(`sparrow into a mule at ${v} m/s: sparrow lost ${na - a.blocks.size} of ${na}, mule lost ${nb - b.blocks.size} of ${nb}, ${W.grids.filter(x => x.blocks.size).length} pieces in all`)
  W.gravityFelt = (p, o = new THREE.Vector3()) => o.set(0, -9.81, 0)
}
