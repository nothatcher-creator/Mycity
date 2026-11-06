// The helmet display: crosshair and prompts, the toolbar, the suit's state (bottom right), the ship's
// state when seated (bottom left, with an artificial horizon in gravity), what you are looking at (right),
// short notices (top), and markers for planets, rock fields and beacons on the glass.
import * as THREE from 'three'
import { Panel, C, FONT, text, box, bar, chip, icon } from './ui.js'
import { BLOCKS } from '../grid/blocks.js'
import { TOOLS } from '../game/build.js'
import { keyLabel } from '../core/input.js'

const fmtDist = d => d >= 100000 ? `${Math.round(d / 1000)} km` : d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`
const fmtMass = m => m >= 1e6 ? `${(m / 1e6).toFixed(2)} kt` : m >= 1000 ? `${(m / 1000).toFixed(1)} t` : `${Math.round(m)} kg`
const fmtW = mw => mw >= 1 ? `${mw.toFixed(1)} MW` : `${Math.round(mw * 1000)} kW`

export class HUD {
  constructor(game) {
    this.g = game
    const ui = game.ui
    this.cross = ui.add(new Panel(ui, 0, 0, 360, 120, (c, p) => this.drawCross(c, p), { order: 2 }))
    this.bar = ui.add(new Panel(ui, 0, 0, 10, 10, (c, p) => this.drawBar(c, p), { order: 2 }))
    this.suit = ui.add(new Panel(ui, 0, 0, 250, 150, (c, p) => this.drawSuit(c, p), { order: 2 }))
    this.ship = ui.add(new Panel(ui, 0, 0, 270, 196, (c, p) => this.drawShip(c, p), { order: 2 }))
    this.info = ui.add(new Panel(ui, 0, 0, 250, 112, (c, p) => this.drawInfo(c, p), { order: 2 }))
    this.note = ui.add(new Panel(ui, 0, 0, 560, 44, (c, p) => this.drawNote(c, p), { order: 3 }))
    this.marks = ui.add(new Panel(ui, 0, 0, 10, 10, (c, p) => this.drawMarks(c, p), { order: 1 }))
    this.notes = []
    this.t = 0
    this.visible = false
    this.layout()
  }
  get touch() { return this.g.input.touch }
  layout() {
    const e = this.g.engine, W = e.width, H = e.height
    const n = 9
    if (this.touch) {
      // between the stick (left) and the buttons (right); panels along the top
      const T = this.g.touch, left = (T?.R || 50) * 2.9, right = W - (T?.blockW || 220) - 10
      const sw = Math.max(34, Math.min(54, (right - left) / (n + 0.3)))
      this.slotW = sw
      this.bar.place(left + (right - left - sw * n - 8) / 2, H - sw - 30, sw * n + 8, sw + 26)
      this.suit.place(10, 10, 230, 150); this.ship.place(10, 10, 260, 196)
      this.info.place(W - 240, 10, 230, 112)
      this.cross.place(W / 2 - 180, H / 2 - 30, 360, 120)
      this.note.place(W / 2 - 280, Math.min(150, H * 0.3), 560, 44)
    } else {
      const sw = Math.min(64, (W - 40) / (n + 0.5))
      this.slotW = sw
      this.bar.place((W - sw * n - 8) / 2, H - sw - 30, sw * n + 8, sw + 26)
      this.cross.place(W / 2 - 180, H / 2 - 30, 360, 120)
      this.suit.place(W - 262, H - 162, 250, 150)
      // a narrow window: the suit panel sits above the toolbar's right end
      if ((W + sw * n) / 2 > W - 266) this.suit.place(W - 262, H - sw - 40 - 156, 250, 150)
      this.ship.place(12, H - 208, 270, 196)
      this.info.place(W - 262, H * 0.3, 250, 112)
      this.note.place(W / 2 - 280, 14, 560, 44)
    }
    this.marks.place(0, 0, W, H)
    for (const p of [this.cross, this.bar, this.suit, this.ship, this.info, this.note, this.marks]) p.dirty = true
  }
  show(v) { this.visible = v; for (const p of [this.cross, this.bar, this.suit, this.ship, this.info, this.note, this.marks]) p.show(v) }
  toast(msg, color = C.gold2) { this.notes.push({ msg, color, t: 3.5 }); if (this.notes.length > 3) this.notes.shift(); this.note.dirty = true }
  update(dt) {
    if (!this.visible) return
    this.t += dt
    for (const n of this.notes) n.t -= dt
    const before = this.notes.length
    this.notes = this.notes.filter(n => n.t > 0)
    if (before !== this.notes.length) this.note.dirty = true
    const P = this.g.player
    this.ship.show(!!P?.seat && !this.g.menus.visible)
    if (this.touch) this.suit.show(!P?.seat && !this.g.menus.visible)
    this.info.show(!!this.g.builder.hit?.block && !P?.seat && !this.g.menus.visible)
    this.note.show(this.notes.length > 0)
    // live panels redraw a few times a second
    this.acc = (this.acc || 0) + dt
    if (this.acc > 0.1) { this.acc = 0; this.suit.dirty = true; this.ship.dirty = true; this.info.dirty = true; this.marks.dirty = true; this.cross.dirty = true }
    const key = this.g.builder.slot + '|' + this.g.builder.size + '|' + this.g.builder.bar.map(x => x.block || x.tool).join()
    if (key !== this.barKey) { this.barKey = key; this.bar.dirty = true }
  }
  // ---- the crosshair and what you can do here ----
  drawCross(c, p) {
    const g = this.g, P = g.player, B = g.builder, cx = 180, cy = 30
    if (!P || P.dead) return
    if (!P.seat) {
      c.strokeStyle = 'rgba(166,255,245,0.9)'; c.lineWidth = 1.5
      c.beginPath(); c.arc(cx, cy, 3, 0, Math.PI * 2); c.stroke()
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.beginPath(); c.moveTo(cx + dx * 7, cy + dy * 7); c.lineTo(cx + dx * 12, cy + dy * 12); c.stroke() }
    } else {
      c.strokeStyle = 'rgba(166,255,245,0.7)'; c.lineWidth = 1.5
      c.beginPath(); c.moveTo(cx - 22, cy); c.lineTo(cx - 8, cy); c.moveTo(cx + 8, cy); c.lineTo(cx + 22, cy); c.moveTo(cx, cy - 8); c.lineTo(cx, cy - 4); c.stroke()
    }
    // the prompt: use, or what the block in hand will do
    const lines = []
    const it = g.interactTarget
    if (it) lines.push([`${keyLabel(g.input.binds.use)}  ${it.label}`, C.gold2])
    if (B.blockId && !P.seat) {
      const t = B.target, d = BLOCKS[B.blockId]
      if (t && !t.ok) lines.push([t.why === 'you' ? 'Blocked: you are standing there' : 'Blocked: something is in the way', C.red])
      else if (t && !t.grid) lines.push([t.onRock ? 'New station (built into the rock)' : t.anchor ? `New ${B.size} grid on ${t.anchor.name}` : `New ${B.newStatic ? 'station' : 'ship'} (${keyLabel(g.input.binds.gridType)} to switch)`, C.dim])
    }
    if (B.tool && B.hit?.block) { const b = B.hit.block; lines.push([`${TOOLS[B.tool].name}: ${b.name} ${Math.round(b.hp / b.maxHp * 100)}%`, B.toolOn ? C.amber : C.dim]) }
    if (B.paste) lines.push(['Left button: place   Right button: cancel', C.gold2])
    let y = cy + 34
    for (const [s, col] of lines) { text(c, s, cx, y, { size: 13, weight: 600, color: col, align: 'center', shadow: true }); y += 18 }
  }
  // ---- the toolbar ----
  drawBar(c, p) {
    const g = this.g, B = g.builder, sw = this.slotW, icons = g.icons
    const name = B.item ? (B.item.block ? `${BLOCKS[B.item.block].name}` : TOOLS[B.item.tool].name) : 'Empty hands'
    text(c, name, p.w / 2, 13, { size: 13, weight: 700, color: C.gold2, align: 'center', shadow: true })
    if (B.blockId) { const sz = B.size === 'large' ? 'LARGE' : 'SMALL'; chip(c, sz, p.w / 2 + c.measureText(name).width / 2 + 10, 3, 14, { size: 9 }) }
    for (let i = 0; i < 9; i++) {
      const x = 4 + i * sw, y = 20, it = B.bar[i], sel = B.slot === i
      const b = p.button(c, 'slot' + i, x + 2, y, sw - 4, sw - 4, '', () => { g.builder.select(i); this.bar.dirty = true }, { selected: sel })
      if (it?.block) { const ic = icons?.get(it.block, B.size); if (ic) c.drawImage(ic, x + 4, y + 2, sw - 8, sw - 8) }
      else if (it?.tool) { icon(c, it.tool === 'welder' ? 'bolt' : it.tool === 'grinder' ? 'flare' : 'fire', x + sw * 0.25, y + sw * 0.2, sw * 0.5, sel ? C.gold2 : C.text) }
      text(c, String(i + 1), x + 7, y + 13, { size: 11, weight: 700, color: sel ? C.gold2 : C.dim })
    }
  }
  // ---- the suit ----
  drawSuit(c, p) {
    const g = this.g, P = g.player
    if (!P) return
    box(c, 0, 0, p.w, p.h)
    text(c, 'SUIT', 12, 18, { size: 11, weight: 700, color: C.gold })
    const flags = [[P.jetpack ? 'JETPACK' : 'JETPACK OFF', P.jetpack ? C.gold2 : C.dim], [P.dampeners ? 'DAMPENERS' : 'DAMPENERS OFF', P.dampeners ? C.gold2 : C.amber]]
    let fx = 58
    for (const [s, col] of flags) { const w = chip(c, s, fx, 7, 15, { size: 8.5, color: col, stroke: col === C.dim ? 'rgba(134,162,166,0.5)' : undefined, fill: col === C.dim ? 'rgba(0,0,0,0.2)' : undefined }); fx += w + 5 }
    const rows = [['HEALTH', P.health / 100, P.health < 30 ? C.red : C.green], ['ENERGY', P.energy / 100, C.gold], ['FUEL', P.fuel / 100, C.blue]]
    let y = 34
    for (const [l, f, col] of rows) { text(c, l, 12, y + 8, { size: 9.5, weight: 700, color: C.dim }); bar(c, 70, y, p.w - 120, 9, f, col); text(c, `${Math.round(f * 100)}%`, p.w - 12, y + 9, { size: 10, weight: 700, align: 'right' }); y += 16 }
    // motion and place
    const sp = P.seat ? P.seat.grid.vel.length() : P.vel.length()
    const gf = P.gravity / 9.81
    text(c, `${sp.toFixed(1)} m/s`, 12, y + 18, { size: 17, weight: 700, color: C.text })
    text(c, `${gf.toFixed(2)} g`, p.w / 2 + 6, y + 18, { size: 17, weight: 700, color: gf > 0.05 ? C.text : C.dim })
    const pl = g.world.universe.nearestPlanet(P.pos), alt = pl ? pl.surface(P.pos).alt : 0
    const where = pl && alt < pl.R * 1.4 ? `${pl.name.toUpperCase()} · ${fmtDist(Math.max(0, alt))} UP` : 'DEEP SPACE'
    text(c, where, 12, y + 38, { size: 10.5, weight: 700, color: C.dim })
    if (g.world.airAt(P.pos) > 0.3) text(c, 'AIR OK', p.w - 12, y + 38, { size: 10, weight: 700, color: C.green, align: 'right' })
  }
  // ---- the ship you sit in ----
  drawShip(c, p) {
    const g = this.g, P = g.player
    if (!P?.seat) return
    const gr = P.seat.grid
    box(c, 0, 0, p.w, p.h)
    text(c, gr.name.toUpperCase(), 12, 18, { size: 12, weight: 700, color: C.gold, max: p.w - 90 })
    chip(c, gr.size === 'large' ? 'LARGE' : 'SMALL', p.w - 10, 6, 15, { size: 8.5, align: 'right' })
    const sp = gr.vel.length()
    text(c, `${sp.toFixed(1)}`, 12, 54, { size: 30, weight: 700 }); text(c, 'm/s', 14 + c.measureText(sp.toFixed(1)).width, 54, { size: 12, weight: 600, color: C.dim })
    const flags = [[gr.dampeners ? 'DAMPENERS' : 'DAMPENERS OFF', gr.dampeners ? C.gold2 : C.amber], [gr.locked ? 'LOCKED' : (gr.parts.gears.length ? 'GEAR FREE' : ''), gr.locked ? C.amber : C.dim]]
    let fx = 150, fy = 30
    for (const [s, col] of flags) { if (!s) continue; chip(c, s, fx, fy, 15, { size: 8.5, color: col }); fy += 19 }
    // thrust to weight and power
    const pw = gr.power || { supply: 0, want: 0, store: 0, cap: 0, ratio: 1 }
    const wt = gr.mass * Math.max(0.01, gr.gravity || 0)
    const up = gr.thrustMax ? Math.max(...gr.thrustMax) : 0
    let y = 76
    const row = (l, v, col = C.text) => { text(c, l, 12, y, { size: 9.5, weight: 700, color: C.dim }); text(c, v, p.w - 12, y, { size: 11, weight: 700, color: col, align: 'right' }); y += 15 }
    row('MASS', fmtMass(gr.mass))
    if ((gr.gravity || 0) > 0.05) row('LIFT / WEIGHT', gr.thrustMax ? (this.liftRatio(gr)).toFixed(2) : '-', this.liftRatio(gr) < 1 ? C.red : C.green)
    else row('THRUST', `${(up / 1e3).toFixed(0)} kN`)
    row('POWER', `${fmtW(pw.want)} / ${fmtW(pw.supply + (pw.store > 0 ? pw.cap * 4 : 0))}`, pw.ratio < 1 ? C.red : C.text)
    if (pw.cap) { text(c, 'BATTERIES', 12, y, { size: 9.5, weight: 700, color: C.dim }); bar(c, 90, y - 8, p.w - 102, 8, pw.store / pw.cap, C.green); y += 15 }
    const pl = g.world.universe.nearestPlanet(gr.comWorld()), alt = pl ? pl.surface(gr.comWorld()).alt : 0
    if (pl && alt < pl.R) row('ALTITUDE', fmtDist(Math.max(0, alt)))
    if (gr.air > 0.02) row('AIR', `${Math.round(gr.air * 100)}%`)
    const jd = gr.parts.jumpdrives.length
    if (jd) row('JUMP DRIVE', g.jump ? `CHARGING ${Math.ceil(g.jump.t)} s` : `${keyLabel(g.input.binds.jump)} to plan a jump`, g.jump ? C.amber : C.dim)
  }
  liftRatio(gr) {
    const gw = gr.dirToLocal(gr.world.gravityAt(gr.comWorld(), new THREE.Vector3())).normalize().negate()
    // thrust available against gravity's direction
    const T = gr.thrustMax, f = Math.max(0, gw.x) * T[0] + Math.max(0, -gw.x) * T[1] + Math.max(0, gw.y) * T[2] + Math.max(0, -gw.y) * T[3] + Math.max(0, gw.z) * T[4] + Math.max(0, -gw.z) * T[5]
    return f / Math.max(1, gr.mass * gr.gravity)
  }
  // ---- what you look at ----
  drawInfo(c, p) {
    const h = this.g.builder.hit
    if (!h?.block) return
    const b = h.block, gr = h.grid
    box(c, 0, 0, p.w, p.h)
    text(c, b.name, 12, 20, { size: 13, weight: 700, color: C.gold2, max: p.w - 24 })
    text(c, 'INTEGRITY', 12, 40, { size: 9.5, weight: 700, color: C.dim })
    bar(c, 80, 32, p.w - 130, 9, b.hp / b.maxHp, b.hp / b.maxHp < 0.4 ? C.red : C.green)
    text(c, `${Math.round(b.hp / b.maxHp * 100)}%`, p.w - 12, 41, { size: 10, weight: 700, align: 'right' })
    text(c, gr.name, 12, 62, { size: 11, weight: 600, color: C.text, max: p.w - 24 })
    text(c, `${gr.static ? 'Station' : 'Ship'} · ${gr.size === 'large' ? 'large' : 'small'} grid · ${gr.blocks.size} blocks`, 12, 78, { size: 10, weight: 600, color: C.dim })
    text(c, `${fmtMass(gr.mass)}${b.on === false ? ' · block off' : ''}`, 12, 94, { size: 10, weight: 600, color: C.dim })
    text(c, fmtDist(h.dist), p.w - 12, 94, { size: 10, weight: 700, color: C.dim, align: 'right' })
  }
  drawNote(c, p) {
    let y = 0
    for (const n of this.notes) {
      const a = Math.min(1, n.t * 2)
      c.globalAlpha = a
      c.font = FONT(14, 700); const w = Math.min(p.w, c.measureText(n.msg).width + 30)
      box(c, (p.w - w) / 2, y, w, 26, { ticks: false })
      text(c, n.msg, p.w / 2, y + 18, { size: 14, weight: 700, color: n.color, align: 'center', max: p.w - 20 })
      y += 30
      c.globalAlpha = 1
    }
    if (this.notes.length * 30 + 4 !== p.h) this.note.place(p.x, p.y, p.w, Math.max(30, this.notes.length * 30 + 4))
  }
  // ---- markers on the glass ----
  drawMarks(c, p) {
    const g = this.g, e = g.engine, cam = e.camera, P = g.player
    if (!P) return
    const v = new THREE.Vector3()
    const mark = (pos, label, sub, col) => {
      e.rel(pos, v); v.project(cam)
      if (v.z > 1 || v.z < -1) return
      const x = (v.x + 1) / 2 * p.w, y = (1 - v.y) / 2 * p.h
      if (x < 0 || x > p.w || y < 0 || y > p.h) return
      c.strokeStyle = col; c.lineWidth = 1.5
      c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 7, y); c.lineTo(x, y + 7); c.lineTo(x - 7, y); c.closePath(); c.stroke()
      text(c, label, x + 11, y - 1, { size: 11, weight: 700, color: col, shadow: true })
      if (sub) text(c, sub, x + 11, y + 12, { size: 10, weight: 600, color: C.dim, shadow: true })
    }
    const eye = g.camPos
    for (const pl of g.world.universe.planets) {
      const d = eye.distanceTo(pl.center) - pl.R
      if (d < pl.R * 0.6) continue
      mark(pl.center, pl.name, fmtDist(d), 'rgba(166,255,245,0.85)')
    }
    for (const f of g.world.universe.fields) { const d = eye.distanceTo(f.center); if (d > f.radius * 1.2) mark(f.center, f.name, fmtDist(d), 'rgba(255,190,110,0.85)') }
    for (const gr of g.world.grids) {
      if (!gr.parts?.beacons.length || gr === P.seat?.grid) continue
      const c0 = gr.comWorld(), d = eye.distanceTo(c0)
      if (d < 40 || d > 50000) continue
      mark(c0, gr.name, fmtDist(d), 'rgba(255,150,90,0.9)')
    }
    // the artificial horizon when flying in gravity
    if (P.seat && (P.seat.grid.gravity || 0) > 0.3) {
      const gr = P.seat.grid, down = gr.world.gravityAt(gr.comWorld(), new THREE.Vector3()).normalize()
      const camInv = e.camQuat.clone().invert(), dl = down.applyQuaternion(camInv)
      const roll = Math.atan2(dl.x, -dl.y), pitch = Math.asin(Math.max(-1, Math.min(1, dl.z)))
      const cx = p.w / 2, cy = p.h / 2, f = p.h / (2 * Math.tan(THREE.MathUtils.degToRad(e.camera.fov) / 2))
      c.save(); c.translate(cx, cy); c.rotate(-roll)
      c.strokeStyle = 'rgba(166,255,245,0.45)'; c.lineWidth = 1.2
      for (let a = -60; a <= 60; a += 15) {
        const y = Math.tan(pitch + THREE.MathUtils.degToRad(a)) * f * (a === 0 ? 1 : 1)
        if (Math.abs(y) > p.h * 0.35) continue
        const w = a === 0 ? 160 : 50
        c.beginPath(); c.moveTo(-w, -y); c.lineTo(-w * 0.3, -y); c.moveTo(w * 0.3, -y); c.lineTo(w, -y); c.stroke()
        if (a) text(c, String(-a), w + 6, -y + 4, { size: 9, weight: 600, color: 'rgba(166,255,245,0.5)' })
      }
      c.restore()
    }
    // a red edge when hurt
    if (P.hurtFlash > 0) { const gr2 = c.createRadialGradient(p.w / 2, p.h / 2, p.h * 0.3, p.w / 2, p.h / 2, p.h * 0.75); gr2.addColorStop(0, 'rgba(255,40,30,0)'); gr2.addColorStop(1, `rgba(255,40,30,${Math.min(0.5, P.hurtFlash)})`); c.fillStyle = gr2; c.fillRect(0, 0, p.w, p.h) }
  }
}
