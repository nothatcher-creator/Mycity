// Menus: the title screen, setting up a game, settings and key bindings, the pause menu, the sandbox
// tools, the respawn screen and the squad orders. One full-screen panel; each page draws its own
// buttons. Works with the mouse and with taps.
import { Panel, C, FONT, text, wrap, box, bar } from './ui.js'
import { ACTION_NAMES, DEFAULT_BINDS, keyLabel } from '../core/input.js'
import { QUALITY } from '../core/engine.js'
import { MODE_INFO } from '../game/modes/index.js'
import { FACTIONS } from '../actors/factions.js'
import { PLACES } from '../world/blueprint.js'
import { POINTS } from '../world/places.js'
import { VEHICLES } from '../vehicles/vehicle-data.js'
import { WEAPONS, CATEGORIES } from '../combat/weapons-data.js'
import { WEATHER } from '../world/sky.js'
import { mapImage } from './mapimage.js'
import { CONTROL } from '../game/modes/freeroam.js'

export class Menus {
  constructor(game) {
    this.g = game
    this.page = null
    this.stack = []
    this.scroll = 0
    this.setup = { faction: 'vdf', start: 'kaldor', squad: 3, hour: 9.5, weather: 'clear', role: 'rifleman' }
    this.panel = game.ui.add(new Panel(game.ui, 0, 0, 10, 10, (c, p) => this.draw(c, p), { modal: true, order: 20 }))
    this.panel.show(false)
    this.layout()
  }
  get visible() { return this.panel.visible }
  layout() { const e = this.g.engine; this.panel.place(0, 0, e.width, e.height); this.s = Math.max(0.42, Math.min(1.2, Math.min(e.width / 1280, e.height / 720))) }
  open(page, keepStack = false) {
    if (this.page && keepStack) this.stack.push(this.page); else if (!keepStack) this.stack = []
    this.page = page; this.scroll = 0; this.rebinding = null
    this.panel.show(true); this.panel.dirty = true
    this.g.p0.input.unlockPointer()
  }
  back() { const p = this.stack.pop(); if (p) { this.page = p; this.scroll = 0; this.panel.dirty = true } else if (this.g.state === 'paused') this.g.resume(); else if (this.page !== 'main' && this.g.state === 'menu') this.open('main'); else this.close() }
  close() {
    this.panel.show(false); this.page = null; this.stack = []
    if (this.g.state === 'play' && !this.g.input.touch && !this.g.map.visible && !this.g.invui.visible) this.g.p0.input.lockPointer()
  }
  wheel(dy) { this.scroll = Math.max(0, this.scroll + Math.sign(dy) * 60); this.panel.dirty = true }
  toggleSquad() { if (this.page === 'squad') this.close(); else this.open('squad') }
  update(dt) { this.t = (this.t || 0) + dt; if (this.page === 'main' && Math.floor(this.t * 2) !== this.lastBlink) { this.lastBlink = Math.floor(this.t * 2); this.panel.dirty = true } }
  // ---------- drawing ----------
  draw(c, p) {
    const W = p.w, H = p.h, s = this.s
    const fn = this['page_' + this.page]
    const overGame = this.g.state !== 'menu'
    c.fillStyle = overGame ? 'rgba(8,10,7,0.72)' : 'rgba(8,10,7,0.35)'
    c.fillRect(0, 0, W, H)
    if (fn) fn.call(this, c, p, W, H, s)
  }
  // A column of big buttons at (x, y).
  column(c, p, x, y, w, items, s) {
    const h = 46 * s, gap = 8 * s
    for (const it of items) {
      if (!it) { y += gap * 2; continue }
      p.button(c, it.id, x, y, w, h, it.label, it.fn, { sub: it.sub, disabled: it.disabled, selected: it.selected, font: FONT(17 * s, 800) })
      y += h + gap
    }
    return y
  }
  title(c, x, y, s, big = true) {
    text(c, 'OPERATION:', x, y, { size: (big ? 22 : 15) * s, weight: 800, color: C.gold, shadow: true })
    text(c, 'IRON FRONT', x, y + (big ? 52 : 32) * s, { size: (big ? 56 : 32) * s, weight: 900, color: C.text, shadow: true })
    text(c, 'OPEN WORLD MILITARY WARFARE', x + 2 * s, y + (big ? 78 : 50) * s, { size: (big ? 13 : 10) * s, weight: 700, color: C.dim, shadow: true })
  }
  // small option rows: label + choices
  choices(c, p, x, y, w, label, opts, cur, set, s) {
    text(c, label, x, y + 18 * s, { size: 14 * s, weight: 700, color: C.dim })
    const bx = x + 150 * s, bw = (w - 150 * s - (opts.length - 1) * 6 * s) / opts.length
    opts.forEach((o, i) => p.button(c, label + i, bx + i * (bw + 6 * s), y, bw, 30 * s, o.label, () => { set(o.v); this.panel.dirty = true }, { selected: o.v === cur, align: 'center', font: FONT(13 * s, 700) }))
    return y + 38 * s
  }
  page_main(c, p, W, H, s) {
    const x = 60 * s
    this.title(c, x, 90 * s, s)
    const fr = this.g.save.data.freeroam
    const items = [
      fr ? { id: 'cont', label: 'CONTINUE FREE ROAM', sub: `${FACTIONS[fr.faction]?.short || ''} · ${(fr.liberated || []).length} places liberated`, fn: () => this.g.start('freeroam', { resume: true, squad: this.setup.squad }) } : null,
      { id: 'fr', label: 'FREE ROAM', sub: MODE_INFO[0].desc, fn: () => this.open('freeroam', true) },
      null,
      { id: 'settings', label: 'SETTINGS', fn: () => this.open('settings', true) },
      { id: 'controls', label: 'CONTROLS', fn: () => this.open('controls', true) },
      { id: 'about', label: 'HOW TO PLAY & CREDITS', fn: () => this.open('about', true) },
    ].filter((v, i) => v || i === 2)
    this.column(c, p, x, 200 * s, Math.min(420 * s, W - x * 2), items, s)
    if (Math.floor((this.t || 0) * 2) % 2 === 0) text(c, 'PRESS SPACE TO DEPLOY  ·  or click to choose', x, H - 30 * s, { size: 14 * s, weight: 800, color: C.gold2, shadow: true })
    text(c, 'Single player. Built for Project 0 lot 3084.', W - 20 * s, H - 30 * s, { size: 11 * s, color: C.dim, align: 'right', shadow: true })
  }
  page_freeroam(c, p, W, H, s) {
    const x = 60 * s, w = Math.min(640 * s, W - x * 2)
    this.title(c, x, 50 * s, s, false)
    let y = 130 * s
    text(c, 'FREE ROAM', x, y, { size: 22 * s, weight: 800, color: C.gold2 }); y += 16 * s
    const st = this.setup
    y = this.choices(c, p, x, y, w, 'Side', Object.values(FACTIONS).map(f => ({ label: f.short, v: f.id })), st.faction, v => { st.faction = v; if (!this.startsFor(v).includes(st.start)) st.start = this.startsFor(v)[0] }, s)
    text(c, FACTIONS[st.faction].name, x + 150 * s, y + 2 * s, { size: 12 * s, color: C.dim }); y += 16 * s
    const starts = this.startsFor(st.faction)
    y = this.choices(c, p, x, y, w, 'Start at', starts.slice(0, 5).map(id => ({ label: PLACES.find(q => q.id === id).name.replace(' Airbase', ''), v: id })), st.start, v => { st.start = v }, s)
    y = this.choices(c, p, x, y, w, 'Your squad', [0, 3, 5].map(n => ({ label: n ? `${n} soldiers` : 'Alone', v: n })), st.squad, v => { st.squad = v }, s)
    y = this.choices(c, p, x, y, w, 'Your role', ['rifleman', 'autorifleman', 'marksman', 'at', 'medic', 'sniper'].map(r => ({ label: { rifleman: 'Rifle', autorifleman: 'Auto', marksman: 'DMR', at: 'AT', medic: 'Medic', sniper: 'Sniper' }[r], v: r })), st.role, v => { st.role = v }, s)
    y = this.choices(c, p, x, y, w, 'Time', [[6, 'Dawn'], [9.5, 'Morning'], [14, 'Afternoon'], [19, 'Dusk'], [23, 'Night']].map(([v, l]) => ({ label: l, v })), st.hour, v => { st.hour = v }, s)
    y = this.choices(c, p, x, y, w, 'Weather', Object.entries(WEATHER).map(([k, v]) => ({ label: v.name, v: k })), st.weather, v => { st.weather = v }, s)
    y = this.choices(c, p, x, y, w, 'Difficulty', [[0.25, 'Recruit'], [0.5, 'Regular'], [0.8, 'Veteran']].map(([v, l]) => ({ label: l, v })), this.g.settings.difficulty, v => { this.g.settings.difficulty = v; this.g.save.store() }, s)
    y += 10 * s
    p.button(c, 'go', x, y, 260 * s, 50 * s, 'DEPLOY', () => { if (this.g.save.data.freeroam && st.faction !== this.g.save.data.freeroam.faction) this.g.save.data.freeroam = null; this.g.start('freeroam', { ...st }) }, { font: FONT(20 * s, 900), color: C.gold2 })
    p.button(c, 'back', x + 274 * s, y, 140 * s, 50 * s, 'BACK', () => this.back(), { align: 'center' })
    // the island map with the start marked
    const img = mapImage(), ms = Math.min(H - 120 * s, W - x - w - 80 * s)
    if (img && ms > 160) {
      const mx = W - ms - 40 * s, my = 60 * s
      c.drawImage(img, mx, my, ms, ms); c.strokeStyle = C.line; c.strokeRect(mx, my, ms, ms)
      for (const pl of PLACES) {
        const side = CONTROL[pl.id]; if (!side) continue
        const px = mx + (pl.x + 6000) / 12000 * ms, py = my + (pl.z + 6000) / 12000 * ms
        c.fillStyle = FACTIONS[side].color; c.fillRect(px - 4, py - 4, 8, 8)
        if (pl.id === st.start) { c.strokeStyle = C.gold2; c.lineWidth = 2; c.beginPath(); c.arc(px, py, 10, 0, Math.PI * 2); c.stroke() }
        if (ms > 300 && (pl.kind === 'city' || pl.kind === 'airport' || pl.id === st.start)) text(c, pl.name, px + 8, py + 4, { size: 11 * s, color: '#fff', shadow: true, weight: 700 })
      }
      text(c, 'Squares: who holds each place', mx, my + ms + 18 * s, { size: 11 * s, color: C.dim })
    }
  }
  startsFor(f) {
    const own = Object.entries(CONTROL).filter(([id, side]) => side === f && POINTS.some(pt => pt.kind === 'spawn' && pt.place === id)).map(([id]) => id)
    return own.length ? own : ['kaldor']
  }
  page_settings(c, p, W, H, s) {
    const g = this.g, st = g.settings, x = 60 * s, w = Math.min(680 * s, W - x * 2)
    let y = 50 * s - this.scroll
    text(c, 'SETTINGS', x, y + 30 * s, { size: 28 * s, weight: 900 }); y += 56 * s
    y = this.choices(c, p, x, y, w, 'Graphics', Object.entries(QUALITY).map(([k, q]) => ({ label: q.name, v: k })), st.quality, v => g.setQuality(v, true), s)
    text(c, 'Low is for slow machines (no grass, shorter view, fewer soldiers near you).', x + 150 * s, y + 2 * s, { size: 11 * s, color: C.dim }); y += 18 * s
    const step = (label, val, fmt, dec, inc) => {
      text(c, label, x, y + 18 * s, { size: 14 * s, weight: 700, color: C.dim })
      p.button(c, label + '-', x + 150 * s, y, 44 * s, 30 * s, '-', () => { dec(); g.save.store(); this.panel.dirty = true }, { align: 'center' })
      text(c, fmt(val), x + 250 * s, y + 20 * s, { size: 15 * s, align: 'center', weight: 700 })
      p.button(c, label + '+', x + 306 * s, y, 44 * s, 30 * s, '+', () => { inc(); g.save.store(); this.panel.dirty = true }, { align: 'center' })
      y += 38 * s
    }
    step('Field of view', st.fov, v => `${v}°`, () => { st.fov = Math.max(55, st.fov - 5) }, () => { st.fov = Math.min(100, st.fov + 5) })
    step('Mouse speed', st.sens, v => v.toFixed(2), () => { st.sens = Math.max(0.2, +(st.sens - 0.1).toFixed(2)); g.input.sens = st.sens }, () => { st.sens = Math.min(3, +(st.sens + 0.1).toFixed(2)); g.input.sens = st.sens })
    step('Volume', st.volume, v => `${Math.round(v * 100)}%`, () => { st.volume = Math.max(0, +(st.volume - 0.1).toFixed(1)) }, () => { st.volume = Math.min(1, +(st.volume + 0.1).toFixed(1)) })
    step('Minimap range', st.minimapRange, v => `${v} m`, () => { st.minimapRange = Math.max(100, st.minimapRange - 100) }, () => { st.minimapRange = Math.min(1000, st.minimapRange + 100) })
    const tog = (label, cur, set) => { y = this.choices(c, p, x, y, w, label, [{ label: 'On', v: true }, { label: 'Off', v: false }], cur, v => { set(v); g.save.store() }, s) }
    tog('Invert mouse Y', st.invertY, v => { st.invertY = v; g.input.invertY = v })
    tog('Flight assist', st.flightAssist, v => { st.flightAssist = v })
    y = this.choices(c, p, x, y, w, 'Default view', [{ label: 'First person', v: 'fp' }, { label: 'Third person', v: 'tp' }], st.view, v => { st.view = v; g.save.store() }, s)
    tog('Compass', st.hud.compass, v => { st.hud.compass = v })
    tog('Minimap', st.hud.minimap, v => { st.hud.minimap = v })
    tog('Weapon panel', st.hud.weapon, v => { st.hud.weapon = v })
    tog('Crosshair', st.hud.crosshair, v => { st.hud.crosshair = v })
    y += 8 * s
    p.button(c, 'back', x, y, 200 * s, 46 * s, 'BACK', () => this.back(), { align: 'center' })
  }
  page_controls(c, p, W, H, s) {
    const g = this.g, inp = g.input, x = 60 * s, w = Math.min(900 * s, W - x * 2)
    let y = 40 * s - this.scroll
    text(c, 'CONTROLS', x, y + 30 * s, { size: 28 * s, weight: 900 })
    text(c, 'Click an action, then press its new key. Enter and Esc belong to the city (chat and leaving). Wheel to scroll.', x, y + 54 * s, { size: 12 * s, color: C.dim }); y += 70 * s
    p.button(c, 'reset', x, y, 220 * s, 34 * s, 'RESET TO DEFAULTS', () => { g.settings.binds = {}; Object.assign(inp.binds, DEFAULT_BINDS); g.save.store(); this.panel.dirty = true }, { align: 'center', font: FONT(13 * s, 700) })
    p.button(c, 'back', x + 232 * s, y, 140 * s, 34 * s, 'BACK', () => this.back(), { align: 'center', font: FONT(13 * s, 700) }); y += 46 * s
    const conflicts = new Set(inp.conflicts().flat())
    const cols = w > 700 * s ? 2 : 1, cw = (w - (cols - 1) * 20 * s) / cols, rh = 30 * s
    const acts = Object.keys(ACTION_NAMES)
    acts.forEach((a, i) => {
      const col = i % cols, row = Math.floor(i / cols)
      const bx = x + col * (cw + 20 * s), by = y + row * (rh + 4 * s)
      if (by < -rh || by > H) { p.buttons.push({ id: 'k' + a, x: -100, y: -100, w: 0, h: 0 }); return }
      const wait = this.rebinding === a
      p.button(c, 'k' + a, bx, by, cw, rh, ACTION_NAMES[a], () => {
        this.rebinding = a; this.panel.dirty = true
        inp.rebinding = { action: a, done: code => { g.settings.binds[a] = code; this.rebinding = null; g.save.store(); this.panel.dirty = true } }
      }, { selected: wait, font: FONT(13 * s, 600), color: conflicts.has(a) ? C.red : C.text })
      text(c, wait ? 'press a key…' : keyLabel(inp.binds[a]), bx + cw - 12 * s, by + rh * 0.66, { size: 13 * s, align: 'right', weight: 800, color: wait ? C.gold2 : C.gold })
    })
    const rows = Math.ceil(acts.length / cols)
    y += rows * (rh + 4 * s) + 12 * s
    wrap(c, 'Mouse: left fire, right (hold) aim down sights, wheel zoom / change weapon. Touch: left half moves, right half looks, buttons for fire, aim, reload, stance, jump, use, grenade, map, inventory, heal. Vehicles: W/S throttle, A/D steer (or roll), Space/C up and down (helicopters, landing), Shift boost, X change seat, F get out; aircraft follow the mouse with flight assist on.', x, y + 14 * s, w, 18 * s, { size: 12 * s, color: C.dim })
    if (conflicts.size) text(c, 'Red: two actions share a key.', x, y + 100 * s, { size: 12 * s, color: C.red })
  }
  page_about(c, p, W, H, s) {
    const x = 60 * s, w = Math.min(820 * s, W - x * 2)
    let y = 50 * s - this.scroll
    this.title(c, x, y, s, false); y += 80 * s
    const paras = [
      'The island of Varden, 12 by 12 km: Port Anselm on the south-west coast, the old city of Kaldor on the River Ost, Kessel Airbase, nine towns and villages, Mount Hallen with its summit station, forests, lakes, rivers and roads between them. Four sides fight over it: the Varden Defence Forces, the Northern Liberation Front, the Coalition Expeditionary Forces and the Resistance.',
      'FREE ROAM: places are held by a side (the map shows which). Garrisons appear as you come near. Kill or drive out every enemy in a place to liberate it; your progress, kit and position are kept in your save. Take any vehicle you find. The pause menu has sandbox tools: spawn vehicles and squads, change time and weather, teleport by the map, invulnerability.',
      'FIGHTING: bullets are real projectiles with drop, drag, ricochets and penetration (thin walls and glass stop less than concrete). Zero your sights with Page Up / Down for long shots. Hold your breath (Shift) with a scope. Being shot at blurs your aim. Wounds bleed: bandage with H. Grenades with G.',
      'SQUAD: T opens the orders (follow, hold, regroup, move to or attack the map waypoint, formation, posture). Set a waypoint by clicking the map (M).',
      'CREDITS: designed and built for Project 0 lot 3084 with three.js. All models are made in code for this game; all sounds are synthesised for it (tools/sfxgen.py). No third-party assets. Single player: this version has no multiplayer.',
    ]
    for (const t of paras) y = wrap(c, t, x, y, w, 19 * s, { size: 13.5 * s }) + 10 * s
    p.button(c, 'back', x, y + 6 * s, 200 * s, 46 * s, 'BACK', () => this.back(), { align: 'center' })
  }
  page_deploying(c, p, W, H, s) {
    c.fillStyle = 'rgba(8,10,7,0.85)'; c.fillRect(0, 0, W, H)
    this.title(c, W / 2 - 160 * s, H / 2 - 70 * s, s, false)
    text(c, 'DEPLOYING…', W / 2, H / 2 + 40 * s, { size: 22 * s, weight: 900, align: 'center', color: C.gold2 })
  }
  page_pause(c, p, W, H, s) {
    const g = this.g, x = 60 * s
    this.title(c, x, 60 * s, s, false)
    const items = [
      { id: 'resume', label: 'RESUME', fn: () => g.resume() },
      { id: 'map', label: 'MAP', fn: () => { g.resume(); g.openMap() } },
      g.mode?.admin ? { id: 'sandbox', label: 'SANDBOX TOOLS', sub: 'Spawn vehicles and squads, time, weather, teleport', fn: () => this.open('sandbox', true) } : null,
      { id: 'settings', label: 'SETTINGS', fn: () => this.open('settings', true) },
      { id: 'controls', label: 'CONTROLS', fn: () => this.open('controls', true) },
      null,
      { id: 'quit', label: 'SAVE AND QUIT TO MENU', fn: () => { g.mode?.persist?.(); g.quitToMenu() } },
    ].filter((v, i) => v || i === 5)
    this.column(c, p, x, 150 * s, Math.min(400 * s, W - x * 2), items, s)
    const m = g.mode
    if (m && W > 900 * s) {
      const bx = W - 380 * s, by = 150 * s
      box(c, bx, by, 330 * s, 150 * s)
      text(c, m.name.toUpperCase(), bx + 16 * s, by + 30 * s, { size: 16 * s, weight: 800, color: C.gold2 })
      text(c, `Kills ${m.kills}   Deaths ${m.deaths}`, bx + 16 * s, by + 60 * s, { size: 14 * s })
      text(c, `Time ${Math.floor(m.t / 60)} min`, bx + 16 * s, by + 86 * s, { size: 14 * s, color: C.dim })
      text(c, 'P or Resume to go back. Esc leaves the game.', bx + 16 * s, by + 126 * s, { size: 11 * s, color: C.dim })
    }
  }
  page_sandbox(c, p, W, H, s) {
    const g = this.g, m = g.mode, x = 40 * s, w = W - x * 2
    let y = 30 * s - this.scroll
    text(c, 'SANDBOX TOOLS', x, y + 26 * s, { size: 24 * s, weight: 900 }); y += 44 * s
    const grid = (label, items) => {
      text(c, label, x, y + 14 * s, { size: 13 * s, weight: 800, color: C.gold }); y += 22 * s
      const bw = 168 * s, bh = 34 * s, per = Math.max(1, Math.floor((w + 6 * s) / (bw + 6 * s)))
      items.forEach((it, i) => p.button(c, label + i, x + (i % per) * (bw + 6 * s), y + Math.floor(i / per) * (bh + 6 * s), bw, bh, it.label, it.fn, { font: FONT(12 * s, 700), selected: it.on, align: 'center' }))
      y += Math.ceil(items.length / per) * (bh + 6 * s) + 8 * s
    }
    const act = (a, v, close = true) => () => { m.admin(a, v); if (close) g.resume(); else this.panel.dirty = true }
    grid('SPAWN A VEHICLE (in front of you)', Object.entries(VEHICLES).map(([k, v]) => ({ label: v.name, fn: act('vehicle', k) })))
    grid('SQUADS', [{ label: 'Enemy squad attack', fn: act('squad', 'enemy') }, { label: 'Friendly squad here', fn: act('squad', 'friend') }, { label: 'Remove all AI', fn: act('clear') }])
    grid('TIME', [[5.5, 'Dawn'], [9, 'Morning'], [13, 'Noon'], [18.5, 'Sunset'], [22, 'Night'], [2, 'Midnight']].map(([v, l]) => ({ label: l, fn: act('time', v, false) })).concat([{ label: g.sky.cycle ? 'Stop the clock' : 'Run the clock', fn: act('cycle', null, false) }]))
    grid('WEATHER', Object.entries(WEATHER).map(([k, v]) => ({ label: v.name, on: g.sky.weatherKey === k, fn: act('weather', k, false) })))
    grid('PLAYER', [{ label: 'Invulnerable', on: !!g.settings.god, fn: act('god', null, false) }, { label: 'Show all units on map', on: !!g.settings.reveal, fn: act('reveal', null, false) }, { label: 'Refill ammo and health', fn: act('ammo') }, { label: 'Teleport (click the map)', fn: () => { g.resume(); g.map.mode = 'teleport'; g.openMap(); g.hud.note('Click the map to teleport') } }])
    const cat = this.wcat || 'rifle'
    grid('WEAPONS: CATEGORY', Object.entries(CATEGORIES).map(([k, v]) => ({ label: v, on: k === cat, fn: () => { this.wcat = k; this.panel.dirty = true } })))
    grid('WEAPONS: TAKE ONE', WEAPONS.filter(d => d.cat === cat).map(d => ({ label: d.name, fn: act('weapon', d) })))
    p.button(c, 'back', x, y + 4 * s, 200 * s, 44 * s, 'BACK', () => this.back(), { align: 'center' })
    this.maxScroll = Math.max(0, y + this.scroll + 60 * s - H)
    if (this.scroll > this.maxScroll) this.scroll = this.maxScroll
    if (this.maxScroll > 0) {
      p.button(c, 'up', W - 60 * s, 20 * s, 44 * s, 44 * s, '▲', () => { this.scroll = Math.max(0, this.scroll - H * 0.6); this.panel.dirty = true }, { align: 'center' })
      p.button(c, 'dn', W - 60 * s, 70 * s, 44 * s, 44 * s, '▼', () => { this.scroll += H * 0.6; this.panel.dirty = true }, { align: 'center' })
    }
  }
  page_dead(c, p, W, H, s) {
    const g = this.g, pl = g.player?.s, x = W / 2
    text(c, 'KILLED IN ACTION', x, H * 0.28, { size: 40 * s, weight: 900, align: 'center', color: C.red, shadow: true })
    const k = pl?.killer
    text(c, k && k !== pl ? `by ${k.name}${k.faction ? ' (' + FACTIONS[k.faction].short + ')' : ''}${k.pos && pl ? ', ' + Math.round(k.pos.distanceTo(pl.pos)) + ' m' : ''}` : 'You died.', x, H * 0.28 + 34 * s, { size: 16 * s, align: 'center', shadow: true })
    const opts = g.mode?.respawnOptions() || []
    const w = Math.min(420 * s, W - 40 * s)
    this.column(c, p, x - w / 2, H * 0.4, w, [...opts.map(o => ({ id: 'r' + o.id, label: o.label.toUpperCase(), sub: o.sub, fn: () => g.mode.respawn(o.id) })), null, { id: 'quit', label: 'QUIT TO MENU', fn: () => g.quitToMenu() }], s)
  }
  page_squad(c, p, W, H, s) {
    const g = this.g, q = g.playerSquad
    c.clearRect(0, 0, W, H)
    if (!q) { this.close(); return }
    const bw = 260 * s, x = 20 * s
    let y = H * 0.18
    box(c, x - 10 * s, y - 40 * s, bw + 20 * s, 520 * s)
    text(c, `SQUAD ORDERS  (${q.alive.length - 1} with you)`, x, y - 14 * s, { size: 15 * s, weight: 800, color: C.gold2 })
    const o = (label, fn, sel) => { p.button(c, label, x, y, bw, 32 * s, label, () => { fn(); this.close() }, { font: FONT(13 * s, 700), selected: sel }); y += 36 * s }
    const wp = g.waypoint
    o('Follow me', () => { g.orderSquad('follow'); g.hud.radio(q.alive[1]?.name || 'Squad', 'On you.') }, q.order.type === 'follow')
    o('Hold position', () => { g.orderSquad('hold'); g.hud.radio(q.alive[1]?.name || 'Squad', 'Holding.') }, q.order.type === 'hold')
    o('Defend here', () => { g.orderSquad('defend'); g.hud.radio(q.alive[1]?.name || 'Squad', 'Setting up a perimeter.') }, q.order.type === 'defend')
    o(wp ? 'Move to the waypoint' : 'Move to (set a waypoint first)', () => { if (wp) { g.orderSquad('move', wp); g.hud.radio(q.alive[1]?.name || 'Squad', 'Moving.') } }, q.order.type === 'move')
    o(wp ? 'Attack the waypoint' : 'Attack (set a waypoint first)', () => { if (wp) { g.orderSquad('attack', wp); g.hud.radio(q.alive[1]?.name || 'Squad', 'Moving to engage.') } }, q.order.type === 'attack')
    y += 6 * s
    text(c, 'Formation', x, y + 12 * s, { size: 12 * s, color: C.dim }); y += 18 * s
    const fw = (bw - 18 * s) / 4
    ;['wedge', 'line', 'column', 'file'].forEach((f, i) => p.button(c, 'f' + f, x + i * (fw + 6 * s), y, fw, 28 * s, f, () => { g.orderSquad('formation', { formation: f }); this.panel.dirty = true }, { font: FONT(11 * s, 700), align: 'center', selected: q.formation === f }))
    y += 36 * s
    text(c, 'Posture', x, y + 12 * s, { size: 12 * s, color: C.dim }); y += 18 * s
    const pw = (bw - 12 * s) / 3
    ;[['combat', 'Combat'], ['stealth', 'Stealth'], ['hold-fire', 'Hold fire']].forEach(([k, l], i) => p.button(c, 'p' + k, x + i * (pw + 6 * s), y, pw, 28 * s, l, () => { g.orderSquad('posture', { posture: k }); this.panel.dirty = true }, { font: FONT(11 * s, 700), align: 'center', selected: q.posture === k }))
    y += 40 * s
    o('Close [T]', () => {})
    // members and their state
    let my = H * 0.18
    const mx = x + bw + 30 * s
    if (W > 700) for (const m of q.members) {
      if (m.isPlayer) continue
      box(c, mx, my - 18 * s, 230 * s, 26 * s, { fill: 'rgba(0,0,0,0.5)' })
      text(c, m.name, mx + 8 * s, my, { size: 12 * s, color: m.dead ? C.red : m.down ? C.gold2 : C.text })
      bar(c, mx + 150 * s, my - 8 * s, 70 * s, 6 * s, m.dead ? 0 : m.blood / 100, m.blood > 50 ? C.green : C.red)
      my += 30 * s
    }
  }
}
