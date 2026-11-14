import { PREFAB_LIST, prefab } from '../src/game/prefabs.js'
import { Grid } from '../src/grid/grid.js'
import { ShipControl } from '../src/grid/ship.js'
import * as THREE from 'three'
const world = { creative: true, addGrid() {}, gridMat: null, glassMat: null, sunDir: new THREE.Vector3(0, 1, 0), airAt: () => 1, gravityAt: (p, o) => o.set(0, -9.81, 0), gasTotal: () => 1, gasTake: () => 0, netCount: () => 1, netTake: () => 0 }
for (const id of PREFAB_LIST) {
  const bp = prefab(id), g = new Grid(world, bp.size, {})
  let fail = 0, failed = {}
  for (const [bid, i, j, k, rot, c] of bp.blocks) if (!g.add(bid, i, j, k, rot, c)) { fail++; failed[bid] = (failed[bid] || 0) + 1 }
  g.updateMass()
  const sc = new ShipControl(world)
  sc.update(g, g.parts.cockpits[0], { move: [0, 0, 0], turn: [0, 0, 0] }, 0.016)
  const up = g.thrustMax[2], wt = g.mass * 9.81
  console.log(id, bp.size, 'pieces', g.components().length, 'blocks', g.blocks.size, 'failed', fail, JSON.stringify(failed), 'mass', Math.round(g.mass), 'kg', 'lift/weight', (up / wt).toFixed(2), 'fwd', (g.thrustMax[5] / wt).toFixed(2), 'cockpits', g.parts.cockpits.length, 'radius', g.radius.toFixed(1), 'pts', g.points.length / 3)
  let t = performance.now(); for (const [ck, ch] of g.chunks) g.buildChunk(ck, ch); console.log('  mesh build', (performance.now() - t).toFixed(1), 'ms', [...g.chunks.values()].reduce((s, c) => s + (c.mesh ? c.mesh.geometry.attributes.position.count / 3 : 0), 0), 'tris')
}
// the lowest cells of each ship should include its landing clamps
for (const id of ['sparrow', 'pick', 'mule', 'mole', 'lancer', 'meridian', 'talon', 'crossguard', 'bastion', 'ardent', 'vagrant']) {
  const bp = prefab(id), g = new Grid(world, bp.size, {})
  for (const [bid, i, j, k, rot, c] of bp.blocks) g.add(bid, i, j, k, rot, c)
  let low = Infinity; for (const b of g.blocks) for (const key of b.cells) { const j = Math.floor(key / 2048) % 2048 - 1024; low = Math.min(low, j) }
  const lowest = new Set(); for (const b of g.blocks) for (const key of b.cells) { const j = Math.floor(key / 2048) % 2048 - 1024; if (j === low) lowest.add(b.id) }
  console.log(id, 'lowest row', low, [...lowest].join(','))
}
