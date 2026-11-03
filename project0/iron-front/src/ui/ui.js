// The 2D interface, drawn on canvases shown as quads over the game (the game runs in a worker with no
// page of its own). A Panel is one canvas at a place on screen; it redraws only when asked. Buttons are
// rectangles a panel registers while drawing; pointer events find them.
import * as THREE from 'three'

export const C = {
  bg: 'rgba(14,18,12,0.86)', bg2: 'rgba(28,34,24,0.92)', line: 'rgba(214,190,120,0.35)', gold: '#d9a521', gold2: '#f0c64a',
  text: '#e8e4d4', dim: '#a7a48f', red: '#e0483a', green: '#7bd05a', blue: '#5aa8e0', white: '#ffffff', black: '#000000',
  olive: '#4b5a2e', panel: 'rgba(20,24,18,0.78)', hover: 'rgba(217,165,33,0.22)', sel: 'rgba(217,165,33,0.4)',
}
export const FONT = (px, w = 600) => `${w} ${px}px "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
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
    this.tex.needsUpdate = true
    this.dirty = false
  }
  // Registers a button and draws it (label, optional sub-label); returns its rectangle.
  button(c, id, x, y, w, h, label, fn, o = {}) {
    const hov = this.ui.isHover(this, id) && !o.disabled
    c.fillStyle = o.selected ? C.sel : hov ? C.hover : (o.bg || 'rgba(255,255,255,0.05)')
    c.fillRect(x, y, w, h)
    c.strokeStyle = o.selected || hov ? C.gold : C.line
    c.lineWidth = 1
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
    if (o.selected || hov) { c.fillStyle = C.gold; c.fillRect(x, y, 3, h) }
    c.fillStyle = o.disabled ? C.dim : o.color || C.text
    c.font = o.font || FONT(Math.min(18, h * 0.42), 700)
    c.textBaseline = 'middle'
    c.textAlign = o.align || 'left'
    const tx = o.align === 'center' ? x + w / 2 : x + 14
    c.fillText(label, tx, o.sub ? y + h * 0.36 : y + h / 2, w - 20)
    if (o.sub) { c.fillStyle = C.dim; c.font = FONT(Math.min(13, h * 0.26), 500); c.fillText(o.sub, tx, y + h * 0.7, w - 20) }
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
export function box(c, x, y, w, h, o = {}) {
  c.fillStyle = o.fill || C.panel
  c.fillRect(x, y, w, h)
  if (o.stroke !== false) { c.strokeStyle = o.stroke || C.line; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1) }
}
export function bar(c, x, y, w, h, f, color, o = {}) {
  c.fillStyle = o.back || 'rgba(0,0,0,0.5)'
  c.fillRect(x, y, w, h)
  c.fillStyle = color
  c.fillRect(x, y, Math.max(0, Math.min(1, f)) * w, h)
}
