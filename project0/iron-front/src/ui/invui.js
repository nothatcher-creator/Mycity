// The inventory screen (Tab): what you wear (it decides how much you can carry), your pockets, vest and
// backpack with their space, your weapons and their attachments, and, when searching a body or a stash,
// what lies there. Click an item for its actions: use, move, drop, take, wear.
import { Panel, C, FONT, text, box, bar } from './ui.js'
import { itemName, itemSize, itemWeight, CLOTHING, ITEMS, SLOTS, newMag } from '../game/inventory.js'
import { weapon, ATTACHMENTS, attachmentsFor, stats } from '../combat/weapons-data.js'

const CONT = [['pockets', 'POCKETS'], ['vest', 'VEST'], ['backpack', 'BACKPACK']]

export class InventoryUI {
  constructor(game) {
    this.g = game
    this.panel = game.ui.add(new Panel(game.ui, 0, 0, 10, 10, (c, p) => this.draw(c, p), { modal: true, order: 12 }))
    this.panel.show(false)
    this.sel = null        // { item, from: 'pockets' | ... | 'ground' }
    this.wsel = null       // weapon slot being customised
    this.loot = null
  }
  get visible() { return this.panel.visible }
  layout() { const e = this.g.engine; this.panel.place(0, 0, e.width, e.height); this.s = Math.max(0.45, Math.min(1.15, Math.min(e.width / 1280, e.height / 720))) }
  open(loot = null) {
    this.loot = loot; this.sel = null; this.wsel = null
    this.layout(); this.panel.show(true)
    this.g.p0.input.unlockPointer()
  }
  close() { if (!this.visible) return; this.panel.show(false); this.loot = null; if (this.g.state === 'play' && !this.g.input.touch && !this.g.menus.visible && !this.g.map.visible) this.g.p0.input.lockPointer() }
  pointerDown() {} pointerMove() {} pointerUp() {}
  update() { if (this.loot && this.g.player && Math.hypot(this.loot.x - this.g.player.s.pos.x, this.loot.z - this.g.player.s.pos.z) > 3) this.loot = null }
  dirty() { this.panel.dirty = true }
  draw(c, p) {
    const g = this.g, s = g.player?.s, k = this.s, W = p.w, H = p.h
    c.fillStyle = 'rgba(8,10,7,0.82)'; c.fillRect(0, 0, W, H)
    if (!s) return
    const inv = s.inv
    text(c, 'INVENTORY', 24 * k, 38 * k, { size: 24 * k, weight: 900 })
    const wt = inv.weight()
    text(c, `Load ${wt.toFixed(1)} kg${wt > 30 ? '  (heavy: slower, tires faster)' : ''}`, 200 * k, 36 * k, { size: 13 * k, color: wt > 30 ? C.gold2 : C.dim })
    p.button(c, 'close', W - 140 * k, 14 * k, 120 * k, 36 * k, 'CLOSE [Tab]', () => this.close(), { align: 'center', font: FONT(13 * k, 700) })
    const colW = Math.min(360 * k, (W - 60 * k) / (this.loot ? 3 : 2.2))
    // ---- column 1: worn clothes and weapons ----
    let x = 20 * k, y = 64 * k
    text(c, 'WORN', x, y + 12 * k, { size: 12 * k, weight: 800, color: C.gold }); y += 20 * k
    for (const slot of SLOTS) {
      const id = inv.worn[slot], def = CLOTHING[id]
      const label = def ? def.name : '—'
      const sub = def ? [def.cap ? `+${def.cap} space` : '', def.armor ? `armour ${Object.entries(def.armor).map(([a, v]) => a + ' ' + v).join(', ')}` : ''].filter(Boolean).join(' · ') : ''
      p.button(c, 'w' + slot, x, y, colW, 26 * k, `${slot.toUpperCase()}: ${label}`, def ? () => { this.sel = { clothing: slot }; this.dirty() } : null, { font: FONT(12 * k, 600), selected: this.sel?.clothing === slot, color: def ? C.text : C.dim })
      if (sub) text(c, sub, x + colW - 8 * k, y + 17 * k, { size: 10 * k, align: 'right', color: C.dim })
      y += 29 * k
    }
    y += 6 * k
    text(c, 'WEAPONS', x, y + 12 * k, { size: 12 * k, weight: 800, color: C.gold }); y += 20 * k
    for (const slot of ['primary', 'launcher', 'sidearm']) {
      const w = inv.weapons[slot], def = w && weapon(w.id)
      p.button(c, 'wp' + slot, x, y, colW, 34 * k, def ? def.name : `${slot}: —`, def ? () => { this.wsel = slot; this.sel = null; this.dirty() } : null, { sub: def ? `${slot} · ${w.mag + (w.chamber || 0)} loaded · ${Object.values(w.att || {}).map(a => ATTACHMENTS[a]?.name).filter(Boolean).join(', ') || 'no attachments'}` : '', font: FONT(13 * k, 700), selected: this.wsel === slot, color: def ? C.text : C.dim })
      y += 38 * k
    }
    // ---- column 2: containers ----
    x = 20 * k + colW + 20 * k; y = 64 * k
    for (const [cid, label] of CONT) {
      const cap = inv.capacity(cid), used = inv.used(cid)
      if (cap <= 0 && cid !== 'pockets') { text(c, `${label}: none worn`, x, y + 12 * k, { size: 12 * k, color: C.dim }); y += 24 * k; continue }
      text(c, label, x, y + 12 * k, { size: 12 * k, weight: 800, color: C.gold })
      bar(c, x + 90 * k, y + 4 * k, colW - 170 * k, 8 * k, used / Math.max(1, cap), used > cap ? C.red : C.gold)
      text(c, `${+used.toFixed(1)}/${cap}`, x + colW, y + 12 * k, { size: 11 * k, align: 'right', color: C.dim }); y += 20 * k
      for (const it of inv.containers[cid]) {
        if (y > H - 40 * k) break
        p.button(c, 'i' + cid + inv.containers[cid].indexOf(it), x, y, colW, 24 * k, itemName(it), () => { this.sel = { item: it, from: cid }; this.wsel = null; this.dirty() }, { font: FONT(12 * k, 600), selected: this.sel?.item === it })
        text(c, `${itemSize(it)} · ${itemWeight(it).toFixed(1)} kg`, x + colW - 8 * k, y + 16 * k, { size: 10 * k, align: 'right', color: C.dim })
        y += 26 * k
      }
      y += 8 * k
    }
    // ---- column 3: the ground / the body ----
    const lx = x + colW + 20 * k
    if (this.loot) {
      let ly = 64 * k
      text(c, this.loot.name.toUpperCase(), lx, ly + 12 * k, { size: 12 * k, weight: 800, color: C.gold }); ly += 20 * k
      const bw = this.loot.body?.inv?.weapons || null
      if (bw) for (const slot of ['primary', 'launcher', 'sidearm']) {
        const w = bw[slot]; if (!w) continue
        p.button(c, 'lw' + slot, lx, ly, colW, 30 * k, `Take ${weapon(w.id).name}`, () => this.takeWeapon(bw, slot), { font: FONT(12 * k, 700), sub: `${slot} · swaps with yours` })
        ly += 34 * k
      }
      if (this.loot.body?.inv) for (const slot of ['vest', 'backpack', 'head']) {
        const id = this.loot.body.inv.worn[slot]; if (!id) continue
        p.button(c, 'lc' + slot, lx, ly, colW, 26 * k, `Wear their ${CLOTHING[id].name}`, () => this.takeClothing(slot), { font: FONT(12 * k, 600) })
        ly += 29 * k
      }
      for (const it of this.loot.items) {
        if (ly > H - 40 * k) break
        p.button(c, 'l' + this.loot.items.indexOf(it), lx, ly, colW, 24 * k, itemName(it), () => this.take(it), { font: FONT(12 * k, 600) })
        text(c, 'take', lx + colW - 8 * k, ly + 16 * k, { size: 10 * k, align: 'right', color: C.dim })
        ly += 26 * k
      }
      if (!this.loot.items.length && !bw) text(c, 'Nothing left.', lx, ly + 14 * k, { size: 12 * k, color: C.dim })
      if (this.loot.items.length) p.button(c, 'takeall', lx, Math.min(ly + 6 * k, H - 50 * k), colW, 32 * k, 'TAKE ALL THAT FITS', () => { for (const it of [...this.loot.items]) this.take(it, true); this.dirty() }, { align: 'center', font: FONT(13 * k, 800) })
    }
    // ---- the selected thing's actions (bottom bar) ----
    const ay = H - 56 * k
    const acts = []
    if (this.sel?.item) {
      const it = this.sel.item, def = ITEMS[it.id]
      if (def?.kind === 'med') acts.push(['Use', () => { s.treat(it.id); this.sel = null }])
      if (def?.gear) { acts.push(['Use now', () => { this.close?.(); g.gear.use(s, it.id); this.sel = null }]); acts.push(['Select for [Y]', () => { s.gearSel = it.id; g.hud.note(`Gear: ${def.name}`) }]) }
      if (it.id === 'nvg') acts.push(['Put on / off', () => { g.player.nvg = !g.player.nvg }])
      for (const [cid, label] of CONT) if (cid !== this.sel.from && inv.free(cid) >= itemSize(it)) acts.push([`Move to ${label.toLowerCase()}`, () => { inv.remove(it); inv.containers[cid].push(it); this.sel = { item: it, from: cid } }])
      acts.push(['Drop', () => { inv.remove(it); this.drop([it]); this.sel = null }])
    } else if (this.sel?.clothing) {
      const slot = this.sel.clothing
      acts.push([`Take off ${CLOTHING[inv.worn[slot]].name}`, () => { const r = inv.takeOff(slot); this.drop([{ kind: 'clothing', id: r.id }, ...r.spilled]); this.sel = null; s.pack = !!inv.worn.backpack }])
    }
    if (acts.length) {
      box(c, 0, ay - 8 * k, W, 64 * k, { fill: 'rgba(0,0,0,0.6)' })
      acts.forEach(([l, fn], i) => p.button(c, 'a' + i, 20 * k + i * 190 * k, ay, 180 * k, 40 * k, l, () => { fn(); this.dirty() }, { align: 'center', font: FONT(13 * k, 700) }))
    }
    // ---- weapon customisation ----
    if (this.wsel && inv.weapons[this.wsel]) this.drawAttachments(c, p, lx + (this.loot ? colW + 20 * k : 0) > W - colW ? lx : lx, 64 * k, colW, k)
  }
  drawAttachments(c, p, x, y, w, k) {
    const s = this.g.player.s, rec = s.inv.weapons[this.wsel], def = weapon(rec.id)
    if (this.loot) { x = 20 * k; y = this.panel.h - 330 * k; w = Math.min(this.panel.w - 40 * k, 900 * k) }
    box(c, x - 8 * k, y - 8 * k, w + 16 * k, 320 * k, { fill: 'rgba(14,18,12,0.95)' })
    text(c, def.name.toUpperCase(), x, y + 14 * k, { size: 15 * k, weight: 800, color: C.gold2 })
    text(c, def.desc || '', x, y + 32 * k, { size: 11 * k, color: C.dim, max: w })
    const st = stats(def, rec.att)
    text(c, `Recoil ${st.recoilV.toFixed(2)}  Sway ${st.sway.toFixed(2)}  Aim ${st.ads.toFixed(2)} s  Mag ${st.mag}  ${st.suppressed ? 'Suppressed' : ''}`, x, y + 50 * k, { size: 11 * k, color: C.text })
    let yy = y + 62 * k
    const opts = attachmentsFor(def)
    for (const [type, ids] of Object.entries(opts)) {
      if (!ids.length) continue
      text(c, type.toUpperCase(), x, yy + 16 * k, { size: 11 * k, weight: 800, color: C.gold })
      const list = type === 'optic' ? ids : ['none', ...ids]
      const bw = Math.max(70 * k, (w - 80 * k) / Math.min(list.length, 7) - 4 * k)
      list.slice(0, 14).forEach((id, i) => {
        const cur = (rec.att[type] || (type === 'optic' ? 'iron' : 'none')) === id
        const row = Math.floor(i / 7), col = i % 7
        p.button(c, `at${type}${id}`, x + 70 * k + col * (bw + 4 * k), yy + row * 28 * k, bw, 24 * k, id === 'none' ? 'None' : ATTACHMENTS[id].name, () => {
          if (id === 'none' || (type === 'optic' && id === 'iron')) delete rec.att[type]; else rec.att[type] = id
          s.refreshWeapon(); if (s.slot === this.wsel) { s.selectWeapon(this.wsel, true); this.g.player.rebuildViewmodel() }
          this.dirty()
        }, { font: FONT(10.5 * k, 600), selected: cur, align: 'center' })
      })
      yy += Math.ceil(Math.min(list.length, 14) / 7) * 28 * k + 4 * k
    }
    text(c, this.g.modeId === 'freeroam' ? 'Free Roam: every attachment is available from your field kit.' : '', x, y + 304 * k, { size: 10 * k, color: C.dim })
  }
  take(it, quiet = false) {
    const s = this.g.player.s
    if (!s.inv.add(it)) { if (!quiet) this.g.hud.note('No room for that'); return false }
    const i = this.loot.items.indexOf(it); if (i >= 0) this.loot.items.splice(i, 1)
    if (it.kind === 'clothing') { s.inv.remove(it); this.drop(s.inv.wear(it.id)); s.pack = !!s.inv.worn.backpack }
    this.g.sfx.ui('pickup'); this.dirty()
    return true
  }
  takeWeapon(bw, slot) {
    const s = this.g.player.s
    const mine = s.inv.weapons[slot]
    s.inv.weapons[slot] = bw[slot]; bw[slot] = mine
    // take some magazines that fit it
    const def = weapon(s.inv.weapons[slot].id)
    for (const it of [...this.loot.items]) if (it.kind === 'mag' && it.ammo === def.ammo) this.take(it, true)
    if (!s.inv.countAmmo(def) && !def.disposable) s.inv.add(newMag(def))
    s.selectWeapon(slot); this.g.player.rebuildViewmodel()
    this.g.sfx.ui('pickup'); this.dirty()
  }
  takeClothing(slot) {
    const s = this.g.player.s, b = this.loot.body
    const id = b.inv.worn[slot]; delete b.inv.worn[slot]
    const old = s.inv.worn[slot]
    if (old) { delete s.inv.worn[slot]; b.inv.worn[slot] = old }
    this.drop(s.inv.wear(id))
    s.pack = !!s.inv.worn.backpack
    this.dirty()
  }
  // Things dropped go on the ground under you (searchable like a body).
  drop(items) {
    if (!items.length) return
    const g = this.g, s = g.player.s
    let pile = this.loot && !this.loot.body ? this.loot : g.loot.find(l => !l.body && Math.hypot(l.x - s.pos.x, l.z - s.pos.z) < 1.5)
    if (!pile) { pile = { x: s.pos.x, y: s.pos.y, z: s.pos.z, items: [], name: 'the ground', t: g.time }; g.loot.push(pile) }
    pile.items.push(...items)
    if (!this.loot) this.loot = pile
  }
}
