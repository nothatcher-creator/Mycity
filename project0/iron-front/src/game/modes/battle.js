// Battles against the AI, fought round one place on the island: two sides with their bases on opposite
// edges, AI squads that respawn while their side has reinforcements, and the player fighting on one side
// with his own squad. The variants:
//   tdm         Team Deathmatch: the first side to the kill limit wins.
//   domination  three flags; holding them scores points over time.
//   conquest    flags and tickets: every death costs a ticket, holding most flags bleeds the enemy's.
//   koth        King of the Hill: one zone that moves every few minutes; score while you hold it alone.
//   ctf         Capture the Flag: bring the enemy's flag to your own.
//   sector      Sector Control: attackers take the sectors in order before time runs out; defenders hold.
//   survival    Survival: waves of enemies attack you and your squad; no respawn for you.
// Custom settings (team size, limits, time, place) come from the battle setup screen.
import * as THREE from 'three'
import { Mode } from './base.js'
import { PLACES } from '../../world/blueprint.js'
import { POINTS } from '../../world/places.js'
import { heightAt } from '../../world/heightfield.js'
import { FACTIONS } from '../../actors/factions.js'
import { WEATHER } from '../../world/sky.js'
import { QUALITY } from '../../core/engine.js'
import { C, text, bar } from '../../ui/ui.js'

export const BATTLES = {
  tdm: { name: 'Team Deathmatch', desc: 'First side to the kill limit wins.', score: 50 },
  domination: { name: 'Domination', desc: 'Hold the three flags: each held flag scores over time.', score: 300 },
  conquest: { name: 'Conquest', desc: 'Tickets and flags: losses and lost flags drain your side.', score: 150 },
  koth: { name: 'King of the Hill', desc: 'One zone, moving every three minutes. Hold it alone to score.', score: 200 },
  ctf: { name: 'Capture the Flag', desc: 'Take the enemy flag to your own base.', score: 3 },
  sector: { name: 'Sector Control', desc: 'Attack: take the sectors in order before time runs out.', score: 4 },
  survival: { name: 'Survival', desc: 'Waves of enemies come for you and your squad. You have one life.', score: 10 },
}
export const ARENAS = ['kaldor', 'tovar', 'halvik', 'koriv', 'dresk', 'sentinel', 'kessel', 'ilsen', 'marsk', 'belno', 'sorn', 'quarry']
const LETTERS = 'ABCDEFG'

export class Battle extends Mode {
  get name() { return BATTLES[this.kind].name }
  setup() {
    const g = this.g, o = this.opts
    this.kind = o.kind || 'tdm'
    this.place = PLACES.find(p => p.id === (o.place || 'tovar'))
    this.sideA = o.faction || 'vdf'
    this.sideB = o.enemy || (this.sideA === 'nlf' ? 'vdf' : 'nlf')
    const cap = QUALITY[g.settings.quality].aiNear
    this.teamSize = Math.max(4, Math.min(o.teamSize || 12, Math.floor(cap / 2) + 2))
    this.limit = o.limit || BATTLES[this.kind].score
    this.timeLimit = (o.minutes ?? 15) * 60
    this.score = { A: 0, B: 0 }
    this.tickets = { A: this.limit, B: this.limit }
    this.kills = 0; this.deaths = 0
    this.over = null
    this.squads = { A: [], B: [] }
    this.respawnT = 0
    this.wave = 0
    g.difficulty = g.settings.difficulty
    g.sky.hour = o.hour ?? 10; g.sky.setWeather(o.weather || 'clear'); g.sky.cycle = false
    // the two bases on opposite edges of the place, along a random axis
    const P = this.place, a = (o.seed ?? Math.random()) * Math.PI * 2, R = Math.max(150, Math.min(P.r * 0.85, 320))
    this.base = {
      A: this.findGround(P.x + Math.cos(a) * R, P.z + Math.sin(a) * R, 60, 40) || [P.x + Math.cos(a) * R, P.z + Math.sin(a) * R],
      B: this.findGround(P.x - Math.cos(a) * R, P.z - Math.sin(a) * R, 60, 40) || [P.x - Math.cos(a) * R, P.z - Math.sin(a) * R],
    }
    this.axis = a
    // objectives
    this.flags = []
    const flagAt = (t, side = 0) => {
      const x = P.x + Math.cos(a) * R * t + Math.cos(a + Math.PI / 2) * side, z = P.z + Math.sin(a) * R * t + Math.sin(a + Math.PI / 2) * side
      const q = this.findGround(x, z, 40, 40) || [x, z]
      return { x: q[0], z: q[1], y: heightAt(q[0], q[1]), r: 14, owner: null, progress: 0 }
    }
    if (this.kind === 'domination' || this.kind === 'conquest') this.flags = [flagAt(0.45, 40), flagAt(0, -30), flagAt(-0.45, 40)]
    if (this.kind === 'conquest') { this.flags[0].owner = 'A'; this.flags[0].progress = 1; this.flags[2].owner = 'B'; this.flags[2].progress = -1 }
    if (this.kind === 'sector') { this.flags = [flagAt(0.5, 0), flagAt(0.1, 30), flagAt(-0.3, -30), flagAt(-0.7, 0)]; for (const f of this.flags) { f.owner = 'B'; f.progress = -1 } this.sectorIdx = 0; this.timeLimit = (o.minutes ?? 12) * 60 }
    if (this.kind === 'koth') { this.hills = [flagAt(0, 0), flagAt(0.35, -60), flagAt(-0.35, 60)]; this.hillIdx = 0; this.flags = [this.hills[0]]; this.hillT = 180 }
    if (this.kind === 'ctf') {
      this.ctf = { A: { home: this.base.A, x: this.base.A[0], z: this.base.A[1], carrier: null, atHome: true }, B: { home: this.base.B, x: this.base.B[0], z: this.base.B[1], carrier: null, atHome: true } }
    }
    // the player at his base, with a squad
    const pb = this.base.A
    const sp = this.findGround(pb[0], pb[1], 15) || pb
    const s = g.spawnPlayer({ faction: this.sideA, role: o.role || 'rifleman', x: sp[0], z: sp[1], yaw: Math.atan2(P.x - sp[0], P.z - sp[1]), allowDown: false })
    this.playerSquadAround(s, this.kind === 'survival' ? 4 : 3)
    this.squads.A.push(g.playerSquad)
    // vehicles at each base
    for (const side of ['A', 'B']) {
      const [bx, bz] = this.base[side], f = side === 'A' ? this.sideA : this.sideB
      const types = this.kind === 'survival' ? [] : f === 'nlf' || f === 'res' ? ['technical', 'techgl', 'ifv'] : ['luvm', 'apc', 'ambulance']
      types.forEach((t, i) => this.park(t, bx + Math.cos(this.axis + Math.PI / 2) * (12 + i * 10), bz + Math.sin(this.axis + Math.PI / 2) * (12 + i * 10), this.axis + (side === 'A' ? Math.PI : 0), { faction: f, search: 30 }))
    }
    // a crewed fighting vehicle for each side (driver and gunner): a technical, an APC or an armoured car
    if (this.kind !== 'survival') for (const side of ['A', 'B']) {
      const [bx, bz] = this.base[side], f = this.faction(side)
      const type = { nlf: 'technical', res: 'technical', vdf: 'apc', cef: 'mrap' }[f] || 'technical'
      const q = this.crewed(type, f, bx - Math.cos(this.axis + Math.PI / 2) * 15, bz - Math.sin(this.axis + Math.PI / 2) * 15, this.axis + (side === 'A' ? Math.PI : 0), { type: 'hold', pos: null })
      if (q) { q.side = side; this.squads[side].push(q) }
    }
    // the armies
    if (this.kind === 'survival') this.nextWave()
    else this.reinforce(true)
    this.buildMarkers()
    g.hud.note(`${this.name} at ${P.name}: ${BATTLES[this.kind].desc}`, C.gold2)
  }
  // Flagpoles with a coloured cloth and a ring on the ground for each objective; flags for CTF.
  buildMarkers() {
    const w = this.g.engine.world
    this.group = new THREE.Group(); w.add(this.group)
    const pole = new THREE.CylinderGeometry(0.06, 0.08, 8, 6).translate(0, 4, 0), cloth = new THREE.BoxGeometry(0.04, 1.1, 1.7).translate(0, 7.3, 0.9)
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x9a9a9a })
    const mk = (x, z, r) => {
      const g = new THREE.Group(); g.position.set(x, heightAt(x, z), z)
      const m = new THREE.MeshLambertMaterial({ color: 0xe8e4d4, emissive: 0x222222 })
      g.add(new THREE.Mesh(pole, poleMat), new THREE.Mesh(cloth, m))
      if (r) { const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.4, r, 48).rotateX(-Math.PI / 2).translate(0, 0.25, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false })); g.add(ring); g.ring = ring }
      g.cloth = m; this.group.add(g); return g
    }
    for (const f of new Set([...this.flags, ...(this.hills || [])])) f.mesh = mk(f.x, f.z, f.r)
    if (this.ctf) for (const side of ['A', 'B']) { const F = this.ctf[side]; F.mesh = mk(F.x, F.z, 0); F.mesh.scale.setScalar(0.4); F.mesh.cloth.color.set(side === 'A' ? 0x3a7fd0 : 0xc0392b) }
  }
  syncMarkers() {
    const col = f => f.owner === 'A' ? 0x3a7fd0 : f.owner === 'B' ? 0xc0392b : 0xe8e4d4
    for (const f of new Set([...this.flags, ...(this.hills || [])])) if (f.mesh) {
      f.mesh.visible = this.flags.includes(f)
      f.mesh.cloth.color.set(col(f))
      if (f.mesh.ring) f.mesh.ring.material.color.set(this.kind === 'koth' ? 0xf0c64a : col(f))
    }
    if (this.ctf) for (const side of ['A', 'B']) { const F = this.ctf[side]; F.mesh.position.set(F.x, heightAt(F.x, F.z) + (F.carrier ? 1.2 : 0), F.z) }
  }
  dispose() { if (this.group) this.g.engine.world.remove(this.group) }
  faction(side) { return side === 'A' ? this.sideA : this.sideB }
  sideOf(s) { return s.team === this.sideA ? 'A' : s.team === this.sideB ? 'B' : null }
  alive(side) { return this.squads[side].reduce((n, q) => n + q.alive.filter(m => !m.isPlayer).length, 0) + (side === 'A' && !this.g.player.s.dead ? 1 : 0) }
  // New squads at the bases while a side is short of men (and has reinforcements to send).
  reinforce(first = false) {
    for (const side of ['A', 'B']) {
      this.squads[side] = this.squads[side].filter(q => q.player || q.alive.length)
      let n = this.alive(side)
      while (n < this.teamSize - 1) {
        if (this.kind === 'conquest' && this.tickets[side] <= 0) break
        const [bx, bz] = this.base[side]
        const size = Math.min(4, this.teamSize - n)
        const q = this.spawnSquad(this.faction(side), bx, bz, size, { type: 'hold', pos: null }, { spread: 18 })
        q.side = side; q.home = new THREE.Vector3(bx, heightAt(bx, bz), bz)
        this.squads[side].push(q)
        this.assign(q)
        n += size
      }
    }
  }
  // What a squad should do now.
  assign(q) {
    const side = q.side, other = side === 'A' ? 'B' : 'A', P = this.place
    const v = (x, z) => new THREE.Vector3(x, heightAt(x, z), z)
    const L = q.leader || q.members[0]
    if (!L) return
    const i = this.squads[side].indexOf(q)
    if (this.kind === 'tdm') {
      // sweep the middle of the field, then push on to the enemy's side
      const t = (i % 3 - 1) * 60
      q.order = { type: 'attack', pos: v(P.x + Math.cos(this.axis + Math.PI / 2) * t, P.z + Math.sin(this.axis + Math.PI / 2) * t) }
    } else if (this.kind === 'domination' || this.kind === 'conquest' || this.kind === 'koth') {
      const want = this.flags.filter(f => f.owner !== side)
      const list = want.length ? want : this.flags
      list.sort((a, b) => Math.hypot(a.x - L.pos.x, a.z - L.pos.z) - Math.hypot(b.x - L.pos.x, b.z - L.pos.z))
      const f = list[i % Math.min(2, list.length)] || list[0]
      q.order = f.owner === side ? { type: 'defend', pos: v(f.x, f.z), radius: 15 } : { type: 'attack', pos: v(f.x, f.z) }
      q.target = f
    } else if (this.kind === 'sector') {
      const f = this.flags[this.sectorIdx] || this.flags[this.flags.length - 1]
      q.order = side === 'A' ? { type: 'attack', pos: v(f.x, f.z) } : { type: 'defend', pos: v(f.x, f.z), radius: 20 }
    } else if (this.kind === 'ctf') {
      const mine = this.ctf[side], theirs = this.ctf[other]
      if (i % 2 === 0) q.order = { type: 'attack', pos: v(theirs.x, theirs.z) }
      else q.order = mine.atHome ? { type: 'defend', pos: v(mine.x, mine.z), radius: 18 } : { type: 'attack', pos: v(mine.x, mine.z) }
    } else if (this.kind === 'survival') {
      const p = this.g.player.s.pos
      q.order = side === 'B' ? { type: 'attack', pos: p.clone() } : { type: 'follow', target: this.g.player.s }
    }
  }
  nextWave() {
    this.wave++
    const n = Math.min(this.teamSize + 2, 3 + this.wave * 2)
    const P = this.g.player.s.pos
    for (let k = 0; k < Math.ceil(n / 4); k++) {
      const a = Math.random() * Math.PI * 2, d = 160 + Math.random() * 80
      const c = this.findGround(P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, 60) || [P.x + Math.cos(a) * d, P.z + Math.sin(a) * d]
      const q = this.spawnSquad(this.sideB, c[0], c[1], Math.min(4, n - k * 4), { type: 'attack', pos: P.clone() })
      q.side = 'B'; this.squads.B.push(q)
    }
    this.g.hud.note(`Wave ${this.wave}: ${n} enemies`, C.red)
  }
  onKill(sol, killer) {
    super.onKill(sol, killer)
    if (this.over) return
    const vs = this.sideOf(sol), ks = killer ? this.sideOf(killer) : null
    if (this.kind === 'tdm' && ks && vs && ks !== vs) this.score[ks]++
    if (this.kind === 'conquest' && vs) this.tickets[vs] = Math.max(0, this.tickets[vs] - 1)
    if (this.kind === 'survival' && vs === 'B') this.score.A++
    if (this.kind === 'ctf') for (const side of ['A', 'B']) { const F = this.ctf[side]; if (F.carrier === sol) { F.carrier = null; F.x = sol.pos.x; F.z = sol.pos.z; F.dropT = this.t; this.g.hud.note(`The ${side === 'A' ? 'friendly' : 'enemy'} flag was dropped`, C.gold2) } }
  }
  update(dt) {
    super.update(dt)
    const g = this.g, s = g.player.s
    if (this.over) return
    if (this.kind === 'ctf') this.updateFlagsCTF()
    this.syncMarkers()
    this.tick = (this.tick || 0) - dt
    if (this.tick > 0) return
    this.tick = 1
    // flags and zones
    for (const f of this.flags) this.capture(f)
    if (this.kind === 'domination') for (const f of this.flags) if (f.owner) this.score[f.owner] += 1
    if (this.kind === 'conquest') {
      const held = { A: this.flags.filter(f => f.owner === 'A').length, B: this.flags.filter(f => f.owner === 'B').length }
      if (held.A > held.B) this.tickets.B = Math.max(0, this.tickets.B - (held.A - held.B) * 0.5)
      if (held.B > held.A) this.tickets.A = Math.max(0, this.tickets.A - (held.B - held.A) * 0.5)
    }
    if (this.kind === 'koth') {
      const f = this.flags[0]
      const n = this.count(f)
      if (n.A && !n.B) this.score.A += 1; else if (n.B && !n.A) this.score.B += 1
      this.hillT -= 1
      if (this.hillT <= 0) { this.hillIdx = (this.hillIdx + 1) % this.hills.length; this.flags = [this.hills[this.hillIdx]]; this.hillT = 180; g.hud.note('The hill has moved!', C.gold2); for (const q of [...this.squads.A, ...this.squads.B]) if (!q.player) this.assign(q) }
    }
    if (this.kind === 'sector') {
      const f = this.flags[this.sectorIdx]
      if (f && f.owner === 'A') { this.sectorIdx++; this.score.A++; g.hud.note(`Sector ${LETTERS[this.sectorIdx - 1]} taken`, C.gold2); for (const q of [...this.squads.A, ...this.squads.B]) if (!q.player) this.assign(q) }
    }
    if (this.kind === 'survival' && this.squads.B.every(q => q.alive.length === 0)) { if (this.wave >= this.limit) return this.finish('A', `All ${this.limit} waves beaten`); this.nextWave() }
    // fresh orders now and then; reinforcements every 15 s
    this.assignT = (this.assignT || 0) - 1
    if (this.assignT <= 0) { this.assignT = 12; for (const q of [...this.squads.A, ...this.squads.B]) if (!q.player && q.alive.length) this.assign(q) }
    this.respawnT -= 1
    if (this.respawnT <= 0 && this.kind !== 'survival') { this.respawnT = 15; this.reinforce() }
    this.checkEnd()
  }
  count(f) {
    const n = { A: 0, B: 0 }
    for (const o of this.g.soldiersNear(f.x, f.z, f.r)) { if (o.dead || o.vehicle && o.vehicle.kind !== 'car' && o.vehicle.kind !== 'tracked') continue; if (Math.hypot(o.pos.x - f.x, o.pos.z - f.z) > f.r || Math.abs(o.pos.y - f.y) > 8) continue; const sd = this.sideOf(o); if (sd) n[sd]++ }
    return n
  }
  // A flag turns towards the side with more men on it (10 s alone, quicker with more).
  capture(f) {
    if (this.kind === 'koth') return
    const n = this.count(f), d = n.A - n.B
    if (!d) return
    if (this.kind === 'sector' && this.flags.indexOf(f) !== this.sectorIdx) return   // one sector at a time
    const before = f.owner
    f.progress = Math.max(-1, Math.min(1, f.progress + Math.sign(d) * Math.min(3, Math.abs(d)) * 0.1))
    if (f.progress >= 1) f.owner = 'A'; else if (f.progress <= -1) f.owner = 'B'; else if (Math.abs(f.progress) < 0.05) f.owner = null
    if (f.owner !== before && f.owner) this.g.hud.note(`Flag ${LETTERS[this.flags.indexOf(f)]} ${f.owner === 'A' ? 'captured' : 'lost'}`, f.owner === 'A' ? C.gold2 : C.red)
  }
  updateFlagsCTF() {
    const g = this.g
    for (const side of ['A', 'B']) {
      const F = this.ctf[side], other = side === 'A' ? 'B' : 'A'
      if (F.carrier) { F.x = F.carrier.pos.x; F.z = F.carrier.pos.z; const home = this.ctf[other].home; if (this.ctf[other].atHome && Math.hypot(F.x - home[0], F.z - home[1]) < 10) { this.score[other]++; g.hud.note(`${other === 'A' ? 'Your side' : 'The enemy'} captured a flag!`, other === 'A' ? C.gold2 : C.red); F.carrier = null; F.atHome = true; F.x = F.home[0]; F.z = F.home[1]; for (const q of [...this.squads.A, ...this.squads.B]) if (!q.player) this.assign(q) } continue }
      // touched by the enemy: taken; by a friend while dropped: returned
      for (const o of g.soldiersNear(F.x, F.z, 3)) {
        if (o.dead || Math.hypot(o.pos.x - F.x, o.pos.z - F.z) > 2.5) continue
        const sd = this.sideOf(o)
        if (sd === other) { F.carrier = o; F.atHome = false; g.hud.note(o.isPlayer ? 'You have the enemy flag! Bring it home.' : `${side === 'A' ? 'Our' : 'The enemy'} flag has been taken`, C.gold2); if (o.brain) o.brain.squad.order = { type: 'move', pos: new THREE.Vector3(this.base[other][0], 0, this.base[other][1]) }; break }
        if (sd === side && !F.atHome) { F.atHome = true; F.x = F.home[0]; F.z = F.home[1]; g.hud.note('Flag returned', C.gold2); break }
      }
      if (!F.carrier && !F.atHome && this.t - (F.dropT || 0) > 30) { F.atHome = true; F.x = F.home[0]; F.z = F.home[1] }
    }
  }
  checkEnd() {
    const k = this.kind, L = this.limit
    if (k === 'tdm' || k === 'domination' || k === 'koth' || k === 'ctf') { if (this.score.A >= L) return this.finish('A', 'Score limit reached'); if (this.score.B >= L) return this.finish('B', 'Score limit reached') }
    if (k === 'conquest') { if (this.tickets.B <= 0 && this.alive('B') === 0 || this.tickets.B <= 0 && this.flags.every(f => f.owner === 'A')) return this.finish('A', 'The enemy is out of tickets'); if (this.tickets.A <= 0 && this.alive('A') <= 1) return this.finish('B', 'Your side is out of tickets') }
    if (k === 'survival' && this.alive('A') === 0) return this.finish('B', 'Your squad was wiped out')
    if (k === 'sector' && this.sectorIdx >= this.flags.length) return this.finish('A', 'Every sector taken')
    if (this.t > this.timeLimit) {
      if (k === 'sector') return this.finish('B', 'Time ran out before the last sector fell')
      if (k === 'survival') return this.finish('A', 'You held out')
      const a = k === 'conquest' ? this.tickets.A : this.score.A, b = k === 'conquest' ? this.tickets.B : this.score.B
      return this.finish(a > b ? 'A' : b > a ? 'B' : null, 'Time is up')
    }
  }
  finish(winner, reason) {
    this.over = { winner, reason }
    const g = this.g
    g.hud.note(winner === 'A' ? 'VICTORY' : winner === 'B' ? 'DEFEAT' : 'DRAW', winner === 'A' ? C.gold2 : C.red)
    g.save.data.battles = (g.save.data.battles || 0) + 1; if (winner === 'A') g.save.data.wins = (g.save.data.wins || 0) + 1
    g.save.store()
    setTimeout(() => { if (g.mode === this) { g.p0.input.unlockPointer(); g.menus.open('results') } }, 2500)
  }
  results() {
    const o = this.over || {}
    return { title: o.winner === 'A' ? 'VICTORY' : o.winner === 'B' ? 'DEFEAT' : 'DRAW', reason: o.reason || '', lines: [
      `${this.name} at ${this.place.name}`, this.scoreText(), `Your kills ${this.kills}   Deaths ${this.deaths}`, `Time ${Math.floor(this.t / 60)}:${String(Math.floor(this.t % 60)).padStart(2, '0')}`] }
  }
  scoreText() {
    const A = FACTIONS[this.sideA].short, B = FACTIONS[this.sideB].short
    if (this.kind === 'conquest') return `Tickets  ${A} ${Math.ceil(this.tickets.A)}  -  ${Math.ceil(this.tickets.B)} ${B}`
    if (this.kind === 'sector') return `Sectors taken ${this.sectorIdx} / ${this.flags.length}`
    if (this.kind === 'survival') return `Wave ${this.wave} / ${this.limit}   Enemies killed ${this.score.A}`
    return `${A} ${Math.floor(this.score.A)}  -  ${Math.floor(this.score.B)} ${B}   (to ${this.limit})`
  }
  // ---- respawning ----
  respawnOptions() {
    if (this.kind === 'survival') return [{ id: 'none', label: 'Watch your squad', sub: 'No respawn in Survival' }]
    if (this.over) return []
    const out = [{ id: 'base', label: 'Respawn at base', sub: '' }]
    this.flags.forEach((f, i) => { if (f.owner === 'A' && this.count(f).B === 0) out.push({ id: 'flag:' + i, label: `Respawn at flag ${LETTERS[i]}`, sub: '' }) })
    if (this.g.playerSquad?.alive.some(m => !m.isPlayer)) out.push({ id: 'squad', label: 'Respawn with your squad', sub: '' })
    return out
  }
  respawn(id) {
    if (id === 'none') { this.g.menus.close(); this.spectate = true; return }
    const g = this.g, old = g.player.s
    let [x, z] = this.base.A
    if (id.startsWith('flag:')) { const f = this.flags[+id.slice(5)]; x = f.x; z = f.z }
    if (id === 'squad') { const m = g.playerSquad.alive.find(m => !m.isPlayer); if (m) { x = m.pos.x; z = m.pos.z } }
    const p = this.findGround(x, z, 12) || [x, z]
    const s = g.replacePlayer({ faction: this.sideA, role: old.role, x: p[0], z: p[1], yaw: Math.atan2(this.place.x - p[0], this.place.z - p[1]) })
    const q = g.playerSquad
    if (q) { q.members = q.members.filter(m => m !== old); q.members.unshift(s); q.order = { type: 'follow', target: s } }
  }
  // ---- HUD and the map ----
  markers() {
    const out = []
    this.flags.forEach(f => out.push({ x: f.x, z: f.z, color: f.owner === 'A' ? '#5ab0ff' : f.owner === 'B' ? '#e0483a' : '#e8e4d4' }))
    if (this.kind === 'ctf') for (const side of ['A', 'B']) { const F = this.ctf[side]; out.push({ x: F.x, z: F.z, color: side === 'A' ? '#5ab0ff' : '#e0483a' }) }
    return out
  }
  objectives() {
    const out = this.flags.map((f, i) => ({ x: f.x, z: f.z, color: f.owner === 'A' ? '#5ab0ff' : f.owner === 'B' ? '#e0483a' : '#e8e4d4', label: this.kind === 'koth' ? 'HILL' : `${this.kind === 'sector' ? 'Sector' : 'Flag'} ${LETTERS[i]}` }))
    out.push({ x: this.base.A[0], z: this.base.A[1], color: '#5ab0ff', label: 'Your base' }, { x: this.base.B[0], z: this.base.B[1], color: '#e0483a', label: 'Enemy base' })
    if (this.kind === 'ctf') for (const side of ['A', 'B']) { const F = this.ctf[side]; out.push({ x: F.x, z: F.z, color: side === 'A' ? '#5ab0ff' : '#e0483a', label: side === 'A' ? 'Our flag' : 'Enemy flag' }) }
    return out
  }
  hudKey() { return [Math.floor(this.score.A), Math.floor(this.score.B), Math.ceil(this.tickets.A), Math.ceil(this.tickets.B), this.flags.map(f => (f.owner || '-') + Math.round(f.progress * 10)).join(''), Math.floor(this.t), this.wave, this.sectorIdx].join() }
  drawHud(c, p, k) {
    const left = Math.max(0, this.timeLimit - this.t)
    this.panelTitle(c, k, `${this.name.toUpperCase()}  ·  ${this.place.name}`, `${this.scoreText()}   ${this.kind === 'survival' ? '' : Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0')}`)
    let x = 10 * k
    this.flags.forEach((f, i) => {
      const col = f.owner === 'A' ? '#5ab0ff' : f.owner === 'B' ? '#e0483a' : '#c9c3a0'
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x, 52 * k, 30 * k, 30 * k)
      c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(x + 1, 53 * k, 28 * k, 28 * k)
      text(c, this.kind === 'koth' ? 'H' : LETTERS[i], x + 15 * k, 73 * k, { size: 15 * k, weight: 900, align: 'center', color: col })
      bar(c, x, 84 * k, 30 * k, 4 * k, Math.abs(f.progress), f.progress >= 0 ? '#5ab0ff' : '#e0483a')
      x += 36 * k
    })
    if (this.kind === 'ctf') for (const side of ['A', 'B']) { const F = this.ctf[side]; text(c, `${side === 'A' ? 'Our' : 'Enemy'} flag: ${F.atHome ? 'at base' : F.carrier ? (F.carrier.isPlayer ? 'YOU have it' : 'carried') : 'dropped'}`, 10 * k, (66 + (side === 'A' ? 0 : 16)) * k, { size: 12 * k, color: side === 'A' ? '#5ab0ff' : '#e0483a', shadow: true }) }
  }
  centerText() {
    const s = this.g.player?.s; if (!s || s.dead || this.over) return this.over ? (this.over.winner === 'A' ? 'VICTORY' : this.over.winner === 'B' ? 'DEFEAT' : 'DRAW') : ''
    for (const [i, f] of this.flags.entries()) if (Math.hypot(s.pos.x - f.x, s.pos.z - f.z) < f.r) {
      if (this.kind === 'koth') { const n = this.count(f); return n.B ? 'HILL CONTESTED' : 'HOLDING THE HILL' }
      if (f.owner === 'A' && f.progress >= 1) return ''
      return `${f.owner === 'B' || f.progress < 0 ? 'NEUTRALISING' : 'CAPTURING'} ${LETTERS[i]}  ${Math.round(Math.abs(f.progress) * 100)}%`
    }
    return ''
  }
}
