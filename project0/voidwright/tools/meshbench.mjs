// meshbench.mjs: how long building the meshes of a few big designs takes (no renderer)
import * as THREE from 'three'
import { prefab } from '../src/game/prefabs.js'
import { Grid } from '../src/grid/grid.js'
import { load } from '../src/game/build.js'
const world = { creative: true, addGrid() {}, gridMat: new THREE.MeshBasicMaterial(), glassMat: new THREE.MeshBasicMaterial() }
for (const id of ['ardent', 'citadel', 'bulwark', 'crossguard']) {
  const g = new Grid(world, prefab(id).size, {}); load(g, prefab(id)); g.updateMass()
  const t0 = performance.now(); g.rebuild(1e9); const t = performance.now() - t0
  let v = 0; for (const ch of g.chunks.values()) v += ch.mesh?.geometry.attributes.position.count || 0
  console.log(`${id.padEnd(11)} ${g.blocks.size} blocks, ${v} vertices, meshed in ${t.toFixed(0)} ms`)
}
