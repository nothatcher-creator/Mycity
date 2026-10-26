// Model Showcase records. The build (scripts/build-showcase.mjs) writes
// public/showcase/index.json from the curated list and the drop-in folder;
// the browser validates it again before anything is shown.

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const text = (value, max) =>
  typeof value === "string" && value.trim() ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : undefined;
const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : undefined);

/** Local `./...glb` paths inside the site, or public HTTPS URLs to a .glb. */
export function safeModelPath(value) {
  if (typeof value !== "string" || /[\u0000- \\]/.test(value) || value.includes("..")) return null;
  if (/^\.\/[A-Za-z0-9_./-]+\.glb$/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password && /\.glb$/i.test(url.pathname)) return url.href;
  } catch {
    /* Not a URL. */
  }
  return null;
}
function safeLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Title from a file name: "crystal_dragon-v2.glb" becomes "Crystal Dragon V2". */
export function titleFromFile(file) {
  const name = String(file).split("/").pop().replace(/\.glb$/i, "");
  return name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b[a-z]/g, (letter) => letter.toUpperCase()) || "Untitled model";
}
export function slugFromFile(file) {
  return (
    String(file).split("/").pop().replace(/\.glb$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) ||
    "model"
  );
}

/** Keep only well-formed, displayable fields; drop anything else. */
export function normalizeModel(raw) {
  if (!raw || typeof raw !== "object") return null;
  const file = safeModelPath(raw.file);
  if (!file || typeof raw.id !== "string" || !SLUG.test(raw.id)) return null;
  const stats = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
  const model = {
    id: raw.id,
    title: text(raw.title, 80) || titleFromFile(file),
    file,
    description: text(raw.description, 600),
    credit: text(raw.credit, 120),
    license: text(raw.license, 80),
    source: safeLink(raw.source),
    project: typeof raw.project === "string" && SLUG.test(raw.project) ? raw.project : undefined,
    thumbnail: typeof raw.thumbnail === "string" && /^\.\/[A-Za-z0-9_./-]+\.webp$/.test(raw.thumbnail) && !raw.thumbnail.includes("..") ? raw.thumbnail : undefined,
    bytes: count(raw.bytes),
    featured: raw.featured === true,
    download: raw.download === true,
    stats: {
      triangles: count(stats.triangles),
      meshes: count(stats.meshes),
      materials: count(stats.materials),
      textures: count(stats.textures),
      animations: Array.isArray(stats.animations) ? stats.animations.map((name) => text(name, 60)).filter(Boolean).slice(0, 24) : [],
    },
    needs: Array.isArray(raw.needs) ? raw.needs.filter((name) => ["draco", "ktx2", "meshopt"].includes(name)) : [],
  };
  for (const key of Object.keys(model)) if (model[key] === undefined) delete model[key];
  return model;
}

/** Validated, de-duplicated models in display order: featured first. */
export function validateShowcase(data) {
  const list = Array.isArray(data?.models) ? data.models : [];
  const seen = new Set();
  const models = [];
  for (const raw of list) {
    const model = normalizeModel(raw);
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(model);
  }
  return [...models.filter((model) => model.featured), ...models.filter((model) => !model.featured)];
}

export const showcaseNumber = (index) => `S${String(index + 1).padStart(2, "0")}`;

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
