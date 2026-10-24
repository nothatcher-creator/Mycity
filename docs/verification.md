# Initial live-site verification — October 24, 2026

Live district: https://nothatcher-creator.github.io/Mycity/

Source and deployment: [b5cc98c](https://github.com/nothatcher-creator/Mycity/commit/b5cc98ca859ebb5a4306d11f8930dbf8aa990831), [successful Pages workflow](https://github.com/nothatcher-creator/Mycity/actions/runs/40095332685).

## Checks completed

- All 12 Node tests pass: catalog safety, unique plots and identifiers, Astraforge's first position, combined filters, and deterministic benchmark grading.
- The production build succeeds with the `/Mycity/` base.
- All six production-preview browser tests pass: rendered 3D plots and library, combined search/category filters, actual Astraforge editor loading and closing, embedded benchmark grading, unavailable-WebGL fallback, and a 390-pixel phone viewport with a two-touch pinch gesture.
- Three browser checks also pass against the deployed HTTPS site: the 3D district/library, the actual Astraforge editor, and the embedded local benchmark page grading a response.
- The deployed catalog matches the checked-in catalog byte for byte. All four initial HTML-linked script/style/icon assets and `/Mycity/benchmarks/` return HTTP 200.
- GitHub Pages deployment succeeds, and HTTPS enforcement is enabled.
- An independent review checked URLs, application framing, fallback, catalog growth, benchmark behavior, and public-source contents. Identified source-link, font-weight, and identifier-validation issues were corrected.

The browser tests use Chromium. Phone checks use a browser viewport and emulated touch input, rather than a physical handset. Existing Project 0 games retain their original hosting and are reached through catalog links. Benchmark scores are local checks of supplied responses, with no model service calls.

The district pauses while its library or an embedded app is open. Reduced-motion mode draws only when the scene changes, and static shadows are cached. A software-renderer check observed zero idle draws over five seconds after the scene settled.
