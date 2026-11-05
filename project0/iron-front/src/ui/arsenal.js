// The Arsenal: every weapon, attachment, piece of clothing and item, to make a loadout and keep it in one
// of six slots. From the main menu it edits the saved loadouts; in Free Roam and Battle (pause menu) it can
// also equip one at once. A slot marked "use when deploying" is worn whenever you deploy in those modes.
import { C, FONT, text, box } from './ui.js'
import { WEAPONS, CATEGORIES, ATTACHMENTS, attachmentsFor, stats, weapon } from '../combat/weapons-data.js'
import { CLOTHING, ITEMS, SLOTS, defaultAtt } from '../game/inventory.js'
import { LOADOUT_SLOTS, ARSENAL_ITEMS, blankLoadout, copyLoadout, loadoutName, buildInventory, loadoutFrom } from '../game/loadout.js'

const TABS = [['primary', 'PRIMARY'], ['att', 'ATTACHMENTS'], ['sidearm', 'SIDEARM'], ['launcher', 'LAUNCHER'], ['clothing', 'CLOTHING'], ['items', 'ITEMS'], ['slots', 'LOADOUTS']]
const PRIMARY_CATS = ['rifle', 'battle', 'smg', 'lmg', 'mmg', 'dmr', 'sniper', 'shotgun']

// the arsenal's working state lives on the menus object
export function openArsenal(menus) {
  const g = menus.g, d = g.save.data
  const saved = d.loadouts || []
  const start = g.player && !g.player.s.dead && g.mode?.loadouts ? loadoutFrom(g.player.s.inv) : saved[d.loadoutUse ?? -1] || saved.find(Boolean) || blankLoadout()
  menus.ars = { L: copyLoadout(start), tab: 'primary', cat: 'rifle' }
  menus.open('arsenal', true)
}
export function canEquipNow(g) { return !!(g.player && !g.player.s.dead && g.mode?.loadouts && g.state !== 'menu') }
export function equip(g, L) {
  const s = g.player.s, { inv, missed } = buildInventory(L)
  s.inv = inv; s.pack = !!inv.worn.backpack
  s.selectWeapon(inv.weapons.primary ? 'primary' : inv.weapons.sidearm ? 'sidearm' : 'launcher', true)
  g.player.rebuildViewmodel()
  g.hud.note(missed ? `Loadout on: ${missed} thing${missed === 1 ? '' : 's'} did not fit` : 'Loadout on', C.gold2)
}

export function drawArsenal(m, c, p, W, H, s) {
  const g = m.g, A = m.ars || (openArsenal(m), m.ars), L = A.L, d = g.save.data
  const x = 26 * s, w = W - x * 2
  let y = (g.input.touch ? 58 : 24) * s - m.scroll
  const dirty = () => { m.panel.dirty = true }
  text(c, 'ARSENAL', x, y + 26 * s, { size: 26 * s, weight: 900, color: C.gold2 })
  const built = buildInventory(L)
  text(c, `${loadoutName(L)}   ·   ${built.weight.toFixed(1)} kg${built.missed ? `   ·   ${built.missed} thing${built.missed === 1 ? '' : 's'} will not fit: wear a bigger vest or pack` : '   ·   everything fits'}`, x, y + 46 * s, { size: 12 * s, weight: 700, color: built.missed ? C.amber : C.dim, max: w })
  y += 58 * s
  // tabs
  let tx = x
  for (const [id, label] of TABS) { c.font = FONT(11.5 * s, 800); const bw = c.measureText(label).width + 24 * s; if (tx + bw > x + w) { tx = x; y += 34 * s } p.button(c, 'tab' + id, tx, y, bw, 30 * s, label, () => { A.tab = id; m.scroll = 0; dirty() }, { selected: A.tab === id, align: 'center', font: FONT(11.5 * s, 800) }); tx += bw + 5 * s }
  y += 42 * s
  const grid = (key, items, bw = 168 * s, bh = 32 * s) => {
    const per = Math.max(1, Math.floor((w + 6 * s) / (bw + 6 * s)))
    items.forEach((it, i) => p.button(c, key + i, x + (i % per) * (bw + 6 * s), y + Math.floor(i / per) * (bh + 6 * s), bw, bh, it.label, it.fn, { font: FONT(11.5 * s, 700), selected: it.on, align: 'center', sub: it.sub }))
    y += Math.ceil(items.length / per) * (bh + 6 * s) + 8 * s
  }
  const label = (t) => { text(c, t, x, y + 14 * s, { size: 12.5 * s, weight: 800, color: C.gold }); y += 22 * s }
  const pickWeapon = (slot, def) => () => { L.weapons[slot] = def ? { id: def.id, att: defaultAtt(def) } : null; dirty() }
  const statLine = (slot) => { const r = L.weapons[slot], def = r && weapon(r.id); if (!def) return; const st = stats(def, r.att || {}); text(c, `${def.name}: ${def.desc || ''}   ·   ${def.ammo} · ${st.mag} rounds · ${def.rpm} rpm · ${(st.weight || def.weight || 0).toFixed(1)} kg`, x, y + 12 * s, { size: 11.5 * s, color: C.text, max: w }); y += 24 * s }
  if (A.tab === 'primary') {
    label('CATEGORY')
    grid('cat', PRIMARY_CATS.map(k => ({ label: CATEGORIES[k], on: A.cat === k, fn: () => { A.cat = k; dirty() } })), 150 * s, 30 * s)
    statLine('primary')
    label('PRIMARY WEAPON')
    grid('pw', [{ label: 'None', on: !L.weapons.primary, fn: pickWeapon('primary', null) }, ...WEAPONS.filter(d => d.slot === 'primary' && d.cat === A.cat).map(d => ({ label: d.name, on: L.weapons.primary?.id === d.id, fn: pickWeapon('primary', d) }))])
  } else if (A.tab === 'sidearm' || A.tab === 'launcher') {
    const slot = A.tab
    statLine(slot)
    label(slot === 'sidearm' ? 'SIDEARM' : 'LAUNCHER')
    grid('sw', [{ label: 'None', on: !L.weapons[slot], fn: pickWeapon(slot, null) }, ...WEAPONS.filter(d => d.slot === slot).map(d => ({ label: d.name, on: L.weapons[slot]?.id === d.id, fn: pickWeapon(slot, d) }))])
  } else if (A.tab === 'att') {
    for (const slot of ['primary', 'sidearm']) {
      const r = L.weapons[slot], def = r && weapon(r.id)
      if (!def) continue
      label(`${slot === 'primary' ? 'PRIMARY' : 'SIDEARM'}: ${def.name.toUpperCase()}`)
      for (const [type, ids] of Object.entries(attachmentsFor(def))) {
        if (!ids.length) continue
        text(c, type.toUpperCase(), x, y + 13 * s, { size: 11 * s, weight: 700, color: C.dim }); y += 18 * s
        const list = type === 'optic' ? ids : ['none', ...ids]
        grid(slot + type, list.map(id => ({ label: id === 'none' ? 'None' : ATTACHMENTS[id].name, on: (r.att[type] || (type === 'optic' ? 'iron' : 'none')) === id, fn: () => { if (id === 'none' || (type === 'optic' && id === 'iron')) delete r.att[type]; else r.att[type] = id; dirty() } })), 150 * s, 28 * s)
      }
    }
  } else if (A.tab === 'clothing') {
    for (const slot of SLOTS) {
      const ids = Object.entries(CLOTHING).filter(([, v]) => v.slot === slot).map(([k]) => k)
      if (!ids.length) continue
      label(slot.toUpperCase())
      grid('cl' + slot, [{ label: 'None', on: !L.worn[slot], fn: () => { delete L.worn[slot]; dirty() } }, ...ids.map(id => ({ label: CLOTHING[id].name, on: L.worn[slot] === id, sub: CLOTHING[id].cap ? `+${CLOTHING[id].cap} space` : CLOTHING[id].armor ? 'armour' : '', fn: () => { L.worn[slot] = id; dirty() } }))], 150 * s, 34 * s)
    }
  } else if (A.tab === 'items') {
    const row = (key, name, n, set) => {
      p.button(c, key + '-', x, y, 36 * s, 28 * s, '−', () => { set(Math.max(0, n - 1)); dirty() }, { align: 'center', font: FONT(16 * s, 800) })
      text(c, String(n), x + 58 * s, y + 19 * s, { size: 14 * s, weight: 800, align: 'center' })
      p.button(c, key + '+', x + 80 * s, y, 36 * s, 28 * s, '+', () => { set(Math.min(20, n + 1)); dirty() }, { align: 'center', font: FONT(16 * s, 800) })
      text(c, name, x + 128 * s, y + 19 * s, { size: 13 * s, weight: 600 }); y += 32 * s
    }
    label('MAGAZINES')
    for (const slot of ['primary', 'sidearm', 'launcher']) { const r = L.weapons[slot]; if (!r) continue; const def = weapon(r.id); if (def.disposable) continue; row('m' + slot, `${def.name} (${def.ammo})`, L.mags[slot] || 0, v => { L.mags[slot] = v }) }
    for (const [grp, ids] of Object.entries(ARSENAL_ITEMS)) { label(grp.toUpperCase()); for (const id of ids) row('i' + id, ITEMS[id].name, L.items[id] || 0, v => { if (v) L.items[id] = v; else delete L.items[id] }) }
  } else if (A.tab === 'slots') {
    const saved = d.loadouts || (d.loadouts = [])
    label('SAVED LOADOUTS (kept with your save)')
    for (let i = 0; i < LOADOUT_SLOTS; i++) {
      const S = saved[i], use = d.loadoutUse === i
      box(c, x, y, w, 46 * s)
      text(c, `${i + 1}.  ${S ? loadoutName(S) : 'Empty'}${use ? '   · used when deploying' : ''}`, x + 12 * s, y + 28 * s, { size: 13 * s, weight: 700, color: S ? C.text : C.dim, max: w * 0.5 })
      const bx = x + w - 6 * s
      const act = (k, t, fn, bw = 88 * s) => p.button(c, `sl${i}${k}`, bx - bw - (k === 'save' ? 0 : k === 'load' ? 94 * s : 188 * s), y + 7 * s, bw, 32 * s, t, fn, { align: 'center', font: FONT(11 * s, 800), selected: k === 'use' && use })
      act('save', 'SAVE HERE', () => { saved[i] = copyLoadout(L); g.save.store(); g.hud?.note(`Saved in slot ${i + 1}`); dirty() })
      if (S) act('load', 'LOAD', () => { A.L = copyLoadout(S); dirty() })
      if (S) act('use', use ? 'IN USE' : 'USE', () => { d.loadoutUse = use ? null : i; g.save.store(); dirty() })
      y += 52 * s
    }
    text(c, 'USE: wear that loadout whenever you deploy (or respawn) in Free Roam and Battle.', x, y + 12 * s, { size: 11.5 * s, color: C.dim, max: w }); y += 26 * s
  }
  // bottom: equip now (in a mode that allows it), back
  y += 8 * s
  if (canEquipNow(g)) { p.button(c, 'equip', x, y, 220 * s, 46 * s, 'EQUIP NOW', () => { equip(g, L); m.back() }, { align: 'center', font: FONT(16 * s, 900), color: C.gold2 }) }
  p.button(c, 'back', x + (canEquipNow(g) ? 230 * s : 0), y, 140 * s, 46 * s, 'BACK', () => m.back(), { align: 'center' })
  y += 56 * s
  m.maxScroll = Math.max(0, y + m.scroll - H + 10 * s)
  if (m.scroll > m.maxScroll) m.scroll = m.maxScroll
  if (m.maxScroll > 0) {
    p.button(c, 'up', W - 60 * s, 90 * s, 44 * s, 44 * s, '▲', () => { m.scroll = Math.max(0, m.scroll - H * 0.6); dirty() }, { align: 'center' })
    p.button(c, 'dn', W - 60 * s, 140 * s, 44 * s, 44 * s, '▼', () => { m.scroll += H * 0.6; dirty() }, { align: 'center' })
  }
}
