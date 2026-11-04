// The full-screen tactical map: zoom with the wheel, drag to pan, click to set a waypoint (or, with a squad,
// to order a move). Shows the grid, place names, the player, the squad, known enemies, vehicles and
// objectives, and the grid reference under the pointer.
import { Panel, C, FONT, text, box } from './ui.js'
import { mapImage, worldToMap, mapToWorld, gridRef } from './mapimage.js'
import { PLACES, HALF, WORLD } from '../world/blueprint.js'
import { heightAt } from '../world/heightfield.js'

export class MapView {
  constructor(game) {
    this.g = game
    this.zoom = 1; this.cx = 0; this.cz = 0     // world point at the screen's middle
    this.panel = game.ui.add(new Panel(game.ui, 0, 0, 10, 10, (c, p) => this.draw(c, p), { modal: true, order: 10 }))
    this.panel.show(false)
    this.drag = null
    this.mode = 'waypoint'
  }
  open() {
    const s = this.g.player?.s
    if (s) { this.cx = s.pos.x; this.cz = s.pos.z }
    this.zoom = 3
    this.layout()
    this.panel.show(true)
  }
  close() { this.panel.show(false) }
  get visible() { return this.panel.visible }
  layout() { const e = this.g.engine, safe = this.g.input.touch ? 60 : 0; this.panel.place(0, safe, e.width, e.height - safe) }
  // pixels per metre
  get scale() { return Math.min(this.panel.w, this.panel.h) / WORLD * this.zoom }
  toScreen(x, z) { const s = this.scale; return [this.panel.w / 2 + (x - this.cx) * s, this.panel.h / 2 + (z - this.cz) * s] }
  toWorld(px, py) { const s = this.scale; return [this.cx + (px - this.panel.w / 2) / s, this.cz + (py - this.panel.h / 2) / s] }
  wheel(dy, px, py) {
    const [wx, wz] = this.toWorld(px, py)
    this.zoom = Math.max(0.9, Math.min(60, this.zoom * (dy < 0 ? 1.25 : 0.8)))
    const [nx, nz] = this.toWorld(px, py)
    this.cx += wx - nx; this.cz += wz - nz
    this.panel.dirty = true
  }
  // a second finger on the map (a pinch) cancels the tap so it never drops a waypoint by accident
  pointerDown(x, y, button) { if (this.drag && this.g.input.touch) { this.drag.moved = true; return } this.drag = { x, y, cx: this.cx, cz: this.cz, moved: false, button } }
  zoomBy(f) { this.zoom = Math.max(0.9, Math.min(60, this.zoom * f)); this.panel.dirty = true }
  pointerMove(x, y) {
    this.hover = this.toWorld(x, y)
    if (this.drag && (this.drag.button === 0 || this.drag.button === 2)) {
      const dx = x - this.drag.x, dy = y - this.drag.y
      if (Math.hypot(dx, dy) > 4) this.drag.moved = true
      if (this.drag.moved) { this.cx = this.drag.cx - dx / this.scale; this.cz = this.drag.cz - dy / this.scale }
    }
    this.panel.dirty = true
  }
  pointerUp(x, y) {
    if (this.drag && !this.drag.moved) {
      const hitBtn = this.panel.buttons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
      if (!hitBtn) {
        const [wx, wz] = this.toWorld(x, y)
        if (this.drag.button === 2) this.g.waypoint = null
        else if (this.mode === 'teleport' && this.g.mode?.admin) { this.mode = 'waypoint'; this.g.mode.admin('teleport', { x: wx, z: wz }); this.g.closeMap() }
        else if (this.mode === 'squad' && this.g.playerSquad) { this.g.orderSquad('move', { x: wx, z: wz }); this.g.hud.note(`Squad: move to ${gridRef(wx, wz)}`) }
        else this.g.waypoint = { x: wx, z: wz, y: heightAt(wx, wz) }
      }
    }
    this.drag = null
    this.panel.dirty = true
  }
  update() { if (this.visible) { this.t = (this.t || 0) + 1; if (this.t % 6 === 0) this.panel.dirty = true } }
  draw(c, p) {
    const W = p.w, H = p.h, img = mapImage()
    c.fillStyle = '#21323c'; c.fillRect(0, 0, W, H)
    if (img) {
      const [x0, y0] = this.toScreen(-HALF, -HALF), [x1, y1] = this.toScreen(HALF, HALF)
      c.imageSmoothingEnabled = this.zoom < 6
      c.drawImage(img, x0, y0, x1 - x0, y1 - y0)
    }
    // the grid
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1
    c.font = FONT(11, 700); c.fillStyle = 'rgba(0,0,0,0.55)'
    const step = this.zoom > 18 ? 100 : 1000
    for (let g = -HALF; g <= HALF; g += step) {
      const [x] = this.toScreen(g, 0), [, y] = this.toScreen(0, g)
      c.globalAlpha = step === 100 && g % 1000 ? 0.4 : 1
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke()
      c.globalAlpha = 1
    }
    for (let i = 0; i < 12; i++) {
      const [x] = this.toScreen(-HALF + i * 1000 + 500, 0), [, y] = this.toScreen(0, -HALF + i * 1000 + 500)
      text(c, 'ABCDEFGHIJKL'[i], x, 60, { size: 12, align: 'center', color: '#fff', shadow: true })
      text(c, String(i + 1), 8, y + 4, { size: 12, color: '#fff', shadow: true })
    }
    // places
    for (const pl of PLACES) {
      const [x, y] = this.toScreen(pl.x, pl.z)
      if (x < -100 || y < -40 || x > W + 100 || y > H + 40) continue
      const big = pl.kind === 'city' || pl.kind === 'airport'
      if (!big && this.zoom < 1.6 && pl.kind !== 'military' && pl.kind !== 'landmark') continue
      text(c, pl.name.toUpperCase(), x, y - (big ? 0 : 4), { size: big ? 15 : 11, align: 'center', color: '#fff', shadow: true, weight: 800 })
    }
    // discovered secrets
    for (const s of this.g.discovered()) { const [x, y] = this.toScreen(s.x, s.z); c.fillStyle = C.gold2; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); if (this.zoom > 4) text(c, s.name, x + 7, y + 4, { size: 10, color: '#fff', shadow: true }) }
    // units and objectives
    for (const u of this.g.radar(true)) {
      const [x, y] = this.toScreen(u.x, u.z)
      c.fillStyle = u.color; c.strokeStyle = u.color
      if (u.kind === 'objective') { c.lineWidth = 2; c.strokeRect(x - 7, y - 7, 14, 14); if (u.label) text(c, u.label, x + 10, y + 4, { size: 11, color: u.color, shadow: true, weight: 700 }) }
      else if (u.kind === 'vehicle') c.fillRect(x - 5, y - 3, 10, 6)
      else { c.beginPath(); c.arc(x, y, 3.5, 0, Math.PI * 2); c.fill() }
    }
    const s = this.g.player?.s
    if (s) {
      const [x, y] = this.toScreen(s.pos.x, s.pos.z), h = this.g.camHeading()
      c.save(); c.translate(x, y); c.rotate(h); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5
      c.beginPath(); c.moveTo(0, -10); c.lineTo(-6, 7); c.lineTo(6, 7); c.closePath(); c.fill(); c.stroke(); c.restore()
    }
    const wp = this.g.waypoint
    if (wp && s) { const [x, y] = this.toScreen(wp.x, wp.z); text(c, `${Math.round(Math.hypot(wp.x - s.pos.x, wp.z - s.pos.z))} m`, x + 14, y - 10, { size: 12, weight: 800, color: C.gold2, shadow: true }) }
    if (wp) { const [x, y] = this.toScreen(wp.x, wp.z); c.strokeStyle = C.gold2; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 8, 0, Math.PI * 2); c.moveTo(x - 12, y); c.lineTo(x + 12, y); c.moveTo(x, y - 12); c.lineTo(x, y + 12); c.stroke() }
    // the side panel: grid reference, legend, controls
    box(c, 12, H - 132, 330, 120)
    if (this.hover) text(c, `${gridRef(this.hover[0], this.hover[1])}   ${Math.round(heightAt(this.hover[0], this.hover[1]))} m`, 24, H - 108, { size: 14, weight: 700 })
    if (s && this.hover) text(c, `Distance ${Math.round(Math.hypot(this.hover[0] - s.pos.x, this.hover[1] - s.pos.z))} m`, 24, H - 88, { size: 12, color: C.dim })
    text(c, this.g.input.touch ? 'Drag: pan   + / −: zoom   Tap: waypoint' : 'Wheel: zoom   Drag: pan   Click: waypoint   Right click: clear', 24, H - 64, { size: 11, color: C.dim })
    text(c, 'You   Squad   Friendly   Enemy   Objective', 24, H - 42, { size: 11, color: C.dim })
    const L = [['#fff', 24], ['#5ab0ff', 60], ['#6ab04c', 110], ['#e0483a', 170], [C.gold2, 220]]
    for (const [col, x] of L) { c.fillStyle = col; c.fillRect(x - 10, H - 30, 6, 6) }
    // buttons
    this.panel.button(c, 'close', W - 130, H - 54, 116, 40, this.g.input.touch ? 'CLOSE' : 'CLOSE [M]', () => this.g.closeMap(), { align: 'center' })
    // zoom and centre (for touch screens, and handy with a mouse too)
    const zx = W - 62, zy = 70
    this.panel.button(c, 'zin', zx, zy, 48, 44, '+', () => this.zoomBy(1.6), { align: 'center', font: FONT(22, 800) })
    this.panel.button(c, 'zout', zx, zy + 50, 48, 44, '−', () => this.zoomBy(1 / 1.6), { align: 'center', font: FONT(22, 800) })
    if (s) this.panel.button(c, 'me', zx - 20, zy + 100, 68, 36, 'ME', () => { this.cx = s.pos.x; this.cz = s.pos.z; this.panel.dirty = true }, { align: 'center', font: FONT(12, 800) })
    if (wp) this.panel.button(c, 'clearwp', zx - 40, zy + 142, 88, 36, 'CLEAR WP', () => { this.g.waypoint = null; this.panel.dirty = true }, { align: 'center', font: FONT(11, 800) })
    if (this.g.playerSquad) this.panel.button(c, 'mode', W - 300, H - 54, 160, 40, this.mode === 'squad' ? 'CLICK: SQUAD MOVE' : 'CLICK: WAYPOINT', () => { this.mode = this.mode === 'squad' ? 'waypoint' : 'squad'; this.panel.dirty = true }, { align: 'center' })
  }
}
