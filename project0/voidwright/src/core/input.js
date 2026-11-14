// Controls: named actions bound to keys (rebindable, saved with the settings), mouse look (pointer lock, or
// dragging with the right button where the lock is refused), and the touch controls (core/touch.js).
// Enter (chat) and Escape (leave) belong to the city and cannot be bound. Ctrl is only read held with a
// click or with C / V (Ctrl + W would close the browser tab).
export const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', up: 'Space', down: 'KeyC', rollL: 'KeyQ', rollR: 'KeyE',
  sprint: 'ShiftLeft', jetpack: 'KeyX', dampeners: 'KeyZ', use: 'KeyF', light: 'KeyL', view: 'KeyV',
  catalog: 'KeyG', terminal: 'KeyK', pause: 'Tab', help: 'F1', size: 'KeyR', gridType: 'KeyB', palette: 'KeyP', park: 'KeyP',
  blueprints: 'KeyH', inventory: 'KeyI', jump: 'KeyJ', freeLook: 'AltLeft', map: 'KeyM', hideUi: 'KeyO',
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4', slot5: 'Digit5', slot6: 'Digit6', slot7: 'Digit7', slot8: 'Digit8', slot9: 'Digit9', slot0: 'Digit0',
  // turning the block in your hands (and the same on keys every keyboard has)
  rotRollL: 'PageUp', rotRollR: 'PageDown', rotPitchU: 'Home', rotPitchD: 'End', rotYawL: 'Insert', rotYawR: 'Delete',
  rotRollL2: 'BracketLeft', rotRollR2: 'BracketRight', rotPitchU2: 'Semicolon', rotPitchD2: 'Quote', rotYawL2: 'Comma', rotYawR2: 'Period',
}
export const ACTION_NAMES = {
  forward: 'Forward', back: 'Back', left: 'Strafe left', right: 'Strafe right', up: 'Up / jump', down: 'Down / crouch', rollL: 'Roll left', rollR: 'Roll right',
  sprint: 'Sprint / boost', jetpack: 'Jetpack on/off', dampeners: 'Inertia dampeners on/off', use: 'Use / enter / leave seat', light: 'Helmet light / ship lights', view: 'First / third person / ship cameras',
  catalog: 'Block catalog', terminal: 'Terminal (grid control)', pause: 'Game menu', help: 'Controls', size: 'Large / small block', gridType: 'New grid: ship or station', palette: 'Colour palette', park: 'Ship: lock landing gear',
  blueprints: 'Blueprints (spawn a design)', inventory: 'Inventory and cargo', jump: 'Ship: jump drive', freeLook: 'Free look', map: 'Map and waypoints', hideUi: 'Hide the interface (for pictures)',
  slot1: 'Toolbar 1', slot2: 'Toolbar 2', slot3: 'Toolbar 3', slot4: 'Toolbar 4', slot5: 'Toolbar 5', slot6: 'Toolbar 6', slot7: 'Toolbar 7', slot8: 'Toolbar 8', slot9: 'Toolbar 9', slot0: 'Empty hands',
  rotRollL: 'Rotate block: roll left', rotRollR: 'Rotate block: roll right', rotPitchU: 'Rotate block: tip up', rotPitchD: 'Rotate block: tip down', rotYawL: 'Rotate block: turn left', rotYawR: 'Rotate block: turn right',
  rotRollL2: 'Rotate block: roll left (alt)', rotRollR2: 'Rotate block: roll right (alt)', rotPitchU2: 'Rotate block: tip up (alt)', rotPitchD2: 'Rotate block: tip down (alt)', rotYawL2: 'Rotate block: turn left (alt)', rotYawR2: 'Rotate block: turn right (alt)',
}
// actions that share a key on purpose (they apply in different places)
const SHARED = [['palette', 'park']]
const RESERVED = new Set(['Enter', 'NumpadEnter', 'Escape'])
export const keyLabel = code => !code ? '-' : code.replace(/^Key/, '').replace(/^Digit/, '').replace('Left', ' L').replace('Right', ' R').replace('Backquote', '`').replace('Page', 'Pg ').replace('Bracket', '').replace('Semicolon', ';').replace('Quote', "'").replace('Comma', ',').replace('Period', '.').replace('Delete', 'Del').replace('Insert', 'Ins')

export class Input {
  constructor(p0) {
    this.p0 = p0
    this.binds = { ...DEFAULT_BINDS }
    this.look = { dx: 0, dy: 0 }
    this.sens = 1
    this.invertY = false
    this.pressed = new Set()
    this.mouse = { left: false, right: false, middle: false, wheel: 0, leftHit: false, rightHit: false, middleHit: false, leftUp: false }
    this.touch = false
    this.stick = null
    this.rebinding = null
    this.virtual = new Set()       // actions held by touch buttons
    p0.on('keydown', e => {
      if (e.repeat) return
      if (this.rebinding) { if (!RESERVED.has(e.code)) { this.binds[this.rebinding.action] = e.code; this.rebinding.done?.(e.code) } this.rebinding = null; return }
      for (const [a, code] of Object.entries(this.binds)) if (code === e.code) this.pressed.add(a)
      this.lastKey = e.code
      this.keyHits = this.keyHits || new Set(); this.keyHits.add(e.code)
    })
    p0.on('pointermove', e => {
      if (e.touch) { this.touch = true; return }
      if (Math.abs(e.dx) > 250 || Math.abs(e.dy) > 250) return
      if (typeof e.buttons === 'number') { this.mouse.left = !!(e.buttons & 1); this.mouse.right = !!(e.buttons & 2); this.mouse.middle = !!(e.buttons & 4) }
      if (p0.input.pointer.locked || (e.buttons & 2)) { this.look.dx += e.dx; this.look.dy += e.dy }
    })
    p0.on('pointerdown', e => {
      if (e.touch) { this.touch = true; return }
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftHit = true }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightHit = true }
      if (e.button === 1) { this.mouse.middle = true; this.mouse.middleHit = true }
    })
    p0.on('pointerup', e => { if (e.touch) return; if (e.button === 0) { this.mouse.left = false; this.mouse.leftUp = true } if (e.button === 2) this.mouse.right = false; if (e.button === 1) this.mouse.middle = false })
    p0.on('blur', () => { this.stick = null; this.mouse.left = this.mouse.right = this.mouse.middle = false })
    p0.on('wheel', e => { this.mouse.wheel += Math.sign(e.dy || e.deltaY || 0) })
  }
  key(code) { return this.p0.input.keys.has(code) }
  get ctrl() { return this.key('ControlLeft') || this.key('ControlRight') || this.key('MetaLeft') }
  get shift() { return this.key('ShiftLeft') || this.key('ShiftRight') }
  // the touch stick counts as the movement keys
  down(action) {
    if (this.virtual.has(action)) return true
    const s = this.stick
    if (s) { if (action === 'forward' && s.y > 0.35 || action === 'back' && s.y < -0.35 || action === 'right' && s.x > 0.35 || action === 'left' && s.x < -0.35 || action === 'sprint' && Math.hypot(s.x, s.y) > 0.95 && s.y > 0.5) return true }
    const c = this.binds[action]; return !!c && this.p0.input.keys.has(c)
  }
  // analogue axis from two actions (the stick gives fractions)
  axis(neg, pos) {
    const s = this.stick
    if (s && (neg === 'left' || neg === 'back')) { const v = neg === 'left' ? s.x : s.y; if (Math.abs(v) > 0.12) return Math.max(-1, Math.min(1, v * 1.25)) }
    return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0)
  }
  hit(action) { return this.pressed.has(action) }
  tap(action) { this.pressed.add(action) }
  takeLook(scale = 1) {
    const k = 0.0022 * this.sens * scale
    const r = { yaw: -this.look.dx * k, pitch: -this.look.dy * k * (this.invertY ? -1 : 1) }
    this.look.dx = this.look.dy = 0
    return r
  }
  takeWheel() { const w = this.mouse.wheel; this.mouse.wheel = 0; return w }
  endFrame() { this.pressed.clear(); this.keyHits?.clear(); this.mouse.leftHit = this.mouse.rightHit = this.mouse.middleHit = this.mouse.leftUp = false }
  conflicts() {
    const by = {}, out = []
    for (const [a, c] of Object.entries(this.binds)) {
      if (by[c] && !SHARED.some(([x, y]) => (x === a && y === by[c]) || (y === a && x === by[c]))) out.push([by[c], a])
      by[c] = a
    }
    return out
  }
}
