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

## Round three: digging through, a universe that keeps going, and the lot

- **Planets are minable all the way through.** Digging turns the ground near you into 1 m voxels (16 m
  chunks, `src/world/voxels.js`), so the drill leaves real shafts, tunnels and caves with rock overhead,
  not just bowls; from far away the terrain still shows the hole.
- **Trees** on Halvor (`src/world/trees.js`): pines, broadleaves and bushes by climate, instanced near the
  camera; they stop you and your ship.
- **More worlds.** The home system has eight (Halvor, Ket, Vashti, Oru, Thessa, Nix, Sabik, Cinder) and
  three rock fields. Beyond it space is cut into sectors 1,800 km across; most hold a generated group of
  planets, moons and a field. A group loads as you come within about 1,000 km and the one behind you
  unloads; undiscovered groups show as unknown signals you can jump towards.
- **The map** (M) grows as you discover groups and is kept with your save. Waypoints can be dropped where
  you stand or on the map, tracked on the helmet display with distance and time to arrive, and jumped to.
- **Mining ships**: the Drill and the new Rock Crusher both mount on the front of a ship. The crusher is
  larger, bores a wider hole, keeps the ore (half as much again) and throws the stone away. The ore
  detector marks nearby ore.
- **86 blocks** (was 51): rounded hull, hazard, vent, grate and tech plating, ramps, portholes, skylights,
  walls, pillars, railings, ladders, beds, consoles, lockers, tables, signs, blast doors, hangar doors,
  light strips and panels, warning lights, wind turbines, dishes. Thrusters have new models (ducted fan,
  finned ion, two-stage bell).
- **Designs rebuilt** with bevelled hulls: Sparrow, Pick, Mule, Lancer, the Kestrel station, the Foothold
  outpost, and a new large-grid miner, the Mole.
- **The lot's exterior** (`lot/gen.mjs`) was first an orrery in a shipyard frame; round six replaced it.

## Round four: the look

- **A finishing pass** (`src/core/post.js`): the scene is drawn into a floating-point picture, so engine
  flames, lamps and the star can be brighter than white; their glow is added back as bloom, with a soft
  shoulder, a little contrast and colour, a vignette and edge smoothing. Settings has "Bloom and colour"
  (on for Medium and High, never on Low); it switches itself off for the visit if the game runs slowly.
- **Clouds** over every world with air (`src/world/clouds.js`): one shell above the highest ground, seen
  from orbit and from below, lit by the star and tinted at dusk, thinning to mist as you fly through.
- **Thruster flames** are shaded plumes with a white-hot core instead of flat cones.
- **The engineer** has a rounded suit, a visor, a pack with tanks, and arms and legs that swing when walking.
- **O hides the interface** for taking pictures.
- Terrain skirts no longer hang into dug tunnels as curtains.
- `tools/promo` holds the photo-scene capture and grading scripts used for promotional stills.

## Round five: more ships, better bases

- **Four new blueprints** (`src/game/fleet.js`), this game's own ships in the two great screen traditions
  of starship design, under their own names: the **Meridian** (a saucer on a neck, an engine hull, two
  drive pods), the **Talon** (a long-necked raider with wings swept down to gun pods), the **Crossguard**
  (a small-grid strike fighter with four spread wings and four guns) and the **Bastion** (a wedge-hulled
  capital ship with a bridge tower). All fly, on a planet or off it.
- **Kestrel Station** and the **Foothold Outpost** are rebuilt: painted landing rings, white walls with a
  teal band under bevelled roofs, a glazed control tower, a reactor keel and long solar wings on the
  station; a habitat with a lookout, a roofed workshop, a tank yard and a dish mast at the outpost.
- The Mule has tail fins and the Lancer a dorsal fin. The blueprint list is in two columns and pages.
- `src/game/bpkit.js` is the blueprint kit (cells, skin, bevelled roofs, discs, struts);
  `tools/bpcheck.mjs` checks every design for blocks that do not fit, loose pieces and thrust.

## Round six: the exterior is a story

- The lot's street view (`lot/gen.mjs`) is now one 60 s loop: an engineer with a jetpack and a welding torch
  builds the Crossguard over a blueprint of light in seven pieces, climbs in, lifts off, turns toward
  Halvor in the sky and jumps away in a flash; the pad stands empty, then it starts again.
- The fighter's pieces are separate animated parts that swell into place; flames, the torch, the jump flash
  and the blueprint are lit by the lot's shaders on the same clock as the animation. The generator writes
  the shaders and `lot.json` itself, so the two cannot drift apart.

## Round seven: big ships you can live in

- **Two big ships with interiors** (`src/game/capital.js`). The **Ardent** is a carrier, 2,400 blocks: a
  bridge under glass, a mess, four cabins with beds and portholes, a med bay, a workshop, a store,
  engineering, stairs between two decks, and a hangar the height of both behind a wall of door panels.
  The **Vagrant** is a corvette: a raised bridge, a bunk room and a bay for one small ship.
- **A new start, Aboard the Ardent**: on her bridge in orbit over Halvor, a Sparrow clamped down in the hangar.
- **Command Chair**: a cockpit that can stand anywhere, so a ship can be flown from a bridge deep inside it.
- **Camera**: a block that looks along its front. From any seat, V steps through first person, third person
  and each camera on the grid; one hung from a ceiling still shows its picture the right way up.

## Coming next

- Wheels and suspension for rovers, rotors, hinges and pistons, docking ports that dock, a projector for
  blueprints in survival, saved worlds, playing together.

## Files

- `src/core`: the split-depth camera-relative engine, the finishing pass, input, touch, noise.
- `src/world`: the sectors and home system (`universe.js`), planets, dug voxels, clouds, trees, asteroids, sky,
  haze shader.
- `src/grid`: block catalogue and shapes, the texture atlas, rotations, grids, flight control, physics.
- `src/game`: the game loop, world, building, items and recipes, survival rules, ready-made designs, sound.
- `src/ui`: the interface kit, helmet display, menus, block icons.
- `tools/pack.sh` packs `build/experience.zip`; `tools/sfxgen.py` makes the sounds; `tools/prefabtest.mjs`
  checks the designs (block overlaps, lift/weight); `tools/bench.mjs` times terrain and rock building; `tools/survivaltest.mjs`, `tools/weldtest.mjs` and
  `tools/digtest.mjs` check mining, production and welding without the renderer; `tools/voxtest.mjs` checks
  tunnels.
- `lot/`: the exterior generator and what it builds in `lot/out` (three levels of detail, shaders, `lot.json`).
