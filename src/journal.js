const STORAGE_KEY = "mycity:world-journal:v1";

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function eventDetails(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const seen = new WeakSet();
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, item) => {
        if (typeof item === "bigint") return item.toString();
        if (item && typeof item === "object") {
          if (seen.has(item)) return "[Circular]";
          seen.add(item);
        }
        return item;
      }),
    );
  } catch {
    return {};
  }
}

function validEvents(value) {
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  return value.every((event) => {
    if (
      !event ||
      typeof event !== "object" ||
      event.scope !== "device" ||
      typeof event.id !== "string" ||
      !event.id ||
      ids.has(event.id) ||
      typeof event.type !== "string" ||
      !event.type ||
      typeof event.at !== "string" ||
      !Number.isFinite(Date.parse(event.at)) ||
      typeof event.message !== "string" ||
      !event.details ||
      typeof event.details !== "object" ||
      Array.isArray(event.details)
    )
      return false;
    ids.add(event.id);
    return true;
  });
}

function defaultMessage(type, details) {
  switch (type) {
    case "arrival":
      return "Arrived in Mycity.";
    case "district":
      return `Entered ${details.district || "a neighborhood"}.`;
    case "teleport":
      return `Traveled to ${details.destination || details.district || details.slotId || "a city destination"}.`;
    case "project-open":
      return `Opened ${details.title || details.project || "a project"}.`;
    case "submission-start":
      return `Started a lot submission${details.slotId ? ` for ${details.slotId}` : ""}.`;
    default:
      return "World activity recorded on this device.";
  }
}

/** Browser-local history only. Shared publication history has a separate source. */
export function createDeviceJournal({
  storage,
  limit = 120,
  now = () => new Date().toISOString(),
} = {}) {
  const retention =
    Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 1000) : 120;
  let events = [];
  let available = false;
  let sequence = 0;
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  }
  if (
    storage &&
    typeof storage.getItem === "function" &&
    typeof storage.setItem === "function" &&
    typeof storage.removeItem === "function"
  ) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw !== null) {
        if (typeof raw !== "string") throw new Error("Invalid journal storage");
        const parsed = JSON.parse(raw);
        if (!validEvents(parsed)) throw new Error("Invalid device journal");
        events = parsed.slice(0, retention);
      }
      available = true;
    } catch {
      events = [];
    }
  }

  function save() {
    if (!storage || typeof storage.setItem !== "function") return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch {
      available = false;
    }
  }

  function nextId() {
    let id;
    try {
      id = globalThis.crypto?.randomUUID?.();
    } catch {
      /* Use local fallback. */
    }
    if (!id || events.some((event) => event.id === id)) {
      id = `device-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
    return id;
  }

  return {
    get storageAvailable() {
      return available;
    },
    getEvents() {
      return copy(events);
    },
    record(type, details = {}) {
      const clean = eventDetails(details);
      const eventType =
        typeof type === "string" && type.trim() ? type.trim() : "activity";
      let at;
      try {
        at = now();
      } catch {
        at = null;
      }
      if (typeof at !== "string" || !Number.isFinite(Date.parse(at)))
        at = new Date().toISOString();
      const event = {
        id: nextId(),
        scope: "device",
        type: eventType,
        at,
        message:
          typeof clean.message === "string" && clean.message.trim()
            ? clean.message
            : defaultMessage(eventType, clean),
        details: clean,
      };
      events.unshift(event);
      events = events.slice(0, retention);
      save();
      return copy(event);
    },
    clear() {
      events = [];
      if (!storage || typeof storage.removeItem !== "function") return;
      try {
        storage.removeItem(STORAGE_KEY);
      } catch {
        available = false;
      }
    },
    serialize() {
      return JSON.stringify(events, null, 2);
    },
  };
}
