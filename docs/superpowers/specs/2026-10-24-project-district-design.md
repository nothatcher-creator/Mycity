# Nothatcher District

Build the user's GitHub-hosted home for games, AI benchmarks, and Codex creations. The user requested a Project 0-like 3D world where each project owns a plot, then explicitly selected Astraforge as the first integration. Publishing this site on their GitHub is part of the request.

## Chosen implementation

A static Vite/Three.js site on GitHub Pages. The user selected their empty `nothatcher-creator/Mycity` repository after the connected app could not create a new repository. The live base is `https://nothatcher-creator.github.io/Mycity/`, and all local links/assets must respect `/Mycity/`. A browser-native scene gives actual explorable 3D, while static hosting keeps the hub free of server and account setup. A flat-only portfolio would miss the requested world; a multiplayer backend would add services beyond this first hub.

Use a floating architectural district, warm white buildings and teal/purple accents against a dark night sky. An accessible HTML interface provides search, category filters, selectable plot labels, project details, list view, and a full-window app player. Touch orbit/pinch and desktop orbit/zoom share the same navigation. Reduced motion and WebGL fallback preserve access to every project.

## Projects and integration

`public/projects.json` is the source of truth. Each entry has `id`, `plot`, `title`, `subtitle`, `description`, `category` (tools, games, benchmarks, mods), `url`, optional `source`, `embed`, `theme`, and `tags`. Astraforge is always plot 1, the first catalog entry, and the entrance's featured project. It opens the verified existing LyricForge editor at `https://nothatcher-creator.github.io/Astraforge/` inside the hub, with an external-open fallback.

Initial catalog also includes the new local Bench Lab, Project Workshop, WebLab, three existing Project 0 games, and the Balatro release. External game/release links retain accurate labels and do not imply that their original hosting moved. Future static games can live under `public/games/<slug>/` and be embedded through a relative catalog URL. No credentials, paid game binaries, or private repository contents are copied into this public site.

## Benchmark lab

A local page supplies transparent, deterministic AI evaluation prompts, accepts pasted model responses, grades observable constraints, saves runs in browser storage, and exports JSON. It makes no model calls, charges nothing, and invents no benchmark scores. Records include the task, submitted model label, response, checks, score, and timestamp. Local saved data is optional and storage failures must not prevent use.

## Publishing and maintenance

Public source, build/test workflow, Pages deployment, and an AGENTS.md guide teach future Codex sessions how to add a project. The hub needs no API token in the browser. Validate catalog URLs and unique plot IDs before builds. Test desktop and mobile interactions, app launching, fallback, and the published URL. Use existing GitHub authorization; preserve unrelated repos and existing project Pages URLs.
