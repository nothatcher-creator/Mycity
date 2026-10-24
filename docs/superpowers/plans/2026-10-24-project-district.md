# Nothatcher District Implementation Plan

**Goal:** Publish an explorable 3D home for the user's projects, with Astraforge as plot 001.

**Architecture:** Vite multipage static site; Three.js district, HTML UI, JSON catalog, independent local benchmark lab, and GitHub Actions Pages deployment.

**Spec:** `docs/superpowers/specs/2026-10-24-project-district-design.md`

## Global constraints

- Astraforge is plot 1, first and featured, using its verified existing Pages editor.
- No browser secrets, paid binaries, or private project source.
- GitHub Pages paths must work under the user's selected `/Mycity/` base, including `/Mycity/benchmarks/`.
- Every project remains reachable without WebGL; desktop and touch supported.
- Benchmark scoring is deterministic, with no model/API calls or fabricated results.

## Review focus

Unsafe catalog URLs; duplicate IDs/plots; unavailable WebGL; storage failure; small screens and embedded-app escape/close behavior.

## Tasks

- [x] Catalog + shell: write failing meaningful catalog filtering/URL/identity tests; implement validation/filter/layout helpers; create Vite shell and first verified projects.
- [x] World: create `src/world.js` exporting `createWorld({canvas,labelsContainer,projects,onSelect,onReady})`; controller methods `focusProject(id)`, `setVisible(ids)`, `reset()`, `dispose()`. Render actual themed plots and accessible projected labels, orbit/touch controls, selective animation.
- [x] Benchmark lab: independently implement `benchmarks/index.html`, `src/benchmarks.js`, `src/benchmarks.css`, `src/benchmark-engine.js`, and engine tests; graded prompts, browser-local history, export. Agent owns these only.
- [x] Integration + deployment: implement `src/main.js` and `src/style.css`; launch Astraforge in player, external fallbacks, dialog/focus, category/search/list behavior, mobile and WebGL fallback. Add README/AGENTS/add-project docs and Pages workflow.
- [x] Verify: node tests, production build, browser desktop/mobile/WebGL-disabled and benchmark smoke tests, independent review. Resolve material defects, publish repository/Pages, verify live HTML/assets/app links and deployment status.

The user requested execution and hosting; implementation choices above are builder assumptions, not approvals attributed to them. Work proceeds within that authorized scope.
