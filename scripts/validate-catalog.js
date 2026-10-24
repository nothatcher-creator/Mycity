import { readFile } from "node:fs/promises";
import { validateCatalog } from "../src/catalog.js";
const projects = validateCatalog(
  JSON.parse(
    await readFile(new URL("../public/projects.json", import.meta.url), "utf8"),
  ),
);
console.log(
  `Catalog valid: ${projects.length} projects; Astraforge is plot 001.`,
);
