// voidtest.mjs: the void between the groups. How many lone rocks does the scanner see from points out
// there, how many are ice, which events do they carry, and does any lie inside a group or its star's sphere?
import * as THREE from 'three'
import { sectorDef, SECTOR, clusterStarPos } from '../src/world/universe.js'
import { voidSite, VOID_CELL } from '../src/world/void.js'

const defs = new Map(), get = (i, k) => { const key = i + ',' + k; if (!defs.has(key)) defs.set(key, sectorDef(i, k)); return defs.get(key) }
const nearGroup = (p, pad) => {
  const ci = Math.round(p.x / SECTOR), ck = Math.round(p.z / SECTOR)
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const d = get(ci + a, ck + b); if (!d.empty && p.distanceTo(new THREE.Vector3(...d.center)) < Math.max(pad, d.star ? d.star.dist + 2.2e6 : 0)) return true }
  return p.length() < pad + 6e6
}
let sites = 0, ice = 0, bad = 0
const ev = {}
const N = 14
for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) for (let k = -N; k <= N; k++) {
  const s = voidSite(i * 3, j * 3, k * 3, nearGroup)
  if (!s) continue
  sites++; if (s.kind === 'ice') ice++; ev[s.event || 'none'] = (ev[s.event || 'none'] || 0) + 1
  // check against every group's worlds and star over a day
  const p = new THREE.Vector3(...s.center), ci = Math.round(p.x / SECTOR), ck = Math.round(p.z / SECTOR)
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const d = get(ci + a, ck + b); if (d.empty) continue
    for (const x of d.bodies) if (p.distanceTo(new THREE.Vector3(...x.center)) < 2e6) bad++
    if (d.star) for (let t = 0; t < 24; t++) if (clusterStarPos(d.star, t * 150 * d.star.day, new THREE.Vector3()).distanceTo(p) < d.star.R * 6) bad++
  }
}
// what the scanner sees from points out in the void
const counts = []
for (let n = 0; n < 40; n++) {
  const at = new THREE.Vector3((Math.random() - 0.5) * 6e7, (Math.random() - 0.5) * 1e7, (Math.random() - 0.5) * 6e7)
  if (nearGroup(at, 2.5e6)) continue
  const ci = Math.floor(at.x / VOID_CELL), cj = Math.floor(at.y / VOID_CELL), ck = Math.floor(at.z / VOID_CELL)
  let c = 0
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let e = -2; e <= 2; e++) { const s = voidSite(ci + a, cj + b, ck + e, nearGroup); if (s && new THREE.Vector3(...s.center).distanceTo(at) < 1.5e6) c++ }
  counts.push(c)
}
counts.sort((a, b) => a - b)
console.log(`sampled cells: ${sites} sites, ${ice} of them ice; events ${JSON.stringify(ev)}`)
console.log(`seen by the scanner (1,500 km) from ${counts.length} points in the void: min ${counts[0]}, median ${counts[counts.length >> 1]}, max ${counts[counts.length - 1]}`)
console.log(`sites inside a group or within 6 radii of a star: ${bad}`)
process.exit(bad || !counts[0] && counts[counts.length >> 1] < 2 ? 1 : 0)
