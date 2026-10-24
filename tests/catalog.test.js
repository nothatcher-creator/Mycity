import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCatalog,
  filterProjects,
  safeProjectUrl,
} from "../src/catalog.js";

const first = {
  id: "astraforge",
  plot: 1,
  title: "Astraforge",
  subtitle: "LyricForge video studio",
  description: "A local creative studio.",
  category: "tools",
  district: "tools",
  slot: "tools-01",
  url: "https://nothatcher-creator.github.io/Astraforge/",
  embed: true,
  theme: "forge",
  tags: ["video", "AI"],
};
const second = {
  id: "bench-lab",
  plot: 2,
  title: "Bench Lab",
  description: "Transparent model response tests.",
  category: "benchmarks",
  district: "tools",
  slot: "tools-02",
  url: "./benchmarks/",
  embed: true,
  theme: "benchmark",
  tags: ["AI", "evaluation"],
};

test("a valid catalog preserves Astraforge as plot 001 and local lab links", () => {
  const catalog = validateCatalog([first, second]);
  assert.equal(catalog[0].id, "astraforge");
  assert.equal(catalog[0].plot, 1);
  assert.equal(catalog[1].url, "./benchmarks/");
});
test("duplicate IDs and plots fail before publication", () => {
  assert.throws(
    () => validateCatalog([first, { ...second, id: first.id }]),
    /duplicate/i,
  );
  assert.throws(
    () => validateCatalog([first, { ...second, plot: 1 }]),
    /duplicate/i,
  );
});
test("Astraforge cannot silently be displaced from the first integration", () => {
  assert.throws(() => validateCatalog([second, first]), /Astraforge/);
  assert.throws(
    () => validateCatalog([{ ...first, plot: 7 }, second]),
    /Astraforge/,
  );
});
test("unsafe URL schemes and protocol-relative URLs are rejected", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "http://example.com",
    "//example.com/app",
    "https://user:password@example.com",
  ]) {
    assert.throws(() => safeProjectUrl(url), /URL/i);
    assert.throws(() => validateCatalog([{ ...first, url }]), /URL/i);
  }
  assert.equal(
    safeProjectUrl("./games/test/"),
    "https://nothatcher-creator.github.io/games/test/",
  );
  assert.equal(safeProjectUrl(first.url), first.url);
});
test("invalid categories, identifiers, plot numbers and empty titles are rejected", () => {
  for (const change of [
    { category: "unknown" },
    { id: "<script>" },
    { plot: 0 },
    { plot: 2.5 },
    { title: "  " },
    { tags: ["ok", null] },
    { embed: "yes" },
  ]) {
    assert.throws(
      () => validateCatalog([{ ...first, ...change }]),
      /project|Astraforge|catalog/i,
    );
  }
});
test("array IDs cannot pass validation through JavaScript string coercion", () => {
  assert.throws(
    () => validateCatalog([first, { ...second, id: ["bench-lab"] }]),
    /Invalid project/i,
  );
});
test("neighborhoods and slots are required and art/android projects are valid", () => {
  assert.throws(
    () => validateCatalog([{ ...first, district: "unknown" }]),
    /project|district/i,
  );
  assert.throws(
    () => validateCatalog([{ ...first, slot: "games-01" }]),
    /project|slot/i,
  );
  assert.throws(
    () => validateCatalog([first, { ...second, slot: first.slot }]),
    /slot|duplicate/i,
  );
  for (const category of ["art", "android"]) {
    assert.equal(
      validateCatalog([
        first,
        { ...second, category, district: category, slot: `${category}-01` },
      ]).length,
      2,
    );
  }
});
test("search combines words, tags and category while preserving plot order", () => {
  const catalog = validateCatalog([first, second]);
  assert.deepEqual(
    filterProjects(catalog, "all", "  VIDEO ai ").map((p) => p.id),
    ["astraforge"],
  );
  assert.deepEqual(
    filterProjects(catalog, "benchmarks", "model").map((p) => p.id),
    ["bench-lab"],
  );
  assert.deepEqual(filterProjects(catalog, "games", "AI"), []);
  assert.deepEqual(filterProjects(catalog, "all", ""), catalog);
});
