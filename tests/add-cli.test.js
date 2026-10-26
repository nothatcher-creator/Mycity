import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { planNewProject, appendToCatalog, slugify } from "../scripts/add-project.mjs";
import { validateCatalog } from "../src/catalog.js";

const raw = await readFile(new URL("../public/projects.json", import.meta.url), "utf8");
const projects = JSON.parse(raw);
const city = JSON.parse(await readFile(new URL("../public/city.json", import.meta.url), "utf8"));
const input = { url: "https://a-friend.itch.io/moon-garden", title: "Moon Garden", district: "games", description: "Grow a garden on the moon." };

test("a new project gets the first free lot, the next plot number and a unique id", () => {
  const entry = planNewProject(projects, city, input);
  assert.equal(entry.slot, "games-17");
  assert.equal(entry.plot, Math.max(...projects.filter((p) => !p.originalLot).map((p) => p.plot)) + 1);
  assert.equal(entry.id, "moon-garden");
  assert.equal(entry.category, "games");
  assert.equal(entry.embed, false);
  assert.deepEqual(entry.tags, []);
  const second = planNewProject([...projects, entry], city, { ...input, url: "https://a-friend.itch.io/moon-garden-2" });
  assert.equal(second.id, "moon-garden-2");
  assert.equal(second.slot, "games-18");
  assert.equal(second.plot, entry.plot + 1);
});

test("duplicates, full or wrong lots, bad links and missing details are refused with reasons", () => {
  assert.throws(() => planNewProject(projects, city, { ...input, url: "https://nothatcher-creator.github.io/Astraforge/?utm_source=x" }), /already in the city/);
  assert.throws(() => planNewProject(projects, city, { ...input, slot: "tools-01" }), /already holds/);
  assert.throws(() => planNewProject(projects, city, { ...input, slot: "art-02" }), /not in games/);
  assert.throws(() => planNewProject(projects, city, { ...input, url: "http://insecure.example.com" }), /HTTPS/);
  assert.throws(() => planNewProject(projects, city, { ...input, description: "" }), /description/);
  assert.throws(() => planNewProject(projects, city, { ...input, district: "moon" }), /neighborhood/i);
  assert.throws(() => planNewProject(projects, city, { ...input, style: "castle" }), /styles/i);
});

test("hosted games keep their relative path, and appending keeps the file's formatting", () => {
  const entry = planNewProject(projects, city, { ...input, url: "./games/moon-garden/", embed: true, style: "arcade", tags: ["Garden"] });
  assert.equal(entry.url, "./games/moon-garden/");
  const text = appendToCatalog(raw, entry);
  assert.ok(text.startsWith(raw.slice(0, raw.lastIndexOf("}"))), "existing entries are untouched");
  assert.ok(text.includes('"tags": ["Garden"]'));
  const parsed = validateCatalog(JSON.parse(text));
  assert.deepEqual(parsed.at(-1), entry);
  assert.equal(parsed.length, projects.length + 1);
});

test("ids are readable slugs that start with a letter", () => {
  assert.equal(slugify("Crème Brûlée: The Game!"), "creme-brulee-the-game");
  assert.equal(slugify("3D Garden"), "d-garden");
  assert.equal(slugify("!!!"), "project");
});
