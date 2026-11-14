// Caves: winding tunnels under every world with ground. Their mouths sit on a lattice over the planet's
// faces; when you come within a kilometre of one, its tunnel is worked out from the site's number and carved
// into the ground with the same machinery the drills use, a few bites a frame. Nothing is saved: the same
// site always makes the same cave.
import * as THREE from 'three'

function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function hash(a, b, c, d) { let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791) ^ Math.imul(d | 0, 2654435761)) | 0; h = Math.imul(h ^ (h >>> 16), 2246822507); h ^= h >>> 13; return h >>> 0 }
const CELL = 1500          // metres between possible cave mouths
const NEAR = 1100          // a cave is carved when you come this close to its mouth

export class Caves {
  constructor(planet) { this.pl = planet; this.done = new Set(); this.queue = []; this.list = [] }
  // the cave mouths in the lattice cells round a planet-local direction
  sites(lc) {
    const pl = this.pl, u = lc.clone().normalize(), A = [Math.abs(u.x), Math.abs(u.y), Math.abs(u.z)]
    const ax = A[0] > A[1] && A[0] > A[2] ? 0 : A[1] > A[2] ? 1 : 2, sg = Math.sign([u.x, u.y, u.z][ax]) || 1
    const o1 = (ax + 1) % 3, o2 = (ax + 2) % 3, uu = [u.x, u.y, u.z]
    const a = uu[o1] / Math.abs(uu[ax]), b = uu[o2] / Math.abs(uu[ax])
    const cs = CELL / pl.R, out = []
    const ia0 = Math.floor(a / cs), ib0 = Math.floor(b / cs)
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
      const ia = ia0 + da, ib = ib0 + db, face = ax * 2 + (sg > 0 ? 1 : 0)
      const r = rng(hash(pl.seed || 1, face, ia, ib))
      if (r() > 0.42) continue
      const v = [0, 0, 0]; v[ax] = sg; v[o1] = (ia + 0.2 + r() * 0.6) * cs; v[o2] = (ib + 0.2 + r() * 0.6) * cs
      const dir = new THREE.Vector3(...v).normalize()
      out.push({ key: `${face}:${ia}:${ib}`, dir, seed: Math.floor(r() * 1e9) })
    }
    return out
  }
  // the tunnel: a worm of spheres from the mouth down, wandering, with a chamber or two and perhaps a branch
  worm(site) {
    const pl = this.pl, r = rng(site.seed), up = site.dir
    const h = pl.height(up.x, up.y, up.z)
    const top = pl.R + h
    const t1 = new THREE.Vector3().crossVectors(up, Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize(), t2 = new THREE.Vector3().crossVectors(up, t1)
    const spheres = []
    const walk = (p, head, steps, rad0) => {
      let rad = rad0
      for (let i = 0; i < steps; i++) {
        const lu = p.clone().normalize(), depth = pl.R + pl.height(lu.x, lu.y, lu.z) - p.length()
        // stay underground and not too deep: bend down near the top, up when deep
        if (i > 4 && depth < 10) head.addScaledVector(lu, -0.35)
        if (depth > 80) head.addScaledVector(lu, 0.25)
        head.add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.55)).normalize()
        rad = Math.max(2.8, Math.min(6.2, rad + (r() - 0.5) * 0.9))
        p.addScaledVector(head, rad * 0.62)
        spheres.push([p.clone(), rad])
        if (r() < 0.035 && i > 8) spheres.push([p.clone(), rad * 1.9 + r() * 3])
      }
      return p
    }
    const mouth = up.clone().multiplyScalar(top + 1.5)
    spheres.push([mouth.clone(), 4.6 + r() * 1.5])
    const h0 = up.clone().multiplyScalar(-0.62).addScaledVector(t1, Math.cos(r() * 6.28) * 0.78).addScaledVector(t2, Math.sin(r() * 6.28) * 0.78).normalize()
    const mid = walk(mouth.clone(), h0, 30 + Math.floor(r() * 30), 4.4)
    if (r() < 0.55) walk(mid.clone(), new THREE.Vector3(r() - 0.5, -0.2, r() - 0.5).normalize(), 18 + Math.floor(r() * 20), 3.6)
    return spheres
  }
  // the nearest site round a point, carved at once if it was not (for tests)
  nearest(lc) {
    const pl = this.pl
    let best = null, bd = Infinity
    for (const st of this.sites(lc)) { const at = st.dir.clone().multiplyScalar(pl.R + pl.height(st.dir.x, st.dir.y, st.dir.z)); const d = at.distanceTo(lc); if (d < bd) { bd = d; best = { st, at } } }
    if (!best) return null
    if (!this.done.has(best.st.key)) { this.done.add(best.st.key); const sp = this.worm(best.st); this.list.push({ key: best.st.key, mouth: best.at, n: sp.length }); for (const q of sp) this.queue.push(q) }
    return best.at
  }
  // every frame with the camera in planet-local metres
  update(lc) {
    const pl = this.pl
    if (lc.length() - pl.R > 3000) return
    if (!this.last || this.last.distanceTo(lc) > 150) {
      this.last = lc.clone()
      for (const s of this.sites(lc)) {
        if (this.done.has(s.key)) continue
        const at = s.dir.clone().multiplyScalar(pl.R + pl.height(s.dir.x, s.dir.y, s.dir.z))
        if (at.distanceTo(lc) > NEAR) continue
        this.done.add(s.key)
        const sp = this.worm(s)
        this.list.push({ key: s.key, mouth: at, n: sp.length })
        for (const q of sp) this.queue.push(q)
      }
    }
    // a few bites a frame, the mouth first
    for (let i = 0; i < 6 && this.queue.length; i++) {
      const [p, rad] = this.queue.shift()
      pl.dig(p.clone().add(pl.center), rad, true)
    }
  }
}
