# VOIDWRIGHT

An open star system to build in, for Project 0 (lot 224). Ships and stations are made of blocks on large
(2.5 m) and small (0.5 m) grids; they have real mass, thrust and inertia. Planets, moons and asteroids can be
landed on and built on. Everything here (code, block models, textures, sounds) is original to this game.

## Round one: the system, building and flight

- **The system.** Halvor (a 30 km world with air, 1 g, plains, dry lakes and snowy ranges), its airless moon
  Ket (craters, 0.25 g), the rust world Vashti (canyons and mesas, thin air) 430 km out, and Oru, Vashti's ice
  moon. Three asteroid fields: Halvor Shoal (high orbit), Ket Debris and the Drift (between the worlds). The star
  goes round once an hour, so days and nights pass.
- **Planets** are cube-sphere quadtrees, refined from 47 km patches down to under a metre between points near
  the camera, with skirts, colours by height/slope/latitude, a stable detail texture, haze worked out from the
  line of sight through the air, and an atmosphere shell seen from the ground and from space.
- **Asteroids** are distance fields (noisy stretched spheres, craters, ore veins) meshed with surface nets;
  holes can be dug into them (drills arrive in round two).
- **Rendering** is camera-relative (system coordinates in doubles, everything drawn relative to the camera)
  and split into far, middle and near depth slices, so a moon 120 km away and a bolt 5 cm away both draw right.
- **50 block types**: light and heavy hull in eight shapes, windows, cockpit, fighter canopy, control seat,
  gyro stabiliser, atmos / ion / fuel thrusters in two sizes, battery, fusion cores, solar array, cargo, med bay,
  beacon, antenna, gravity generator, jump drive, landing clamp, docking port, ducts, catwalk, stairs, sliding
  door, passage, girder frame, lamp and floodlight. Faces pressed against full neighbours are not drawn.
- **Building**: a ghost block snaps to the grid you look at or starts a new grid (a station when built into
  rock or chosen with B, otherwise a ship); rotation keys turn it about the grid axes nearest your view
  (PgUp/PgDn, Home/End, Ins/Del, or [ ] ; ' , .); Ctrl + drag places a line and Ctrl + Shift + drag a plane;
  the right button removes; the welder repairs; the grinder cuts; the middle button paints (P: palette);
  Ctrl + C / Ctrl + V copy and paste whole grids; H spawns ready-made designs. A grid cut in two falls apart.
- **Flight**: thrusters grouped by the direction they push; inertia dampeners cancel drift and hold a hover;
  gyros turn the grid at the rate asked for. Atmos thrusters need air, ion drives lose most of their push in
  thick air. Power is drawn from cores, batteries and the sun. Landing clamps lock (P). The jump drive (J)
  crosses the system in one jump after a 10 s charge.
- **Physics**: rigid bodies with mass and inertia from their blocks; collisions of hull points against
  planets, asteroids and other grids; hard hits break blocks; a grid at rest sleeps.
- **The engineer** walks wherever there is gravity (a planet's or a gravity generator's), flies a jetpack
  (upright in gravity, free in six directions in space) with suit dampeners, sits in cockpits and seats.
- **Starts**: Halvor landing site, Kestrel orbital station, Ket crater base, the Drift, and empty space.
- Desktop and touch controls; a helmet display with an artificial horizon, block integrity, ship mass,
  lift/weight and power.

## Round two: survival

- **Creative or survival** is chosen with the start. Survival uses the same places, stocked for a first build.
- **Items**: 11 ores, 10 ingots and 20 parts, counted by mass and volume. The suit holds 400 litres; every
  inventory on a grid (cargo, machines, drills, seats) is linked, as if joined by ducts.
- **Blocks are built from parts.** Placing one needs its first part and leaves a girder frame; the welder
  installs the rest from your inventory in recipe order and says what is missing; a block works only when
  finished. The grinder takes the parts back out, last in first out.
- **Mining**: the hand drill digs rock into your inventory; ship drills bore ahead of a ship into its cargo
  (hold the left button in the seat). Asteroids are dug as voxels; planets get bowls dug into the ground.
  Ore lies in patches (tinted on the ground and in the rock), different on each world and in each field.
- **Production**: the refinery melts ore from cargo into ingots; assemblers make queued parts (terminal, K,
  Production); the survival kit does both slowly for basic things and is a respawn point; the
  oxygen-hydrogen splitter turns ice into gas for the tanks.
- **Fuel and air**: fuel thrusters burn hydrogen from tanks, fusion cores burn uranium, the suit's oxygen
  runs down away from breathable air (Halvor's) and refills by a kit or med bay or in a seat, the jetpack
  burns the suit's hydrogen, tools and lamps its energy.
- New blocks: survival kit, refinery, assembler, oxygen-hydrogen splitter, hydrogen and oxygen tanks, ship
  drill. New design: the Pick, a small-grid miner.

## Coming next

- Round three: wheels and suspension for rovers, rotors, hinges and pistons, docking ports that dock, a
  projector for blueprints in survival, saved worlds, playing together, and an exterior for the lot.

## Files

- `src/core`: the split-depth camera-relative engine, input, touch, noise.
- `src/world`: the system (`universe.js`), planets, asteroids, sky, haze shader.
- `src/grid`: block catalogue and shapes, the texture atlas, rotations, grids, flight control, physics.
- `src/game`: the game loop, world, building, items and recipes, survival rules, ready-made designs, sound.
- `src/ui`: the interface kit, helmet display, menus, block icons.
- `tools/pack.sh` packs `build/experience.zip`; `tools/sfxgen.py` makes the sounds; `tools/prefabtest.mjs`
  checks the designs (block overlaps, lift/weight); `tools/bench.mjs` times terrain and rock building; `tools/survivaltest.mjs`, `tools/weldtest.mjs` and
  `tools/digtest.mjs` check mining, production and welding without the renderer.
