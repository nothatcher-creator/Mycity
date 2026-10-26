import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCityPlan, showcasePlaces } from "../src/city-plan.js";
import { districtIsland, showcaseArea, LOT_SIZE } from "../src/city-layout.js";

const city = JSON.parse(await readFile(new URL("../public/city.json", import.meta.url), "utf8"));
const projects = JSON.parse(await readFile(new URL("../public/projects.json", import.meta.url), "utf8"));
const models = Array.from({ length: 60 }, (_, i) => ({ id: `model-${i}` }));
const plan = buildCityPlan(projects, city, { models });

function insidePolygon(point, polygon) {
  return polygon.every((p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    return (q.x - p.x) * (point.z - p.z) - (q.z - p.z) * (point.x - p.x) >= 0;
  });
}

test("every lot, with its whole plinth, stands on its own island", () => {
  for (const lot of plan.lots) {
    const island = plan.islands.find((item) => item.district.id === lot.district);
    const right = { x: lot.forward.z, z: -lot.forward.x };
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const corner = {
        x: lot.position.x + (right.x * a + lot.forward.x * b) * (LOT_SIZE / 2),
        z: lot.position.z + (right.z * a + lot.forward.z * b) * (LOT_SIZE / 2),
      };
      assert.ok(insidePolygon(corner, island.polygon), `${lot.slotId} leaves its island`);
    }
  }
});

test("lots face the Beacon, front row first, and their entrance is in front", () => {
  for (const lot of plan.lots) {
    const toCenter = Math.hypot(lot.position.x, lot.position.z);
    const ahead = Math.hypot(lot.entrance.x, lot.entrance.z);
    assert.ok(ahead < toCenter, `${lot.slotId} entrance is not towards the Beacon`);
  }
  const games = plan.lots.filter((lot) => lot.district === "games");
  const distance = (lot) => Math.hypot(lot.position.x, lot.position.z);
  assert.ok(distance(games[0]) < distance(games.at(-1)));
});

test("bridges join the Beacon island to each island's entrance without crossing another island", () => {
  assert.equal(plan.bridges.length, city.districts.length + 1);
  for (const bridge of plan.bridges) {
    assert.ok(Math.hypot(bridge.from.x, bridge.from.z) < plan.center.radius);
    for (const island of plan.islands) {
      if (island.district.id === bridge.district) continue;
      for (let t = 0.05; t < 1; t += 0.05) {
        const point = { x: bridge.from.x + (bridge.to.x - bridge.from.x) * t, z: bridge.from.z + (bridge.to.z - bridge.from.z) * t };
        assert.ok(!insidePolygon(point, island.polygon), `${bridge.district} bridge crosses ${island.district.id}`);
      }
    }
  }
  for (const island of plan.islands) {
    const bridge = plan.bridges.find((item) => item.district === island.district.id);
    assert.ok(Math.hypot(bridge.to.x - island.gate.x, bridge.to.z - island.gate.z) < 3);
  }
});

test("showcase pedestals are spaced apart on the island and keep the entrance avenue clear", () => {
  const area = showcaseArea(city);
  const places = showcasePlaces(area);
  assert.ok(places.length >= 40);
  assert.ok(places[0].featured);
  for (const [i, place] of places.entries()) {
    const local = area.frame.toLocal(place.position.x, place.position.z);
    assert.ok(Math.hypot(local.x, local.z) + place.size / 2 < area.radius - 3);
    if (!place.featured) assert.ok(!(local.z > 0 && Math.abs(local.x) < 6), "pedestal blocks the avenue");
    for (const other of places.slice(i + 1))
      assert.ok(Math.hypot(place.position.x - other.position.x, place.position.z - other.position.z) > 7.5);
  }
  assert.equal(plan.showcase.pedestals.length, places.length);
  assert.equal(plan.showcase.overflow.length, models.length - places.length);
  assert.equal(plan.showcase.pedestals[0].model.id, "model-0");
});

test("the plan is deterministic and adding a project moves nothing", () => {
  const again = buildCityPlan(projects, city, { models });
  assert.deepEqual(again.roads, plan.roads);
  assert.deepEqual(again.props, plan.props);
  const fewer = buildCityPlan(projects.slice(0, 5), city, { models });
  for (const lot of fewer.lots)
    assert.deepEqual(plan.lots.find((item) => item.slotId === lot.slotId).position, lot.position);
  for (const island of plan.islands) assert.deepEqual(districtIsland(island.district).polygon, island.polygon);
});
