import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCatalog } from "../src/catalog.js";
import { buildCityLots } from "../src/city-layout.js";
const projects = JSON.parse(
  await readFile(new URL("../public/projects.json", import.meta.url), "utf8"),
);
const city = JSON.parse(
  await readFile(new URL("../public/city.json", import.meta.url), "utf8"),
);
test("all 16 current original games retain their numbers in the Game Quarter", () => {
  validateCatalog(projects);
  const games = projects.filter((p) => p.provider === "project0");
  assert.deepEqual(
    games.map((p) => p.originalLot).sort((a, b) => a - b),
    [
      643, 987, 1003, 1043, 1099, 1123, 1147, 1669, 3665, 3666, 3667, 3668,
      3669, 3670, 3671, 3672,
    ],
  );
  for (const p of games) {
    assert.equal(p.plot, p.originalLot);
    assert.equal(p.district, "games");
    assert.equal(p.url, `https://project0.city/#${p.originalLot}`);
  }
});
test("Nexus, gallery, Astraforge, and Android have distinct proper neighborhoods", () => {
  assert.equal(projects[0].id, "astraforge");
  assert.equal(projects[0].slot, "tools-01");
  assert.equal(
    projects.find((p) => p.id === "nexus-mods").url,
    "https://www.nexusmods.com/profile/Nothatcher",
  );
  assert.equal(projects.find((p) => p.id === "nexus-mods").district, "mods");
  assert.equal(projects.find((p) => p.id === "city-gallery").district, "art");
  assert.equal(
    projects.find((p) => p.id === "balatro-modpack").district,
    "android",
  );
  const lots = buildCityLots(projects, city);
  assert.equal(lots.length, 96);
  assert.equal(lots.filter((l) => !l.project).length, 96 - projects.length);
});
