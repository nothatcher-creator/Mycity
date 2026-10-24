import { readFile, access } from "node:fs/promises";
import { validateCatalog } from "../src/catalog.js";
import { buildCityLots } from "../src/city-layout.js";
const projects = validateCatalog(
  JSON.parse(
    await readFile(new URL("../public/projects.json", import.meta.url), "utf8"),
  ),
);
const city = JSON.parse(
  await readFile(new URL("../public/city.json", import.meta.url), "utf8"),
);
const lots = buildCityLots(projects, city);
for (const project of projects) {
  for (const path of [
    project.exterior?.model,
    project.exterior?.highModel,
  ].filter(Boolean)) {
    if (path.startsWith("./"))
      await access(new URL(`../public/${path.slice(2)}`, import.meta.url));
  }
}
console.log(
  `City valid: ${projects.length} projects, ${lots.length} lots, ${lots.filter((l) => !l.project).length} open; Astraforge is plot 001.`,
);
