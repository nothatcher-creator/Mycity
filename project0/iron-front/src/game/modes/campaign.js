// The campaign: VARDEN. Missions are lists of objectives run one after another. Each objective sets up what
// it needs (enemies, vehicles, a zone) when it starts and says when it is done:
//   reach    get to a place                     clear    kill every soldier of the squads it spawned
//   hold     stay in a zone with no enemy in it  survive  last out waves for a time
//   destroy  wreck the vehicles it parked         kill     kill one named soldier (who may run)
// Passing an objective saves a checkpoint: dying puts you back there with the objective still to do.
// Finishing a mission unlocks the next (kept in the player's save).
import * as THREE from 'three'
import { Mode, nextName } from './base.js'
import { POINTS } from '../../world/places.js'
import { heightAt, waterLevel } from '../../world/heightfield.js'
import { FACTIONS } from '../../actors/factions.js'
import { C, text, wrap } from '../../ui/ui.js'
import { ROADS } from '../../world/roads-data.js'

const V = (x, z) => new THREE.Vector3(x, heightAt(x, z), z)
const comms = () => POINTS.find(p => p.kind === 'objective' && p.name === 'Kaldor comms station') || { x: 640, z: 760 }

// ---------- the story ----------
export const CHAPTER = 'Chapter One: The Northern Storm'
export const CHAPTER2 = 'Chapter Two: The Battle for the North'
const ONE = [
  {
    id: 'm1', name: 'First Light', place: 'Tovar', hour: 6.2, weather: 'fog',
    brief: 'Spring 2031. The Northern Liberation Front has crossed the Dresk line overnight. Your section of the 2nd Varden Rifles is in Tovar, the crossroads town that guards the road south to Port Anselm. Scouts have been seen in the fields to the north. Find them before they find the garrison.',
    start: { x: -420, z: 2650, yaw: Math.PI }, squad: 3, role: 'rifleman',
    objectives: [
      { type: 'reach', text: 'Meet the patrol at the north edge of Tovar', x: -380, z: 2380, r: 18, radio: 'Iron 2, scouts reported in the wheat north of town. Take your section up there.' },
      { type: 'clear', text: 'Find and eliminate the NLF scout team', spawn: [{ faction: 'nlf', x: -300, z: 2160, n: 4, order: 'patrol', r: 60 }], radio: 'Contact north! Scout team in the fields.' },
      { type: 'clear', text: 'Repel the counter-attack on the farm', spawn: [{ faction: 'nlf', x: -560, z: 2080, n: 5, order: 'attack', tx: -380, tz: 2330 }, { faction: 'nlf', x: -200, z: 2050, n: 4, order: 'attack', tx: -380, tz: 2330 }], radio: 'More of them, two groups coming in from the north-west and north-east!' },
      { type: 'reach', text: 'Regroup at the Tovar garage', x: -420, z: 2620, r: 15, radio: 'Good work. Fall back to the garage, there is news from Kaldor.' },
    ],
    outro: 'The scouts were the leading edge of a full brigade. Kaldor, the old capital, is next in its path.',
  },
  {
    id: 'm2', name: 'The Ost Bridge', place: 'Kaldor', hour: 15, weather: 'overcast',
    brief: 'The NLF is pushing for the bridges over the River Ost into Kaldor. Command needs the east bridge held until the engineers can rig it. Dig in on the near bank with your section and a machine gun team, and hold.',
    start: { x: 720, z: 930, yaw: -0.6 }, squad: 4, role: 'autorifleman',
    objectives: [
      { type: 'reach', text: 'Take up positions at the east bridge', x: 760, z: 880, r: 25, radio: 'Engineers need fifteen minutes. Hold that bridge, Iron 2.' },
      { type: 'survive', text: 'Hold the bridge against the assault', x: 760, z: 880, r: 60, waves: 3, faction: 'nlf', from: { x: 1100, z: 700 }, radio: 'Infantry crossing the fields, here they come!' },
      { type: 'clear', text: 'Clear the last attackers from the far bank', spawn: [{ faction: 'nlf', x: 960, z: 760, n: 4, order: 'defend', r: 25 }], radio: 'Bridge is rigged. Push over and clear their support position.' },
    ],
    outro: 'The bridge held. But behind the fighting, NLF infiltrators had already slipped into the city.',
  },
  {
    id: 'm3', name: 'Blackout', place: 'Kaldor', hour: 21.5, weather: 'clear',
    brief: 'NLF commandos have seized the Kaldor comms station on the hill above the old town and cut our radio net. Without it the city cannot call for help. Retake the station and hold it while the signal corps brings it back up.',
    start: null, squad: 3, role: 'rifleman', nvg: true,
    objectives: [
      { type: 'reach', text: 'Approach the comms station (night-vision: N)', at: () => { const c = comms(); return [c.x - 140, c.z + 90] }, r: 25, radio: 'Station is ahead. Expect sentries.' },
      { type: 'clear', text: 'Retake the comms station', spawn: [{ faction: 'nlf', at: () => { const c = comms(); return [c.x, c.z] }, n: 5, order: 'defend', r: 25 }, { faction: 'nlf', at: () => { const c = comms(); return [c.x + 60, c.z - 40] }, n: 3, order: 'patrol', r: 50 }], radio: 'Sentries down? Go, go!' },
      { type: 'hold', text: 'Hold the station while it comes back online', at: () => { const c = comms(); return [c.x, c.z] }, r: 30, time: 75, attack: { faction: 'nlf', n: 4, waves: 2 }, radio: 'Signals are working on it. They will try to take it back.' },
    ],
    outro: 'Kaldor\'s radios came back to life with the first call of the night: the NLF holds Ilsen, and its commander is there.',
  },
  {
    id: 'm4', name: 'Lakeside', place: 'Ilsen', hour: 2.5, weather: 'overcast',
    brief: 'Colonel Ardan Vosk, who planned the northern offensive, has set up his headquarters in Ilsen, on the shore of Lake Selna. A small team can reach the village through the woods. Kill Vosk and get out before the garrison reacts. Suppressed weapons have been issued.',
    start: { x: 1520, z: -820, yaw: -2.4 }, squad: 2, role: 'marksman', nvg: true, suppressed: true,
    objectives: [
      { type: 'reach', text: 'Move through the woods to the edge of Ilsen', x: 1330, z: -1010, r: 25, radio: 'Quiet now. Patrols on the shore road.' },
      { type: 'kill', text: 'Eliminate Colonel Vosk', target: { faction: 'nlf', x: 1250, z: -1150, name: 'Colonel Ardan Vosk', guards: 6 }, radio: 'Vosk is in the village. Find him.' },
      { type: 'reach', text: 'Extract to the woods east of the lake', x: 1700, z: -760, r: 30, spawn: [{ faction: 'nlf', x: 1200, z: -1250, n: 5, order: 'attack', tx: 1500, tz: -900 }], radio: 'Target down! The whole village is awake, get out!' },
    ],
    outro: 'With Vosk dead the northern offensive stalled. Now it is our turn to attack.',
  },
  {
    id: 'm5', name: 'Iron Hammer', place: 'Marsk', hour: 10, weather: 'clear',
    brief: 'The NLF holds Marsk, the logging town in the eastern foothills, with armour dug in among the sawmills. You command a Bastion tank at the head of the counter-offensive. Destroy their armour, then the infantry can take the town.',
    start: { x: 2900, z: 100, yaw: 2.2 }, squad: 2, role: 'engineer', vehicle: 'mbt',
    objectives: [
      { type: 'reach', text: 'Advance on Marsk (F: get in the tank, LMB: main gun as gunner, X: change seat)', x: 3300, z: -280, r: 40, radio: 'Hammer 1, you are clear to advance.' },
      { type: 'destroy', text: 'Destroy the NLF armour in Marsk', vehicles: [{ type: 'ifv', x: 3480, z: -460 }, { type: 'mbt', x: 3600, z: -560 }, { type: 'technical', x: 3420, z: -600 }, { type: 'technical', x: 3560, z: -380 }], spawn: [{ faction: 'nlf', x: 3500, z: -500, n: 5, order: 'defend', r: 40 }], radio: 'Armour in the town! Engage!' },
      { type: 'clear', text: 'Clear the remaining defenders', spawn: [{ faction: 'nlf', x: 3520, z: -520, n: 4, order: 'defend', r: 30 }], radio: 'Their tanks are burning. Finish it.' },
    ],
    outro: 'Marsk fell by noon. Only Fort Grail and the summit of Mount Hallen still hold out for the NLF.',
  },
  {
    id: 'm6', name: 'Wings over Hallen', place: 'Fort Grail', hour: 17.5, weather: 'clear',
    brief: 'Fort Grail, on the shoulder of Mount Hallen, covers the last NLF positions with its guns. Before the ground assault goes in, the air force will hit its vehicles. You fly an Anvil ground-attack jet. Destroy the vehicles at the fort, then come back round for the summit station.',
    start: { x: 1900, z: 200, yaw: Math.PI * 0.85 }, squad: 0, role: 'rifleman', aircraft: 'groundattack',
    objectives: [
      { type: 'destroy', text: 'Destroy the vehicles at Fort Grail (LMB cannon, RMB rockets)', vehicles: [{ type: 'truck', x: 2880, z: -1680 }, { type: 'ifv', x: 2930, z: -1720 }, { type: 'technical', x: 2860, z: -1730 }, { type: 'ammotruck', x: 2950, z: -1660 }], radio: 'Anvil 1, targets are in the fort. Cleared hot.' },
      { type: 'destroy', text: 'Destroy the trucks at the Hallen summit station', vehicles: [{ type: 'truck', x: 2450, z: -2740 }, { type: 'fueltruck', x: 2420, z: -2770 }], radio: 'Good hits! Now the summit, the trucks by the station.' },
    ],
    outro: 'Fort Grail\'s guns fell silent at sunset. The road north lies open.',
  },
]
// A convoy route along a road of the island: its control points from `from` to `to`.
const road = (id, from, to) => { const r = ROADS.find(q => q.id === id); return r.pts.slice(from, to).map(([x, z]) => V(x, z)) }
const TWO = [
  {
    id: 'm7', name: 'Supply Line', place: 'the Sentinel road', hour: 8, weather: 'overcast',
    brief: 'Camp Sentinel, the NLF\'s last stronghold in the north, lives on the trucks that come up the Sentinel road. One convoy is on the road this morning: two trucks, a fuel tanker and an escort. Set an ambush on the high ground and stop it. An AT specialist is with your section.',
    start: { x: -700, z: -1700, yaw: 0.6 }, squad: 4, role: 'at',
    objectives: [
      { type: 'reach', text: 'Take the ambush position above the road', at: () => { const p = road('r6', 9, 10)[0]; return [p.x - 70, p.z + 30] }, r: 25, radio: 'Convoy left Kaldor junction ten minutes ago. Get into position.' },
      { type: 'destroy', text: 'Destroy the convoy (AT launcher: 2, or the rifles on the trucks)', convoy: { road: ['r6', 2, 20], types: ['technical', 'truck', 'fueltruck', 'truck'] }, radio: 'Vehicles on the road! Let the escort pass the bend, then hit them.' },
      { type: 'clear', text: 'Finish the survivors', spawn: [{ faction: 'nlf', at: () => { const p = road('r6', 9, 10)[0]; return [p.x + 30, p.z - 20] }, n: 4, order: 'attack', near: true }], radio: 'Dismounts in the ditch, clean them up.' },
    ],
    outro: 'Without its fuel, Sentinel cannot move its armour. The NLF turned east, to the sea.',
  },
  {
    id: 'm8', name: 'Harbour Run', place: 'Halvik', hour: 5.5, weather: 'rain',
    brief: 'The NLF has taken Halvik, the fishing town on the east coast, to bring in weapons by sea. Before dawn your section goes in by boat. Cross the bay in the rain, land on the quay and clear the harbour. A patrol boat guards the entrance.',
    start: { x: 4450, z: 1250, yaw: -0.9 }, squad: 3, role: 'rifleman', boat: 'rhib',
    objectives: [
      { type: 'reach', text: 'Cross the bay to the Halvik quay (W/S throttle, A/D steer)', x: 3830, z: 1560, r: 45, spawn: [{ faction: 'nlf', vehicle: 'patrolboat', x: 4150, z: 1480, order: 'patrol', r: 120 }], radio: 'Patrol boat in the bay. Stay low and fast.' },
      { type: 'clear', text: 'Clear the harbour', spawn: [{ faction: 'nlf', x: 3730, z: 1600, n: 5, order: 'defend', r: 35 }, { faction: 'nlf', x: 3650, z: 1520, n: 4, order: 'patrol', r: 60 }], radio: 'On the quay! Clear the warehouses.' },
      { type: 'hold', text: 'Hold the harbour until the relief arrives', x: 3720, z: 1590, r: 45, time: 60, attack: { faction: 'nlf', n: 4, waves: 2 }, radio: 'Relief is twenty minutes out. Hold the harbour.' },
    ],
    outro: 'The weapons ship turned back. The NLF had one more card to play: Rask Quarry and its stockpile.',
  },
  {
    id: 'm9', name: 'Air Assault', place: 'Rask Quarry', hour: 18.5, weather: 'clear',
    brief: 'NLF engineers are turning Rask Quarry into an explosives store for Sentinel. You fly your section there in a Kestrel transport helicopter. Land them close, then lead them in to clear the quarry before the stockpile can be moved.',
    start: { x: 420, z: 760, yaw: Math.PI * 0.95 }, squad: 3, role: 'rifleman', heli: 'transportheli',
    objectives: [
      { type: 'reach', text: 'Fly to the quarry and land in the landing zone (Space/C up/down, W/S/A/D tilt)', x: -60, z: -2050, r: 60, landed: true, radio: 'Kestrel 2, the LZ is the field south of the quarry. Squad boards with you.' },
      { type: 'clear', text: 'Clear the quarry', spawn: [{ faction: 'nlf', x: -200, z: -2300, n: 6, order: 'defend', r: 50 }, { faction: 'nlf', vehicle: 'technical', x: -150, z: -2380, order: 'patrol', r: 90 }], radio: 'Boots on the ground! Push into the quarry.' },
    ],
    outro: 'The stockpile went up with a roar that rattled windows in Kaldor. Only Camp Sentinel remains.',
  },
  {
    id: 'm10', name: 'Sentinel Gate', place: 'Camp Sentinel', hour: 11, weather: 'overcast',
    brief: 'The assault on Camp Sentinel begins. Two APCs go in with your platoon. Break through the gate, knock out the anti-aircraft vehicles so the air force can come in, and clear the barracks.',
    start: { x: 520, z: -3620, yaw: Math.PI }, squad: 4, role: 'at', allies: [{ vehicle: 'apc', x: 490, z: -3640 }, { vehicle: 'apc', x: 560, z: -3650 }],
    objectives: [
      { type: 'clear', text: 'Break through the checkpoint south of the camp', spawn: [{ faction: 'nlf', x: 500, z: -3880, n: 5, order: 'defend', r: 30 }, { faction: 'nlf', vehicle: 'technical', x: 540, z: -3900, order: 'defend', r: 20 }], radio: 'All units, advance on the checkpoint.' },
      { type: 'destroy', text: 'Destroy the anti-aircraft vehicles in the camp', vehicles: [{ type: 'ifv', x: 450, z: -4150 }, { type: 'ifv', x: 560, z: -4250 }], spawn: [{ faction: 'nlf', x: 500, z: -4180, n: 5, order: 'defend', r: 40 }], radio: 'The AA tracks are inside the wire. Take them out.' },
      { type: 'clear', text: 'Clear the barracks (and the gunship)', spawn: [{ faction: 'nlf', x: 480, z: -4230, n: 6, order: 'defend', r: 40 }, { faction: 'nlf', vehicle: 'attackheli', air: 80, x: 900, z: -4700, order: 'patrol', r: 350 }], radio: 'AA down! But they have a gunship up: rockets or the APCs\' guns can bring it down.' },
    ],
    outro: 'Sentinel fell. But its commander, General Rhuar, escaped south-west with his guard, towards Port Anselm.',
  },
  {
    id: 'm11', name: 'Anselm Docks', place: 'Port Anselm', hour: 20, weather: 'storm',
    brief: 'Rhuar has thrown everything he has left at Port Anselm: landing craft from the bay and gunboats offshore. Hold the docks with the city garrison. When the gunboats come close, sink them.',
    start: { x: -3420, z: 3380, yaw: 2.6 }, squad: 4, role: 'at',
    objectives: [
      { type: 'reach', text: 'Get to the docks', x: -3560, z: 3520, r: 40, radio: 'They are coming in from the bay. To the docks, Iron 2!' },
      { type: 'survive', text: 'Hold the docks against the landings', x: -3560, z: 3520, r: 70, waves: 3, faction: 'nlf', from: { x: -3700, z: 3780 }, radio: 'Landing parties on the beach!' },
      { type: 'destroy', text: 'Sink the gunboats (AT launcher: 2)', boats: [{ type: 'patrolboat', x: -3900, z: 3800 }, { type: 'patrolboat', x: -3750, z: 3950 }], radio: 'Gunboats closing on the quay! Sink them!' },
    ],
    outro: 'Port Anselm held through the storm. At first light, scouts found Rhuar\'s trail climbing Mount Hallen.',
  },
  {
    id: 'm12', name: 'The Iron Front', place: 'Mount Hallen', hour: 6, weather: 'fog',
    brief: 'General Rhuar has made his last stand at the radio station on the summit of Mount Hallen. Climb the mountain road with your section, take the summit, and end this war.',
    start: { x: 2620, z: -2380, yaw: Math.PI * 1.1 }, squad: 4, role: 'rifleman',
    objectives: [
      { type: 'clear', text: 'Fight up the mountain road', spawn: [{ faction: 'nlf', x: 2540, z: -2560, n: 5, order: 'defend', r: 35 }], radio: 'Fog on the mountain. Watch the switchbacks.' },
      { type: 'kill', text: 'Take the summit and kill General Rhuar', target: { faction: 'nlf', x: 2440, z: -2760, name: 'General Rhuar', guards: 7 }, radio: 'Rhuar is at the station. Go!' },
      { type: 'hold', text: 'Hold the summit against the last counter-attack', x: 2440, z: -2760, r: 40, time: 60, attack: { faction: 'nlf', n: 5, waves: 2 }, radio: 'His guard is coming back up the hill!' },
    ],
    outro: 'Rhuar is dead and the NLF has laid down its arms. Varden is free. Thank you for playing OPERATION: IRON FRONT.',
  },
]
ONE.forEach(m => { m.chapter = CHAPTER }); TWO.forEach(m => { m.chapter = CHAPTER2 })
export const MISSIONS = [...ONE, ...TWO]

export class Campaign extends Mode {
  get name() { return 'Campaign' }
  setup() {
    const g = this.g
    this.m = MISSIONS.find(m => m.id === this.opts.mission) || MISSIONS[0]
    this.idx = this.opts.checkpoint ?? 0
    this.squads = []; this.targets = []
    this.done = false; this.failed = false
    g.difficulty = g.settings.difficulty
    g.sky.hour = this.m.hour; g.sky.setWeather(this.m.weather); g.sky.cycle = false
    // no fixed start: 130 m short of the first objective, facing it
    const st = this.m.start || (() => { const o = this.m.objectives[0]; const p = o.at ? o.at() : [o.x, o.z]; return { x: p[0] + 120, z: p[1] - 60, yaw: Math.atan2(-120, 60) } })()
    this.startPos = st
    this.spawnAt(st.x, st.z, st.yaw)
    this.begin(this.idx)
  }
  spawnAt(x, z, yaw) {
    const g = this.g, m = this.m
    const p = this.findGround(x, z, 20) || [x, z]
    const s = g.spawnPlayer({ faction: 'vdf', role: m.role, x: p[0], z: p[1], yaw: yaw || 0, allowDown: false, name: 'Sgt. Iron 2' })
    if (m.nvg) s.inv.add({ kind: 'tool', id: 'nvg' })
    if (m.suppressed) for (const k of ['primary', 'sidearm']) { const w = s.inv.weapons[k]; if (w) w.att.muzzle = 'supp' }
    s.refreshWeapon(); s.selectWeapon('primary', true); g.player.rebuildViewmodel()
    if (m.squad) this.playerSquadAround(s, m.squad)
    if (m.vehicle) { const v = this.park(m.vehicle, p[0] + Math.sin(yaw) * 10, p[1] + Math.cos(yaw) * 10, yaw, { faction: 'vdf', search: 30 }); if (v && g.vehicles.enter(s, v)) g.vcontrol.entered(v) }
    if (m.aircraft) this.admin('vehicle', m.aircraft)
    // a boat or a helicopter to start in (the squad boards with you)
    for (const [key, kind] of [['boat', 'boat'], ['heli', 'heli']]) if (m[key]) {
      const v = this.park(m[key], p[0] + Math.sin(yaw) * 8, p[1] + Math.cos(yaw) * 8, yaw, { faction: 'vdf', search: 40 })
      if (v && g.vehicles.enter(s, v)) { g.vcontrol.entered(v); for (const mb of g.playerSquad?.members || []) if (mb !== s) g.vehicles.enter(mb, v, 'passenger') }
    }
    // friendly armour that advances with you
    for (const a of m.allies || []) { const q = this.crewed(a.vehicle, 'vdf', a.x, a.z, yaw, { type: 'attack', pos: V(this.pos(m.objectives[0])[0], this.pos(m.objectives[0])[1]) }); if (q) { q.ally = true; this.allies = [...(this.allies || []), q] } }
    return s
  }
  // the sandbox's airborne spawn, used for the jet mission
  admin(action, arg) {
    if (action !== 'vehicle') return
    const g = this.g, s = g.player.s
    const v = g.vehicles.spawn(arg, s.pos.x, s.pos.z, s.yaw, { faction: 'vdf', y: Math.max(heightAt(s.pos.x, s.pos.z), 0) + 300 })
    v.speed = 90; v.vel.set(Math.sin(s.yaw) * 90, 0, Math.cos(s.yaw) * 90); v.throttle = 0.75; v.gearDown = false; v.onGround = false; v.engine = true
    if (g.vehicles.enter(s, v)) { g.vcontrol.entered(v); g.player.lastView = 'tp' }
    return v
  }
  get obj() { return this.m.objectives[this.idx] }
  // Where an objective is: its place, its target, or (clear and destroy) the middle of what is left to kill.
  pos(o) {
    if (o.at) return o.at()
    if (o.x !== undefined) return [o.x, o.z]
    if (o.type === 'kill') return o.hvt && !o.hvt.dead ? [o.hvt.pos.x, o.hvt.pos.z] : [o.target.x, o.target.z]
    const things = o.type === 'destroy' ? (o.vehicles_ || []).filter(v => v.alive).map(v => v.pos) : (o.squads || []).flatMap(q => q.alive).map(m => m.pos)
    if (things.length) return [things.reduce((n, p) => n + p.x, 0) / things.length, things.reduce((n, p) => n + p.z, 0) / things.length]
    const sp = (o.spawn || [])[0] || (o.vehicles || [])[0]
    if (sp) return sp.at ? sp.at() : [sp.x, sp.z]
    const p = this.g.player.s.pos
    return [p.x, p.z]
  }
  // Starting an objective: its enemies, vehicles and timers.
  begin(i) {
    const g = this.g
    this.idx = i
    const o = this.obj
    if (!o) return this.complete()
    o.t = 0; o.state = {}
    if (o.radio) g.hud.radio('Command', o.radio)
    g.hud.note(`New objective: ${o.text}`, C.gold2)
    g.sfx.ui('radio')
    o.squads = []
    for (const sp of o.spawn || []) o.squads.push(this.squadFrom(sp))
    if (o.type === 'destroy') {
      o.vehicles_ = (o.vehicles || []).map(d => this.park(d.type, d.x, d.z, Math.random() * 6, { faction: 'nlf', search: 30 })).filter(Boolean)
      // crewed gunboats that close on the player
      for (const d of o.boats || []) { const q = this.crewed(d.type, 'nlf', d.x, d.z, 0, { type: 'attack', pos: V(this.pos(this.m.objectives[Math.max(0, i - 1)])[0], this.pos(this.m.objectives[Math.max(0, i - 1)])[1]) }); if (q) { o.vehicles_.push(q.vehicle); o.squads.push(q) } }
      // a convoy: crewed vehicles one behind the other along a road, all driving its route
      if (o.convoy) {
        const route = road(...o.convoy.road)
        o.convoy.types.forEach((t, k) => {
          const p = route[0], n = route[1], dx = n.x - p.x, dz = n.z - p.z, l = Math.hypot(dx, dz) || 1
          const q = this.crewed(t, 'nlf', p.x - dx / l * k * 22, p.z - dz / l * k * 22, Math.atan2(dx, dz), { type: 'patrol', route: route.slice(1) }, { search: 8 })
          if (q) { o.vehicles_.push(q.vehicle); o.squads.push(q) }
        })
      }
    }
    if (o.type === 'kill') {
      const T = o.target
      const q = this.spawnSquad(T.faction, T.x, T.z, T.guards, { type: 'defend', pos: V(T.x, T.z), radius: 30 }, { spread: 30 })
      const L = this.g.addSoldier({ faction: T.faction, role: 'officer', x: T.x + 3, z: T.z + 3, name: T.name })
      g.ai.add(L, q, 0.5)
      o.hvt = L; o.squads.push(q)
      // a patrol on the road too
      o.squads.push(this.squadFrom({ faction: T.faction, x: T.x + 120, z: T.z + 80, n: 3, order: 'patrol', r: 80 }))
    }
    if (this.g.debug) {
      // a check of what this objective set up: soldiers on dry land, the vehicles it asked for
      const men = o.squads.flatMap(q => q.members), wet = men.filter(m => waterLevel(m.pos.x, m.pos.z) > m.pos.y + 1).length
      const [ox, oz] = this.pos(o)
      g.p0.log('dbg objective', this.m.id, i, o.type, 'men', men.length, 'wet', wet, 'vehicles', (o.vehicles_ || []).length, 'asked', (o.vehicles || []).length + (o.boats || []).length + (o.convoy?.types.length || 0), 'target', Math.round(ox), Math.round(oz), 'land', Math.round(heightAt(ox, oz)), 'water', Math.round(waterLevel(ox, oz)))
    }
    if (o.type === 'survive') o.state.wave = 0
    for (const q of this.allies || []) if (q.alive.length) { const [ax, az] = this.pos(o); q.order = { type: 'attack', pos: V(ax, az) } }
    if (o.type === 'hold') o.state.wave = 0
    this.saveProgress()
  }
  squadFrom(sp) {
    let [x, z] = sp.at ? sp.at() : [sp.x, sp.z]
    if (sp.near) { const p = this.g.player.s.pos; x = (x + p.x) / 2; z = (z + p.z) / 2 }
    const order = sp.order === 'patrol' ? { type: 'patrol', route: this.patrolRoute(x, z, sp.r || 50) }
      : sp.order === 'attack' ? { type: 'attack', pos: V(sp.tx ?? this.g.player.s.pos.x, sp.tz ?? this.g.player.s.pos.z) }
        : { type: 'defend', pos: V(x, z), radius: sp.r || 25 }
    const q = sp.vehicle ? (this.crewed(sp.vehicle, sp.faction, x, z, Math.random() * 6, order, { air: sp.air }) || this.g.ai.squad(sp.faction, {})) : this.spawnSquad(sp.faction, x, z, sp.n, order, { spread: 15, formation: sp.order === 'patrol' ? 'file' : 'wedge' })
    this.squads.push(q)
    return q
  }
  update(dt) {
    super.update(dt)
    const g = this.g, s = g.player.s, o = this.obj
    if (!o || this.done || s.dead) return
    o.t += dt
    const [x, z] = this.pos(o)
    const near = r => Math.hypot(s.pos.x - x, s.pos.z - z) < r
    let ok = false
    if (o.type === 'reach') ok = near(o.r) && (!o.landed || !s.vehicle || s.vehicle.onGround)
    else if (o.type === 'clear') ok = o.squads.every(q => q.alive.length === 0)
    else if (o.type === 'destroy') ok = o.vehicles_.every(v => !v.alive)
    else if (o.type === 'kill') ok = o.hvt.dead
    else if (o.type === 'survive') {
      // waves come one after another from `from`; each must be beaten before the next
      const st = o.state
      if (!st.current || st.current.every(q => q.alive.length === 0)) {
        if (st.wave >= o.waves) ok = true
        else {
          st.wave++
          st.current = [0, 1].slice(0, st.wave > 1 ? 2 : 1).map(k => this.squadFrom({ faction: o.faction, x: o.from.x + k * 60, z: o.from.z - k * 40, n: 3 + st.wave, order: 'attack', tx: x, tz: z }))
          if (st.wave > 1) g.hud.note(`Wave ${st.wave} of ${o.waves}`, C.red)
        }
      }
    } else if (o.type === 'hold') {
      const st = o.state
      const enemies = g.soldiersNear(x, z, o.r).filter(e => !e.dead && e.team === 'nlf' && Math.hypot(e.pos.x - x, e.pos.z - z) < o.r).length
      if (near(o.r) && !enemies) st.held = (st.held || 0) + dt
      if (o.attack && st.wave < o.attack.waves && st.held > (st.wave + 1) * o.time / (o.attack.waves + 1)) {
        st.wave++
        const a = Math.random() * Math.PI * 2
        this.squadFrom({ faction: o.attack.faction, x: x + Math.cos(a) * 220, z: z + Math.sin(a) * 220, n: o.attack.n, order: 'attack', tx: x, tz: z })
        g.hud.radio('Signals', 'Enemy counter-attack inbound!')
      }
      ok = st.held >= o.time
    }
    if (this.dbgSkip) { this.dbgSkip = false; ok = true }
    if (ok) {
      g.sfx.ui('pickup')
      g.hud.note(`Objective complete: ${o.text}`, C.green)
      this.checkpoint = { idx: this.idx + 1, x: s.pos.x, z: s.pos.z, yaw: s.yaw }
      this.begin(this.idx + 1)
    }
  }
  complete() {
    if (this.done) return
    this.done = true
    const g = this.g, c = g.save.data.campaign
    if (!c.done.includes(this.m.id)) c.done.push(this.m.id)
    c.unlocked = Math.max(c.unlocked || 1, MISSIONS.indexOf(this.m) + 2)
    c.at = null
    g.save.store()
    g.hud.note('MISSION COMPLETE', C.gold2)
    setTimeout(() => { if (g.mode === this) { g.p0.input.unlockPointer(); g.menus.open('results') } }, 3000)
  }
  saveProgress() {
    const c = this.g.save.data.campaign
    c.at = { mission: this.m.id, checkpoint: this.idx }
    this.g.save.store()
  }
  results() {
    return { title: 'MISSION COMPLETE', reason: this.m.name, lines: [this.m.outro, `Kills ${this.kills}   Deaths ${this.deaths}   Time ${Math.floor(this.t / 60)} min`], next: MISSIONS[MISSIONS.indexOf(this.m) + 1] || null }
  }
  respawnOptions() { return [{ id: 'checkpoint', label: 'Retry from the checkpoint', sub: this.obj?.text || '' }, { id: 'restart', label: 'Restart the mission', sub: this.m.name }] }
  respawn(id) {
    const g = this.g
    if (id === 'restart') { g.start('campaign', { mission: this.m.id }); return }
    const cp = this.checkpoint || { x: this.startPos.x, z: this.startPos.z, yaw: this.startPos.yaw }
    const old = g.player.s
    const p = this.findGround(cp.x, cp.z, 15) || [cp.x, cp.z]
    const s = g.replacePlayer({ faction: 'vdf', role: this.m.role, x: p[0], z: p[1], yaw: cp.yaw || 0, name: 'Sgt. Iron 2' })
    if (this.m.nvg) s.inv.add({ kind: 'tool', id: 'nvg' })
    const q = g.playerSquad
    if (q) { q.members = q.members.filter(m => m !== old); q.members.unshift(s); q.order = { type: 'follow', target: s } }
    if (this.m.aircraft) this.admin('vehicle', this.m.aircraft)
    if (this.m.vehicle) { const v = this.park(this.m.vehicle, p[0] + 8, p[1] + 8, cp.yaw || 0, { faction: 'vdf', search: 30 }); if (v && g.vehicles.enter(s, v)) g.vcontrol.entered(v) }
  }
  // ---- HUD and map ----
  markers() { const o = this.obj; if (!o) return []; if (o.type === 'kill' && o.t <= 20) return [{ x: o.target.x, z: o.target.z, color: C.gold2 }]; const [x, z] = this.pos(o); return [{ x, z, color: C.gold2 }] }
  objectives() {
    const o = this.obj; if (!o) return []
    const [x, z] = this.pos(o)
    const out = [{ x, z, color: C.gold2, label: o.text.split('(')[0].trim() }]
    if (o.vehicles_) for (const v of o.vehicles_) if (v.alive) out.push({ x: v.pos.x, z: v.pos.z, color: '#e0483a', label: '' })
    return out
  }
  hudKey() { const o = this.obj; return [this.idx, o?.state?.wave, Math.floor(o?.state?.held || 0), o?.vehicles_?.filter(v => v.alive).length, o?.squads?.reduce((n, q) => n + q.alive.length, 0)].join() }
  drawHud(c, p, k) {
    const o = this.obj
    this.panelTitle(c, k, `${this.m.name.toUpperCase()}  ·  ${this.m.place}`, o ? o.text : 'Mission complete')
    if (!o) return
    let t = ''
    if (o.type === 'clear') t = `Enemies left: ${o.squads.reduce((n, q) => n + q.alive.length, 0)}`
    if (o.type === 'destroy') t = `Targets left: ${o.vehicles_.filter(v => v.alive).length}`
    if (o.type === 'survive') t = `Wave ${o.state.wave} of ${o.waves}`
    if (o.type === 'hold') t = `Held ${Math.floor(o.state.held || 0)} / ${o.time} s`
    if (o.type === 'reach') { const [x, z] = this.pos(o), s = this.g.player.s; t = `${Math.round(Math.hypot(s.pos.x - x, s.pos.z - z))} m` }
    if (t) text(c, t, 10 * k, 62 * k, { size: 12 * k, color: C.text, shadow: true })
  }
}

// The briefing screen's text for a mission.
export function drawBriefing(c, m, x, y, w, s) {
  text(c, (m.chapter || CHAPTER).toUpperCase(), x, y, { size: 12 * s, color: C.dim, weight: 700 })
  text(c, m.name.toUpperCase(), x, y + 34 * s, { size: 30 * s, weight: 900, color: C.gold2 })
  text(c, `${m.place}  ·  ${String(Math.floor(m.hour)).padStart(2, '0')}:${String(Math.round((m.hour % 1) * 60)).padStart(2, '0')}  ·  ${m.weather}`, x, y + 56 * s, { size: 12 * s, color: C.dim })
  let yy = wrap(c, m.brief, x, y + 84 * s, w, 19 * s, { size: 14 * s })
  yy += 6 * s
  text(c, 'OBJECTIVES', x, yy + 10 * s, { size: 12 * s, weight: 800, color: C.gold })
  yy += 28 * s
  for (const o of m.objectives) { text(c, '▸ ' + o.text, x, yy, { size: 13 * s, max: w }); yy += 20 * s }
  return yy
}
