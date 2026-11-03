// Road surfaces drawn over the land: asphalt with lines for highways, kerbs and pavements in the cities,
// dirt tracks, the airfield's runway and taxiways; and bridges (deck, railings, pillars) where a road
// crosses water. Meshes are cut into 512 m tiles that are shown near the camera.
import * as THREE from 'three'
import { roadLines, heightAt } from './heightfield.js'
import { makeBox } from './collision.js'
import { Kit } from './kit.js'
import { PAL } from './buildings.js'

const TILE = 512
const COL = {
  highway: [0.21, 0.21, 0.23], road: [0.27, 0.27, 0.28], street: [0.24, 0.24, 0.26], dirt: [0.5, 0.4, 0.28],
  runway: [0.2, 0.2, 0.22], taxiway: [0.26, 0.26, 0.27], apron: [0.33, 0.33, 0.34],
}
const LIFT = { highway: 0.07, road: 0.06, street: 0.05, dirt: 0.04, runway: 0.09, taxiway: 0.08, apron: 0.03 }

export class Roads {
  constructor(world, collision) {
    this.world = world
    this.tiles = new Map()     // key -> { pos, col, idx, mesh }
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })
    this.bridgeKit = new Kit()
    for (const l of roadLines) this.addLine(l)
    for (const t of this.tiles.values()) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(t.pos, 3))
      g.setAttribute('color', new THREE.Float32BufferAttribute(t.col, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(t.nrm, 3))
      g.setIndex(t.idx)
      g.computeBoundingSphere()
      t.mesh = new THREE.Mesh(g, this.material)
      t.mesh.receiveShadow = true
      t.mesh.visible = false
      world.add(t.mesh)
    }
    // bridges: one mesh; decks are colliders everyone can stand and drive on
    this.bridges = new THREE.Mesh(this.bridgeKit.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))
    world.add(this.bridges)
    for (const c of this.bridgeKit.colliders) collision.add(c)
  }
  tile(x, z) {
    const k = Math.floor(x / TILE) * 1000 + Math.floor(z / TILE)
    let t = this.tiles.get(k)
    if (!t) this.tiles.set(k, t = { pos: [], col: [], nrm: [], idx: [], cx: (Math.floor(x / TILE) + 0.5) * TILE, cz: (Math.floor(z / TILE) + 0.5) * TILE })
    return t
  }
  // A strip along the line from offset a to b across it (metres from the centre line), lifted `lift`.
  strip(l, a, b, lift, color, dash = 0) {
    const p = l.pts, n = p.length
    for (let i = 0; i < n - 1; i++) {
      if (dash && (i % dash) >= dash / 2) continue
      const P = p[i], Q = p[i + 1]
      if (P[3] === 1 && Q[3] === 1) continue          // bridge decks are drawn by the bridge
      const t = this.tile((P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2)
      const d0 = dir(p, i), d1 = dir(p, i + 1)
      const base = t.pos.length / 3
      for (const [Pt, d] of [[P, d0], [Q, d1]]) {
        const nx = d[1], nz = -d[0]
        for (const o of [a, b]) {
          const x = Pt[0] + nx * o, z = Pt[1] + nz * o
          // on the road the land is levelled to the profile; at the very edge follow the land itself
          const y = Math.abs(o) > l.w / 2 + 0.2 ? Math.max(heightAt(x, z), Pt[2]) : Pt[2]
          t.pos.push(x, y + lift, z); t.col.push(...color); t.nrm.push(0, 1, 0)
        }
      }
      t.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
    }
  }
  addLine(l) {
    const w = l.w, c = COL[l.kind] || COL.road, lift = LIFT[l.kind] || 0.05
    this.strip(l, -w / 2, w / 2, lift, c)
    const white = [0.85, 0.85, 0.82], yellow = [0.85, 0.7, 0.2]
    if (l.kind === 'highway') {
      this.strip(l, -0.12, 0.12, lift + 0.01, yellow, 4)
      this.strip(l, -w / 2 + 0.4, -w / 2 + 0.6, lift + 0.01, white)
      this.strip(l, w / 2 - 0.6, w / 2 - 0.4, lift + 0.01, white)
    } else if (l.kind === 'road') this.strip(l, -0.1, 0.1, lift + 0.01, white, 6)
    else if (l.kind === 'street') {
      this.strip(l, -w / 2 - 2.2, -w / 2, lift + 0.12, PAL.concrete)
      this.strip(l, w / 2, w / 2 + 2.2, lift + 0.12, PAL.concrete)
      this.strip(l, -0.1, 0.1, lift + 0.01, white, 4)
    } else if (l.kind === 'runway') {
      this.strip(l, -0.6, 0.6, lift + 0.01, white, 6)
      this.strip(l, -w / 2 + 1, -w / 2 + 1.6, lift + 0.01, white)
      this.strip(l, w / 2 - 1.6, w / 2 - 1, lift + 0.01, white)
    } else if (l.kind === 'taxiway') this.strip(l, -0.2, 0.2, lift + 0.01, yellow)
    else if (l.kind === 'dirt') this.strip(l, -0.6, 0.6, lift + 0.01, [0.42, 0.52, 0.28], 0)
    // bridges where the line crosses water: a deck, railings, pillars down to the bed
    const p = l.pts, k = this.bridgeKit
    for (let i = 0; i < p.length - 1; i++) {
      const P = p[i], Q = p[i + 1]
      if (P[3] !== 1 || Q[3] !== 1) continue
      const mx = (P[0] + Q[0]) / 2, mz = (P[1] + Q[1]) / 2, my = (P[2] + Q[2]) / 2
      const len = Math.hypot(Q[0] - P[0], Q[1] - P[1]) / 2 + 0.05, yaw = Math.atan2(Q[0] - P[0], Q[1] - P[1])
      const pitch = -Math.atan2(Q[2] - P[2], len * 2)
      k.setFrame(mx, my, mz, yaw)
      k.box(0, -0.35, 0, w / 2 + 0.8, 0.35, len, PAL.concrete, { mat: 'concrete', kind: 'floor', pitch })
      k.box(0, 0.03, 0, w / 2, 0.03, len, c, { collide: false, pitch })
      for (const s of [-1, 1]) k.box(s * (w / 2 + 0.55), 0.55, 0, 0.12, 0.55, len, PAL.concreteDark, { mat: 'concrete', kind: 'prop', pitch })
      if (i % 3 === 0) {
        const bed = heightAt(mx, mz)
        if (my - bed > 2) k.box(0, (bed - my) / 2 - 0.5, 0, w / 2 - 0.5, (my - bed) / 2, 0.8, PAL.concreteDark, { mat: 'concrete' })
      }
    }
  }
  update(cx, cz, view) {
    for (const t of this.tiles.values()) t.mesh.visible = Math.hypot(t.cx - cx, t.cz - cz) < Math.min(view, 2600) + TILE * 0.71
  }
}
function dir(p, i) {
  const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)]
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1
  return [dx / l, dz / l]
}
