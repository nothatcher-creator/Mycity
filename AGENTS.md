# Working on Nothatcher District

This is the user's public GitHub Pages project hub, sourced from `nothatcher-creator/Mycity` and hosted at `https://nothatcher-creator.github.io/Mycity/`. Preserve the 3D district, accessible library, touch controls, and working project links.

## Project catalog

- `public/projects.json` is the source of truth for plots and library cards.
- Astraforge must remain the first entry, with `id` `astraforge`, `plot` `1`, and its existing live editor URL `https://nothatcher-creator.github.io/Astraforge/`.
- Give every new project a unique stable slug and a unique positive integer plot number. Do not renumber existing projects to insert a new one.
- All current Project 0 games use their original lot numbers as `plot` and `originalLot`, as the user explicitly requested in the flying-city upgrade. Preserve these numbers and stable IDs. The old generic 3/4/5 labels were replaced by their actual original numbers.
- Each project also has a unique `slot` in `public/city.json`, and a `district`: `games`, `tools`, `art`, `android`, or `mods`. Keep every original game in Games, tools and benchmarks in Tools, art in Art, Android-only projects in Android, and Nexus/general mods in Mods. Use `buildCityLots` to check availability.
- Preserve the playable flying cube, original exterior GLBs, neighborhood travel, touch movement plus altitude/boost, personal center, and graphics fallback. A portfolio camera is insufficient for the user's requested world.
- Friend submissions use actual GitHub authentication through issue forms. Only owner-approved event snapshots publish metadata; keep unapproved requests distinct from shared claims. Read `docs/community-lots.md` before changing this pipeline. Explicitly dispatch Pages after workflow-token commits.
- Keep device history separate from shared publication history. Never invent multiplayer presence, authenticated users, platform rewards, or server-wide visitor logs.
- Use a truthful title, description, category, tags, and destination. Distinguish existing external projects from files hosted in this repository.
- Set `embed: true` only for a trusted app that works in the player. Keep an external-open option available. Some sites disallow embedding; use `embed: false` for those.
- Use HTTPS URLs or relative paths. Do not put secrets in URLs or browser code.
- For a new static game, add `public/games/<slug>/index.html` and its assets, then register `./games/<slug>/` in the catalog. Game asset paths must work from that subdirectory.
- Read `docs/adding-projects.md` for the full entry format and checks.

## Development and verification

Use Node.js 22 or newer. Run `npm ci`, `npm test`, and `npm run build`. The build performs catalog validation before Vite runs.

For changes to the scene, player, navigation, or a new app, also check the actual browser flow at desktop and mobile widths. Verify the destination, player closing, external-open fallback, category/search behavior, and that the library still works without WebGL. Do not infer a successful integration from a passing build alone.

The city is Nothatcher Bay: each neighborhood is an island facing the central Beacon island, joined by a bridge. `src/city-layout.js` (rotated district frames, lots, validation) and `src/city-plan.js` (islands, streets, bridges, props, showcase pedestals) compute the layout once; the 3D world, both maps and the tests all use it, so never duplicate layout math elsewhere. Keep slot IDs stable when moving islands, and keep water between islands (validateCity enforces it). The world lives in `src/world.js`, the sea, beaches, bridges, gates and boats in `src/bay-scenery.js`, center/sky visuals in `src/city-visuals.js`, and tested flight/input in `src/flight.js`. Buildings are solid through the height field in `src/collision.js`, which the flight physics and follow camera share; it is built from each displayed building's triangles. The minimap and the City map view's map are 2D canvas drawings from `src/city-map.js`, so they work without WebGL. Card pictures come from `scripts/render-thumbnails.mjs` (`npm run thumbnails`); `npm run add` (`scripts/add-project.mjs`) adds a catalog entry with a free lot and renders its picture.

The Model Showcase reads `public/showcase/index.json`, generated at build time by `scripts/build-showcase.mjs` from `public/showcase/showcase.json` and any `.glb` dropped into `public/showcase/models/`; do not commit the generated manifest or `public/vendor/`. Read `docs/showcase.md` before changing it. Records are validated in `src/showcase.js`: only site-local `./…glb` paths or `https://` links load, and downloads stay off unless a model opts in. Only add models the owner made or may redistribute. The viewer is `src/model-viewer.js`. The shell/player is in `src/main.js` and `src/style.css`. `src/p0-player.js` is the sandbox guest host; official Project 0 services remain on original lots. Bench Lab and Gallery are separate Vite pages. Run actual browser launches for any changes to those integrations.

## Hosting and privacy

The Pages workflow deploys `dist/` from `main`. Keep the Vite base `/Mycity/` and make site-local assets and catalog destinations work under that prefix. The benchmark page is `/Mycity/benchmarks/`. Do not overwrite or move the separate Astraforge, Project Workshop, or Rotspire repositories; their existing account-level project URLs remain unchanged.

This repository is public. Never commit credentials, `.env` files, private user data, paid game binaries, or third-party assets without suitable redistribution rights. Do not add an API key to enable model calls from a static page. Bench Lab currently grades pasted responses locally; describe that behavior accurately.

Report actual tests and observed deployment results. Do not invent benchmark scores, usage statistics, or successful device checks.
