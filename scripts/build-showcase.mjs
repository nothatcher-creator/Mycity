#!/usr/bin/env node
// Builds public/showcase/index.json for the Model Showcase island.
//   - Every .glb dropped into public/showcase/models/ is included automatically,
//     titled from its file name. An optional models/<name>.json beside it can
//     set title, description, credit, license, source, featured, download, order.
//   - public/showcase/showcase.json lists curated models (e.g. files elsewhere in the site).
// It also copies three.js's Draco and KTX2 decoders into public/vendor/ so
// compressed models load. Runs before `npm run dev` and `npm run build`.
import { readFile, writeFile, readdir, stat, mkdir, copyFile, access } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { normalizeModel, validateShowcase, slugFromFile, titleFromFile, formatBytes } from "../src/showcase.js";

const LARGE = 40 * 1024 * 1024;

/** Statistics from a GLB's JSON chunk, without decoding geometry. */
export function readGlbInfo(buffer) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67) throw new Error("not a binary glTF (.glb) file");
  if (buffer.readUInt32LE(4) !== 2) throw new Error("only glTF 2.0 is supported");
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a || 20 + jsonLength > buffer.length) throw new Error("missing glTF JSON chunk");
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
  const uses = new Map();
  for (const node of json.nodes || []) if (Number.isInteger(node.mesh)) uses.set(node.mesh, (uses.get(node.mesh) || 0) + 1);
  let triangles = 0, primitives = 0;
  for (const [index, mesh] of (json.meshes || []).entries()) {
    const copies = uses.get(index) || 0;
    for (const primitive of mesh.primitives || []) {
      primitives += copies;
      const accessor = json.accessors?.[primitive.indices ?? primitive.attributes?.POSITION];
      const vertices = accessor?.count || 0;
      const mode = primitive.mode ?? 4;
      triangles += copies * (mode === 4 ? Math.floor(vertices / 3) : mode === 5 || mode === 6 ? Math.max(0, vertices - 2) : 0);
    }
  }
  const extensions = [...new Set([...(json.extensionsUsed || []), ...(json.extensionsRequired || [])])];
  const needs = [];
  if (extensions.includes("KHR_draco_mesh_compression")) needs.push("draco");
  if (extensions.includes("KHR_texture_basisu")) needs.push("ktx2");
  if (extensions.includes("EXT_meshopt_compression")) needs.push("meshopt");
  const external = [...(json.buffers || []), ...(json.images || [])].some((item) => typeof item.uri === "string" && !item.uri.startsWith("data:"));
  return {
    stats: {
      triangles,
      meshes: primitives,
      materials: (json.materials || []).length,
      textures: (json.textures || []).length,
      animations: (json.animations || []).map((clip, i) => clip.name || `Animation ${i + 1}`),
    },
    needs,
    external,
    credit: json.asset?.copyright,
  };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error(`${path}: ${error.message}`);
  }
}

/** Collect curated and dropped-in models; returns the manifest and any warnings. */
export async function buildShowcaseManifest(publicDir) {
  const warnings = [];
  const curated = await readJson(join(publicDir, "showcase", "showcase.json"), { models: [] });
  const entries = [];
  for (const item of curated.models || []) entries.push({ ...item, origin: "showcase.json" });
  const folder = join(publicDir, "showcase", "models");
  const files = (await exists(folder)) ? (await readdir(folder)).filter((name) => /\.glb$/i.test(name)).sort() : [];
  const dropped = [];
  for (const name of files) {
    const sidecar = await readJson(join(folder, name.replace(/\.glb$/i, ".json")), {});
    dropped.push({ title: titleFromFile(name), ...sidecar, id: sidecar.id || slugFromFile(name), file: `./showcase/models/${name}`, origin: name });
  }
  dropped.sort((a, b) => (Number.isFinite(a.order) ? a.order : 1e9) - (Number.isFinite(b.order) ? b.order : 1e9));
  entries.push(...dropped);
  const ids = new Set(), models = [];
  for (const entry of entries) {
    const base = typeof entry.id === "string" ? entry.id : slugFromFile(entry.file || "");
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    const record = { ...entry, id };
    if (typeof entry.file === "string" && entry.file.startsWith("./")) {
      const path = join(publicDir, entry.file.slice(2));
      try {
        const buffer = await readFile(path);
        const info = readGlbInfo(buffer);
        record.bytes = buffer.length;
        record.stats = info.stats;
        record.needs = info.needs;
        record.credit ??= info.credit;
        if (info.external) warnings.push(`${entry.origin}: refers to external files; export a self-contained .glb instead.`);
        if (buffer.length > LARGE) warnings.push(`${entry.origin}: ${formatBytes(buffer.length)} is large; it is only loaded when someone opens it.`);
      } catch (error) {
        warnings.push(`${entry.origin}: skipped (${error.code === "ENOENT" ? "file not found" : error.message}).`);
        continue;
      }
    }
    const thumbnail = `./showcase/thumbnails/${id}.webp`;
    if (await exists(join(publicDir, thumbnail.slice(2)))) record.thumbnail = thumbnail;
    const model = normalizeModel(record);
    if (!model) {
      warnings.push(`${entry.origin}: skipped (needs a .glb file path and a lowercase id).`);
      continue;
    }
    ids.add(id);
    models.push(model);
  }
  return { manifest: { models: validateShowcase({ models }) }, warnings };
}

/** Decoders for Draco-compressed meshes and KTX2 textures, served from /vendor/. */
async function copyDecoders(root, publicDir) {
  const libs = join(root, "node_modules", "three", "examples", "jsm", "libs");
  const sets = [
    ["draco", join(libs, "draco", "gltf"), ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"]],
    ["basis", join(libs, "basis"), ["basis_transcoder.js", "basis_transcoder.wasm"]],
  ];
  for (const [name, source, list] of sets) {
    const target = join(publicDir, "vendor", name);
    await mkdir(target, { recursive: true });
    for (const file of list) {
      if (!(await exists(join(source, file)))) continue;
      const from = await stat(join(source, file));
      const to = await stat(join(target, file)).catch(() => null);
      if (!to || to.size !== from.size) await copyFile(join(source, file), join(target, file));
    }
  }
}

export async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const publicDir = join(root, "public");
  const { manifest, warnings } = await buildShowcaseManifest(publicDir);
  await mkdir(join(publicDir, "showcase"), { recursive: true });
  await writeFile(join(publicDir, "showcase", "index.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await copyDecoders(root, publicDir);
  for (const warning of warnings) console.warn(`Showcase: ${warning}`);
  console.log(`Showcase: ${manifest.models.length} model${manifest.models.length === 1 ? "" : "s"} ready.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
