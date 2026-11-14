// Pistons. A piston block pushes a head out along its top: the head is a grid of its own (it starts as one
// Piston Head block, and you build on it like any grid), held to the piston's grid as it slides. A large
// piston reaches 10 m, a small one 2 m. F on a piston or its head extends or retracts it; N in a seat runs
// every piston on the grid (and on the heads riding it); the terminal has the same. Break the piston and
// its head comes loose.
//
// A blueprint can carry what is built on each head: bp.heads = [{ at: [i, j, k], ext, blocks: [...] }],
// blocks in the head's own cells (its +Y pointing away from the piston, the head block itself at 0,0,0).
import * as THREE from 'three'
import { ROTS, QUATS, rotIndex, apply } from './rot.js'
import { works } from './grid.js'

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3()
const mul = (A, B) => { const C = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]; return C }
export const composeRot = (a, b) => rotIndex(mul(ROTS[a], ROTS[b]))

// where the head's cell 0,0,0 sits, in the piston grid's own frame
export function headLocal(g, b, ext, out = new THREE.Vector3()) {
  const up = apply(b.rot, 0, 1, 0, [0, 0, 0])
  g.blockCenter(b, out)
  return out.set(out.x + up[0] * (g.cs + ext), out.y + up[1] * (g.cs + ext), out.z + up[2] * (g.cs + ext))
}

// the head blocks of a blueprint as blocks of the main grid (for previews and ghosts: the machine as it
// stands, heads included)
export function flattenHeads(bp, cs) {
  const out = []
  // a frame: main cell = o + R(r) * local cell. A head's frame from the frame its piston sits in.
  const headFrame = (T, at, pr, ext) => {
    const lift = 1 + Math.round((ext || 0) / cs), d = apply(pr, 0, lift, 0, [0, 0, 0]), w = apply(T.r, at[0] + d[0], at[1] + d[1], at[2] + d[2], [0, 0, 0])
    return { o: [T.o[0] + w[0], T.o[1] + w[1], T.o[2] + w[2]], r: composeRot(T.r, pr) }
  }
  const put = (h, T, list) => {
    const pb = list.find(x => x[0] === 'piston' && x[1] === h.at[0] && x[2] === h.at[1] && x[3] === h.at[2])
    if (!pb) return
    const H = headFrame(T, h.at, pb[4], h.ext)
    for (const [id, i, j, k, rot, col] of [['piston_top', 0, 0, 0, 0, 0], ...h.blocks]) {
      const v = apply(H.r, i, j, k, [0, 0, 0])
      out.push([id, H.o[0] + v[0], H.o[1] + v[1], H.o[2] + v[2], composeRot(H.r, rot || 0), col || 0])
    }
    if (h.sub) put(h.sub, H, h.blocks)
  }
  for (const h of bp.heads || []) put(h, { o: [0, 0, 0], r: 0 }, bp.blocks)
  return out
}

export class Pistons {
  constructor(world) { this.W = world }
  // a fresh head for a piston, with any blueprint blocks on it
  attach(g, b) {
    const W = this.W, ext = b.ext || 0
    const pos = g.toWorld(headLocal(g, b, ext, v1), new THREE.Vector3())
    const q = g.quat.clone().multiply(QUATS[b.rot])
    const h = W.newGrid(g.size, pos, q, { static: false, name: `${g.name} Piston Head` })
    h.add('piston_top', 0, 0, 0, 0, b.color || 0)
    for (const [id, i, j, k, rot, col] of b.headBlocks || []) h.add(id, i, j, k, rot || 0, col || 0)
    // a piston on this head with its own head to come
    if (b.headSub) { const pb = h.at(...b.headSub.at); if (pb?.def.func.piston) { pb.headBlocks = b.headSub.blocks; pb.headSub = b.headSub.sub || null; pb.startExt = b.headSub.ext || 0 } }
    b.headBlocks = null; b.headSub = null
    h.updateMass(); h.rebuild()
    h.locked = { grid: g, relPos: headLocal(g, b, ext), relQuat: QUATS[b.rot].clone() }
    h.pistonOf = { grid: g, block: b }
    h.parentOf = g          // (no contacts between the head and the grid it rides)
    h.vel.copy(g.vel)
    b.head = h
    return h
  }
  toggle(b) {
    const f = b.def.func.piston, g = b.grid, travel = f.travel[g?.size || 'large']
    b.target = (b.target ?? 0) > travel * 0.5 ? 0 : travel
    return b.target > 0
  }
  // every piston on a grid and on the heads riding it (all out, or all in)
  toggleAll(g) {
    const L = []
    const walk = (x, d) => { if (d > 4) return; for (const b of x.parts?.pistons || []) { L.push(b); if (b.head) walk(b.head, d + 1) } }
    walk(g, 0)
    if (!L.length) return null
    const out = !L.some(b => (b.target ?? 0) > 0)
    for (const b of L) b.target = out ? b.def.func.piston.travel[b.grid?.size || 'large'] : 0
    return out
  }
  update(dt) {
    const W = this.W
    for (const g of [...W.grids]) {
      // a head whose piston is gone comes loose
      if (g.pistonOf) {
        const P = g.pistonOf
        if (!W.grids.includes(P.grid) || !P.grid.blocks.has(P.block) || g.locked?.grid !== P.grid) { g.pistonOf = null; g.parentOf = null; if (g.locked?.grid === P.grid) g.locked = null; g.sleep = 0; if (P.block.head === g) P.block.head = null }
      }
      const L = g.parts?.pistons
      if (!L?.length || g.frozen) continue
      for (const b of L) {
        b.grid = g
        const f = b.def.func.piston, travel = f.travel[g.size]
        if (b.ext == null) b.ext = Math.min(travel, b.startExt || 0)
        if (b.target == null) b.target = b.ext
        if (b.head && !W.grids.includes(b.head)) b.head = null
        if (!b.head && !b.noHead && b.build >= 1) this.attach(g, b)
        if (!b.head) continue
        // slide toward the target, if it has power
        // (a piston on a head runs on the power of the grid at the bottom of the chain)
        let root = g; for (let n = 0; root.pistonOf && n < 6; n++) root = root.pistonOf.grid
        const pw = root.power && (root.power.supply > 0 || root.power.store > 0) ? root.power : g.power
        const ok = works(b) && (!pw || pw.ratio > 0.05)
        const sp = f.speed[g.size] * (pw ? Math.min(1, pw.ratio) : 1)
        let v = 0
        if (ok && Math.abs(b.target - b.ext) > 1e-4) { const d = b.target - b.ext, step = Math.sign(d) * Math.min(Math.abs(d), sp * dt); b.ext += step; v = step / dt }
        b.moving = v
        const h = b.head
        if (h.locked?.grid !== g) continue
        headLocal(g, b, b.ext, h.locked.relPos)
        // the head carries what stands on it: its velocity includes the slide
        if (!h.locked.slide) h.locked.slide = new THREE.Vector3()
        h.locked.slide.copy(g.dirToWorld(v2.set(...apply(b.rot, 0, 1, 0, [0, 0, 0])))).multiplyScalar(v)
        W.followLock(h)
        if (v) {
          h.sleep = 0
          for (const o of W.grids) if (o !== h && !o.static && !o.locked && o.sleep > 0 && o.pos.distanceTo(h.pos) < o.radius + h.radius + 4) o.sleep = 0
        }
      }
    }
  }
}
