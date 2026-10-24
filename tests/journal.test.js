import test from "node:test";
import assert from "node:assert/strict";
import { createDeviceJournal } from "../src/journal.js";

const KEY = "mycity:world-journal:v1";
const now = () => "2026-10-24T13:00:00.000Z";
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

test("device events persist across reload in newest-first order with stable IDs", () => {
  const storage = memoryStorage();
  const journal = createDeviceJournal({ storage, now });
  const first = journal.record("arrival", {
    message: "Arrived at the beacon.",
  });
  const second = journal.record("project-open", {
    message: "Opened Astraforge.",
    projectId: "astraforge",
  });
  assert.equal(journal.storageAvailable, true);
  assert.equal(first.scope, "device");
  assert.equal(first.at, now());
  assert.equal(second.message, "Opened Astraforge.");
  assert.notEqual(first.id, second.id);
  const reloaded = createDeviceJournal({ storage, now });
  assert.deepEqual(reloaded.getEvents(), [second, first]);
  assert.equal(reloaded.getEvents()[1].id, first.id);
});

test("retention caps both memory and saved events and protects returned records from mutation", () => {
  const storage = memoryStorage();
  const journal = createDeviceJournal({ storage, limit: 2, now });
  journal.record("arrival", { message: "one" });
  journal.record("district", { message: "two", location: { x: 4 } });
  journal.record("teleport", { message: "three" });
  const events = journal.getEvents();
  assert.deepEqual(
    events.map((event) => event.message),
    ["three", "two"],
  );
  assert.equal(JSON.parse(storage.getItem(KEY)).length, 2);
  events[1].details.location.x = 999;
  events.pop();
  assert.equal(journal.getEvents().length, 2);
  assert.equal(journal.getEvents()[1].details.location.x, 4);
});

test("blocked storage writes preserve a useful in-memory journal and export", () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  const journal = createDeviceJournal({ storage, now });
  const event = journal.record("submission-start", {
    message: "Started Games lot G17.",
    slotId: "games-17",
  });
  assert.equal(journal.storageAvailable, false);
  assert.deepEqual(journal.getEvents(), [event]);
  assert.deepEqual(JSON.parse(journal.serialize()), [event]);
  assert.doesNotThrow(() => journal.clear());
  assert.deepEqual(journal.getEvents(), []);
});

test("a blocked localStorage getter does not stop the world from recording events", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked getter");
    },
  });
  try {
    const journal = createDeviceJournal({ now });
    assert.equal(journal.storageAvailable, false);
    assert.doesNotThrow(() =>
      journal.record("arrival", { message: "Device-only arrival." }),
    );
    assert.equal(journal.getEvents().length, 1);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("corrupt or non-array saved data resets safely without masquerading as shared history", () => {
  for (const saved of [
    "not JSON",
    '{"scope":"global"}',
    '[{"scope":"shared","message":"bad"}]',
  ]) {
    const storage = memoryStorage({ [KEY]: saved });
    const journal = createDeviceJournal({ storage, now });
    assert.equal(journal.storageAvailable, false);
    assert.deepEqual(journal.getEvents(), []);
    assert.equal(journal.record("arrival").scope, "device");
    assert.doesNotThrow(() => JSON.parse(journal.serialize()));
  }
});

test("clear removes only this journal key and serialized data contains only real recorded events", () => {
  const storage = memoryStorage({ "some-other-app": "preserve me" });
  const journal = createDeviceJournal({ storage, now });
  const event = journal.record("district", {
    message: "Entered Art & Images.",
    district: "art",
  });
  assert.deepEqual(JSON.parse(journal.serialize()), [event]);
  journal.clear();
  assert.equal(storage.getItem(KEY), null);
  assert.equal(storage.getItem("some-other-app"), "preserve me");
  assert.deepEqual(JSON.parse(journal.serialize()), []);
});
