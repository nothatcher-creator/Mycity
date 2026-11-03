# OPERATION: IRON FRONT

An open-world military game for Project 0 lot **3084**, written in JavaScript on three.js
(about 10,500 lines). The campaign, Free Roam and Battle are single player against AI; Online Battle pits the real
players inside the lot against each other (no AI there).

- Play it: enter lot 3084 in Project 0 (the game runs in the platform's sandbox).
- Source: this folder. Exterior (the lot's street view): `lot/`.

## The game

The island of **Varden**, 12 × 12 km: Port Anselm (modern harbour city), Kaldor (old inland city on the
River Ost), Kessel Airbase, nine towns and villages, Camp Sentinel and Fort Grail, Mount Hallen (about
900 m) with its summit station, forests, lakes, rivers and A*-routed roads. Four sides: the Varden Defence
Forces (VDF), the Northern Liberation Front (NLF), the Coalition Expeditionary Forces (CEF) and the
Independent Resistance (RES).

### Modes

| Mode | What it is |
|---|---|
| **Campaign** | VARDEN, 12 missions in two chapters: patrols, defence, night raids, a tank assault, a jet strike, a convoy ambush, a boat assault, a helicopter insertion, Camp Sentinel, Port Anselm, the Mount Hallen finale. Briefings, checkpoints, saved progress and unlocks. |
| **Free Roam** | The whole island at war. Garrisons appear as you approach a place; clear an enemy-held place to liberate it (saved). Patrols, AI-crewed vehicles, an enemy gunship sweep every few minutes, parked vehicles at bases, airfields and harbours. Sandbox tools in the pause menu: spawn vehicles (aircraft start airborne), squads and weapons, set time and weather, teleport by the map, invulnerability. |
| **Online Battle** | Team Deathmatch or Domination with the real players inside the lot (up to 16), no AI. Each client simulates everyone's shots and damages only its own player; scores, teams and the match live in the session's shared state; the host turns the flags. |
| **Battle** | Team Deathmatch, Domination, Conquest, King of the Hill, Capture the Flag, Sector Control and Survival, at 12 places, with settings for side, side size, score and time limits, time of day, weather and difficulty. |

### Controls (keyboard and mouse; every key can be rebound in Controls)

| | |
|---|---|
| Move / sprint / walk | W A S D, Shift, Alt |
| Jump or vault / crouch / prone / lean | Space, C, Z, Q and E |
| Fire / aim down sights | left mouse / hold right mouse |
| Reload / fire mode / zeroing | R, B, Page Up and Page Down |
| Weapons / grenade / heal | 1–3 or the wheel, G, H |
| Use, enter and leave vehicles | F |
| First / third person, shoulder | V, K |
| Map / inventory / squad orders / pause | M, Tab, T, P |
| Binoculars / night vision / flashlight / bipod / hold breath | O, N, L, J, Shift (aiming with a scope) |
| Vehicles | W S throttle or pitch, A D steer or roll, Space and C up and down, Shift boost, X change seat, R flares, G landing gear, H horn |

Enter (chat) and Esc (leave) belong to the city. Aircraft follow the mouse with flight assist on.

**Phones and tablets:** the city's stick moves you and its left and right turn you (the platform follows one finger at a time, so moving and looking with two fingers is not possible; a setting switches the stick back to strafing); drag anywhere else to look, also up and down; buttons for fire (hold), aim,
reload, stance, jump, use, grenade, view, map, inventory, heal and the menu.

## How it works

The game runs in a Web Worker with no page of its own: all interface is drawn on canvases shown as
quads over the 3D view.

- **Floating origin** (`src/core/engine.js`): the camera stays inside the lot; the island moves round it.
- **World** (`src/world/`): a deterministic heightfield with erosion (`heightfield.js`), places and
  buildings from a blueprint (`blueprint.js`, `places.js`), streamed detail near the player and cheap
  shells far away (`citystream.js`), quadtree terrain (`terrain.js`), instanced vegetation, roads,
  water, sky with day/night and weather, rain streaks and storm lightning with thunder (`rain.js`). Collision is a grid of oriented boxes (`collision.js`).
- **Soldiers** (`src/actors/`): one `Soldier` for the player and the AI (stances, lean, stamina, weight,
  vaulting, ladders, swimming, body-part damage, bleeding, armour). AI with senses, cover, flanking,
  grenades, suppression, squad orders and formations (`ai.js`), grid A* pathfinding round buildings
  (`nav.js`), and AI vehicle crews: gunners, drivers, and attack-helicopter pilots that hold altitude,
  circle their target and fire rockets.
- **Destruction**: tank shells, rockets, missiles and bombs knock wall sections out of buildings (`citystream.js`), and glass breaks.
- **Combat** (`src/combat/`): bullets are projectiles with gravity, drag, penetration by material and
  thickness, ricochets and near-miss suppression (`ballistics.js`); 48 hand-held weapons and 11 mounted
  ones with attachments (`weapons-data.js`); models built in code (`weapon-models.js`).
- **Vehicles** (`src/vehicles/`): 27 types: cars, bikes, trucks, APC, IFV, tank, armoured car,
  helicopters, planes and boats, with seats, mounted weapons, armour and damage.
- **Inventory** (`src/game/inventory.js`): what you wear sets what you can carry (pockets, vest,
  backpack); weight slows you; looting bodies and stashes.
- **Modes** (`src/game/modes/`): `freeroam.js`, `battle.js`, `campaign.js` on a shared `base.js`.
- **Saves** (`src/game/save.js`): settings, key bindings, campaign progress, liberated places and the
  free-roam position and kit, kept by the city (`p0.save`, 16 KB).
- **Sound** (`src/game/sfx.js`): 35 effects, all synthesised for this game by `tools/sfxgen.py`.
- **Light version**: the game measures the first frames and drops to low quality on slow machines
  (fewer pixels, shorter view, fewer AI near you).

### The lot's exterior (`lot/`)

`lot/gen.mjs` builds the three levels of detail of the street view: a battlefield diorama with two
tanks firing, a fire team running round a radio mast, riflemen in trenches, shell bursts, a burning
ruin and a ground-attack jet circling a four-sided sign. Shaders: `glow.glsl`, `glowv.glsl` (muzzle
flashes, tracers, fire, bursts) and `sign.glsl`; `build.js` keeps the 24-second loop on the world clock.
The sign uses the Chakra Petch typeface (SIL Open Font License), rendered into its texture.

## Developing

Serve this folder with CORS and open the Project 0 dev kit:
`https://project0.city/devkit?entry=http://127.0.0.1:5500/main.js&width=12&depth=12&height=19`.

When served from `127.0.0.1` or `localhost` the game logs debug lines and accepts test keys (they are
off in the published game): F9 Free Roam, F10 the next Battle mode, F12 the next campaign mission,
F11 back to the menu, Home completes the current objective, End moves you near it, F3–F7 put you in a
fighter, helicopter, tank or jeep, F4 teleports to open country, Insert spawns an enemy crewed
technical, Delete puts you in a boat, F1 swings a jet's aim, F2 prints the vehicle's state.

- `tools/pack.sh` builds `build/experience.zip` (and refuses lines over 1,000 characters).
- Validate and publish with the Project 0 agent API (`/api/agent/lots/3084/experience/validate`, then
  `/experience`); the key is never stored in this repository.
- `node lot/gen.mjs lot/out` rebuilds the exterior (needs three, @gltf-transform/core and sharp).
- `tools/roadgen.mjs` re-routes the roads; `tools/mapgen.mjs` renders the island map.

## What was tested, and what is not done

Tested in the Project 0 dev kit (Chromium with its software renderer): booting and the review
simulation (no errors, about 4–5 fps at 640 × 360 in software, light mode on); the menus; Free Roam
movement, firing, AI firefights, liberation logic, the map and the inventory screen; the jeep, tank,
helicopter, fighter jet (airborne, turning and climbing under the mouse-aim autopilot) and boat; an AI
crewed vehicle driving in and firing; an AI attack helicopter flying in, firing and circling; all seven Battle modes starting and running; all twelve campaign
missions starting in place and reaching their end screen with objectives skipped, and the first
mission's firefight fought out by the AI; touch look on a simulated phone screen.

Not done or not verified:

- Online Battle has only been tested against the dev kit's simulated player (one client); two real players in the same session have not been tested. Players in a match see each other as soldiers (no vehicles online).
- The campaign has not been played through by hand, so difficulty and balance are not tuned.
- AI flies attack helicopters only (no planes, no landing). AI drivers route round buildings on a coarse grid, not along roads.
- Mouse aiming could not be checked by hand in the headless browser.
- Performance on real phones and laptops has not been measured.
