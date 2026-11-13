// bpcheck.mjs [id ...]: for each design, the blocks that would not fit (with their cells), the number of
// separate pieces, lift against weight, thrust on each axis and what stands lowest.
import { PREFAB_LIST, prefab } from '../src/game/prefabs.js'
import { Grid } from '../src/grid/grid.js'
import { ShipControl } from '../src/grid/ship.js'
import * as THREE from 'three'
const world = { creative: true, addGrid() {}, gridMat: null, glassMat: null, sunDir: new THREE.Vector3(0, 1, 0), airAt: () => 1, gravityAt: (p, o) => o.set(0, -9.81, 0), gasTotal: () => 1, gasTake: () => 1, gasPut: () => 0, netCount: () => 0, netTake: () => 0, netPut: () => 0, universe: { nearestPlanet: () => null } }
const ids = process.argv.slice(2).length ? process.argv.slice(2) : PREFAB_LIST
let bad = 0
for (const id of ids) {
  const bp = prefab(id), g = new Grid(world, bp.size, {})
  const fails = []
  for (const [bid, i, j, k, rot, c] of bp.blocks) if (!g.add(bid, i, j, k, rot, c)) fails.push(`${bid}@${i},${j},${k}`)
  g.updateMass()
  let line = `${id.padEnd(11)} ${bp.size} blocks ${String(g.blocks.size).padStart(4)} pieces ${g.components().length} mass ${(g.mass / 1000).toFixed(0)} t`
  if (!bp.static) {
    try { new ShipControl(world).update(g, g.parts.cockpits[0], { move: [0, 0, 0], turn: [0, 0, 0] }, 0.016) } catch (e) { line += ' CONTROL ' + e.message }
    const wt = g.mass * 9.81, T = [...(g.thrustMax || [])].map(v => (v / wt).toFixed(2))
    line += ` thrust/weight [${T.join(' ')}] cockpits ${g.parts.cockpits.length} gyros ${g.parts.gyros.length}`
    let low = Infinity; for (const b of g.blocks) for (const key of b.cells) low = Math.min(low, Math.floor(key / 2048) % 2048 - 1024)
    const lowest = new Set(); for (const b of g.blocks) for (const key of b.cells) if (Math.floor(key / 2048) % 2048 - 1024 === low) lowest.add(b.id)
    line += ` lowest ${low}: ${[...lowest].join(',')}`
  }
  console.log(line)
  if (fails.length) { bad++; console.log('   DOES NOT FIT:', fails.slice(0, 30).join('  ')) }
  if (g.components().length > 1) { bad++; const cs = g.components().sort((a, b) => a.length - b.length); console.log('   LOOSE:', cs.slice(0, -1).map(c => c.slice(0, 4).map(b => `${b.id}@${b.i},${b.j},${b.k}`).join(' ') + (c.length > 4 ? ` (+${c.length - 4})` : '')).slice(0, 8).join(' | ')) }
}
process.exit(bad ? 1 : 0)
