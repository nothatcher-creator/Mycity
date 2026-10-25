const finite = (value, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const axis = (value) => Math.max(-1, Math.min(1, finite(value)));

/** Coordinates are plain objects so physics can be tested without WebGL. */
export function createFlightState(position = { x: 0, y: 2.2, z: 22 }) {
  return {
    position: {
      x: finite(position?.x),
      y: finite(position?.y, 2.2),
      z: finite(position?.z, 22),
    },
    velocity: { x: 0, y: 0, z: 0 },
    heading: 0,
    grounded: false,
  };
}

/** Half the cube's width; the collision footprint matches what you see. */
export const PLAYER_RADIUS = 0.7;
// Ledges lower than this are climbed automatically instead of stopping the cube.
const STEP_HEIGHT = 0.5;

/**
 * Mutate the shared state with camera-relative, speed-normalized flight.
 * `obstacles` is an optional height field (see collision.js): walls block each
 * horizontal axis separately, so the cube slides along them, and the tallest
 * surface underneath becomes the floor, so roofs can be landed on.
 */
export function stepFlight(state, input, dt, cameraYaw, bounds = {}, obstacles = null) {
  if (typeof dt !== "number" || !Number.isFinite(dt) || dt <= 0) return state;
  const elapsed = Math.min(dt, 0.05);
  const commands = input || {};
  let forward = axis(commands.forward);
  let strafe = axis(commands.strafe);
  let rise = axis(commands.rise);
  const length = Math.hypot(forward, strafe, rise);
  if (length > 1) {
    forward /= length;
    strafe /= length;
    rise /= length;
  }
  const yaw = finite(cameraYaw);
  const speed = commands.boost === true ? 42 : 20;
  const sin = Math.sin(yaw),
    cos = Math.cos(yaw);
  const target = {
    x: (strafe * cos - forward * sin) * speed,
    y: rise * speed,
    z: (-forward * cos - strafe * sin) * speed,
  };
  const blend = 1 - Math.exp(-9 * elapsed);
  for (const coordinate of ["x", "y", "z"]) {
    state.velocity[coordinate] = finite(state.velocity[coordinate]);
    state.position[coordinate] = finite(state.position[coordinate]);
    state.velocity[coordinate] +=
      (target[coordinate] - state.velocity[coordinate]) * blend;
  }
  const solid = typeof obstacles?.maxHeightIn === "function" ? obstacles : null;
  const r = PLAYER_RADIUS;
  const surfaceAt = (x, z) => finite(solid.maxHeightIn(x - r, z - r, x + r, z + r));
  for (const coordinate of ["x", "z"]) {
    const next = state.position[coordinate] + state.velocity[coordinate] * elapsed;
    const x = coordinate === "x" ? next : state.position.x;
    const z = coordinate === "z" ? next : state.position.z;
    if (solid && surfaceAt(x, z) > state.position.y - r + STEP_HEIGHT) {
      state.velocity[coordinate] = 0;
    } else state.position[coordinate] = next;
  }
  state.position.y += state.velocity.y * elapsed;

  const safeBounds = bounds || {};
  const radius = Math.max(1, finite(safeBounds.radius, 320));
  const ceiling = finite(safeBounds.ceiling, 55);
  const distance = Math.hypot(state.position.x, state.position.z);
  if (distance > radius) {
    const nx = state.position.x / distance,
      nz = state.position.z / distance;
    state.position.x = nx * radius;
    state.position.z = nz * radius;
    // Remove outward speed while keeping tangential movement along the edge.
    const outward = state.velocity.x * nx + state.velocity.z * nz;
    if (outward > 0) {
      state.velocity.x -= nx * outward;
      state.velocity.z -= nz * outward;
    }
  }
  // Roofs and ledges raise the floor; a teleport into a wall pops out on top.
  const floor = Math.max(
    finite(safeBounds.floor, 1.6),
    solid ? surfaceAt(state.position.x, state.position.z) + r : -Infinity,
  );
  state.grounded = state.position.y <= floor;
  if (state.position.y <= floor) {
    state.position.y = floor;
    state.velocity.y = Math.max(0, state.velocity.y);
  } else if (state.position.y >= Math.max(floor, ceiling)) {
    state.position.y = Math.max(floor, ceiling);
    state.velocity.y = Math.min(0, state.velocity.y);
  }
  if (Math.hypot(state.velocity.x, state.velocity.z) > 0.05) {
    state.heading = Math.atan2(state.velocity.x, state.velocity.z);
  }
  return state;
}

const CODE_ACTIONS = new Map([
  ["KeyW", "forward"],
  ["ArrowUp", "forward"],
  ["KeyS", "back"],
  ["ArrowDown", "back"],
  ["KeyA", "left"],
  ["ArrowLeft", "left"],
  ["KeyD", "right"],
  ["ArrowRight", "right"],
  ["Space", "up"],
  ["KeyC", "down"],
  ["ShiftLeft", "boost"],
  ["ShiftRight", "boost"],
  ["KeyE", "interact"],
]);
const KEY_CODES = {
  w: "KeyW",
  a: "KeyA",
  s: "KeyS",
  d: "KeyD",
  c: "KeyC",
  e: "KeyE",
  " ": "Space",
  Shift: "ShiftLeft",
};

function isEditing(target) {
  return Boolean(
    target &&
      (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "SUMMARY"].includes(
        target.tagName,
      ) ||
        target.isContentEditable ||
        target.closest?.('[contenteditable="true"]')),
  );
}

/**
 * DOM bindings keep each touch pointer independent. The stick should be placed
 * at left:50%; top:50%; this module adds its centered movement transform.
 */
export function createFlightInput({
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
  onInteract,
}) {
  const document = canvas?.ownerDocument || globalThis.document;
  const window = document?.defaultView || globalThis.window;
  const listeners = [];
  const keys = new Set();
  const rising = new Set(),
    falling = new Set(),
    boosting = new Set(),
    forwardTouches = new Set(),
    backTouches = new Set(),
    leftTouches = new Set(),
    rightTouches = new Set();
  const pointerOwners = new Map();
  let enabled = true,
    disposed = false;
  let stickPointer = null;
  let stickForward = 0,
    stickStrafe = 0;

  function listen(target, type, handler, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  function capture(element, pointerId) {
    pointerOwners.set(pointerId, element);
    try {
      element.setPointerCapture?.(pointerId);
    } catch {
      /* Pointer already ended. */
    }
  }
  function release(pointerId) {
    const element = pointerOwners.get(pointerId);
    pointerOwners.delete(pointerId);
    try {
      if (element?.hasPointerCapture?.(pointerId))
        element.releasePointerCapture(pointerId);
    } catch {
      /* Browsers release cancelled touches automatically. */
    }
  }
  function resetStick() {
    stickPointer = null;
    stickForward = 0;
    stickStrafe = 0;
    if (stick?.style) stick.style.transform = "translate(-50%, -50%)";
  }
  function clear() {
    keys.clear();
    rising.clear();
    falling.clear();
    boosting.clear();
    forwardTouches.clear();
    backTouches.clear();
    leftTouches.clear();
    rightTouches.clear();
    resetStick();
    for (const pointerId of [...pointerOwners.keys()]) release(pointerId);
  }
  function code(event) {
    return event.code || KEY_CODES[event.key] || event.key;
  }
  function keydown(event) {
    if (
      !enabled ||
      disposed ||
      event.defaultPrevented ||
      document?.hidden ||
      isEditing(event.target) ||
      isEditing(document?.activeElement)
    )
      return;
    const value = code(event),
      action = CODE_ACTIONS.get(value);
    if (!action) return;
    event.preventDefault();
    if (action === "interact") {
      if (!event.repeat) onInteract?.();
    } else keys.add(value);
  }
  function keyup(event) {
    keys.delete(code(event));
  }
  function focusin(event) {
    if (isEditing(event.target)) clear();
  }
  function visibility() {
    if (document?.hidden) clear();
  }
  listen(window, "keydown", keydown);
  listen(window, "keyup", keyup);
  listen(window, "blur", clear);
  listen(document, "focusin", focusin);
  listen(document, "visibilitychange", visibility);

  function stop(event) {
    event.preventDefault();
    event.stopPropagation();
  }
  function moveStick(event) {
    if (event.pointerId !== stickPointer) return;
    stop(event);
    const rect = joystick.getBoundingClientRect();
    const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.4);
    const dx = finite(event.clientX) - (rect.left + rect.width / 2);
    const dy = finite(event.clientY) - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy);
    const clamped = Math.min(1, distance / radius);
    const magnitude = clamped <= 0.12 ? 0 : (clamped - 0.12) / 0.88;
    stickStrafe = distance > 0 ? (dx / distance) * magnitude : 0;
    stickForward = distance > 0 ? (-dy / distance) * magnitude : 0;
    const drawScale = distance > radius ? radius / distance : 1;
    if (stick?.style) {
      stick.style.transform = `translate(-50%, -50%) translate(${dx * drawScale}px, ${dy * drawScale}px)`;
    }
  }
  function stickDown(event) {
    if (
      !enabled ||
      disposed ||
      (event.pointerType !== "touch" &&
        event.button !== undefined &&
        event.button !== 0)
    )
      return;
    stop(event);
    if (stickPointer !== null) return;
    stickPointer = event.pointerId;
    capture(joystick, stickPointer);
    moveStick(event);
  }
  function stickEnd(event) {
    if (event.pointerId !== stickPointer) return;
    stop(event);
    resetStick();
    release(event.pointerId);
  }
  listen(joystick, "pointerdown", stickDown, { passive: false });
  listen(joystick, "pointermove", moveStick, { passive: false });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    listen(joystick, type, stickEnd, { passive: false });
  }

  function touchButton(element, held) {
    const down = (event) => {
      if (
        !enabled ||
        disposed ||
        (event.pointerType !== "touch" &&
          event.button !== undefined &&
          event.button !== 0)
      )
        return;
      stop(event);
      held.add(event.pointerId);
      capture(element, event.pointerId);
    };
    const up = (event) => {
      if (!held.has(event.pointerId)) return;
      stop(event);
      held.delete(event.pointerId);
      release(event.pointerId);
    };
    listen(element, "pointerdown", down, { passive: false });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      listen(element, type, up, { passive: false });
    }
  }
  touchButton(upButton, rising);
  touchButton(downButton, falling);
  touchButton(boostButton, boosting);
  touchButton(forwardButton, forwardTouches);
  touchButton(backButton, backTouches);
  touchButton(leftButton, leftTouches);
  touchButton(rightButton, rightTouches);

  function held(action) {
    return [...keys].some((value) => CODE_ACTIONS.get(value) === action)
      ? 1
      : 0;
  }
  return {
    getState() {
      if (!enabled || disposed)
        return { forward: 0, strafe: 0, rise: 0, boost: false };
      return {
        forward: axis(
          held("forward") -
            held("back") +
            stickForward +
            (forwardTouches.size ? 1 : 0) -
            (backTouches.size ? 1 : 0),
        ),
        strafe: axis(
          held("right") -
            held("left") +
            stickStrafe +
            (rightTouches.size ? 1 : 0) -
            (leftTouches.size ? 1 : 0),
        ),
        rise: axis(
          held("up") -
            held("down") +
            (rising.size ? 1 : 0) -
            (falling.size ? 1 : 0),
        ),
        boost: held("boost") === 1 || boosting.size > 0,
      };
    },
    setEnabled(value) {
      enabled = Boolean(value) && !disposed;
      if (!enabled) clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      listeners.forEach((remove) => remove());
      clear();
    },
  };
}
