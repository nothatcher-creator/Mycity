// A stand-in for the Project 0 runtime, so VOIDWRIGHT runs as a plain web page (itch.io and the like): the
// renderer, scene and camera, the frame loop, keyboard / mouse / touch events in the shape the game expects,
// pointer lock, sound through Web Audio, and the save kept in this browser's local storage.
import * as THREE from 'three'
import start from './main.js'

const canvas = document.getElementById('view')
const bar = document.getElementById('bar'), label = document.getElementById('label'), cover = document.getElementById('loading')
const base = new URL('.', import.meta.url)
const handlers = new Map()
const emit = (name, e) => { for (const fn of handlers.get(name) || []) { try { fn(e) } catch (err) { console.error(err) } } }

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1e9)

// ---- sound: decoded once, played through one Web Audio context (started by the first click or key) ----
let actx = null
const buffers = new Map(), playing = new Map()
let nextId = 1
const audio = () => { if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC() } if (actx?.state === 'suspended') actx.resume().catch(() => {}); return actx }
const load = path => {
  if (!buffers.has(path)) buffers.set(path, fetch(new URL(path, base)).then(r => r.arrayBuffer()).then(b => new Promise((ok, no) => audio().decodeAudioData(b, ok, no))).catch(() => null))
  return buffers.get(path)
}
const sound = {
  play(path, o = {}) {
    const id = nextId++, ctx = audio()
    if (!ctx) return id
    playing.set(id, { stopped: false })
    load(path).then(buf => {
      const rec = playing.get(id)
      if (!buf || !rec || rec.stopped) { playing.delete(id); return }
      const src = ctx.createBufferSource(), gain = ctx.createGain()
      src.buffer = buf; src.loop = !!o.loop; src.playbackRate.value = o.rate || 1
      gain.gain.value = o.volume ?? 1
      src.connect(gain).connect(ctx.destination)
      src.onended = () => { if (!src.loop) playing.delete(id) }
      src.start(0, o.at || 0)
      rec.src = src
    })
    return id
  },
  stop(id) { const r = playing.get(id); if (!r) return; r.stopped = true; try { r.src?.stop() } catch {} playing.delete(id) },
  pause() {}, resume() {},
  stopAll() { for (const id of [...playing.keys()]) sound.stop(id) }, pauseAll() {}, resumeAll() {},
}

// ---- the save: one record in local storage ----
const KEY = 'voidwright-save'
let saved = null
try { saved = JSON.parse(localStorage.getItem(KEY) || 'null') } catch {}

// ---- input ----
const keys = new Set()
const pointer = { x: 0, y: 0, buttons: 0, locked: false }
const input = {
  keys, pointer, pad: false, gamepad: null,
  isDown: code => keys.has(code),
  lockPointer() { if (document.pointerLockElement !== canvas) { try { const r = canvas.requestPointerLock?.(); if (r?.catch) r.catch(() => {}) } catch {} } },
  unlockPointer() { if (document.pointerLockElement) document.exitPointerLock?.() },
}

const p0 = {
  renderer, scene, camera, input, sound,
  controls: { mode: 'none', vertical: false, enabled: true },
  bodies: { visible: false, get: () => null },
  players: new Map(), me: { id: 1, name: 'You', position: new THREE.Vector3(), yaw: 0 },
  lot: { id: 0, width: 12, depth: 12, height: 19, size: 12, name: 'VOIDWRIGHT' },
  autoRender: true, saved, time: 0,
  get width() { return innerWidth }, get height() { return innerHeight }, get pixelRatio() { return Math.min(2, devicePixelRatio || 1) },
  on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn) },
  loop(fn) { (handlers.get('loop') || handlers.set('loop', []).get('loop')).push(fn) },
  loading(f, text) { if (bar) bar.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'; if (label && text) label.textContent = text },
  hud(text) { const h = document.getElementById('hud'); if (!h) return; h.textContent = text.replace(/ ?Esc leaves the lot\.?/, ' Esc frees the mouse.'); h.style.opacity = 1; setTimeout(() => { h.style.opacity = 0 }, 14000) },
  save(data) { try { localStorage.setItem(KEY, JSON.stringify(data)) } catch {} return Promise.resolve() },
  asset: path => new URL(path, base).href,
  log: (...a) => console.log(...a),
  random: Math.random, exit() {},
  music: { play() {}, stop() {}, volume() {}, seek() {}, time: 0, playing: false, duration: 0 },
}

// keyboard: the game reads KeyboardEvent.code; keys the page would act on (scrolling, Tab) are kept for it
const KEEP = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Backspace', 'F1', 'Quote', 'Slash'])
addEventListener('keydown', e => {
  audio()
  if (KEEP.has(e.code) || (e.ctrlKey && ['KeyC', 'KeyV', 'KeyS', 'KeyD'].includes(e.code))) e.preventDefault()
  keys.add(e.code)
  emit('keydown', { code: e.code, key: e.key, repeat: e.repeat, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey, altKey: e.altKey })
})
addEventListener('keyup', e => { keys.delete(e.code); emit('keyup', { code: e.code, key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey }) })
addEventListener('blur', () => { keys.clear(); pointer.buttons = 0; emit('blur', {}) })

// pointer: x, y in page pixels; dx, dy the movement (from the mouse while locked, from the last position of
// that finger on a touch screen); touch true for fingers
const last = new Map()
const ev = (e, extra = {}) => {
  const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top
  const touch = e.pointerType === 'touch' || e.pointerType === 'pen'
  let dx = e.movementX || 0, dy = e.movementY || 0
  if (touch) { const l = last.get(e.pointerId); dx = l ? x - l.x : 0; dy = l ? y - l.y : 0 }
  pointer.x = x; pointer.y = y; pointer.buttons = e.buttons
  return { x, y, dx, dy, button: e.button, buttons: e.buttons, touch, id: e.pointerId, ...extra }
}
canvas.addEventListener('pointerdown', e => { audio(); const o = ev(e); last.set(e.pointerId, { x: o.x, y: o.y }); if (o.touch) canvas.setPointerCapture?.(e.pointerId); emit('pointerdown', o) })
addEventListener('pointermove', e => { const o = ev(e); if (o.touch) last.set(e.pointerId, { x: o.x, y: o.y }); emit('pointermove', o) })
addEventListener('pointerup', e => { const o = ev(e); last.delete(e.pointerId); emit('pointerup', o) })
addEventListener('pointercancel', e => { const o = ev(e); last.delete(e.pointerId); emit('pointerup', o) })
canvas.addEventListener('wheel', e => { e.preventDefault(); emit('wheel', { dy: e.deltaY, deltaY: e.deltaY, dx: e.deltaX }) }, { passive: false })
canvas.addEventListener('contextmenu', e => e.preventDefault())
document.addEventListener('pointerlockchange', () => { pointer.locked = document.pointerLockElement === canvas; emit('pointerlock', pointer.locked) })
addEventListener('resize', () => emit('resize', { width: innerWidth, height: innerHeight }))

// ---- the frame loop ----
let then = performance.now()
const frame = now => {
  const dt = Math.min(0.25, Math.max(0, (now - then) / 1000)); then = now
  p0.time += dt
  for (const fn of handlers.get('loop') || []) { try { fn(dt, p0.time) } catch (err) { console.error(err) } }
  emit('frame', dt)
  if (p0.autoRender) renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

// ---- go ----
renderer.setPixelRatio(p0.pixelRatio); renderer.setSize(innerWidth, innerHeight, false)
try {
  await start(p0)
  if (cover) { cover.style.opacity = 0; setTimeout(() => cover.remove(), 600) }
  requestAnimationFrame(frame)
} catch (err) {
  console.error(err)
  if (label) label.textContent = 'Could not start: ' + (err?.message || err) + ' (a browser with WebGL 2 is needed)'
}
