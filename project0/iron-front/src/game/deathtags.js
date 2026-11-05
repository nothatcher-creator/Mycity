// Death tags: the story of how a life ended, as short labels on the death screen ("HEADSHOT",
// "SNIPED · 412 M", "ROADKILL", "BLED OUT", "CAUGHT RELOADING"...), and the life's numbers (time alive,
// kills, accuracy, distance). Also the short tag shown when you kill someone ("HEADSHOT · 85 M").
import { hostile } from '../actors/factions.js'

const RED = '#ff5a45', AMBER = '#ffb02e', GOLD = '#ffd166', BLUE = '#7fc7ff', GREEN = '#8bd35c', DIM = '#c9c4b0'

export function newLife(game) { const s = game.player?.s; return { t0: game.time, kills: 0, heads: 0, shots: 0, hits: 0, dist: 0, longest: 0, last: s ? { x: s.pos.x, z: s.pos.z } : null, end: null } }

// how the killing blow came, from the victim's last hurt
function blow(s) {
  const h = s.lastHurt || {}, k = s.killer
  const dist = h.from ? Math.hypot(h.from.x - s.pos.x, h.from.z - s.pos.z) : k?.pos ? Math.hypot(k.pos.x - s.pos.x, k.pos.z - s.pos.z) : 0
  return { h, k, dist }
}

export function deathTags(game, s, life) {
  const out = [], add = (text, color = DIM) => { if (!out.some(t => t.text === text)) out.push({ text, color }) }
  const { h, k, dist } = blow(s)
  const recent = h.t != null && s.time - h.t < 4
  const cause = s.deathCause
  const alive = life ? game.time - life.t0 : 999
  // how
  if (cause === 'starve') add('STARVED', AMBER)
  else if (cause === 'thirst') add('DIED OF THIRST', AMBER)
  else if (cause === 'bleed' || (!recent && s.bleed > 0)) add('BLED OUT', RED)
  else if (cause === 'down') add('NO MEDIC CAME', RED)
  if (recent) {
    if (h.kind === 'bullet' && h.part === 'head') add('HEADSHOT', RED)
    if (h.kind === 'blast') add(k?.vehicle ? 'SHELLED' : 'BLOWN UP', RED)
    if (h.kind === 'fire') add('BURNED', RED)
    if (h.kind === 'fall') add(s.bailed != null && s.time - s.bailed < 3 ? 'BAILED OUT AT SPEED' : 'FELL TO YOUR DEATH', AMBER)
    if (h.kind === 'vehicle') add(k && k !== s ? 'ROADKILL' : 'CRUSHED', AMBER)
    if (h.kind === 'melee') add(k?.infected ? 'MAULED BY THE INFECTED' : 'BEATEN TO DEATH', RED)
    if (h.kind === 'bullet' && dist > 250) add(`SNIPED · ${Math.round(dist)} M`, RED)
    else if (h.kind === 'bullet' && dist > 0 && dist < 4) add('POINT BLANK', RED)
  }
  // by whom
  if (k === s) add(h.kind === 'blast' ? 'YOUR OWN EXPLOSIVE' : 'SELF-INFLICTED', AMBER)
  else if (k && !hostile(k.team, s.team) && !k.infected) add('FRIENDLY FIRE', AMBER)
  if (k && k !== s && k.vehicle) {
    const kind = k.vehicle.kind, id = k.vehicle.def?.cls || ''
    add(kind === 'heli' || kind === 'plane' ? 'KILLED FROM THE AIR' : kind === 'tracked' ? 'TANKED' : kind === 'boat' ? 'FROM THE WATER' : `KILLED BY A ${id.toUpperCase() || 'VEHICLE'}`, RED)
  }
  // where and doing what
  if (s.parachute) add('SHOT DOWN UNDER CANOPY', BLUE)
  if (s.vehicle) add('WENT DOWN WITH THE VEHICLE', BLUE)
  if (s.swimming) add('DIED IN THE WATER', BLUE)
  if (s.reloading || (s.w?.reloadT > 0)) add('CAUGHT RELOADING', AMBER)
  else if (s.w && !s.w.rec.mag && !s.w.rec.chamber) add('OUT OF AMMO', AMBER)
  if (s.stance === 2 && !s.down && recent && h.kind === 'bullet') add('CAUGHT PRONE', DIM)
  if ((game.sky?.night ?? 0) > 0.6) add('IN THE DARK', BLUE)
  // the life itself
  if (alive < 15) add('WELCOME TO VARDEN', AMBER)
  else if (alive > 1800) add('VETERAN', GOLD)
  if (life?.kills >= 10) add(`RAMPAGE · ${life.kills} KILLS`, GOLD)
  else if (life?.kills >= 5) add(`ON A STREAK · ${life.kills}`, GOLD)
  else if (life && !life.kills && alive > 300) add('PACIFIST', GREEN)
  if (life?.heads >= 3) add(`SHARPSHOOTER · ${life.heads} HEADSHOTS`, GOLD)
  if (life?.dist > 3000) add(`MARATHON · ${(life.dist / 1000).toFixed(1)} KM`, GREEN)
  if (!out.length) add('KILLED', RED)
  return out.slice(0, 6)
}

// The life's numbers for the death screen
export function lifeStats(game, life) {
  if (!life) return []
  const t = Math.max(0, (life.end ?? game.time) - life.t0), m = Math.floor(t / 60), sec = Math.floor(t % 60)
  const acc = life.shots ? Math.min(100, Math.round(life.hits / life.shots * 100)) : null
  return [
    ['ALIVE', m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m}:${String(sec).padStart(2, '0')}`],
    ['KILLS', String(life.kills)],
    ['ACCURACY', acc == null ? '–' : `${acc}%`],
    ['LONGEST KILL', life.longest ? `${Math.round(life.longest)} m` : '–'],
    ['TRAVELLED', life.dist >= 1000 ? `${(life.dist / 1000).toFixed(1)} km` : `${Math.round(life.dist)} m`],
  ]
}

// The short tag on a kill you made
export function killTag(victim, killer) {
  const { h, dist } = blow(victim), bits = []
  if (h.kind === 'bullet' && h.part === 'head') bits.push('HEADSHOT')
  if (h.kind === 'melee') bits.push('MELEE')
  if (h.kind === 'blast') bits.push('EXPLOSIVE')
  if (h.kind === 'vehicle') bits.push('ROADKILL')
  if (dist > 1) bits.push(`${Math.round(dist)} M`)
  return bits.join(' · ')
}
