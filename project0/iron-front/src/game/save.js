// The player's save, kept by the city between visits (p0.saved / p0.save, 16 KB of JSON): settings and
// key bindings, places found, campaign progress, free-roam stats. Guests get no save (it just stays in
// memory for this visit).
import { DEFAULT_BINDS } from '../core/input.js'

export const DEFAULT_SETTINGS = {
  quality: 'medium', qualityChosen: false, fov: 70, sens: 1, invertY: false, volume: 1, view: 'fp',
  hud: { compass: true, weapon: true, minimap: true, crosshair: true, markers: true }, minimapRange: 300, flightAssist: true, stickTurns: false, touch2: true,
  difficulty: 0.5, binds: {},
}

export class Save {
  constructor(p0) {
    this.p0 = p0
    const s = p0.saved && typeof p0.saved === 'object' ? p0.saved : {}
    this.data = { v: 1, found: [], kills: 0, campaign: { done: [], unlocked: 1 }, ...s }
    const st = s.settings || {}
    this.settings = { ...DEFAULT_SETTINGS, ...st, hud: { ...DEFAULT_SETTINGS.hud, ...(st.hud || {}) } }
    // only keep bindings for actions that still exist
    // two-thumb touch (core/touch.js): the stick strafes again unless the player turns turning back on
    if (!this.settings.touch2) { this.settings.stickTurns = false; this.settings.touch2 = true }
    // Alt became free look (as in Arma) and walking a Caps Lock toggle: old saved keys for them give way
    if (!this.settings.alt2) { const b = this.settings.binds || {}; if (b.walk === 'AltLeft') delete b.walk; if (b.freeLook === 'Backquote') delete b.freeLook; this.settings.alt2 = true }
    this.settings.binds = Object.fromEntries(Object.entries(this.settings.binds || {}).filter(([a]) => a in DEFAULT_BINDS))
    this.data.settings = this.settings
    this.timer = null
  }
  // Saves soon (the city keeps at most one a second).
  store() {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      let json = this.data
      // the city keeps about 16 KB: trim the least useful things first
      try {
        const big = () => JSON.stringify(json).length > 15500
        if (big()) json = { ...json, found: (json.found || []).slice(-200) }
        if (big() && json.life) json = { ...json, life: { ...json.life, stash: (json.life.stash || []).slice(0, 12) } }
        if (big()) json = { ...json, freeroam: undefined }
      } catch {}
      try { const r = this.p0.save?.(json); if (r?.then) r.then(a => { if (a && !a.ok) this.guest = true }).catch(() => {}) } catch {}
    }, 1200)
  }
}
