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
| **Free Roam** | The whole island at war. Garrisons appear as you approach a place; clear an enemy-held place to liberate it (saved). Patrols, AI-crewed vehicles, an enemy gunship or jet sweep every few minutes, parked vehicles at bases, airfields and harbours. Sandbox tools in the pause menu: spawn vehicles (aircraft start airborne), squads and weapons, set time and weather, teleport by the map, invulnerability. |
| **Multiplayer** | A server browser: every server hosted by players in this lot's session, with its mode, map, players, slots and round time, a map of the battle area, the teams, and Join, Host Server and Invite (the city's invitation lands the friend on that server in the browser). A host picks the name, Team Deathmatch or Domination, the map, round length, slots, time of day and weather. Several servers can run at once in the one session. The city puts everyone inside a lot into one session of up to 16 (more people get a second session), and a game cannot see other sessions, so the list shows the servers of the players you are with, not every player of the game. Real players only, no AI. Each client simulates everyone's shots and damages only its own player; each server's record, flags, score and end live under its own keys in the session's shared state, run by its host (or the next player in it when the host leaves); the last player out closes it. |
| **Life** | Varden after the war, as a civilian. Your home is in Kaldor (sleep, save, a stash); townspeople walk the pavements, live in the houses and keep the shops: general store, café, chemist, clothes shop, hardware and outdoor, fuel station (fill up your car) and a car dealer. Buy and sell at each counter; shops keep opening hours (the fuel station never closes), and the streets empty out at night. Work as a bus driver (five stops, passengers board and leave), a parcel courier (take the parcels from the van to the doors) or a taxi driver (pick up the fare, paid by distance). Food and water run down: eat and drink or weaken. Fishing with a rod at the water's edge. Town traffic drives the streets and stops for people in the road. Money, things, clothes, stash and bought vehicles are saved. The townspeople are the game's own characters, not other players. |
| **Survival** | Varden after an outbreak, DayZ-style. You wash up on the coast or at a village edge with a small starter kit; the infected wander the towns. They see you by day within about 34 m (less at night, crouched or prone) and hear shots and blasts from far off, then come running. Scavenge supply piles in houses, shops and military sites (food, water, medicine, clothes, weapons and ammunition), keep fed and watered, patch bleeding, find a car with a little fuel left. One life: dying wipes the character. Melee (X) saves ammunition. The infected are the game's own characters, not other players. |
| **Battle** | Team Deathmatch, Domination, Conquest, King of the Hill, Capture the Flag, Sector Control and Survival (waves of attackers; not the Survival mode above), at 12 places, with settings for side, side size, score and time limits, time of day, weather and difficulty. |

### Controls (keyboard and mouse; every key can be rebound in Controls)

| | |
|---|---|
| Move / sprint / walk | W A S D, Shift, Caps Lock (walk on/off) |
| Free look (turn the head, not the gun) | hold Alt |
| Auto-run on / off | the key left of 1 (` ): forward or back takes over again |
| At a body | F searches it, R takes every magazine that fits your weapons in one go |
| Jump or vault / crouch / prone / lean | Space, C, Z, Q and E |
| Fire / aim down sights | left mouse / hold right mouse |
| Reload / fire mode / zeroing | R, B, Page Up and Page Down |
| Weapons / grenade / heal | 1–3 or the wheel, G throws, 4 chooses frag, smoke or flashbang, H |
| Use, enter and leave vehicles | F; when several things are in reach, the mouse wheel scrolls the action list (Arma style: get in as driver, gunner or passenger, search, take ammo, repair, refuel, open storage, revive, talk) and F does the highlighted one; on touch the ••• button opens the list |
| Melee | X: a rifle butt or punch at whoever is in front of you (stronger to the head) |
| First / third person, shoulder | V, K |
| Map / inventory / squad orders / pause | M, Tab, T, P. In the inventory, right click (long press on touch) on a thing shows its options: use, eat or drink, drop, take, take all, inspect |
| Binoculars / night vision / flashlight / bipod / hold breath | O, N, L, J, Shift (aiming with a scope) |
| Field gear: use / next | Y, U (or Use in the inventory) |
| Heal | H: a bandage if bleeding, a splint for a broken leg, then a first aid kit or medkit, then a painkiller |
| Vehicles | W S throttle or pitch, A D steer or roll, Space and C up and down, Shift boost, X change seat, R flares, G landing gear, H horn, L headlights, E engine on/off, V first person (the driver's seat with a dashboard and wheel; a gunner looks along the gun), Tab the vehicle's storage |

The map: wheel or + / − to zoom, drag to pan, ME to centre on you, click for a waypoint (right click or CLEAR WP removes it). MARK switches clicks to your own numbered markers (up to nine; click one again to remove it), shown on the minimap too. Close in, roads and buildings are drawn sharp over the picture; airfields, military sites and fuel stations have symbols; every 250 m of height has a darker contour. The waypoint (set on the map) and the mode's objectives show on screen as small diamonds with their distance (a setting hides them). The pause menu has UNSTUCK: out of a wall or a hole to clear ground nearby. A body at your feet takes the prompt over a vehicle further off. Enter (chat) and Esc (leave) belong to the city. Aircraft follow the mouse with flight assist on.

**Phones and tablets:** two thumbs at once. The game draws its own movement stick (the city's is hidden
with `"stick": false` in `experience.json`): put your left thumb down anywhere in the lower left and it
appears under it, pushed to the rim you sprint. Drag anywhere else with the right thumb to look; hold FIRE
and drag to aim while shooting. Each finger keeps its own job, so lifting one never stops another
(`src/core/touch.js`: events carry no finger id, but each one's dx/dy runs from that finger's last
position, which tells them apart). A setting makes the stick turn you instead of strafing; aim assist
pulls the view onto a visible enemy within about 5° while aiming or firing (a setting turns it off).
Buttons for fire (hold), aim, reload, stance, jump, use, grenade (the small button beside it picks the kind), gear, view, map, kit, heal, night vision (NV) and the menu; in a vehicle also ENG, LIGHTS and KIT.
(Before, the city's stick and the game were in different frames, and the browser sends every finger of a
gesture to the frame the first touched, so the game never saw a second finger.)

### Look

At night a share of the windows glow warm (the same ones every night: a hash of each pane's place), on the near buildings' glass and on the painted windows of the distant ones; storms flash with lightning and the thunder rolls in a few seconds later; flocks of birds wheel over the land by day (gulls by the coast), flapping and gliding, and scatter when shooting or a blast goes off near them (`src/world/birds.js`, three draw calls for all of them); they roost at night and in heavy rain; birds sing by day and crickets at night (both loops made by `tools/sfxgen.py`, like every sound). In Free Roam the towns your side holds have a few townspeople on the pavements, fewer at night, who run from shooting and blasts and crouch in cover until it has been quiet a while (`src/game/civilians.js`); killing one is noted against you.

Colours are written as display values and converted to linear once where each mesh is built
(`src/core/color.js`); before, raw palettes were lit past white and the island looked washed out. The
ground has large dry patches, darker lush hollows and fine mottling close by; trees stand at most 6.4 m apart, with a lone tree
here and there in the open (far away two in five are drawn, wider); grass clumps (medium and
high quality, `src/world/grass.js`) cover the ground round you in 16 m chunks, sway in the wind and fade
into the ground at the edge, with tall golden stalks in the wheat. The sky has layered clouds lit from
the sun's side, a sun disc and glow, a warm band at dawn and dusk, and small twinkling stars only in full
night; nights are darker and bluer. Soldiers die in three beats: the knees give and the body slumps, it topples the way the hit pushed it (back when
shot from the front, forward from behind, with a twist), arms flung out, lands with a small bounce and lies
sprawled, each a little differently, the rifle on the ground beside it; your own view drops and rolls to the
ground before rising over your body. Soldiers wear camouflage in square blotches, plate carriers with
pouches and a radio, belts, knee pads, boots and rounded helmets, and have faces. Weapons have rail
teeth, ejection ports, charging handles, trigger guards and gas blocks; the one in your hands is shiny.
Military vehicles carry blocky camouflage on their painted panels, mud low down, visible lamps,
exhausts and a whip aerial.

### Interface

All interface is drawn by the game on canvases (`src/ui/`): dark olive glass panels with chamfered
corners and amber corner brackets, segmented bars, line icons and the Chakra Petch display face
(embedded in `src/ui/fonts-data.js`, SIL Open Font License; licence text in `assets/font/OFL.txt`).
The title screen has numbered modes and a field report (campaign progress, liberated places, players in
the lot, tips). Desktop: status bottom left, weapon bottom right, compass top centre, minimap top right.
Phones keep 60 px clear for the city's bar; narrow screens get a compact HUD (health and ammo side by
side at the top, compass and minimap below) and round icon buttons (fire, aim, reload, stance, jump,
use, grenade, gear) in an arc for the right thumb, with view, map, kit and heal down the right edge.

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
  (`nav.js`), and AI vehicle crews: gunners, drivers, attack-helicopter pilots that hold altitude,
  circle their target and fire rockets, and jet pilots that dive on targets with the cannon, pull out and come round again.
- **AI support roles**: anti-tank soldiers switch to their launcher against ground vehicles and boats
  (25–350 m, one rocket every 8–12 s, never with a friend beside the target); medics out of the fight
  treat squad-mates who are hurt or down, and you.
- **Concealment**: spotting falls off steeply with range, and woods along the sight line or around a
  crouching or prone target slow it further; deep in the trees contact can be broken.
- **Destruction**: tank shells, rockets, missiles and bombs knock wall sections out of buildings (`citystream.js`), and glass breaks.
- **Combat** (`src/combat/`): bullets are projectiles with gravity, drag, penetration by material and
  thickness, ricochets and near-miss suppression (`ballistics.js`); 70 hand-held weapons and 13 mounted
  ones with attachments (`weapons-data.js`); models built in code (`weapon-models.js`).
- **Vehicles** (`src/vehicles/`): 44 types: cars, a sports car, a muscle car, a minivan, a taxi, a police cruiser, a delivery van, a city bus, a fire engine (ladder and light bar), a dune buggy, a tractor, a scooter, bikes, trucks, an armed utility vehicle, technicals
  (machine gun or grenade launcher), a field ambulance (heals at the tailgate), APC, IFV, tank, armoured
  car, a quad-23 mm anti-aircraft vehicle, helicopters (including an armed transport with rocket pods),
  planes and boats (including a speedboat), with seats, mounted weapons, armour and damage. Each has storage (Tab beside or inside it), headlights and an engine you can switch off; windows are see-through so first person works from the seat.
- **Field gear** (`src/game/gear.js`): AT mines (go off under ground vehicles), demolition charges
  (10-second fuse, on the ground or stuck to a vehicle), sandbag walls (cover that stops rifle fire, the
  AI uses it too), the field radio (a five-round mortar strike where you look, 60–900 m, every 150 s),
  rations (stamina), a ghillie suit (crouched or prone, the AI takes about twice as long to spot you).
  Section leaders carry radios, engineers mines and charges, machine gunners sandbags; missions hand
  out what they need (sandbags at the bridge and the docks, mines for the ambush, charges and a radio
  for Camp Sentinel).
- **Inventory** (`src/game/inventory.js`): what you wear sets what you can carry (pockets, vest,
  backpack); weight slows you; looting bodies and stashes.
- **Arsenal** (`src/ui/arsenal.js`, `src/game/loadout.js`): every weapon, attachment, piece of clothing and item, from the main menu or the pause menu in Free Roam and Battle. Six saved loadouts kept with your save; one can be marked to wear whenever you deploy or respawn there, and EQUIP NOW puts one on at once. It shows the weight and warns when things will not fit.
- **Modes** (`src/game/modes/`): `freeroam.js`, `battle.js`, `campaign.js`, `life.js`, `survival.js` on a shared `base.js`.
- **Stairs and ramps**: a walkable contact (a step or slope you can stand on) lifts you straight up instead of pushing you back, so stairs climb at walking pace (`src/world/collision.js`).
- **Saves** (`src/game/save.js`): settings, key bindings, campaign progress, liberated places and the
  free-roam position and kit, kept by the city (`p0.save`, 16 KB).
- **Sound** (`src/game/sfx.js`): 35 effects, all synthesised for this game by `tools/sfxgen.py`.
- **Light version**: the game measures the first frames and drops to low quality on slow machines
  (fewer pixels, shorter view, fewer AI near you).

### Balance

Worked out with a simulation of the game's own formulas (`hurt`, the AI's aim model, the hitboxes) and
checked in the dev kit. Against a standard plate carrier: 5.56 and 7.62 rifles kill in 4 torso hits,
battle rifles in 3, pistols and SMGs in 6–7; a helmet stops a 5.56 headshot from killing outright (not a
7.62). One AI rifleman at normal difficulty kills a standing player in the open in about 4 s at 15 m,
6 s at 40 m, 13 s at 100 m and 30 s at 200 m (its first bursts at a new target start wide, then
tighten over 3 s); lying prone roughly doubles that at range. Vehicles: a rocket stops anything up to an
APC, two an IFV, three a main battle tank; two tank shells or ATGMs kill a tank; a .50 cal goes through
light armour (APC, MRAP) but not an IFV or tank. Load: a standard 21 kg kit is about full speed, a
36 kg anti-tank kit about 0.78. In the campaign the section shares out ammunition after each fight (at
least half a standard kit's magazines, rockets and grenades, two bandages).

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
technical, Numpad2 an enemy anti-tank team with a sight line to you, Numpad3 wounds you (medic test),
Numpad9 logs your state and every AI's,
] moves the clock on two hours, [ changes the weather, \ cycles the graphics quality,
Numpad6 gives you all the field gear (and aims at the ground 80 m out), Numpad4 spawns the next new vehicle, Delete puts you in a boat, F1 swings a jet's aim, F2 prints the vehicle's state.

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

- Multiplayer has only been tested against the dev kit's simulated player (one client): the browser was checked with sample servers, and hosting and joining by one client; two or more real players on several servers in the same session have not been tested. Players in a match see each other as soldiers (no vehicles online).
- The campaign has not been played through by hand, so difficulty and balance are not tuned.
- AI flies attack helicopters and jets, but does not take off or land. AI drivers route round buildings on a coarse grid, not along roads.
- Mouse aiming could not be checked by hand in the headless browser.
- Performance on real phones and laptops has not been measured.
- Players' browsers reported "the script stopped answering" (the city's 12-second watchdog). The shader warm-up on the first deploy used to run in one block (about 4.6 s in the dev kit's software renderer, longer on a slow phone driver), with full 3D frames behind the deploying screen on top. It now compiles, links and first-draws a few materials at a time with pauses between (longest block about 1.4 s in the dev kit). Whether that was the only cause on the reporting devices cannot be confirmed: the reports carry no stack or device.
- Life: shops and their opening hours, the home screen, sleep, the stash, buying a vehicle, quitting and continuing (money, position and vehicles kept), the bus route (stops, boarding, pay), the taxi job end to end (pick-up, drop-off, fare) and the delivery job starting were checked in the dev kit with test keys; casting a fishing line was checked, but a catch was not waited for (the dev kit runs game time slowly), and a whole working day has not been played through by hand. Town traffic follows a street up and down and can still clip corners.
- Survival: spawning, the supply piles, the infected hearing a shot and chasing, melee kills, needs and the HUD were checked in the dev kit; a long run (hours of scavenging, a death and the save wiped) has not been played through by hand.
- Birds, the new vehicles (fire engine, minivan, muscle car, dune buggy driven in the dev kit; the speedboat only rendered, not sailed), map markers and the sharper map were checked in the dev kit. The arsenal's loadouts, the action menu and right-click menus were checked with the mouse in the dev kit; touch long-press was not tried on a real phone.
