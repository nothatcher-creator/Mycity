import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildCityLots,
  validateCity,
  getDistrictAtPosition,
} from "../src/city-layout.js";
const city = JSON.parse(
  await readFile(new URL("../public/city.json", import.meta.url), "utf8"),
);
const astra = {
  id: "astraforge",
  plot: 1,
  title: "Astraforge",
  district: "tools",
  slot: "tools-01",
};
const relic = {
  id: "relicfall",
  plot: 3672,
  originalLot: 3672,
  title: "RELICFALL",
  district: "games",
  slot: "games-01",
};
test("all 96 city lots have stable unique slots, with real vacancies", () => {
  const lots = buildCityLots([astra, relic], city);
  assert.equal(lots.length, 96);
  assert.equal(new Set(lots.map((l) => l.slotId)).size, 96);
  assert.equal(lots.filter((l) => l.project === null).length, 94);
  assert.equal(lots.find((l) => l.slotId === "games-01").displayNumber, "3672");
  assert.equal(
    lots.find((l) => l.slotId === "tools-01").project.id,
    "astraforge",
  );
});
test("adding projects never moves a reserved slot or another district", () => {
  const before = buildCityLots([astra], city);
  const after = buildCityLots([astra, relic], city);
  for (const lot of before)
    assert.deepEqual(
      after.find((l) => l.slotId === lot.slotId).position,
      lot.position,
    );
  const coords = before.map((l) => `${l.position.x},${l.position.z}`);
  assert.equal(new Set(coords).size, 96);
});
test("conflicting and nonexistent neighborhood slots reject publication", () => {
  assert.throws(
    () =>
      buildCityLots(
        [astra, { ...relic, slot: "tools-01", district: "tools" }],
        city,
      ),
    /occupied|duplicate/i,
  );
  assert.throws(
    () => buildCityLots([{ ...astra, slot: "tools-17" }], city),
    /slot/i,
  );
  assert.throws(
    () => buildCityLots([{ ...astra, district: "games" }], city),
    /slot|district/i,
  );
});
test("bad configuration cannot generate an unbounded or overlapping city", () => {
  assert.equal(validateCity(city), city);
  for (const change of [
    { slotCount: 0 },
    { slotCount: 1e9 },
    { columns: 0 },
    { spacing: 0 },
    { center: [NaN, 0] },
  ]) {
    const bad = structuredClone(city);
    Object.assign(bad.districts[0], change);
    assert.throws(() => validateCity(bad), /city|district/i);
  }
  const duplicate = structuredClone(city);
  duplicate.districts[1].id = duplicate.districts[0].id;
  assert.throws(() => validateCity(duplicate), /district/i);
});
test("district lookup matches each island, the Beacon, the showcase and open water", () => {
  for (const district of city.districts)
    assert.equal(getDistrictAtPosition({ x: district.center[0], z: district.center[1] }, city), district.id);
  assert.equal(getDistrictAtPosition({ x: 0, z: 0 }, city), "center");
  assert.equal(getDistrictAtPosition({ x: city.showcase.center[0], z: city.showcase.center[1] }, city), "showcase");
  assert.equal(getDistrictAtPosition({ x: 330, z: 0 }, city), "bay");
});
test("islands that would touch each other or the Beacon are rejected", () => {
  const crowded = structuredClone(city);
  crowded.districts[1].center = [...crowded.districts[0].center];
  crowded.districts[1].center[0] += 40;
  assert.throws(() => validateCity(crowded), /overlap|slot/i);
  const onBeacon = structuredClone(city);
  onBeacon.districts[0].center = [0, -60];
  assert.throws(() => validateCity(onBeacon), /beacon/i);
  const showcase = structuredClone(city);
  showcase.showcase.center = [0, 70];
  assert.throws(() => validateCity(showcase), /showcase/i);
});
