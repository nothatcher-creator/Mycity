// Sound: short effects from the package (sfx/*.mp3, all synthesised for this game by tools/sfxgen.py),
// played with p0.sound. Loudness falls with distance from the camera; far gunfire switches to a duller
// distant shot. The platform cannot change a playing sound's volume, so loops (engine, wind) restart at a
// new level when it changes enough. Browsers start sound only after the first click or key.
import { weapon, AMMO } from '../combat/weapons-data.js'
import { heightAt } from '../world/heightfield.js'

const FILES = ['bolt', 'crack', 'dry', 'explosion', 'explosion_far', 'horn', 'impact_body', 'impact_dirt', 'impact_hard', 'impact_metal',
  'loop_birds', 'loop_boat', 'loop_car', 'loop_crickets', 'loop_fire', 'loop_heli', 'loop_jet', 'loop_rain', 'loop_tank', 'loop_wind', 'reload', 'ricochet', 'shot_cannon', 'shot_far',
  'shot_heavy', 'shot_pistol', 'shot_rifle', 'shot_rocket', 'shot_shotgun', 'shot_smg', 'shot_suppressed', 'step', 'ui_click', 'ui_hurt',
  'ui_pickup', 'ui_radio', 'ui_throw']
const SET = new Set(FILES)

export class SFX {
  constructor(game) {
    this.g = game
    this.p0 = game.p0
    this.on = false
    this.count = 0; this.window = 0
    this.loops = {}             // name -> { id, vol, file }
  }
  // a close blast leaves your ears ringing: everything muffled for a few seconds
  get volume() { return (this.g.settings.volume ?? 1) * (1 - (this.deaf || 0)) }
  deafen(k) { this.deaf = Math.max(this.deaf || 0, Math.min(0.85, k)) }
  unlock() { if (!this.on) { this.on = true; this.loop('wind', 'loop_wind', 0.18) } }
  play(name, vol = 1, rate = 1) {
    if (!this.on || !SET.has(name) || vol * this.volume < 0.01 || !this.p0.sound) return null
    // no more than ~24 new sounds a second (a long firefight would otherwise pile hundreds up)
    if (this.count > 24) return null
    this.count++
    try { const r = this.p0.sound.play(`sfx/${name}.mp3`, { volume: Math.min(1, vol * this.volume), rate }); if (r?.catch) r.catch(() => {}); return r } catch { return null }
  }
  // Sound travels at 343 m/s: something far off is heard after it is seen (a shot 700 m away two seconds
  // late). Near sounds play at once.
  later(d, fn) { if (d > 25) setTimeout(fn, d / 343 * 1000); else fn() }
  // Level for a sound at (x, y, z) with a reference range `ref` (metres at which it is at half volume).
  at(x, y, z, ref) {
    const c = this.g.camPos
    const d = Math.hypot(x - c.x, y - c.y, z - c.z)
    return { d, v: 1 / (1 + (d / ref) ** 1.6) }
  }
  shot(id, pos, suppressed, shooter) {
    const def = weapon(id), a = AMMO[def?.ammo] || {}
    const { d, v } = this.at(pos.x, pos.y, pos.z, suppressed ? 12 : 60)
    const rate = 0.94 + Math.random() * 0.12
    if (suppressed) { this.later(d, () => this.play('shot_suppressed', v * 0.8, rate)); return }
    let name = 'shot_rifle'
    if (a.rocket || def?.cat === 'launcher') name = 'shot_rocket'
    else if (a.mass >= 100) name = 'shot_cannon'
    else if (def?.cat === 'pistol') name = 'shot_pistol'
    else if (def?.cat === 'smg') name = 'shot_smg'
    else if (def?.cat === 'shotgun') name = 'shot_shotgun'
    else if (a.mass >= 15 || def?.cat === 'mmg' || def?.cat === 'sniper') name = 'shot_heavy'
    if (d > 300 && name !== 'shot_rocket') name = name === 'shot_cannon' ? 'explosion_far' : 'shot_far'
    this.later(d, () => this.play(name, v * (shooter?.isPlayer ? 0.75 : 0.9), rate))
    if (shooter?.isPlayer && (def?.modes[0] === 'bolt' || def?.modes[0] === 'pump')) setTimeout(() => this.play('bolt', 0.5), 280)
  }
  explosion(x, y, z, r) { const { d, v } = this.at(x, y, z, 120 + r * 10), rate = 0.9 + Math.random() * 0.15; this.later(d, () => this.play(d > 400 ? 'explosion_far' : 'explosion', v, rate)) }
  impact(kind, x, y, z) {
    const { v } = this.at(x, y, z, 8)
    const name = kind === 'metal' || kind === 'steel' || kind === 'vehicle' ? 'impact_metal' : kind === 'flesh' || kind === 'body' ? 'impact_body' : kind === 'concrete' || kind === 'brick' || kind === 'rock' || kind === 'glass' || kind === 'wood' ? 'impact_hard' : 'impact_dirt'
    const { d } = this.at(x, y, z, 8), rate = 0.9 + Math.random() * 0.25
    this.later(d, () => this.play(name, v * 0.6, rate))
  }
  ricochet(x, y, z) { const { d, v } = this.at(x, y, z, 15), rate = 0.85 + Math.random() * 0.3; this.later(d, () => this.play('ricochet', v * 0.6, rate)) }
  crack(x, y, z) { const { v } = this.at(x, y, z, 6); this.play('crack', v * 0.8, 0.9 + Math.random() * 0.2) }
  reload(s) { if (s.isPlayer) this.play('reload', 0.55, s.w ? 2.4 / Math.max(1, s.w.reloadDur) + 0.2 : 1) }
  dry() { this.play('dry', 0.5) }
  horn(v) { const p = this.at(v.pos.x, v.pos.y, v.pos.z, 60); this.play('horn', p.v) }
  ui(kind) { this.play(kind === 'click' ? 'ui_click' : 'ui_' + kind, 0.7) }
  // Footsteps: yours, and of anyone on foot within 30 m (an enemy creeping up can be heard); quiet crouched,
  // none prone, louder running. Each soldier's stride sets its rhythm.
  footsteps(dt) {
    const g = this.g, P = g.player?.s
    if (!this.on || !P || !g.soldiersNear) return
    let n = 0
    for (const s of g.soldiersNear(P.pos.x, P.pos.z, 30)) {
      if (s.dead || s.vehicle || !s.onGround || s.swimming || s.stance === 2 || s.speed < 0.6 || s.ladder) { s.stepT = 0; continue }
      if (s !== P && ++n > 6) continue
      s.stepT = (s.stepT || 0) - dt * s.speed
      if (s.stepT > 0) continue
      s.stepT = s.speed > 4 ? 1.5 : 1.25          // metres a stride
      const loud = (s.speed > 4 ? 1 : 0.6) * (s.stance === 1 ? 0.35 : 1)
      const v = s === P ? 0.16 * loud : this.at(s.pos.x, s.pos.y, s.pos.z, 7).v * 0.55 * loud
      this.play('step', v, 0.85 + Math.random() * 0.3)
    }
  }
  // A looping sound at a level (restarted when the level moves by more than a third).
  loop(key, file, vol) {
    const L = this.loops[key]
    if (!this.on || !this.p0.sound) return
    if (L && L.file === file && Math.abs(L.vol - vol) < Math.max(0.05, L.vol * 0.33)) return
    if (L?.id != null) try { this.p0.sound.stop(L.id) } catch {}
    if (vol * this.volume < 0.02) { delete this.loops[key]; return }
    let id = null
    try { id = this.p0.sound.play(`sfx/${file}.mp3`, { volume: Math.min(1, vol * this.volume), loop: true }); if (id?.catch) id.catch(() => {}) } catch {}
    this.loops[key] = { id, vol, file }
  }
  stopLoop(key) { const L = this.loops[key]; if (L?.id != null) try { this.p0.sound.stop(L.id) } catch {} delete this.loops[key] }
  update(dt) {
    this.window += dt; if (this.window > 1) { this.window = 0; this.count = 0 }
    if (this.deaf) this.deaf = Math.max(0, this.deaf - dt * 0.2)
    this.footsteps(dt)
    // the vehicle the player is in (or the loudest one near)
    const s = this.g.player?.s
    const v = s?.vehicle
    if (v && v.engine && v.alive) {
      const file = v.kind === 'heli' ? 'loop_heli' : v.kind === 'plane' ? 'loop_jet' : v.kind === 'boat' ? 'loop_boat' : v.def.tracks ? 'loop_tank' : 'loop_car'
      const k = v.kind === 'heli' || v.kind === 'plane' ? 0.35 + v.rpm * 0.25 : 0.25 + Math.min(0.35, Math.abs(v.speed) / 50) + Math.abs(v.throttle) * 0.1
      this.loop('engine', file, k)
    } else this.stopLoop('engine')
    // rain on the ground round you
    const rain = this.g.sky?.w?.rain || 0
    if (this.on) { if (rain > 0.05) this.loop('rain', 'loop_rain', 0.12 + rain * 0.3); else this.stopLoop('rain') }
    // wind: stronger up high and in storms
    // thunder after a lightning flash
    const sk = this.g.sky
    if (sk?.thunder > 0) { sk.thunder -= dt; if (sk.thunder <= 0) { sk.thunder = 0; this.play('explosion_far', sk.thunderVol || 0.5, 0.55 + Math.random() * 0.2) } }
    // birdsong by day and crickets at night, near the ground and out of the rain (not in Online or high up)
    if (this.on) {
      const sky = this.g.sky, cp = this.g.camPos, low = cp.y - heightAt(cp.x, cp.z) < 40, wet = (sky?.w?.rain || 0) > 0.3
      const day = low && !wet && sky && sky.night < 0.25, night = low && !wet && sky && sky.night > 0.7
      if (day) this.loop('amb', 'loop_birds', 0.16); else if (night) this.loop('amb', 'loop_crickets', 0.12); else this.stopLoop('amb')
    }
    if (this.on) { const h = this.g.camPos.y; this.loop('wind', 'loop_wind', Math.min(0.5, 0.12 + Math.max(0, h - 80) / 1500 + (this.g.sky?.w?.wind || 0) * 0.1)) }
  }
  pauseAll() { try { this.p0.sound?.pauseAll() } catch {} }
  resumeAll() { try { this.p0.sound?.resumeAll() } catch {} }
}
