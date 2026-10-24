# Original Project 0 exterior import

Imported for the user-requested Mycity Game Quarter on October 24, 2026. The source is the public Project 0 world inventory, filtered to Nothatcher (`ownerId: 113`). All 16 listed lots had current experiences when inventoried. Historical lot 1011 is not in that current inventory.

The complete public provenance record is [`public/original-lots-source.json`](../public/original-lots-source.json). It records original URLs and versions, exact SHA-256 hashes and byte counts, glTF extensions, and animation clip names.

## Exterior models

| Original lot | Current game | LOD1 | LOD0 | LOD0 clips |
| ---: | --- | ---: | ---: | ---: |
| 643 | Meridian Ironwatch | 255,188 B | 1,701,204 B | 0 |
| 987 | Convoy Chaos — Golden Routes v0.8 | 164,172 B | 804,724 B | 1 |
| 1003 | BLACKBOX: Recovery Protocol | 18,132 B | 55,800 B | 0 |
| 1043 | Crownfall: The Ashen March | 193,572 B | 919,996 B | 0 |
| 1099 | Crownstone Keep: Castle Games | 378,652 B | 2,051,488 B | 0 |
| 1123 | Orbital Shipyard: City Flight | 313,484 B | 2,152,648 B | 0 |
| 1147 | Ashen Owl: Cinders & Cards | 331,184 B | 2,202,116 B | 0 |
| 1669 | The Sevenfold Archive | 7,676 B | 37,448 B | 0 |
| 3665 | The Last Beacon: Do Not Answer | 210,884 B | 1,224,152 B | 2 |
| 3666 | Abyssal Relic — Full Resolution | 264,196 B | 986,308 B | 0 |
| 3667 | Stormglass: Keeper's Watch | 228,380 B | 1,316,108 B | 1 |
| 3668 | Tideborn — Your Creature, Your Beginning | 216,384 B | 1,513,876 B | 1 |
| 3669 | Relicfall: Beneath the Beacon | 231,256 B | 997,796 B | 1 |
| 3670 | Skybound: Beaconfall | 378,460 B | 1,146,764 B | 2 |
| 3671 | Beaconfall — The Lantern Frontier v0.9 | 254,080 B | 720,976 B | 1 |
| 3672 | RELICFALL: Beneath the Beacon v0.8 | 268,636 B | 1,067,060 B | 1 |

All **32** files were downloaded and parsed as self-contained glTF 2.0 GLBs. LOD1 totals **3,714,336 bytes**; LOD0 totals **18,898,464 bytes**. No GLB refers to an external image or buffer URI.

Use `GLTFLoader` with Three.js `MeshoptDecoder`. The models use `EXT_meshopt_compression`, `KHR_mesh_quantization`, and sometimes embedded WebP textures. LOD1 is a lighter static representation. LOD0 retains authored animation clips for lot 987 and lighthouse lots 3665, 3667–3672; lot 3666 has no clips. Original exterior JavaScript and custom shader packages are not copied or evaluated by this model import.

The user owns these existing Project 0 lot builds and asked to reuse their original exteriors. This import does not relicense complete builds or assign a license to unknown individual components. It does not include full game bundles, platform code, paid game binaries, or credentials. Game destinations and native-platform services remain distinct from these exterior assets.

## Retained source credits

Original credit and license records are included under [`public/assets/original-lots/attribution/`](../public/assets/original-lots/attribution/). Text line endings and trailing whitespace were normalized; credit wording is retained.

- Grass Bermuda 01: Rico Cilliers / Poly Haven, **CC0 1.0**, <https://polyhaven.com/a/grass_bermuda_01>.
- Hooded Rogue and original keeper animations: Kay Lousberg / KayKit Adventurers, **CC0 1.0**, <https://kaylousberg.itch.io/kaykit-adventurers>.
- Lighthouse and keeper cottage on original lot 3667: Grab3D, **CC0 1.0**, <https://grab3d.com/models/buildings/lighthouse/>.
- BLACKBOX exterior components: Kenney Space Kit and Space Station Kit, **CC0 1.0**, <https://kenney.nl/>. Their original license texts are included.
- Three.js water example assets/adaptation: Three.js authors, **MIT**. The original MIT text is included. No downloaded exterior scripts are executed by the import.
- Nothatcher-owned original lighthouse, watchtower, island, and other generated/procedural architecture is credited in the retained lot manifests.

Crownstone, Crownfall, Last Beacon, and Meridian source-project credit files are retained as provenance. Those original records can list game/interior assets not imported here; retaining a credit does not mean every asset from its game is included in the exterior GLB.

## Validation

The import checked GLB magic, version, total and chunk lengths, the JSON asset version, duplicate JSON chunks, external URI references, and every final file SHA-256. Scene dimensions should be computed after glTF node transforms/quantization are applied by the loader, rather than inferred from raw POSITION accessor bounds. The city loader can normalize each exterior to its plot while retaining the original model shape and materials.
