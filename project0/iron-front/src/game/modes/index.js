// The game modes the menus can start.
import { FreeRoam } from './freeroam.js'
import { Battle, BATTLES } from './battle.js'
import { Campaign, MISSIONS } from './campaign.js'
import { OnlineBattle } from './online.js'

export const MODES = { freeroam: FreeRoam, battle: Battle, campaign: Campaign, online: OnlineBattle }
export const MODE_INFO = [
  { id: 'freeroam', name: 'Free Roam', desc: 'The whole island at war. Liberate towns, take any vehicle, use the sandbox tools.' },
  { id: 'battle', name: 'Battle', desc: Object.values(BATTLES).map(b => b.name).join(', ') + ' against the AI.' },
  { id: 'campaign', name: 'Campaign', desc: `VARDEN: ${MISSIONS.length} missions in two chapters.` },
  { id: 'online', name: 'Online Battle', desc: 'Team Deathmatch or Domination with the real players in this lot.' },
]
