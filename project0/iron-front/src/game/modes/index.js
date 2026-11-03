// The game modes the menus can start.
import { FreeRoam } from './freeroam.js'
import { Battle, BATTLES } from './battle.js'

export const MODES = { freeroam: FreeRoam, battle: Battle }
export const MODE_INFO = [
  { id: 'freeroam', name: 'Free Roam', desc: 'The whole island at war. Liberate towns, take any vehicle, use the sandbox tools.' },
  { id: 'battle', name: 'Battle', desc: Object.values(BATTLES).map(b => b.name).join(', ') + ' against the AI.' },
]
