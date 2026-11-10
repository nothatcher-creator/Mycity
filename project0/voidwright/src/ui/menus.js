// The screens: title, a new world (where to start), the game menu, settings, controls, the block catalogue
// (G), the colour palette (P), blueprints (H), the jump planner (J) and the terminal (K).
import { Panel, C, FONT, text, wrap, box, bar, chip, header, chamfer } from './ui.js'
import { BLOCKS, ORDER, CATS, hasSize } from '../grid/blocks.js'
import { PALETTE } from '../grid/grid.js'
import { TOOLS } from '../game/build.js'
import { PREFAB_LIST, prefab } from '../game/prefabs.js'
import { ACTION_NAMES, keyLabel } from '../core/input.js'
import { ITEMS, PART_LIST, fmtAmount } from '../game/items.js'
import { netItems, netVolume, netTake, netPut, gasTotal, gasMax } from '../game/survival.js'

export const SCENARIOS = [
  { id: 'planet', name: 'Halvor: Landing Site', sub: 'On the home world, 1 g and air', desc: 'Start on the grass of Halvor beside a small outpost, a Sparrow scout and a Mule hauler. Fly them, take them apart, build your own.' },
  { id: 'orbit', name: 'Kestrel Station', sub: 'High orbit over Halvor', desc: 'A station in orbit with the Lancer explorer docked beside it. The Halvor Shoal asteroid field is close by; the jump drive reaches the whole system.' },
  { id: 'moon', name: 'Ket: Crater Base', sub: 'The moon, a quarter g, no air', desc: 'A base on the grey moon. Low gravity makes for easy flying; atmos thrusters do nothing here.' },
  { id: 'rocks', name: 'The Drift', sub: 'Deep space among asteroids', desc: 'Between the worlds in the richest rock field, with a scout to explore and an empty station core.' },
  { id: 'empty', name: 'Empty Space', sub: 'Nothing but you', desc: 'Floating in the dark with a jetpack and every block. Build from the first cube.' },
]

export class Menus {
  constructor(game) {
    this.g = game
    const ui = game.ui
    this.panel = ui.add(new Panel(ui, 0, 0, 10, 10, (c, p) => this.draw(c, p), { modal: true, order: 8 }))
    this.panel.show(false)
    this.page = null
    this.visible = false
    this.scroll = 0
    this.cat = 'Hull'
    this.sel = 0
    this.held = null
    this.layout()
  }
  layout() {
    const e = this.g.engine, W = e.width, H = e.height
    const big = ['catalog', 'terminal', 'blueprints', 'controls', 'new', 'inventory', 'production'].includes(this.page)
    const w = Math.min(W - 20, big ? 980 : 560), h = Math.min(H - 20, big ? 640 : 520)
    this.panel.place((W - w) / 2, (H - h) / 2, w, h)
    if (this.page === 'title') { const h = Math.min(H - 20, 460); this.panel.place(Math.max(10, W * 0.06), Math.max(10, (H - h) / 2), Math.min(W - 20, 420), h) }
    this.panel.dirty = true
  }
  open(page) { this.page = page; this.visible = true; this.scroll = 0; this.panel.show(true); this.layout(); this.g.p0.input.unlockPointer?.() }
  close() { this.page = null; this.visible = false; this.panel.show(false); this.held = null; if (this.g.state === 'play' && !this.g.input.touch) this.g.p0.input.lockPointer?.() }
  wheel(dy) { this.scroll = Math.max(0, this.scroll + Math.sign(dy) * 60); this.panel.dirty = true }
  update() { if (this.visible && ['jump', 'terminal', 'production', 'inventory'].includes(this.page)) { this.acc = (this.acc || 0) + 1; if (this.acc % 10 === 0) this.panel.dirty = true } }
  draw(c, p) {
    const pg = this.page
    if (!pg) return
    if (pg !== 'title') box(c, 0, 0, p.w, p.h)
    const f = this['page_' + pg]
    try { if (f) f.call(this, c, p) } catch (e) { this.g.p0.log('menu ' + pg + ' failed: ' + e.message + ' ' + (e.stack || '').split('\n')[1]); this.back(c, p, null, 'CLOSE') }
  }
  back(c, p, to = null, label = 'BACK') { p.button(c, 'back', p.w - 130, p.h - 54, 114, 38, label, () => to ? this.open(to) : this.close(), { align: 'center' }) }
  title(c, p, s, sub) { header(c, s, 18, 30, p.w - 36, 1.2); if (sub) text(c, sub, 18, 52, { size: 12, weight: 500, color: C.dim }) }
  // ---- title ----
  page_title(c, p) {
    const k = Math.min(1, p.h / 460), bh = Math.round(54 * k), gap = Math.round(62 * k)
    text(c, 'VOIDWRIGHT', 6, 64 * k, { size: 52 * k, weight: 700, color: C.white, shadow: true })
    c.fillStyle = C.gold; c.fillRect(8, 76 * k, 150, 3)
    text(c, 'BUILD SHIPS. LAND ANYWHERE. A WHOLE STAR SYSTEM.', 8, 100 * k, { size: 12, weight: 700, color: C.gold2, shadow: true })
    let y = 128 * k
    const B = (id, label, sub, fn) => { p.button(c, id, 6, y, p.w - 12, bh, label, fn, { sub: k > 0.8 ? sub : null, arrow: true }); y += gap }
    B('new', 'NEW WORLD', 'Creative or survival, five places to start', () => this.open('new'))
    B('settings', 'SETTINGS', 'Graphics, controls, sound', () => this.open('settings'))
    B('controls', 'CONTROLS', 'Keys for flying and building', () => this.open('controls'))
    if (k > 0.8) text(c, 'Round two of three: wheels, rotors, pistons, docking and saved worlds come next.', 8, y + 14, { size: 11, weight: 500, color: C.dim, shadow: true, max: p.w - 16 })
  }
  // ---- choosing a start ----
  page_new(c, p) {
    const surv = this.mode === 'survival'
    this.title(c, p, 'NEW WORLD', surv ? 'Survival: mine, refine and assemble parts; weld every block up from a frame; mind your oxygen.' : 'Creative: blocks cost nothing and build at once; blueprints and copy/paste.')
    p.button(c, 'mC', p.w - 236, 18, 106, 30, 'CREATIVE', () => { this.mode = 'creative'; this.panel.dirty = true }, { align: 'center', selected: !surv, font: FONT(11, 700) })
    p.button(c, 'mS', p.w - 124, 18, 106, 30, 'SURVIVAL', () => { this.mode = 'survival'; this.panel.dirty = true }, { align: 'center', selected: surv, font: FONT(11, 700) })
    const S = SCENARIOS, n = S.length, w = Math.min(300, p.w * 0.36)
    let y = 72
    for (let i = 0; i < n; i++) { p.button(c, 'sc' + i, 18, y, w, 58, S[i].name, () => { this.sel = i; this.panel.dirty = true }, { sub: S[i].sub, selected: this.sel === i }); y += 64 }
    const s = S[this.sel], x = 36 + w
    box(c, x, 72, p.w - x - 18, p.h - 150, { ticks: false })
    text(c, s.name.toUpperCase(), x + 18, 104, { size: 20, weight: 700, color: C.gold2, max: p.w - x - 50 })
    wrap(c, s.desc, x + 18, 132, p.w - x - 54, 20, { size: 14, weight: 500 })
    p.button(c, 'start', p.w - 260, p.h - 54, 114, 38, 'START', () => this.g.startWorld(s.id, this.mode || 'creative'), { align: 'center', selected: true })
    this.back(c, p, this.g.state === 'menu' ? 'title' : 'pause')
  }
  page_loading(c, p) {
    const g = this.g, sc = SCENARIOS.find(s => s.id === g.scenario)
    this.title(c, p, 'ARRIVING', sc ? sc.name : '')
    const left = g.loadLeft ?? 99, f = Math.max(0.05, Math.min(1, Math.max(g.loadT / 14, 1 - left / 80)))
    bar(c, 18, 96, p.w - 36, 12, f, C.gold)
    text(c, left > 2 ? `Shaping the ground and rock round you (${left} pieces to go)` : 'Ready', 18, 132, { size: 13, weight: 500, color: C.dim })
    if (sc) wrap(c, sc.desc, 18, 170, p.w - 36, 20, { size: 13, weight: 500 })
  }
  // ---- the game menu ----
  page_pause(c, p) {
    this.title(c, p, 'GAME MENU')
    let y = 70
    const B = (id, label, sub, fn) => { p.button(c, id, 18, y, p.w - 36, 50, label, fn, { sub, arrow: true }); y += 56 }
    B('resume', 'RESUME', null, () => this.close())
    if (this.g.world.creative) B('bp', 'BLUEPRINTS', 'Spawn a ship or station design', () => this.open('blueprints'))
    B('inv', 'INVENTORY', 'Your suit and the cargo near you', () => this.g.input.tap('inventory') || this.close())
    B('settings', 'SETTINGS', null, () => this.open('settings'))
    B('controls', 'CONTROLS', null, () => this.open('controls'))
    B('new', 'NEW WORLD', 'Start again somewhere else', () => this.open('new'))
    B('quit', 'QUIT TO TITLE', null, () => this.g.quitToTitle())
  }
  page_dead(c, p) {
    this.title(c, p, 'SUIT FAILURE', this.g.player?.deathCause === 'impact' ? 'You hit something too hard.' : 'Your suit gave out.')
    const has = this.g.respawnPoints().length
    p.button(c, 'respawn', 18, 90, p.w - 36, 56, has ? 'RESPAWN AT A MED BAY' : 'RESPAWN', () => this.g.respawn(), { sub: has ? 'Your nearest med bay' : 'Where this world began', arrow: true })
    p.button(c, 'new', 18, 154, p.w - 36, 50, 'NEW WORLD', () => this.open('new'), { arrow: true })
  }
  // ---- settings ----
  page_settings(c, p) {
    const g = this.g, s = g.settings
    this.title(c, p, 'SETTINGS')
    let y = 74
    const row = (label, opts, cur, fn) => {
      text(c, label, 18, y + 22, { size: 13, weight: 600, color: C.text })
      const bw = Math.min(110, (p.w - 210) / opts.length - 6)
      opts.forEach(([v, l], i) => p.button(c, label + i, 190 + i * (bw + 6), y, bw, 34, l, () => { fn(v); g.saveSettings(); this.panel.dirty = true }, { align: 'center', selected: cur === v, font: FONT(12, 700) }))
      y += 44
    }
    row('Graphics', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], s.quality, v => g.setQuality(v))
    row('Resolution', [[0.6, '60%'], [0.8, '80%'], [1, '100%']], s.resScale, v => { s.resScale = v; g.engine.resScale = v; g.engine.resize() })
    row('Field of view', [[60, '60'], [70, '70'], [80, '80'], [90, '90']], s.fov, v => { s.fov = v })
    row('Mouse speed', [[0.5, 'Slow'], [0.8, ''], [1, 'Normal'], [1.4, ''], [2, 'Fast']], s.sens, v => { s.sens = v; g.input.sens = v })
    row('Invert look', [[false, 'Off'], [true, 'On']], s.invertY, v => { s.invertY = v; g.input.invertY = v })
    row('Volume', [[0, 'Off'], [0.4, '40%'], [0.7, '70%'], [1, '100%']], s.volume, v => { s.volume = v })
    this.back(c, p, g.state === 'menu' ? 'title' : 'pause')
  }
  page_controls(c, p) {
    const b = this.g.input.binds
    this.title(c, p, 'CONTROLS')
    const groups = [
      ['ON FOOT', ['forward', 'back', 'left', 'right', 'up', 'down', 'sprint', 'jetpack', 'dampeners', 'rollL', 'rollR', 'use', 'light', 'view']],
      ['BUILDING', ['catalog', 'size', 'gridType', 'palette', 'blueprints', 'rotYawL', 'rotYawR', 'rotPitchU', 'rotPitchD', 'rotRollL', 'rotRollR']],
      ['IN A SEAT', ['dampeners', 'park', 'jump', 'terminal', 'freeLook', 'pause', 'help']],
    ]
    const cw = (p.w - 36) / 3
    groups.forEach(([t, list], gi) => {
      const x = 18 + gi * cw
      header(c, t, x, 76, cw - 14)
      let y = 100
      for (const a of list) { text(c, ACTION_NAMES[a], x, y, { size: 12, weight: 500, color: C.text, max: cw - 80 }); chip(c, keyLabel(b[a]) + (a.startsWith('rot') ? ' / ' + keyLabel(b[a + '2']) : ''), x + cw - 20, y - 12, 17, { size: 9.5, align: 'right' }); y += 23 }
      if (gi === 1) { y += 6; for (const s of ['Left button: place', 'Right button: remove', 'Ctrl + drag: a line', 'Ctrl + Shift + drag: a plane', 'Middle button: paint (Shift: pick)', 'Ctrl + C / V: copy / paste a grid', 'Mouse wheel: toolbar (Ctrl: distance)']) { text(c, s, x, y, { size: 11, weight: 500, color: C.dim, max: cw - 14 }); y += 18 } }
      if (gi === 2) { y += 6; for (const s of ['WASD: thrust forward, back, sideways', 'Space / C: thrust up / down', 'Mouse: pitch and yaw; Q / E: roll', 'F: leave the seat', 'Esc belongs to the city: it leaves the lot']) { text(c, s, x, y, { size: 11, weight: 500, color: C.dim, max: cw - 14 }); y += 18 } }
    })
    this.back(c, p, this.g.state === 'menu' ? 'title' : this.g.state === 'play' ? null : 'pause', this.g.state === 'play' && this.from === 'help' ? 'CLOSE' : 'BACK')
  }
  // ---- the block catalogue ----
  page_catalog(c, p) {
    const g = this.g, B = g.builder, icons = g.icons
    this.title(c, p, 'BLOCKS', `Click a block to put it in toolbar slot ${(this.slotSel ?? Math.max(0, B.slot)) + 1}; pick the slot below. ${B.size === 'large' ? 'Large' : 'Small'} grid (R to switch).`)
    // category tabs
    const tabs = [...CATS, 'Tools']
    const tw = Math.min(110, (p.w - 36) / tabs.length - 4)
    tabs.forEach((t, i) => p.button(c, 'tab' + t, 18 + i * (tw + 4), 66, tw, 30, t.toUpperCase(), () => { this.cat = t; this.scroll = 0; this.panel.dirty = true }, { align: 'center', selected: this.cat === t, font: FONT(11, 700) }))
    // size switch
    p.button(c, 'szL', p.w - 200, 18, 88, 28, 'LARGE', () => { B.size = 'large'; this.panel.dirty = true }, { align: 'center', selected: B.size === 'large', font: FONT(11, 700) })
    p.button(c, 'szS', p.w - 106, 18, 88, 28, 'SMALL', () => { B.size = 'small'; this.panel.dirty = true }, { align: 'center', selected: B.size === 'small', font: FONT(11, 700) })
    const top = 106, bottom = p.h - 132, cell = 104, cols = Math.max(1, Math.floor((p.w - 36) / cell))
    const items = this.cat === 'Tools' ? Object.keys(TOOLS).map(t => ({ tool: t })) : ORDER.filter(id => BLOCKS[id].cat === this.cat).map(id => ({ block: id }))
    c.save(); c.beginPath(); c.rect(0, top, p.w, bottom - top); c.clip()
    const rows = Math.ceil(items.length / cols), maxScroll = Math.max(0, rows * (cell + 6) - (bottom - top))
    if (this.scroll > maxScroll) this.scroll = maxScroll
    items.forEach((it, i) => {
      const x = 18 + (i % cols) * cell, y = top + Math.floor(i / cols) * (cell + 6) - this.scroll
      if (y + cell < top || y > bottom) return
      const avail = it.tool || hasSize(it.block, B.size)
      const name = it.tool ? TOOLS[it.tool].name : BLOCKS[it.block].name
      const btn = p.button(c, 'it' + i, x, y, cell - 6, cell, '', () => this.assign(it), { disabled: !avail })
      if (it.block) { const ic = icons?.get(it.block, B.size); if (ic) { c.globalAlpha = avail ? 1 : 0.3; c.drawImage(ic, x + (cell - 6 - 66) / 2, y + 4, 66, 66); c.globalAlpha = 1 } }
      else text(c, it.tool === 'welder' ? '⚡' : it.tool === 'grinder' ? '✷' : '◉', x + (cell - 6) / 2, y + 50, { size: 34, weight: 700, color: C.gold2, align: 'center' })
      c.font = FONT(10.5, 600); c.fillStyle = avail ? C.text : C.dim; c.textAlign = 'center'
      const words = name.split(' '); let line = '', ly = y + cell - 24
      const lines = []; for (const w of words) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > cell - 14 && line) { lines.push(line); line = w } else line = t } lines.push(line)
      lines.slice(-2).forEach((l, k) => c.fillText(l, x + (cell - 6) / 2, ly + k * 12 + (lines.length === 1 ? 6 : 0)))
      c.textAlign = 'left'
      if (!avail) text(c, B.size === 'large' ? 'small grid only' : 'large grid only', x + (cell - 6) / 2, y + 16, { size: 9, weight: 700, color: C.amber, align: 'center' })
    })
    c.restore()
    // the toolbar, to choose the slot
    const sw = Math.min(64, (p.w - 200) / 9)
    text(c, 'TOOLBAR', 18, bottom + 24, { size: 11, weight: 700, color: C.gold })
    for (let i = 0; i < 9; i++) {
      const x = 18 + i * (sw + 4), y = bottom + 34, it = B.bar[i], sel = (this.slotSel ?? Math.max(0, B.slot)) === i
      p.button(c, 'bs' + i, x, y, sw, sw, '', () => { this.slotSel = i; this.panel.dirty = true }, { selected: sel })
      if (it?.block) { const ic = icons?.get(it.block, B.size); if (ic) c.drawImage(ic, x + 3, y + 3, sw - 6, sw - 6) } else if (it?.tool) text(c, TOOLS[it.tool].name, x + sw / 2, y + sw / 2 + 4, { size: 9, weight: 700, align: 'center', max: sw - 4 })
      text(c, String(i + 1), x + 5, y + 12, { size: 10, weight: 700, color: C.dim })
    }
    this.back(c, p, null, 'DONE')
  }
  assign(it) {
    const B = this.g.builder, i = this.slotSel ?? Math.max(0, B.slot)
    B.bar[i] = { ...it }
    B.slot = i
    if (it.block && !hasSize(it.block, B.size)) B.size = hasSize(it.block, 'large') ? 'large' : 'small'
    this.slotSel = (i + 1) % 9
    this.g.save.data.bar = B.bar; this.g.save.store()
    this.g.sfx.play('ui_click', 0.4)
    this.panel.dirty = true
  }
  // ---- colours ----
  page_palette(c, p) {
    const B = this.g.builder
    this.title(c, p, 'PAINT COLOUR', 'New blocks are built in this colour; the middle button paints a block (Shift + middle picks a colour).')
    const n = PALETTE.length, cols = 7, s = Math.min(64, (p.w - 60) / cols - 8)
    PALETTE.forEach((col, i) => {
      const x = 18 + (i % cols) * (s + 8), y = 80 + Math.floor(i / cols) * (s + 8)
      p.button(c, 'col' + i, x, y, s, s, '', () => { B.color = i; this.panel.dirty = true }, { selected: B.color === i })
      chamfer(c, x + 6, y + 6, s - 12, s - 12, 6); c.fillStyle = `rgb(${col.map(v => Math.round(v * 255)).join(',')})`; c.fill()
    })
    this.back(c, p, null, 'DONE')
  }
  // ---- blueprints ----
  page_blueprints(c, p) {
    const g = this.g
    this.title(c, p, 'BLUEPRINTS', 'Pick a design: it appears in front of you; left button places it. Ctrl + C on any grid copies it here.')
    let y = 74
    const list = PREFAB_LIST.map(id => ({ id, bp: prefab(id) }))
    if (g.builder.clip) list.unshift({ id: 'clip', bp: g.builder.clip })
    for (const { id, bp } of list) {
      p.button(c, 'bp' + id, 18, y, p.w - 36, 56, (id === 'clip' ? 'COPIED: ' : '') + bp.name.toUpperCase(), () => { this.close(); g.builder.startPaste(bp) }, { sub: `${bp.size === 'large' ? 'Large' : 'Small'} grid ${bp.static ? 'station' : 'ship'} · ${bp.blocks.length} blocks${bp.desc ? ' · ' + bp.desc : ''}`, arrow: true })
      y += 62
    }
    this.back(c, p, null, 'CLOSE')
  }
  // ---- jumping ----
  page_jump(c, p) {
    const g = this.g, P = g.player, gr = P?.seat?.grid
    this.title(c, p, 'JUMP DRIVE', 'Choose where to go: the drive charges for 10 seconds, then the whole grid jumps.')
    if (!gr?.parts.jumpdrives.length) { text(c, 'This grid has no jump drive.', 18, 90, { size: 14 }); this.back(c, p); return }
    let y = 74
    for (const pl of g.world.universe.places()) {
      const d = gr.comWorld().distanceTo(pl.pos) - pl.r
      if (d < 3000) continue
      const ok = d < 2000000
      p.button(c, 'j' + pl.id, 18, y, p.w - 36, 50, pl.name.toUpperCase(), () => { this.close(); g.planJump(pl) }, { sub: `${pl.kind === 'planet' ? 'World' : 'Rock field'} · ${(d / 1000).toFixed(0)} km · ${pl.blurb}`, disabled: !ok, arrow: true })
      y += 56
    }
    this.back(c, p, null, 'CLOSE')
  }
  // ---- the terminal: the grid you are on or looking at ----
  // ---- your suit and the cargo of the grid near you ----
  page_inventory(c, p) {
    const g = this.g, P = g.player, gr = g.invGrid
    this.title(c, p, 'INVENTORY', 'Click a row to move it across. In survival the suit holds 400 litres.')
    if (!P) return
    const colW = (p.w - 54) / 2, top = 74, rowH = 26
    const list = (x, title, entries, vol, max, fn) => {
      header(c, title, x, top + 4, colW)
      bar(c, x, top + 14, colW, 8, max ? vol / max : 0, vol / max > 0.9 ? C.red : C.gold)
      text(c, `${Math.round(vol)} / ${Math.round(max)} L`, x + colW, top + 38, { size: 10.5, weight: 700, color: C.dim, align: 'right' })
      let y = top + 48
      if (!entries.length) text(c, 'Empty', x, y + 16, { size: 12, weight: 500, color: C.dim })
      for (const [id, n] of entries) {
        if (y > p.h - 80) { text(c, '…', x, y + 14, { color: C.dim }); break }
        p.button(c, title + id, x, y, colW, rowH - 2, '', () => { fn(id, n); this.panel.dirty = true }, { bg: 'rgba(14,26,32,0.6)' })
        c.fillStyle = ITEMS[id].col || C.gold; c.fillRect(x + 8, y + 7, 9, 9)
        text(c, ITEMS[id].name, x + 24, y + 16, { size: 12, weight: 600, max: colW - 110 })
        text(c, fmtAmount(id, n), x + colW - 10, y + 16, { size: 12, weight: 700, color: C.gold2, align: 'right' })
        y += rowH
      }
    }
    list(18, 'SUIT', P.inv.list(), P.inv.volume, P.inv.max, (id, n) => { if (!gr) return; const put = netPut(gr, id, n); P.inv.take(id, put) })
    if (gr) {
      const v = netVolume(gr), items = [...netItems(gr).entries()].sort((a, b) => ITEMS[a[0]].kind.localeCompare(ITEMS[b[0]].kind) || ITEMS[a[0]].name.localeCompare(ITEMS[b[0]].name))
      list(36 + colW, gr.name.toUpperCase(), items, v.v, v.max, (id, n) => { const want = Math.min(n, P.inv.free() / ITEMS[id].L); const got = netTake(gr, id, ITEMS[id].kind === 'part' ? Math.floor(want) : want); P.inv.add(id, got) })
    } else text(c, 'Stand by a grid with cargo, or look at it, to trade with it.', 36 + colW, top + 30, { size: 12, weight: 500, color: C.dim, max: colW })
    this.back(c, p, null, 'CLOSE')
  }
  // ---- refining, assembling, gases ----
  page_production(c, p) {
    const g = this.g, gr = g.terminalGrid
    if (!gr) { this.back(c, p); return }
    this.title(c, p, 'PRODUCTION', `${gr.name}: ore in cargo is refined automatically; queue parts for the assemblers.`)
    const L = gr.parts, stock = netItems(gr), q = gr.queue || (gr.queue = [])
    // the parts list with queue buttons
    const colW = Math.min(420, p.w * 0.5)
    let y = 74
    header(c, 'MAKE PARTS', 18, y + 4, colW); y += 14
    const rowH = Math.max(22, Math.min(26, (p.h - 170) / PART_LIST.length))
    for (const id of PART_LIST) {
      const it = ITEMS[id], have = Math.floor(stock.get(id) || 0), queued = q.filter(j => j.id === id).reduce((s, j) => s + j.n, 0)
      const ok = Object.entries(it.recipe).every(([k, n]) => (stock.get(k) || 0) >= n)
      text(c, it.name, 18, y + rowH * 0.7, { size: 11.5, weight: 600, color: ok ? C.text : C.dim, max: colW - 190 })
      text(c, `${have}${queued ? ' +' + queued : ''}`, 18 + colW - 150, y + rowH * 0.7, { size: 11.5, weight: 700, color: C.gold2, align: 'right' })
      for (const [k, n] of [[0, 1], [1, 10], [2, 100]]) p.button(c, 'q' + id + n, 18 + colW - 140 + k * 46, y + 1, 42, rowH - 3, '+' + n, () => { const j = q.find(x => x.id === id); if (j) j.n += n; else q.push({ id, n }); this.panel.dirty = true }, { align: 'center', font: FONT(10, 700) })
      y += rowH
    }
    // the machines, the gases, the stock of ores and ingots
    const x = 40 + colW, w = p.w - x - 18
    y = 74
    header(c, 'MACHINES', x, y + 4, w); y += 22
    for (const b of [...L.refineries, ...L.assemblers, ...L.gasgens]) { text(c, `${b.name}: ${b.status || 'Idle'}`, x, y, { size: 11.5, weight: 600, color: b.build < 1 ? C.amber : C.text, max: w }); y += 17 }
    if (q.length) { text(c, 'Queue: ' + q.map(j => `${ITEMS[j.id].name} ×${j.n}`).join(', '), x, y, { size: 11, weight: 500, color: C.dim, max: w }); y += 17; p.button(c, 'qclear', x, y, 120, 26, 'CLEAR QUEUE', () => { gr.queue = []; this.panel.dirty = true }, { align: 'center', font: FONT(10, 700) }); y += 32 }
    y += 6; header(c, 'GASES', x, y + 4, w); y += 20
    for (const [gas, label] of [['h2', 'Hydrogen'], ['o2', 'Oxygen']]) { const m = gasMax(gr, gas); if (!m) continue; text(c, label, x, y + 9, { size: 11, weight: 600 }); bar(c, x + 80, y, w - 80, 9, gasTotal(gr, gas) / m, gas === 'h2' ? C.orange : C.blue); y += 18 }
    y += 6; header(c, 'ORE AND INGOTS', x, y + 4, w); y += 22
    for (const [id, n] of [...stock.entries()].filter(([k]) => ITEMS[k].kind !== 'part').sort()) { if (y > p.h - 70) break; text(c, ITEMS[id].name, x, y, { size: 11, weight: 500 }); text(c, fmtAmount(id, n), x + w, y, { size: 11, weight: 700, color: C.gold2, align: 'right' }); y += 16 }
    this.back(c, p, 'terminal')
  }
  page_terminal(c, p) {
    const g = this.g, gr = g.terminalGrid
    if (!gr || !g.world.grids.includes(gr)) { this.title(c, p, 'TERMINAL', 'Look at a grid or sit in one.'); this.back(c, p); return }
    this.title(c, p, gr.name.toUpperCase(), `${gr.static ? 'Station' : 'Ship'} · ${gr.size} grid · ${gr.blocks.size} blocks · ${(gr.mass / 1000).toFixed(1)} t`)
    let y = 72
    const L = gr.parts
    const btn = (id, label, sub, on, fn) => { p.button(c, id, 18, y, (p.w - 46) / 2, 46, label, () => { fn(); this.panel.dirty = true }, { sub, selected: on }); }
    btn('conv', gr.static ? 'CONVERT TO SHIP' : 'CONVERT TO STATION', gr.static ? 'Free it to move' : 'Fix it where it is', false, () => { gr.static = !gr.static; gr.vel.set(0, 0, 0); gr.angVel.set(0, 0, 0); gr.locked = null; g.hud.toast(gr.static ? `${gr.name} is now a station` : `${gr.name} is now a ship`) })
    p.button(c, 'damp', 28 + (p.w - 46) / 2, y, (p.w - 46) / 2, 46, gr.dampeners ? 'DAMPENERS ON' : 'DAMPENERS OFF', () => { gr.dampeners = !gr.dampeners; this.panel.dirty = true }, { selected: gr.dampeners })
    y += 54
    const groups = [['Thrusters', L.thrusters], ['Gyro stabilisers', L.gyros], ['Lights', L.lights], ['Power blocks', L.power], ['Gravity generators', L.gravgens], ['Doors', L.doors]]
    for (const [name, list] of groups) {
      if (!list.length) continue
      const on = list.filter(b => b.on).length
      p.button(c, 'grp' + name, 18, y, p.w - 36, 40, `${name.toUpperCase()}  (${on}/${list.length} on)`, () => { const all = on < list.length; for (const b of list) { b.on = all; gr.touch(b) } }, { selected: on === list.length })
      y += 46
    }
    if (L.assemblers.length || L.refineries.length || L.gasgens.length || L.invs.length) { p.button(c, 'prod', 18, y, p.w - 36, 44, 'PRODUCTION AND CARGO', () => this.open('production'), { sub: `${L.refineries.length} refining · ${L.assemblers.length} assembling · ${L.gasgens.length} splitting ice`, arrow: true }); y += 50 }
    if (L.power.length && gr.power) { y += 8; text(c, `POWER  ${gr.power.want.toFixed(2)} MW used of ${gr.power.supply.toFixed(2)} MW made`, 18, y + 12, { size: 12, weight: 700, color: C.dim }); if (gr.power.cap) { bar(c, 18, y + 22, p.w - 36, 10, gr.power.store / gr.power.cap, C.green) } }
    this.back(c, p, null, 'CLOSE')
  }
}
