// Renders pictures for the library cards:
//   - each project's city building (original exterior or curated prefab) to public/thumbnails/<id>.webp
//   - each showcase model to public/showcase/thumbnails/<id>.webp
// Only missing pictures are rendered; pass --force to redo them all.
//   npm run thumbnails            (or: node scripts/render-thumbnails.mjs --force)
// PLAYWRIGHT_CHROMIUM_EXECUTABLE selects an existing Chromium, as in the browser tests.
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { validateCatalog } from "../src/catalog.js";
import { cityBuildingSource } from "../src/lot-sources.js";
import { buildShowcaseManifest } from "./build-showcase.mjs";

const force = process.argv.includes("--force");
const root = new URL("../", import.meta.url);
const publicDir = fileURLToPath(new URL("public/", root));
const exists = (url) => access(url).then(() => true, () => false);

const projects = validateCatalog(JSON.parse(await readFile(new URL("public/projects.json", root), "utf8")));
const { manifest } = await buildShowcaseManifest(publicDir);
const jobs = [];
for (const project of projects) {
  const model = cityBuildingSource(project);
  if (model?.startsWith("./")) jobs.push({ id: project.id, model, folder: "thumbnails/" });
}
for (const model of manifest.models)
  if (model.file.startsWith("./")) jobs.push({ id: model.id, model: model.file, folder: "showcase/thumbnails/" });

const index = {};
const pending = [];
for (const job of jobs) {
  const target = new URL(`public/${job.folder}${job.id}.webp`, root);
  if (job.folder === "thumbnails/") index[job.id] = `./thumbnails/${job.id}.webp`;
  if (force || !(await exists(target))) pending.push({ ...job, target });
}

if (pending.length) {
  const server = await createServer({ root: fileURLToPath(root), server: { port: 5199, strictPort: true }, logLevel: "error" });
  await server.listen();
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
    args: ["--enable-unsafe-swiftshader", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 720, height: 320 } });
    page.on("pageerror", (error) => console.error(error.message));
    await page.goto("http://localhost:5199/Mycity/scripts/thumbnails.html");
    await page.waitForFunction(() => window.thumbnailRendererReady, null, { timeout: 60000 });
    for (const job of pending) {
      await mkdir(new URL(`public/${job.folder}`, root), { recursive: true });
      try {
        const data = await page.evaluate((source) => window.renderThumbnail(source), `http://localhost:5199/Mycity/${job.model.slice(2)}`);
        await writeFile(job.target, Buffer.from(data.split(",")[1], "base64"));
        console.log(`Rendered ${job.folder}${job.id}.webp from ${job.model}`);
      } catch (error) {
        console.warn(`Could not render ${job.id}: ${error.message}`);
        if (job.folder === "thumbnails/") delete index[job.id];
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
} else console.log("All pictures are up to date. Use --force to render them again.");

const listed = {};
for (const [id, path] of Object.entries(index)) if (await exists(new URL(`public/${path.slice(2)}`, root))) listed[id] = path;
await writeFile(new URL("public/thumbnails/index.json", root), JSON.stringify(listed, null, 2) + "\n");
