# Add a model to the showcase

Drop a `.glb` file in this folder. On GitHub: **Add file → Upload files**, choose your `.glb`, then **Commit changes**. The site rebuilds and your model appears on its own pedestal on the Model Showcase island, and in the **Models** tab of the City map.

- Its title comes from the file name: `crystal-dragon.glb` becomes **Crystal Dragon**.
- Use a self-contained binary glTF (`.glb`). Draco, Meshopt and KTX2 compression all work.
- Keep files under 100 MB (GitHub's limit). Models over 40 MB are only loaded when someone opens them.

## Optional details

Add a `.json` file with the same name, for example `crystal-dragon.json`:

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

Every field is optional. `featured` puts the model on the large centre pedestal. `download: true` adds a download button to the viewer. Only upload models you made or have the right to share.
