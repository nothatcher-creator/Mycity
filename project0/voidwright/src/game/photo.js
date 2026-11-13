// Photo scenes for the local dev kit only (never reachable in the published game: the debug keys are off
// there). Each scene stages the game's own designs in the current world, hides the interface and fixes the
// camera, so that clean pictures of the real renderer can be taken for a store page or a post.
import * as THREE from 'three'

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const lookQ = (from, to, up) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(from, to, up))

export class Photo {
  constructor(game) { this.game = game; this.grids = []; this.on = false; this.n = -1 }
  clear() { for (const g of this.grids) this.game.world.removeGrid(g); this.grids = []; this.burn = []; this.pin = null; this.pinVel = null; this.digs = null }
  // a design placed as a frozen grid: centre of mass at `at`, nose toward `fwd`
  ship(id, at, fwd, up, burn = 'main') {
    const G = this.game, q = lookQ(V(0, 0, 0), fwd, up)
    const g = G.spawnGrid(id, at.clone(), q, { static: true })
    g.pos.copy(at).sub(g.com.clone().applyQuaternion(q))
    this.grids.push(g)
    if (burn) this.burn.push([g, burn])
    return g
  }
  // the time of day at which the star stands `want` (a cosine) above the direction `dir`, with `side` picking
  // morning or evening
  sunAt(dir, want, side = 1) {
    const U = this.game.world.universe
    let best = 0, bd = 9
    for (let i = 0; i < 720; i++) {
      U.time = i * 5; U.updateSun(0)
      const c = U.sunDir.dot(dir)
      U.time = i * 5 + 5; U.updateSun(0)
      const rising = U.sunDir.dot(dir) > c
      const d = Math.abs(c - want) + (rising === (side > 0) ? 0 : 5)
      if (d < bd) { bd = d; best = i * 5 }
    }
    U.time = best; U.updateSun(0)
    return U.sunDir.clone()
  }
  set(n) {
    const G = this.game, W = G.world, U = W.universe, P = G.player, e = G.engine
    this.clear()
    this.on = true; this.n = n
    e.noUI = true; e.resScale = 0.4; e.setQuality('high'); e.quality = { ...e.quality, detail: 3 }
    this.fov = 50; this.ui = false; this.model = false
    const halvor = U.byId('halvor')
    const sc = G.scenario
    let cam, tgt, up = V(0, 1, 0)
    if (sc === 'orbit') {
      const st = W.grids.find(g => g.name && /kestrel/i.test(g.name)) || W.grids[0]
      const c = st.comWorld(), out = c.clone().sub(halvor.center).normalize()
      const s = this.sunAt(out, [0.6, 0.28, 0.55][n % 3])
      const east = V().crossVectors(V(0, 1, 0), out).normalize(), north = V().crossVectors(out, east)
      if (n % 3 === 0) {
        // the station over the day side with the world behind it, the cruiser and two scouts leaving
        const f = east.clone().multiplyScalar(-1).addScaledVector(north, 0.25).normalize()
        this.ship('lancer', c.clone().addScaledVector(out, 40).addScaledVector(east, -78).addScaledVector(north, 30), f, out)
        this.ship('sparrow', c.clone().addScaledVector(out, 64).addScaledVector(east, -40).addScaledVector(north, 52), f, out)
        this.ship('sparrow', c.clone().addScaledVector(out, 58).addScaledVector(east, -60).addScaledVector(north, 6), f, out)
        cam = c.clone().addScaledVector(out, 205).addScaledVector(east, -92).addScaledVector(north, 108)
        tgt = c.clone().addScaledVector(out, 14).addScaledVector(east, -40).addScaledVector(north, 8)
        up = north.clone().addScaledVector(east, -0.25).normalize(); this.fov = 40
      } else if (n % 3 === 1) {
        // high over the mountains inside the air: a flight in formation toward the low star
        const d = out.clone()
        const f = V().crossVectors(d, V().crossVectors(s, d)).normalize() // toward the star along the ground
        const r = V().crossVectors(f, d).normalize()
        const p = halvor.center.clone().addScaledVector(d, halvor.R + halvor.height(d.x, d.y, d.z) + 2600)
        this.ship('lancer', p, f, d)
        this.ship('sparrow', p.clone().addScaledVector(r, 30).addScaledVector(f, 30).addScaledVector(d, 7), f, d)
        this.ship('sparrow', p.clone().addScaledVector(r, -34).addScaledVector(f, 22).addScaledVector(d, -4), f, d)
        this.ship('mule', p.clone().addScaledVector(r, -50).addScaledVector(f, -58).addScaledVector(d, 12), f, d)
        cam = p.clone().addScaledVector(r, 88).addScaledVector(f, 58).addScaledVector(d, 30)
        tgt = p.clone().addScaledVector(r, -10).addScaledVector(f, 2).addScaledVector(d, -2)
        up = d; this.fov = 54
        this.pinAt = p.clone().addScaledVector(d, 60)
      } else {
        // third person in the cruiser's seat with the helmet display on: what playing looks like
        const lan = W.grids.find(g => /lancer/i.test(g.name || '') && !g.static)
        if (lan) {
          const f = out.clone().multiplyScalar(-1).addScaledVector(north, 0.5).addScaledVector(east, 0.2).normalize(), u = V().crossVectors(V().crossVectors(f, north), f).normalize()
          lan.quat.copy(lookQ(V(0, 0, 0), f, u)); lan.vel.set(0, 0, 0); lan.angVel.set(0, 0, 0)
          P.enterSeat(lan, lan.parts.cockpits[0]); G.view = 'tp'
        }
        e.noUI = false; this.ui = true; cam = null
      }
      this.pin = n % 3 === 2 ? null : this.pinAt || c.clone().addScaledVector(out, 400); this.pinAt = null
    } else if (sc === 'planet' || sc === 'thessa' || sc === 'moon') {
      const base = W.grids.find(g => g.static), pl = U.nearestPlanet(base.pos)
      const c = base.comWorld(), d = c.clone().sub(pl.center).normalize()
      const s = this.sunAt(d, [0.2, 0.55, 0.16, 0.5, 0.45][n % 5], n % 5 === 2 ? -1 : 1)
      const sf = s.clone().addScaledVector(d, -s.dot(d)).normalize() // the star's side, along the ground
      const r = V().crossVectors(sf, d).normalize()
      const ground = (a, b) => { const q = c.clone().addScaledVector(sf, a).addScaledVector(r, b).sub(pl.center).normalize(); return pl.center.clone().addScaledVector(q, pl.R + pl.height(q.x, q.y, q.z)) }
      if (n % 5 === 0) {
        // golden hour at the outpost: a cruiser coming in over the trees
        const lp = ground(20, -34).addScaledVector(d, 30)
        this.ship('lancer', lp, sf.clone().multiplyScalar(-0.3).addScaledVector(r, 1).normalize(), d, 'down')
        this.ship('sparrow', ground(46, 6).addScaledVector(d, 44), r.clone().addScaledVector(sf, -0.5).normalize(), d)
        cam = ground(-31, 22).addScaledVector(d, 6.5)
        tgt = c.clone().addScaledVector(d, 13).addScaledVector(sf, 12).addScaledVector(r, -16)
        up = d; this.fov = 52
        this.pin = ground(-24.5, 18.5).addScaledVector(d, 1.0); this.pinQ = lookQ(V(0, 0, 0), sf.clone().addScaledVector(r, -0.5).normalize(), d); this.model = true
      } else if (n % 5 === 1) {
        // midday: the hauler lifting off beside the base
        const mp = ground(-8, 70).addScaledVector(d, 24)
        this.ship('mule', mp, r.clone().multiplyScalar(-1).addScaledVector(sf, 0.4).normalize(), d.clone().addScaledVector(r, 0.06).normalize(), 'down')
        cam = ground(-50, 44).addScaledVector(d, 8)
        tgt = mp.clone().addScaledVector(d, -6).addScaledVector(sf, 10)
        up = d; this.fov = 60
        this.pin = ground(-70, 10).addScaledVector(d, 1)
      } else if (n % 5 === 2) {
        // dusk from above: the valley, the base lights, a scout banking past
        this.ship('sparrow', c.clone().addScaledVector(d, 46).addScaledVector(sf, 10).addScaledVector(r, 24), r.clone().multiplyScalar(-1).addScaledVector(sf, 0.6).normalize(), d.clone().addScaledVector(sf, 0.35).normalize())
        cam = c.clone().addScaledVector(d, 58).addScaledVector(sf, -52).addScaledVector(r, 60)
        tgt = c.clone().addScaledVector(d, 16).addScaledVector(sf, 30)
        up = d; this.fov = 62
        this.pin = c.clone().addScaledVector(d, 300)
      } else if (n % 5 === 4) {
        // the engineer, close: a walk past the outpost
        const at = ground(-30, 14)
        this.pin = at.clone().addScaledVector(d, 1.0); this.pinQ = lookQ(V(0, 0, 0), r.clone().multiplyScalar(-1).addScaledVector(sf, 0.3).normalize(), d); this.model = true
        this.pinVel = V(0, 0, 0).addScaledVector(r, -3.2)
        cam = at.clone().addScaledVector(sf, -2.6).addScaledVector(r, -2.2).addScaledVector(d, 1.5)
        tgt = at.clone().addScaledVector(d, 1.15)
        up = d; this.fov = 50
      } else {
        // a mine: looking out of a shaft cut into the ground, the miner at its mouth
        const s0 = this.sunAt(d, 0.2, 1), sf0 = s0.clone().addScaledVector(d, -s0.dot(d)).normalize(), r0 = V().crossVectors(sf0, d).normalize()
        const M = sf0.clone().multiplyScalar(0.76).addScaledVector(r0, -0.66).normalize() // toward the mountains
        let sb = null, bb = -9
        for (const sd of [1, -1]) { const t = this.sunAt(d, 0.36, sd); const k = t.dot(M); if (k > bb) { bb = k; sb = sd } }
        this.sunAt(d, 0.36, sb)
        const q0 = c.clone().addScaledVector(sf0, 10).addScaledVector(r0, 96).sub(pl.center).normalize()
        const m = pl.center.clone().addScaledVector(q0, pl.R + pl.height(q0.x, q0.y, q0.z))
        const side = V().crossVectors(M, d).normalize()
        const dn = M.clone().multiplyScalar(-0.94).addScaledVector(d, -0.34).normalize()
        const ax = t => m.clone().addScaledVector(M, 9).addScaledVector(d, 2).addScaledVector(dn, t)
        this.digs = []
        for (let i = 0; i < 17; i++) this.digs.push([ax(i * 2.7), 5.6])
        for (let i = 0; i < 5; i++) this.digs.push([ax(44).addScaledVector(side, (i - 2) * 4), 6.5])
        this.ship('pick', ax(11).addScaledVector(d, 0.6).addScaledVector(side, -1.2), dn, V().crossVectors(dn, side).normalize(), null)
        cam = ax(41).addScaledVector(d, -1.2).addScaledVector(side, 2.6)
        tgt = ax(8).addScaledVector(d, 1.5)
        up = d; this.fov = 62
        this.pin = ax(33).addScaledVector(d, -5.2).addScaledVector(side, -2.4); this.pinQ = lookQ(V(0, 0, 0), M, d); this.model = true
      }
    } else if (sc === 'rocks') {
      const f = U.field('belt'), a = f.list[f.list.length - 1]
      const s = U.sunDir.clone()
      const side = V().crossVectors(s, V(0, 1, 0)).normalize(), u2 = V().crossVectors(side, s).normalize()
      // a point on the rock's lit flank
      const dir = s.clone().addScaledVector(side, 0.8).normalize()
      const p = a.pos.clone().addScaledVector(dir, a.r * 2.5)
      for (let i = 0; i < 300; i++) { const dd = a.sdf(p); if (dd < 0.3) break; p.addScaledVector(dir, -Math.max(0.2, dd * 0.7)) }
      const into = dir.clone().multiplyScalar(-1)
      this.digs = []
      for (let i = 0; i < 6; i++) this.digs.push([p.clone().addScaledVector(into, i * 2.5), 7 - i * 0.4])
      this.ship('mole', p.clone().addScaledVector(dir, 20), into, u2, null)
      this.ship('pick', p.clone().addScaledVector(dir, 16).addScaledVector(side, 22).addScaledVector(u2, 9), into.clone().addScaledVector(side, -0.3).normalize(), u2, null)
      this.ship('sparrow', p.clone().addScaledVector(dir, 60).addScaledVector(side, -30).addScaledVector(u2, 26), side.clone().addScaledVector(into, 0.3).normalize(), u2)
      cam = p.clone().addScaledVector(dir, n % 2 ? 8 : 58).addScaledVector(side, n % 2 ? -44 : 34).addScaledVector(u2, n % 2 ? 15 : 20)
      tgt = p.clone().addScaledVector(dir, n % 2 ? 13 : 14)
      up = u2; this.fov = n % 2 ? 62 : 50
      this.pin = p.clone().addScaledVector(dir, 200)
      this.sparkAt = p.clone().addScaledVector(dir, 1.5)
    }
    this.cam = cam ? { pos: cam, quat: lookQ(cam, tgt, up) } : null
    G.p0.log('dbg photo', sc, n, 'grids', this.grids.length)
  }
  // every frame, after the game's own update
  tick(dt) {
    const G = this.game, P = G.player, W = G.world
    if (this.digs?.length) { for (const [p, r] of this.digs) W.survival.dig(p, r, 0); this.digs = null }
    for (const [g, mode] of this.burn || []) {
      for (const b of g.parts.thrusters) {
        const d = g.blockDir(b, 0, 0, 1)
        b.out = mode === 'main' ? (d.z > 0.5 ? 0.9 : 0) : mode === 'down' ? (d.y < -0.5 ? 0.75 : d.z > 0.5 ? 0.25 : 0) : 0
      }
    }
    if (this.pin && !P.seat) { P.pos.copy(this.pin); P.vel.set(0, 0, 0); if (this.pinVel) { P.vel.copy(this.pinVel); P.onGround = true } if (this.pinQ) { P.quat.copy(this.pinQ); P.pitch = 0 } }
    G.view = this.model || this.ui ? 'tp' : 'fp'
    if (this.sparkAt && Math.random() < 0.6) W.sparks.burst(this.sparkAt.clone().add(V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(5)), 10, 6)
    if (this.cam) { G.camPos.copy(this.cam.pos); G.camQuat.copy(this.cam.quat) }
  }
}
