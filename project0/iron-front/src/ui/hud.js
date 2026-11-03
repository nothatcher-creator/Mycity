// The in-game display. Small panels that redraw only when what they show changes (the compass every
// frame it turns, the minimap four times a second), so the interface stays cheap.
import * as THREE from 'three'
import { Panel, C, FONT, MONO, text, box, bar } from './ui.js'
import { AMMO, ATTACHMENTS } from '../combat/weapons-data.js'
import { FACTIONS } from '../actors/factions.js'
import { mapImage, worldToMap, gridRef } from './mapimage.js'

const HEAD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export class HUD {
  constructor(game) {
    this.g = game
    const ui = game.ui
    this.ui = ui
    this.messages = []      // radio and notes: { text, t, color }
    this.kills = []         // kill feed: { text, t }
    this.hitT = -9; this.hitKill = false
    this.dmgDirs = []       // { yaw, t }
    this.prompt = ''
    this.visible = true
    this.opts = game.settings.hud
    this.mk = (draw, o) => ui.add(new Panel(ui, 0, 0, 10, 10, draw, o))
    this.compass = this.mk((c, p) => this.drawCompass(c, p))
    this.status = this.mk((c, p) => this.drawStatus(c, p))
    this.weapon = this.mk((c, p) => this.drawWeapon(c, p))
    this.mini = this.mk((c, p) => this.drawMini(c, p))
    this.feed = this.mk((c, p) => this.drawFeed(c, p))
    this.cross = this.mk((c, p) => this.drawCross(c, p), { order: 2 })
    this.center = this.mk((c, p) => this.drawCenter(c, p))
    this.modeP = this.mk((c, p) => this.drawMode(c, p))
    this.vehP = this.mk((c, p) => this.drawVehicle(c, p))
    this.scope = this.mk((c, p) => this.drawScope(c, p), { order: 1 })
    this.vign = this.mk((c, p) => this.drawVignette(c, p), { order: -1 })
    this.touch = this.mk((c, p) => this.drawTouch(c, p), { order: 3 })
    this.last = {}
    this.layout()
  }
  layout() {
    const W = this.g.engine.width, H = this.g.engine.height
    const s = Math.min(1.25, Math.max(0.7, Math.min(W / 1280, H / 720) * 1.05))
    this.s = s
    this.compass.place(W / 2 - 240 * s, 8, 480 * s, 34 * s)
    this.status.place(14, H - 112 * s, 270 * s, 98 * s)
    this.weapon.place(W - 290 * s - 14, H - 112 * s, 290 * s, 98 * s)
    const ms = 190 * s
    this.mini.place(W - ms - 14, 14, ms, ms)
    this.feed.place(W - 340 * s - 14, ms + 22, 340 * s, 150 * s)
    this.cross.place(W / 2 - 60, H / 2 - 60, 120, 120)
    this.center.place(W / 2 - 260 * s, H / 2 + 60 * s, 520 * s, 120 * s)
    this.modeP.place(14, 14, 360 * s, 190 * s)
    this.vehP.place(W / 2 - 230 * s, H - 104 * s, 460 * s, 92 * s)
    this.scope.place(0, 0, W, H)
    this.vign.place(0, 0, W, H)
    this.touch.place(0, 0, W, H)
    for (const p of [this.compass, this.status, this.weapon, this.mini, this.feed, this.cross, this.center, this.modeP, this.vehP, this.scope, this.vign, this.touch]) p.dirty = true
  }
  show(v) { this.visible = v; for (const p of [this.compass, this.status, this.weapon, this.mini, this.feed, this.cross, this.center, this.modeP, this.vehP, this.scope, this.vign, this.touch]) p.show(v) }
  note(t, color = C.text) { this.messages.push({ text: t, t: this.g.time, color }); if (this.messages.length > 7) this.messages.shift(); this.feed.dirty = true }
  radio(who, t) { this.note(`${who}: ${t}`, C.gold2); this.g.sfx?.ui('radio') }
  kill(t) { this.kills.push({ text: t, t: this.g.time }); if (this.kills.length > 5) this.kills.shift(); this.feed.dirty = true }
  hit(kill) { this.hitT = this.g.time; this.hitKill = kill; this.cross.dirty = true }
  damage(fromYaw) { this.dmgDirs.push({ yaw: fromYaw, t: this.g.time }); this.vign.dirty = true }

  update(dt) {
    const g = this.g, s = g.player?.s, o = this.opts
    if (!this.visible || !s) return
    const scoped = g.player.scoped || g.player.binoculars || (s.vehicle && g.vcontrol.zoom > 1.5 && s.seat?.role === 'gunner')
    this.scope.show(scoped && this.visible)
    // the compass redraws when the heading moves a degree
    const head = Math.round(((g.camHeading() * 180 / Math.PI) % 360 + 360) % 360)
    if (head !== this.last.head) { this.last.head = head; this.compass.dirty = true }
    this.compass.show(o.compass)
    const key = [Math.round(s.blood), Math.round(s.stamina * 50), s.stance, Math.round(s.bleed * 100), Object.values(s.parts).map(Math.round).join(), s.down].join()
    if (key !== this.last.status) { this.last.status = key; this.status.dirty = true }
    const w = s.w
    const wk = w ? [w.def.id, w.rec.mag, w.rec.chamber, s.mode, Math.round(w.reloadT * 10), g.player.zero, s.inv.countAmmo(w.def), s.inv.count('frag'), s.inv.count('smoke'), g.player.zoom, s.bipod].join() : 'none'
    if (wk !== this.last.weapon) { this.last.weapon = wk; this.weapon.dirty = true }
    this.weapon.show(!s.vehicle && o.weapon)
    this.vehP.show(!!s.vehicle)
    if (s.vehicle) { const v = s.vehicle, sw = s.seat?.w; const vk = [Math.round(v.speed * 3.6), Math.round(v.alt), Math.round(v.hp), Math.round(v.fuel), sw ? sw.mag : '', sw?.reloadT > 0, s.seat?.w2?.mag, s.seat?.w2?.lockT > 1.2, v.gearDown, v.flares].join(); if (vk !== this.last.veh) { this.last.veh = vk; this.vehP.dirty = true } }
    // minimap: four times a second
    this.miniT = (this.miniT || 0) - dt
    if (this.miniT <= 0 && o.minimap) { this.miniT = 0.25; this.mini.dirty = true }
    this.mini.show(o.minimap)
    // the crosshair moves with spread and hit markers
    const spread = this.crossSpread()
    const ck = [Math.round(spread), g.time - this.hitT < 0.3, scoped, s.ads, !!s.vehicle, w?.def.id, g.player.view].join()
    if (ck !== this.last.cross) { this.last.cross = ck; this.cross.dirty = true }
    this.cross.show(o.crosshair || s.ads)
    // messages fade
    if (this.messages.length && g.time - this.messages[0].t > 9) { this.messages.shift(); this.feed.dirty = true }
    if (this.kills.length && g.time - this.kills[0].t > 7) { this.kills.shift(); this.feed.dirty = true }
    const pk = this.prompt + '|' + (g.mode?.centerText?.() || '')
    if (pk !== this.last.prompt) { this.last.prompt = pk; this.center.dirty = true }
    const mk = g.mode?.hudKey?.() ?? ''
    if (mk !== this.last.mode) { this.last.mode = mk; this.modeP.dirty = true }
    const vk = [Math.round(s.suppression * 20), this.dmgDirs.length, Math.round((g.flashT || 0) * 10), g.player.nvg, s.down, Math.round(s.blood / 10)].join()
    if (vk !== this.last.vign) { this.last.vign = vk; this.vign.dirty = true }
    this.dmgDirs = this.dmgDirs.filter(d => g.time - d.t < 1.5)
    if (scoped && g.player.binoculars) this.scope.dirty = true
    else if (scoped) { const zk = [g.player.zoom, g.player.zero, Math.round(g.rangeAt * 1)].join(); if (zk !== this.last.scope) { this.last.scope = zk; this.scope.dirty = true } }
    this.touch.show(g.input.touch)
  }
  crossSpread() {
    const s = this.g.player.s
    if (!s.w || s.ads) return 0
    return 8 + Math.min(40, s.speed * 6) + s.suppression * 20 + (s.stance === 2 ? -3 : 0) + this.g.player.kick * 14
  }

  // ---------- drawing ----------
  drawCompass(c, p) {
    const W = p.w, H = p.h, s = this.s
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 0, W, H)
    const head = this.g.camHeading()
    const pxPerRad = W / 1.6
    c.font = FONT(13 * s, 700); c.textAlign = 'center'; c.textBaseline = 'middle'
    for (let deg = 0; deg < 360; deg += 5) {
      let d = deg * Math.PI / 180 - head
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      const x = W / 2 + d * pxPerRad
      if (x < 0 || x > W) continue
      const major = deg % 45 === 0
      c.fillStyle = major ? C.gold2 : C.text
      c.fillRect(x, H - (major ? 10 : deg % 15 ? 4 : 7), 1, major ? 10 : deg % 15 ? 4 : 7)
      if (major) c.fillText(HEAD[deg / 45], x, H * 0.38)
      else if (deg % 15 === 0) { c.font = FONT(10 * s, 500); c.fillText(String(deg), x, H * 0.38); c.font = FONT(13 * s, 700) }
    }
    // objective and waypoint markers on the strip
    const me = this.g.player.s.pos
    for (const m of this.g.markers()) {
      let d = Math.atan2(m.x - me.x, -(m.z - me.z)) - head
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      const x = Math.max(6, Math.min(W - 6, W / 2 + d * pxPerRad))
      c.fillStyle = m.color || C.gold; c.beginPath(); c.moveTo(x, H - 2); c.lineTo(x - 5, H - 11); c.lineTo(x + 5, H - 11); c.fill()
    }
    c.fillStyle = C.white; c.fillRect(W / 2 - 1, 0, 2, H)
    text(c, String(Math.round(((head * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0'), W / 2, H - 1, { size: 9 * s, align: 'center', base: 'bottom', color: C.white })
  }
  drawStatus(c, p) {
    const s = this.g.player.s, sc = this.s, W = p.w
    box(c, 0, 0, W, p.h)
    // the body, by part: green fine, yellow hurt, red badly hurt
    const pc = v => v > 60 ? C.red : v > 25 ? '#e0b030' : '#6ab04c'
    const bx = 14 * sc, by = 10 * sc, u = 8 * sc
    c.fillStyle = pc(s.parts.head); c.fillRect(bx + u * 1.2, by, u * 1.6, u * 1.6)
    c.fillStyle = pc(s.parts.torso); c.fillRect(bx + u, by + u * 1.8, u * 2, u * 3.2)
    c.fillStyle = pc(s.parts.armR); c.fillRect(bx, by + u * 1.8, u * 0.85, u * 3)
    c.fillStyle = pc(s.parts.armL); c.fillRect(bx + u * 3.15, by + u * 1.8, u * 0.85, u * 3)
    c.fillStyle = pc(s.parts.legR); c.fillRect(bx + u, by + u * 5.15, u * 0.95, u * 3.6)
    c.fillStyle = pc(s.parts.legL); c.fillRect(bx + u * 2.05, by + u * 5.15, u * 0.95, u * 3.6)
    const x0 = 64 * sc
    text(c, 'HEALTH', x0, 20 * sc, { size: 10 * sc, color: C.dim })
    bar(c, x0, 25 * sc, W - x0 - 14, 9 * sc, s.blood / 100, s.blood < 35 ? C.red : '#6ab04c')
    text(c, 'STAMINA', x0, 50 * sc, { size: 10 * sc, color: C.dim })
    bar(c, x0, 55 * sc, W - x0 - 14, 6 * sc, s.stamina, '#5aa8e0')
    const stance = ['STANDING', 'CROUCHED', 'PRONE'][s.stance]
    text(c, s.down ? 'DOWN - WAITING FOR A MEDIC' : stance, x0, 80 * sc, { size: 12 * sc, color: s.down ? C.red : C.text, weight: 700 })
    if (s.bleed > 0.05) text(c, 'BLEEDING  [H] bandage', x0, 94 * sc, { size: 10 * sc, color: C.red, weight: 700 })
    else if (s.legHurt) text(c, 'LEG INJURED', x0, 94 * sc, { size: 10 * sc, color: '#e0b030' })
  }
  drawWeapon(c, p) {
    const g = this.g, s = g.player.s, w = s.w, sc = this.s, W = p.w
    box(c, 0, 0, W, p.h)
    if (!w) { text(c, 'NO WEAPON', 14, 30 * sc, { size: 14 * sc }); return }
    text(c, w.def.name.toUpperCase(), 14, 22 * sc, { size: 14 * sc, weight: 800, max: W - 120 * sc })
    text(c, `${s.mode.toUpperCase()}${s.bipod ? '  BIPOD' : ''}`, W - 12, 22 * sc, { size: 11 * sc, color: C.gold2, align: 'right', weight: 700 })
    const inMag = w.rec.mag, ch = w.rec.chamber ? '+1' : ''
    const reserve = s.inv.countAmmo(w.def)
    c.font = MONO(30 * sc); c.fillStyle = inMag === 0 && !w.rec.chamber ? C.red : C.white; c.textBaseline = 'alphabetic'; c.textAlign = 'left'
    c.fillText(String(inMag), 14, 62 * sc)
    const wd = c.measureText(String(inMag)).width
    text(c, ch, 16 + wd, 48 * sc, { size: 13 * sc, color: C.gold2, weight: 700 })
    text(c, `/ ${reserve}`, 22 + wd + 18 * sc, 62 * sc, { size: 16 * sc, color: C.dim })
    text(c, AMMO[w.def.ammo].name, 14, 82 * sc, { size: 10 * sc, color: C.dim })
    if (w.reloadT > 0) text(c, 'RELOADING', W / 2, 82 * sc, { size: 11 * sc, color: C.gold2, align: 'center', weight: 800 })
    const optic = g.player.optic
    text(c, `${optic.zooms ? g.player.zoom + 'x' : optic.zoom > 1.5 ? optic.zoom + 'x' : ''} ZERO ${g.player.zero} m`, W - 12, 48 * sc, { size: 11 * sc, color: C.text, align: 'right' })
    text(c, `FRAG ${s.inv.count('frag')}  SMOKE ${s.inv.count('smoke')}`, W - 12, 66 * sc, { size: 11 * sc, color: C.text, align: 'right' })
    text(c, `MED ${s.inv.count('bandage') + s.inv.count('firstaid') + s.inv.count('medkit')}`, W - 12, 84 * sc, { size: 11 * sc, color: C.text, align: 'right' })
  }
  drawMini(c, p) {
    const g = this.g, s = g.player.s, W = p.w, H = p.h
    const img = mapImage()
    const range = g.settings.minimapRange || 300     // metres from the middle to the edge
    c.save()
    c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); c.clip()
    c.fillStyle = '#20301c'; c.fillRect(0, 0, W, H)
    const head = g.camHeading()
    c.translate(W / 2, H / 2)
    c.rotate(-head)
    if (img) {
      const [mx, my] = worldToMap(s.pos.x, s.pos.z, img.width)
      const k = (W / 2) / (range / 12000 * img.width)
      c.scale(k, k)
      c.drawImage(img, -mx, -my)
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.translate(W / 2, H / 2)
      c.rotate(-head)
    }
    const sc = (W / 2) / range
    // units: friends (green, blue for the squad), known enemies (red), vehicles, objectives
    for (const u of g.radar()) {
      const x = (u.x - s.pos.x) * sc, y = (u.z - s.pos.z) * sc
      if (x * x + y * y > (W / 2) ** 2) continue
      c.fillStyle = u.color
      if (u.kind === 'objective') { c.strokeStyle = u.color; c.lineWidth = 2; c.strokeRect(x - 5, y - 5, 10, 10) }
      else if (u.kind === 'vehicle') c.fillRect(x - 4, y - 3, 8, 6)
      else { c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill() }
    }
    c.restore()
    // the player in the middle, pointing up (the map turns)
    c.fillStyle = C.white; c.beginPath(); c.moveTo(W / 2, H / 2 - 7); c.lineTo(W / 2 - 5, H / 2 + 5); c.lineTo(W / 2 + 5, H / 2 + 5); c.fill()
    c.strokeStyle = C.line; c.lineWidth = 2; c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); c.stroke()
    text(c, 'N', W / 2 + Math.sin(-head) * (W / 2 - 12), H / 2 - Math.cos(-head) * (H / 2 - 12) + 4, { size: 11, align: 'center', color: C.gold2, weight: 800 })
    text(c, gridRef(s.pos.x, s.pos.z), W / 2, H - 8, { size: 10, align: 'center', color: C.text, shadow: true })
  }
  drawFeed(c, p) {
    const W = p.w, sc = this.s
    let y = 14 * sc
    for (const k of this.kills) { text(c, k.text, W - 6, y, { size: 12 * sc, align: 'right', color: C.white, shadow: true, weight: 700 }); y += 16 * sc }
    y += 4
    for (const m of this.messages) { text(c, m.text, W - 6, y, { size: 12 * sc, align: 'right', color: m.color, shadow: true, max: W - 10 }); y += 16 * sc }
  }
  drawCross(c, p) {
    const g = this.g, s = g.player.s, W = p.w, H = p.h, cx = W / 2, cy = H / 2
    if (s.vehicle) {
      const seat = s.seat
      if (seat?.w) { c.strokeStyle = C.white; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, 6, 0, Math.PI * 2); c.stroke(); c.fillRect(cx - 1, cy - 1, 2, 2) }
      return
    }
    if (g.player.scoped || g.player.binoculars) return
    if (s.ads && s.w) {
      // a red dot or holographic reticle on the optic (iron sights need none)
      const o = g.player.optic
      if (o.reticle === 'dot') { c.fillStyle = o.color || '#ff3b2f'; c.beginPath(); c.arc(cx, cy, 2.2, 0, Math.PI * 2); c.fill() }
      else if (o.reticle === 'holo') { c.strokeStyle = o.color || '#ff4a3a'; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, 13, 0, Math.PI * 2); c.stroke(); c.fillStyle = c.strokeStyle; c.fillRect(cx - 1.2, cy - 1.2, 2.4, 2.4) }
      else if (o.reticle === 'chevron') { c.strokeStyle = '#ff4a3a'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 6, cy + 6); c.lineTo(cx, cy); c.lineTo(cx + 6, cy + 6); c.stroke() }
    } else if (s.w && g.player.view === 'fp' || g.player.view === 'tp') {
      const sp = this.crossSpread()
      c.fillStyle = 'rgba(255,255,255,0.85)'
      c.fillRect(cx - 1, cy - 1, 2, 2)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.fillRect(cx + dx * sp - (dx ? (dx > 0 ? 0 : 7) : 1), cy + dy * sp - (dy ? (dy > 0 ? 0 : 7) : 1), dx ? 7 : 2, dy ? 7 : 2)
    }
    if (g.time - this.hitT < 0.3) {
      c.strokeStyle = this.hitKill ? C.red : C.white; c.lineWidth = 2
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { c.beginPath(); c.moveTo(cx + dx * 7, cy + dy * 7); c.lineTo(cx + dx * 14, cy + dy * 14); c.stroke() }
    }
  }
  drawCenter(c, p) {
    const W = p.w, sc = this.s
    if (this.prompt) { box(c, W / 2 - 170 * sc, 0, 340 * sc, 30 * sc, { fill: 'rgba(0,0,0,0.55)' }); text(c, this.prompt, W / 2, 20 * sc, { size: 14 * sc, align: 'center', weight: 700, color: C.gold2 }) }
    const t = this.g.mode?.centerText?.()
    if (t) text(c, t, W / 2, 70 * sc, { size: 22 * sc, align: 'center', weight: 800, color: C.white, shadow: true })
  }
  drawMode(c, p) {
    const m = this.g.mode
    if (!m?.drawHud) return
    m.drawHud(c, p, this.s)
  }
  drawVehicle(c, p) {
    const s = this.g.player.s, v = s.vehicle, sc = this.s, W = p.w
    if (!v) return
    box(c, 0, 0, W, p.h)
    text(c, v.def.name.toUpperCase(), 14, 22 * sc, { size: 14 * sc, weight: 800 })
    text(c, s.seat.role.toUpperCase(), W - 12, 22 * sc, { size: 11 * sc, color: C.gold2, align: 'right', weight: 700 })
    const air = v.kind === 'heli' || v.kind === 'plane'
    text(c, `${Math.round(Math.abs(v.speed) * 3.6)} km/h`, 14, 52 * sc, { size: 20 * sc, weight: 800, color: C.white })
    if (air) text(c, `ALT ${Math.round(v.alt)} m${v.kind === 'plane' ? (v.gearDown ? '  GEAR' : '') : ''}`, 160 * sc, 52 * sc, { size: 14 * sc, weight: 700 })
    text(c, 'HULL', 14, 70 * sc, { size: 10 * sc, color: C.dim }); bar(c, 50 * sc, 63 * sc, 120 * sc, 7 * sc, v.hp / v.maxHp, v.hp < v.maxHp * 0.3 ? C.red : '#6ab04c')
    text(c, 'FUEL', 14, 86 * sc, { size: 10 * sc, color: C.dim }); bar(c, 50 * sc, 79 * sc, 120 * sc, 7 * sc, v.fuel / v.maxFuel, '#e0b030')
    const sw = s.seat?.w
    if (sw) {
      text(c, sw.def.name, W - 12, 52 * sc, { size: 12 * sc, align: 'right' })
      text(c, sw.reloadT > 0 ? 'RELOADING' : `${sw.mag} / ${sw.def.mag}`, W - 12, 72 * sc, { size: 16 * sc, align: 'right', weight: 800, color: sw.reloadT > 0 ? C.gold2 : C.white })
      const w2 = s.seat.w2
      if (w2) text(c, `${w2.def.name}: ${w2.mag}${w2.lockT > 1.2 ? '  LOCKED' : w2.lock ? '  LOCKING' : ''}`, W - 12, 88 * sc, { size: 10 * sc, align: 'right', color: w2.lockT > 1.2 ? C.red : C.dim })
    }
    if (v.flares) text(c, `FLARES ${v.flares} [R]`, 190 * sc, 86 * sc, { size: 10 * sc, color: C.dim })
  }
  drawScope(c, p) {
    const g = this.g, W = p.w, H = p.h
    const r = Math.min(W, H) * 0.46, cx = W / 2, cy = H / 2
    // black all round the lens
    c.fillStyle = '#000'
    c.beginPath(); c.rect(0, 0, W, H); c.arc(cx, cy, r, 0, Math.PI * 2, true); c.fill()
    if (g.player.binoculars) {
      c.beginPath(); c.rect(0, 0, W, H); c.arc(cx - r * 0.55, cy, r * 0.75, 0, Math.PI * 2, true); c.arc(cx + r * 0.55, cy, r * 0.75, 0, Math.PI * 2, true); c.fill()
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1
      for (let i = -5; i <= 5; i++) { c.beginPath(); c.moveTo(cx + i * 18, cy - (i % 5 ? 4 : 8)); c.lineTo(cx + i * 18, cy + (i % 5 ? 4 : 8)); c.stroke() }
      const rng = g.player.s.inv.count('rangefinder') ? `RANGE ${g.rangeAt ? Math.round(g.rangeAt) + ' m' : '---'}` : ''
      text(c, `${Math.round(((g.camHeading() * 180 / Math.PI) % 360 + 360) % 360)}°  ${rng}`, cx, cy + r * 0.6, { size: 16, align: 'center', color: '#ffdd88', weight: 700 })
      return
    }
    // the reticle: a mil grid with hold-over marks
    const o = g.player.optic
    c.strokeStyle = 'rgba(0,0,0,0.9)'; c.lineWidth = 1.5
    c.beginPath(); c.moveTo(cx - r, cy); c.lineTo(cx - 8, cy); c.moveTo(cx + 8, cy); c.lineTo(cx + r, cy); c.moveTo(cx, cy - r); c.lineTo(cx, cy - 8); c.moveTo(cx, cy + 8); c.lineTo(cx, cy + r); c.stroke()
    c.lineWidth = 3
    c.beginPath(); c.moveTo(cx - r, cy); c.lineTo(cx - r * 0.55, cy); c.moveTo(cx + r * 0.55, cy); c.lineTo(cx + r, cy); c.moveTo(cx, cy + r * 0.55); c.lineTo(cx, cy + r); c.stroke()
    // a mil is 1/1000 of the range: its size on screen depends on the zoom
    const fovRad = g.player.fov * Math.PI / 180
    const pxPerMil = (H / 2) / Math.tan(fovRad / 2) / 1000
    c.lineWidth = 1.2
    for (let m = 1; m <= 10; m++) {
      const d = m * pxPerMil
      if (d > r * 0.55) break
      const L = m % 5 ? 4 : 8
      c.beginPath(); c.moveTo(cx - d, cy - L); c.lineTo(cx - d, cy + L); c.moveTo(cx + d, cy - L); c.lineTo(cx + d, cy + L); c.moveTo(cx - L, cy + d); c.lineTo(cx + L, cy + d); c.moveTo(cx - L, cy - d); c.lineTo(cx + L, cy - d); c.stroke()
    }
    if (o.reticle === 'dot' || o.reticle === 'bdc') { c.fillStyle = '#ff3a2a'; c.beginPath(); c.arc(cx, cy, 2, 0, Math.PI * 2); c.fill() }
    if (o.thermal) { c.fillStyle = 'rgba(255,255,255,0.08)'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill() }
    if (o.night) { c.fillStyle = 'rgba(40,255,80,0.12)'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill() }
    text(c, `${g.player.zoom}x   ZERO ${g.player.zero} m${g.rangeAt ? '   ' + Math.round(g.rangeAt) + ' m' : ''}`, cx, cy + r + 24 > H ? H - 14 : cy + r * 0.85, { size: 13, align: 'center', color: '#ffdd88', weight: 700 })
    if (g.player.holding) text(c, 'HOLDING BREATH', cx, cy - r * 0.8, { size: 12, align: 'center', color: '#bfe8ff' })
  }
  drawVignette(c, p) {
    const g = this.g, s = g.player.s, W = p.w, H = p.h
    const sup = s.suppression
    // suppression and low health darken the edges
    const a = Math.min(0.75, sup * 0.6 + (s.blood < 40 ? (40 - s.blood) / 60 : 0))
    if (a > 0.02) {
      const gr = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.65)
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, s.blood < 40 ? `rgba(90,0,0,${a})` : `rgba(0,0,0,${a})`)
      c.fillStyle = gr; c.fillRect(0, 0, W, H)
    }
    // where the hits came from: red arcs round the middle
    for (const d of this.dmgDirs) {
      const rel = d.yaw - g.camHeading()
      const k = 1 - (g.time - d.t) / 1.5
      c.strokeStyle = `rgba(220,40,30,${0.8 * k})`; c.lineWidth = 6
      c.beginPath(); c.arc(W / 2, H / 2, Math.min(W, H) * 0.18, rel - Math.PI / 2 - 0.35, rel - Math.PI / 2 + 0.35); c.stroke()
    }
    if ((g.flashT || 0) > 0) { c.fillStyle = `rgba(255,255,255,${Math.min(1, g.flashT)})`; c.fillRect(0, 0, W, H) }
    if (g.player.nvg) {
      c.fillStyle = 'rgba(30,255,60,0.12)'; c.fillRect(0, 0, W, H)
      const gr = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.6)
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.85)'); c.fillStyle = gr; c.fillRect(0, 0, W, H)
    }
  }
  // Touch controls for phones: fire, aim, reload, stance, view, interact, grenade, map, inventory.
  drawTouch(c, p) {
    const W = p.w, H = p.h, g = this.g
    const r = Math.min(W, H) * 0.075
    const btn = (id, x, y, label, fn, rr = r) => {
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill()
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; c.stroke()
      text(c, label, x, y + 5, { size: Math.max(11, rr * 0.38), align: 'center', weight: 800, color: C.white })
      p.buttons.push({ id, x: x - rr, y: y - rr, w: rr * 2, h: rr * 2, fn })
    }
    const R = W - r * 1.6, B = H - r * 1.6
    btn('fire', R, B - r * 0.4, 'FIRE', () => { g.player.touchFire = true; setTimeout(() => { g.player.touchFire = false }, 120) }, r * 1.25)
    btn('aim', R - r * 2.6, B + r * 0.2, 'AIM', () => { g.player.touchAds = !g.player.touchAds })
    btn('reload', R - r * 0.2, B - r * 3, 'RLD', () => g.input.pressed.add('reload'))
    btn('stance', R - r * 2.5, B - r * 2.2, 'STNC', () => g.input.pressed.add(g.player.s.stance === 0 ? 'crouch' : g.player.s.stance === 1 ? 'prone' : 'prone'))
    btn('jump', R - r * 4.6, B + r * 0.2, 'JUMP', () => g.input.pressed.add('jump'), r * 0.8)
    btn('use', R - r * 4.2, B - r * 2.2, 'USE', () => g.input.pressed.add('interact'), r * 0.8)
    btn('nade', R - r * 0.2, B - r * 5.2, 'NADE', () => g.input.pressed.add('grenade'), r * 0.8)
    btn('view', W - r, r * 3.6, 'VIEW', () => g.input.pressed.add('view'), r * 0.7)
    btn('map', W - r, r * 5.2, 'MAP', () => g.input.pressed.add('map'), r * 0.7)
    btn('inv', W - r, r * 6.8, 'INV', () => g.input.pressed.add('inventory'), r * 0.7)
    btn('heal', W - r, r * 8.4, 'HEAL', () => g.input.pressed.add('heal'), r * 0.7)
    btn('menu', r * 0.9, r * 4.5, 'MENU', () => g.input.pressed.add('pause'), r * 0.7)
    text(c, 'Drag right side to look', W * 0.72, H * 0.12, { size: 12, align: 'center', color: 'rgba(255,255,255,0.6)' })
  }
}
