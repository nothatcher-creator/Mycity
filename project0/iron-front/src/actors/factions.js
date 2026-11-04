// The four sides of the war for Varden: colours, kit, weapons, vehicles, ranks and how well they fight.
export const FACTIONS = {
  vdf: {
    id: 'vdf', name: 'Varden Defence Forces', short: 'VDF', color: '#5f7a3a',
    uniform: [0.36, 0.42, 0.25], gear: [0.28, 0.31, 0.2], helmet: [0.3, 0.34, 0.21], accent: [0.85, 0.75, 0.2], headgear: 'helmet',
    weapons: { rifleman: 'brenner', autorifleman: 'halberd', marksman: 'br51m', at: 'lance84', medic: 'brenner', officer: 'brenner', sniper: 'wraith300', mg: 'ironwood', engineer: 'vespa', grenadier: 'brenner' },
    sidearm: 'colonel45', vehicles: ['jeep', 'truck', 'apc', 'mbt', 'transportheli', 'attackheli', 'fighter'], skill: 0.6,
    ranks: ['Private', 'Corporal', 'Sergeant', 'Lieutenant', 'Captain', 'Major'],
  },
  nlf: {
    id: 'nlf', name: 'Northern Liberation Front', short: 'NLF', color: '#8a3b2e',
    uniform: [0.45, 0.4, 0.33], gear: [0.17, 0.17, 0.17], helmet: [0.3, 0.27, 0.22], accent: [0.75, 0.15, 0.12], headgear: 'cap',
    weapons: { rifleman: 'ks47', autorifleman: 'ks47l', marksman: 'dragoon', at: 'rk7', medic: 'ks74', officer: 'ks74', sniper: 'dragoon', mg: 'krag', engineer: 'ks105', grenadier: 'ks47' },
    sidearm: 'vm9', vehicles: ['technical', 'truck', 'ifv', 'mbt', 'transportheli', 'attackheli', 'groundattack'], skill: 0.5,
    ranks: ['Fighter', 'Squad Leader', 'Section Leader', 'Commander', 'Colonel', 'General'],
  },
  cef: {
    id: 'cef', name: 'Coalition Expeditionary Forces', short: 'CEF', color: '#b59a5a',
    uniform: [0.62, 0.55, 0.4], gear: [0.48, 0.41, 0.3], helmet: [0.55, 0.49, 0.36], accent: [0.2, 0.45, 0.75], headgear: 'helmet',
    weapons: { rifleman: 'vr4c', autorifleman: 'volt', marksman: 'spectre', at: 'valkyrie', medic: 'vr4c', officer: 'k36', sniper: 'longbow', mg: 'thunder3', engineer: 'wasp9', grenadier: 'vr4l' },
    sidearm: 'hornet57', vehicles: ['mrap', 'truck', 'ifv', 'mbt', 'transportheli', 'attackheli', 'fighter', 'transportplane'], skill: 0.75,
    ranks: ['Specialist', 'Corporal', 'Sergeant', 'Lieutenant', 'Captain', 'Major'],
  },
  res: {
    id: 'res', name: 'Independent Resistance', short: 'RES', color: '#3f6f8a',
    uniform: [0.3, 0.38, 0.5], gear: [0.42, 0.32, 0.22], helmet: [0.55, 0.22, 0.18], accent: [0.2, 0.55, 0.7], headgear: 'bandana',
    weapons: { rifleman: 'm70', autorifleman: 'ks47l', marksman: 'faro', at: 'rk7', medic: 'ks47', officer: 'm70', sniper: 's14', mg: 'krag', engineer: 'farmer2b', grenadier: 'm70' },
    sidearm: 'ranger44', vehicles: ['technical', 'pickup', 'car', 'motorbike', 'boat'], skill: 0.42, irregular: true,
    ranks: ['Volunteer', 'Fighter', 'Veteran', 'Cell Leader', 'Commander', 'Elder'],
  },
}
// Life mode's townspeople (and you): nobody's enemy, no weapons. Not offered as a side in the war modes.
FACTIONS.civ = {
  id: 'civ', name: 'Civilians', short: 'CIV', color: '#d8c79a', civil: true,
  uniform: [0.55, 0.6, 0.7], gear: [0.3, 0.3, 0.3], helmet: [0.3, 0.3, 0.35], accent: [0.9, 0.8, 0.4], headgear: 'none',
  weapons: {}, sidearm: null, vehicles: [], skill: 0, ranks: ['', '', '', '', '', ''],
}
export const ROLES = {
  rifleman: { name: 'Rifleman', grenades: 2 },
  autorifleman: { name: 'Autorifleman', grenades: 1 },
  marksman: { name: 'Marksman', grenades: 1 },
  at: { name: 'AT Specialist', grenades: 1, launcher: true },
  medic: { name: 'Medic', grenades: 1, medkits: 3 },
  officer: { name: 'Squad Leader', grenades: 2, smoke: 2 },
  sniper: { name: 'Sniper', grenades: 0 },
  mg: { name: 'Machine Gunner', grenades: 1 },
  engineer: { name: 'Engineer', grenades: 1, repair: true },
  grenadier: { name: 'Grenadier', grenades: 4 },
}
// Who fights whom in a free battle (modes can set their own sides).
export const ENEMIES = { vdf: ['nlf'], nlf: ['vdf', 'cef', 'res'], cef: ['nlf'], res: ['nlf'] }
export const hostile = (a, b) => a !== b && (ENEMIES[a]?.includes(b) || ENEMIES[b]?.includes(a))
