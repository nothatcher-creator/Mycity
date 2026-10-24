import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createProject0Player } from "../src/p0-player.js";

const project = {
  originalLot: 643,
  experienceVersion: "2c64b9167d50394c",
  experienceBase: "https://files.project0.city/x/643/2c64b9167d50394c/",
  title: "Meridian Ironwatch",
};
let previousWindow, previousFetch, env, controllers;

function fixture() {
  const messages = [],
    listeners = new Set(),
    storage = new Map(),
    timers = new Map();
  let nextTimer = 1;
  const frameWindow = {
    postMessage(message, target, transfers) {
      messages.push({ message, target, transfers });
    },
  };
  const iframe = {
    contentWindow: frameWindow,
    attributes: {},
    src: "",
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    removeAttribute(k) {
      delete this.attributes[k];
      if (k === "src") this.src = "";
    },
  };
  const win = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    addEventListener: (type, fn) => {
      if (type === "message") listeners.add(fn);
    },
    removeEventListener: (type, fn) => {
      if (type === "message") listeners.delete(fn);
    },
    setTimeout: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearInterval: (id) => timers.delete(id),
  };
  return {
    messages,
    listeners,
    storage,
    timers,
    iframe,
    win,
    emit(data, source = frameWindow, origin = "null") {
      for (const listener of listeners) listener({ data, source, origin });
    },
    last(type) {
      return messages
        .map((row) => row.message)
        .filter((row) => row.t === type)
        .at(-1);
    },
  };
}
beforeEach(() => {
  previousWindow = globalThis.window;
  previousFetch = globalThis.fetch;
  env = fixture();
  globalThis.window = env.win;
  controllers = [];
});
afterEach(() => {
  controllers.forEach((controller) => controller.dispose());
  globalThis.window = previousWindow;
  globalThis.fetch = previousFetch;
});
function player(options = {}) {
  const value = createProject0Player({
    iframe: env.iframe,
    project,
    ...options,
  });
  controllers.push(value);
  return value;
}

test("only a validated original Project 0 shell and experience may be loaded", () => {
  assert.throws(
    () => player({ project: { ...project, originalLot: 0 } }),
    /lot/i,
  );
  assert.throws(
    () => player({ project: { ...project, experienceVersion: "../evil" } }),
    /version/i,
  );
  assert.throws(
    () =>
      player({
        project: {
          ...project,
          experienceBase: "https://evil.example/x/643/2c64b9167d50394c/",
        },
      }),
    /base/i,
  );
  player();
  assert.equal(
    env.iframe.src,
    "https://project0.city/sandbox/shell.html?lot=643&v=2c64b9167d50394c",
  );
  assert.equal(
    env.iframe.attributes.sandbox,
    "allow-scripts allow-pointer-lock",
  );
});

test("only the trusted iframe window may initialize or signal readiness", () => {
  let ready = 0;
  player({ displayName: "Local Visitor", onReady: () => ready++ });
  env.emit({ t: "shell" }, {});
  env.emit({ t: "shell" }, env.iframe.contentWindow, "https://evil.example");
  assert.equal(env.messages.length, 0);
  env.emit({ t: "shell" });
  const init = env.last("init");
  assert.equal(init.exp.entry, project.experienceBase + "bundle.js");
  assert.equal(init.exp.base, project.experienceBase);
  assert.equal(init.me.name, "Local Visitor");
  assert.equal(typeof init.me.id, "number");
  assert.notEqual(init.me.id, 113);
  assert.equal(init.room.host, init.me.id);
  assert.equal(init.room.players.length, 1);
  assert.equal(init.game, null);
  assert.deepEqual(init.purchases, []);
  env.emit({ t: "started" }, {});
  assert.equal(ready, 0);
  env.emit({ t: "started" });
  assert.equal(ready, 1);
  env.emit({ t: "started" });
  assert.equal(ready, 1);
});

test("guest save data persists only in this browser and is restored on reopening", () => {
  const first = player();
  env.emit({ t: "shell" });
  env.emit({
    t: "save",
    req: 12,
    data: { level: 3, options: { sound: false } },
  });
  assert.equal(env.last("save").answer.ok, true);
  first.dispose();
  player();
  env.emit({ t: "shell" });
  assert.deepEqual(env.last("init").save, {
    level: 3,
    options: { sound: false },
  });
});

test("blocked browser storage reports an unavailable save instead of claiming durability", () => {
  env.win.localStorage.setItem = () => {
    throw new Error("blocked");
  };
  player();
  env.emit({ t: "shell" });
  env.emit({ t: "save", req: 5, data: { level: 2 } });
  assert.equal(env.last("save").answer.ok, false);
  assert.match(env.last("save").answer.reason, /storage|browser/i);
});

test("paid purchases and official rewards are explicitly unavailable in guest mode", () => {
  globalThis.fetch = () => {
    throw new Error("No platform write requests are allowed");
  };
  player();
  env.emit({ t: "shell" });
  env.emit({ t: "buy", req: 1, item: "cosmetic", price: 10 });
  assert.equal(env.last("bought").ok, false);
  assert.match(env.last("bought").reason, /original|Project 0/i);
  env.emit({ t: "gameAvatar", req: 2, id: 71 });
  assert.equal(env.last("gameAvatarDone").ok, false);
  env.emit({ t: "win" });
  assert.equal(env.last("room").e.ok, false);
  assert.equal(env.last("room").e.tokens, 0);
  env.emit({ t: "notes", req: 3, op: "write" });
  assert.equal(env.last("notes").answer.ok, false);
});

test("file fallback can fetch only the exact public experience directory", async () => {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    };
  };
  player();
  env.emit({ t: "shell" });
  env.emit({ t: "file", req: 1, url: "https://evil.example/steal" });
  env.emit({
    t: "file",
    req: 2,
    url: project.experienceBase + "../other/private.json",
  });
  assert.equal(requests.length, 0);
  assert.equal(env.last("file").bytes, null);
  env.emit({
    t: "file",
    req: 3,
    url: project.experienceBase + "assets/model.glb",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.credentials, "omit");
  assert.deepEqual([...new Uint8Array(env.last("file").bytes)], [1, 2, 3]);
});

test("solo state and scores stay local without accepting prototype keys", () => {
  player();
  env.emit({ t: "shell" });
  env.emit({ t: "set", k: "level", v: { number: 2 } });
  assert.deepEqual(env.last("room").e, {
    t: "xset",
    k: "level",
    v: { number: 2 },
    from: env.last("init").me.id,
  });
  const count = env.messages.length;
  env.emit({ t: "set", k: "__proto__", v: { polluted: true } });
  assert.equal(env.messages.length, count);
  env.emit({ t: "score", d: 44, board: "Practice" });
  const board = env.messages
    .map((row) => row.message)
    .findLast((row) => row.t === "room" && row.e.t === "xboard");
  assert.equal(board.e.top[0].score, 44);
  assert.equal(board.e.top[0].source, "mycity-local");
  assert.equal(env.last("room").e.ok, false);
});

test("disposal stops timers, detaches its listener, and releases the game iframe", () => {
  const controller = player();
  env.emit({ t: "shell" });
  assert.equal(env.listeners.size, 1);
  controller.dispose();
  assert.equal(env.listeners.size, 0);
  assert.equal(env.timers.size, 0);
  assert.equal(env.iframe.src, "");
  assert.equal(env.last("leave").t, "leave");
});
