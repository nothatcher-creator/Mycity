// Online Battle: real players in this lot's session, two teams, no AI. Team Deathmatch or Domination at one
// place on the island. The city only relays messages; every client runs its own game:
//   - each player sends where they are (10 times a second) and the shots they fire (in batches);
//   - every client draws the others as stand-ins and simulates everyone's bullets and grenades, but a
//     client only ever damages its own player (the victim decides: what you see hit you, hits you);
//   - deaths are announced by the victim, with the killer's id, and each player keeps their own score row
//     in the shared state (`pl:<id>`), so newcomers see the same table;
//   - the match (kind, place, seed, start) lives in the shared state; the host turns the flags and calls
//     the end of the match.
import * as THREE from 'three'
import { Mode } from './base.js'
import { PLACES } from '../../world/blueprint.js'
import { heightAt } from '../../world/heightfield.js'
import { FACTIONS } from '../../actors/factions.js'
import { kit } from '../inventory.js'
import { ROLES } from '../../actors/factions.js'
import { C, text, bar } from '../../ui/ui.js'

export const ONLINE_KINDS = { tdm: { name: 'Team Deathmatch', limit: 30 }, domination: { name: 'Domination', limit: 250 } }
export const ONLINE_PLACES = ['tovar', 'kaldor', 'halvik', 'dresk', 'sentinel', 'koriv']
const TEAM_F = { A: 'vdf', B: 'nlf' }
const LETTERS = 'ABC'
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const r1 = v => Math.round(v * 10) / 10

export class OnlineBattle extends Mode {
  get name() { return 'Online Battle' }
  get room() { return this.g.p0.room }
  get me() { return this.g.p0.me }
  setup() {
    const g = this.g, room = this.room, o = this.opts
    this.remotes = new Map()           // player id -> { s: Soldier, target: {...}, last: time }
    this.sendT = 0; this.shots = []
    g.difficulty = 0.5
    // a match: the one running, or a new one from the setup screen
    let m = room?.state?.match
    if (!m || room.state.over?.match === m.id || o.fresh) {
      m = { id: Math.floor(Math.random() * 1e9), kind: o.kind || 'tdm', place: o.place || 'tovar', seed: Math.floor(Math.random() * 1e9), start: Date.now(), minutes: o.minutes || 12 }
      m.limit = ONLINE_KINDS[m.kind].limit
      try { room?.set('match', m); room?.set('flags', null) } catch {}
    }
    this.m = m
    this.kind = m.kind
    this.place = PLACES.find(p => p.id === m.place)
    g.sky.hour = 13; g.sky.setWeather('clear'); g.sky.cycle = false
    // bases and flags, the same on every client (from the match's seed)
    const rand = mulberry(m.seed), P = this.place, a = rand() * Math.PI * 2, R = Math.max(150, Math.min(P.r * 0.8, 280))
    this.axis = a
    this.base = { A: this.findGround(P.x + Math.cos(a) * R, P.z + Math.sin(a) * R, 50, 40, rand) || [P.x + Math.cos(a) * R, P.z + Math.sin(a) * R], B: this.findGround(P.x - Math.cos(a) * R, P.z - Math.sin(a) * R, 50, 40, rand) || [P.x - Math.cos(a) * R, P.z - Math.sin(a) * R] }
    this.flags = []
    if (this.kind === 'domination') for (const [t, side] of [[0.45, 40], [0, -30], [-0.45, 40]]) {
      const x = P.x + Math.cos(a) * R * t + Math.cos(a + Math.PI / 2) * side, z = P.z + Math.sin(a) * R * t + Math.sin(a + Math.PI / 2) * side
      const q = this.findGround(x, z, 40, 40, rand) || [x, z]
      this.flags.push({ x: q[0], z: q[1], y: heightAt(q[0], q[1]), r: 14, owner: null, progress: 0 })
    }
    // my team: the smaller one
    const rows = this.rows()
    const n = { A: rows.filter(r => r.team === 'A').length, B: rows.filter(r => r.team === 'B').length }
    const mine = rows.find(r => r.id === String(this.me?.id))
    this.team = mine?.team || (n.A <= n.B ? 'A' : 'B')
    this.kills = mine?.k || 0; this.deaths = mine?.d || 0
    this.publishRow()
    this.spawnMe()
    this.buildMarkers()
    for (const id of room?.players || []) if (id !== this.me?.id) this.ensureRemote(id)
    g.hud.note(`${ONLINE_KINDS[this.kind].name} at ${P.name}: you are on ${FACTIONS[TEAM_F[this.team]].short}. Real players only, no AI.`, C.gold2)
  }
  // ---- the score table in the shared state ----
  rows() {
    const st = this.room?.state || {}, here = new Set((this.room?.players || []).map(String))   // ids compared as text: the state keys are text
    return Object.entries(st).filter(([k, v]) => k.startsWith('pl:') && v && v.match === this.m?.id && here.has(k.slice(3))).map(([k, v]) => ({ id: k.slice(3), ...v }))
  }
  publishRow() { try { this.room?.set('pl:' + this.me.id, { match: this.m.id, team: this.team, k: this.kills, d: this.deaths, name: this.me.name }) } catch {} }
  teamScore(t) {
    if (this.kind === 'tdm') return this.rows().filter(r => r.team === t).reduce((n, r) => n + (r.k || 0), 0)
    return Math.floor(this.room?.state?.score?.[t] || 0)
  }
  spawnMe() {
    const g = this.g, [bx, bz] = this.base[this.team]
    const p = this.findGround(bx, bz, 20) || [bx, bz]
    const P = this.place
    const s = g.player ? g.replacePlayer({ faction: TEAM_F[this.team], role: 'rifleman', x: p[0], z: p[1], yaw: Math.atan2(P.x - p[0], P.z - p[1]), name: this.me?.name || 'You' })
      : g.spawnPlayer({ faction: TEAM_F[this.team], role: 'rifleman', x: p[0], z: p[1], yaw: Math.atan2(P.x - p[0], P.z - p[1]), allowDown: false, name: this.me?.name || 'You' })
    s.netId = this.me?.id
    return s
  }
  // ---- the others ----
  ensureRemote(id, team = null) {
    if (this.remotes.has(id)) return this.remotes.get(id)
    const row = this.rows().find(r => r.id === String(id)) || (team ? { team, name: null } : null)
    if (!row) return null      // not in this match (playing something else in the lot)
    const f = TEAM_F[row.team], [bx, bz] = this.base[row.team]
    const s = this.g.addSoldier({ faction: f, role: 'rifleman', x: bx, z: bz, inv: kit('rifleman', f, FACTIONS[f], ROLES), name: row.name || this.g.p0.players?.get(id)?.name || 'Player' })
    s.remote = true; s.netId = id
    const r = { s, target: { x: bx, y: heightAt(bx, bz), z: bz, yaw: 0, pitch: 0, stance: 0 }, last: this.g.time, team: row.team }
    this.remotes.set(id, r)
    return r
  }
  dropRemote(id) {
    const r = this.remotes.get(id); if (!r) return
    const i = this.g.soldiers.indexOf(r.s); if (i >= 0) this.g.soldiers.splice(i, 1)
    this.remotes.delete(id)
  }
  onNet(type, a, b, c) {
    if (type === 'leave') { this.dropRemote(a.id || a); return }
    if (type === 'state' && a === 'over' && b?.match === this.m.id && !this.over) { this.finish(b.winner, b.reason); return }
    if (type === 'state' && a === 'flags' && b && !this.room.isHost) { b.forEach((f, i) => { if (this.flags[i]) { this.flags[i].owner = f.o; this.flags[i].progress = f.p } }) }
    if (type !== 'message') return
    const data = a, from = b
    if (!data || data.m !== this.m.id) return
    const r = this.ensureRemote(from, data.tm)
    if (!r) return
    const s = r.s
    if (data.t === 's') {
      r.target = { x: data.p[0], y: data.p[1], z: data.p[2], yaw: data.y, pitch: data.a, stance: data.st }
      r.last = this.g.time
      if (data.w && s.w?.def.id !== data.w) { s.inv.weapons.primary = { id: data.w, att: {}, mag: 30, chamber: 1 }; s.selectWeapon('primary', true) }
      if (data.d && !s.dead) { s.dead = true; s.deadT = 0 }
      if (!data.d && s.dead) { s.dead = false; s.blood = 100; s.bleed = 0; for (const k in s.parts) s.parts[k] = 0; s.pos.set(data.p[0], data.p[1], data.p[2]) }
    } else if (data.t === 'f') {
      // their shots: simulated here too (they can only hurt me)
      for (const sh of data.s) {
        const dir = new THREE.Vector3(sh[3], sh[4], sh[5]), origin = new THREE.Vector3(sh[0], sh[1], sh[2])
        this.g.ballistics.fire({ origin, dir, v: sh[6], ammo: sh[7], owner: s, tracer: !!sh[8] })
        this.g.fx.muzzle(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 1)
        this.g.sfx.shot(s.w?.def.id || 'brenner', origin, false, s)
      }
    } else if (data.t === 'g') {
      const n = { type: data.type, def: THROW[data.type], pos: new THREE.Vector3(...data.p), vel: new THREE.Vector3(...data.v), t: 0, owner: s, done: false }
      if (n.def) this.g.grenades.push(n)
    } else if (data.t === 'k') {
      // someone died: the kill feed, and my score if it was me who killed them
      const killer = data.by === this.me.id ? 'You' : this.remotes.get(data.by)?.s.name || 'someone'
      this.g.hud.kill(`${killer} killed ${s.name}`)
      if (data.by === this.me.id) { this.kills++; this.publishRow(); this.g.hud.hit(true) }
    }
  }
  // ---- my side of it ----
  onKill(sol, killer) {
    if (sol !== this.g.player?.s) return
    this.deaths++
    this.publishRow()
    try { this.room?.send({ m: this.m.id, t: 'k', by: killer?.netId || null }) } catch {}
  }
  onShot(s, sh) {
    if (!s.isPlayer) return
    this.shots.push([r1(sh.origin.x), r1(sh.origin.y), r1(sh.origin.z), +sh.dir.x.toFixed(4), +sh.dir.y.toFixed(4), +sh.dir.z.toFixed(4), Math.round(sh.v), sh.ammo, sh.tracer ? 1 : 0])
  }
  onGrenade(s, n) { if (s.isPlayer) try { this.room?.send({ m: this.m.id, t: 'g', type: n.type, p: n.pos.toArray().map(r1), v: n.vel.toArray().map(r1) }) } catch {} }
  update(dt) {
    super.update(dt)
    const g = this.g, s = g.player.s, room = this.room
    if (!room) return
    // send my state 10 times a second, my shots with it
    this.sendT -= dt
    if (this.sendT <= 0) {
      this.sendT = 0.1
      try {
        room.send({ m: this.m.id, t: 's', tm: this.team, p: [r1(s.pos.x), r1(s.pos.y), r1(s.pos.z)], y: +s.yaw.toFixed(2), a: +g.player.pitch.toFixed(2), st: s.stance, w: s.w?.def.id, d: s.dead ? 1 : 0 })
        if (this.shots.length) { room.send({ m: this.m.id, t: 'f', s: this.shots.splice(0, 12) }) }
      } catch {}
    }
    // the stand-ins glide to where their players are
    for (const [id, r] of this.remotes) {
      const st = r.s, T = r.target, k = Math.min(1, dt * 10)
      if (!room.players.includes(id) || g.time - r.last > 20) { this.dropRemote(id); continue }
      const dx = T.x - st.pos.x, dz = T.z - st.pos.z
      st.vel.set(dx * 10, 0, dz * 10)
      st.pos.x += dx * k; st.pos.y += (T.y - st.pos.y) * k; st.pos.z += dz * k
      let dy = T.yaw - st.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2
      st.yaw += dy * k; st.aimPitch = T.pitch; st.stance = T.stance
      st.stanceT += (T.stance - st.stanceT) * k
      st.speed = Math.hypot(dx, dz) * 10; st.phase += dt * st.speed * 2.6; st.aimW = 1
      if (st.dead) st.deadT += dt
    }
    for (const id of room.players) if (id !== this.me.id && !this.remotes.has(id)) this.ensureRemote(id)
    this.tick = (this.tick || 0) - dt
    if (this.tick > 0) return
    this.tick = 1
    if (this.over) return
    // the host turns the flags and keeps the score; anyone notices the end
    if (room.isHost && this.kind === 'domination') {
      const score = { ...(room.state.score || { A: 0, B: 0 }) }
      for (const f of this.flags) {
        const n = { A: 0, B: 0 }
        for (const o of g.soldiersNear(f.x, f.z, f.r)) if (!o.dead && Math.hypot(o.pos.x - f.x, o.pos.z - f.z) < f.r) { const t = o.isPlayer ? this.team : this.remoteTeam(o); if (t) n[t]++ }
        const d = n.A - n.B
        if (d) f.progress = Math.max(-1, Math.min(1, f.progress + Math.sign(d) * Math.min(3, Math.abs(d)) * 0.1))
        f.owner = f.progress >= 1 ? 'A' : f.progress <= -1 ? 'B' : Math.abs(f.progress) < 0.05 ? null : f.owner
        if (f.owner) score[f.owner] = (score[f.owner] || 0) + 1
      }
      try { room.set('flags', this.flags.map(f => ({ o: f.owner, p: +f.progress.toFixed(2) }))); room.set('score', score) } catch {}
    }
    if (room.isHost) {
      const A = this.teamScore('A'), B = this.teamScore('B'), left = this.m.minutes * 60 - (Date.now() - this.m.start) / 1000
      let winner = null, reason = ''
      if (A >= this.m.limit) { winner = 'A'; reason = 'Score limit reached' } else if (B >= this.m.limit) { winner = 'B'; reason = 'Score limit reached' } else if (left <= 0) { winner = A > B ? 'A' : B > A ? 'B' : 'draw'; reason = 'Time is up' }
      if (winner) try { room.set('over', { match: this.m.id, winner, reason }) } catch {}
    }
  }
  remoteTeam(o) { for (const r of this.remotes.values()) if (r.s === o) return r.team; return null }
  finish(winner, reason) {
    this.over = { winner, reason }
    const g = this.g
    g.hud.note(winner === this.team ? 'VICTORY' : winner === 'draw' ? 'DRAW' : 'DEFEAT', winner === this.team ? C.gold2 : C.red)
    setTimeout(() => { if (g.mode === this) { g.p0.input.unlockPointer(); g.menus.open('results') } }, 2500)
  }
  results() {
    const o = this.over || {}, rows = this.rows().sort((a, b) => (b.k || 0) - (a.k || 0))
    return { title: o.winner === this.team ? 'VICTORY' : o.winner === 'draw' ? 'DRAW' : 'DEFEAT', reason: o.reason || '', lines: [
      `${ONLINE_KINDS[this.kind].name} at ${this.place.name}   VDF ${this.teamScore('A')} - ${this.teamScore('B')} NLF`,
      ...rows.slice(0, 8).map(r => `${r.team === 'A' ? 'VDF' : 'NLF'}  ${r.name}   ${r.k || 0} kills  ${r.d || 0} deaths${r.id === String(this.me.id) ? '  (you)' : ''}`)] }
  }
  respawnOptions() { return this.over ? [] : [{ id: 'base', label: 'Respawn at your base', sub: '' }] }
  respawn() { this.spawnMe() }
  // ---- HUD, flags, map ----
  buildMarkers() {
    this.group = new THREE.Group(); this.g.engine.world.add(this.group)
    const pole = new THREE.CylinderGeometry(0.06, 0.08, 8, 6).translate(0, 4, 0), cloth = new THREE.BoxGeometry(0.04, 1.1, 1.7).translate(0, 7.3, 0.9)
    for (const f of this.flags) {
      const gr = new THREE.Group(); gr.position.set(f.x, f.y, f.z)
      f.cloth = new THREE.MeshLambertMaterial({ color: 0xe8e4d4 })
      gr.add(new THREE.Mesh(pole, new THREE.MeshLambertMaterial({ color: 0x9a9a9a })), new THREE.Mesh(cloth, f.cloth))
      this.group.add(gr)
    }
  }
  dispose() {
    if (this.group) this.g.engine.world.remove(this.group)
    try { if (this.me) this.room?.set('pl:' + this.me.id, null) } catch {}
  }
  markers() { return this.flags.map(f => ({ x: f.x, z: f.z, color: f.owner === this.team ? '#5ab0ff' : f.owner ? '#e0483a' : '#e8e4d4' })) }
  objectives() {
    for (const f of this.flags) f.cloth?.color.set(f.owner === 'A' ? 0x3a7fd0 : f.owner === 'B' ? 0xc0392b : 0xe8e4d4)
    return [...this.flags.map((f, i) => ({ x: f.x, z: f.z, color: f.owner === this.team ? '#5ab0ff' : f.owner ? '#e0483a' : '#e8e4d4', label: `Flag ${LETTERS[i]}` })),
      { x: this.base[this.team][0], z: this.base[this.team][1], color: '#5ab0ff', label: 'Your base' }]
  }
  hudKey() { return [this.teamScore('A'), this.teamScore('B'), this.rows().length, Math.floor((Date.now() - this.m.start) / 1000), this.flags.map(f => f.owner).join()].join() }
  drawHud(c, p, k) {
    const left = Math.max(0, this.m.minutes * 60 - (Date.now() - this.m.start) / 1000)
    const rows = this.rows()
    this.panelTitle(c, k, `ONLINE · ${ONLINE_KINDS[this.kind].name.toUpperCase()}`, `VDF ${this.teamScore('A')} - ${this.teamScore('B')} NLF  (to ${this.m.limit})   ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`)
    text(c, `${rows.length} player${rows.length === 1 ? '' : 's'} in the match: ${rows.filter(r => r.team === 'A').length} VDF, ${rows.filter(r => r.team === 'B').length} NLF${rows.length < 2 ? '  (waiting for others)' : ''}`, 10 * k, 62 * k, { size: 12 * k, color: C.dim, shadow: true })
    this.flags.forEach((f, i) => { this.objectives(); const col = f.owner === this.team ? '#5ab0ff' : f.owner ? '#e0483a' : '#c9c3a0'; c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(10 * k + i * 36 * k, 72 * k, 30 * k, 26 * k); text(c, LETTERS[i], 25 * k + i * 36 * k, 91 * k, { size: 14 * k, weight: 900, align: 'center', color: col }) })
  }
}
import { THROWABLES as THROW } from '../../combat/weapons-data.js'
