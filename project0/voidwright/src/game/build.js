// Building, the way these games do it: pick a block from the toolbar and a see-through copy of it hangs
// where it would go (snapped to the grid you are looking at, or free in front of you to start a new
// grid); turn it with the rotation keys (about the grid axes nearest your view's), place it with the left
// button, take blocks away with the right. Ctrl + drag places a line, Ctrl + Shift + drag a plane. The
// welder repairs, the grinder takes blocks apart, the middle button paints. Ctrl + C / Ctrl + V copy and
// paste whole grids.
import * as THREE from 'three'
import { BLOCKS, CELL, blockGeo, hasSize } from '../grid/blocks.js'
import { ROTS, QUATS, turn, apply } from '../grid/rot.js'
import { Grid } from '../grid/grid.js'

export const DEFAULT_BAR = [
  { block: 'light_cube' }, { block: 'light_slope' }, { block: 'light_corner' }, { block: 'thr_h2_small' }, { block: 'gyro' },
  { block: 'cockpit' }, { block: 'battery' }, { tool: 'welder' }, { tool: 'grinder' },
]
export const TOOLS = { welder: { name: 'Welder', desc: 'Hold the left button on a block to repair it.' }, grinder: { name: 'Grinder', desc: 'Hold the left button on a block to cut it apart.' }, paint: { name: 'Paint Gun', desc: 'Left button paints a block; P picks the colour.' } }
const GHOST_GEO = new Map()

function ghostGeometry(id, size, variant = '') {
  const k = id + size + variant
  if (GHOST_GEO.has(k)) return GHOST_GEO.get(k)
  const parts = blockGeo(id, size, variant), cs = CELL[size]
  const P = [], U = []
  for (const p of parts) for (let i = 0; i < p.n; i++) { P.push(p.pos[i * 3] * cs, p.pos[i * 3 + 1] * cs, p.pos[i * 3 + 2] * cs); U.push(p.uv[i * 2], p.uv[i * 2 + 1]) }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3))
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(U), 2))
  g.computeBoundingSphere()
  GHOST_GEO.set(k, g)
  return g
}

export class Builder {
  constructor(game) {
    this.g = game
    this.bar = (game.save.data.bar || DEFAULT_BAR).map(x => ({ ...x }))
    this.slot = -1
    this.size = 'large'
    this.rot = 0
    this.color = 0
    this.newStatic = false
    this.dist = 7
    const W = game.world, e = game.engine
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), W.ghostMat)
    this.mesh.renderOrder = 5; this.mesh.visible = false
    this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x5ff3e6, transparent: true, opacity: 0.9, depthTest: false }))
    this.edges.renderOrder = 6; this.edges.visible = false
    this.vol = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x5ff3e6, transparent: true, opacity: 0.16, depthWrite: false }))
    this.vol.visible = false
    e.scene.add(this.mesh, this.edges, this.vol)
    this.target = null
    this.hit = null
    this.paste = null
    this.clip = null
  }
  get item() { return this.slot >= 0 ? this.bar[this.slot] : null }
  get blockId() { return this.item?.block || null }
  get tool() { return this.item?.tool || null }
  select(i) {
    if (this.slot === i) { this.slot = -1; return }
    this.slot = i
    const id = this.bar[i]?.block
    if (id && !hasSize(id, this.size)) this.size = hasSize(id, 'large') ? 'large' : 'small'
    this.paste = null
  }
  toggleSize() {
    const id = this.blockId
    const other = this.size === 'large' ? 'small' : 'large'
    if (!id || hasSize(id, other)) { this.size = other; return true }
    return false
  }
  // quarter turns about the grid axis nearest the camera's own axis
  rotate(kind, dir, frameQuat) {
    const cam = this.g.engine.camQuat
    const inv = frameQuat.clone().invert()
    const axis = kind === 'yaw' ? new THREE.Vector3(0, 1, 0) : kind === 'pitch' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, -1)
    axis.applyQuaternion(cam).applyQuaternion(inv)
    const a = [Math.abs(axis.x), Math.abs(axis.y), Math.abs(axis.z)]
    const k = a[0] > a[1] && a[0] > a[2] ? 0 : a[1] > a[2] ? 1 : 2
    const s = Math.sign([axis.x, axis.y, axis.z][k]) * dir
    this.rot = turn(this.rot, k, s)
  }
  // where a new block would go
  aim(eye, dir) {
    const W = this.g.world, id = this.blockId
    const reach = this.size === 'large' ? 14 : 7
    const hit = W.raycast(eye, dir, reach)
    this.hit = hit
    if (!id) return null
    const cs = CELL[this.size]
    if (hit?.block && hit.grid.size === this.size) {
      const gr = hit.grid, n = hit.normal
      const c = [hit.cell[0] + n[0], hit.cell[1] + n[1], hit.cell[2] + n[2]]
      // shift a big block so it grows out of the face, not into it
      const fp = gr.footprint(id, 0, 0, 0, this.rot)
      for (let a = 0; a < 3; a++) {
        if (!n[a]) continue
        const vals = fp.map(f => f[a])
        if (n[a] > 0) c[a] -= Math.min(...vals); else c[a] -= Math.max(...vals)
      }
      const t = { grid: gr, cell: c, quat: gr.quat, pos: gr.pos, ok: gr.canPlace(id, c[0], c[1], c[2], this.rot) }
      if (t.ok && this.hitsPlayer(t, gr.footprint(id, c[0], c[1], c[2], this.rot))) { t.ok = false; t.why = 'you' }
      return t
    }
    // a new grid: on a hull of the other size, on rock, or free in front of you
    const q = new THREE.Quaternion(), p = new THREE.Vector3()
    let anchor = null
    if (hit?.block) { q.copy(hit.grid.quat); const nw = hit.grid.dirToWorld(new THREE.Vector3(...hit.normal)); p.copy(hit.point).addScaledVector(nw, cs * 0.5); anchor = hit.grid }
    else {
      const g = W.gravityAt(eye, new THREE.Vector3())
      if (g.length() > 0.3) {
        const up = g.normalize().negate(), f = dir.clone().addScaledVector(up, -dir.dot(up)).normalize()
        const z = f.clone().negate(), x = new THREE.Vector3().crossVectors(up, z)
        q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, z))
      } else q.copy(this.g.engine.camQuat)
      if (hit?.solid) { const n = this.g.groundNormal(hit); p.copy(hit.point).addScaledVector(n, cs * 0.5) }
      else p.copy(eye).addScaledVector(dir, this.dist * (this.size === 'large' ? 1 : 0.4))
    }
    const t = { grid: null, cell: [0, 0, 0], quat: q, pos: p, ok: true, onRock: !!hit?.solid, anchor }
    const fp = []; { const S = BLOCKS[id].sizes[this.size], v = [0, 0, 0]; for (let x = 0; x < S[0]; x++) for (let y = 0; y < S[1]; y++) for (let z = 0; z < S[2]; z++) { apply(this.rot, x, y, z, v); fp.push([v[0], v[1], v[2]]) } }
    if (this.hitsPlayer(t, fp)) { t.ok = false; t.why = 'you' }
    return t
  }
  // would the block's cells take the engineer's place
  hitsPlayer(t, cells) {
    const P = this.g.player
    if (!P || P.seat) return false
    const cs = CELL[this.size], a = P.pos.clone().addScaledVector(P.up, 0.3), b = P.pos.clone().addScaledVector(P.up, 1.6), ab = b.clone().sub(a), c = new THREE.Vector3(), q = new THREE.Vector3()
    for (const cell of cells) {
      c.set(cell[0] * cs, cell[1] * cs, cell[2] * cs).applyQuaternion(t.quat).add(t.pos)
      const k = Math.max(0, Math.min(1, q.subVectors(c, a).dot(ab) / ab.lengthSq()))
      if (q.copy(a).addScaledVector(ab, k).distanceTo(c) < cs * 0.5 + 0.3) return true
    }
    return false
  }
  update(dt) {
    const g = this.g, inp = g.input, W = g.world
    const eye = g.camPos, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(g.engine.camQuat)
    if (this.paste) { this.updatePaste(eye, dir, inp); return }
    const t = this.target = this.aim(eye, dir)
    // keys
    const fq = t?.quat || g.engine.camQuat
    if (this.blockId) {
      for (const [a, k, d] of [['rotYawL', 'yaw', 1], ['rotYawR', 'yaw', -1], ['rotPitchU', 'pitch', 1], ['rotPitchD', 'pitch', -1], ['rotRollL', 'roll', 1], ['rotRollR', 'roll', -1]]) if (inp.hit(a) || inp.hit(a + '2')) { this.rotate(k, d, fq); g.sfx.play('ui_click', 0.3) }
    }
    if (inp.hit('size')) { if (this.toggleSize()) g.hud.toast(this.size === 'large' ? 'Large grid blocks (2.5 m)' : 'Small grid blocks (0.5 m)'); else g.hud.toast('This block only comes in one size') }
    if (inp.hit('gridType')) { this.newStatic = !this.newStatic; g.hud.toast(this.newStatic ? 'New grids in space: STATION (fixed)' : 'New grids in space: SHIP (moves)') }
    if (inp.ctrl && inp.keyHits?.has('KeyC')) this.copy()
    if (inp.ctrl && inp.keyHits?.has('KeyV')) this.startPaste(this.clip)
    // the ghost
    this.drawGhost(t)
    const blockAction = !g.ui.blocking
    if (this.blockId && t) {
      if (inp.mouse.leftHit && blockAction) {
        if (inp.ctrl && t.grid) this.drag = { grid: t.grid, start: t.cell.slice(), plane: inp.shift }
        else this.place(t)
      }
      if (this.drag && !inp.mouse.left) { this.placeDrag(t); this.drag = null }
    } else this.drag = null
    // tools and empty hands
    const h = this.hit
    if (inp.mouse.rightHit && blockAction && h?.block && !this.tool) this.removeBlock(h)
    if (this.tool && h?.block && inp.mouse.left && blockAction) this.useTool(h, dt)
    else this.toolOn = false
    if (inp.mouse.middleHit && h?.block) {
      if (inp.shift) { this.color = h.block.color; g.hud.toast('Colour picked') } else this.paintBlock(h)
    }
    if (this.tool === 'paint' && inp.mouse.leftHit && h?.block) this.paintBlock(h)
    if (inp.takeWheel && !g.ui.blocking) {
      const w = inp.takeWheel()
      if (w) { if (inp.ctrl) this.dist = Math.max(3, Math.min(40, this.dist - w)); else { let s = this.slot < 0 ? (w > 0 ? -1 : 9) : this.slot; s = (s + (w > 0 ? 1 : -1) + 9) % 9; this.select(s) } }
    }
  }
  drawGhost(t) {
    const g = this.g, e = g.engine, id = this.blockId
    const on = !!(id && t)
    this.mesh.visible = on; this.edges.visible = on
    if (this.drag && t?.grid === this.drag.grid) {
      const [a, b] = this.dragCells(t), gr = this.drag.grid, cs = gr.cs
      const lo = [0, 1, 2].map(i => Math.min(a[i], b[i])), hi = [0, 1, 2].map(i => Math.max(a[i], b[i]))
      const c = new THREE.Vector3((lo[0] + hi[0]) / 2 * cs, (lo[1] + hi[1]) / 2 * cs, (lo[2] + hi[2]) / 2 * cs)
      e.rel(gr.toWorld(c), this.vol.position); this.vol.quaternion.copy(gr.quat)
      this.vol.scale.set((hi[0] - lo[0] + 1) * cs * 1.01, (hi[1] - lo[1] + 1) * cs * 1.01, (hi[2] - lo[2] + 1) * cs * 1.01)
      this.vol.visible = true
    } else this.vol.visible = false
    if (!on) return
    const geo = ghostGeometry(id, this.size)
    if (this.mesh.geometry !== geo) this.mesh.geometry = geo
    this.mesh.material = t.ok ? g.world.ghostMat : g.world.ghostBad
    const cs = CELL[this.size]
    const lp = new THREE.Vector3(t.cell[0] * cs, t.cell[1] * cs, t.cell[2] * cs)
    const wp = lp.applyQuaternion(t.quat).add(t.pos)
    e.rel(wp, this.mesh.position)
    this.mesh.quaternion.copy(t.quat).multiply(QUATS[this.rot])
    // a box round the block's cells
    const S = BLOCKS[id].sizes[this.size], v = apply(this.rot, (S[0] - 1) / 2, (S[1] - 1) / 2, (S[2] - 1) / 2, [0, 0, 0])
    const bc = new THREE.Vector3((t.cell[0] + v[0]) * cs, (t.cell[1] + v[1]) * cs, (t.cell[2] + v[2]) * cs).applyQuaternion(t.quat).add(t.pos)
    e.rel(bc, this.edges.position); this.edges.quaternion.copy(this.mesh.quaternion)
    this.edges.scale.set(S[0] * cs * 1.02, S[1] * cs * 1.02, S[2] * cs * 1.02)
    this.edges.material.color.set(t.ok ? 0x5ff3e6 : 0xff5040)
    this.ghostPos = wp
  }
  place(t) {
    const g = this.g, W = g.world, id = this.blockId
    if (!t.ok) { g.sfx.play('ui_error', 0.4); return }
    let gr = t.grid
    if (!gr) {
      // a new grid: fixed when built into rock, on a station, or when chosen
      const st = t.onRock || this.newStatic || (t.anchor && t.anchor.static)
      gr = W.newGrid(this.size, t.pos, t.quat, { static: st })
      if (t.anchor && !t.anchor.static) { gr.locked = { grid: t.anchor, relPos: t.anchor.toLocal(gr.pos, new THREE.Vector3()), relQuat: t.anchor.quat.clone().invert().multiply(gr.quat) } }
      if (!st && !t.anchor) { const near = g.player?.ground || null; if (near) gr.vel.copy(near.vel) }
      g.hud.toast(st ? 'New station started' : 'New ship started')
    }
    const b = gr.add(id, t.cell[0], t.cell[1], t.cell[2], this.rot, this.color)
    if (b) { g.sfx.play('place', 0.5, this.size === 'large' ? 0.9 : 1.3); gr.sleep = 0; g.onBuilt?.(gr, b) }
  }
  dragCells(t) {
    const s = this.drag.start, c = t.cell.slice(), d = [c[0] - s[0], c[1] - s[1], c[2] - s[2]]
    const ord = [0, 1, 2].sort((a, b) => Math.abs(d[b]) - Math.abs(d[a]))
    const end = s.slice()
    end[ord[0]] = c[ord[0]]
    if (this.drag.plane) end[ord[1]] = c[ord[1]]
    return [s, end]
  }
  placeDrag(t) {
    if (!this.drag || t.grid !== this.drag.grid) return
    const [a, b] = this.dragCells(t), gr = this.drag.grid, id = this.blockId
    let n = 0
    for (let i = Math.min(a[0], b[0]); i <= Math.max(a[0], b[0]); i++) for (let j = Math.min(a[1], b[1]); j <= Math.max(a[1], b[1]); j++) for (let k = Math.min(a[2], b[2]); k <= Math.max(a[2], b[2]); k++) {
      if (n > 1200) break
      if (gr.add(id, i, j, k, this.rot, this.color)) n++
    }
    if (n) { this.g.sfx.play('place', 0.6, 0.8); this.g.hud.toast(`${n} blocks placed`) }
  }
  removeBlock(h) {
    const g = this.g, gr = h.grid, b = h.block
    if (g.player?.seat?.block === b) return
    gr.remove(b); gr.sleep = 0
    g.world.sparks.burst(gr.toWorld(gr.blockCenter(b)), 10, 2)
    g.sfx.play('grind_end', 0.5)
  }
  paintBlock(h) { if (h.block.color === this.color) return; h.block.color = this.color; h.grid.touch(h.block); this.g.sfx.play('paint', 0.4) }
  useTool(h, dt) {
    const g = this.g, gr = h.grid, b = h.block, W = g.world
    const rate = (gr.size === 'large' ? 2500 : 160) * (W.creative ? 1 : 0.25)
    this.toolOn = true
    const p = h.point
    if (this.tool === 'welder') { if (b.hp < b.maxHp) { b.hp = Math.min(b.maxHp, b.hp + rate * 2 * dt); gr.touch(b); W.sparks.burst(p, 2, 1.5) } }
    if (this.tool === 'grinder') {
      if (g.player?.seat?.block === b) return
      b.hp -= rate * dt
      W.sparks.burst(p, 3, 4)
      if (b.hp <= 0) { gr.remove(b); g.sfx.play('grind_end', 0.5) } else gr.touch(b)
      // a ship being cut is nudged
      if (!gr.static) gr.sleep = 0
    }
  }
  // ---- copy and paste ----
  copy() {
    const h = this.hit
    if (!h?.block) { this.g.hud.toast('Look at a grid to copy it'); return }
    this.clip = serialize(h.grid)
    this.g.hud.toast(`Copied ${h.grid.name} (${h.grid.blocks.size} blocks). Ctrl + V to paste.`)
  }
  startPaste(bp) {
    if (!bp) { this.g.hud.toast('Nothing copied yet: Ctrl + C on a grid, or H for blueprints'); return }
    this.cancelPaste()
    const W = this.g.world
    const gr = new Grid(W, bp.size, { ghost: true, mat: W.ghostMat, glassMat: W.ghostMat })
    load(gr, bp)
    gr.updateMass(); gr.rebuild()
    this.paste = { bp, grid: gr, track: this.g.engine.track(gr.group, gr.pos, gr.quat) }
    this.slot = -1
    this.g.hud.toast(`Placing ${bp.name}: left button to place, right button to cancel`)
  }
  cancelPaste() { if (this.paste) { this.g.engine.untrack(this.paste.track); this.paste.grid.dispose(); this.paste = null } }
  updatePaste(eye, dir, inp) {
    const P = this.paste, gr = P.grid, W = this.g.world
    const dist = gr.radius * 1.6 + 4
    const g = W.gravityAt(eye, new THREE.Vector3())
    const q = new THREE.Quaternion()
    if (g.length() > 0.3) { const up = g.normalize().negate(), f = dir.clone().addScaledVector(up, -dir.dot(up)).normalize(), z = f.clone().negate(); q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, z), up, z)) }
    else q.copy(this.g.engine.camQuat)
    gr.quat.copy(q)
    const c = eye.clone().addScaledVector(dir, dist)
    // keep it above the ground on a planet
    const pl = W.universe.nearestPlanet(c)
    if (pl) { const s = pl.surface(c); const need = gr.radius * 0.5; if (s.alt < need) c.add(new THREE.Vector3(s.ux, s.uy, s.uz).multiplyScalar(need - s.alt)) }
    gr.pos.copy(c).sub(gr.com.clone().applyQuaternion(q))
    this.mesh.visible = this.edges.visible = this.vol.visible = false
    if (inp.mouse.leftHit && !this.g.ui.blocking) {
      const n = W.newGrid(P.bp.size, gr.pos, gr.quat, { static: P.bp.static && !(g.length() > 0.3 && !P.bp.ground), name: P.bp.name })
      load(n, P.bp)
      n.updateMass()
      if (P.bp.ground && g.length() > 0.3) n.static = true
      this.g.sfx.play('place', 0.8, 0.7)
      this.g.hud.toast(`${n.name} placed`)
      this.cancelPaste()
    }
    if (inp.mouse.rightHit) this.cancelPaste()
  }
}

export function serialize(g) {
  return { name: g.name, size: g.size, static: g.static, blocks: [...g.blocks].map(b => [b.id, b.i, b.j, b.k, b.rot, b.color]) }
}
export function load(g, bp) {
  for (const [id, i, j, k, rot, color] of bp.blocks) g.add(id, i, j, k, rot, color)
  return g
}
