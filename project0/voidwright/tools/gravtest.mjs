// gravtest.mjs: which way is down inside ships and stations with gravity generators? (the Citadel's hub and
// ring, the Ardent's decks, and a spherical generator alone)
import * as THREE from 'three'
import { prefab } from '../src/game/prefabs.js'
import { Grid } from '../src/grid/grid.js'
import { load } from '../src/game/build.js'
import { World } from '../src/game/world.js'

const fake = { grids: [], universe: { gravity: (p, o) => o.set(0, 0, 0) } }
const felt = p => World.prototype.gravityFelt.call(fake, p, new THREE.Vector3())
const mk = id => { const g = new Grid({ creative: true, addGrid() {} }, prefab(id).size, {}); load(g, prefab(id)); g.updateMass(); g.power = { ratio: 1 }; return g }
const fmt = v => `${v.length().toFixed(2)} m/s2 toward ${['x', 'y', 'z'].map((a, i) => { const c = v.getComponent(i) / (v.length() || 1); return Math.abs(c) > 0.3 ? (c > 0 ? '+' : '-') + a : '' }).join('') || 'nothing'}`
let bad = 0
const check = (name, p, want) => {
  const v = felt(p), ok = want ? v.clone().normalize().dot(want) > 0.9 && Math.abs(v.length() - 9.81) < 0.5 : v.length() < 0.1
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'BAD '} ${name.padEnd(36)} ${fmt(v)}`)
}
const cit = mk('citadel'); cit.pos.set(0, 0, 0); fake.grids = [cit]
const at = (x, y, z) => cit.toWorld(new THREE.Vector3(x * 2.5, y * 2.5, z * 2.5))
check('Citadel hub, lower floor', at(0, -2, 3), new THREE.Vector3(0, -1, 0))
check('Citadel hub, middle', at(2, 1, 2), new THREE.Vector3(0, -1, 0))
check('Citadel ring, +x side', at(22, 0, 0), new THREE.Vector3(1, 0, 0))
check('Citadel ring, -z side', at(0, 0, -22), new THREE.Vector3(0, 0, -1))
const ard = mk('ardent'); fake.grids = [ard]
const aat = (x, y, z) => ard.toWorld(new THREE.Vector3(x * 2.5, y * 2.5, z * 2.5))
for (const [n, p] of [['Ardent bridge', ard.toWorld(new THREE.Vector3(0, 18.85, -1.5))], ['Ardent lower deck', aat(0, 2, 4)], ['Ardent hangar', ard.toWorld(new THREE.Vector3(0, 3, 45))]]) check(n, p, new THREE.Vector3(0, -1, 0))
// a spherical generator alone still pulls toward itself
const sph = new Grid({ creative: true, addGrid() {} }, 'large', {}); sph.add('gravgen_sphere', 0, 0, 0); sph.updateMass(); sph.power = { ratio: 1 }; fake.grids = [sph]
check('spherical generator, 20 m above it', sph.toWorld(new THREE.Vector3(0, 20, 0)), new THREE.Vector3(0, -1, 0))
process.exit(bad ? 1 : 0)
