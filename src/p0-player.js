const PLATFORM = "https://project0.city";
const UNAVAILABLE =
  "This requires the original Project 0 lot. Mycity guest play does not award Project 0 currency or items.";
const MAX_JSON_BYTES = 16384;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function plainCopy(value, maxBytes = MAX_JSON_BYTES) {
  const text = JSON.stringify(value ?? null);
  if (new TextEncoder().encode(text).length > maxBytes)
    throw new Error("Local save is too large");
  return JSON.parse(text);
}

function dimensions(project) {
  const supplied = project.originalLotDimensions || project.lotDimensions || {};
  const hall = [987, 1003, 1043, 1099, 1123].includes(project.originalLot);
  const valid = (number, fallback) =>
    Number.isFinite(number) && number > 0 && number <= 500 ? number : fallback;
  return {
    width: valid(supplied.width, 12),
    depth: valid(supplied.depth, hall ? 19 : 12),
    height: valid(supplied.height, hall ? 12 : 19),
  };
}

/**
 * Runs an owner's public Project 0 experience in its official sandbox/runtime.
 * This is a solo guest host: local progress is browser-only, and no authenticated
 * Project 0 API, currency, purchase, inventory, or shared-session endpoint is used.
 */
export function createProject0Player({
  iframe,
  project,
  displayName = "Guest",
  onReady,
  onError,
  onStatus,
  onExit,
}) {
  const lot = project?.originalLot;
  if (!Number.isSafeInteger(lot) || lot < 1)
    throw new Error("Invalid original Project 0 lot");
  const version = project.experienceVersion;
  if (typeof version !== "string" || !/^[a-f0-9]{8,64}$/.test(version))
    throw new Error("Invalid Project 0 experience version");
  const expectedBase = `https://files.project0.city/x/${lot}/${version}/`;
  if (project.experienceBase && project.experienceBase !== expectedBase)
    throw new Error("Invalid public Project 0 experience base");
  if (!iframe?.contentWindow || typeof iframe.setAttribute !== "function")
    throw new Error("A game iframe is required");
  const hostWindow = window;
  const base = expectedBase;
  const recordKey = `mycity.p0.local.${lot}.v1`;
  const abort = new AbortController();
  let disposed = false,
    initialized = false,
    started = false,
    won = false,
    tick = 0,
    latestInput = null;
  let interval = null,
    timeout = null;
  let record = { save: null, boards: {}, wins: 0 };
  const status = (text) => {
    if (!disposed) onStatus?.(String(text).slice(0, 500));
  };
  const post = (message, transfers) => {
    if (!disposed)
      iframe.contentWindow?.postMessage(message, "*", transfers || []);
  };
  function read(key) {
    try {
      return JSON.parse(hostWindow.localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }
  function persist() {
    try {
      hostWindow.localStorage.setItem(recordKey, JSON.stringify(record));
      return true;
    } catch {
      return false;
    }
  }
  const previous = read(recordKey);
  if (previous && typeof previous === "object" && !Array.isArray(previous)) {
    try {
      record.save = plainCopy(previous.save);
      if (
        previous.boards &&
        typeof previous.boards === "object" &&
        !Array.isArray(previous.boards)
      )
        record.boards = plainCopy(previous.boards);
      if (Number.isSafeInteger(previous.wins) && previous.wins >= 0)
        record.wins = previous.wins;
    } catch {
      /* A malformed old record cannot prevent playing. */
    }
  }
  let guestId = read("mycity.p0.guest-id");
  if (!Number.isSafeInteger(guestId) || guestId < 1000000000) {
    guestId = 1000000000 + Math.floor(Math.random() * 1000000000);
    try {
      hostWindow.localStorage.setItem(
        "mycity.p0.guest-id",
        JSON.stringify(guestId),
      );
    } catch {
      /* Guest play remains available without storage. */
    }
  }
  const name =
    typeof displayName === "string" && displayName.trim()
      ? displayName.trim().slice(0, 40)
      : "Guest";
  const me = {
    id: guestId,
    name,
    color: "#b0e2d1",
    avatar: null,
    position: [0, 1, 0],
  };
  const size = dimensions(project);
  const roomId = `mycity-${lot}-${Date.now().toString(36)}`;
  const roomState = Object.create(null);
  const seed = (Date.now() ^ guestId ^ lot) >>> 0;
  function room(event) {
    post({ t: "room", e: event });
  }
  function fail(reason) {
    if (disposed) return;
    hostWindow.clearTimeout(timeout);
    hostWindow.clearInterval(interval);
    timeout = interval = null;
    onError?.(new Error(String(reason).slice(0, 500)));
  }
  function init() {
    if (initialized || disposed) return;
    initialized = true;
    const boards = Object.create(null);
    for (const [key, board] of Object.entries(record.boards)) {
      if (!FORBIDDEN_KEYS.has(key) && Array.isArray(board?.top))
        boards[key] = board.top.slice(0, 10);
    }
    post({
      t: "init",
      lot: {
        id: lot,
        ...size,
        size: Math.max(size.width, size.depth),
        name: project.title || `Lot ${lot}`,
      },
      me,
      room: {
        id: roomId,
        seed,
        tick: 0,
        host: guestId,
        players: [me],
        state: {},
      },
      exp: { base, entry: base + "bundle.js", own: false },
      camera: [0, 4, 8],
      volume: 0.7,
      game: null,
      table: boards.main || [],
      boards,
      entityKind: null,
      purchases: [],
      avatars: [],
      pets: [],
      invitation: null,
      save: record.save,
      items: [],
    });
    status(
      "Starting the original game · solo guest mode · progress stays on this device",
    );
    interval = hostWindow.setInterval(() => {
      if (disposed || !started) return;
      room({
        t: "xtick",
        n: ++tick,
        in: latestInput === null ? {} : { [guestId]: latestInput },
      });
    }, 50);
  }
  async function file(message) {
    if (!Number.isSafeInteger(message.req)) return;
    let url;
    try {
      url = new URL(message.url);
    } catch {
      post({ t: "file", req: message.req, bytes: null });
      return;
    }
    if (
      !url.href.startsWith(base) ||
      url.username ||
      url.password ||
      url.hash
    ) {
      post({ t: "file", req: message.req, bytes: null });
      return;
    }
    try {
      const response = await fetch(url.href, {
        credentials: "omit",
        mode: "cors",
        signal: abort.signal,
      });
      const bytes = response.ok ? await response.arrayBuffer() : null;
      post({ t: "file", req: message.req, bytes }, bytes ? [bytes] : []);
    } catch {
      post({ t: "file", req: message.req, bytes: null });
    }
  }
  function localScore(message) {
    if (!Number.isFinite(message.d) || Math.abs(message.d) > 1e12) return;
    const key =
      typeof message.board === "string" && message.board.trim()
        ? message.board.trim().slice(0, 24)
        : "main";
    if (FORBIDDEN_KEYS.has(key)) return;
    if (
      !Object.hasOwn(record.boards, key) &&
      Object.keys(record.boards).length >= 12
    )
      return;
    const previous = record.boards[key];
    const low = previous?.low ?? message.low === true;
    const best = previous?.top?.[0]?.score;
    if (!Number.isFinite(best) || (low ? message.d < best : message.d > best)) {
      record.boards[key] = {
        low,
        top: [
          {
            uid: guestId,
            name,
            score: message.d,
            you: true,
            owner: false,
            source: "mycity-local",
          },
        ],
      };
      persist();
    }
    const top = record.boards[key]?.top || [];
    room(
      key === "main" ? { t: "xtable", top } : { t: "xboard", board: key, top },
    );
    room({
      t: "xreward",
      kind: "score",
      ok: false,
      tokens: 0,
      score: message.d,
      best: top[0]?.score ?? message.d,
      reason:
        "Saved on this device only; official Project 0 weekly boards are unavailable here.",
    });
    status(
      "Score recorded locally · open the original lot for official Project 0 boards and rewards",
    );
  }
  function onMessage(event) {
    if (
      disposed ||
      event.source !== iframe.contentWindow ||
      !["null", PLATFORM].includes(event.origin)
    )
      return;
    const message = event.data;
    if (
      !message ||
      typeof message !== "object" ||
      typeof message.t !== "string"
    )
      return;
    if (message.t === "shell") {
      init();
      return;
    }
    if (!initialized) return;
    switch (message.t) {
      case "started":
        if (started) return;
        started = true;
        hostWindow.clearTimeout(timeout);
        timeout = null;
        status(
          "Solo guest mode · browser-local progress · official rewards and multiplayer are available on the original lot",
        );
        onReady?.({ lot, mode: "guest" });
        return;
      case "loading":
        if (!started)
          status(
            `Loading original game${Number.isFinite(message.fraction) ? ` · ${Math.round(Math.max(0, Math.min(1, message.fraction)) * 100)}%` : ""} · guest mode`,
          );
        return;
      case "file":
        void file(message);
        return;
      case "avatar":
        post({ t: "avatar", req: message.req, bytes: null });
        return;
      case "entities":
        post({
          t: "entities",
          req: message.req,
          answer: {
            entities: [],
            canLike: false,
            reason:
              "The community gallery requires the original Project 0 lot.",
          },
        });
        return;
      case "like":
        post({
          t: "like",
          req: message.req,
          answer: { ok: false, reason: UNAVAILABLE },
        });
        return;
      case "save": {
        if (!Number.isSafeInteger(message.req)) return;
        try {
          record.save = plainCopy(message.data);
          const ok = persist();
          post({
            t: "save",
            req: message.req,
            answer: {
              ok,
              reason: ok
                ? "Saved in this browser only"
                : "Browser storage is unavailable; this save lasts only for this visit",
            },
          });
        } catch (error) {
          post({
            t: "save",
            req: message.req,
            answer: { ok: false, reason: error.message },
          });
        }
        return;
      }
      case "notes":
        post({
          t: "notes",
          req: message.req,
          answer:
            message.op === "list"
              ? { notes: [], more: false, canWrite: false, reason: UNAVAILABLE }
              : { ok: false, reason: UNAVAILABLE },
        });
        return;
      case "buy":
        post({ t: "bought", req: message.req, ok: false, reason: UNAVAILABLE });
        status(UNAVAILABLE);
        return;
      case "gameAvatar":
        post({
          t: "gameAvatarDone",
          req: message.req,
          ok: false,
          reason: UNAVAILABLE,
        });
        status(UNAVAILABLE);
        return;
      case "gamePet":
        post({
          t: "gamePetDone",
          req: message.req,
          ok: false,
          reason: UNAVAILABLE,
        });
        status(UNAVAILABLE);
        return;
      case "set":
        if (
          typeof message.k !== "string" ||
          !message.k ||
          message.k.length > 64 ||
          FORBIDDEN_KEYS.has(message.k)
        )
          return;
        try {
          const value = plainCopy(message.v, 2048);
          if (value === null) delete roomState[message.k];
          else roomState[message.k] = value;
          room({ t: "xset", k: message.k, v: value, from: guestId });
        } catch {
          /* Invalid local state is ignored. */
        }
        return;
      case "send":
        if (message.to !== undefined && message.to !== guestId) return;
        try {
          room({ t: "xmsg", d: plainCopy(message.d, 1024), from: guestId });
        } catch {
          /* Not a plain bounded message. */
        }
        return;
      case "input":
        try {
          latestInput = plainCopy(message.d, 256);
        } catch {
          latestInput = null;
        }
        return;
      case "score":
        localScore(message);
        return;
      case "win":
        if (!won) {
          won = true;
          record.wins++;
          persist();
        }
        room({
          t: "xreward",
          kind: "win",
          ok: false,
          tokens: 0,
          reason: UNAVAILABLE,
        });
        status(
          "Victory recorded on this device. Official Project 0 awards require the original lot.",
        );
        return;
      case "prize":
      case "give":
        room({
          t: "xreward",
          kind: message.t === "give" ? "item" : "prize",
          ok: false,
          tokens: 0,
          reason: UNAVAILABLE,
        });
        status(UNAVAILABLE);
        return;
      case "inviteAsk":
      case "duel":
      case "chat":
        status(
          "Multiplayer, chat, and invitations are available on the original Project 0 lot.",
        );
        return;
      case "hud":
        if (typeof message.text === "string") status(message.text);
        return;
      case "crash":
        fail(
          message.reason ||
            "The original game could not start. Open its original Project 0 lot instead.",
        );
        return;
      case "error":
        if (typeof message.text === "string")
          status(`Game notice: ${message.text}`);
        return;
      case "violation":
        status(
          "The original game sandbox blocked an unsupported resource. The original lot remains available.",
        );
        return;
      case "slow":
        if (message.on)
          status(
            "The original game is taking longer to render on this device.",
          );
        return;
      case "exit":
      case "escape":
        onExit?.();
        return;
      default:
        return;
    }
  }
  hostWindow.addEventListener("message", onMessage);
  iframe.setAttribute("sandbox", "allow-scripts allow-pointer-lock");
  iframe.setAttribute("allow", "autoplay; fullscreen");
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.src = `${PLATFORM}/sandbox/shell.html?lot=${lot}&v=${encodeURIComponent(version)}`;
  timeout = hostWindow.setTimeout(
    () =>
      fail(
        "The original game did not finish loading. Try opening its original Project 0 lot.",
      ),
    90000,
  );
  status("Opening original Project 0 experience · solo guest mode");
  return {
    dispose() {
      if (disposed) return;
      post({ t: "leave" });
      disposed = true;
      abort.abort();
      hostWindow.clearTimeout(timeout);
      hostWindow.clearInterval(interval);
      hostWindow.removeEventListener("message", onMessage);
      iframe.removeAttribute("src");
      iframe.removeAttribute("sandbox");
    },
  };
}
