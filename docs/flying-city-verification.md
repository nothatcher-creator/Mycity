# Flying city verification — October 24, 2026

Live: https://nothatcher-creator.github.io/Mycity/

The main city rebuild was published from `b5c626cd180bf94ff1001f42dc00655fbfa82621` through the [successful Pages deployment](https://github.com/nothatcher-creator/Mycity/actions/runs/40118776715). Mod Row is placed beside the Game Quarter in the final layout.

- **54 unit/protocol tests pass**, covering flight normalization and bounds, independent touch inputs, keyboard focus, neighborhood/slot allocation, all original game identities, owner approval and immutable issue snapshots, duplicate publication and occupied-slot conflicts, local storage failures, and sandbox message/resource boundaries.
- **All eight browser scenarios pass** against the production preview: actual cube flight and travel, neighborhood grouping and vacancies, GitHub submission handoff, the actual Astraforge editor, the actual RELICFALL guest game, private journal export/clear, simultaneous mobile controls, and a working gallery/benchmark/map without WebGL. Tests use Chromium; phone checks use a 390-pixel viewport and emulated touch input.
- Three corresponding checks also pass against the **live HTTPS site**: flying cube and Game Quarter travel, the GitHub handoff, and RELICFALL loading in the official sandbox.
- **All 16 pinned original game versions started** in the guest host with a canvas, without a crash or script error. This verifies startup, not every gameplay branch or a full playthrough. See [the per-game evidence](p0-guest-startup-checks.json).
- **All 32 published original exterior GLBs match their recorded SHA-256 hashes**: 22,612,800 bytes across full/detail versions. The deployed catalogs and shared journal match source. Models retain original lot numbers and source records.
- The production build succeeds under `/Mycity/`, both Pages and community publication workflows are registered, and the `city:submission` and `city:approved` labels exist.
- Independent review found no major security or architecture blocker. Its loading-time travel guard and focused-button keyboard findings were corrected. A render-loop scheduling defect was also fixed before publication.

Friends authenticate on GitHub to submit a public issue. No browser-local draft is represented as an approved shared lot. Only a repository-owner approval event can publish the reviewed metadata. No test submission was posted to the public repository.

Shared history records city publications. Visit and flight history belong to the current browser. Project 0 guest play has local saves/scores; original Project 0 links retain access to platform accounts, multiplayer, boards, and rewards. The city is not a live multiplayer presence server.
