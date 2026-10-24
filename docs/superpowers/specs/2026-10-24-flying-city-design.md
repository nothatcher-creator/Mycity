# Mycity — flying cube city

The user corrected the earlier portfolio-like scene: they want to play as a basic cube, fly between lots, leave many empty lots for friends, improve the visuals, import all their Project 0 games and original lots, add Nexus Mods, group neighborhoods, add logging, and make the center personal.

## Scope and builder decisions

- Keep the existing Mycity GitHub Pages site, catalog, Astraforge integration, and local Bench Lab. Preserve stable project IDs and URLs. Original Project 0 games now use their real original lot numbers, as explicitly requested, overriding the previous generic 3/4/5 hub numbers.
- Build a perspective third-person city controlled through a visible flying cube: WASD/arrows, Space up, C down, Shift boost, drag to look, E to interact. Provide a touch joystick, vertical controls, an enter button, district quick travel, map/library, accessible project detail buttons, and WebGL fallback.
- Five contiguous neighborhoods: Games (all 16 currently owned Project 0 games), Tools & AI, Art & Images, Android, and Mods. Reserve 96 total physical slots and keep slot IDs stable. Add a Nexus profile lot; place the Android modpack in Android. Keep Astraforge as project/plot 001 in Tools.
- Centerpiece: Nothatcher's Beacon, a personalized monogram/cube monument with lighthouse, castle, cards, and creative-tool references drawn from the user's actual projects. This is a visual interpretation, not an assertion about their real appearance.
- Reuse original owned Project 0 exterior models, using Meshopt-decoded GLBs and distance loading. Preserve source attribution. Keep exact original game destinations available. Investigate native guest-shell embedding; only label games playable inside Mycity after actual smoke checks, and keep official Project 0 sessions available through original links.
- Empty lots open a contribution panel. Use real GitHub sign-in to submit a lot through the repository's issue form. The owner approves a reviewed metadata snapshot before publishing; friends' arbitrary JavaScript is not executed automatically. Published contributions and their real GitHub authors are stored in the shared catalog and city journal. Never pretend a browser-local draft is a shared claim.
- Logging defaults to both a clearly labeled device-local visit log and a durable city publication journal. The user was asked asynchronously whether they meant login, activity history, or both; incorporate their reply if it arrives. No in-world OAuth session is claimed without an actual auth backend.

## Interfaces

`public/city.json` defines identity and districts (`id`, `name`, `center:[x,z]`, `columns`, `slotCount`, `spacing`, `color`, `prefix`). Projects add a unique `slot` and a valid `district`. `src/city-layout.js` exports `buildCityLots(projects, city)`; each result has `id`, `slotId`, `district`, `position:{x,y,z}`, `project` or null, `title`, and `displayNumber`.

`src/world.js` keeps `createWorld`, adding `city`, `flightInput`, `onNearby`, and `onLocation` options. It returns existing focus/filter/reset/pause/dispose methods plus `teleportDistrict(id)`, `teleportLot(slotId)`, and `getPlayerPosition()`. Selection passes a lot ID or project ID; the host resolves it through the common layout.

Flight physics and input live in `src/flight.js`. Shared contribution validation lives in a browser/Node-compatible module so publication uses the same slot/URL rules as previews. Logging and community UI have no client credentials.

## Verification

Test flight normalization/bounds/large frame deltas, touch multi-input, layout stability and vacancy, all 16 original game identities, unsafe contribution URLs and approval snapshots, idempotent and conflicting publication, storage failures, desktop/mobile world interaction, actual embedded app/game launches, fallback, production paths, and the live Pages deployment.
