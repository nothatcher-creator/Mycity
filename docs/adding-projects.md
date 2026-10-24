# Give a project its own plot

Every entry in [`public/projects.json`](../public/projects.json) becomes a 3D plot and a searchable library card. Add an entry when a game, tool, or experiment is ready to visit.

## 1. Choose where the project lives

For a static browser game hosted in this site, copy its files into:

```text
public/games/my-game/
  index.html
  assets/
```

Use relative asset paths inside the game, such as `./assets/player.glb`. A path like `/assets/player.glb` points at the account's site root, outside `/Mycity/` and the game's folder. The example game will be hosted at `https://nothatcher-creator.github.io/Mycity/games/my-game/`.

For an app already hosted elsewhere, keep it there and use its HTTPS address. Astraforge, for example, remains at `https://nothatcher-creator.github.io/Astraforge/`; the district opens that editor in its player. Existing Project 0 games are links to their original lots and have not been copied here.

GitHub Pages cannot run a backend, hide a server API key, or execute an Android APK. Link a deployed server app or a release/download page when that is the appropriate destination.

## 2. Add a catalog entry

Copy this object into the JSON array. Add a comma between objects, and choose an unused plot number.

```json
{
  "id": "my-game",
  "plot": 9000,
  "district": "games",
  "slot": "games-17",
  "title": "My Game",
  "subtitle": "A small adventure",
  "description": "Explore the island and find the missing beacon.",
  "category": "games",
  "url": "./games/my-game/",
  "source": "https://github.com/nothatcher-creator/my-game",
  "embed": true,
  "theme": "lighthouse",
  "tags": ["Adventure", "Browser game"]
}
```

Remove `source` if there is no public source repository. Keep Astraforge as the first entry, with its existing ID and plot 1.

| Field | What to enter |
| --- | --- |
| `id` | A unique stable slug, beginning with a lowercase letter; use lowercase letters, digits, and hyphens. |
| `plot` | An unused positive whole number. Keep existing numbers stable. |
| `district` | `games`, `tools`, `art`, `android`, or `mods`. Keep related creations together. |
| `slot` | An existing empty slot from `public/city.json`, such as `games-17`. Check it is still vacant. |
| `title` | The project's visible name. |
| `subtitle` | A short optional label for the card. |
| `description` | A clear, accurate explanation of what visitors can do. |
| `category` | `games`, `benchmarks`, `tools`, `mods`, `art`, or `android`. |
| `url` | The launch destination: a relative path or HTTPS URL. |
| `source` | Optional HTTPS link to public source. |
| `embed` | `true` to open the app inside the district; `false` to open its destination in a new tab. |
| `theme` | Plot artwork: `forge`, `benchmark`, `lighthouse`, `castle`, `blackbox`, `cards`, `workshop`, or `terminal`. |
| `tags` | An array of searchable text labels. Use `[]` if none are needed. |

Use `embed: false` for sites that block frames, downloads, and pages intended to open in their own tab. The player always offers an external-open link for embedded apps. Test the app in the frame before considering it integrated.

## 3. Check it locally

```bash
npm ci
npm test
npm run build
npm run preview
```

Open the preview URL and check:

- The new plot and card have the correct name, number, category, and description.
- Search and the category filter can find it.
- The project loads from its real destination, including its models, audio, and other assets.
- An embedded app works, closes cleanly, and opens independently through the new-tab link.
- The library and controls work on a phone-sized screen.

The build rejects duplicate IDs or plot numbers, invalid fields, and unsafe URLs. It does not prove that a remote project is online or that a game works, so the browser checks matter.

## 4. Publish

Commit and push the source changes to `main` in [`nothatcher-creator/Mycity`](https://github.com/nothatcher-creator/Mycity). The **Deploy Nothatcher District** workflow runs the tests, builds the site with the `/Mycity/` base, and publishes through GitHub Pages. Watch its Actions run finish before sharing the updated plot.

The live district is `https://nothatcher-creator.github.io/Mycity/`, and Bench Lab is at `https://nothatcher-creator.github.io/Mycity/benchmarks/`. A project can be selected directly with a link such as `https://nothatcher-creator.github.io/Mycity/#plot/my-game`.

For future Codex sessions, a useful request is: “Add this project to my Nothatcher District, keep Astraforge first, and verify the new plot and launch flow.”
