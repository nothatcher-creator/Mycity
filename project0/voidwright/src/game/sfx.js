// Sound: short effects and loops from the package (sfx/*.mp3, synthesised by tools/sfxgen.py), played with
// p0.sound. In vacuum you hear only what reaches you through your suit and the hull you touch: the ship you
// sit in, your jetpack, your tools. Air carries wind and nearby thrusters. A loop restarts at a new level
// when its level moves enough (the platform cannot change a playing sound's volume).
const FILES = ['door', 'gear', 'grind_end', 'impact', 'jump', 'jump_charge', 'land', 'loop_atmo', 'loop_drill', 'loop_grind', 'loop_h2', 'loop_hum', 'loop_ion', 'loop_jetpack', 'loop_weld', 'loop_wind', 'paint', 'place', 'seat', 'step', 'ui_click', 'ui_error', 'ui_on']
const SET = new Set(FILES)

export class SFX {
  constructor(game) { this.g = game; this.p0 = game.p0; this.on = false; this.loops = {}; this.count = 0; this.window = 0; this.stepT = 0 }
  get volume() { return this.g.settings.volume ?? 1 }
  unlock() { this.on = true }
  play(name, vol = 1, rate = 1) {
    if (!this.on || !SET.has(name) || vol * this.volume < 0.01 || !this.p0.sound || this.count > 24) return null
    this.count++
    try { const r = this.p0.sound.play(`sfx/${name}.mp3`, { volume: Math.min(1, vol * this.volume), rate }); if (r?.catch) r.catch(() => {}); return r } catch { return null }
  }
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
  stopAll() { for (const k of Object.keys(this.loops)) this.stopLoop(k) }
  update(dt) {
    this.window += dt; if (this.window > 1) { this.window = 0; this.count = 0 }
    const g = this.g, P = g.player
    if (!this.on || !P || g.state !== 'play') { this.stopAll(); return }
    const air = g.world.airAt(P.pos)
    // the ship you sit in: its thrusters by kind, and the hum of its power
    const gr = P.seat?.grid
    const kinds = { atmo: 0, ion: 0, h2: 0 }
    const add = (grid, k) => { for (const b of grid.parts?.thrusters || []) if (b.out > 0.02) kinds[b.def.func.thruster.kind] += b.out * (grid.size === 'large' ? 1 : 0.6) * k }
    if (gr) add(gr, 1)
    else if (air > 0.1) for (const o of g.world.grids) { const d = o.comWorld().distanceTo(P.pos); if (d < 300) add(o, air * Math.max(0, 1 - d / 300)) }
    const lvl = v => Math.min(0.75, 0.12 + Math.sqrt(v) * 0.25)
    for (const k of ['atmo', 'ion', 'h2']) { if (kinds[k] > 0.02) this.loop('thr_' + k, 'loop_' + k, lvl(kinds[k])); else this.stopLoop('thr_' + k) }
    if (gr) this.loop('hum', 'loop_hum', 0.18); else this.stopLoop('hum')
    // the jetpack
    if (!P.seat && P.jetpack && P.thrusting > 0.05) this.loop('jet', 'loop_jetpack', 0.15 + P.thrusting * 0.3); else this.stopLoop('jet')
    // tools
    const B = g.builder
    const shipDrill = gr?.parts?.drills.some(b => b.spin)
    if (B.toolOn && B.tool === 'welder') this.loop('tool', 'loop_weld', 0.4); else if (B.toolOn && B.tool === 'grinder') this.loop('tool', 'loop_grind', 0.45); else if ((B.toolOn && B.tool === 'drill') || shipDrill) this.loop('tool', 'loop_drill', shipDrill ? 0.6 : 0.4); else this.stopLoop('tool')
    // wind: in air, louder the faster you go
    const sp = (gr ? gr.vel.length() : P.vel.length())
    if (air > 0.05) this.loop('wind', 'loop_wind', Math.min(0.6, air * (0.08 + sp / 160))); else this.stopLoop('wind')
    // footsteps
    if (P.onGround && !P.seat) {
      const v = P.vel.length()
      if (v > 0.8) { this.stepT -= dt * v / 1.6; if (this.stepT <= 0) { this.stepT = 1; this.play('step', 0.25 * (air > 0.1 ? 1 : 0.5), 0.9 + Math.random() * 0.2) } }
    }
  }
}
