// Renders each project's city building (original exterior or curated prefab) to
// public/thumbnails/<id>.webp for the library cards. Run after adding a project:
//   node scripts/render-thumbnails.mjs
// PLAYWRIGHT_CHROMIUM_EXECUTABLE selects an existing Chromium, as in the browser tests.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { validateCatalog } from "../src/catalog.js";
import { LOT_STYLES, defaultLotStyle } from "../src/lot-styles.js";

const root = new URL("../", import.meta.url);
const output = new URL("public/thumbnails/", root);
const projects = validateCatalog(JSON.parse(await readFile(new URL("public/projects.json", root), "utf8")));
const modelFor = (project) =>
  project.exterior?.model ||
  (LOT_STYLES.find((style) => style.id === project.lotStyle) ||
    LOT_STYLES.find((style) => style.id === defaultLotStyle(project.district)))?.model;

const server = await createServer({ root: root.pathname, server: { port: 5199, strictPort: true }, logLevel: "error" });
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
  await mkdir(output, { recursive: true });
  const index = {};
  for (const project of projects) {
    const model = modelFor(project);
    if (!model?.startsWith("./")) continue;
    const url = `http://localhost:5199/Mycity/${model.slice(2)}`;
    const data = await page.evaluate((source) => window.renderThumbnail(source), url);
    const file = `${project.id}.webp`;
    await writeFile(new URL(file, output), Buffer.from(data.split(",")[1], "base64"));
    index[project.id] = `./thumbnails/${file}`;
    console.log(`Rendered ${project.id} from ${model}`);
  }
  await writeFile(new URL("index.json", output), JSON.stringify(index, null, 2) + "\n");
} finally {
  await browser.close();
  await server.close();
}
