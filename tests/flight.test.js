import test from "node:test";
import assert from "node:assert/strict";
import {
  createFlightState,
  stepFlight,
  createFlightInput,
} from "../src/flight.js";

function travel(input, yaw = 0, seconds = 1) {
  const state = createFlightState({ x: 0, y: 20, z: 0 });
  for (let i = 0; i < seconds * 60; i++) {
    stepFlight(state, input, 1 / 60, yaw);
  }
  return state;
}

test("camera-relative W and D follow the view rather than world axes", () => {
  const forward = travel({ forward: 1 });
  assert.ok(forward.position.z < -15);
  assert.equal(forward.position.x, 0);
  const right = travel({ strafe: 1 });
  assert.ok(right.position.x > 15);
  assert.equal(right.position.z, 0);
  const turned = travel({ forward: 1 }, Math.PI / 2);
  assert.ok(turned.position.x < -15);
  assert.ok(Math.abs(turned.position.z) < 1e-10);
});

test("diagonal movement has the same total speed, including vertical flight", () => {
  const straight = travel({ forward: 1 });
  const diagonal = travel({ forward: 1, strafe: 1, rise: 1 });
  const length = (state) =>
    Math.hypot(state.position.x, state.position.y - 20, state.position.z);
  assert.ok(Math.abs(length(straight) - length(diagonal)) < 1e-10);
  assert.ok(diagonal.position.y > 20);
});

test("boost increases speed while idle input smoothly brakes", () => {
  const normal = travel({ forward: 1 });
  const boosted = travel({ forward: 1, boost: true });
  assert.ok(Math.abs(boosted.position.z) > Math.abs(normal.position.z) * 2);
  const oldVelocity = Math.abs(normal.velocity.z);
  stepFlight(normal, {}, 0.05, 0);
  assert.ok(Math.abs(normal.velocity.z) < oldVelocity);
  assert.ok(Math.abs(normal.velocity.z) > 0);
});

test("floor, ceiling and circular city edge keep the cube in bounds", () => {
  const state = createFlightState({ x: 319.9, y: 54.9, z: 0 });
  for (let i = 0; i < 180; i++) {
    stepFlight(state, { strafe: 1, rise: 1 }, 1 / 60, 0);
  }
  assert.ok(Math.hypot(state.position.x, state.position.z) <= 320 + 1e-10);
  assert.equal(state.position.y, 55);
  assert.equal(state.velocity.y, 0);
  for (let i = 0; i < 600; i++) {
    stepFlight(state, { rise: -1 }, 1 / 60, 0);
  }
  assert.equal(state.position.y, 1.6);
  assert.equal(state.velocity.y, 0);
});

test("a suspended tab cannot cause a large movement jump", () => {
  const short = createFlightState();
  const suspended = createFlightState();
  stepFlight(short, { forward: 1 }, 0.05, 0);
  stepFlight(suspended, { forward: 1 }, 60, 0);
  assert.deepEqual(suspended, short);
  const before = structuredClone(short);
  for (const dt of [0, -1, NaN, Infinity, undefined]) {
    assert.equal(stepFlight(short, { forward: 1 }, dt, 0), short);
    assert.deepEqual(short, before);
  }
});

test("malformed input cannot poison flight coordinates", () => {
  const state = createFlightState();
  stepFlight(state, { forward: NaN, strafe: Infinity, rise: "up" }, 0.05, NaN);
  for (const value of [
    ...Object.values(state.position),
    ...Object.values(state.velocity),
    state.heading,
  ]) {
    assert.ok(Number.isFinite(value));
  }
  assert.deepEqual(state.position, { x: 0, y: 2.2, z: 22 });
  const huge = travel({ forward: 500 });
  const normal = travel({ forward: 1 });
  assert.deepEqual(huge, normal);
});

class TestTarget extends EventTarget {
  constructor(rect = { left: 0, top: 0, width: 120, height: 120 }) {
    super();
    this.rect = rect;
    this.style = {};
    this.captures = new Set();
  }
  getBoundingClientRect() {
    return this.rect;
  }
  setPointerCapture(id) {
    this.captures.add(id);
  }
  hasPointerCapture(id) {
    return this.captures.has(id);
  }
  releasePointerCapture(id) {
    this.captures.delete(id);
  }
}

function event(type, properties = {}) {
  const value = new Event(type, { cancelable: true });
  for (const [key, item] of Object.entries(properties)) {
    Object.defineProperty(value, key, { value: item });
  }
  return value;
}

function inputFixture() {
  const window = new TestTarget();
  const document = new TestTarget();
  document.defaultView = window;
  document.hidden = false;
  const canvas = new TestTarget();
  canvas.ownerDocument = document;
  const joystick = new TestTarget(),
    stick = new TestTarget();
  const upButton = new TestTarget(),
    downButton = new TestTarget(),
    boostButton = new TestTarget();
  const forwardButton = new TestTarget(),
    backButton = new TestTarget(),
    leftButton = new TestTarget(),
    rightButton = new TestTarget();
  let interactions = 0;
  const controls = createFlightInput({
    canvas,
    joystick,
    stick,
    upButton,
    downButton,
    boostButton,
    forwardButton,
    backButton,
    leftButton,
    rightButton,
    onInteract: () => interactions++,
  });
  return {
    window,
    document,
    canvas,
    joystick,
    stick,
    upButton,
    downButton,
    boostButton,
    forwardButton,
    backButton,
    leftButton,
    rightButton,
    controls,
    interactions: () => interactions,
  };
}

test("directional touch buttons move independently alongside altitude and boost", () => {
  const f = inputFixture();
  f.forwardButton.dispatchEvent(
    event("pointerdown", { pointerId: 11, button: 0 }),
  );
  f.rightButton.dispatchEvent(
    event("pointerdown", { pointerId: 12, button: 0 }),
  );
  f.upButton.dispatchEvent(event("pointerdown", { pointerId: 13, button: 0 }));
  f.boostButton.dispatchEvent(
    event("pointerdown", { pointerId: 14, button: 0 }),
  );
  assert.deepEqual(f.controls.getState(), {
    forward: 1,
    strafe: 1,
    rise: 1,
    boost: true,
  });
  f.forwardButton.dispatchEvent(event("pointerup", { pointerId: 11 }));
  assert.deepEqual(f.controls.getState(), {
    forward: 0,
    strafe: 1,
    rise: 1,
    boost: true,
  });
  f.controls.setEnabled(false);
  assert.deepEqual(f.controls.getState(), {
    forward: 0,
    strafe: 0,
    rise: 0,
    boost: false,
  });
  assert.equal(f.rightButton.captures.size, 0);
  f.controls.dispose();
});

test("joystick, altitude and boost can be held by separate touch inputs", () => {
  const f = inputFixture();
  f.joystick.dispatchEvent(
    event("pointerdown", { pointerId: 1, clientX: 60, clientY: 12, button: 0 }),
  );
  f.upButton.dispatchEvent(event("pointerdown", { pointerId: 2, button: 0 }));
  f.boostButton.dispatchEvent(
    event("pointerdown", { pointerId: 3, button: 0 }),
  );
  assert.ok(f.controls.getState().forward > 0.8);
  assert.equal(f.controls.getState().rise, 1);
  assert.equal(f.controls.getState().boost, true);
  f.upButton.dispatchEvent(event("pointerup", { pointerId: 2 }));
  assert.equal(f.controls.getState().rise, 0);
  assert.ok(f.controls.getState().forward > 0.8);
  assert.equal(f.controls.getState().boost, true);
  f.joystick.dispatchEvent(event("pointercancel", { pointerId: 1 }));
  assert.equal(f.controls.getState().forward, 0);
  assert.equal(f.controls.getState().boost, true);
  f.controls.dispose();
});

test("keyboard ignores form typing, interaction repeats and disabled controls", () => {
  const f = inputFixture();
  f.window.dispatchEvent(event("keydown", { code: "KeyW" }));
  assert.equal(f.controls.getState().forward, 1);
  f.window.dispatchEvent(event("keydown", { code: "KeyE" }));
  f.window.dispatchEvent(event("keydown", { code: "KeyE", repeat: true }));
  assert.equal(f.interactions(), 1);
  f.document.activeElement = { tagName: "TEXTAREA" };
  f.document.dispatchEvent(
    event("focusin", { target: f.document.activeElement }),
  );
  assert.equal(f.controls.getState().forward, 0);
  f.window.dispatchEvent(event("keydown", { code: "KeyW" }));
  assert.equal(f.controls.getState().forward, 0);
  f.document.activeElement = null;
  f.controls.setEnabled(false);
  f.window.dispatchEvent(event("keydown", { code: "KeyW" }));
  f.window.dispatchEvent(event("keydown", { code: "KeyE" }));
  assert.equal(f.controls.getState().forward, 0);
  assert.equal(f.interactions(), 1);
  f.controls.dispose();
});
test("focused buttons and links keep Space and Enter for native activation", () => {
  const f = inputFixture();
  for (const tagName of ["BUTTON", "A", "SUMMARY"]) {
    f.document.activeElement = { tagName };
    const press = event("keydown", {
      code: "Space",
      target: f.document.activeElement,
    });
    f.window.dispatchEvent(press);
    assert.equal(f.controls.getState().rise, 0);
    assert.equal(press.defaultPrevented, false);
  }
  f.controls.dispose();
});

test("blur, disabling and disposal release held movement and pointer capture", () => {
  const f = inputFixture();
  f.window.dispatchEvent(event("keydown", { code: "Space" }));
  f.downButton.dispatchEvent(event("pointerdown", { pointerId: 7, button: 0 }));
  f.boostButton.dispatchEvent(
    event("pointerdown", { pointerId: 8, button: 0 }),
  );
  f.window.dispatchEvent(event("blur"));
  assert.deepEqual(f.controls.getState(), {
    forward: 0,
    strafe: 0,
    rise: 0,
    boost: false,
  });
  assert.equal(f.downButton.captures.size, 0);
  assert.equal(f.boostButton.captures.size, 0);
  f.window.dispatchEvent(event("keydown", { code: "KeyW" }));
  f.controls.setEnabled(false);
  assert.equal(f.controls.getState().forward, 0);
  f.controls.setEnabled(true);
  f.controls.dispose();
  f.window.dispatchEvent(event("keydown", { code: "KeyW" }));
  assert.equal(f.controls.getState().forward, 0);
});
