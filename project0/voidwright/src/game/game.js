// VOIDWRIGHT: the game. Boots the engine, the star system, the grids and the interface; runs the title
// screen over a view of Halvor; starts a world at the chosen place; every frame takes the controls
// (on foot, in a seat, in a menu), moves ships and the engineer, picks the view, keeps the terrain and
// rocks built round the camera, lights the scene and draws it.
import * as THREE from 'three'
import { Engine, QUALITY } from '../core/engine.js'
import { Input } from '../core/input.js'
import { Touch } from '../core/touch.js'
import { UI, loadFonts, C } from '../ui/ui.js'
import { HUD } from '../ui/hud.js'
import { Menus, SCENARIOS } from '../ui/menus.js'
import { Icons } from '../ui/icons.js'
import { Sky, detailTexture } from '../world/sky.js'
import { World } from './world.js'
import { Builder, load } from './build.js'
import { prefab } from './prefabs.js'
import { Engineer, EYE } from '../actors/engineer.js'
import { SFX } from './sfx.js'
import { Trees } from '../world/trees.js'
import { BLOCKS } from '../grid/blocks.js'
import { ITEMS } from './items.js'
import { netPut } from './survival.js'
import { Photo } from './photo.js'

const pause = () => new Promise(r => setTimeout(r, 0))
const DEFAULTS = { quality: 'medium', resScale: 1, fov: 70, sens: 1, invertY: false, volume: 0.8 }
let DEBUG = false

class Save {
  constructor(p0) {
    this.p0 = p0
    const s = p0.saved && typeof p0.saved === 'object' ? p0.saved : {}
    this.data = { v: 1, ...s }
    this.data.settings = { ...DEFAULTS, ...(s.settings || {}) }
  }
  store() {
    if (this.timer) return
    this.timer = setTimeout(() => { this.timer = null; try { const r = this.p0.save?.(this.data); if (r?.catch) r.catch(() => {}) } catch {} }, 1200)
  }
}

export class Game {
  constructor(p0) {
    this.p0 = p0
    try { DEBUG = /\/\/(127\.0\.0\.1|localhost)[:/]/.test(p0.asset('main.js')) } catch {}
    this.debug = DEBUG
    this.state = 'boot'
    this.save = new Save(p0)
    this.settings = this.save.data.settings
    this.camPos = new THREE.Vector3(); this.camQuat = new THREE.Quaternion()
    this.view = 'fp'
    this.time = 0
  }
  saveSettings() { this.save.store() }
  saveMap() { this.save.data.known = [...this.world.universe.known]; this.save.data.wps = this.waypoints.slice(-24).map(w => [w.name, Math.round(w.pos.x), Math.round(w.pos.y), Math.round(w.pos.z)]); this.save.store() }
  addWaypoint(pos, name) { const w = { name: name || `Waypoint ${this.waypoints.length + 1}`, pos: pos.clone() }; this.waypoints.push(w); this.saveMap(); return w }
  async boot() {
    const p0 = this.p0, t0 = performance.now()
    const L = (f, label) => p0.loading(Math.min(0.99, f), label)
    L(0.02, 'lighting the star')
    const e = this.engine = new Engine(p0)
    e.resScale = this.settings.resScale
    e.setQuality(this.settings.quality)
    e.detailTex = detailTexture()
    e.spaceUniforms = {
      uPC: { value: new THREE.Vector3() }, uPR: { value: 1 }, uAR: { value: 1 }, uDen: { value: 0 }, uSunD: { value: new THREE.Vector3(0, 1, 0) },
      uDay: { value: new THREE.Color() }, uDusk: { value: new THREE.Color() }, uHaze: { value: 0 },
    }
    L(0.08, 'painting the stars'); await pause()
    const B = [performance.now()], bm = () => B.push(performance.now())
    this.sky = new Sky(e); bm()
    L(0.2, 'raising the worlds'); await pause()
    this.world = new World(this)
    this.world.trees = new Trees(e)
    // the map: what has been found, and waypoints (kept between visits; the universe itself is always the same)
    const U0 = this.world.universe
    for (const key of this.save.data.known || []) U0.known.add(key)
    this.waypoints = (this.save.data.wps || []).map(w => ({ name: w[0], pos: new THREE.Vector3(w[1], w[2], w[3]) }))
    this.tracked = null
    U0.onDiscover = d => { this.hud?.toast(`Discovered: the ${d.name} group (${d.bodies.length} worlds, ${d.fields.length} rock fields)`, C.gold2); this.sfx?.play('ui_on', 0.6); this.saveMap() }; bm()
    this.input = new Input(p0)
    this.input.sens = this.settings.sens; this.input.invertY = this.settings.invertY
    this.ui = new UI(e)
    loadFonts(() => { for (const p of this.ui.panels) p.dirty = true })
    this.sfx = new SFX(this)
    this.builder = new Builder(this)
    L(0.3, 'drawing the blocks'); await pause()
    this.icons = new Icons(e, this.world.atlas.tex)
    bm(); this.icons.prepare(); bm()
    if (this.debug) this.p0.log('dbg boot sky/world/misc/icons', B.slice(1).map((t, i) => Math.round(t - B[i])).join(' '))
    this.hud = new HUD(this)
    this.hud.show(false)
    this.menus = new Menus(this)
    this.touch = new Touch(this)
    e.onResize = () => { this.hud.layout(); this.menus.layout(); this.touch.layout() }
    this.bindPointer()
    // the title view: Halvor from high orbit
    this.titleView(0)
    L(0.45, 'shaping Halvor')
    const U = this.world.universe
    let tw = performance.now()
    for (let i = 0; i < 400; i++) {
      U.update(this.camPos, this.time, this.engine.quality)
      const left = U.work(30)
      L(0.45 + Math.min(0.4, i / 60), 'shaping Halvor')
      await pause()
      if (left === 0 || performance.now() - tw > 8000) break
    }
    const tb = performance.now()
    L(0.9, 'warming up'); await pause()
    await this.warm()
    if (this.debug) this.p0.log('dbg boot: terrain', Math.round(tb - tw), 'warm', Math.round(performance.now() - tb), 'icons+', Math.round(tw - t0))
    p0.log('boot', Math.round(performance.now() - t0), 'ms')
    L(1, 'ready')
    this.state = 'menu'
    this.menus.open('title')
    p0.hud('VOIDWRIGHT: build ships and stations, land on planets and asteroids. Click for sound. F1 shows the controls; Esc leaves the lot.')
    p0.loop(dt => this.frame(Math.min(dt, 0.1)))
    p0.on('update', () => this.hud?.toast('A new version is out: re-enter the lot to play it.'))
  }
  // shaders compiled before they are first needed (the city stops a game that hangs for 12 s)
  async warm() {
    const e = this.engine, r = e.renderer, w0 = performance.now()
    const tmp = this.world.newGrid('large', this.camPos.clone().add(new THREE.Vector3(0, 0, -30).applyQuaternion(this.camQuat)), this.camQuat)
    tmp.add('light_cube', 0, 0, 0); tmp.add('window', 1, 0, 0); tmp.add('thr_ion_small', 2, 0, 0); tmp.updateMass(); tmp.rebuild()
    tmp.parts.thrusters[0].out = 1
    this.builder.mesh.visible = true; this.builder.mesh.geometry = tmp.chunks.values().next().value.mesh.geometry
    e.sync(); this.world.draw(0.016)
    try { if (r.compileAsync) await Promise.race([r.compileAsync(e.scene, e.camera), new Promise(res => setTimeout(res, 6000))]); else r.compile(e.scene, e.camera) } catch (err) { this.p0.log('compile', err.message) }
    const w1 = performance.now()
    e.render(false)
    if (this.debug) this.p0.log('dbg warm compile', Math.round(w1 - w0), 'render', Math.round(performance.now() - w1), 'programs', r.info.programs?.length)
    this.world.removeGrid(tmp)
    this.builder.mesh.visible = false
  }
  titleView(t) {
    const a = 0.6 + t * 0.01
    const pl = this.world.universe.byId('halvor')
    this.camPos.set(Math.sin(a) * 82000, 30000, Math.cos(a) * 82000).add(pl.center)
    const m = new THREE.Matrix4().lookAt(this.camPos, pl.center.clone().add(new THREE.Vector3(18000, 6000, 0)), new THREE.Vector3(0, 1, 0))
    this.camQuat.setFromRotationMatrix(m)
  }
  // ---- input wiring ----
  bindPointer() {
    const p0 = this.p0
    p0.on('pointerdown', e => {
      this.sfx.unlock()
      if (e.touch && !this.touchSeen) { this.touchSeen = true; this.input.touch = true; this.hud.layout(); this.menus.layout(); this.touch.layout() }
      if (e.touch && this.state === 'play' && !this.menus.visible) { this.touch.down(e); return }
      if (this.ui.click(e.x, e.y)) { this.input.mouse.leftHit = false; this.input.mouse.rightHit = false; return }
      if (this.state === 'play' && !e.touch && !this.menus.visible) p0.input.lockPointer()
    })
    p0.on('pointermove', e => {
      if (e.touch && this.state === 'play' && !this.menus.visible) { this.touch.move(e); return }
      this.ui.move(e.x, e.y)
    })
    p0.on('pointerup', e => { if (e.touch) this.touch.up(e) })
    p0.on('keydown', e => { this.sfx.unlock(); if (DEBUG) this.debugKey(e) })
    p0.on('wheel', e => { if (this.menus.visible) { this.input.mouse.wheel = 0; this.menus.wheel(e.dy ?? e.deltaY ?? 0) } })
  }
  get ui_blocking() { return this.menus.visible }
  setQuality(q) { this.settings.quality = q; this.engine.setQuality(q) }
  // ---- worlds ----
  clearWorld() {
    for (const g of [...this.world.grids]) this.world.removeGrid(g)
    this.builder.cancelPaste()
    if (this.photo) { this.photo.grids = []; this.photo.on = false; this.photo.n = -1; this.engine.noUI = false }
    this.player = null; this.jump = null
    if (this.pmodel) this.pmodel.visible = false
  }
  spawnGrid(id, pos, quat, o = {}) {
    const bp = prefab(id), W = this.world
    const g = W.newGrid(bp.size, pos, quat, { static: o.static ?? bp.static, name: bp.name })
    load(g, bp)
    g.updateMass()
    if (o.ground) this.settle(g, o.sink || 0, g.static)
    if (o.sleep) g.sleep = 2
    g.rebuild()
    if (o.ground && !g.static) { const r = this.world.tryLock(g, 1.5); if (r !== 'locked') this.p0.log('spawn: clamps did not lock on', g.name) }
    return g
  }
  // stands a grid on the ground below it: its lowest hull point just touching (or `sink` metres into it)
  settle(g, sink = 0, embed = false) {
    const pl = this.world.universe.nearestPlanet(g.pos)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quat)
    const gaps = [], P = new THREE.Vector3(), L = new THREE.Vector3()
    let lowY = Infinity
    for (let i = 0; i < g.points.length; i += 3) lowY = Math.min(lowY, g.points[i + 1])
    for (let i = 0; i < g.points.length; i += 3) {
      L.set(g.points[i], g.points[i + 1], g.points[i + 2])
      if (L.y > lowY + 0.01) continue
      P.copy(L).applyQuaternion(g.quat).add(g.pos)
      gaps.push(pl.sdf(P) - g.cs * 0.5)
    }
    gaps.sort((a, b) => a - b)
    // a base is dug in (most of its floor touching, the rest buried); a ship rests on its lowest point
    const k = embed ? gaps[Math.floor(gaps.length * 0.85)] : gaps[0]
    g.pos.addScaledVector(up, -(k + sink - 0.02))
  }
  // a flat, low place on a planet near a direction
  findFlat(pl, dir, spread = 0.02, tries = 80) {
    let best = null, bs = Infinity
    const r = () => (Math.random() - 0.5) * 2 * spread
    for (let i = 0; i < tries; i++) {
      const d = dir.clone().add(new THREE.Vector3(r(), r(), r())).normalize()
      const p = d.clone().multiplyScalar(pl.R).add(pl.center), s = pl.surface(p)
      const slope = 1 - (s.nx * s.ux + s.ny * s.uy + s.nz * s.uz)
      const score = slope * 30 + Math.abs(s.h) / 900
      if (score < bs) { bs = score; best = { dir: d, h: s.h } }
    }
    return best
  }
  frameAt(pl, dir, h, yaw = 0) {
    const up = dir.clone().normalize()
    const east = new THREE.Vector3(0, 1, 0).cross(up).normalize(); if (east.lengthSq() < 0.1) east.set(1, 0, 0)
    const north = up.clone().cross(east)
    const z = north.clone().applyAxisAngle(up, yaw).negate(), x = up.clone().cross(z)
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, z))
    const p = up.clone().multiplyScalar(pl.R + h).add(pl.center)
    return { p, q, up, east, north }
  }
  startWorld(id, mode = 'creative') {
    const W = this.world, U = W.universe
    this.clearWorld()
    this.scenario = id
    this.mode = mode
    W.creative = mode === 'creative'
    this.menus.open('loading')
    let spawn = null, jet = false
    U.ensure(new THREE.Vector3(0, 0, 0))
    const halvor = U.byId('halvor'), ket = U.byId('ket')
    if (id === 'planet' || id === 'moon' || id === 'thessa') {
      const pl = id === 'planet' ? halvor : id === 'moon' ? ket : U.byId('thessa')
      const f = this.findFlat(pl, id === 'planet' ? new THREE.Vector3(0.35, 0.72, 0.6).normalize() : id === 'moon' ? new THREE.Vector3(-0.4, 0.8, 0.45).normalize() : new THREE.Vector3(0.2, 0.6, -0.7).normalize(), 0.03, 140)
      const fr = this.frameAt(pl, f.dir, f.h)
      const base = this.spawnGrid('foothold', fr.p.clone().addScaledVector(fr.up, 1.5), fr.q, { static: true, ground: true, sink: 0.6 })
      const at = (dx, dz, yaw) => { const d = f.dir.clone().addScaledVector(fr.east, dx / pl.R).addScaledVector(fr.north, dz / pl.R).normalize(); const h = pl.height(d.x, d.y, d.z); return this.frameAt(pl, d, h, yaw) }
      const s1 = at(36, 6, 0.4); this.spawnGrid('sparrow', s1.p.clone().addScaledVector(s1.up, 3), s1.q, { ground: true, sleep: true, static: false })
      if (id !== 'moon') { const s2 = at(-14, 58, -0.3); this.spawnGrid('mule', s2.p.clone().addScaledVector(s2.up, 10), s2.q, { ground: true, sleep: true, static: false }) }
      const s3 = at(40, -30, 1.2); this.spawnGrid('pick', s3.p.clone().addScaledVector(s3.up, 3), s3.q, { ground: true, sleep: true, static: false })
      const sp = at(-3, -16, 0); spawn = { pos: sp.p.clone().addScaledVector(sp.up, 1.2), quat: sp.q }
    } else if (id === 'orbit') {
      const c = new THREE.Vector3(-9000, 21000, 72000)
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(c, halvor.center, new THREE.Vector3(0, 1, 0))).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2))
      const st = this.spawnGrid('kestrel', c, q, { static: true })
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
      this.spawnGrid('lancer', st.toWorld(new THREE.Vector3(0, 30, -70)), q, { static: false })
      this.spawnGrid('sparrow', st.toWorld(new THREE.Vector3(-10, 4, -8)), q, { static: false })
      spawn = { pos: st.toWorld(new THREE.Vector3(0, 1.4, 20)), quat: q }
    } else if (id === 'rocks') {
      const f = U.field('belt'); f.make()
      const a = f.list[f.list.length - 1]
      // a point on the anchor rock's surface, facing the star
      const dir = W.sunDir.clone().normalize(), p = a.pos.clone().addScaledVector(dir, a.r * 2.5)
      for (let i = 0; i < 200; i++) { const d = a.sdf(p); if (d < 0.3) break; p.addScaledVector(dir, -Math.max(0.2, d * 0.7)) }
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      const core = W.newGrid('large', p.clone().addScaledVector(dir, 0.6), q, { static: true, name: 'Drift Core' })
      for (let i = -2; i <= 2; i++) for (let k = -2; k <= 2; k++) core.add('heavy_cube', i, 0, k, 0, 2)
      core.add('medbay', -1, 1, -1, 0, 3); core.add('battery', 1, 1, 1); core.add('beacon', 2, 1, -2); core.add('core_small', 1, 1, 0); core.add('lamp', 0, 1, 2); core.updateMass(); core.rebuild()
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(q), fwdv = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
      this.spawnGrid('sparrow', p.clone().addScaledVector(dir, 6).addScaledVector(side, 16), q, { static: false })
      // stand above the core, facing along it toward the scout
      const look = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2)
      spawn = { pos: p.clone().addScaledVector(dir, 3.2).addScaledVector(side, -4), quat: q.clone().multiply(look) }; jet = true
    } else {
      const p = new THREE.Vector3(420000, 180000, -260000)
      spawn = { pos: p, quat: new THREE.Quaternion() }; jet = true
    }
    this.spawnAt = spawn
    if (!W.creative) this.stock()
    const P = this.player = new Engineer(W, spawn.pos)
    if (!W.creative) for (const [k, n] of [['plate', 10], ['construct', 12], ['interior', 6], ['computer', 4], ['motor', 2], ['tube_s', 4]]) P.inv.add(k, n)
    P.quat.copy(spawn.quat); P.jetpack = jet
    this.loadT = 0
    this.state = 'loading'
    this.camPos.copy(P.eye()); this.camQuat.copy(P.viewQuat())
  }
  // a survival start: tanks part full, cores with a little uranium, the workshop stocked for a first build
  stock() {
    for (const g of this.world.grids) {
      g.updateMass()
      for (const b of g.parts.tanks) b.gas = b.gasMax * (b.def.func.tank.gas === 'o2' ? 1 : 0.6)
      if (g.parts.power.some(b => b.def.func.power.out && !b.def.func.power.store && !b.def.func.power.solar)) netPut(g, 'ing_uranium', g.static ? 20 : 4)
      if (g.static && g.parts.kits.length) {
        for (const [k, n] of [['plate', 120], ['construct', 80], ['interior', 40], ['motor', 12], ['computer', 40], ['tube_s', 30], ['tube_l', 6], ['girder', 20], ['display', 6], ['glass', 20], ['grid', 12], ['cell', 6], ['ore_ice', 400], ['ing_iron', 300]]) netPut(g, k, n)
      }
    }
  }
  finishLoading() {
    this.state = 'play'
    this.menus.close()
    this.hud.show(true); this.hud.layout()
    if (!this.input.touch) this.p0.input.lockPointer()
    const sc = SCENARIOS.find(s => s.id === this.scenario)
    this.hud.toast(sc ? sc.name : 'VOIDWRIGHT')
    this.hud.toast('G: blocks · I: inventory · F: use / sit · X: jetpack · F1: controls', C.text)
    if (!this.world.creative) this.hud.toast('Survival: weld frames up with parts; watch your oxygen', C.amber)
  }
  quitToTitle() { this.clearWorld(); this.state = 'menu'; this.hud.show(false); this.menus.open('title') }
  respawnPoints() { const out = []; for (const g of this.world.grids) for (const b of g.parts?.medbays || []) out.push({ g, b }); return out }
  respawn() {
    const pts = this.respawnPoints(), P = this.player
    let pos = this.spawnAt.pos.clone(), q = this.spawnAt.quat.clone()
    if (pts.length) {
      pts.sort((a, b) => a.g.comWorld().distanceTo(P.pos) - b.g.comWorld().distanceTo(P.pos))
      const { g, b } = pts[0]
      pos = g.toWorld(g.blockPoint(b, 0, -0.3, 0.6)); q = g.quat.clone()
    }
    const N = this.player = new Engineer(this.world, pos)
    if (!this.world.creative) N.oxygen = 100
    N.quat.copy(q); N.jetpack = this.world.gravityAt(pos).length() < 0.3
    this.menus.close(); this.hud.show(true)
  }
  onGridRemoved(g) { if (this.player?.seat?.grid === g) this.player.seat = null; if (this.player?.ground === g) this.player.ground = null }
  onBlockRemoved(g, b) { if (this.player?.seat?.block === b) { this.player.seat = null } }
  onImpact(c) { if (c.A === this.player?.seat?.grid || c.B === this.player?.seat?.grid) { this.sfx.play('impact', Math.min(1, c.hit / 30)); this.shake = Math.min(1, c.hit / 25) } }
  // with a working ore detector near (on the grid you sit in or stand by): the nearest patch of each ore
  scanOre(P) {
    const W = this.world
    let range = 0
    for (const g of W.grids) { if (!g.parts?.detectors.length || g.frozen) continue; if (g !== P.seat?.grid && g.pos.distanceTo(P.pos) > g.radius + 30) continue; for (const b of g.parts.detectors) if (b.on && b.build >= 1) range = Math.max(range, b.def.func.detector[g.size]) }
    if (!range) return null
    const out = new Map(), p = new THREE.Vector3()
    const pl = W.universe.nearestPlanet(P.pos)
    if (pl && pl.ores.length && P.pos.distanceTo(pl.center) - pl.R < pl.relief + range) {
      const up = P.pos.clone().sub(pl.center).normalize(), e = new THREE.Vector3(0, 1, 0).cross(up).normalize(), n = up.clone().cross(e)
      for (let i = -9; i <= 9; i++) for (let j = -9; j <= 9; j++) {
        const dx = i / 9 * range, dz = j / 9 * range
        p.copy(up).multiplyScalar(pl.R).addScaledVector(e, dx).addScaledVector(n, dz).normalize()
        const h = pl.height(p.x, p.y, p.z, 4), gp = p.clone().multiplyScalar(pl.R + h)
        const ore = pl.oreAt(gp.x, gp.y, gp.z)
        if (ore === 'stone') continue
        const d = Math.hypot(dx, dz), cur = out.get(ore)
        if (!cur || d < cur.d) out.set(ore, { ore, d, pos: gp.add(pl.center) })
      }
    }
    for (const f of W.universe.fields) for (const a of f.near(P.pos, range * 8)) out.set('a' + a.id, { ore: a.ores.join(' + ') || 'stone', d: a.pos.distanceTo(P.pos), pos: a.pos, rock: true })
    return [...out.values()]
  }
  nearGrid(p, d) { let best = null, bd = d; for (const g of this.world.grids) { if (!g.parts?.invs.length) continue; const x = g.sdf(p, d, null); if (x < bd) { bd = x; best = g } } return best }
  groundNormal(hit) { if (hit.solid.surface) { const s = hit.solid.surface(hit.point); return new THREE.Vector3(s.nx, s.ny, s.nz) } const p = hit.point, e = 0.3, S = hit.solid; return new THREE.Vector3(S.sdf(p.clone().setX(p.x + e)) - S.sdf(p.clone().setX(p.x - e)), S.sdf(p.clone().setY(p.y + e)) - S.sdf(p.clone().setY(p.y - e)), S.sdf(p.clone().setZ(p.z + e)) - S.sdf(p.clone().setZ(p.z - e))).normalize() }
  // ---- the jump drive ----
  planJump(place) {
    const gr = this.player?.seat?.grid
    if (!gr) return
    const pw = gr.power
    if (pw && pw.supply + (pw.store > 0 ? 1 : 0) < 1 && !this.world.creative) { this.hud.toast('Not enough power to charge the jump drive', C.red); return }
    this.jump = { grid: gr, place, t: 10 }
    this.sfx.play('jump_charge', 0.6)
    this.hud.toast(`Jump drive charging: ${place.name}`, C.amber)
  }
  doJump() {
    const J = this.jump, gr = J.grid, pl = J.place
    this.jump = null
    if (!this.world.grids.includes(gr)) return
    // arrive outside the target: above the near side of a world, at the edge of a rock field, short of a
    // waypoint, well out from an unknown group's centre
    const from = gr.comWorld(), dir = from.clone().sub(pl.pos).normalize()
    const dist = pl.kind === 'planet' ? pl.r + Math.max(6000, pl.r * 0.55) : pl.kind === 'field' ? pl.r + 2500 : pl.kind === 'signal' ? 140000 : 300
    const to = pl.pos.clone().addScaledVector(dir, dist)
    this.world.universe.ensure(to)
    const d = to.clone().sub(from)
    gr.pos.add(d)
    for (const o of this.world.grids) if (o.locked?.grid === gr) o.pos.add(d)
    gr.vel.set(0, 0, 0); gr.angVel.set(0, 0, 0)
    this.sfx.play('jump', 0.9)
    this.flash = 1
    this.hud.toast(`Arrived at ${pl.name}`, C.gold2)
  }
  // ---- debug keys (local dev kit only) ----
  debugKey(e) {
    const P = this.player
    if (e.code === 'F3' && this.state === 'menu') { this.startWorld(['planet', 'orbit', 'rocks'][this.dbgV = ((this.dbgV ?? -1) + 1) % 3], 'survival'); return }
    if (e.code === 'F9' && this.state === 'menu') { this.startWorld(['planet', 'orbit', 'moon', 'rocks', 'empty'][this.dbgS = ((this.dbgS ?? -1) + 1) % 5]); return }
    if (!P) return
    if (e.code === 'F8') { this.quitToTitle(); return }
    if (e.code === 'Numpad3') { // dig a tunnel along the view from the first rock it meets
      const eye = this.camPos.clone(), dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camQuat), h = this.world.raycast(eye, dir, 60)
      if (h?.solid) { for (let i = 0; i < 10; i++) this.world.survival.dig(h.point.clone().addScaledVector(dir, i * 1.3), 1.7, 0); this.p0.log('dbg tunnel at', Math.round(h.dist), 'm; voxel chunks', this.world.universe.nearestPlanet(eye)?.vox.chunks.size) } else this.p0.log('dbg no rock ahead')
    }
    if (e.code === 'Numpad7') this.p0.log('dbg uni', JSON.stringify({ awake: this.world.universe.planets.map(p => p.name), known: [...this.world.universe.known], sig: this.world.universe.signals(P.pos).slice(0, 2).map(x => Math.round(x.dist / 1000)), pos: P.pos.toArray().map(v => Math.round(v / 1000)), trees: this.world.trees.count, marks: (this.oreMarks || []).length }))
    if (e.code === 'Numpad1') { // a showroom: each press puts the next design in front of you
      if (this.dbgShow) this.world.removeGrid(this.dbgShow)
      const ids = ['sparrow', 'pick', 'mule', 'mole', 'lancer', 'kestrel', 'foothold'], id = ids[this.dbgP = ((this.dbgP ?? -1) + 1) % ids.length]
      const q = P.viewQuat(), g = this.spawnGrid(id, P.pos.clone(), q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, e.shiftKey ? 2.5 : -0.7, 0, 'YXZ'))), { static: true })
      g.pos.copy(P.eye()).add(new THREE.Vector3(0, 0, -(g.radius * 1.9 + 4)).applyQuaternion(q)).sub(g.com.clone().applyQuaternion(g.quat))
      this.dbgShow = g; this.p0.log('dbg show', id, g.blocks.size)
    }
    if (e.code === 'Numpad2') P.pitch = -0.9
    if (e.code === 'Numpad8') P.pitch = 0
    if (e.code === 'Numpad6') P.look(-0.4, 0)
    if (e.code === 'Numpad5') { const st = this.world.grids.find(g => g.static && g.parts?.kits.length); if (st) { this.terminalGrid = st; this.menus.open('production'); st.queue = [{ id: 'plate', n: 3 }, { id: 'motor', n: 1 }] } }
    if (e.code === 'Numpad4') { this.p0.log('dbg surv', JSON.stringify({ o2: P.oxygen.toFixed(1), h2: P.fuel.toFixed(1), en: P.energy.toFixed(1), inv: [...P.inv.items].map(([k, n]) => k + ':' + n.toFixed(1)), grids: this.world.grids.map(g => g.name + (g.static ? '(st)' : '') + ' pw' + (g.power ? g.power.ratio.toFixed(2) + '/' + g.power.supply.toFixed(1) : '-') + ' q' + (g.queue || []).length + ' ' + [...(g.parts?.refineries || []), ...(g.parts?.assemblers || [])].map(b => b.status).join('|')) })) }
    if (e.code === 'F2') this.p0.log('dbg', JSON.stringify({ pos: P.pos.toArray().map(v => Math.round(v)), vel: P.vel.length().toFixed(2), ground: P.onGround, g: P.gravity.toFixed(2), jet: P.jetpack, seat: !!P.seat, grids: this.world.grids.length, prog: this.engine.renderer.info.programs?.length, calls: this.engine.renderer.info.render.calls, tris: this.engine.renderer.info.render.triangles, pending: this.world.universe.planets.map(p => p.pending).join() }))
    if (e.code === 'F4') { const gr = this.world.grids.find(g => g.parts?.cockpits.length && !g.static); if (gr) { P.enterSeat(gr, gr.parts.cockpits[0]); this.p0.log('dbg seat', gr.name) } }
    if (e.code === 'F6' && P.seat) { const g = P.seat.grid; this.p0.log('dbg ship', JSON.stringify({ v: g.vel.toArray().map(v => v.toFixed(2)), w: g.angVel.toArray().map(v => v.toFixed(3)), mass: Math.round(g.mass), max: [...g.thrustMax].map(v => Math.round(v / 1000)), out: [...g.thrustOut].map(v => v.toFixed(2)), sleep: g.sleep.toFixed(2), touch: g.touching, air: g.air?.toFixed(2), grav: g.gravity?.toFixed(2), power: g.power, locked: !!g.locked })) }
    if (e.code === 'F10' && P.seat) { const U = this.world.universe, pl = e.shiftKey || this.dbgJ ? U.signals(P.pos)[0] : U.places().find(x => x.id === 'ket'); this.dbgJ = true; if (pl) { this.planJump(pl); this.jump.t = 0.15 } }
    if (e.code === 'F7') { this.world.universe.time += 600; this.hud.toast('+10 min') }
    if (e.code === 'Numpad0') { this.engine.resScale = this.engine.resScale === 2 ? 0.4 : 2; this.engine.resize() }
    if (e.code === 'Numpad9') { this.photo = this.photo || new Photo(this); this.photoWant = (this.photoWant ?? this.photo.n) + 1 }
  }
  // ---- the frame ----
  frame(dt) {
    this.time += dt
    const inp = this.input, W = this.world, e = this.engine
    const T = [performance.now()], mk = () => T.push(performance.now())
    if (this.state === 'menu') this.titleView(this.time)
    if (this.state === 'loading') this.loading(dt)
    if (this.state === 'play') this.play(dt)
    if (this.photoWant != null && this.state === 'play') { this.photo.set(this.photoWant); this.photoWant = null }
    const ph = this.state === 'play' && this.photo?.on ? this.photo : null
    if (ph) ph.tick(dt)
    mk()
    // the star, the haze, the terrain round the camera
    const sun = W.universe.updateSun(ph ? 0 : dt)
    W.universe.update(this.camPos, this.time, e.quality)
    mk()
    const budget = ph ? 400 : this.state === 'loading' ? 60 : this.state === 'play' ? 5 : 10
    e.uiOnly = this.state === 'loading'
    W.universe.work(budget)
    if (this.state !== 'menu') { const tp = W.universe.nearestPlanet(this.camPos); W.trees.update(tp, this.camPos, this.player ? (this.player.seat ? this.player.seat.grid.vel.length() : this.player.vel.length()) : 0, e.quality.detail) } else W.trees.update(null)
    mk()
    e.setView(this.camPos, this.camQuat, ph?.cam ? ph.fov : this.state === 'play' ? this.settings.fov : 55)
    this.environment(sun)
    W.draw(dt)
    e.sync()
    this.syncPlayerModel()
    if (this.icons.step(this.state === 'play' ? 3 : 8, this.state === 'play' ? 2 : 4)) { this.hud.bar.dirty = true; if (this.menus.page === 'catalog') this.menus.panel.dirty = true }
    this.hud.update(dt)
    this.menus.update()
    this.touch.update()
    this.sfx.update(dt)
    this.ui.update()
    mk()
    e.render(false)
    if (this.debug) { const gl = e.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this._px || (this._px = new Uint8Array(4))) }
    mk()
    inp.endFrame()
    const tot = T[T.length - 1] - T[0]
    if (this.debug && tot > 120 && (this.slowLogged = (this.slowLogged || 0) + 1) < 40) this.p0.log('dbg slow frame', Math.round(tot), 'play/update/work/rest/render', T.slice(1).map((t, i) => Math.round(t - T[i])).join(' '), 'progs', e.renderer.info.programs?.length)
  }
  loading(dt) {
    this.loadT += dt
    const P = this.player
    this.camPos.copy(P.eye()); this.camQuat.copy(P.viewQuat())
    const left = this.world.universe.planets.reduce((s, p) => s + p.pending, 0) + this.world.universe.fields.reduce((s, f) => s + f.queue.length, 0)
    this.loadLeft = left
    this.menus.panel.dirty = true
    for (const g of this.world.grids) g.rebuild()
    if ((left < 3 && this.loadT > 0.6) || this.loadT > 14) this.finishLoading()
  }
  play(dt) {
    const g = this, inp = this.input, P = this.player, W = this.world, B = this.builder
    if (!P) return
    const menu = this.menus.visible
    // global keys
    if (inp.hit('pause')) { if (menu) this.menus.close(); else this.menus.open('pause') }
    if (inp.hit('help') && !menu) { this.menus.from = 'help'; this.menus.open('controls') }
    if (P.dead) { if (!menu) this.menus.open('dead'); P.update(dt, { move: [0, 0, 0] }); this.cameraFor(P, dt); return }
    // the controls for this frame
    const look = menu ? (inp.takeLook(), { yaw: 0, pitch: 0 }) : inp.takeLook()
    const mv = menu ? [0, 0, 0] : [inp.axis('left', 'right'), (inp.down('up') ? 1 : 0) - (inp.down('down') ? 1 : 0), inp.axis('back', 'forward')]
    const roll = menu ? 0 : (inp.down('rollL') ? 1 : 0) - (inp.down('rollR') ? 1 : 0)
    if (!menu) {
      if (inp.hit('view')) this.view = this.view === 'fp' ? 'tp' : 'fp'
      if (inp.hit('terminal')) { this.terminalGrid = P.seat?.grid || B.hit?.grid || P.ground; this.menus.open('terminal') }
      if (inp.hit('blueprints')) { if (W.creative) this.menus.open('blueprints'); else this.hud.toast('Blueprints are for creative mode (a projector arrives in the next update)') }
      if (inp.hit('map')) this.menus.open('map')
      if (inp.hit('inventory')) { this.invGrid = P.seat?.grid || (B.hit?.grid && B.hit.dist < 6 ? B.hit.grid : null) || this.nearGrid(P.pos, 8); this.menus.open('inventory') }
    }
    let piloted = null, ctl = null
    if (P.seat) {
      const gr = P.seat.grid
      piloted = P.seat
      if (!menu) {
        if (inp.hit('use')) { P.leaveSeat(); this.sfx.play('seat', 0.5) }
        if (inp.hit('dampeners')) { gr.dampeners = !gr.dampeners; this.hud.toast(gr.dampeners ? 'Inertia dampeners on' : 'Inertia dampeners off'); this.sfx.play('ui_on', 0.4) }
        if (inp.hit('park')) { const r = W.tryLock(gr); this.hud.toast(r === 'locked' ? 'Landing clamps locked' : r === 'unlocked' ? 'Landing clamps released' : gr.parts.gears.length ? 'No clamp is touching anything' : 'This grid has no landing clamps'); if (r !== 'none') this.sfx.play('gear', 0.5) }
        if (inp.hit('light')) { gr.lights = !gr.lights; for (const b of gr.parts.lights) gr.touch(b) }
        if (inp.hit('jump')) { if (this.jump) { this.jump = null; this.hud.toast('Jump cancelled') } else if (gr.parts.jumpdrives.length) this.menus.open('jump'); else this.hud.toast('This grid has no jump drive') }
      }
      if (P.seat) {
        // free look holds the ship's attitude and turns only your head
        const free = inp.down('freeLook') || this.view === 'tp' && inp.mouse.right
        const k = gr.size === 'large' ? 0.9 : 1.6
        const rate = v => Math.max(-k, Math.min(k, v / Math.max(dt, 1 / 120) * 0.45))
        if (free) { this.freeLook = this.freeLook || { yaw: 0, pitch: 0 }; this.freeLook.yaw += look.yaw; this.freeLook.pitch = Math.max(-1.4, Math.min(1.4, this.freeLook.pitch + look.pitch)) }
        else if (this.freeLook) { this.freeLook.yaw *= 0.8; this.freeLook.pitch *= 0.8; if (Math.abs(this.freeLook.yaw) + Math.abs(this.freeLook.pitch) < 0.01) this.freeLook = null }
        ctl = { move: [mv[0] * (inp.down('sprint') ? 1 : 1), mv[1], -mv[2]], turn: free ? [0, 0, 0] : [rate(look.pitch), rate(look.yaw), roll * k] }
        if (inp.touch && inp.stick) ctl.move = [inp.stick.x, mv[1], -inp.stick.y]
      }
    } else if (!menu) {
      if (inp.hit('jetpack')) { P.jetpack = !P.jetpack; this.hud.toast(P.jetpack ? 'Jetpack on' : 'Jetpack off'); this.sfx.play('ui_on', 0.3) }
      if (inp.hit('dampeners')) { P.dampeners = !P.dampeners; this.hud.toast(P.dampeners ? 'Suit dampeners on' : 'Suit dampeners off') }
      if (inp.hit('light')) P.light = !P.light
      if (inp.hit('catalog')) this.menus.open('catalog')
      if (inp.hit('palette')) this.menus.open('palette')
      for (let i = 1; i <= 9; i++) if (inp.hit('slot' + i)) B.select(i - 1)
      if (inp.hit('slot0')) B.slot = -1
      if (inp.hit('use') && this.interactTarget) this.interactTarget.fn()
      P.look(look.yaw, look.pitch)
      P.crouch = inp.down('down') && !P.jetpack
    }
    // ships move, then the engineer (on what moved)
    W.update(dt, piloted, ctl)
    if (P.seat) { const n = W.survival.shipDrill(P.seat.grid, dt, !menu && inp.mouse.left && P.seat.grid.parts.drills.length > 0); if (n) this.shake = Math.max(this.shake || 0, 0.15) }
    this.oreT = (this.oreT || 0) + dt
    if (this.oreT > 2) { this.oreT = 0; this.oreMarks = this.scanOre(P) }
    this.suitWarn = W.survival.suit(P, dt)
    if (this.suitWarn && this.suitWarn !== this.lastWarn) { this.hud.toast(this.suitWarn, C.red); this.sfx.play('ui_error', 0.5) }
    this.lastWarn = this.suitWarn
    if (P.outOfFuel) { P.outOfFuel = false; this.hud.toast('Jetpack out of hydrogen', C.red) }
    if (!P.seat) P.update(dt, { move: P.seat ? [0, 0, 0] : mv, sprint: inp.down('sprint'), jump: !P.jetpack && inp.hit('up'), roll })
    else P.update(dt, {})
    if (P.health < 100 && !P.dead) for (const { g, b } of this.respawnPoints()) if (g.toWorld(g.blockCenter(b)).distanceTo(P.pos) < 3) P.health = Math.min(100, P.health + dt * 15)
    if (this.jump) { this.jump.t -= dt; if (this.jump.t <= 0) this.doJump() }
    if (P.lastHealth != null && P.health < P.lastHealth - 1) P.hurtFlash = 0.6
    P.lastHealth = P.health
    if (P.hurtFlash) P.hurtFlash = Math.max(0, P.hurtFlash - dt)
    this.cameraFor(P, dt, look)
    // what you can use, and building
    this.interactTarget = null
    if (!P.seat) {
      if (!menu) B.update(dt); else { B.mesh.visible = B.edges.visible = false }
      const h = B.hit
      if (h?.block && h.dist < (h.grid.size === 'large' ? 5 : 3.5)) {
        const b = h.block, f = b.def.func
        if (f?.cockpit && b.build < 1) this.interactTarget = { label: `${b.name} is not finished: weld it first`, fn: () => {} }
        else if (f?.cockpit) this.interactTarget = { label: `Sit in ${b.name}`, fn: () => { P.enterSeat(h.grid, b); this.view = 'fp'; this.sfx.play('seat', 0.5); this.hud.toast(`${h.grid.name}: WASD, Space/C to fly, mouse to turn, Z dampeners, F to leave`) } }
        else if (f?.hangar && b.build >= 1) this.interactTarget = { label: b.open ? 'Close the hangar door' : 'Open the hangar door', fn: () => { const o = !b.open; for (const d of h.grid.parts.doors) if (d.def.func.hangar) { d.open = o; h.grid.touch(d) } this.sfx.play('door', 0.7, 0.7) } }
        else if (f?.door && b.build >= 1) this.interactTarget = { label: b.open ? 'Close door' : 'Open door', fn: () => { b.open = !b.open; h.grid.touch(b); this.sfx.play('door', 0.5) } }
        else if (f?.medbay) this.interactTarget = { label: `${b.name}: stand by it to heal and refill your suit`, fn: () => {} }
        else if (f?.inv || f?.tank) this.interactTarget = { label: `Open ${h.grid.name}'s cargo`, fn: () => { this.invGrid = h.grid; this.menus.open('inventory') } }
      }
    } else { B.mesh.visible = B.edges.visible = B.vol.visible = false; B.hit = null; B.toolOn = false }
  }
  // the view: first or third person, on foot or in a seat
  cameraFor(P, dt, look = { yaw: 0, pitch: 0 }) {
    const e = this.engine
    if (P.seat) {
      const gr = P.seat.grid
      const p = new THREE.Vector3(), q = new THREE.Quaternion()
      P.seatFrame(p, q)
      if (this.freeLook) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.freeLook.pitch, this.freeLook.yaw, 0, 'YXZ')))
      if (this.view === 'tp') {
        const back = gr.radius * 1.9 + 6
        this.camPos.copy(gr.comWorld()).add(new THREE.Vector3(0, back * 0.28, back).applyQuaternion(q))
      } else this.camPos.copy(p)
      this.camQuat.copy(q)
    } else {
      const eye = P.eye(), q = P.viewQuat()
      if (this.view === 'tp') {
        const back = new THREE.Vector3(0.4, 0.5, 3.6).applyQuaternion(q)
        this.camPos.copy(eye).add(back)
      } else this.camPos.copy(eye)
      this.camQuat.copy(q)
    }
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2); this.camQuat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * this.shake * 0.03, (Math.random() - 0.5) * this.shake * 0.03, 0))) }
  }
  // ---- light and air ----
  environment(sun) {
    const e = this.engine, W = this.world, U = W.universe, cam = this.camPos
    // the planet with air nearest the camera lends its haze to ships and rocks
    let best = null, bd = Infinity
    for (const pl of U.planets) { if (!pl.atmo) continue; const d = cam.distanceTo(pl.center) - pl.AR; if (d < bd) { bd = d; best = pl } }
    const su = e.spaceUniforms
    if (best && bd < best.R * 2) {
      e.rel(best.center, su.uPC.value); su.uPR.value = best.R; su.uAR.value = best.AR; su.uDen.value = best.atmo.density; su.uDay.value.copy(best.uniforms.uDay.value); su.uDusk.value.copy(best.uniforms.uDusk.value); su.uHaze.value = 1
    } else su.uHaze.value = 0
    su.uSunD.value.copy(sun)
    // daylight round the camera: in air, on the lit side
    let day = 0, shade = 1
    for (const pl of U.planets) {
      const r = cam.distanceTo(pl.center)
      if (pl.atmo && r < pl.AR) {
        const up = cam.clone().sub(pl.center).normalize(), sh = up.dot(sun)
        const inAir = Math.min(1, (pl.AR - r) / (pl.atmo.height * 0.7))
        day = Math.max(day, inAir * THREE.MathUtils.smoothstep(sh, -0.15, 0.15))
      }
      // the planet between you and the star
      const c = pl.center.clone().sub(cam), t = c.dot(sun)
      if (t > 0) { const miss = Math.sqrt(Math.max(0, c.lengthSq() - t * t)); shade = Math.min(shade, THREE.MathUtils.smoothstep(miss, pl.R * 0.985, pl.R * 1.02)) }
    }
    this.sky.update(sun, day)
    const col = new THREE.Color(1, 0.96, 0.9)
    const near = U.nearestPlanet(cam)
    if (near?.atmo && cam.distanceTo(near.center) < near.AR) { const sh = cam.clone().sub(near.center).normalize().dot(sun); col.lerp(new THREE.Color(1, 0.55, 0.3), 1 - THREE.MathUtils.smoothstep(sh, 0, 0.3)) }
    e.setSun(sun, col, 3.0 * shade)
    // the fill light: sky blue in air by day, faint planet-shine in space
    e.fill.intensity = 0.25 + day * 0.9
    e.fill.color.set(day > 0.1 ? 0x9ab8e0 : 0x6a7a90)
    e.fill.groundColor.set(day > 0.1 ? 0x5a5040 : 0x1c1e22)
    this.lights()
  }
  // lamps: the nearest few lights of the grids borrow the engine's fixed lamps; the helmet light is a spot
  lights() {
    const e = this.engine, P = this.player, cam = this.camPos
    const cand = []
    const blink = (Math.floor(this.time * 1.5) % 2) === 0
    for (const g of this.world.grids) {
      if (!g.parts?.lights.length || !g.lights) continue
      if (g.comWorld().distanceTo(cam) > g.radius + 200) continue
      for (const b of g.parts.lights) {
        if (!b.on) continue
        const f = b.def.func.light
        if (f.blink && !blink) continue
        const at = f.at || [0, 0, 0], p = g.toWorld(g.blockPoint(b, at[0], at[1], at[2]))
        cand.push({ g, b, f, p, d: p.distanceTo(cam) })
      }
    }
    cand.sort((a, b) => a.d - b.d)
    const pts = cand.filter(c => !c.f.spot), spots = cand.filter(c => c.f.spot)
    const nl = Math.min(e.lamps.length, e.quality.lights)
    for (let i = 0; i < e.lamps.length; i++) {
      const L = e.lamps[i], c = i < nl ? pts[i] : null
      if (c) { e.rel(c.p, L.position); L.color.setRGB(...c.f.color); L.intensity = (c.g.size === 'large' ? 40 : 8); L.distance = c.f.range * (c.g.size === 'large' ? 1 : 0.4) } else L.intensity = 0
    }
    // the helmet light and the nearest floodlight
    const hs = e.spots[0]
    if (P && P.light && !P.seat) { e.rel(this.camPos, hs.position); hs.target.position.copy(hs.position).add(new THREE.Vector3(0, 0, -10).applyQuaternion(this.camQuat)); hs.intensity = 60; hs.distance = 50; hs.angle = 0.55; hs.target.updateMatrixWorld() } else hs.intensity = 0
    const fs = e.spots[1], c = spots[0]
    if (c) { e.rel(c.p, fs.position); const dir = c.g.dirToWorld(c.g.blockDir(c.b, 0, 0, -1)); fs.target.position.copy(fs.position).addScaledVector(dir, 20); fs.target.updateMatrixWorld(); fs.intensity = c.g.size === 'large' ? 900 : 200; fs.distance = c.f.range; fs.angle = 0.42 } else fs.intensity = 0
  }
  // the engineer seen in third person
  syncPlayerModel() {
    const P = this.player
    if (!this.pmodel) this.pmodel = makeEngineerModel(this.engine)
    const m = this.pmodel
    m.visible = !!P && !P.seat && this.view === 'tp' && this.state === 'play'
    if (!m.visible) return
    this.engine.rel(P.pos, m.position)
    m.quaternion.copy(P.quat)
    m.children.find(c => c.name === 'flame').visible = P.jetpack && P.thrusting > 0.05
  }
}

// the engineer: a suit, a helmet with a teal visor, a jetpack
function makeEngineerModel(engine) {
  const g = new THREE.Group()
  const suit = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.7, metalness: 0.1 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x30353a, roughness: 0.6, metalness: 0.3 })
  const accent = new THREE.MeshStandardMaterial({ color: 0xe08a2a, roughness: 0.6 })
  const visor = new THREE.MeshStandardMaterial({ color: 0x1a4a4c, roughness: 0.1, metalness: 0.8, emissive: 0x0a3a38, emissiveIntensity: 0.6 })
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m }
  add(new THREE.BoxGeometry(0.46, 0.62, 0.28), suit, 0, 1.18, 0)
  add(new THREE.BoxGeometry(0.48, 0.12, 0.3), accent, 0, 1.0, 0)
  add(new THREE.SphereGeometry(0.17, 16, 12), suit, 0, 1.62, 0)
  add(new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), visor, 0, 1.63, -0.06).rotation.x = -Math.PI / 2
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.15, 0.5, 0.16), suit, s * 0.32, 1.17, 0)
    add(new THREE.BoxGeometry(0.17, 0.82, 0.19), suit, s * 0.12, 0.45, 0)
    add(new THREE.BoxGeometry(0.18, 0.1, 0.27), dark, s * 0.12, 0.05, -0.03)
  }
  add(new THREE.BoxGeometry(0.38, 0.5, 0.2), dark, 0, 1.2, 0.24)
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.06, 0.08, 0.22, 10), dark, s * 0.12, 0.88, 0.28)
  const fl = add(new THREE.ConeGeometry(0.07, 0.5, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x8adfff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.55, 0.28)
  fl.rotation.x = Math.PI; fl.name = 'flame'
  engine.scene.add(g)
  return g
}
