import "./style.css";
import { validateCatalog, filterProjects, safeProjectUrl } from "./catalog.js";
import { buildCityLots, validateCity } from "./city-layout.js";
import { createFlightInput } from "./flight.js";
import { createDeviceJournal } from "./journal.js";
import { buildContributionUrl } from "./community.js";

const $ = (id) => document.getElementById(id);
const journal = createDeviceJournal();
let projects = [],
  city,
  lots = [],
  world = null,
  flightInput = null,
  nearest = null,
  selected = null;
let view = "world",
  contents = "projects",
  district = "all",
  journalScope = "city",
  sharedHistory = [];
let worldAvailable = true,
  welcomeDismissed = false,
  previousDistrict = null,
  playerHost = null,
  playerSequence = 0,
  currentPlayer = null,
  lastFocus = null,
  pendingTravel = null;
const names = {
  tools: "Creative tools",
  games: "Game",
  benchmarks: "AI benchmark",
  mods: "Mods & releases",
  art: "Art & images",
  android: "Android",
};
const districtName = (id) =>
  id === "center"
    ? city?.identity.landmark || "Nothatcher's Beacon"
    : city?.districts.find((d) => d.id === id)?.name || "City streets";
const resolveLot = (id) =>
  lots.find((l) => l.id === id || l.slotId === id || l.project?.id === id);
const actionName = (p) =>
  p.provider === "project0"
    ? p.embed
      ? "Play game"
      : "Visit original game"
    : p.embed
      ? "Enter project"
      : "Open project";

function toast(message) {
  $("toast").textContent = String(message);
  $("toast").hidden = false;
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => ($("toast").hidden = true), 4500);
}
function syncInput() {
  const overlay = $("project-player").open || $("journal-dialog").open;
  flightInput?.setEnabled(
    view === "world" && !overlay && $("project-details").hidden,
  );
  world?.setPaused(view !== "world" || overlay);
}
function dismissWelcome() {
  welcomeDismissed = true;
  $("welcome-card").hidden = true;
}
function setView(next) {
  view = next === "world" && !worldAvailable ? "library" : next;
  document.body.dataset.view = view;
  $("library-view").hidden = view !== "library";
  $("world-panel").hidden = view !== "world";
  $("library-toggle").firstChild.textContent =
    view === "library" ? "Back to cube " : "City map ";
  $("library-toggle").setAttribute("aria-pressed", String(view === "library"));
  $("welcome-card").hidden = welcomeDismissed || view !== "world";
  if (view === "library") renderCards();
  syncInput();
  if (view === "world") {
    $("world-canvas").focus({ preventScroll: true });
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }
}
function teleport(destination, slot = false) {
  dismissWelcome();
  closeDetails(false);
  setView("world");
  if (!worldAvailable) {
    toast("Use the map to explore this lot on this device.");
    return;
  }
  if (!world) {
    pendingTravel = { destination, slot };
    toast("The city is loading. Your destination is queued.");
    return;
  }
  if (slot) world.teleportLot(destination);
  else if (destination === "center") world.reset();
  else world.teleportDistrict(destination);
  journal.record("teleport", {
    destination: slot
      ? resolveLot(destination)?.title
      : districtName(destination),
    slotId: slot ? destination : undefined,
  });
  $("world-canvas").focus({ preventScroll: true });
}
function createTravel() {
  const filters = document.createDocumentFragment();
  const all = document.createElement("button");
  all.type = "button";
  all.dataset.district = "all";
  all.textContent = "All neighborhoods";
  all.setAttribute("aria-pressed", "true");
  filters.append(all);
  for (const d of city.districts) {
    const travel = document.createElement("button");
    travel.type = "button";
    travel.dataset.travel = d.id;
    travel.style.setProperty("--district-color", d.color);
    const dot = document.createElement("i");
    dot.className = "district-dot";
    const title = document.createElement("span");
    title.textContent = d.name;
    const count = document.createElement("small");
    count.textContent = projects.filter((p) => p.district === d.id).length;
    travel.append(dot, title, count);
    travel.addEventListener("click", () => teleport(d.id));
    $("district-travel").append(travel);
    const filter = document.createElement("button");
    filter.type = "button";
    filter.dataset.district = d.id;
    filter.textContent = d.name;
    filter.style.setProperty("--district-color", d.color);
    filter.setAttribute("aria-pressed", "false");
    filters.append(filter);
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "map-district";
    pin.style.left = `${50 + (d.center[0] / 440) * 100}%`;
    pin.style.top = `${50 + (d.center[1] / 440) * 100}%`;
    pin.style.background = d.color;
    pin.title = d.name;
    pin.setAttribute("aria-label", `Travel to ${d.name}`);
    pin.textContent = d.prefix;
    pin.addEventListener("click", () => teleport(d.id));
    $("minimap-districts").append(pin);
  }
  $("district-filters").append(filters);
  $("district-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-district]");
    if (!button) return;
    district = button.dataset.district;
    renderCards();
  });
}
function renderCards() {
  const query = $("project-search").value.toLowerCase().trim();
  let visible;
  if (contents === "open")
    visible = lots.filter(
      (l) =>
        !l.project &&
        (district === "all" || l.district === district) &&
        `${l.slotId} ${l.displayNumber} ${districtName(l.district)} open empty lot`
          .toLowerCase()
          .includes(query),
    );
  else {
    const filtered = filterProjects(
      projects.filter((p) => district === "all" || p.district === district),
      "all",
      query,
    );
    visible = filtered.map((p) => resolveLot(p.id));
  }
  const fragment = document.createDocumentFragment();
  for (const lot of visible) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `project-card ${lot.project ? "" : "vacant-card"}`;
    card.dataset.project = lot.id;
    card.dataset.slot = lot.slotId;
    card.dataset.theme = lot.project?.theme || "vacant";
    card.style.setProperty("--district-color", lot.color);
    const art = document.createElement("div");
    art.className = "card-art";
    art.setAttribute("aria-hidden", "true");
    for (const tag of ["span", "i", "b"])
      art.append(document.createElement(tag));
    const number = document.createElement("span");
    number.className = "card-plot";
    number.textContent = `${lot.project?.originalLot ? "ORIGINAL LOT" : "LOT"} ${lot.displayNumber}`;
    art.append(number);
    const copy = document.createElement("div");
    copy.className = "card-copy";
    const type = document.createElement("span");
    type.className = "card-category";
    type.textContent = districtName(lot.district);
    const title = document.createElement("h2");
    title.textContent = lot.title;
    const subtitle = document.createElement("p");
    subtitle.textContent =
      lot.project?.subtitle ||
      `A place for your next ${lot.district === "art" ? "creation" : "project"}.`;
    const link = document.createElement("span");
    link.className = "card-enter";
    link.textContent = lot.project
      ? lot.project.id === "astraforge"
        ? "FIRST INTEGRATION"
        : "EXPLORE THIS PLACE"
      : "MAKE IT YOURS +";
    copy.append(type, title, subtitle, link);
    card.append(art, copy);
    card.addEventListener("click", () => selectLot(lot.id));
    fragment.append(card);
  }
  $("project-grid").replaceChildren(fragment);
  $("empty-state").hidden = visible.length !== 0;
  $("result-count").textContent =
    `${visible.length} ${contents === "open" ? "open lots" : "creations"}`;
  $("show-projects").setAttribute(
    "aria-pressed",
    String(contents === "projects"),
  );
  $("show-open").setAttribute("aria-pressed", String(contents === "open"));
  document
    .querySelectorAll("[data-district]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.district === district)),
    );
}
function selectLot(id, updateHash = true) {
  const lot = resolveLot(id);
  if (!lot) return;
  lastFocus = document.activeElement;
  selected = lot;
  $("detail-plot").textContent =
    `${lot.project?.originalLot ? "ORIGINAL PROJECT 0 LOT" : "CITY LOT"} ${lot.displayNumber} / ${lot.slotId}`;
  $("detail-category").textContent = districtName(lot.district);
  $("detail-title").textContent =
    lot.project?.title || `Open lot ${lot.displayNumber}`;
  $("detail-subtitle").textContent =
    lot.project?.subtitle || "Your next idea can live here.";
  $("detail-description").textContent =
    lot.project?.description ||
    `A permanent place in ${districtName(lot.district)}. Send a project link, sign in with GitHub, and let Nothatcher know what you want to build.`;
  $("detail-art").dataset.theme = lot.project?.theme || "vacant";
  $("detail-tags").replaceChildren(
    ...(lot.project?.tags || ["Open lot", "Friend contributions"]).map((t) => {
      const e = document.createElement("span");
      e.textContent = t;
      return e;
    }),
  );
  $("occupied-actions").hidden = !lot.project;
  $("contribution-form").hidden = !!lot.project;
  if (lot.project) {
    const p = lot.project;
    $("detail-launch").textContent = `${actionName(p)} →`;
    $("detail-source").hidden = !p.source;
    if (p.source)
      $("detail-source").href = safeProjectUrl(p.source, document.baseURI);
    $("detail-original").hidden = p.provider !== "project0";
    if (p.provider === "project0") $("detail-original").href = p.url;
    $("detail-destination").textContent =
      p.provider === "project0"
        ? p.embed
          ? "Guest play uses local progress. Open the original lot for Project 0 accounts and services."
          : "Original game and platform services open in Project 0."
        : p.embed
          ? "Opens inside Mycity."
          : "Opens the project in a new tab.";
  } else $("contribution-form").reset();
  $("project-details").hidden = false;
  if (updateHash)
    history.replaceState(
      null,
      "",
      `#${lot.project ? "plot" : "lot"}/${encodeURIComponent(lot.id)}`,
    );
  syncInput();
  $("detail-close").focus({ preventScroll: true });
}
function closeDetails(restore = true) {
  $("project-details").hidden = true;
  selected = null;
  if (/^#(?:plot|lot)\//.test(location.hash))
    history.replaceState(null, "", location.pathname + location.search);
  syncInput();
  if (restore && lastFocus?.isConnected)
    lastFocus.focus({ preventScroll: true });
}
function interact() {
  if (!nearest) return;
  if (nearest.project) launch(nearest.project);
  else selectLot(nearest.slotId);
}
function updateNearby(lot) {
  nearest = lot;
  $("interact-button").hidden = !lot;
  $("nearby-details").hidden = !lot;
  $("nearby-number").textContent = lot?.displayNumber || "N";
  $("nearby-type").textContent = lot
    ? lot.project
      ? districtName(lot.district).toUpperCase()
      : "OPEN LOT / MAKE IT YOURS"
    : "FREE FLIGHT";
  $("nearby-title").textContent = lot?.title || "The city is yours to explore";
  $("nearby-subtitle").textContent = lot
    ? lot.project
      ? lot.project.originalLot
        ? `Original Project 0 lot ${lot.project.originalLot}`
        : lot.project.subtitle || lot.slotId
      : `An open place in ${districtName(lot.district)}.`
    : "Fly toward a lot to discover what’s inside.";
  $("interact-label").textContent = lot?.project ? "Enter" : "Build here";
}
function updateLocation(value) {
  const pos = value.position || value;
  const current = value.district || "streets";
  $("location-name").textContent = districtName(current);
  $("player-coordinates").textContent =
    `${Math.round(pos.x)} · ${Math.round(pos.y)} · ${Math.round(pos.z)}`;
  $("minimap-player").style.left =
    `${Math.max(4, Math.min(96, 50 + (pos.x / 440) * 100))}%`;
  $("minimap-player").style.top =
    `${Math.max(4, Math.min(96, 50 + (pos.z / 440) * 100))}%`;
  if (current !== previousDistrict) {
    if (city.districts.some((d) => d.id === current))
      journal.record("district", { district: districtName(current) });
    previousDistrict = current;
    document
      .querySelectorAll("[data-travel]")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.travel === current),
      );
  }
}
async function launch(project) {
  if (!project) return;
  const url = safeProjectUrl(project.url, document.baseURI);
  journal.record("project-open", {
    title: project.title,
    originalLot: project.originalLot,
  });
  if (!project.embed) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const sequence = ++playerSequence;
  playerHost?.dispose();
  playerHost = null;
  currentPlayer = project;
  $("player-title").textContent = project.title;
  $("player-external").href = url;
  $("player-external").textContent =
    project.provider === "project0"
      ? "Original Project 0 ↗"
      : "Open in new tab ↗";
  $("project-frame").title = `${project.title} app`;
  $("player-mode").hidden = project.provider !== "project0";
  $("player-loading").hidden = false;
  $("player-status").hidden = true;
  $("project-player").showModal();
  syncInput();
  $("player-close").focus();
  if (project.provider === "project0") {
    try {
      const { createProject0Player } = await import("./p0-player.js");
      if (sequence !== playerSequence) return;
      playerHost = createProject0Player({
        iframe: $("project-frame"),
        project,
        displayName: "Mycity visitor",
        onReady: () => {
          $("player-loading").hidden = true;
        },
        onExit: () => $("project-player").close(),
        onStatus: (message) => {
          const text = typeof message === "string" ? message : message?.message;
          if (text) {
            $("player-status").textContent = text;
            $("player-status").hidden = false;
          }
        },
        onError: (error) => {
          $("player-loading").hidden = true;
          $("player-status").textContent =
            `This guest session could not start. Use “Original Project 0” above. ${error?.message || ""}`;
          $("player-status").hidden = false;
        },
      });
    } catch (error) {
      $("player-loading").hidden = true;
      $("player-status").textContent =
        "The guest player could not load. Open the original Project 0 lot above.";
      $("player-status").hidden = false;
    }
  } else {
    $("project-frame").removeAttribute("sandbox");
    $("project-frame").src = url;
  }
}
function closePlayer() {
  ++playerSequence;
  playerHost?.dispose();
  playerHost = null;
  currentPlayer = null;
  $("project-frame").removeAttribute("src");
  $("project-frame").removeAttribute("sandbox");
  $("player-loading").hidden = true;
  syncInput();
}
function openJournal() {
  renderJournal();
  $("journal-dialog").showModal();
  syncInput();
}
function renderJournal() {
  const events =
    journalScope === "device" ? journal.getEvents() : sharedHistory;
  $("journal-scope").textContent =
    journalScope === "device"
      ? `Your visits and actions on this browser. ${journal.storageAvailable ? "Saved on this device." : "Storage is unavailable; export to keep this session."}`
      : "Published city additions, shared with everyone. GitHub supplies the real author and approval record.";
  document
    .querySelectorAll("[data-journal]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.journal === journalScope),
      ),
    );
  $("journal-clear").hidden = journalScope !== "device";
  const fragment = document.createDocumentFragment();
  for (const event of events.slice(0, 120)) {
    const item = document.createElement("li");
    const dot = document.createElement("i");
    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = event.message || event.title || event.type;
    const meta = document.createElement("span");
    meta.textContent = `${new Date(event.at).toLocaleString()}${event.actor ? ` · ${event.actor}` : ""}`;
    body.append(title, meta);
    if (event.url) {
      try {
        const link = document.createElement("a");
        link.href = safeProjectUrl(event.url);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "View publication →";
        body.append(link);
      } catch {}
    }
    item.append(dot, body);
    fragment.append(item);
  }
  if (!events.length) {
    const item = document.createElement("li");
    item.className = "journal-empty";
    item.textContent =
      journalScope === "city"
        ? "Approved additions will appear here. The next chapter could be yours."
        : "Your device journal is empty.";
    fragment.append(item);
  }
  $("journal-events").replaceChildren(fragment);
}
function worldFallback(error) {
  if (!worldAvailable) return;
  console.info("Using city map:", error?.message || "3D unavailable");
  worldAvailable = false;
  world?.dispose();
  world = null;
  $("world-loading").hidden = true;
  $("fallback-notice").hidden = false;
  $("library-close").disabled = true;
  setView("library");
}

$("start-flying").addEventListener("click", () => {
  dismissWelcome();
  $("world-canvas").focus();
});
$("featured-launch").addEventListener("click", () => launch(projects[0]));
$("library-toggle").addEventListener("click", () => {
  closeDetails(false);
  setView(view === "world" ? "library" : "world");
});
$("library-close").addEventListener("click", () => setView("world"));
$("build-toggle").addEventListener("click", () => {
  contents = "open";
  setView("library");
  renderCards();
});
$("show-projects").addEventListener("click", () => {
  contents = "projects";
  renderCards();
});
$("show-open").addEventListener("click", () => {
  contents = "open";
  renderCards();
});
$("project-search").addEventListener("input", renderCards);
$("reset-camera").addEventListener("click", () => teleport("center"));
$("detail-close").addEventListener("click", () => closeDetails());
$("detail-launch").addEventListener("click", () => launch(selected?.project));
$("detail-fly").addEventListener("click", () => {
  if (selected) teleport(selected.slotId, true);
});
$("interact-button").addEventListener("click", interact);
$("nearby-details").addEventListener("click", () => {
  if (nearest) selectLot(nearest.id);
});
$("contribution-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!selected || selected.project) return;
  try {
    const url = $("contribution-url").value.trim();
    safeProjectUrl(url);
    if (!url.startsWith("https://"))
      throw new Error("Please use a public HTTPS project link.");
    const target = buildContributionUrl(selected, {
      title: $("contribution-title").value.trim(),
      url,
      description: $("contribution-description").value.trim(),
    });
    journal.record("submission-start", { slotId: selected.slotId });
    window.open(target, "_blank", "noopener,noreferrer");
    toast(
      "Continue on GitHub to submit. Your lot will publish after owner approval.",
    );
  } catch (error) {
    toast(error.message);
  }
});
$("player-close").addEventListener("click", () => $("project-player").close());
$("project-player").addEventListener("close", closePlayer);
$("project-frame").addEventListener("load", () => {
  if (currentPlayer?.provider !== "project0") $("player-loading").hidden = true;
});
$("journal-toggle").addEventListener("click", openJournal);
$("journal-close").addEventListener("click", () => $("journal-dialog").close());
$("journal-dialog").addEventListener("close", syncInput);
document.querySelectorAll("[data-journal]").forEach((b) =>
  b.addEventListener("click", () => {
    journalScope = b.dataset.journal;
    renderJournal();
  }),
);
$("journal-clear").addEventListener("click", () => {
  journal.clear();
  renderJournal();
});
$("journal-export").addEventListener("click", () => {
  const data =
    journalScope === "device"
      ? journal.serialize()
      : JSON.stringify(sharedHistory, null, 2);
  const url = URL.createObjectURL(
    new Blob([data], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `mycity-${journalScope}-history.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.addEventListener("keydown", (event) => {
  if (
    ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) ||
    event.target.isContentEditable
  )
    return;
  if (
    event.code === "KeyM" &&
    !$("project-player").open &&
    !$("journal-dialog").open
  ) {
    event.preventDefault();
    closeDetails(false);
    setView(view === "world" ? "library" : "world");
  }
  if (
    event.key === "Escape" &&
    !$("project-player").open &&
    !$("journal-dialog").open
  ) {
    if (!$("project-details").hidden) closeDetails();
    else if (view === "library") setView("world");
  }
});
$("world-canvas").addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  worldFallback(new Error("Graphics context lost"));
});

async function loadJSON(path) {
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}
async function init() {
  try {
    const [catalog, configuration] = await Promise.all([
      loadJSON("./projects.json"),
      loadJSON("./city.json"),
    ]);
    projects = validateCatalog(catalog);
    city = validateCity(configuration);
    lots = buildCityLots(projects, city);
    const count = lots.filter((l) => !l.project).length;
    $("project-count").textContent = projects.length;
    $("all-count").textContent = projects.length;
    $("vacancy-count").textContent = count;
    $("open-count").textContent = count;
    createTravel();
    renderCards();
    journal.record("arrival");
    loadJSON("./city-activity.json")
      .then((data) => {
        if (Array.isArray(data)) sharedHistory = data;
      })
      .catch(() => {});
  } catch (error) {
    $("world-loading").textContent =
      "The city could not load. Refresh or visit github.com/nothatcher-creator/Mycity.";
    toast(error.message);
    return;
  }
  flightInput = createFlightInput({
    canvas: $("world-canvas"),
    joystick: $("flight-joystick"),
    stick: $("flight-stick"),
    upButton: $("flight-up"),
    downButton: $("flight-down"),
    boostButton: $("flight-boost"),
    onInteract: interact,
  });
  try {
    const { createWorld } = await import("./world.js");
    world = createWorld({
      canvas: $("world-canvas"),
      labelsContainer: $("plot-labels"),
      projects,
      city,
      flightInput,
      onSelect: selectLot,
      onReady: () => {
        $("world-loading").hidden = true;
        if (pendingTravel) {
          const queued = pendingTravel;
          pendingTravel = null;
          teleport(queued.destination, queued.slot);
        }
      },
      onNearby: updateNearby,
      onLocation: updateLocation,
    });
    syncInput();
  } catch (error) {
    worldFallback(error);
  }
  const match = /^#(?:plot|lot)\/(.+)$/.exec(location.hash);
  if (match) {
    try {
      selectLot(decodeURIComponent(match[1]), false);
    } catch {}
  }
}
init();
