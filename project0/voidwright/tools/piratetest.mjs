// piratetest.mjs: a pirate's autopilot in empty space against a ship sitting still. Does it close in, circle,
// line its guns up (and so fire), and come alongside to rob when the target stays slow? (no renderer)
import * as THREE from 'three'
import { prefab } from '../src/game/prefabs.js'
import { Grid } from '../src/grid/grid.js'
import { ShipControl } from '../src/grid/ship.js'
import { Physics } from '../src/grid/physics.js'
import { load } from '../src/game/build.js'
import { Pirates } from '../src/game/pirates.js'

const world = {
  creative: true, grids: [], addGrid(g) { this.grids.push(g) }, removeGrid(g) { this.grids = this.grids.filter(x => x !== g) }, gridMat: null, glassMat: null, sunDir: new THREE.Vector3(0, 1, 0),
  airAt: () => 0, gravityAt: (p, o = new THREE.Vector3()) => o.set(0, 0, 0), gravityFelt(p, o = new THREE.Vector3()) { return o.set(0, 0, 0) },
  gasTotal: () => 1, gasTake: () => 1, gasPut: () => 0, netCount: () => 1, netTake: () => 0, netPut: () => 0, impact() {}, followLock() {}, inShadow: () => false,
  universe: { solidsNear: (p, pad, out = []) => { out.length = 0; return out }, sdf: () => 1e9, nearestPlanet: () => null },
  raycast: () => null,
}
const ships = new ShipControl(world), phys = new Physics(world)
const mk = (id, pos) => { const g = new Grid(world, prefab(id).size, {}); load(g, prefab(id)); g.updateMass(); g.pos.copy(pos); world.addGrid(g); return g }
for (const kind of (process.env.K || 'marauder,reaver').split(',')) {
  world.grids.length = 0
  const target = mk('mule', new THREE.Vector3(0, 0, 0))
  const P = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), seat: { grid: target } }
  const game = { player: P, world, state: 'play', settings: { pirates: 'off' }, scenario: 'orbit', hud: { toast: m => console.log('   toast:', m) }, sfx: { play() {} },
    spawnGrid: (id, p, q) => { const g = mk(id, p); g.quat.copy(q); return g } }
  // a little ore in the target's hold to steal
  for (const b of target.parts.invs) if (b.inv && b.def.func.cargo) b.inv.add('ore_iron', 400)
  const pir = new Pirates(game)
  const gr = pir.spawn(kind)
  gr.pos.copy(new THREE.Vector3(1900, 200, 600))
  const dt = 1 / 30
  let fireT = 0, minD = 1e9, states = new Set(), t = 0
  const dist = () => gr.comWorld(new THREE.Vector3()).distanceTo(target.comWorld(new THREE.Vector3()))
  const line = []
  for (; t < +(process.env.T || 20); t += dt) {
    if (Math.abs(t % 5) < dt) process.stderr.write(`t${Math.round(t)} `)
    pir.think(pir.list[0] || { grid: gr }, dt)
    if (!world.grids.includes(gr)) break
    const ai = gr.ai
    if (ai.ctl) ships.update(gr, ai.cockpit, ai.ctl, dt)
    phys.step(dt / 2); phys.step(dt / 2)
    states.add(ai.state); if (ai.fire) fireT += dt
    const d = dist(); minD = Math.min(minD, d)
    if (Math.abs(t % 3) < dt) line.push(`${Math.round(t)}s ${ai.state} e${(ai.err||[]).map(v=>v.toFixed(2))} ${Math.round(d)}m ${gr.vel.length().toFixed(0)}m/s`)
  }
  console.log(`${kind}: ${line.join(' | ')}`)
  console.log(`  states ${[...states].join('>')}, closest ${Math.round(minD)} m, guns lined up ${fireT.toFixed(1)} s of ${t.toFixed(0)} s`)
}
