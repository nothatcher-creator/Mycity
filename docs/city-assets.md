# Downloaded city scenery

The city uses real downloaded assets, served locally so visitors do not depend on a marketplace API or account. All included assets permit redistribution under CC0. The original sixteen Project 0 lots keep their own exterior models and numbers.

- **Kay Lousberg / KayKit — City Builder Bits 1.0.** [itch.io listing](https://kaylousberg.itch.io/city-builder-bits), [official source repository](https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0). Six city building choices, benches, streetlights, bushes, rubbish bins, hydrants and parked cars. Official glTF files and their palette texture were packed into self-contained GLBs with Blender; no paid/source pack was used. [Included license](../public/assets/city-upgrade/licenses/kaykit.txt).
- **Kenney — Nature Kit 2.1.** [Creator page](https://kenney.nl/assets/nature-kit). Oak and round pine models replace the simple placeholder trees. GLBs are unchanged from the official free archive. [Included license](../public/assets/city-upgrade/licenses/kenney-nature.txt).
- **Poly Haven — Asphalt 02 and Kloppenheim 06 Pure Sky.** [Photographed asphalt](https://polyhaven.com/a/asphalt_02), [HDR sky](https://polyhaven.com/a/kloppenheim_06_puresky), [CC0 license](https://polyhaven.com/license). Original 1K diffuse, OpenGL normal, roughness maps and 1K HDR are used for consistent road detail, sky and material reflections.

[Asset manifest](../public/assets/city-upgrade/manifest.json) records each included file's source, license, byte size and SHA-256 digest. The total asset download is approximately 4.60 MB before HTTP compression. No CGTrader, BlenderKit, Free3D, TurboSquid or Sketchfab account-only/paid model is redistributed.

## Runtime

Road surfaces are merged into one draw call with consistent world-scale UVs. Each downloaded street prop/tree primitive is instanced across the city, sharing geometry and materials. The single 1K HDR is prefiltered once for reflections. Shadows update when scenery changes or the player travels rather than every frame. Buildings load near the player and use a fixed local whitelist. Download failures keep the procedural building/vegetation/sky fallback; the catalog, flight controls and projects remain usable.

New approved community entries can select `lotStyle` from `studio`, `arcade`, `gallery`, `workshop`, `tower`, or `garden`. This selects a reviewed local building asset and never executes a submitted script. An original project exterior always takes precedence over this choice.
