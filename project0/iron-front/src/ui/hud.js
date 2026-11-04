// The in-game display. Small panels that redraw only when what they show changes (the compass every
// frame it turns, the minimap four times a second), so the interface stays cheap.
import * as THREE from 'three'
import { heightAt } from '../world/heightfield.js'
import { Panel, C, FONT, MONO, text, box, bar, chip, icon, chamfer, header } from './ui.js'
import { AMMO, ATTACHMENTS } from '../combat/weapons-data.js'
import { FACTIONS } from '../actors/factions.js'
import { mapImage, worldToMap, gridRef } from './mapimage.js'

const HEAD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const _mv = new THREE.Vector3()
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
    // the waypoint and the mode's objectives on screen, each a small panel moved to where it is (Arma's markers)
    this.marks = [0, 1, 2, 3].map(() => { const p = this.mk((c, q) => this.drawMark(c, q)); p.m = null; p.show(false); return p })
    this.last = {}
    this.layout()
  }
  layout() {
    const W = this.g.engine.width, H = this.g.engine.height
    const touch = this.g.input.touch
    // phones: keep clear of the city's bar at the top; narrow screens get a compact one-line HUD
    const safe = touch ? 60 : 0
    this.safe = safe
    this.compact = touch && W < 760
    if (this.compact) {
      const s = this.s = Math.max(0.85, Math.min(1.1, W / 400))
      const half = (W - 24) / 2
      this.status.place(8, safe, half, 50 * s)
      this.weapon.place(16 + half, safe, half, 50 * s)
      const ms = 104 * s
      this.mini.place(W - ms - 8, safe + 58 * s, ms, ms)
      this.compass.place(8, safe + 58 * s, W - ms - 24, 28 * s)
      this.modeP.place(8, safe + 92 * s, W - ms - 24, 120 * s)
      this.feed.place(8, H * 0.36, W - 16, 150 * s)
      this.vehP.place(8, safe + 58 * s, W - ms - 24, 92 * s)
    } else if (touch) {
      const s = this.s = Math.max(0.8, Math.min(1.2, Math.min(W / 1000, H / 560)))
      const ms = 130 * s
      this.mini.place(W - ms - 14, 14, ms, ms)
      this.status.place(14, safe + 4, 260 * s, 98 * s)
      this.weapon.place(14, safe + 10 + 98 * s, 260 * s, 98 * s)
      this.compass.place(W / 2 - Math.min(200 * s, W * 0.22), safe + 4, Math.min(400 * s, W * 0.44), 32 * s)
      this.modeP.place(W / 2 - 150 * s, safe + 40 * s, 300 * s, 120 * s)
      this.feed.place(W - 320 * s - 14, ms + 22, 320 * s, 130 * s)
      this.vehP.place(14, safe + 10 + 98 * s, Math.min(400 * s, W * 0.45), 92 * s)
    } else {
      const s = this.s = Math.min(1.25, Math.max(0.5, Math.min(W / 1280, H / 720) * 1.05))
      this.compass.place(W / 2 - Math.min(240 * s, W * 0.3), 8, Math.min(480 * s, W * 0.6), 34 * s)
      const ms = 190 * s
      this.mini.place(W - ms - 14, 14, ms, ms)
      this.status.place(14, H - 112 * s, 270 * s, 98 * s)
      this.weapon.place(W - 290 * s - 14, H - 112 * s, 290 * s, 98 * s)
      this.feed.place(W - 340 * s - 14, ms + 22, 340 * s, 150 * s)
      this.modeP.place(14, 14, 360 * s, 190 * s)
      this.vehP.place(W / 2 - 230 * s, H - 104 * s, 460 * s, 92 * s)
    }
    const s = this.s
    this.cross.place(W / 2 - 60, H / 2 - 60, 120, 120)
    this.center.place(W / 2 - Math.min(260 * s, W / 2 - 8), H / 2 + 60 * s, Math.min(520 * s, W - 16), 120 * s)
    this.scope.place(0, 0, W, H)
    this.vign.place(0, 0, W, H)
    this.touch.place(0, 0, W, H)
    for (const p of [this.compass, this.status, this.weapon, this.mini, this.feed, this.cross, this.center, this.modeP, this.vehP, this.scope, this.vign, this.touch]) p.dirty = true
  }
  show(v) { this.visible = v; if (!v) for (const p of this.marks || []) p.show(false); for (const p of [this.compass, this.status, this.weapon, this.mini, this.feed, this.cross, this.center, this.modeP, this.vehP, this.scope, this.vign, this.touch]) p.show(v) }
  note(t, color = C.text) { this.messages.push({ text: t, t: this.g.time, color }); if (this.messages.length > 7) this.messages.shift(); this.feed.dirty = true }
  radio(who, t) { this.note(`${who}: ${t}`, C.gold2); this.g.sfx?.ui('radio') }
  kill(t) { this.kills.push({ text: t, t: this.g.time }); if (this.kills.length > 5) this.kills.shift(); this.feed.dirty = true }
  hit(kill) { this.hitT = this.g.time; this.hitKill = kill; this.cross.dirty = true }
  damage(fromYaw) { this.dmgDirs.push({ yaw: fromYaw, t: this.g.time }); this.vign.dirty = true }

  update(dt) {
    this.updateMarks()
    const g = this.g, s = g.player?.s, o = this.opts
    if (!this.visible || !s) return
    const scoped = g.player.scoped || g.player.binoculars || (s.vehicle && g.vcontrol.zoom > 1.5 && s.seat?.role === 'gunner')
    this.scope.show(scoped && this.visible)
    // the compass redraws when the heading moves a degree
    const head = Math.round(((g.camHeading() * 180 / Math.PI) % 360 + 360) % 360)
    if (head !== this.last.head) { this.last.head = head; this.compass.dirty = true }
    this.compass.show(o.compass)
    const key = [Math.round(s.blood), Math.round(s.stamina * 50), s.stance, Math.round(s.bleed * 100), Object.values(s.parts).map(Math.round).join(), s.down, s.fedT > 0, s.legHurt].join()
    if (key !== this.last.status) { this.last.status = key; this.status.dirty = true }
    const w = s.w
    const wk = w ? [w.def.id, w.rec.mag, w.rec.chamber, s.mode, Math.round(w.reloadT * 10), g.player.zero, s.inv.countAmmo(w.def), s.inv.count('frag'), s.inv.count('smoke'), g.player.zoom, s.bipod, g.gear?.label(s), s.inv.count('bandage') + s.inv.count('firstaid') + s.inv.count('medkit'), w.reloadT > 0 ? Math.round(w.reloadT * 10) : 0].join() : 'none'
    if (wk !== this.last.weapon) { this.last.weapon = wk; this.weapon.dirty = true }
    this.weapon.show(!s.vehicle && o.weapon)
    this.vehP.show(!!s.vehicle)
    if (s.vehicle) { const v = s.vehicle, sw = s.seat?.w; const vk = [Math.round(v.speed * 3.6), Math.round(v.alt), Math.round(v.hp), Math.round(v.fuel), sw ? sw.mag : '', sw?.reloadT > 0, s.seat?.w2?.mag, s.seat?.w2?.lockT > 1.2, v.gearDown, v.flares, v.engine, v.lights].join(); if (vk !== this.last.veh) { this.last.veh = vk; this.vehP.dirty = true } }
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
    if (this.compact) this.modeP.show(!s.vehicle && this.visible)
    if (g.input.touch) { const tk = [!!s.vehicle, s.vehicle?.kind, g.player.touchAds, s.stance, s.reloading, g.gear?.selected(s), (g.mode?.t ?? 99) < 30, g.player.nade, g.player.nvg, s.vehicle?.engine, s.vehicle?.lights, s.seat?.role].join(); if (tk !== this.lastTouchKey) { this.lastTouchKey = tk; this.touch.dirty = true } }
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
    // a strip that fades out at both ends
    const gr = c.createLinearGradient(0, 0, W, 0)
    gr.addColorStop(0, 'rgba(8,10,7,0)'); gr.addColorStop(0.15, 'rgba(8,10,7,0.62)'); gr.addColorStop(0.85, 'rgba(8,10,7,0.62)'); gr.addColorStop(1, 'rgba(8,10,7,0)')
    c.fillStyle = gr; c.fillRect(0, 0, W, H - 6 * s)
    c.fillStyle = 'rgba(224,165,38,0.35)'; c.fillRect(W * 0.15, H - 6 * s, W * 0.7, 1)
    const head = this.g.camHeading()
    const pxPerRad = W / 1.6
    c.textAlign = 'center'; c.textBaseline = 'middle'
    for (let deg = 0; deg < 360; deg += 5) {
      let d = deg * Math.PI / 180 - head
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      const x = W / 2 + d * pxPerRad
      if (x < 4 || x > W - 4) continue
      const fade = 1 - Math.min(1, Math.abs(x - W / 2) / (W / 2)) ** 2
      const major = deg % 45 === 0
      c.globalAlpha = 0.25 + 0.75 * fade
      c.fillStyle = major ? C.gold2 : C.text
      const L = major ? 9 * s : deg % 15 ? 3 * s : 6 * s
      c.fillRect(x, H - 6 * s - L, 1, L)
      if (major) { c.font = FONT(14 * s, 700); c.fillText(HEAD[deg / 45], x, H * 0.36) }
      else if (deg % 15 === 0) { c.font = FONT(9.5 * s, 600); c.fillStyle = C.dim; c.fillText(String(deg), x, H * 0.38) }
    }
    c.globalAlpha = 1
    // objective and waypoint markers on the strip
    const me = this.g.player.s.pos
    for (const m of this.g.markers()) {
      let d = Math.atan2(m.x - me.x, -(m.z - me.z)) - head
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      const x = Math.max(8, Math.min(W - 8, W / 2 + d * pxPerRad))
      c.fillStyle = m.color || C.gold; c.beginPath(); c.moveTo(x, H - 8 * s); c.lineTo(x - 5 * s, H - 17 * s); c.lineTo(x, H - 14 * s); c.lineTo(x + 5 * s, H - 17 * s); c.fill()
    }
    // the heading under a notch in the middle
    c.fillStyle = C.gold2; c.beginPath(); c.moveTo(W / 2, H - 7 * s); c.lineTo(W / 2 - 6 * s, H + 1); c.lineTo(W / 2 + 6 * s, H + 1); c.fill()
    c.fillStyle = 'rgba(255,207,90,0.9)'; c.fillRect(W / 2 - 0.75, 2, 1.5, H - 10 * s)
  }
  drawStatus(c, p) {
    const s = this.g.player.s, sc = this.s, W = p.w, H = p.h
    box(c, 0, 0, W, H)
    if (this.compact) {
      // one line: health number and bar, stamina under it, the stance on the right, a warning chip
      const hc = s.blood < 35 ? C.red : s.blood < 65 ? C.amber : C.green
      icon(c, 'cross', 9 * sc, 9 * sc, 12 * sc, hc)
      text(c, String(Math.max(0, Math.round(s.blood))), 26 * sc, 21 * sc, { size: 17 * sc, weight: 700, color: s.blood < 35 ? C.red : C.text })
      icon(c, ['stand', 'crouch', 'prone'][s.stance], W - 24 * sc, 5 * sc, 18 * sc, s.down ? C.red : C.text)
      bar(c, 9 * sc, 29 * sc, W - 18 * sc, 7 * sc, s.blood / 100, hc)
      bar(c, 9 * sc, 39 * sc, W - 18 * sc, 3 * sc, s.stamina, C.blue, { segments: 0 })
      const warn = s.down ? 'DOWN' : s.bleed > 0.05 ? 'BLEEDING' : s.legHurt ? 'LEG' : ''
      if (warn) chip(c, warn, W - 30 * sc, 6 * sc, 16 * sc, { align: 'right', size: 9 * sc, fill: 'rgba(255,90,69,0.2)', stroke: C.red, color: C.red })
      return
    }
    // the body, by part: green fine, amber hurt, red badly hurt
    const pc = v => v > 60 ? C.red : v > 25 ? C.amber : 'rgba(139,211,92,0.9)'
    const bx = 16 * sc, by = 12 * sc, u = 7.6 * sc
    const part = (v, x, y, w, h) => { chamfer(c, x, y, w, h, Math.min(w, h) * 0.3); c.fillStyle = pc(v); c.fill() }
    c.beginPath(); c.arc(bx + u * 2, by + u * 0.85, u * 0.85, 0, Math.PI * 2); c.fillStyle = pc(s.parts.head); c.fill()
    part(s.parts.torso, bx + u, by + u * 1.95, u * 2, u * 3.3)
    part(s.parts.armR, bx - u * 0.05, by + u * 2.0, u * 0.85, u * 3.2)
    part(s.parts.armL, bx + u * 3.2, by + u * 2.0, u * 0.85, u * 3.2)
    part(s.parts.legR, bx + u, by + u * 5.4, u * 0.92, u * 3.8)
    part(s.parts.legL, bx + u * 2.08, by + u * 5.4, u * 0.92, u * 3.8)
    const x0 = 64 * sc, bw = W - x0 - 16 * sc
    icon(c, 'cross', x0, 9 * sc, 13 * sc, s.blood < 35 ? C.red : C.green)
    text(c, 'HEALTH', x0 + 18 * sc, 20 * sc, { size: 10.5 * sc, weight: 700, color: C.dim })
    text(c, String(Math.max(0, Math.round(s.blood))), W - 16 * sc, 22 * sc, { size: 22 * sc, weight: 700, color: s.blood < 35 ? C.red : C.text, align: 'right' })
    bar(c, x0, 28 * sc, bw, 9 * sc, s.blood / 100, s.blood < 35 ? C.red : s.blood < 65 ? C.amber : C.green)
    icon(c, 'bolt', x0, 43 * sc, 12 * sc, C.blue)
    text(c, 'STAMINA', x0 + 18 * sc, 53 * sc, { size: 10 * sc, weight: 700, color: C.dim })
    bar(c, x0, 58 * sc, bw, 5 * sc, s.stamina, C.blue, { segments: 0 })
    const st = ['stand', 'crouch', 'prone'][s.stance]
    icon(c, st, x0 - 2 * sc, 68 * sc, 18 * sc, C.text)
    text(c, s.down ? 'DOWN' : ['STANDING', 'CROUCHED', 'PRONE'][s.stance], x0 + 20 * sc, 82 * sc, { size: 12 * sc, weight: 700, color: s.down ? C.red : C.text })
    if (s.down) chip(c, 'WAITING FOR A MEDIC', W - 14 * sc, 70 * sc, 18 * sc, { align: 'right', size: 10 * sc, fill: 'rgba(255,90,69,0.2)', stroke: C.red, color: C.red })
    else if (s.bleed > 0.05) chip(c, `BLEEDING  ${this.g.input.touch ? 'HEAL' : '[H]'}`, W - 14 * sc, 70 * sc, 18 * sc, { align: 'right', size: 10 * sc, fill: 'rgba(255,90,69,0.2)', stroke: C.red, color: C.red })
    else if (s.legHurt) chip(c, 'LEG INJURED', W - 14 * sc, 70 * sc, 18 * sc, { align: 'right', size: 10 * sc })
    else if (s.fedT > 0) chip(c, 'FED', W - 14 * sc, 70 * sc, 18 * sc, { align: 'right', size: 10 * sc, stroke: C.green, color: C.green, fill: 'rgba(139,211,92,0.14)' })
  }
  drawWeapon(c, p) {
    const g = this.g, s = g.player.s, w = s.w, sc = this.s, W = p.w, H = p.h
    box(c, 0, 0, W, H)
    if (!w) { text(c, 'NO WEAPON', 16, 30 * sc, { size: 14 * sc, weight: 700 }); return }
    if (this.compact) {
      const inMag = w.rec.mag, empty = inMag === 0 && !w.rec.chamber
      c.font = FONT(22 * sc, 700); c.fillStyle = empty ? C.red : C.white; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(String(inMag), 10 * sc, 30 * sc)
      const wd = c.measureText(String(inMag)).width
      text(c, `/ ${s.inv.countAmmo(w.def)}`, 14 * sc + wd, 29 * sc, { size: 12 * sc, color: C.dim, weight: 600 })
      chip(c, s.mode.toUpperCase(), W - 8 * sc, 6 * sc, 15 * sc, { align: 'right', size: 8.5 * sc })
      text(c, w.def.name.toUpperCase(), 10 * sc, 44 * sc, { size: 9.5 * sc, color: C.dim, weight: 600, max: W * 0.55 })
      text(c, `F${s.inv.count('frag')}  M${s.inv.count('bandage') + s.inv.count('firstaid') + s.inv.count('medkit')}`, W - 8 * sc, 44 * sc, { size: 9.5 * sc, color: C.text, weight: 700, align: 'right' })
      if (w.reloadT > 0) bar(c, 10 * sc, H - 4 * sc, W - 20 * sc, 2.5 * sc, 1 - w.reloadT / (w.reloadDur || 1), C.gold2, { segments: 0 })
      return
    }
    text(c, w.def.name.toUpperCase(), 16 * sc, 21 * sc, { size: 13.5 * sc, weight: 700, max: W - 110 * sc })
    chip(c, `${s.mode.toUpperCase()}${s.bipod ? ' · BIPOD' : ''}`, W - 14 * sc, 8 * sc, 18 * sc, { align: 'right', size: 10 * sc })
    const inMag = w.rec.mag, ch = w.rec.chamber ? '+1' : ''
    const reserve = s.inv.countAmmo(w.def)
    const empty = inMag === 0 && !w.rec.chamber
    c.font = FONT(36 * sc, 700); c.fillStyle = empty ? C.red : C.white; c.textBaseline = 'alphabetic'; c.textAlign = 'left'
    c.fillText(String(inMag), 16 * sc, 64 * sc)
    const wd = c.measureText(String(inMag)).width
    text(c, ch, 19 * sc + wd, 44 * sc, { size: 12 * sc, color: C.gold2, weight: 700 })
    text(c, `/ ${reserve}`, 22 * sc + wd + 18 * sc, 63 * sc, { size: 16 * sc, color: C.dim, weight: 600 })
    text(c, AMMO[w.def.ammo].name, 16 * sc, 83 * sc, { size: 10 * sc, color: C.dim })
    if (w.reloadT > 0) {
      const f = 1 - w.reloadT / (w.reloadDur || 1)
      bar(c, 16 * sc, H - 9 * sc, W - 32 * sc, 4 * sc, f, C.gold2, { segments: 0 })
      text(c, 'RELOADING', W / 2, 83 * sc, { size: 10.5 * sc, color: C.gold2, align: 'center', weight: 700 })
    }
    const optic = g.player.optic
    text(c, `${optic.zooms ? g.player.zoom + 'x  ' : optic.zoom > 1.5 ? optic.zoom + 'x  ' : ''}ZERO ${g.player.zero}`, W - 14 * sc, 43 * sc, { size: 10.5 * sc, color: C.dim, align: 'right', weight: 600 })
    // grenades, medical, gear: icons and counts
    let x = W - 14 * sc
    const item = (ic, n, col) => { const t = String(n); c.font = FONT(12 * sc, 700); const tw = c.measureText(t).width; x -= tw; text(c, t, x, 64 * sc, { size: 12 * sc, weight: 700, color: n ? C.text : C.dim }); x -= 16 * sc; icon(c, ic, x, 52 * sc, 14 * sc, n ? col : C.dim); x -= 10 * sc }
    item('cross', s.inv.count('bandage') + s.inv.count('firstaid') + s.inv.count('medkit'), C.green)
    item('grenade', s.inv.count('smoke'), '#b8c4c8')
    item('grenade', s.inv.count('frag'), C.text)
    const gear = g.gear?.label(s)
    if (gear) text(c, `${g.input.touch ? 'GEAR' : '[Y]'} ${gear}`, W - 14 * sc, 83 * sc, { size: 10 * sc, color: C.gold2, align: 'right', weight: 600, max: W * 0.55 })
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
    c.fillStyle = C.white; c.beginPath(); c.moveTo(W / 2, H / 2 - 7); c.lineTo(W / 2 - 5, H / 2 + 5); c.lineTo(W / 2, H / 2 + 2); c.lineTo(W / 2 + 5, H / 2 + 5); c.fill()
    // the bezel: a dark ring with ticks, the north mark in amber
    c.strokeStyle = 'rgba(8,10,7,0.85)'; c.lineWidth = 5; c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 3, 0, Math.PI * 2); c.stroke()
    c.strokeStyle = C.line; c.lineWidth = 1; c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 6, 0, Math.PI * 2); c.stroke()
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 - head; c.strokeStyle = i % 3 ? 'rgba(236,232,216,0.35)' : C.gold; c.lineWidth = i % 3 ? 1 : 2; c.beginPath(); c.moveTo(W / 2 + Math.sin(a) * (W / 2 - 1), H / 2 - Math.cos(a) * (H / 2 - 1)); c.lineTo(W / 2 + Math.sin(a) * (W / 2 - 6), H / 2 - Math.cos(a) * (H / 2 - 6)); c.stroke() }
    chip(c, gridRef(s.pos.x, s.pos.z), W / 2, H - 22, 16, { align: 'center', size: 9.5, fill: 'rgba(8,10,7,0.8)', color: C.text, stroke: C.line })
    const nx = W / 2 + Math.sin(-head) * (W / 2 - 15), ny = H / 2 - Math.cos(-head) * (H / 2 - 15)
    c.fillStyle = 'rgba(8,10,7,0.9)'; c.beginPath(); c.arc(nx, ny, 8, 0, Math.PI * 2); c.fill()
    text(c, 'N', nx, ny + 4, { size: 11, align: 'center', color: C.gold2, weight: 700 })
  }
  drawFeed(c, p) {
    const W = p.w, sc = this.s
    let y = 4 * sc
    for (const k of this.kills) {
      c.font = FONT(12 * sc, 700); const tw = c.measureText(k.text).width
      chamfer(c, W - tw - 22 * sc, y, tw + 18 * sc, 20 * sc, 5 * sc); c.fillStyle = 'rgba(8,10,7,0.66)'; c.fill()
      c.fillStyle = C.red; c.fillRect(W - 3 * sc, y + 3 * sc, 2 * sc, 14 * sc)
      text(c, k.text, W - 10 * sc, y + 14.5 * sc, { size: 12 * sc, align: 'right', color: C.white, weight: 700 }); y += 23 * sc
    }
    y += 4 * sc
    for (const m of this.messages) {
      c.font = FONT(12 * sc, 600); const tw = Math.min(W - 16 * sc, c.measureText(m.text).width)
      c.fillStyle = 'rgba(8,10,7,0.5)'; c.fillRect(W - tw - 18 * sc, y, tw + 18 * sc, 19 * sc)
      c.fillStyle = m.color === C.text ? C.line : m.color; c.fillRect(W - 2 * sc, y, 2 * sc, 19 * sc)
      text(c, m.text, W - 9 * sc, y + 13.5 * sc, { size: 12 * sc, align: 'right', color: m.color, weight: 600, max: W - 22 * sc }); y += 21 * sc
    }
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
  updateMarks() {
    const g = this.g, P = g.player, s = P?.s, e = g.engine
    const list = this.visible && s && !s.dead && !P.scoped && g.settings.hud?.markers !== false ? g.markers().slice(0, this.marks.length) : []
    const W = e.width, H = e.height, sc = this.s
    this.marks.forEach((p, i) => {
      const m = list[i]
      if (!m) { if (p.visible) p.show(false); return }
      const y = (m.y ?? heightAt(m.x, m.z)) + 2.2
      const v = e.toScene(_mv.set(m.x, y, m.z), _mv).project(e.camera)
      if (v.z > 1) { if (p.visible) p.show(false); return }      // behind you
      const sx = Math.max(30 * sc, Math.min(W - 30 * sc, (v.x * 0.5 + 0.5) * W)), sy = Math.max(60 * sc, Math.min(H - 60 * sc, (-v.y * 0.5 + 0.5) * H))
      p.place(sx - 40 * sc, sy - 14 * sc, 80 * sc, 40 * sc)
      const d = Math.hypot(m.x - s.pos.x, m.z - s.pos.z), label = d < 1000 ? `${Math.round(d / (d < 100 ? 1 : 10)) * (d < 100 ? 1 : 10)} m` : `${(d / 1000).toFixed(1)} km`
      const key = (m.color || '') + label
      if (p.key !== key) { p.key = key; p.m = { color: m.color || C.gold2, label }; p.dirty = true }
      if (!p.visible) p.show(true)
    })
  }
  drawMark(c, p) {
    const m = p.m, sc = this.s; if (!m) return
    const cx = p.w / 2, cy = 14 * sc, r = 7 * sc
    c.beginPath(); c.moveTo(cx, cy - r); c.lineTo(cx + r, cy); c.lineTo(cx, cy + r); c.lineTo(cx - r, cy); c.closePath()
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill(); c.strokeStyle = m.color; c.lineWidth = 2.2; c.stroke()
    text(c, m.label, cx, cy + r + 12 * sc, { size: 11 * sc, weight: 700, align: 'center', color: m.color, shadow: true })
  }
  drawCenter(c, p) {
    const W = p.w, sc = this.s
    if (this.prompt) {
      const m = /^\[([^\]]+)\]\s*(.*)$/.exec(this.prompt)
      const key = m ? (this.g.input.touch && m[1] === 'F' ? 'USE' : m[1]) : null, label = m ? m[2] : this.prompt
      c.font = FONT(14 * sc, 700); const lw = c.measureText(label).width, kw = key ? (c.measureText(key).width + 22 * sc) : 0
      const w = lw + kw + 30 * sc, x = W / 2 - w / 2
      chamfer(c, x, 0, w, 32 * sc, 8 * sc); c.fillStyle = 'rgba(8,10,7,0.74)'; c.fill(); c.strokeStyle = C.line; c.lineWidth = 1; c.stroke()
      if (key) chip(c, key, x + 10 * sc, 6 * sc, 20 * sc, { size: 11 * sc, fill: 'rgba(224,165,38,0.4)', color: C.white })
      text(c, label, x + 16 * sc + kw, 21 * sc, { size: 14 * sc, weight: 700, color: C.gold2 })
    }
    const t = this.g.mode?.centerText?.()
    if (t) text(c, t, W / 2, 74 * sc, { size: 24 * sc, align: 'center', weight: 700, color: C.white, shadow: true })
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
    text(c, v.def.name.toUpperCase(), 16 * sc, 21 * sc, { size: 13.5 * sc, weight: 700, max: W * 0.55 })
    chip(c, s.seat.role.toUpperCase(), W - 14 * sc, 8 * sc, 18 * sc, { align: 'right', size: 10 * sc })
    const air = v.kind === 'heli' || v.kind === 'plane'
    c.font = FONT(26 * sc, 700); const sp = String(Math.round(Math.abs(v.speed) * 3.6)); c.fillStyle = C.white; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(sp, 16 * sc, 54 * sc)
    const spw = c.measureText(sp).width
    text(c, 'KM/H', 20 * sc + spw, 54 * sc, { size: 10 * sc, color: C.dim, weight: 700 })
    if (air) text(c, `ALT ${Math.round(v.alt)} m${v.kind === 'plane' ? (v.gearDown ? '  · GEAR' : '') : ''}`, 70 * sc + spw, 54 * sc, { size: 13 * sc, weight: 700 })
    text(c, 'HULL', 16 * sc, 72 * sc, { size: 9.5 * sc, color: C.dim, weight: 700 }); bar(c, 52 * sc, 65 * sc, 130 * sc, 7 * sc, v.hp / v.maxHp, v.hp < v.maxHp * 0.3 ? C.red : C.green)
    text(c, 'FUEL', 16 * sc, 87 * sc, { size: 9.5 * sc, color: C.dim, weight: 700 }); bar(c, 52 * sc, 80 * sc, 130 * sc, 7 * sc, v.fuel / v.maxFuel, C.amber)
    const sw = s.seat?.w
    if (sw) {
      text(c, sw.def.name, W - 14 * sc, 44 * sc, { size: 11 * sc, align: 'right', color: C.dim, weight: 600 })
      text(c, sw.reloadT > 0 ? 'RELOADING' : `${sw.mag} / ${sw.def.mag}`, W - 14 * sc, 66 * sc, { size: 18 * sc, align: 'right', weight: 700, color: sw.reloadT > 0 ? C.gold2 : C.white })
      const w2 = s.seat.w2
      if (w2) text(c, `${w2.def.name}: ${w2.mag}${w2.lockT > 1.2 ? '  LOCKED' : w2.lock ? '  LOCKING' : ''}`, W - 14 * sc, 86 * sc, { size: 10 * sc, align: 'right', color: w2.lockT > 1.2 ? C.red : C.dim, weight: 600 })
    }
    if (v.flares) text(c, `FLARES ${v.flares}${this.g.input.touch ? '' : ' [R]'}`, 196 * sc, 87 * sc, { size: 10 * sc, color: C.dim, weight: 600 })
    // engine and lights
    let cx = 196 * sc
    if (!v.engine) cx += chip(c, this.g.input.touch ? 'ENGINE OFF' : 'ENGINE OFF [E]', cx, 62 * sc, 16 * sc, { size: 9 * sc, fill: 'rgba(255,90,69,0.18)', stroke: C.red, color: C.red }) + 6 * sc
    if (v.lights) chip(c, 'LIGHTS', cx, 62 * sc, 16 * sc, { size: 9 * sc })
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
  // Touch controls for phones: round glass buttons with an icon and a label, the main ones in an arc
  // round the thumb's resting place at the bottom right, small utility buttons down the right edge.
  drawTouch(c, p) {
    const W = p.w, H = p.h, g = this.g
    const r = Math.min(W, H) * 0.075
    const btn = (id, x, y, label, ic, fn, rr = r, o = {}) => {
      const on = !!o.on
      const gr = c.createRadialGradient(x, y - rr * 0.4, rr * 0.1, x, y, rr)
      gr.addColorStop(0, on ? 'rgba(224,165,38,0.55)' : 'rgba(40,46,32,0.62)'); gr.addColorStop(1, on ? 'rgba(224,165,38,0.3)' : 'rgba(8,10,7,0.55)')
      c.fillStyle = gr; c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill()
      c.strokeStyle = on ? C.gold2 : o.ring || 'rgba(236,232,216,0.45)'; c.lineWidth = o.main ? 3 : 2; c.stroke()
      if (o.main) { c.strokeStyle = 'rgba(224,165,38,0.5)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, rr + 5, -2.4, -0.7); c.stroke(); c.beginPath(); c.arc(x, y, rr + 5, 0.74, 2.4); c.stroke() }
      const is = rr * (label ? 0.72 : 0.9)
      icon(c, ic, x - is / 2, y - is / 2 - (label ? rr * 0.14 : 0), is, on ? C.white : C.text, { width: 2.2 })
      if (label) text(c, label, x, y + rr * 0.64, { size: Math.max(8.5, rr * 0.26), align: 'center', weight: 700, color: on ? C.white : 'rgba(236,232,216,0.8)' })
      p.buttons.push({ id, x: x - rr, y: y - rr, w: rr * 2, h: rr * 2, fn })
    }
    const R = W - r * 1.6, B = H - r * 1.6
    const P = g.player, s = P.s
    const top = this.mini.y + this.mini.h + r * 0.9
    const util = (i, id, label, ic, fn, o) => btn(id, W - r * 0.95, top + r * i * 1.55, label, ic, fn, r * 0.66, o)
    btn('menu', r * 0.9, this.compact ? top + r * 1.6 : this.weapon.y + this.weapon.h + r * 1.2, '', 'menu', () => g.input.pressed.add('pause'), r * 0.62)
    if (s.vehicle) {
      // in a vehicle: hold to fire, second weapon, up and down (helicopters, landing); get out, change seat, view
      const v = s.vehicle, air = v.kind === 'heli' || v.kind === 'plane'
      btn('vfire', R, B - r * 0.4, 'FIRE', 'fire', () => { P.touchFire = true }, r * 1.25, { main: true, ring: 'rgba(255,90,69,0.7)' })
      btn('valt', R - r * 2.6, B + r * 0.2, 'ALT', 'alt', () => { P.touchAlt = true })
      if (air) { btn('vup', R - r * 0.2, B - r * 3, 'UP', 'up', () => { P.touchUp = true }); btn('vdown', R - r * 2.5, B - r * 2.2, 'DOWN', 'down', () => { P.touchDown = true }) }
      btn('vexit', R - r * 4.4, B + r * 0.2, 'EXIT', 'exit', () => g.input.pressed.add('interact'), r * 0.8)
      btn('vseat', R - r * 4.2, B - r * 2.2, 'SEAT', 'seat', () => g.input.pressed.add('vSeat'), r * 0.8)
      util(0, 'view', 'VIEW', 'view', () => g.input.pressed.add('view'))
      util(1, 'map', 'MAP', 'map', () => g.input.pressed.add('map'))
      if (air) util(2, 'flares', 'FLARE', 'flare', () => g.input.pressed.add('vFlares'))
      const dr = P.s.seat?.role === 'driver' || P.s.seat?.role === 'pilot'
      if (dr) { util(air ? 3 : 2, 'veng', v.engine ? 'ENG ON' : 'ENG OFF', 'bolt', () => g.input.pressed.add('vEngine'), { on: v.engine }); util(air ? 4 : 3, 'vlight', 'LIGHTS', 'eye', () => g.input.pressed.add('vLight'), { on: v.lights }) }
      util(dr ? (air ? 5 : 4) : 2, 'vkit', 'KIT', 'bag', () => g.input.pressed.add('inventory'))
      text(c, air ? 'Left thumb: fly  ·  right thumb: aim' : 'Left thumb: drive  ·  right thumb: look and aim', W / 2, H * 0.46, { size: 12, align: 'center', color: 'rgba(236,232,216,0.6)', weight: 600 })
      return
    }
    btn('fire', R, B - r * 0.4, 'FIRE', 'fire', () => { P.touchFire = true }, r * 1.25, { main: true, ring: 'rgba(255,90,69,0.7)' })   // held until the finger lifts
    btn('aim', R - r * 2.6, B + r * 0.2, 'AIM', 'aim', () => { P.touchAds = !P.touchAds }, r, { on: P.touchAds })
    btn('reload', R - r * 0.2, B - r * 3, 'RELOAD', 'reload', () => g.input.pressed.add('reload'), r, { on: s.reloading })
    btn('stance', R - r * 2.5, B - r * 2.2, ['STAND', 'CROUCH', 'PRONE'][s.stance], ['stand', 'crouch', 'prone'][s.stance], () => g.input.pressed.add(s.stance === 0 ? 'crouch' : 'prone'))
    btn('jump', R - r * 4.6, B + r * 0.2, 'JUMP', 'jump', () => g.input.pressed.add('jump'), r * 0.8)
    btn('use', R - r * 4.2, B - r * 2.2, 'USE', 'hand', () => g.input.pressed.add('interact'), r * 0.8)
    btn('nade', R - r * 0.2, B - r * 5.2, { frag: 'FRAG', smoke: 'SMOKE', flash: 'FLASH' }[P.nade] || 'NADE', 'grenade', () => g.input.pressed.add('grenade'), r * 0.8)
    btn('nadenext', R + r * 0.75, B - r * 6.1, '', 'reload', () => g.input.pressed.add('slot4'), r * 0.42)
    if (g.gear?.selected(s)) { btn('gear', R - r * 2.3, B - r * 4.4, 'GEAR', 'gear', () => g.input.pressed.add('gear'), r * 0.8); btn('gearnext', R - r * 3.6, B - r * 5.3, '', 'reload', () => g.input.pressed.add('gearNext'), r * 0.5) }
    util(0, 'view', 'VIEW', 'view', () => g.input.pressed.add('view'))
    util(1, 'map', 'MAP', 'map', () => g.input.pressed.add('map'))
    util(2, 'inv', 'KIT', 'bag', () => g.input.pressed.add('inventory'))
    util(3, 'heal', 'HEAL', 'cross', () => g.input.pressed.add('heal'))
    util(4, 'nvg', 'NV', 'eye', () => g.input.pressed.add('nvg'), { on: P.nvg })
    // the hint, for the first half minute
    if ((g.mode?.t ?? 99) < 30) text(c, g.settings.stickTurns ? 'Left thumb: move and turn  ·  right thumb: look' : 'Left thumb: move  ·  right thumb: look and shoot', W / 2, H * 0.46, { size: 12, align: 'center', color: 'rgba(236,232,216,0.7)', weight: 600 })
  }
}
