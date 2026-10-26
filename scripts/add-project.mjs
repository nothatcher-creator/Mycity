#!/usr/bin/env node
// Add a project to the city in one step:
//   npm run add                                   (asks a few questions)
//   npm run add -- --url https://example.com/game --title "My Game" --district games \
//                  --description "Explore the island." [--subtitle ...] [--style arcade]
//                  [--embed] [--slot games-17] [--yes] [--no-picture]
// It picks a free lot and the next plot number, checks for duplicates, writes a
// validated entry to public/projects.json (keeping the file's formatting) and
// renders the card picture.
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stdin, stdout } from "node:process";
import { validateCatalog, safeProjectUrl } from "../src/catalog.js";
import { buildCityLots, validateCity } from "../src/city-layout.js";
import { inferProjectDetails, findDuplicateProject } from "../src/add-project-data.js";
import { LOT_STYLES, isLotStyle } from "../src/lot-styles.js";

const THEMES = { games: "lighthouse", tools: "workshop", art: "gallery", android: "android", mods: "cards" };
const BASE = "https://nothatcher-creator.github.io/Mycity/";

export function slugify(text) {
  return String(text).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^a-z]+/, "").slice(0, 48) || "project";
}

/** A complete, validated catalog entry for the next free lot. Throws with a readable reason. */
export function planNewProject(projects, city, input) {
  const url = safeProjectUrl(String(input.url || "").trim(), BASE);
  const raw = String(input.url).trim();
  const duplicate = findDuplicateProject(projects, raw, BASE);
  if (duplicate) throw new Error(`That link is already in the city as "${duplicate.title}" (${duplicate.slot}).`);
  const district = input.district;
  if (!city.districts.some((item) => item.id === district)) throw new Error(`Choose a neighborhood: ${city.districts.map((item) => item.id).join(", ")}.`);
  const title = String(input.title || "").trim();
  if (!title || title.length > 80) throw new Error("Give the project a name of up to 80 characters.");
  const description = String(input.description || "").trim();
  if (!description || description.length > 500) throw new Error("Add a description of up to 500 characters, saying what visitors can do.");
  const lots = buildCityLots(projects, city);
  const lot = input.slot
    ? lots.find((item) => item.slotId === input.slot)
    : lots.find((item) => !item.project && item.district === district);
  if (!lot) throw new Error(input.slot ? `There is no lot called ${input.slot}.` : `${district} has no empty lots left.`);
  if (lot.project) throw new Error(`${lot.slotId} already holds "${lot.project.title}".`);
  if (lot.district !== district) throw new Error(`${lot.slotId} is not in ${district}.`);
  if (input.style !== undefined && !isLotStyle(input.style)) throw new Error(`Building styles: ${LOT_STYLES.map((style) => style.id).join(", ")}.`);
  // Plot numbers for new work continue after the highest non-Project 0 plot.
  const plot = Math.max(0, ...projects.filter((project) => !project.originalLot).map((project) => project.plot)) + 1;
  let id = slugify(title);
  for (let n = 2; projects.some((project) => project.id === id); n++) id = `${slugify(title).slice(0, 44)}-${n}`;
  const entry = {
    id,
    plot,
    title,
    ...(input.subtitle ? { subtitle: String(input.subtitle).trim().slice(0, 80) } : {}),
    description,
    category: district,
    url: raw.startsWith("./") ? raw : url,
    ...(input.source ? { source: safeProjectUrl(String(input.source).trim()) } : {}),
    embed: Boolean(input.embed),
    theme: THEMES[district],
    tags: Array.isArray(input.tags) ? input.tags.filter(Boolean) : [],
    district,
    slot: lot.slotId,
    ...(input.style ? { lotStyle: input.style } : {}),
  };
  validateCatalog([...projects, entry]);
  buildCityLots([...projects, entry], city);
  return entry;
}

/** Append an entry to the catalog's text without reformatting the rest of the file. */
export function appendToCatalog(raw, entry) {
  const value = (item) => (Array.isArray(item) ? `[${item.map((part) => JSON.stringify(part)).join(", ")}]` : JSON.stringify(item));
  const body = Object.entries(entry).map(([key, item]) => `    ${JSON.stringify(key)}: ${value(item)}`).join(",\n");
  const end = raw.lastIndexOf("]");
  const text = `${raw.slice(0, end).trimEnd()},\n  {\n${body}\n  }\n]\n`;
  const expected = JSON.stringify([...JSON.parse(raw), entry]);
  return JSON.stringify(JSON.parse(text)) === expected ? text : `${JSON.stringify(JSON.parse(expected), null, 2)}\n`;
}

function parseArguments(values) {
  const options = {};
  for (let i = 0; i < values.length; i++) {
    const name = values[i];
    if (!name.startsWith("--")) throw new Error(`Unexpected argument: ${name}`);
    const key = name.slice(2);
    if (["embed", "yes", "no-picture"].includes(key)) options[key] = true;
    else if (["url", "title", "district", "description", "subtitle", "style", "slot", "source", "tags"].includes(key)) options[key] = values[++i];
    else throw new Error(`Unknown option ${name}`);
  }
  if (options.tags) options.tags = options.tags.split(",").map((tag) => tag.trim());
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const root = new URL("../", import.meta.url);
  const catalogUrl = new URL("public/projects.json", root);
  const raw = await readFile(catalogUrl, "utf8");
  const projects = validateCatalog(JSON.parse(raw));
  const city = validateCity(JSON.parse(await readFile(new URL("public/city.json", root), "utf8")));
  const options = parseArguments(argv);
  const interactive = stdin.isTTY && !options.yes;
  const prompt = interactive ? createInterface({ input: stdin, output: stdout }) : null;
  const ask = async (question, fallback = "") => {
    if (!prompt) return fallback;
    const answer = (await prompt.question(`${question}${fallback ? ` (${fallback})` : ""}: `)).trim();
    return answer || fallback;
  };
  try {
    options.url ??= await ask("Project link (https://… or ./games/your-game/)");
    if (!options.url) throw new Error("A project link is required (--url).");
    const guess = options.url.startsWith("https://") ? inferProjectDetails(options.url) : { district: "games", title: "" };
    options.title ??= await ask("Name", guess.title);
    if (!options.district) {
      if (prompt) console.log(`Neighborhoods: ${city.districts.map((item) => `${item.id} (${item.name})`).join(", ")}`);
      options.district = await ask("Neighborhood", guess.district);
    }
    options.description ??= await ask("What can visitors do there?");
    options.subtitle ??= (await ask("Short subtitle (optional)")) || undefined;
    if (options.embed === undefined && prompt)
      options.embed = /^y/i.test(await ask("Open it inside Mycity instead of a new tab? Only for sites that allow embedding (y/n)", options.url.startsWith("./") ? "y" : "n"));
    const entry = planNewProject(projects, city, options);
    console.log(`\n${entry.title} → lot ${entry.slot}, plot ${String(entry.plot).padStart(3, "0")}, ${entry.embed ? "opens inside Mycity" : "opens in a new tab"}.`);
    if (prompt && !/^y/i.test(await ask("Add it to public/projects.json? (y/n)", "y"))) return console.log("Nothing was changed.");
    await writeFile(catalogUrl, appendToCatalog(raw, entry));
    console.log("Added to public/projects.json.");
    if (!options["no-picture"]) {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL("scripts/render-thumbnails.mjs", root))], { stdio: "inherit" });
      if (result.status !== 0) console.log("The card picture could not be rendered here; run `npm run thumbnails` where Chromium is available.");
    }
    console.log("Next: `npm run dev` to see it, then commit and push. The site rebuilds itself.");
  } finally {
    prompt?.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Could not add the project: ${error.message}`);
    process.exitCode = 1;
  });
}
