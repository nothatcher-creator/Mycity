# Flying city implementation plan

**Goal:** Publish a playable flying-cube city with original game lots, distinct neighborhoods, personal center, empty friend plots, and truthful persistence.

**Architecture:** Three.js city plus shared JSON layout/catalog, pure flight physics with browser input bindings, native Project 0 guest adapter where verified, GitHub-authenticated issue submissions with owner approval, and separate device/published activity histories.

**Spec:** `docs/superpowers/specs/2026-10-24-flying-city-design.md`

## Tasks

- [x] Inventory and catalog: import all 16 currently owned Project 0 game entries and exterior models, assign stable neighborhood slots, add Nexus and gallery, update validation/layout with failing-first tests.
- [x] Flight: tested camera-relative cube movement, bounds, keyboard and simultaneous touch input, interaction gating and disposal.
- [x] World: perspective city, original models, detailed neighborhoods and empty plots, personalized centerpiece, follow camera, nearest-lot interactions, map/quick travel, controlled rendering and cleanup.
- [x] Shared contributions: reviewed GitHub issue form, secure owner approval workflow, deterministic/idempotent catalog publication, shared activity log and explicit Pages dispatch.
- [x] Game host: investigate and verify native guest-shell integration with honest local capabilities and original-server fallback.
- [x] UI and journal: replace marketing hero with game HUD, player controls, districts, real empty-lot forms, city/device journal, preserve library and app player.
- [x] Review, desktop/mobile browser checks, build and deploy; verify live city and source records.
