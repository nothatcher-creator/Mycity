// Several fingers at once on a phone: a movement stick under the left thumb, look drags and the buttons
// under the right. The game asks the city not to show its own stick (experience.json "stick": false): a
// touch on the city's stick and one on the game land in different frames, and the browser sends every
// finger of a gesture to the frame the first one touched, so moving and looking at once was impossible.
//
// Pointer events from the city carry no finger id, but each one's dx/dy is measured from that same
// finger's last position, so (x - dx, y - dy) is where the finger was: that tells the fingers apart.
import { Panel, C, text } from '../ui/ui.js'

// buttons held down for as long as the finger stays on them (fire, and the vehicle controls)
const HOLD = { fire: 'touchFire', vfire: 'touchFire', valt: 'touchAlt', vup: 'touchUp', vdown: 'touchDown' }

export class Touch {
  constructor(game) {
    this.g = game
    this.fingers = []
    this.stick = { active: false, x: 0, y: 0, cx: 0, cy: 0 }
    this.panel = game.ui.add(new Panel(game.ui, 0, 0, 10, 10, (c, p) => this.draw(c, p), { order: 4 }))
    this.panel.show(false)
  }
  get R() { const e = this.g.engine; return Math.max(44, Math.min(e.width, e.height) * 0.12) }
  // where the stick rests when no thumb is on it
  home() { const e = this.g.engine, R = this.R; return [R * 1.45, e.height - R * 1.55] }
  // which tracked finger an event belongs to
  find(e) {
    const px = e.x - (e.dx || 0), py = e.y - (e.dy || 0)
    let best = null, bd = Infinity
    for (const f of this.fingers) { const d = Math.hypot(f.x - px, f.y - py); if (d < bd) { bd = d; best = f } }
    if (bd > 80 && this.fingers.length > 1) { // fall back to the finger nearest where this one is now
      bd = Infinity
      for (const f of this.fingers) { const d = Math.hypot(f.x - e.x, f.y - e.y); if (d < bd) { bd = d; best = f } }
    }
    return best
  }
  down(e) {
    const g = this.g, W = g.engine.width, H = g.engine.height
    // a stale finger whose lift we missed: anything not moved for a long time with too many fingers down
    if (this.fingers.length >= 4) this.clear()
    const f = { x: e.x, y: e.y, role: 'look' }
    const hit = g.ui.hit(e.x, e.y)
    if (hit?.button) {
      f.role = 'button'; f.hold = HOLD[hit.button.id] || null; f.btn = hit.button.id
      hit.button.fn?.(hit.button, e.x - hit.panel.x, e.y - hit.panel.y)
    } else if (!this.stick.active && e.x < W * 0.45 && e.y > H * 0.45) {
      f.role = 'stick'
      Object.assign(this.stick, { active: true, x: 0, y: 0, cx: e.x, cy: e.y })
      g.input.stick = this.stick
      this.place()
    }
    this.fingers.push(f)
  }
  move(e) {
    const f = this.find(e); if (!f) return
    f.x = e.x; f.y = e.y
    const g = this.g
    if (f.role === 'stick') {
      const s = this.stick, R = this.R
      let dx = e.x - s.cx, dy = e.y - s.cy
      const d = Math.hypot(dx, dy)
      // past the rim the stick follows the thumb, so it never runs out
      if (d > R * 1.25) { const k = (d - R * 1.25) / d; s.cx += dx * k; s.cy += dy * k; dx = e.x - s.cx; dy = e.y - s.cy }
      const m = Math.min(1, Math.hypot(dx, dy) / R), a = Math.atan2(dy, dx)
      s.x = Math.cos(a) * m; s.y = -Math.sin(a) * m
      this.place()
    } else if (f.role === 'look' || f.hold === 'touchFire') {
      // look with the right thumb (dragging while holding fire aims too)
      if (Math.abs(e.dx) < 200 && Math.abs(e.dy) < 200) { g.input.look.dx += e.dx * 2.4; g.input.look.dy += e.dy * 2.4 }
    }
  }
  up(e) {
    const f = this.find(e); if (!f) return
    this.fingers.splice(this.fingers.indexOf(f), 1)
    this.release(f)
  }
  release(f) {
    const P = this.g.player
    if (f.role === 'stick') { Object.assign(this.stick, { active: false, x: 0, y: 0 }); this.g.input.stick = null; this.place() }
    if (f.hold && P) P[f.hold] = false
  }
  clear() { for (const f of this.fingers) this.release(f); this.fingers = [] }
  // the stick's small panel sits round its centre (or its resting place)
  place() {
    const s = this.stick, R = this.R, [hx, hy] = this.home()
    const cx = s.active ? s.cx : hx, cy = s.active ? s.cy : hy
    this.panel.place(cx - R * 1.4, cy - R * 1.4, R * 2.8, R * 2.8)
    this.panel.dirty = true
  }
  update() {
    const g = this.g
    const on = g.input.touch && g.state === 'play' && !g.menus.visible && !g.map.visible && !g.invui.visible && !g.mode?.uiOpen && !!g.player
    if (on !== this.panel.visible) { this.panel.show(on); if (on) this.place(); else this.clear() }
  }
  draw(c, p) {
    const s = this.stick, R = this.R, cx = p.w / 2, cy = p.h / 2
    c.fillStyle = s.active ? 'rgba(8,10,7,0.32)' : 'rgba(8,10,7,0.2)'
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill()
    c.strokeStyle = s.active ? 'rgba(224,165,38,0.75)' : 'rgba(236,232,216,0.35)'; c.lineWidth = 2; c.stroke()
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.fillStyle = 'rgba(236,232,216,0.35)'; c.beginPath(); c.moveTo(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86); c.lineTo(cx + Math.cos(a + 0.12) * R * 0.74, cy + Math.sin(a + 0.12) * R * 0.74); c.lineTo(cx + Math.cos(a - 0.12) * R * 0.74, cy + Math.sin(a - 0.12) * R * 0.74); c.fill() }
    const kx = cx + s.x * R, ky = cy - s.y * R, fast = Math.hypot(s.x, s.y) > 0.92
    c.fillStyle = fast ? 'rgba(255,207,90,0.85)' : 'rgba(236,232,216,0.75)'
    c.beginPath(); c.arc(kx, ky, R * 0.42, 0, Math.PI * 2); c.fill()
    if (!s.active) text(c, 'MOVE', cx, cy + R + 14, { size: 10, align: 'center', weight: 700, color: 'rgba(236,232,216,0.55)' })
  }
}
