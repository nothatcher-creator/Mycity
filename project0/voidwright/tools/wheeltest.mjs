// wheeltest.mjs: the wheeled and tracked designs on a flat plane: do they settle on their springs, drive,
// steer, and stop? (no renderer; a stand-in world with flat ground at y = 0 and 1 g)
import * as THREE from 'three'
import { prefab } from '../src/game/prefabs.js'
import { Grid } from '../src/grid/grid.js'
import { ShipControl } from '../src/grid/ship.js'
import { Physics } from '../src/grid/physics.js'
import { load } from '../src/game/build.js'

const ground = { sdf: p => p.y, surface: () => ({ nx: 0, ny: 1, nz: 0, ux: 0, uy: 1, uz: 0, h: 0 }) }
const world = {
  creative: true, grids: [], addGrid(g) { this.grids.push(g) }, gridMat: null, glassMat: null, sunDir: new THREE.Vector3(0, 1, 0),
  airAt: () => 1, gravityAt: (p, o = new THREE.Vector3()) => o.set(0, -9.81, 0), gravityFelt(p, o = new THREE.Vector3()) { return o.set(0, -9.81, 0) },
  gasTotal: () => 1, gasTake: () => 1, gasPut: () => 0, netCount: () => 1, netTake: () => 0, netPut: () => 0, impact() {}, followLock() {}, inShadow: () => false,
  universe: { solidsNear: (p, pad, out = []) => { out.length = 0; if (p.y < pad + 40) out.push(ground); return out }, sdf: p => p.y, nearestPlanet: () => null },
  raycast(o, d, max, skip) { if (d.y >= -1e-6) return null; const t = -o.y / d.y; return t >= 0 && t <= max ? { solid: ground, dist: t, point: o.clone().addScaledVector(d, t) } : null },
}
const ships = new ShipControl(world), phys = new Physics(world)
for (const id of ['buggy', 'rover', 'crawler']) {
  world.grids.length = 0
  const g = new Grid(world, prefab(id).size, {}); load(g, prefab(id)); g.updateMass()
  g.pos.set(0, 4, 0)
  const seat = g.parts.cockpits[0], dt = 1 / 60
  const run = (sec, move) => { for (let i = 0; i < sec * 60; i++) { ships.update(g, seat, { move, turn: [0, 0, 0] }, dt); phys.step(dt / 2); phys.step(dt / 2) } }
  let low = Infinity; for (let i = 1; i < g.points.length; i += 3) low = Math.min(low, g.points[i])
  run(4, [0, 0, 0])
  const hull = g.pos.y + low - g.cs * 0.5
  const out = [`${id.padEnd(8)} mass ${(g.mass / 1000).toFixed(1)} t; at rest: hull ${hull.toFixed(2)} m above ground, touching ${g.wheelContacts}/${g.parts.wheels.length}, springs ${g.parts.wheels.map(w => (w.susp || 0).toFixed(2)).join(' ')}`]
  const p0 = g.comWorld().clone(), f0 = g.dirToWorld(g.blockDir(seat, 0, 0, -1))
  run(6, [0, 0, -1])
  const v = g.vel.length(), moved = g.comWorld().sub(p0)
  out.push(`  6 s full throttle: ${v.toFixed(1)} m/s, ${moved.dot(f0).toFixed(1)} m forward, ${Math.abs(moved.dot(new THREE.Vector3().crossVectors(f0, new THREE.Vector3(0, 1, 0)))).toFixed(1)} m sideways, tilt ${(Math.acos(Math.min(1, new THREE.Vector3(0, 1, 0).applyQuaternion(g.quat).y)) * 57.3).toFixed(1)} deg`)
  const yaw0 = Math.atan2(f0.x, f0.z)
  run(4, [1, 0, -0.6])
  const f1 = g.dirToWorld(g.blockDir(seat, 0, 0, -1)), turned = (Math.atan2(f1.x, f1.z) - yaw0) * 57.3
  out.push(`  4 s turning right: turned ${(((turned + 540) % 360) - 180).toFixed(0)} deg, speed ${g.vel.length().toFixed(1)} m/s`)
  run(4, [0, 0, 0])
  out.push(`  4 s brakes (dampeners on): ${g.vel.length().toFixed(2)} m/s, hull ${(g.pos.y + low - g.cs * 0.5).toFixed(2)} m up`)
  console.log(out.join('\n'))
}
