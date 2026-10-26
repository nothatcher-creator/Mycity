# Mycity — Nothatcher Bay

[Enter the city](https://nothatcher-creator.github.io/Mycity/) · [Add things](#add-things) · [Friend submissions](docs/community-lots.md) · [Model Showcase](docs/showcase.md)

Play as a little flying cube in an island city of games, tools, art, Android projects, mods and 3D models. **Nothatcher's Beacon** stands on the central island, with lighthouse, castle, card, and creative-tool motifs from the owner's projects. Every neighborhood is its own island, facing the Beacon and joined to it by a bridge.

The neighborhoods hold **96 lots**, initially **23 projects and 73 open lots**. Empty lots have stable addresses, so friends can choose a place for their own work. Astraforge remains project **001**, in Tools & AI, and its existing LyricForge editor opens inside Mycity. The **Model Showcase** island puts 3D models on pedestals.

## Explore

| Control | Action |
| --- | --- |
| WASD or arrow keys | Fly relative to the camera |
| Drag the world | Look around the cube |
| Space / C | Rise / descend |
| Shift | Boost |
| E | Enter a nearby project, inspect a model, or open an empty lot |
| M | Open the city map |

The cube is always flying: it hovers on a cushion of air over streets, water, bridges and roofs, and bobs gently while it waits. Buildings and the Beacon are solid: the cube slides along walls, and the camera pulls in rather than ending up inside a wall. Every building is visible from anywhere; exteriors stream in nearest-first and pause while a game or dialog is open. The camera button saves a photo of the current view.

Phones and tablets show directional movement buttons by default, including in landscape. Hold the arrows to fly; the right-side up/down and boost buttons can be held together. **Use joystick** switches movement modes, and **On-screen controls** restores hidden controls on any screen.

Neighborhood buttons and the minimap provide quick travel. The **City map** view draws the whole bay beside the cards: hover a lot or pedestal for its name, click it for details, and filters highlight what matches. Its **Models** tab lists the showcase. Cards show a picture of each lot's real building. The map works when WebGL is unavailable.

## Neighborhoods

- **Game Quarter:** all 16 currently owned Project 0 games, with their actual original numbers and downloaded original exterior models. The pinned experience versions also run in Mycity's sandbox guest player. See [original sources and attribution](docs/original-lots.md).
- **Tools & AI:** Astraforge, Project Workshop, WebLab, and the local Bench Lab.
- **Art & Images:** an original-art gallery, including The Castaway card and Crownstone artwork, with open neighboring plots for friends.
- **Android District:** the Balatro Android modpack release and space for Android apps and downloads.
- **Mod Row, beside the Game Quarter:** [Nothatcher on Nexus Mods](https://www.nexusmods.com/profile/Nothatcher), with space for more mods.
- **Model Showcase:** 3D models on pedestals, each openable in a viewer with orbit controls, wireframe, animation clips and real statistics. It opens with twelve of the original builds at full resolution. Share a model with a `#model/<id>` link.

Guest games use Project 0's hosted sandbox/runtime and public game assets. Guest saves and scores belong to this browser. The original lot link remains available for Project 0 accounts, multiplayer, official boards, items, and rewards. Startup checks are not full playthroughs of every game.

Bench Lab evaluates pasted model responses through visible, deterministic checks. Results stay in the browser and can be exported; no model calls or API keys are involved.

## Add things

| To add | Easiest way |
| --- | --- |
| **A 3D model** | On GitHub, open `public/showcase/models/`, choose **Add file → Upload files**, drop your `.glb`, and commit. It gets its own pedestal after the site rebuilds. Details: [Model Showcase](docs/showcase.md). |
| **Your project** | `npm run add` — paste the link and answer a few questions. It picks an empty lot and plot number, checks the link isn't already in the city, writes the entry and renders its card picture. Details: [Add a project](docs/adding-projects.md). |
| **A friend's project** | They choose **Add to city** in the world and continue with GitHub; you approve the request with the `city:approved` label. See [friend submissions](docs/community-lots.md). |

## Friends and city history

Select an empty lot, enter a project link and description, then choose **Continue with GitHub**. GitHub handles sign-in and records the real account submitting the request. The city owner reviews it and applies `city:approved`; a workflow validates the reviewed snapshot, publishes the lot and shared journal entry, and starts the Pages deployment.

An unapproved request does not claim a lot. Community submissions are project links, rather than automatically executed source code. There is no separate Mycity password or simulated authenticated session. Read [the contribution guide](docs/community-lots.md).

The journal has two clearly marked histories: shared city publications and this device's visits/actions. Device history can be cleared or exported without deleting other apps' data. The city does not pretend to track live players or everyone's movements.

## Develop and publish

Use Node.js 22 or newer.

```bash
npm ci
npm run dev          # also builds the showcase manifest
npm test
npm run build
npm run add          # add a project
npm run thumbnails   # render missing card pictures (needs Chromium)
```

The production base is `/Mycity/`. GitHub Actions tests and deploys `dist/` from `main`; the build generates `public/showcase/index.json` and copies the model decoders into `public/vendor/`, so neither is committed.

```bash
npx playwright install chromium
npm run build
npm run test:browser
```

Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for an existing Chromium binary. `DISTRICT_TEST_URL` can point the browser tests at a deployed city.

`public/projects.json` defines creations; `public/city.json` defines the islands and their stable lots; `public/showcase/` holds the showcase; `public/city-activity.json` records published changes. The layout itself is computed by `src/city-layout.js` and `src/city-plan.js`. Static games hosted here can live under `public/games/<slug>/`. GitHub Pages serves browser assets; apps requiring a private backend keep their own server. Never publish credentials, private user data, paid game binaries, or models you don't have the right to share in this public repository.
