// Menus: the title screen, setting up a game, settings and key bindings, the pause menu, the sandbox
// tools, the respawn screen and the squad orders. One full-screen panel; each page draws its own
// buttons. Works with the mouse and with taps.
import { Panel, C, FONT, text, wrap, box, bar, header, chip, chamfer } from './ui.js'
import { ACTION_NAMES, DEFAULT_BINDS, keyLabel } from '../core/input.js'
import { QUALITY } from '../core/engine.js'
import { MODE_INFO } from '../game/modes/index.js'
import { FACTIONS } from '../actors/factions.js'
import { PLACES } from '../world/blueprint.js'
import { POINTS } from '../world/places.js'
import { VEHICLES } from '../vehicles/vehicle-data.js'
import { WEAPONS, CATEGORIES } from '../combat/weapons-data.js'
import { WEATHER } from '../world/sky.js'
import { mapImage, worldToMap } from './mapimage.js'
import { CONTROL } from '../game/modes/freeroam.js'
import { BATTLES, ARENAS } from '../game/modes/battle.js'
import { MISSIONS, CHAPTER, drawBriefing } from '../game/modes/campaign.js'
import { ONLINE_KINDS, ONLINE_PLACES, serverList } from '../game/modes/online.js'
import { drawArsenal, openArsenal } from './arsenal.js'

export class Menus {
  constructor(game) {
    this.g = game
    this.page = null
    this.stack = []
    this.scroll = 0
    this.setup = { faction: 'vdf', start: 'kaldor', squad: 3, hour: 9.5, weather: 'clear', role: 'rifleman' }
    this.osetup = { kind: 'tdm', place: 'tovar', minutes: 12 }
    this.bsetup = { kind: 'domination', place: 'tovar', faction: 'vdf', teamSize: 10, limit: null, minutes: 15, hour: 13, weather: 'clear' }
    this.panel = game.ui.add(new Panel(game.ui, 0, 0, 10, 10, (c, p) => this.draw(c, p), { modal: true, order: 20 }))
    this.panel.show(false)
    this.layout()
  }
  get visible() { return this.panel.visible }
  // on phones the panel starts below the city's bar at the top
  layout() { const e = this.g.engine, t = this.g.input.touch, safe = t ? 60 : 0, H = e.height - safe; this.panel.place(0, safe, e.width, H); this.s = H > e.width ? Math.max(0.42, Math.min(1, e.width / 520)) : t ? Math.max(0.6, Math.min(1.2, Math.min(e.width / 1000, H / 560))) : Math.max(0.42, Math.min(1.2, Math.min(e.width / 1280, H / 720))) }
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
  // the title screen redraws only when its tip changes (every 8 s): a full-screen canvas is costly to upload
  update(dt) { this.t = (this.t || 0) + dt; if ((this.page === 'online' || this.page === 'host') && Math.floor(this.t) !== this.lastTick) { this.lastTick = Math.floor(this.t); this.panel.dirty = true } if (this.page === 'main' && Math.floor(this.t / 8) !== this.lastBlink) { this.lastBlink = Math.floor(this.t / 8); this.panel.dirty = true } }
  // ---------- drawing ----------
  draw(c, p) {
    const W = p.w, H = p.h, s = this.s
    const fn = this['page_' + this.page]
    const overGame = this.g.state !== 'menu'
    if (this.g.engine.uiOnly) {
      // before the 3D world is up: the island map, dimmed, behind the menus
      c.fillStyle = '#141a12'; c.fillRect(0, 0, W, H)
      const img = mapImage(), m = Math.max(W, H) * 1.35
      if (img) { c.globalAlpha = 0.55; c.drawImage(img, W - m * 0.9, (H - m) / 2, m, m); c.globalAlpha = 1 }
      const gr = c.createLinearGradient(0, 0, W * 0.7, 0); gr.addColorStop(0, 'rgba(14,18,12,0.95)'); gr.addColorStop(1, 'rgba(14,18,12,0.1)')
      c.fillStyle = gr; c.fillRect(0, 0, W, H)
    } else {
      c.fillStyle = overGame ? 'rgba(8,10,7,0.72)' : 'rgba(8,10,7,0.35)'
      c.fillRect(0, 0, W, H)
    }
    if (fn) fn.call(this, c, p, W, H, s)
  }
  // A column of big buttons at (x, y).
  column(c, p, x, y, w, items, s, o = {}) {
    const h = (o.h || 48) * s, gap = 7 * s
    let n = 0
    for (const it of items) {
      if (!it) { y += gap * 2.2; continue }
      n++
      const b = p.button(c, it.id, x, y, w, h, (o.numbered ? '' : '') + it.label, it.fn, { sub: it.sub, disabled: it.disabled, selected: it.selected, font: FONT(17 * s, 700), arrow: true })
      if (o.numbered) { c.font = FONT(10 * s, 700); c.fillStyle = 'rgba(224,165,38,0.75)'; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(String(n).padStart(2, '0'), x - 8 * s, b.y + h / 2); c.textAlign = 'left' }
      y += h + gap
    }
    return y
  }
  // The logo: a stencil-style block. Returns the y below it.
  title(c, x, y, s, big = true) {
    const k = big ? 1 : 0.62
    text(c, 'O P E R A T I O N', x + 2 * s, y, { size: 15 * k * s, weight: 700, color: C.gold, shadow: true })
    text(c, 'IRON FRONT', x + 2 * s, y + 56 * k * s, { size: 60 * k * s, weight: 700, color: 'rgba(0,0,0,0.55)' })
    text(c, 'IRON FRONT', x, y + 54 * k * s, { size: 60 * k * s, weight: 700, color: C.text })
    c.font = FONT(60 * k * s, 700); const w = c.measureText('IRON FRONT').width
    c.fillStyle = C.gold; c.fillRect(x, y + 66 * k * s, w, 3 * s)
    for (let i = 0; i < 6; i++) { c.fillStyle = `rgba(224,165,38,${0.5 - i * 0.07})`; c.fillRect(x + w + 6 * s + i * 7 * s, y + 66 * k * s, 4 * s, 3 * s) }
    text(c, 'OPEN WORLD MILITARY WARFARE  ·  ISLAND OF VARDEN', x + 1 * s, y + 86 * k * s, { size: 11.5 * k * s, weight: 600, color: C.dim })
    return y + 100 * k * s
  }
  // The right-hand card on the title screen: the island, your progress, who is here, a tip.
  intel(c, x, y, w, s) {
    const g = this.g, d = g.save.data, camp = d.campaign || { done: [] }, fr = d.freeroam
    const h = 252 * s
    box(c, x, y, w, h)
    header(c, 'FIELD REPORT', x + 16 * s, y + 26 * s, w - 32 * s, s)
    const rows = [
      ['THEATRE', 'Varden, 12 × 12 km'],
      ['CAMPAIGN', `${camp.done.length} / ${MISSIONS.length} missions`],
      ['FREE ROAM', fr ? `${(fr.liberated || []).length} places liberated · ${FACTIONS[fr.faction]?.short || ''}` : 'Not started'],
      ['IN THIS LOT', `${(g.p0.room?.players || []).length || 1} player${(g.p0.room?.players || []).length === 1 ? '' : 's'}`],
    ]
    rows.forEach(([k, v], i) => { const yy = y + (54 + i * 26) * s; text(c, k, x + 16 * s, yy, { size: 10.5 * s, weight: 700, color: C.dim }); text(c, v, x + 116 * s, yy, { size: 13 * s, weight: 600, color: C.text, max: w - 132 * s }) })
    bar(c, x + 16 * s, y + 160 * s, w - 32 * s, 6 * s, camp.done.length / MISSIONS.length, C.gold, { segments: MISSIONS.length })
    const tips = ['Crouch or lie down in the woods: the enemy needs far longer to spot you.', 'Medics in your squad patch you up when the shooting stops.', 'A rocket stops an APC; a tank needs three.', 'The field radio calls mortars on wherever you look (60 to 900 m).', 'Plate carriers slow 5.56: aim for the head.', 'AT soldiers fire rockets at vehicles from 25 to 350 m: keep moving.']
    header(c, 'TIP', x + 16 * s, y + 194 * s, w - 32 * s, s)
    wrap(c, tips[Math.floor((this.t || 0) / 8) % tips.length], x + 16 * s, y + 216 * s, w - 32 * s, 16 * s, { size: 12.5 * s, color: C.text })
  }
  // small option rows: label + choices
  choices(c, p, x, y, w, label, opts, cur, set, s) {
    if (label) text(c, label, x, y + 18 * s, { size: 14 * s, weight: 700, color: C.dim })
    const bx = x + 150 * s, bw = (w - 150 * s - (opts.length - 1) * 6 * s) / opts.length
    opts.forEach((o, i) => p.button(c, (label || 'more' + y) + i, bx + i * (bw + 6 * s), y, bw, 30 * s, o.label, () => { set(o.v); this.panel.dirty = true }, { selected: o.v === cur, align: 'center', font: FONT(13 * s, 700) }))
    return y + 38 * s
  }
  page_main(c, p, W, H, s) {
    const portrait = H > W, x = (portrait ? 26 : 70) * s
    const top = this.title(c, x, (portrait ? 40 : 84) * s, s, !portrait || W > 420)
    if (this.g.input.touch) text(c, 'TAP A MODE TO DEPLOY', x, top + 8 * s, { size: 11 * s, weight: 700, color: C.gold2 })
    const fr = this.g.save.data.freeroam
    const items = [
      fr ? { id: 'cont', label: 'CONTINUE FREE ROAM', sub: `${FACTIONS[fr.faction]?.short || ''} · ${(fr.liberated || []).length} places liberated`, fn: () => this.g.start('freeroam', { resume: true, squad: this.setup.squad }) } : null,
      { id: 'camp', label: 'CAMPAIGN', sub: MODE_INFO[2].desc, fn: () => this.open('campaign', true) },
      { id: 'fr', label: 'FREE ROAM', sub: MODE_INFO[0].desc, fn: () => this.open('freeroam', true) },
      { id: 'battle', label: 'BATTLE', sub: MODE_INFO[1].desc, fn: () => this.open('battle', true) },
      { id: 'online', label: 'MULTIPLAYER', sub: `Server browser · ${(this.g.p0.room?.players || []).length} in this lot now · ${serverList(this.g.p0.room).length} server${serverList(this.g.p0.room).length === 1 ? '' : 's'}`, fn: () => this.open('online', true) },
      { id: 'survival', label: 'SURVIVAL', sub: this.g.save.data.survival ? `Continue · alive ${Math.floor((this.g.save.data.survival.alive || 0) / 1440)} days ${Math.floor(((this.g.save.data.survival.alive || 0) % 1440) / 60)} h` : 'After the outbreak: scavenge, eat, drink, avoid the infected. One life.', fn: () => this.g.start('survival', { resume: !!this.g.save.data.survival }) },
      { id: 'arsenal', label: 'ARSENAL', sub: 'Every weapon, attachment and item: make and save loadouts', fn: () => openArsenal(this) },
      { id: 'life', label: 'LIFE', sub: this.g.save.data.life ? `Continue · $${this.g.save.data.life.money ?? 0} in your wallet` : MODE_INFO[4].desc, fn: () => this.g.start('life', { resume: !!this.g.save.data.life }) },
      null,
      { id: 'settings', label: 'SETTINGS', fn: () => this.open('settings', true) },
      { id: 'controls', label: 'CONTROLS', fn: () => this.open('controls', true) },
      { id: 'about', label: 'HOW TO PLAY & CREDITS', fn: () => this.open('about', true) },
    ].filter((v, i) => v || i === 8)
    const colW = Math.min(430 * s, W - x * 2)
    this.column(c, p, x, top + (this.g.input.touch ? 26 : 22) * s, colW, items, s, { numbered: !portrait })
    // the field report on the right, on screens wide enough for it
    const iw = 330 * s
    if (!portrait && W - (x + colW) > iw + 80 * s) this.intel(c, W - iw - 50 * s, top + 22 * s, iw, s)
    // the foot: what the keys do (or a tap hint on phones)
    const fy = H - 34 * s
    if (!this.g.input.touch) c.fillStyle = 'rgba(224,165,38,0.35)', c.fillRect(x, fy - 20 * s, W - x * 2, 1)
    if (!this.g.input.touch) {
      let cx = x
      for (const [k, l] of [['SPACE', 'Deploy'], ['ENTER', 'Chat'], ['ESC', 'Leave']]) { cx += chip(c, k, cx, fy - 13 * s, 20 * s, { size: 10.5 * s, fill: k === 'SPACE' ? 'rgba(224,165,38,0.45)' : undefined }) + 6 * s; text(c, l, cx, fy + 1 * s, { size: 12 * s, weight: 600, color: C.text }); c.font = FONT(12 * s, 600); cx += c.measureText(l).width + 20 * s }
    }
    if (!this.g.input.touch) text(c, 'Built for Project 0 lot 3084', W - x, fy, { size: 11 * s, color: C.dim, align: 'right' })
  }
  page_freeroam(c, p, W, H, s) {
    const x = 60 * s, w = Math.min(640 * s, W - x * 2)
    this.title(c, x, 50 * s, s, false)
    let y = 130 * s
    text(c, 'FREE ROAM', x, y, { size: 22 * s, weight: 800, color: C.gold2 }); y += 16 * s
    const st = this.setup
    y = this.choices(c, p, x, y, w, 'Side', Object.values(FACTIONS).filter(f => !f.civil).map(f => ({ label: f.short, v: f.id })), st.faction, v => { st.faction = v; if (!this.startsFor(v).includes(st.start)) st.start = this.startsFor(v)[0] }, s)
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
  page_battle(c, p, W, H, s) {
    const x = 60 * s, w = Math.min(760 * s, W - x * 2), b = this.bsetup
    let y = 40 * s - this.scroll
    text(c, 'BATTLE', x, y + 30 * s, { size: 26 * s, weight: 900, color: C.gold2 }); y += 48 * s
    const kinds = Object.entries(BATTLES)
    y = this.choices(c, p, x, y, w, 'Mode', kinds.slice(0, 4).map(([k, v]) => ({ label: v.name.replace('Team ', ''), v: k })), b.kind, v => { b.kind = v; b.limit = null }, s)
    y = this.choices(c, p, x, y, w, '', kinds.slice(4).map(([k, v]) => ({ label: v.name, v: k })), b.kind, v => { b.kind = v; b.limit = null }, s)
    text(c, BATTLES[b.kind].desc, x + 150 * s, y + 2 * s, { size: 12 * s, color: C.dim }); y += 16 * s
    y = this.choices(c, p, x, y, w, 'Place', ARENAS.slice(0, 6).map(id => ({ label: PLACES.find(q => q.id === id).name.replace(' Airbase', '').replace('Camp ', ''), v: id })), b.place, v => { b.place = v }, s)
    y = this.choices(c, p, x, y, w, '', ARENAS.slice(6).map(id => ({ label: PLACES.find(q => q.id === id).name.replace(' Airbase', '').replace('Rask ', ''), v: id })), b.place, v => { b.place = v }, s)
    y = this.choices(c, p, x, y, w, 'Your side', Object.values(FACTIONS).filter(f => !f.civil).map(f => ({ label: f.short, v: f.id })), b.faction, v => { b.faction = v }, s)
    y = this.choices(c, p, x, y, w, 'Side size', [6, 10, 16].map(n => ({ label: `${n}`, v: n })), b.teamSize, v => { b.teamSize = v }, s)
    const base = BATTLES[b.kind].score
    y = this.choices(c, p, x, y, w, b.kind === 'survival' ? 'Waves' : b.kind === 'conquest' ? 'Tickets' : b.kind === 'sector' ? 'Sectors' : 'Score limit', [0.5, 1, 2].map(m => ({ label: String(Math.max(1, Math.round(base * m))), v: Math.max(1, Math.round(base * m)) })), b.limit ?? base, v => { b.limit = v }, s)
    y = this.choices(c, p, x, y, w, 'Time limit', [10, 15, 25].map(m => ({ label: `${m} min`, v: m })), b.minutes, v => { b.minutes = v }, s)
    y = this.choices(c, p, x, y, w, 'Time of day', [[7, 'Morning'], [13, 'Noon'], [19, 'Dusk'], [23, 'Night']].map(([v, l]) => ({ label: l, v })), b.hour, v => { b.hour = v }, s)
    y = this.choices(c, p, x, y, w, 'Weather', Object.entries(WEATHER).map(([k, v]) => ({ label: v.name, v: k })), b.weather, v => { b.weather = v }, s)
    y = this.choices(c, p, x, y, w, 'Difficulty', [[0.25, 'Recruit'], [0.5, 'Regular'], [0.8, 'Veteran']].map(([v, l]) => ({ label: l, v })), this.g.settings.difficulty, v => { this.g.settings.difficulty = v; this.g.save.store() }, s)
    y += 8 * s
    p.button(c, 'go', x, y, 260 * s, 50 * s, 'DEPLOY', () => this.g.start('battle', { ...b, limit: b.limit ?? base }), { font: FONT(20 * s, 900), color: C.gold2 })
    p.button(c, 'back', x + 274 * s, y, 140 * s, 50 * s, 'BACK', () => this.back(), { align: 'center' })
    text(c, 'All other soldiers are AI: this game is single player.', x, y + 72 * s, { size: 11 * s, color: C.dim })
  }
  page_campaign(c, p, W, H, s) {
    const g = this.g, cs = g.save.data.campaign, x = 60 * s, w = Math.min(420 * s, W - x * 2)
    let y = 40 * s - this.scroll
    text(c, 'CAMPAIGN', x, y + 30 * s, { size: 26 * s, weight: 900, color: C.gold2 })
    text(c, CHAPTER, x, y + 52 * s, { size: 13 * s, color: C.dim }); y += 70 * s
    const items = []
    if (cs.at) { const m = MISSIONS.find(q => q.id === cs.at.mission); if (m) items.push({ id: 'resume', label: `CONTINUE: ${m.name.toUpperCase()}`, sub: `From objective ${cs.at.checkpoint + 1} of ${m.objectives.length}`, fn: () => g.start('campaign', { mission: m.id, checkpoint: cs.at.checkpoint }) }) }
    MISSIONS.forEach((m, i) => {
      const open = i < (cs.unlocked || 1), done = cs.done.includes(m.id)
      items.push({ id: 'm' + m.id, label: `${i + 1}. ${m.name.toUpperCase()}${done ? '  ✓' : ''}`, sub: open ? `${m.chapter.split(':')[0]} · ${m.place}` : 'Finish the mission before it to unlock', disabled: !open, selected: this.mission === m.id, fn: () => { this.mission = m.id; this.panel.dirty = true } })
    })
    items.push(null, { id: 'back', label: 'BACK', fn: () => this.back() })
    const end = this.column(c, p, x, y, w, items, s)
    if (end + this.scroll > H) {
      p.button(c, 'up', W - 60 * s, 20 * s, 44 * s, 44 * s, '▲', () => { this.scroll = Math.max(0, this.scroll - H * 0.6); this.panel.dirty = true }, { align: 'center' })
      p.button(c, 'dn', W - 60 * s, 70 * s, 44 * s, 44 * s, '▼', () => { this.scroll = Math.min(end + this.scroll - H + 40 * s, this.scroll + H * 0.6); this.panel.dirty = true }, { align: 'center' })
    }
    // the briefing of the chosen mission
    const m = MISSIONS.find(q => q.id === this.mission)
    if (m) {
      const bx = W > 900 * s ? x + w + 40 * s : x, by = W > 900 * s ? 110 * s : y + items.length * 54 * s + 20 * s, bw = Math.min(560 * s, W - bx - 30 * s)
      const yy = drawBriefing(c, m, bx, by, bw, s)
      p.button(c, 'deploy', bx, yy + 10 * s, 240 * s, 50 * s, 'DEPLOY', () => g.start('campaign', { mission: m.id }), { font: FONT(20 * s, 900), color: C.gold2 })
    } else if (W > 900 * s) text(c, 'Choose a mission for its briefing.', x + w + 40 * s, 130 * s, { size: 14 * s, color: C.dim })
  }
  // The server browser: every server hosted in this lot's session (the city puts everyone inside a lot in one
  // session of up to 16; a game cannot see other sessions), with its mode, map, players and time, a map of
  // the battle area, the teams, and Join, Host and Invite.
  page_online(c, p, W, H, s) {
    const g = this.g, room = g.p0.room, here = room?.players || [], all = serverList(room)
    const f = this.ofilter || 'all', list = all.filter(v => f === 'all' || (f === 'open' ? v.rows.length < v.max : v.kind === f))
    const narrow = W < 820 * s, x0 = 22 * s
    let y = (g.input.touch ? 58 : 24) * s - this.scroll
    text(c, 'MULTIPLAYER', x0, y + 26 * s, { size: 28 * s, weight: 900, color: C.gold2 })
    text(c, `SERVER BROWSER  ·  ${here.length} player${here.length === 1 ? '' : 's'} in this lot's session  ·  ${all.length} server${all.length === 1 ? '' : 's'}`, x0, y + 46 * s, { size: 12 * s, weight: 700, color: C.dim })
    y += 60 * s
    const fl = [['all', 'ALL'], ['tdm', 'TEAM DEATHMATCH'], ['domination', 'DOMINATION'], ['open', 'NOT FULL']]
    let fx = x0
    for (const [id, label] of fl) { c.font = FONT(11.5 * s, 700); const bw = c.measureText(label).width + 26 * s; p.button(c, 'flt' + id, fx, y, bw, 28 * s, label, () => { this.ofilter = id; this.panel.dirty = true }, { selected: f === id, align: 'center', font: FONT(11.5 * s, 700) }); fx += bw + 6 * s }
    y += 38 * s
    // ---- the list ----
    const tw = narrow ? W - x0 * 2 : Math.min(W * 0.6, 820 * s), rowH = 30 * s
    const cols = narrow ? [['SERVER', 0], ['MODE', 0.5], ['PLAYERS', 0.78]] : [['SERVER', 0], ['MODE', 0.4], ['MAP', 0.6], ['PLAYERS', 0.76], ['TIME', 0.9]]
    box(c, x0, y, tw, rowH)
    for (const [label, at] of cols) text(c, label, x0 + 10 * s + at * tw, y + 19 * s, { size: 10.5 * s, weight: 800, color: C.gold })
    y += rowH + 2 * s
    const sel = list.find(v => v.id === this.osel) || list[0] || null
    const listTop = y, maxRows = Math.max(3, Math.floor((narrow ? H * 0.32 : H - y - 90 * s) / (rowH + 3 * s)))
    if (!list.length) {
      box(c, x0, y, tw, rowH * 2.4)
      text(c, all.length ? 'No servers match the filter.' : 'No servers in this session yet.', x0 + 14 * s, y + 26 * s, { size: 14 * s, weight: 700 })
      text(c, all.length ? '' : 'Host one: everyone who enters the lot sees it here and can join.', x0 + 14 * s, y + 46 * s, { size: 12 * s, color: C.dim })
      y += rowH * 2.4 + 6 * s
    }
    for (const v of list.slice(0, maxRows)) {
      const on = v === sel, full = v.rows.length >= v.max
      p.button(c, 'srv' + v.id, x0, y, tw, rowH, '', () => { this.osel = v.id; this.panel.dirty = true }, { selected: on })
      const dot = v.status === 'In progress' ? C.green : v.status === 'Waiting for players' ? C.amber : C.dim
      c.fillStyle = dot; c.beginPath(); c.arc(x0 + 12 * s, y + rowH / 2, 4 * s, 0, Math.PI * 2); c.fill()
      const cell = (str, at, o = {}) => text(c, str, x0 + 10 * s + at * tw + (at === 0 ? 12 * s : 0), y + 19.5 * s, { size: 12 * s, weight: at === 0 ? 700 : 500, color: o.color || C.text, max: o.max })
      cell(v.name, 0, { max: tw * (narrow ? 0.46 : 0.37) - 14 * s })
      cell(ONLINE_KINDS[v.kind]?.name || v.kind, cols[1][1], { max: tw * 0.2 })
      if (!narrow) cell(PLACES.find(q => q.id === v.place)?.name.replace('Camp ', '') || v.place, 0.6, { max: tw * 0.15 })
      cell(`${v.rows.length} / ${v.max}`, narrow ? 0.78 : 0.76, { color: full ? C.red : C.text })
      if (!narrow) cell(v.left > 0 ? `${Math.floor(v.left / 60)}:${String(Math.floor(v.left % 60)).padStart(2, '0')}` : 'next round', 0.9)
      y += rowH + 3 * s
    }
    if (list.length > maxRows) { text(c, `+ ${list.length - maxRows} more (scroll)`, x0, y + 12 * s, { size: 11 * s, color: C.dim }); y += 18 * s }
    // ---- the selected server: map, details, teams ----
    const dx = narrow ? x0 : x0 + tw + 18 * s, dw = narrow ? W - x0 * 2 : W - dx - x0
    let dy = narrow ? y + 8 * s : listTop - rowH - 2 * s
    if (sel) {
      const P = PLACES.find(q => q.id === sel.place)
      const ms = Math.min(dw, narrow ? 200 * s : 260 * s)
      this.mapPreview(c, dx, dy, ms, P, s)
      let ty = dy + 4 * s
      const tx = narrow ? dx + ms + 12 * s : dx, tW = narrow ? dw - ms - 12 * s : dw
      if (!narrow) ty = dy + ms + 10 * s
      text(c, sel.name, tx, ty + 16 * s, { size: 16 * s, weight: 800, color: C.gold2, max: tW })
      const hour = sel.hour ?? 13, tod = hour < 7 ? 'Dawn' : hour < 17 ? 'Day' : hour < 20 ? 'Dusk' : 'Night'
      const lines = [['Mode', ONLINE_KINDS[sel.kind]?.name], ['Map', P?.name], ['Host', sel.hostName || '—'], ['Players', `${sel.rows.length} of ${sel.max}`], ['Round', `${sel.round}, ${sel.minutes} min, to ${sel.limit}`], ['Time, weather', `${tod}, ${WEATHER[sel.weather]?.name || 'Clear'}`], ['Status', sel.status]]
      ty += 24 * s
      for (const [k, v] of lines) { text(c, k.toUpperCase(), tx, ty + 12 * s, { size: 10 * s, weight: 700, color: C.dim }); text(c, v || '', tx + 92 * s, ty + 12 * s, { size: 12 * s, weight: 600, max: tW - 92 * s }); ty += 17 * s }
      const teams = { A: sel.rows.filter(r => r.team === 'A'), B: sel.rows.filter(r => r.team === 'B') }
      ty = Math.max(ty, narrow ? dy + ms : 0) + 8 * s
      const half = (dw - 10 * s) / 2
      for (const [i, t] of ['A', 'B'].entries()) {
        const cx = dx + i * (half + 10 * s)
        text(c, `${t === 'A' ? 'VDF' : 'NLF'}  (${teams[t].length})`, cx, ty + 12 * s, { size: 11 * s, weight: 800, color: t === 'A' ? '#5ab0ff' : '#e0483a' })
        teams[t].slice(0, 8).forEach((r, k) => text(c, `${r.name || 'Player'}   ${r.k || 0}/${r.d || 0}`, cx, ty + 30 * s + k * 15 * s, { size: 11 * s, max: half }))
        if (!teams[t].length) text(c, '—', cx, ty + 30 * s, { size: 11 * s, color: C.dim })
      }
      dy = ty + 30 * s + Math.max(1, teams.A.length, teams.B.length) * 15 * s
    } else dy += 10 * s
    // ---- actions ----
    const by = Math.max(narrow ? dy + 8 * s : H - 70 * s - this.scroll, y + 8 * s), full = sel && sel.rows.length >= sel.max
    let bx = x0, bY = by
    // two to a row on a narrow screen
    const half = (W - x0 * 2 - 8 * s) / 2
    const act = (id, label, fn, w, o = {}) => {
      if (narrow) { w = half; if (bx + w > W - x0 + 1) { bx = x0; bY += 54 * s } }
      p.button(c, id, bx, bY, w, 46 * s, label, fn, { align: 'center', font: FONT(15 * s, 900), ...o }); bx += w + 8 * s
    }
    act('join', sel ? (full ? 'SERVER FULL' : 'JOIN') : 'JOIN', sel && !full ? () => g.start('online', { server: sel.id }) : null, 150 * s, { color: C.gold2 })
    act('host', 'HOST SERVER', () => this.open('host', true), 170 * s)
    if (g.p0.invite) act('invite', 'INVITE', sel ? () => { try { g.p0.invite({ kind: 'team', note: `Join ${sel.name}: ${ONLINE_KINDS[sel.kind]?.name} at ${PLACES.find(q => q.id === sel.place)?.name}`, data: { srv: sel.id } }) } catch {} } : null, 120 * s)
    act('back', 'BACK', () => this.back(), 110 * s)
    text(c, 'Real players only, no AI. Several servers can run at once in the session.', x0, bY + 62 * s, { size: 11 * s, color: C.dim })
  }
  // a piece of the island map round a place, with a grid, the battle area and its name (like a map screen)
  mapPreview(c, x, y, size, P, s) {
    box(c, x, y, size, size)
    const img = mapImage()
    if (img && P) {
      const R = Math.max(500, Math.min(900, P.r * 2.2)), [mx, my] = worldToMap(P.x, P.z, img.width), pr = R / 12000 * img.width
      c.save(); c.beginPath(); c.rect(x + 2, y + 2, size - 4, size - 4); c.clip()
      c.drawImage(img, mx - pr, my - pr, pr * 2, pr * 2, x, y, size, size)
      // grid every 200 m
      c.strokeStyle = 'rgba(20,24,16,0.35)'; c.lineWidth = 1
      const k = size / (R * 2), g0x = Math.ceil((P.x - R) / 200) * 200, g0z = Math.ceil((P.z - R) / 200) * 200
      for (let gx = g0x; gx < P.x + R; gx += 200) { const px = x + (gx - P.x + R) * k; c.beginPath(); c.moveTo(px, y); c.lineTo(px, y + size); c.stroke() }
      for (let gz = g0z; gz < P.z + R; gz += 200) { const py = y + (gz - P.z + R) * k; c.beginPath(); c.moveTo(x, py); c.lineTo(x + size, py); c.stroke() }
      // the battle area
      const ar = Math.max(150, Math.min(P.r * 0.8, 280)) * 1.25 * k
      c.strokeStyle = 'rgba(224,72,58,0.9)'; c.lineWidth = 2; c.setLineDash([6 * s, 4 * s]); c.beginPath(); c.arc(x + size / 2, y + size / 2, ar, 0, Math.PI * 2); c.stroke(); c.setLineDash([])
      c.restore()
      text(c, P.name.toUpperCase(), x + 8 * s, y + size - 10 * s, { size: 11 * s, weight: 800, color: '#fff', shadow: true })
      text(c, `${Math.round(R * 2 / 100) / 10} km`, x + size - 8 * s, y + 16 * s, { size: 10 * s, align: 'right', color: '#fff', shadow: true })
    }
  }
  // hosting: name, mode, map, length, slots, time of day, weather
  page_host(c, p, W, H, s) {
    const g = this.g, o = this.osetup, me = g.p0.me?.name || 'Player'
    const narrow = W < 820 * s, x = 30 * s, w = Math.min(640 * s, W - x * 2)
    let y = (g.input.touch ? 58 : 26) * s - this.scroll
    text(c, 'HOST A SERVER', x, y + 26 * s, { size: 26 * s, weight: 900, color: C.gold2 }); y += 46 * s
    const names = [`${me}'s server`, 'Casual', 'Hardcore', 'Clan war', 'Newcomers welcome']
    if (!names.includes(o.name)) o.name = names[0]
    y = this.choices(c, p, x, y, w, 'Name', names.map(n => ({ label: n.length > 16 ? n.slice(0, 15) + '…' : n, v: n })), o.name, v => { o.name = v }, s)
    y = this.choices(c, p, x, y, w, 'Mode', Object.entries(ONLINE_KINDS).map(([k, v]) => ({ label: v.name, v: k })), o.kind, v => { o.kind = v }, s)
    y = this.choices(c, p, x, y, w, 'Map', ONLINE_PLACES.map(id => ({ label: PLACES.find(q => q.id === id).name.replace('Camp ', ''), v: id })), o.place, v => { o.place = v }, s)
    y = this.choices(c, p, x, y, w, 'Round length', [8, 12, 20, 30].map(n => ({ label: `${n} min`, v: n })), o.minutes, v => { o.minutes = v }, s)
    y = this.choices(c, p, x, y, w, 'Slots', [4, 8, 12, 16].map(n => ({ label: String(n), v: n })), o.max ?? 16, v => { o.max = v }, s)
    y = this.choices(c, p, x, y, w, 'Time of day', [[6.5, 'Dawn'], [13, 'Day'], [18.5, 'Dusk'], [23, 'Night']].map(([v, label]) => ({ label, v })), o.hour ?? 13, v => { o.hour = v }, s)
    y = this.choices(c, p, x, y, w, 'Weather', ['clear', 'overcast', 'fog', 'rain'].map(k => ({ label: WEATHER[k].name, v: k })), o.weather || 'clear', v => { o.weather = v }, s)
    const ms = Math.min(220 * s, narrow ? W - x * 2 : W - x - w - 50 * s)
    if (ms > 120 * s) { if (narrow) { this.mapPreview(c, x, y + 6 * s, ms, PLACES.find(q => q.id === o.place), s); y += ms + 14 * s } else this.mapPreview(c, x + w + 24 * s, 110 * s - this.scroll, ms, PLACES.find(q => q.id === o.place), s) }
    y += 10 * s
    p.button(c, 'create', x, y, 260 * s, 50 * s, 'CREATE AND JOIN', () => g.start('online', { ...o }), { align: 'center', font: FONT(17 * s, 900), color: C.gold2 })
    p.button(c, 'back', x + 272 * s, y, 130 * s, 50 * s, 'BACK', () => this.back(), { align: 'center' })
  }
  page_arsenal(c, p, W, H, s) { drawArsenal(this, c, p, W, H, s) }
  page_results(c, p, W, H, s) {
    const g = this.g, r = g.mode?.results?.() || { title: '', lines: [] }, x = W / 2
    text(c, r.title, x, H * 0.24, { size: 48 * s, weight: 900, align: 'center', color: r.title === 'VICTORY' ? C.gold2 : r.title === 'DEFEAT' ? C.red : C.text, shadow: true })
    text(c, r.reason, x, H * 0.24 + 32 * s, { size: 15 * s, align: 'center', color: C.dim })
    let y = H * 0.24 + 74 * s
    for (const l of r.lines) { c.font = FONT(16 * s, 600); if (c.measureText(l).width > W - 60 * s) { c.textAlign = 'left'; y = wrap(c, l, 30 * s, y, W - 60 * s, 22 * s, { size: 15 * s }) + 4 * s } else { text(c, l, x, y, { size: 16 * s, align: 'center' }); y += 26 * s } }
    const w = Math.min(380 * s, W - 40 * s)
    this.column(c, p, x - w / 2, y + 10 * s, w, [
      r.next ? { id: 'next', label: `NEXT MISSION: ${r.next.name.toUpperCase()}`, fn: () => g.start('campaign', { mission: r.next.id }) } : null,
      { id: 'again', label: g.modeId === 'campaign' ? 'PLAY THE MISSION AGAIN' : 'PLAY AGAIN', fn: () => { const o = { ...g.mode.opts }; g.start(g.modeId, o) } },
      g.modeId === 'online' ? { id: 'browser', label: 'SERVER BROWSER', fn: () => { g.quitToMenu(); this.open('online', true) } } : null,
      { id: 'menu', label: 'MAIN MENU', fn: () => g.quitToMenu() }], s)
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
    tog('Touch: stick turns', !!st.stickTurns, v => { st.stickTurns = v })
    tog('Touch: aim assist', st.aimAssist !== false, v => { st.aimAssist = v })
    y = this.choices(c, p, x, y, w, 'Default view', [{ label: 'First person', v: 'fp' }, { label: 'Third person', v: 'tp' }], st.view, v => { st.view = v; g.save.store() }, s)
    tog('Compass', st.hud.compass, v => { st.hud.compass = v })
    tog('Minimap', st.hud.minimap, v => { st.hud.minimap = v })
    tog('Waypoint and objective markers', st.hud.markers !== false, v => { st.hud.markers = v })
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
      g.mode?.loadouts && g.player && !g.player.s.dead ? { id: 'arsenal', label: 'ARSENAL', sub: 'Every weapon, attachment and item: change kit, save loadouts', fn: () => openArsenal(this) } : null,
      { id: 'settings', label: 'SETTINGS', fn: () => this.open('settings', true) },
      { id: 'controls', label: 'CONTROLS', fn: () => this.open('controls', true) },
      g.player && !g.player.s.dead && !g.player.s.vehicle ? { id: 'unstuck', label: 'UNSTUCK', sub: 'Stuck in a wall or a hole? Move to clear ground nearby', fn: () => { g.unstuck(); g.resume() } } : null,
      'sep',
      { id: 'quit', label: 'SAVE AND QUIT TO MENU', fn: () => { g.mode?.persist?.(); g.quitToMenu() } },
    ].filter(Boolean).map(v => v === 'sep' ? null : v)
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
    grid('GEAR: TAKE ONE ([Y] uses it, [U] picks the next)', [['mine', 'AT mine'], ['c4', 'Demolition charge'], ['sandbags', 'Sandbag kit'], ['radio', 'Field radio (mortars)'], ['ghillie', 'Ghillie suit (wear)'], ['ration', 'Ration'], ['splint', 'Splint'], ['morphine', 'Painkiller'], ['medkit', 'Medkit']].map(([id, l]) => ({ label: l, fn: act('item', id, false) })))
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
