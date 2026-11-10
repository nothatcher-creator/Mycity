// Phones and tablets: a movement stick under the left thumb, look drags with the right, and buttons for
// what the keys do (up and down, jetpack, use, place and remove, turn the block, the catalogue). Several
// fingers at once: pointer events carry no finger id, but each one's dx/dy is measured from that finger's
// last position, so (x - dx, y - dy) tells the fingers apart.
import { Panel, C, text, chamfer, FONT } from '../ui/ui.js'

// buttons held as actions while a finger stays on them
const HOLD = { up: 'up', down: 'down', boost: 'sprint', place: 'place', remove: 'remove', rollL: 'rollL', rollR: 'rollR' }

export class Touch {
  constructor(game) {
    this.g = game
    this.fingers = []
    this.stick = { active: false, x: 0, y: 0, cx: 0, cy: 0 }
    this.panel = game.ui.add(new Panel(game.ui, 0, 0, 10, 10, (c, p) => this.draw(c, p), { order: 4 }))
    this.btns = game.ui.add(new Panel(game.ui, 0, 0, 10, 10, (c, p) => this.drawButtons(c, p), { order: 4 }))
    this.panel.show(false); this.btns.show(false)
  }
  get R() { const e = this.g.engine; return Math.max(44, Math.min(e.width, e.height) * 0.12) }
  home() { const e = this.g.engine, R = this.R; return [R * 1.45, e.height - R * 1.55] }
  find(e) {
    const px = e.x - (e.dx || 0), py = e.y - (e.dy || 0)
    let best = null, bd = Infinity
    for (const f of this.fingers) { const d = Math.hypot(f.x - px, f.y - py); if (d < bd) { bd = d; best = f } }
    if (bd > 80 && this.fingers.length > 1) { bd = Infinity; for (const f of this.fingers) { const d = Math.hypot(f.x - e.x, f.y - e.y); if (d < bd) { bd = d; best = f } } }
    return best
  }
  down(e) {
    const g = this.g, W = g.engine.width, H = g.engine.height
    if (this.fingers.length >= 4) this.clear()
    const f = { x: e.x, y: e.y, role: 'look' }
    const hit = g.ui.hit(e.x, e.y)
    if (hit?.button) {
      f.role = 'button'; f.hold = HOLD[hit.button.id] || null
      if (f.hold) this.press(f.hold, true)
      else hit.button.fn?.(hit.button, e.x - hit.panel.x, e.y - hit.panel.y)
    } else if (!this.stick.active && e.x < W * 0.4 && e.y > H * 0.4) {
      f.role = 'stick'
      Object.assign(this.stick, { active: true, x: 0, y: 0, cx: e.x, cy: e.y })
      g.input.stick = this.stick
      this.place()
    }
    this.fingers.push(f)
  }
  press(a, on) {
    const inp = this.g.input
    if (a === 'place') { if (on) inp.mouse.leftHit = true; inp.mouse.left = on; return }
    if (a === 'remove') { if (on) inp.mouse.rightHit = true; inp.mouse.right = on; return }
    if (on) { inp.virtual.add(a); inp.tap(a) } else inp.virtual.delete(a)
  }
  move(e) {
    const f = this.find(e); if (!f) return
    f.x = e.x; f.y = e.y
    if (f.role === 'stick') {
      const s = this.stick, R = this.R
      let dx = e.x - s.cx, dy = e.y - s.cy
      const d = Math.hypot(dx, dy)
      if (d > R * 1.25) { const k = (d - R * 1.25) / d; s.cx += dx * k; s.cy += dy * k; dx = e.x - s.cx; dy = e.y - s.cy }
      const m = Math.min(1, Math.hypot(dx, dy) / R), a = Math.atan2(dy, dx)
      s.x = Math.cos(a) * m; s.y = -Math.sin(a) * m
      this.place()
    } else if (f.role === 'look' || f.hold === 'place' || f.hold === 'remove') {
      if (Math.abs(e.dx) < 200 && Math.abs(e.dy) < 200) { this.g.input.look.dx += e.dx * 2.2; this.g.input.look.dy += e.dy * 2.2 }
    }
  }
  up(e) { const f = this.find(e); if (!f) return; this.fingers.splice(this.fingers.indexOf(f), 1); this.release(f) }
  release(f) {
    if (f.role === 'stick') { Object.assign(this.stick, { active: false, x: 0, y: 0 }); this.g.input.stick = null; this.place() }
    if (f.hold) this.press(f.hold, false)
  }
  clear() { for (const f of this.fingers) this.release(f); this.fingers = [] }
  place() {
    const s = this.stick, R = this.R, [hx, hy] = this.home()
    const cx = s.active ? s.cx : hx, cy = s.active ? s.cy : hy
    this.panel.place(cx - R * 1.4, cy - R * 1.4, R * 2.8, R * 2.8)
    this.panel.dirty = true
  }
  // the button block: three columns by four rows at the bottom right
  get bw() { const e = this.g.engine; return Math.round(Math.max(44, Math.min(64, e.height * 0.12, e.width * 0.075))) }
  get blockW() { return 3 * (this.bw + 8) + 6 }
  get blockH() { return 4 * (this.bw + 8) + 4 }
  layout() { const e = this.g.engine; this.btns.place(e.width - this.blockW - 4, e.height - this.blockH - 4, this.blockW, this.blockH); this.place() }
  update() {
    const g = this.g
    const on = g.input.touch && g.state === 'play' && !g.menus.visible && !!g.player && !g.player.dead
    if (on !== this.panel.visible) { this.panel.show(on); this.btns.show(on); if (on) this.layout(); else this.clear() }
    if (on) { const k = this.key(); if (k !== this.lastKey) { this.lastKey = k; this.btns.dirty = true } }
  }
  key() { const g = this.g, P = g.player; return [!!P?.seat, P?.jetpack, !!g.builder.blockId, !!g.builder.tool, !!g.interactTarget, g.builder.size, this.fingers.map(f => f.hold).join()].join() }
  draw(c, p) {
    const s = this.stick, R = this.R, cx = p.w / 2, cy = p.h / 2
    c.fillStyle = s.active ? 'rgba(4,9,12,0.34)' : 'rgba(4,9,12,0.2)'
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill()
    c.strokeStyle = s.active ? 'rgba(63,224,208,0.75)' : 'rgba(228,242,242,0.35)'; c.lineWidth = 2; c.stroke()
    const kx = cx + s.x * R, ky = cy - s.y * R
    c.fillStyle = 'rgba(228,242,242,0.75)'; c.beginPath(); c.arc(kx, ky, R * 0.42, 0, Math.PI * 2); c.fill()
    if (!s.active) text(c, 'MOVE', cx, cy + R + 14, { size: 10, align: 'center', weight: 700, color: 'rgba(228,242,242,0.55)' })
  }
  drawButtons(c, p) {
    const g = this.g, P = g.player, B = g.builder, bw = this.bw, held = new Set(this.fingers.map(f => f.hold))
    if (!P) return
    const btn = (id, label, col, row, fn, o = {}) => {
      const x = p.w - (col + 1) * (bw + 8) - 2, y = p.h - (row + 1) * (bw + 8) - 2
      p.button(c, id, x, y, bw, bw, label, fn || (() => {}), { align: 'center', font: FONT(Math.min(13, bw * 0.2), 700), selected: held.has(HOLD[id]) || o.on })
    }
    // right column: flight; middle: building; left: menus
    btn('up', 'UP', 0, 2); btn('down', 'DOWN', 0, 1); btn('boost', 'BOOST', 0, 0)
    if (P.seat) {
      btn('use', 'LEAVE', 1, 0, () => g.input.tap('use'))
      btn('rollL', 'ROLL L', 2, 2); btn('rollR', 'ROLL R', 1, 2)
      btn('damp', 'DAMP', 1, 1, () => g.input.tap('dampeners'), { on: P.seat.grid.dampeners })
      btn('park', 'GEAR', 2, 1, () => g.input.tap('park'), { on: !!P.seat.grid.locked })
      btn('view', 'VIEW', 2, 0, () => g.input.tap('view'))
      if (P.seat.grid.parts.jumpdrives.length) btn('jump', 'JUMP', 2, 3, () => g.input.tap('jump'))
      if (P.seat.grid.parts.drills.length) btn('place', 'DRILL', 1, 3)
    } else {
      btn('jet', P.jetpack ? 'JET ON' : 'JET', 1, 0, () => g.input.tap('jetpack'), { on: P.jetpack })
      if (g.interactTarget) btn('use', 'USE', 1, 3, () => g.input.tap('use'), { on: true })
      if (B.blockId || B.paste) { btn('place', 'PLACE', 1, 2); btn('remove', 'REMOVE', 1, 1); btn('rot', 'TURN', 2, 2, () => g.builder.rotate('yaw', 1, B.target?.quat || g.engine.camQuat)); btn('tip', 'TIP', 2, 1, () => g.builder.rotate('pitch', 1, B.target?.quat || g.engine.camQuat)); btn('size', B.size === 'large' ? 'LARGE' : 'SMALL', 1, 3, () => g.input.tap('size')) }
      else if (B.tool) { btn('place', B.tool === 'welder' ? 'WELD' : B.tool === 'grinder' ? 'GRIND' : B.tool === 'drill' ? 'DRILL' : 'PAINT', 1, 2) }
      else btn('remove', 'REMOVE', 1, 2)
      btn('inv', 'ITEMS', 2, 3, () => g.input.tap('inventory'))
      btn('cat', 'BLOCKS', 2, 0, () => g.menus.open('catalog'))
    }
    // the menu, top right of the button block
    btn('menu', 'MENU', 0, 3, () => g.menus.open('pause'))
  }
}
