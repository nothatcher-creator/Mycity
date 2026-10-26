import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateShowcase, normalizeModel, safeModelPath, titleFromFile, slugFromFile } from "../src/showcase.js";
import { readGlbInfo, buildShowcaseManifest } from "../scripts/build-showcase.mjs";

const sample = new URL("../public/assets/original-lots/3670/lod0.glb", import.meta.url);

test("GLB headers yield real statistics without decoding geometry", async () => {
  const info = readGlbInfo(await readFile(sample));
  assert.ok(info.stats.triangles > 1000);
  assert.ok(info.stats.meshes > 0);
  assert.deepEqual(info.stats.animations, ["Hovering island and drifting clouds", "Keeper Walk"]);
  assert.ok(info.needs.includes("meshopt"));
  assert.equal(info.external, false);
  assert.throws(() => readGlbInfo(Buffer.from("not a model at all, really")), /glb/i);
});

test("dropped-in files appear with titles from their names, sidecars and curated entries merged", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-"));
  try {
    await mkdir(join(root, "showcase", "models"), { recursive: true });
    await mkdir(join(root, "assets"), { recursive: true });
    await copyFile(sample, join(root, "showcase", "models", "crystal_dragon.glb"));
    await copyFile(sample, join(root, "showcase", "models", "moon-garden.glb"));
    await writeFile(join(root, "showcase", "models", "moon-garden.json"), JSON.stringify({ title: "Moon Garden", featured: true, download: true, credit: "A friend" }));
    await writeFile(join(root, "showcase", "models", "broken.glb"), "nope");
    await copyFile(sample, join(root, "assets", "island.glb"));
    await writeFile(join(root, "showcase", "showcase.json"), JSON.stringify({ models: [{ id: "island", file: "./assets/island.glb", title: "Island" }, { id: "gone", file: "./assets/missing.glb" }] }));
    const { manifest, warnings } = await buildShowcaseManifest(root);
    assert.deepEqual(manifest.models.map((model) => model.id), ["moon-garden", "island", "crystal-dragon"]);
    const dragon = manifest.models.find((model) => model.id === "crystal-dragon");
    assert.equal(dragon.title, "Crystal Dragon");
    assert.equal(dragon.file, "./showcase/models/crystal_dragon.glb");
    assert.equal(dragon.download, false);
    assert.ok(dragon.bytes > 0 && dragon.stats.triangles > 0);
    assert.equal(manifest.models[0].download, true);
    assert.ok(warnings.some((warning) => warning.includes("broken.glb")));
    assert.ok(warnings.some((warning) => warning.includes("not found")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("only safe model paths and well-formed fields survive validation", () => {
  assert.equal(safeModelPath("./showcase/models/a.glb"), "./showcase/models/a.glb");
  assert.equal(safeModelPath("https://cdn.example.com/m/a.glb"), "https://cdn.example.com/m/a.glb");
  for (const bad of ["../secret.glb", "./a.gltf", "http://example.com/a.glb", "javascript:alert(1)//.glb", "./a b.glb", "https://user:pw@example.com/a.glb"])
    assert.equal(safeModelPath(bad), null, bad);
  const model = normalizeModel({ id: "a", file: "./a.glb", title: "x".repeat(200), source: "javascript:alert(1)", onload: "evil()", stats: { triangles: -5, animations: ["Walk", 7] } });
  assert.equal(model.title.length, 80);
  assert.equal(model.source, undefined);
  assert.equal(model.onload, undefined);
  assert.equal(model.stats.triangles, undefined);
  assert.deepEqual(model.stats.animations, ["Walk"]);
  const list = validateShowcase({ models: [{ id: "b", file: "./b.glb" }, { id: "a", file: "./a.glb", featured: true }, { id: "a", file: "./c.glb" }, { id: "Bad Id", file: "./d.glb" }] });
  assert.deepEqual(list.map((item) => item.id), ["a", "b"]);
  assert.equal(titleFromFile("my_cool-thing.glb"), "My Cool Thing");
  assert.equal(slugFromFile("My Cool Thing!.glb"), "my-cool-thing");
});
