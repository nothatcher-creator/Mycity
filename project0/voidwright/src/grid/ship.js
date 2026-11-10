// Flying a grid: thrusters grouped by the six directions they push, inertia dampeners that cancel drift
// and hold a hover against gravity, gyros that turn the grid at the rate the mouse asks for (and hold it
// still when it does not), and the power the thrusters and gyros draw from cores, batteries and the sun.
import * as THREE from 'three'
import { apply } from './rot.js'
import { works } from './grid.js'

const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
export const MAX_SPEED = 260

// a thruster's push in thick air or in space
export function thrustEff(kind, air) {
  if (kind === 'atmo') return Math.max(0, Math.min(1, (air - 0.08) / 0.62))
  if (kind === 'ion') return 1 - 0.7 * Math.min(1, air)
  return 1
}

export class ShipControl {
  constructor(world) { this.world = world; this.v = new THREE.Vector3(); this.g = new THREE.Vector3(); this.q = new THREE.Quaternion() }
  // ctl (cockpit-relative): move [x right, y up, z back], turn [pitch, yaw, roll] in rad/s wanted, or null
  update(grid, cockpit, ctl, dt) {
    grid.updateMass()
    const P = grid.parts, w = this.world, size = grid.size
    if (grid.h2ok === undefined) grid.h2ok = true
    grid.force = grid.force || new THREE.Vector3(); grid.torque = grid.torque || new THREE.Vector3()
    grid.force.set(0, 0, 0); grid.torque.set(0, 0, 0)
    grid.thrustOut = grid.thrustOut || new Float32Array(6); grid.thrustOut.fill(0)
    grid.thrustMax = grid.thrustMax || new Float32Array(6); grid.thrustMax.fill(0)
    if (grid.static || !grid.blocks.size || grid.locked) { for (const b of P.thrusters) b.out = 0; if (grid.parts) this.power(grid, dt); return }
    const com = grid.comWorld(this.v)
    const air = w.airAt(com)
    grid.air = air
    // power
    const pw = this.power(grid, dt)
    // thrust available per grid-local direction (the direction the grid is pushed)
    const d = [0, 0, 0]
    for (const b of P.thrusters) {
      if (!works(b)) { b.out = 0; b.eff = 0; continue }
      const f = b.def.func.thruster
      apply(b.rot, 0, 0, -1, d)
      const ax = d[0] ? (d[0] > 0 ? 0 : 1) : d[1] ? (d[1] > 0 ? 2 : 3) : (d[2] > 0 ? 4 : 5)
      b.axis = ax
      b.eff = thrustEff(f.kind, air) * (f.kind === 'h2' && !grid.h2ok ? 0 : 1)
      grid.thrustMax[ax] += f.force[size] * b.eff
    }
    // what the pilot (or the dampeners) want, in grid-local axes
    const m = grid.mass
    const vloc = grid.dirToLocal(grid.vel, new THREE.Vector3())
    const gl = grid.dirToLocal(w.gravityAt(com, this.g), new THREE.Vector3())
    grid.gravity = this.g.length()
    let move = [0, 0, 0]
    if (ctl && cockpit) apply(cockpit.rot, ctl.move[0], ctl.move[1], ctl.move[2], move)
    const want = [0, 0, 0]
    for (let a = 0; a < 3; a++) {
      const u = move[a], vv = [vloc.x, vloc.y, vloc.z][a], gg = [gl.x, gl.y, gl.z][a]
      if (Math.abs(u) > 0.01) want[a] = u * 1e9
      else if (grid.dampeners) want[a] = m * (-vv * 2.6 - gg)
    }
    // the force each direction group gives, and how hard each thruster runs
    const out = [0, 0, 0, 0, 0, 0]
    for (let a = 0; a < 3; a++) {
      const f = want[a]
      if (f > 0) out[a * 2] = Math.min(1, f / Math.max(1, grid.thrustMax[a * 2]))
      else if (f < 0) out[a * 2 + 1] = Math.min(1, -f / Math.max(1, grid.thrustMax[a * 2 + 1]))
    }
    // not enough power: everything runs at the share there is
    const k = pw.ratio
    for (let i = 0; i < 6; i++) { out[i] *= k; grid.thrustOut[i] = out[i] }
    let h2 = 0
    for (const b of P.thrusters) {
      if (!works(b)) continue
      b.out = (out[b.axis] || 0) * b.eff
      if (b.def.func.thruster.kind === 'h2') h2 += b.def.func.thruster.force[size] / 1350 * b.out
      const f = b.def.func.thruster.force[size] * b.out, A = AXES[b.axis]
      grid.force.x += A[0] * f; grid.force.y += A[1] * f; grid.force.z += A[2] * f
    }
    // the gyros: torque toward the turn rate wanted
    let tq = 0
    // fuel thrusters burn hydrogen from the tanks (in survival)
    if (w.creative) grid.h2ok = true
    else { if (h2 > 0) w.gasTake(grid, 'h2', h2 * dt); grid.h2ok = w.gasTotal(grid, 'h2') > 0 }
    for (const b of P.gyros) if (works(b)) tq += b.def.func.gyro[size]
    tq *= pw.ratio
    grid.gyroTorque = tq
    if (tq > 0) {
      const wl = grid.dirToLocal(grid.angVel, new THREE.Vector3())
      let tgt = [0, 0, 0]
      if (ctl && cockpit) apply(cockpit.rot, ctl.turn[0], ctl.turn[1], ctl.turn[2], tgt)
      else if (!grid.dampeners && !ctl) tgt = null
      if (tgt) {
        const e = new THREE.Vector3(tgt[0] - wl.x, tgt[1] - wl.y, tgt[2] - wl.z).divideScalar(0.18)
        const T = e.applyMatrix3(grid.I)
        // each axis limited by the gyros (big grids turn slowly)
        T.x = Math.max(-tq, Math.min(tq, T.x)); T.y = Math.max(-tq, Math.min(tq, T.y)); T.z = Math.max(-tq, Math.min(tq, T.z))
        grid.torque.copy(T)
      }
    }
    if (Math.abs(grid.force.x) + Math.abs(grid.force.y) + Math.abs(grid.force.z) > 1 || (ctl && (ctl.turn[0] || ctl.turn[1] || ctl.turn[2]))) grid.sleep = 0
  }
  // power: what the cores, batteries and solar arrays give against what the thrusters, gyros and other
  // blocks want; batteries charge from any spare
  power(grid, dt) {
    const P = grid.parts, size = grid.size
    let supply = 0, store = 0, want = 0
    const sun = this.world.sunDir
    const creative = this.world.creative
    for (const b of P.power) {
      if (!works(b)) continue
      const f = b.def.func.power
      // fusion cores need uranium in survival
      if (f.out && !f.store && !f.solar && !creative) { b.fuelled = this.world.netCount(grid, 'ing_uranium') > 0.001; if (!b.fuelled) continue }
      if (f.out && !f.store) {
        let o = f.out[size]
        if (f.solar) { const n = grid.dirToWorld(grid.blockDir(b, 0, 1, 0)); o *= Math.max(0, n.dot(sun)) * (this.world.inShadow?.(grid.comWorld()) ? 0 : 1) }
        supply += o
      }
      if (f.store && b.charge > 0) store += f.out[size]
      if (f.use) want += f.use[size]
    }
    for (const b of P.thrusters) if (works(b)) want += b.def.func.thruster.mw[size] * (b.out || 0)
    want += grid.extraPower || 0
    const total = supply + store
    const ratio = want > total ? total / want : 1
    // batteries: drain for the shortfall, charge from the surplus
    const bats = P.power.filter(b => works(b) && b.def.func.power.store)
    // uranium burns in proportion to what the cores give (a kilogram an hour for 15 MW)
    if (!creative && supply > 0) { const used = Math.min(supply, want); const cores = P.power.some(b => b.fuelled && !b.def.func.power.solar); if (cores && used > 0) this.world.netTake(grid, 'ing_uranium', used / 15 / 3600 * dt) }
    let deficit = Math.max(0, want - supply), surplus = Math.max(0, supply - want)
    for (const b of bats) {
      const cap = b.def.func.power.store[size], out = b.def.func.power.out[size]
      if (deficit > 0) { const take = Math.min(deficit, out); b.charge = Math.max(0, b.charge - take * dt / 3600); deficit -= take }
      else if (surplus > 0) { const give = Math.min(surplus, out); b.charge = Math.min(cap, b.charge + give * dt / 3600); surplus -= give }
    }
    grid.power = { supply, want, store: bats.reduce((s, b) => s + b.charge, 0), cap: bats.reduce((s, b) => s + b.def.func.power.store[size], 0), ratio: total > 0 ? Math.min(1, ratio) : (want > 0 ? 0 : 1) }
    if (this.world.creative && total === 0 && want > 0) grid.power.ratio = 0
    return grid.power
  }
}
