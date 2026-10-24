# Nothatcher District

[Open the district](https://nothatcher-creator.github.io/Mycity/) · [Bench Lab](https://nothatcher-creator.github.io/Mycity/benchmarks/) · [Source](https://github.com/nothatcher-creator/Mycity) · [Add a project](docs/adding-projects.md)

A 3D home for games, AI experiments, and Codex creations. Each project has its own plot, with search, category filters, a library view, and an app player. Touch devices can orbit and pinch to zoom; the library remains available when 3D graphics are unavailable.

**Astraforge is plot 001 and the first integration.** Its existing [LyricForge video studio](https://nothatcher-creator.github.io/Astraforge/) opens inside the district. The app keeps its own repository and hosting.

The initial collection also links Project Workshop, WebLab, existing Project 0 games, and the Balatro Android modpack release. Those external projects keep their original hosting. This repository does not contain their full source or game binaries.

Bench Lab provides deterministic prompts and checks for pasted AI responses. Runs stay in the current browser and can be exported as JSON. It does not call AI services, require an API key, or supply invented model scores.

## Run locally

Use Node.js 22 or newer.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. Before publishing:

```bash
npm test
npm run build
npm run preview
```

The build validates the project catalog and writes the static site to `dist/`.

Browser checks cover the 3D scene, Astraforge's actual embedded editor, search, local benchmark launch, phone pinch gestures, and the WebGL fallback:

```bash
npx playwright install chromium
npm run build
npm run test:browser
```

If Chromium is already installed, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path. Set `DISTRICT_TEST_URL` to a deployed district URL to run the same checks against the live site.

## Add the next creation

Edit [`public/projects.json`](public/projects.json). A valid catalog entry automatically gets a plot and a library card. Keep Astraforge first, with `id: "astraforge"` and `plot: 1`.

For a browser game hosted here, put its static files in `public/games/<slug>/` and use a relative URL such as `./games/my-game/`. For an existing app, use its HTTPS URL. See the [step-by-step guide](docs/adding-projects.md) for fields, examples, and checks.

GitHub Pages serves static HTML, JavaScript, WebAssembly, and assets. Apps requiring a server or private API credentials need a separate backend; link or embed their deployed HTTPS app instead.

## Deployment

The [Pages workflow](.github/workflows/pages.yml) runs tests, builds the site, and deploys `dist/` when `main` changes. It can also be run manually from the repository's Actions tab. GitHub Pages must be configured to use **GitHub Actions** as its source.

This site is hosted from the `Mycity` repository, so the Vite base is `/Mycity/`. Keep that prefix when adding routes or site assets; relative catalog destinations resolve inside it. Existing project sites such as `/Astraforge/` keep their own URLs. No browser API token or repository secret is needed for the hub.

The source is public. Do not add passwords, `.env` files, private project data, or paid game files.
