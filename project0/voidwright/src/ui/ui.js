// The 2D interface, drawn on canvases shown as quads over the game (the game runs in a worker with no
// page of its own). A Panel is one canvas at a place on screen; it redraws only when asked. Buttons are
// rectangles a panel registers while drawing; pointer events find them.
import * as THREE from 'three'

import { FONTS } from './fonts-data.js'

// The look: a helmet display. Dark blue-black glass, chamfered corners (top left and bottom right cut), teal
// accents and corner brackets, segmented bars, and Chakra Petch (a squared display face) for headings, buttons and
// numbers; body text stays in the system sans for reading.
export const C = {
  bg: 'rgba(5,11,15,0.86)', bg2: 'rgba(14,26,32,0.92)', line: 'rgba(95,243,230,0.26)', gold: '#3fe0d0', gold2: '#a6fff5',
  text: '#e4f2f2', dim: '#86a2a6', red: '#ff5a45', green: '#7ee07a', blue: '#6ab8ff', white: '#ffffff', black: '#000000',
  olive: '#1d4a4c', panel: 'rgba(5,13,17,0.78)', panelTop: 'rgba(16,32,38,0.86)', hover: 'rgba(63,224,208,0.2)', sel: 'rgba(63,224,208,0.34)',
  amber: '#ffb238', orange: '#ff9a3c', track: 'rgba(255,255,255,0.08)',
}
let displayReady = false
const SANS = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif'
// weight 600 and up: the display face (once loaded); lighter: the system sans
export const FONT = (px, w = 600) => w >= 600 && displayReady ? `${w >= 700 ? 700 : 600} ${px}px "Chakra Petch", ${SANS}` : `${w} ${px}px ${SANS}`
// Loads the embedded display face into the worker; the UI redraws in it when it is ready.
export async function loadFonts(onReady) {
  try {
    const set = self.fonts || globalThis.document?.fonts
    if (!set || typeof FontFace === 'undefined') return false
    for (const f of FONTS) {
      const bin = atob(f.data), buf = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
      const face = new FontFace('Chakra Petch', buf.buffer, { weight: f.weight })
      await face.load(); set.add(face)
    }
    displayReady = true; onReady?.(); return true
  } catch (e) { return false }
}
export const MONO = px => `600 ${px}px "Consolas", "DejaVu Sans Mono", monospace`

export class UI {
  constructor(engine) {
    this.engine = engine
    this.scene = engine.uiScene
    this.panels = []
    this.scale = 1
    this.pointer = { x: -1, y: -1, down: false }
    this.hoverId = null
  }
  // Pixel scale for text: bigger on high-DPI screens, and readable on phones.
  get dpr() { return Math.min(2, (this.engine.p0.pixelRatio || 1)) }
  add(p) { this.panels.push(p); this.scene.add(p.mesh); return p }
  remove(p) { const i = this.panels.indexOf(p); if (i >= 0) this.panels.splice(i, 1); this.scene.remove(p.mesh); p.dispose() }
  // The button under the pointer, topmost visible panel first.
  hit(x, y) {
    for (let i = this.panels.length - 1; i >= 0; i--) {
      const p = this.panels[i]
      if (!p.visible || !p.buttons.length) continue
      const lx = x - p.x, ly = y - p.y
      if (lx < 0 || ly < 0 || lx > p.w || ly > p.h) continue
      for (let j = p.buttons.length - 1; j >= 0; j--) {
        const b = p.buttons[j]
        if (lx >= b.x && ly >= b.y && lx <= b.x + b.w && ly <= b.y + b.h) return { panel: p, button: b }
      }
      if (p.modal) return { panel: p, button: null }
    }
    return null
  }
  move(x, y) {
    this.pointer.x = x; this.pointer.y = y
    const h = this.hit(x, y)
    const id = h?.button ? h.panel.id + ':' + h.button.id : null
    if (id !== this.hoverId) {
      const old = this.hoverId
      this.hoverId = id
      for (const p of this.panels) if ((old && old.startsWith(p.id + ':')) || (id && id.startsWith(p.id + ':'))) p.dirty = true
    }
    return h
  }
  click(x, y) {
    const h = this.hit(x, y)
    if (h?.button?.fn) { h.button.fn(h.button, x - h.panel.x, y - h.panel.y); return true }
    return !!h
  }
  isHover(panel, id) { return this.hoverId === panel.id + ':' + id }
  update() { for (const p of this.panels) if (p.visible && p.dirty && p.draw) p.redraw() }
}

let nextId = 1
// A canvas on screen at (x, y), w x h CSS pixels; `draw(ctx, panel)` paints it (in CSS pixels).
export class Panel {
  constructor(ui, x, y, w, h, draw, o = {}) {
    this.ui = ui; this.id = o.id || 'p' + nextId++
    this.draw = draw
    this.buttons = []
    this.modal = !!o.modal
    this.canvas = new OffscreenCanvas(4, 4)
    this.ctx = this.canvas.getContext('2d')
    this.tex = new THREE.CanvasTexture(this.canvas)
    this.tex.colorSpace = THREE.SRGBColorSpace
    this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false }))
    this.mesh.renderOrder = o.order || 0
    this.mesh.frustumCulled = false
    this.visible = true
    this.place(x, y, w, h)
  }
  place(x, y, w, h) {
    this.x = Math.round(x); this.y = Math.round(y)
    const dpr = this.ui.dpr
    if (w !== this.w || h !== this.h) {
      this.w = Math.max(1, Math.round(w)); this.h = Math.max(1, Math.round(h))
      this.canvas.width = Math.max(1, Math.round(this.w * dpr)); this.canvas.height = Math.max(1, Math.round(this.h * dpr))
      this.tex.dispose()
      this.tex = new THREE.CanvasTexture(this.canvas)
      this.tex.colorSpace = THREE.SRGBColorSpace
      this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false
      this.mesh.material.map = this.tex
      this.dirty = true
    }
    this.mesh.scale.set(this.w, this.h, 1)
    this.mesh.position.set(this.x + this.w / 2, -(this.y + this.h / 2), 0)
    return this
  }
  // (a strict boolean: three.js only skips objects whose visible is exactly false)
  show(v = true) { v = !!v; if (v && !this.visible) this.dirty = true; this.visible = v; this.mesh.visible = v; return this }
  redraw() {
    const c = this.ctx, dpr = this.ui.dpr
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.clearRect(0, 0, this.w, this.h)
    this.buttons = []
    this.draw(c, this)
    // a canvas left completely empty was not sent again, so the old picture stayed on screen (a prompt
    // still showing after you got in): one all-but-invisible pixel makes every redraw count
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = 'rgba(0,0,0,0.004)'; c.fillRect(0, 0, 1, 1)
    this.tex.needsUpdate = true
    this.dirty = false
  }
  // Registers a button and draws it (label, optional sub-label); returns its rectangle.
  button(c, id, x, y, w, h, label, fn, o = {}) {
    const hov = this.ui.isHover(this, id) && !o.disabled, on = o.selected || hov
    const k = Math.min(10, h * 0.28)
    chamfer(c, x, y, w, h, k)
    const gr = c.createLinearGradient(0, y, 0, y + h)
    if (o.selected) { gr.addColorStop(0, 'rgba(63,224,208,0.42)'); gr.addColorStop(1, 'rgba(63,224,208,0.22)') }
    else if (hov) { gr.addColorStop(0, 'rgba(63,224,208,0.26)'); gr.addColorStop(1, 'rgba(63,224,208,0.1)') }
    else { gr.addColorStop(0, o.bg || 'rgba(18,32,38,0.78)'); gr.addColorStop(1, o.bg || 'rgba(7,13,17,0.82)') }
    c.fillStyle = gr; c.fill()
    c.strokeStyle = on ? C.gold : C.line; c.lineWidth = 1; c.stroke()
    // an accent bar on the left, and a chevron for the menus' big buttons
    if (on && o.align !== 'center') { c.fillStyle = C.gold; c.fillRect(x + 1, y + k, 3, h - k * 1.6) }
    if (o.arrow && !o.disabled) { c.strokeStyle = on ? C.gold2 : 'rgba(228,242,242,0.4)'; c.lineWidth = 2; const ax = x + w - 18, ay = y + h / 2; c.beginPath(); c.moveTo(ax - 4, ay - 6); c.lineTo(ax + 2, ay); c.lineTo(ax - 4, ay + 6); c.stroke() }
    c.fillStyle = o.disabled ? 'rgba(134,162,166,0.6)' : o.color || (o.selected ? C.gold2 : C.text)
    c.font = o.font || FONT(Math.min(18, h * 0.42), 700)
    c.textBaseline = 'middle'
    c.textAlign = o.align || 'left'
    const tx = o.align === 'center' ? x + w / 2 : x + 16 + (o.indent || 0), tw = w - (o.arrow ? 44 : 22) - (o.indent || 0)
    c.fillText(label, tx, o.sub ? y + h * 0.37 : y + h / 2 + 1, tw)
    if (o.sub) { c.fillStyle = C.dim; c.font = FONT(Math.min(12.5, h * 0.25), 500); if (o.wrapSub) { const words = o.sub.split(' '); let line = '', ly = y + h * 0.62; for (const wd of words) { const t2 = line ? line + ' ' + wd : wd; if (c.measureText(t2).width > tw && line) { c.fillText(line, tx, ly, tw); line = wd; ly += 14; if (ly > y + h - 6) { line = ''; break } } else line = t2 } if (line) c.fillText(line, tx, ly, tw) } else c.fillText(o.sub, tx, y + h * 0.71, tw) }
    c.textAlign = 'left'
    const b = { id, x, y, w, h, fn: o.disabled ? null : fn, data: o.data }
    this.buttons.push(b)
    return b
  }
  dispose() { this.tex.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose() }
}

// Text helpers for canvases.
export function text(c, s, x, y, o = {}) {
  c.font = o.font || FONT(o.size || 14, o.weight || 600)
  c.fillStyle = o.color || C.text
  c.textAlign = o.align || 'left'
  c.textBaseline = o.base || 'alphabetic'
  if (o.shadow) { c.save(); c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillText(s, x + 1, y + 1, o.max); c.restore(); c.fillStyle = o.color || C.text }
  c.fillText(s, x, y, o.max)
  c.textAlign = 'left'
}
export function wrap(c, s, x, y, w, lh, o = {}) {
  c.font = o.font || FONT(o.size || 14, o.weight || 500)
  c.fillStyle = o.color || C.text
  c.textBaseline = 'alphabetic'
  const words = String(s).split(' ')
  let line = '', yy = y
  for (const wd of words) {
    const t = line ? line + ' ' + wd : wd
    if (c.measureText(t).width > w && line) { c.fillText(line, x, yy); line = wd; yy += lh } else line = t
  }
  if (line) { c.fillText(line, x, yy); yy += lh }
  return yy
}
// A path with the top-left and bottom-right corners cut by k.
export function chamfer(c, x, y, w, h, k = 8) {
  k = Math.min(k, w / 3, h / 3)
  c.beginPath(); c.moveTo(x + k, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h - k); c.lineTo(x + w - k, y + h); c.lineTo(x, y + h); c.lineTo(x, y + k); c.closePath()
}
// A panel: chamfered glass with a lighter top, a hairline edge and amber brackets on two corners.
export function box(c, x, y, w, h, o = {}) {
  const k = o.cut ?? Math.min(12, h * 0.2)
  chamfer(c, x + 0.5, y + 0.5, w - 1, h - 1, k)
  if (o.fill) c.fillStyle = o.fill
  else { const gr = c.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, C.panelTop); gr.addColorStop(0.35, C.panel); gr.addColorStop(1, 'rgba(4,9,12,0.86)'); c.fillStyle = gr }
  c.fill()
  if (o.stroke !== false) { c.strokeStyle = o.stroke || C.line; c.lineWidth = 1; c.stroke() }
  if (o.ticks !== false && w > 40 && h > 24) {
    const L = Math.min(14, w * 0.1, h * 0.3)
    c.strokeStyle = o.accent || C.gold; c.lineWidth = 2
    c.beginPath(); c.moveTo(x + w - L, y + 1); c.lineTo(x + w - 1, y + 1); c.lineTo(x + w - 1, y + L); c.stroke()
    c.beginPath(); c.moveTo(x + 1, y + h - L); c.lineTo(x + 1, y + h - 1); c.lineTo(x + L, y + h - 1); c.stroke()
  }
}
// A bar in segments (ten by default), on a faint track, with a bright leading edge.
export function bar(c, x, y, w, h, f, color, o = {}) {
  f = Math.max(0, Math.min(1, f))
  c.fillStyle = o.back || C.track; c.fillRect(x, y, w, h)
  const n = o.segments ?? (w > 60 ? 10 : 0), gap = n ? Math.max(1, w * 0.008) : 0
  c.fillStyle = color
  if (!n) { c.fillRect(x, y, f * w, h); return }
  const sw = (w - gap * (n - 1)) / n
  for (let i = 0; i < n; i++) {
    const s0 = i / n, part = Math.max(0, Math.min(1, (f - s0) * n))
    if (part <= 0) break
    c.fillRect(x + i * (sw + gap), y, sw * part, h)
  }
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x, y, f * w, Math.max(1, h * 0.3))
}
// A section heading: amber text, a short bar before it and a hairline after.
export function header(c, label, x, y, w, s = 1, o = {}) {
  c.fillStyle = o.color || C.gold; c.fillRect(x, y - 9 * s, 3 * s, 11 * s)
  text(c, label, x + 9 * s, y, { size: (o.size || 12) * s, weight: 700, color: o.color || C.gold })
  c.font = FONT((o.size || 12) * s, 700); const tw = c.measureText(label).width
  c.fillStyle = C.line; c.fillRect(x + 16 * s + tw, y - 4 * s, Math.max(0, w - tw - 16 * s), 1)
}
// A small labelled tag (key hints, fire mode, counts).
export function chip(c, label, x, y, h, o = {}) {
  c.font = FONT(o.size || h * 0.55, 700)
  const w = c.measureText(label).width + h * 0.9
  const X = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x
  chamfer(c, X, y, w, h, h * 0.3)
  c.fillStyle = o.fill || 'rgba(63,224,208,0.16)'; c.fill()
  c.strokeStyle = o.stroke || 'rgba(63,224,208,0.6)'; c.lineWidth = 1; c.stroke()
  c.fillStyle = o.color || C.gold2; c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillText(label, X + w / 2, y + h / 2 + 1); c.textAlign = 'left'
  return w
}
// Line icons drawn in a size x size square at (x, y): cross, bolt, bullet, grenade, gear, map, bag,
// eye, menu, jump, hand, stance (stand/crouch/prone), reload, aim, seat, exit, up, down, flare.
export function icon(c, name, x, y, size, color = C.text, o = {}) {
  const s = size / 24
  c.save(); c.translate(x, y); c.scale(s, s)
  c.strokeStyle = color; c.fillStyle = color; c.lineWidth = o.width || 2; c.lineCap = 'round'; c.lineJoin = 'round'
  const P = (...pts) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]) }
  switch (name) {
    case 'cross': c.fillRect(9, 3, 6, 18); c.fillRect(3, 9, 18, 6); break
    case 'bolt': P(14, 2, 5, 14, 11, 14, 9, 22, 19, 9, 13, 9, 14, 2); c.fill(); break
    case 'bullet': P(9, 22, 9, 9, 12, 3, 15, 9, 15, 22); c.closePath(); c.stroke(); c.fillRect(8, 18, 8, 2); break
    case 'grenade': c.beginPath(); c.arc(12, 14, 7, 0, Math.PI * 2); c.stroke(); c.fillRect(9, 4, 6, 4); P(15, 6, 20, 3); c.stroke(); break
    case 'gear': c.strokeRect(4, 7, 16, 13); P(9, 7, 9, 4, 15, 4, 15, 7); c.stroke(); P(4, 12, 20, 12); c.stroke(); break
    case 'map': P(3, 6, 9, 3, 15, 6, 21, 3, 21, 18, 15, 21, 9, 18, 3, 21); c.closePath(); c.stroke(); P(9, 3, 9, 18); c.stroke(); P(15, 6, 15, 21); c.stroke(); break
    case 'bag': c.strokeRect(5, 8, 14, 13); P(9, 8, 9, 4, 15, 4, 15, 8); c.stroke(); c.fillRect(9, 13, 6, 3); break
    case 'eye': c.beginPath(); c.ellipse(12, 12, 9, 5.5, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(12, 12, 2.5, 0, Math.PI * 2); c.fill(); break
    case 'menu': for (const yy of [6, 12, 18]) c.fillRect(4, yy - 1, 16, 2.4); break
    case 'jump': P(5, 13, 12, 6, 19, 13); c.stroke(); P(5, 20, 12, 13, 19, 20); c.stroke(); break
    case 'hand': P(7, 21, 7, 11, 9, 11, 9, 5, 11, 5, 11, 11, 13, 4, 15, 4, 15, 11, 17, 7, 19, 8, 18, 16, 15, 21); c.closePath(); c.stroke(); break
    case 'stand': c.beginPath(); c.arc(12, 4.5, 2.5, 0, Math.PI * 2); c.fill(); P(12, 8, 12, 15, 9, 22); c.stroke(); P(12, 15, 15, 22); c.stroke(); P(7, 11, 17, 11); c.stroke(); break
    case 'crouch': c.beginPath(); c.arc(11, 7, 2.5, 0, Math.PI * 2); c.fill(); P(11, 10, 13, 16, 9, 18, 9, 22); c.stroke(); P(13, 16, 17, 22); c.stroke(); P(7, 13, 16, 12); c.stroke(); break
    case 'prone': c.beginPath(); c.arc(20, 15, 2.5, 0, Math.PI * 2); c.fill(); P(17, 17, 4, 18); c.stroke(); P(14, 17, 13, 21); c.stroke(); break
    case 'reload': c.beginPath(); c.arc(12, 12, 7, -0.6, Math.PI * 1.5); c.stroke(); P(12, 1.5, 12, 5, 15, 5); c.stroke(); break
    case 'aim': c.beginPath(); c.arc(12, 12, 7, 0, Math.PI * 2); c.stroke(); P(12, 1, 12, 7); c.stroke(); P(12, 17, 12, 23); c.stroke(); P(1, 12, 7, 12); c.stroke(); P(17, 12, 23, 12); c.stroke(); break
    case 'seat': P(7, 3, 7, 15, 18, 15, 18, 21); c.stroke(); P(7, 15, 6, 21); c.stroke(); break
    case 'exit': c.strokeRect(4, 4, 10, 16); P(10, 12, 21, 12); c.stroke(); P(17, 8, 21, 12, 17, 16); c.stroke(); break
    case 'up': P(5, 16, 12, 8, 19, 16); c.stroke(); break
    case 'down': P(5, 8, 12, 16, 19, 8); c.stroke(); break
    case 'flare': for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P(12 + Math.cos(a) * 3, 12 + Math.sin(a) * 3, 12 + Math.cos(a) * 9, 12 + Math.sin(a) * 9); c.stroke() } break
    case 'fire': c.beginPath(); c.arc(12, 12, 8, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(12, 12, 3, 0, Math.PI * 2); c.fill(); break
    case 'alt': P(4, 20, 4, 12, 12, 4, 20, 12, 20, 20); c.stroke(); P(12, 9, 12, 20); c.stroke(); break
    case 'view': c.strokeRect(3, 6, 18, 12); c.beginPath(); c.arc(12, 12, 3, 0, Math.PI * 2); c.stroke(); break
  }
  c.restore()
}
