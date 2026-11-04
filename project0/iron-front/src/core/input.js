// Controls: named actions bound to keys (rebindable, saved with the settings), mouse look (pointer lock,
// or dragging with the right button where the lock is refused), and taps on the touch buttons.
// Enter (chat) and Escape (leave) belong to the city and cannot be bound. Ctrl is avoided by default:
// with W held, Ctrl+W closes the browser tab.
export const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', walk: 'AltLeft',
  jump: 'Space', crouch: 'KeyC', prone: 'KeyZ', leanL: 'KeyQ', leanR: 'KeyE', reload: 'KeyR', interact: 'KeyF',
  view: 'KeyV', inventory: 'Tab', map: 'KeyM', fireMode: 'KeyB', grenade: 'KeyG', melee: 'KeyX',
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4', slot5: 'Digit5',
  zeroUp: 'PageUp', zeroDown: 'PageDown', binoculars: 'KeyO', nvg: 'KeyN', light: 'KeyL', heal: 'KeyH',
  squad: 'KeyT', gear: 'KeyY', gearNext: 'KeyU', pause: 'KeyP', shoulder: 'KeyK', bipod: 'KeyJ', holdBreath: 'ShiftLeft', freeLook: 'Backquote',
  // vehicles
  vUp: 'Space', vDown: 'KeyC', vBoost: 'ShiftLeft', vSeat: 'KeyX', vLight: 'KeyL', vEngine: 'KeyE', vHorn: 'KeyH', vFlares: 'KeyR', vGear: 'KeyG',
}
export const ACTION_NAMES = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', sprint: 'Sprint', walk: 'Walk (slow)',
  jump: 'Jump / vault', crouch: 'Crouch', prone: 'Prone', leanL: 'Lean left', leanR: 'Lean right', reload: 'Reload',
  interact: 'Interact / enter vehicle', view: 'First / third person', inventory: 'Inventory', map: 'Map', fireMode: 'Fire mode',
  grenade: 'Throw grenade', melee: 'Melee', slot1: 'Primary weapon', slot2: 'Launcher', slot3: 'Sidearm', slot4: 'Next grenade (frag, smoke, flash)', slot5: 'Medkit / tool',
  zeroUp: 'Zeroing up', zeroDown: 'Zeroing down', binoculars: 'Binoculars', nvg: 'Night vision', light: 'Flashlight', heal: 'Bandage / heal',
  squad: 'Squad commands', gear: 'Use gear (mine, charge, sandbags, radio)', gearNext: 'Next gear', pause: 'Pause menu', shoulder: 'Switch shoulder', bipod: 'Deploy bipod', freeLook: 'Free look',
  vUp: 'Vehicle: up / collective', vDown: 'Vehicle: down / brake', vBoost: 'Vehicle: boost', vSeat: 'Vehicle: change seat', vLight: 'Vehicle: lights',
  vEngine: 'Vehicle: engine on / off', vHorn: 'Vehicle: horn', vFlares: 'Vehicle: flares', vGear: 'Vehicle: landing gear',
}
const RESERVED = new Set(['Enter', 'NumpadEnter', 'Escape'])
export const keyLabel = code => !code ? '-' : code.replace(/^Key/, '').replace(/^Digit/, '').replace('Left', ' L').replace('Right', ' R').replace('Backquote', '`').replace('Page', 'Pg ')

export class Input {
  constructor(p0) {
    this.p0 = p0
    this.binds = { ...DEFAULT_BINDS }
    this.look = { dx: 0, dy: 0 }
    this.sens = 1
    this.invertY = false
    this.pressed = new Set()     // actions pressed this frame
    this.mouse = { left: false, right: false, wheel: 0 }
    this.touch = false
    this.stick = null
    this.listeners = []
    this.rebinding = null
    p0.on('keydown', e => {
      if (e.repeat) return
      if (this.rebinding) { if (!RESERVED.has(e.code)) { this.binds[this.rebinding.action] = e.code; this.rebinding.done?.(e.code) } this.rebinding = null; return }
      for (const [a, code] of Object.entries(this.binds)) if (code === e.code) this.pressed.add(a)
      this.lastKey = e.code
    })
    p0.on('pointermove', e => {
      if (e.touch) { this.touch = true }
      // (a jump of hundreds of pixels comes with the pointer lock itself in some browsers: not a real movement)
      if (Math.abs(e.dx) > 250 || Math.abs(e.dy) > 250) return
      if (!e.touch && (p0.input.pointer.locked || (e.buttons & 2) || (this.dragLook && (e.buttons & 1)))) {
        this.look.dx += e.dx; this.look.dy += e.dy
      }
    })
    // touches are not mouse buttons: the game reads them as look drags and on-screen buttons (game.js)
    p0.on('pointerdown', e => { if (e.touch) { this.touch = true; return } if (e.button === 0) this.mouse.left = true; if (e.button === 2) this.mouse.right = true })
    p0.on('pointerup', e => { if (e.touch) return; if (e.button === 0) this.mouse.left = false; if (e.button === 2) this.mouse.right = false })
    p0.on('blur', () => { this.stick = null })
    p0.on('wheel', e => { this.mouse.wheel += Math.sign(e.dy || e.deltaY || 0) })
  }
  // the touch stick (core/touch.js) counts as the movement keys, and as sprint when pushed to the rim
  down(action) {
    const s = this.stick
    if (s) { if (action === 'forward' && s.y > 0.35 || action === 'back' && s.y < -0.35 || action === 'right' && s.x > 0.35 || action === 'left' && s.x < -0.35 || action === 'sprint' && Math.hypot(s.x, s.y) > 0.95 && s.y > 0.5) return true }
    const c = this.binds[action]; return !!c && this.p0.input.keys.has(c)
  }
  hit(action) { return this.pressed.has(action) }
  // Read and clear the look movement since the last frame (radians).
  takeLook(scale = 1) {
    const k = 0.0022 * this.sens * scale
    const r = { yaw: -this.look.dx * k, pitch: -this.look.dy * k * (this.invertY ? -1 : 1) }
    this.look.dx = this.look.dy = 0
    return r
  }
  takeWheel() { const w = this.mouse.wheel; this.mouse.wheel = 0; return w }
  endFrame() { this.pressed.clear() }
  conflicts() {
    const by = {}, out = []
    // vehicle keys may share keys with on-foot keys: they apply at different times
    for (const [a, c] of Object.entries(this.binds)) { const g = a.startsWith('v') && a[1] === a[1].toUpperCase() ? 'veh' : 'foot'; const k = g + c; if (by[k] && !(a === 'holdBreath' || by[k] === 'holdBreath' || a === 'sprint' || by[k] === 'sprint')) out.push([by[k], a]); by[k] = a }
    return out
  }
}
