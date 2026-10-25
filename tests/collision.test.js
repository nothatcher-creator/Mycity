import test from "node:test";
import assert from "node:assert/strict";
import { createHeightField } from "../src/collision.js";
import { createFlightState, stepFlight, PLAYER_RADIUS } from "../src/flight.js";

// A closed 4 x 4 m box, 10 m tall, centred on the origin, as triangles.
function boxTriangles(half = 2, top = 10) {
  const p = [];
  const quad = (a, b, c, d) => p.push(...a, ...b, ...c, ...a, ...c, ...d);
  const [n, s] = [-half, half];
  quad([n, top, n], [s, top, n], [s, top, s], [n, top, s]);
  quad([n, 0, n], [s, 0, n], [s, top, n], [n, top, n]);
  quad([n, 0, s], [s, 0, s], [s, top, s], [n, top, s]);
  quad([n, 0, n], [n, 0, s], [n, top, s], [n, top, n]);
  quad([s, 0, n], [s, 0, s], [s, top, s], [s, top, n]);
  return p;
}

function fly(state, input, field, seconds = 2) {
  for (let i = 0; i < seconds * 60; i++)
    stepFlight(state, input, 1 / 60, 0, undefined, field);
  return state;
}

test("triangles rasterize into the cells they cover, including large flat roofs", () => {
  const field = createHeightField({ cellSize: 0.5 });
  field.addTriangles(boxTriangles());
  // The roof is two triangles; the middle of it must still be solid.
  assert.equal(field.heightAt(0, 0), 10);
  assert.equal(field.heightAt(1.9, -1.9), 10);
  assert.equal(field.heightAt(2.6, 0), 0);
  assert.equal(field.maxHeightIn(2.6, -1, 4, 1), 0);
  assert.equal(field.maxHeightIn(1.9, -1, 4, 1), 10);
});

test("sloped roofs keep their slope instead of becoming a block of the ridge height", () => {
  const field = createHeightField({ cellSize: 0.5 });
  // A 10 m ramp rising from y = 0 at x = 0 to y = 5 at x = 10.
  field.addTriangles([0, 0, 0, 10, 5, 0, 10, 5, 4, 0, 0, 0, 10, 5, 4, 0, 0, 4]);
  assert.ok(field.heightAt(1.2, 2) < 1);
  assert.ok(field.heightAt(8.2, 2) > 4);
  assert.ok(field.heightAt(8.2, 2) <= 5);
});

test("indexed geometry, discs, boxes and clearing all agree", () => {
  const field = createHeightField();
  field.addTriangles([0, 3, 0, 1, 3, 0, 0, 3, 1], [0, 1, 2]);
  assert.equal(field.heightAt(0.1, 0.1), 3);
  field.addDisc(20, 20, 3, 7);
  assert.equal(field.heightAt(20, 20), 7);
  assert.equal(field.heightAt(23.6, 20), 0);
  field.addBox(-10, -10, -8, -8, 4);
  assert.equal(field.heightAt(-9, -9), 4);
  field.clearRect(-11, -11, -7, -7);
  assert.equal(field.heightAt(-9, -9), 0);
  assert.equal(field.heightAt(20, 20), 7);
});

test("non-finite geometry is ignored rather than poisoning the field", () => {
  const field = createHeightField();
  field.addTriangles([0, NaN, 0, 1, 1, 0, 0, 1, 1]);
  field.addBox(0, 0, Infinity, 1, 5);
  field.addDisc(0, 0, NaN, 5);
  assert.equal(field.size, 0);
});

test("walls stop the cube and it slides along them instead of sticking", () => {
  const field = createHeightField();
  field.addTriangles(boxTriangles());
  // Approaching from +z, flying forward (towards -z) and slightly right.
  const state = createFlightState({ x: 0, y: 3, z: 8 });
  let slid = false;
  for (let i = 0; i < 120; i++) {
    stepFlight(state, { forward: 1, strafe: 0.4 }, 1 / 60, 0, undefined, field);
    const { x, z } = state.position;
    const inside = Math.abs(x) < 2 + PLAYER_RADIUS - 0.5 && Math.abs(z) < 2 + PLAYER_RADIUS - 0.5;
    assert.ok(!inside, `entered the building at ${x}, ${z}`);
    if (z < 2 + PLAYER_RADIUS + 0.6 && z > 2) slid = true;
  }
  assert.ok(slid, "the cube should have met the wall");
  // Sideways motion carried it past the corner, then forward motion resumed.
  assert.ok(state.position.x > 2 + PLAYER_RADIUS, `stuck at x=${state.position.x}`);
  assert.ok(state.position.z < -2, `never got past at z=${state.position.z}`);
});

test("roofs become the floor: the cube lands on top of a building", () => {
  const field = createHeightField();
  field.addTriangles(boxTriangles());
  const state = createFlightState({ x: 0, y: 20, z: 0 });
  fly(state, { rise: -1 }, field, 3);
  assert.ok(Math.abs(state.position.y - (10 + PLAYER_RADIUS)) < 1e-9);
  assert.equal(state.velocity.y, 0);
  assert.equal(state.grounded, true);
  // Flying off the edge drops back down to the street floor.
  fly(state, { strafe: 1, rise: -1 }, field, 3);
  assert.equal(state.position.y, 1.6);
});

test("low ledges are climbed, and a teleport inside a wall pops out on top", () => {
  const field = createHeightField();
  field.addBox(2, -5, 12, 5, 1.2);
  const state = createFlightState({ x: 0, y: 1.6, z: 0 });
  fly(state, { strafe: 1 }, field, 0.5);
  assert.ok(state.position.x > 3, "a 1.2 m step should not block the cube");
  assert.ok(state.position.y >= 1.2 + PLAYER_RADIUS);
  const inside = createFlightState({ x: 0, y: 2, z: 0 });
  const wall = createHeightField();
  wall.addTriangles(boxTriangles());
  stepFlight(inside, {}, 1 / 60, 0, undefined, wall);
  assert.equal(inside.position.y, 10 + PLAYER_RADIUS);
});

test("camera sight lines are shortened by walls and clear above them", () => {
  const field = createHeightField();
  field.addTriangles(boxTriangles());
  const target = { x: 0, y: 3, z: 8 };
  const blocked = field.clearFraction(target, { x: 0, y: 3, z: -8 });
  assert.ok(blocked > 0.25 && blocked < 0.4, `fraction ${blocked}`);
  assert.equal(field.clearFraction(target, { x: 0, y: 30, z: -8 }), 1);
  assert.equal(field.clearFraction(target, target), 1);
});

test("surfaces too low to matter are skipped, but anything reaching above stays", () => {
  const field = createHeightField({ ignoreBelow: 0.9 });
  field.addTriangles([0, 0.5, 0, 4, 0.5, 0, 0, 0.5, 4]);
  assert.equal(field.size, 0);
  field.addTriangles([0, 0.2, 0, 1, 3, 0, 0, 0.2, 1]);
  assert.ok(field.heightAt(0.6, 0.1) > 0.9);
});
