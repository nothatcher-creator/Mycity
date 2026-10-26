# Model Showcase

The Model Showcase is the island south of the Beacon. Each model stands on its own pedestal and slowly turns; fly up to one and press **E** (or tap **Inspect**) to open it in the 3D viewer. The **Models** tab in the City map lists every model, and `#model/<id>` links open one directly.

## Add a model

You don't need to edit any code.

1. On GitHub, open [`public/showcase/models/`](../public/showcase/models/).
2. Choose **Add file → Upload files**, drop in your `.glb`, and choose **Commit changes**.
3. The Pages workflow rebuilds the site. Your model appears on the next free pedestal, titled from its file name (`crystal-dragon.glb` becomes **Crystal Dragon**).

Working locally instead? Copy the file into the same folder and run `npm run dev`; the manifest rebuilds on start.

### Optional details

A `.json` file with the same name adds details. Every field is optional:

```json
{
  "title": "Crystal Dragon",
  "description": "A sculpt from my weekend jam.",
  "credit": "Nothatcher",
  "license": "CC BY 4.0",
  "source": "https://example.com/crystal-dragon",
  "featured": true,
  "download": true,
  "order": 1
}
```

- `featured` puts the model on the large centre pedestal.
- `download: true` adds a download button to the viewer. Downloads are off unless you turn them on.
- `order` sorts dropped-in models; otherwise they are alphabetical.
- `source` must be an `https://` link.

To show a model that already lives elsewhere in the site, such as an original lot build, add it to [`public/showcase/showcase.json`](../public/showcase/showcase.json) with an `id` and a `file` path starting with `./`. Curated entries come first, then dropped-in files.

### Card pictures

`npm run thumbnails` renders a picture for each model that doesn't have one yet, into `public/showcase/thumbnails/`. It needs Chromium (set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing one). Models without a picture show the generic card artwork.

## File guidance

- Use a self-contained binary glTF (`.glb`). Files that refer to external textures or buffers are reported and should be re-exported with everything embedded.
- Draco and Meshopt mesh compression and KTX2 textures all work; the decoders are copied from three.js at build time and only downloaded when a model needs them.
- Keep files under 100 MB (GitHub's limit). Models over 40 MB stay as a placeholder on their pedestal and load only when someone opens them.
- The island has 46 pedestals. Further models are still listed in the Models tab and open in the viewer.
- Only upload models you made or have the right to share. This repository and site are public.

## How it works

`scripts/build-showcase.mjs` runs before `npm run dev` and `npm run build`. It reads each GLB's header (not its geometry) for triangle, mesh, material, texture and animation counts, merges `showcase.json` and any sidecar files, and writes `public/showcase/index.json`. That generated file is not committed. The browser validates every record again (`src/showcase.js`): only `./…glb` paths inside the site or `https://` links are loaded, and text fields are length-limited and shown as text.

The viewer (`src/model-viewer.js`) creates its own WebGL renderer only while open and reports statistics from the loaded scene. The world pauses behind it.
