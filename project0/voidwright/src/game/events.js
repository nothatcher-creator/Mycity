// Events out in the void. Some lone rocks carry something (laid down with the rock, so the same for everyone):
// pirates lying in wait behind it, a derelict drifting by with cargo still aboard, a rich vein the scanner
// picks out, a meteor shower, a supply cache someone anchored there, a distress call from a wreck. It
// happens when you first come near the rock. And while you stay out there, now and then, something else
// comes along: a shower of meteors, or pirates.
import * as THREE from 'three'
import { ITEMS } from './items.js'

const DERELICTS = ['sparrow', 'pick', 'mule', 'lancer', 'talon', 'mole']
const METEOR = { kind: 'rocket', speed: 260, accel: 30, max: 420, dmg: { large: 1400, small: 900 }, blast: { large: 5, small: 5 }, range: 6000 }

export class Events {
  constructor(game) { this.g = game; this.done = new Set(); this.shower = null; this.next = 420 }
  reset() { this.done.clear(); this.shower = null; this.next = 420 }
  get W() { return this.g.world }
  update(dt) {
    const g = this.g, P = g.player, U = this.W.universe
    if (!P || P.dead || g.state !== 'play' || !U.voids) return
    const at = P.seat ? P.seat.grid.comWorld() : P.pos
    // arriving at a rock in the void
    let near = null
    for (const s of U.voids.awake) {
      const d = s.pos.distanceTo(at)
      if (d < s.def.radius + 9000) near = s
      if (d < s.def.radius + 4500 && !this.done.has(s.def.id)) { this.done.add(s.def.id); this.arrive(s) }
    }
    if (this.shower) this.meteors(dt, at)
    // something else, now and then, while you stay out by a void rock
    if (near && !this.shower) {
      this.next -= dt
      if (this.next <= 0) { this.next = 480 + Math.random() * 600; if (Math.random() < 0.65) this.fire(Math.random() < 0.55 ? 'meteors' : 'pirates', near, true) }
    }
  }
  arrive(s) {
    const d = s.def
    this.g.p0?.log?.('event: arrived at', d.name, d.event || 'nothing')
    this.g.hud.toast(`${d.name}: ${d.blurb}`, d.kind === 'ice' ? '#bfe8ff' : '#e4d2a8')
    if (d.event) setTimeout(() => this.fire(d.event, s), 2500)
  }
  // a point near the site, out of its rocks, toward the player
  beside(s, out = 260) {
    const P = this.g.player, at = P.seat ? P.seat.grid.comWorld() : P.pos
    const dir = at.clone().sub(s.pos); if (dir.lengthSq() < 1) dir.set(0, 1, 0); dir.normalize()
    const side = new THREE.Vector3(dir.z, 0.3, -dir.x).normalize()
    return s.pos.clone().addScaledVector(dir, (s.def.anchor || 120) + out).addScaledVector(side, out * 0.6)
  }
  fire(ev, s, later = false) {
    const g = this.g, d = s.def, toast = (m, c = '#ffb347') => g.hud.toast(m, c)
    if (ev === 'pirates') {
      if ((g.settings.pirates || 'rare') === 'off') return this.fire('meteors', s, later)
      g.pirates.spawn(Math.random() < 0.4 ? 'reaver' : 'marauder')
      toast(later ? `Pirates have found you out by ${d.name}` : `It was a trap: pirates were waiting behind ${d.name}`, '#ff5a45')
    } else if (ev === 'meteors') {
      this.shower = { t: 45, next: 2, site: s }
      toast(`Meteor shower coming through ${d.name}: get under cover or get clear`, '#ff7a45'); g.sfx.play('alarm', 0.6)
    } else if (ev === 'rich') {
      const ore = d.ores[0], name = ITEMS['ore_' + ore]?.name || ore
      toast(`Scanner: a rich vein of ${name} runs through ${d.name}`, '#ffd890'); g.sfx.play('ui_on', 0.6)
    } else if (ev === 'derelict' || ev === 'distress') {
      const id = DERELICTS[(d.seed >> 3) % DERELICTS.length]
      const gr = g.wrecks.drift(id, this.beside(s, ev === 'distress' ? 400 : 300), d.seed)
      if (ev === 'distress') gr.distress = true
      this.stock(gr, d.seed)
      toast(ev === 'distress' ? `A distress call: the ${gr.name} is drifting by ${d.name}, broken. Its hold is still full` : `A derelict ${gr.name} is drifting by ${d.name}: there is cargo aboard`, '#3fe0d0')
    } else if (ev === 'cache') {
      this.cache(s)
      toast(`Someone anchored a supply cache at ${d.name}: its beacon is lit`, '#3fe0d0')
    }
  }
  stock(gr, seed) {
    const box = gr.parts.invs.find(b => b.inv)
    if (!box) return
    const r = (seed % 97) / 97
    for (const [k, n] of [['construct', 30 + r * 40], ['plate', 40], ['motor', 6], ['computer', 12], ['ing_uranium', 3 + r * 6], ['ammo', 6], ['ing_gold', r * 30]]) if (ITEMS[k]) box.inv.add(k, Math.floor(n))
    gr.cargoDirty = true
  }
  // a small static container with a beacon and a lamp, anchored by the rock
  cache(s) {
    const W = this.W, p = this.beside(s, 90)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().sub(s.pos).normalize())
    const gr = W.newGrid('large', p, q, { static: true, name: 'Supply Cache' })
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) gr.add('heavy_cube', i, 0, k, 0, 2)
    gr.add('cargo_s', 0, 1, 0, 0, 7); gr.add('beacon', 1, 1, 1, 0); gr.add('battery', -1, 1, -1, 0); gr.add('lamp', -1, 1, 1, 0)
    gr.updateMass(); gr.rebuild()
    const box = gr.parts.invs.find(b => b.inv)
    if (box) for (const [k, n] of [['ing_uranium', 12], ['construct', 80], ['plate', 120], ['computer', 30], ['motor', 16], ['ammo', 12], ['rocket', 10], ['ore_ice', 300], ['ing_platinum', 10]]) if (ITEMS[k]) box.inv.add(k, n)
    gr.distress = true
    return gr
  }
  // meteors: rocks falling through at a few hundred metres a second, aimed near you, bursting where they hit
  meteors(dt, at) {
    const S = this.shower
    S.t -= dt; S.next -= dt
    if (S.t <= 0) { this.shower = null; this.g.hud.toast('The meteor shower has passed', '#ffd890'); return }
    if (S.next > 0) return
    S.next = 0.8 + Math.random() * 1.6
    const from = S.dir || (S.dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize())
    const aim = at.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(260))
    const p = aim.clone().addScaledVector(from, 2600).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(400))
    this.W.combat.spawn(METEOR, 'large', p, aim.clone().sub(p).normalize(), { faction: 'meteor' }, null, null)
  }
}
