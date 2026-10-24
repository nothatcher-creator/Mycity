# Mycity — Nothatcher's world

[Enter the city](https://nothatcher-creator.github.io/Mycity/) · [Friend submissions](docs/community-lots.md) · [Add a project](docs/adding-projects.md)

Play as a little flying cube in a city of games, tools, art, Android projects, and mods. **Nothatcher's Beacon** stands in the center, with lighthouse, castle, card, and creative-tool motifs from the owner's projects.

The city has **96 physical lots**, initially containing **23 projects and 73 open lots**. Empty lots have stable addresses so friends can choose a place for their own work. Astraforge remains project **001**, in Tools & AI, and its existing LyricForge editor opens inside Mycity.

## Explore

| Control | Action |
| --- | --- |
| WASD or arrow keys | Fly relative to the camera |
| Drag the world | Look around the cube |
| Space / C | Rise / descend |
| Shift | Boost |
| E | Enter a nearby project or inspect an empty lot |
| M | Open the city map |

Phones have a movement stick, up/down buttons, and a boost button that can be held together. Neighborhood buttons and the minimap provide quick travel. The map includes every creation and every vacant slot, and works when WebGL is unavailable.

## Neighborhoods

- **Game Quarter:** all 16 currently owned Project 0 games, with their actual original numbers and downloaded original exterior models. The pinned experience versions also run in Mycity's sandbox guest player. See [original sources and attribution](docs/original-lots.md).
- **Tools & AI:** Astraforge, Project Workshop, WebLab, and the local Bench Lab.
- **Art & Images:** an original-art gallery, including The Castaway card and Crownstone artwork, with open neighboring plots for friends.
- **Android District:** the Balatro Android modpack release and space for Android apps and downloads.
- **Mod Row, beside the Game Quarter:** [Nothatcher on Nexus Mods](https://www.nexusmods.com/profile/Nothatcher), with space for more mods.

Guest games use Project 0's hosted sandbox/runtime and public game assets. Guest saves and scores belong to this browser. The original lot link remains available for Project 0 accounts, multiplayer, official boards, items, and rewards. Startup checks are not full playthroughs of every game.

Bench Lab evaluates pasted model responses through visible, deterministic checks. Results stay in the browser and can be exported; no model calls or API keys are involved.

## Friends and city history

Select an empty lot, enter a project link and description, then choose **Continue with GitHub**. GitHub handles sign-in and records the real account submitting the request. The city owner reviews it and applies `city:approved`; a workflow validates the reviewed snapshot, publishes the lot and shared journal entry, and starts the Pages deployment.

An unapproved request does not claim a lot. Community submissions are project links, rather than automatically executed source code. There is no separate Mycity password or simulated authenticated session. Read [the contribution guide](docs/community-lots.md).

The journal has two clearly marked histories: shared city publications and this device's visits/actions. Device history can be cleared or exported without deleting other apps' data. The city does not pretend to track live players or everyone's movements.

## Develop and publish

Use Node.js 22 or newer.

```bash
npm ci
npm run dev
npm test
npm run build
```

The production base is `/Mycity/`. GitHub Actions tests and deploys `dist/` from `main`.

```bash
npx playwright install chromium
npm run build
npm run test:browser
```

Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for an existing Chromium binary. `DISTRICT_TEST_URL` can point the browser tests at a deployed city.

`public/projects.json` defines creations; `public/city.json` defines stable neighborhood slots; `public/city-activity.json` records published changes. Static games hosted here can live under `public/games/<slug>/`. GitHub Pages serves browser assets; apps requiring a private backend keep their own server. Never publish credentials, private user data, or paid game binaries in this public repository.
