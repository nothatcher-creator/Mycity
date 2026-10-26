import "./style.css";
import { validateCatalog, filterProjects, safeProjectUrl } from "./catalog.js";
import { validateCity } from "./city-layout.js";
import { buildCityPlan } from "./city-plan.js";
import { validateShowcase, showcaseNumber } from "./showcase.js";
import { cityBuildingSource } from "./lot-sources.js";
import { createFlightInput } from "./flight.js";
import { createDeviceJournal } from "./journal.js";
import { createAddProjectFlow } from "./add-project.js";
import { createCityMap } from "./city-map.js";

const $ = (id) => document.getElementById(id);
document.body.dataset.touchMode = "buttons";
function showTouchControls(show = true) {
  document.body.classList.toggle("touch-enabled", show);
  $("touch-show").hidden = show;
  flightInput?.setEnabled(false);
  syncInput();
}
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
let addProjectFlow = null,
  minimap = null,
  cityMap = null,
  lastLocation = null,
  thumbnails = new Map(),
  plan = null,
  models = [],
  viewer = null,
  viewerRequest = 0;
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
    : id === "showcase"
      ? city?.showcase?.name || "Model Showcase"
      : city?.districts.find((d) => d.id === id)?.name || city?.bay?.name || "The bay";
const modelNumber = (model) => showcaseNumber(models.indexOf(model));
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
  const overlay = $("project-player").open || $("journal-dialog").open || $("add-project-dialog").open || $("model-viewer").open;
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
  if (view === "library") {
    renderCards();
    if (lastLocation) cityMap?.update(lastLocation);
  }
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
    pin.dataset.mapDistrict = d.id;
    pin.style.background = d.color;
    pin.title = d.name;
    pin.setAttribute("aria-label", `Travel to ${d.name}`);
    pin.textContent = d.prefix;
    pin.addEventListener("click", () => teleport(d.id));
    $("minimap-districts").append(pin);
  }
  if (city.showcase) {
    const travel = document.createElement("button");
    travel.type = "button";
    travel.dataset.travel = "showcase";
    travel.style.setProperty("--district-color", city.showcase.color);
    const dot = document.createElement("i");
    dot.className = "district-dot";
    const title = document.createElement("span");
    title.textContent = city.showcase.name;
    const count = document.createElement("small");
    count.textContent = models.length;
    travel.append(dot, title, count);
    travel.addEventListener("click", () => teleport("showcase"));
    $("district-travel").append(travel);
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "map-district";
    pin.dataset.mapDistrict = "showcase";
    pin.style.background = city.showcase.color;
    pin.title = city.showcase.name;
    pin.setAttribute("aria-label", `Travel to ${city.showcase.name}`);
    pin.textContent = city.showcase.prefix || "S";
    pin.addEventListener("click", () => teleport("showcase"));
    $("minimap-districts").append(pin);
  }
  minimap = createCityMap({ canvas: $("minimap-canvas"), plan });
  $("minimap-label").textContent = `MYCITY / ${lots.length} LOTS`;
  // Pins sit on each island's back verge, between its lots and the shore.
  minimap.onLayout((projection) => {
    for (const pin of $("minimap-districts").children) {
      const island = plan.islands.find((item) => item.district.id === pin.dataset.mapDistrict);
      const point = island
        ? island.frame.toWorld(0, -island.back + 4)
        : plan.showcase.frame.toWorld(0, -plan.showcase.radius + 7);
      const place = projection.toPercent(point.x, point.z);
      pin.style.left = `${place.left}%`;
      pin.style.top = `${place.top}%`;
    }
  });
  // The full map in the City map view. Cards beside it remain the accessible equivalent.
  cityMap = createCityMap({ canvas: $("city-map-canvas"), plan, labels: true, padding: 10 });
  const mapCanvas = $("city-map-canvas"),
    tip = $("city-map-tip");
  mapCanvas.addEventListener("pointermove", (event) => {
    const target = cityMap.targetAt(event.clientX, event.clientY);
    cityMap.setHovered(target);
    mapCanvas.style.cursor = target ? "pointer" : "";
    tip.hidden = !target;
    if (!target) return;
    const lot = target.lot;
    tip.textContent =
      target.kind === "model"
        ? `${modelNumber(target.model)} · ${target.model.title}`
        : `${lot.displayNumber} · ${lot.project ? lot.title : `Open lot in ${districtName(lot.district)}`}`;
    const rect = $("city-map").getBoundingClientRect();
    const half = tip.offsetWidth / 2 + 6;
    tip.style.left = `${Math.min(Math.max(event.clientX - rect.left, half), rect.width - half)}px`;
    tip.style.top = `${event.clientY - rect.top}px`;
    tip.classList.toggle("below", event.clientY - rect.top < 44);
  });
  mapCanvas.addEventListener("pointerleave", () => {
    cityMap.setHovered(null);
    tip.hidden = true;
  });
  mapCanvas.addEventListener("click", (event) => {
    const target = cityMap.targetAt(event.clientX, event.clientY);
    if (target?.kind === "model") openModel(target.model);
    else if (target) selectLot(target.lot.id);
  });
  $("district-filters").append(filters);
  $("district-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-district]");
    if (!button) return;
    district = button.dataset.district;
    renderCards();
  });
}
/** Pre-rendered pictures of each lot's city building (scripts/render-thumbnails.mjs). */
function addThumbnail(art, project, explicit) {
  const source = explicit || (project && thumbnails.get(project.id));
  art.classList.toggle("has-thumb", Boolean(source));
  art.querySelector(".lot-thumb")?.remove();
  if (!source) return;
  const image = document.createElement("img");
  image.className = "lot-thumb";
  image.src = source;
  image.alt = "";
  image.decoding = "async";
  image.loading = "lazy";
  art.append(image);
}
function renderModelCards(query) {
  const words = query.split(/\s+/).filter(Boolean);
  const visible = models.filter((model) => {
    const text = `${model.title} ${model.description || ""} ${model.credit || ""} ${modelNumber(model)} model 3d`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
  const fragment = document.createDocumentFragment();
  for (const model of visible) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "project-card model-card";
    card.dataset.model = model.id;
    card.dataset.theme = "model";
    card.style.setProperty("--district-color", city.showcase?.color || "#c8b6ff");
    const art = document.createElement("div");
    art.className = "card-art";
    art.setAttribute("aria-hidden", "true");
    for (const tag of ["span", "i", "b"]) art.append(document.createElement(tag));
    const number = document.createElement("span");
    number.className = "card-plot";
    number.textContent = `${model.featured ? "FEATURED · " : ""}${modelNumber(model)}`;
    art.append(number);
    addThumbnail(art, null, model.thumbnail);
    const copy = document.createElement("div");
    copy.className = "card-copy";
    const type = document.createElement("span");
    type.className = "card-category";
    type.textContent = districtName("showcase");
    const title = document.createElement("h2");
    title.textContent = model.title;
    const subtitle = document.createElement("p");
    const triangles = model.stats?.triangles ? `${model.stats.triangles.toLocaleString()} triangles` : "3D model";
    subtitle.textContent = model.credit ? `${model.credit} · ${triangles}` : triangles;
    const link = document.createElement("span");
    link.className = "card-enter";
    link.textContent = "INSPECT IN 3D";
    copy.append(type, title, subtitle, link);
    card.append(art, copy);
    card.addEventListener("click", () => openModel(model));
    fragment.append(card);
  }
  $("project-grid").replaceChildren(fragment);
  cityMap?.highlight(visible.map((model) => `model:${model.id}`));
  $("empty-state").hidden = visible.length !== 0;
  $("result-count").textContent = `${visible.length} model${visible.length === 1 ? "" : "s"}`;
}
function renderCards() {
  const query = $("project-search").value.toLowerCase().trim();
  for (const [id, value] of [["show-projects", "projects"], ["show-open", "open"], ["show-models", "models"]])
    $(id).setAttribute("aria-pressed", String(contents === value));
  $("district-filters").hidden = contents === "models";
  if (contents === "models") return renderModelCards(query);
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
    addThumbnail(art, lot.project);
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
  cityMap?.highlight(visible.map((lot) => lot.id));
  $("empty-state").hidden = visible.length !== 0;
  $("result-count").textContent =
    `${visible.length} ${contents === "open" ? "open lots" : "creations"}`;
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
  cityMap?.setSelected({ kind: "lot", lot });
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
  addThumbnail($("detail-art"), lot.project);
  $("detail-tags").replaceChildren(
    ...(lot.project?.tags || ["Open lot", "Friend contributions"]).map((t) => {
      const e = document.createElement("span");
      e.textContent = t;
      return e;
    }),
  );
  $("occupied-actions").hidden = !lot.project;
  $("detail-model").hidden = !(lot.project && cityBuildingSource(lot.project, true));
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
  }
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
  cityMap?.setSelected(null);
  if (/^#(?:plot|lot)\//.test(location.hash))
    history.replaceState(null, "", location.pathname + location.search);
  syncInput();
  if (restore && lastFocus?.isConnected)
    lastFocus.focus({ preventScroll: true });
}
function interact() {
  if (!nearest) return;
  if (nearest.kind === "model") openModel(nearest.model, { fromWorld: true });
  else if (nearest.project) launch(nearest.project);
  else selectLot(nearest.slotId);
}
function updateNearby(lot) {
  nearest = lot;
  if (lot?.kind === "model") {
    $("interact-button").hidden = false;
    $("nearby-details").hidden = true;
    $("nearby-number").textContent = lot.displayNumber;
    $("nearby-type").textContent = `${districtName("showcase").toUpperCase()}${lot.model.featured ? " · FEATURED" : ""}`;
    $("nearby-title").textContent = lot.title;
    $("nearby-subtitle").textContent = lot.model.credit ? `By ${lot.model.credit}` : "A 3D model on display.";
    $("interact-label").textContent = "Inspect";
    return;
  }
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
  const current = value.district || "bay";
  $("location-name").textContent = districtName(current);
  $("player-coordinates").textContent =
    `${Math.round(pos.x)} · ${Math.round(pos.y)} · ${Math.round(pos.z)}`;
  lastLocation = { position: pos, heading: value.heading, view: value.view };
  minimap?.update(lastLocation);
  if (view === "library") cityMap?.update(lastLocation);
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
/** Open a showcase model (or a lot's building) in the 3D viewer. */
async function openModel(model, { fromWorld = false } = {}) {
  if (!model) return;
  const request = ++viewerRequest;
  journal.record("model-open", { title: model.title });
  try {
    if (!viewer) {
      const { createModelViewer } = await import("./model-viewer.js");
      if (request !== viewerRequest) return;
      viewer ||= createModelViewer({
        dialog: $("model-viewer"),
        onVisitProject: (id) => {
          const lot = resolveLot(id);
          if (lot) teleport(lot.slotId, true);
        },
        onFlyToModel: (target) => {
          dismissWelcome();
          closeDetails(false);
          setView("world");
          world?.focusModel(target.id);
        },
        onClose: () => {
          if (/^#model\//.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
          syncInput();
          if (view === "world") $("world-canvas").focus({ preventScroll: true });
        },
      });
    }
    const index = models.indexOf(model);
    await viewer.open(model, { number: index >= 0 ? showcaseNumber(index) : "", canFly: index >= 0 && Boolean(world) && !fromWorld });
    if (index >= 0) history.replaceState(null, "", `#model/${encodeURIComponent(model.id)}`);
  } catch (error) {
    toast(`The model viewer could not open. ${error?.message || ""}`);
  }
  syncInput();
}
function openLotBuilding(lot) {
  const source = lot?.project && cityBuildingSource(lot.project, true);
  if (!source) return;
  openModel({
    id: `${lot.project.id}-building`,
    title: lot.project.title,
    file: source,
    description: lot.project.originalLot
      ? `The exterior of original Project 0 lot ${lot.project.originalLot}.`
      : "The building that stands on this lot in the city.",
    credit: lot.project.originalLot ? `Nothatcher, original Project 0 lot ${lot.project.originalLot}` : undefined,
  });
}
async function takePhoto() {
  if (!world) return toast("Photos need the 3D city.");
  const blob = await world.capture();
  if (!blob) return toast("This browser couldn't save the photo.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mycity-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  journal.record("photo", {});
  toast("Photo saved to your downloads.");
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
$("touch-show").addEventListener("click", () => showTouchControls());
$("touch-hide").addEventListener("click", () => showTouchControls(false));
$("touch-mode-toggle").addEventListener("click", () => {
  const buttons = document.body.dataset.touchMode !== "buttons";
  document.body.dataset.touchMode = buttons ? "buttons" : "stick";
  $("touch-mode-toggle").textContent = buttons ? "Use joystick" : "Use buttons";
  flightInput?.setEnabled(false);
  syncInput();
});
$("featured-launch").addEventListener("click", () => launch(projects[0]));
$("library-toggle").addEventListener("click", () => {
  closeDetails(false);
  setView(view === "world" ? "library" : "world");
});
$("library-close").addEventListener("click", () => setView("world"));
$("build-toggle").addEventListener("click", () => {
  closeDetails(false);
  addProjectFlow?.open();
});
$("show-projects").addEventListener("click", () => {
  contents = "projects";
  renderCards();
});
$("show-open").addEventListener("click", () => {
  contents = "open";
  renderCards();
});
$("show-models").addEventListener("click", () => {
  contents = "models";
  renderCards();
});
$("detail-model").addEventListener("click", () => openLotBuilding(selected));
$("photo-button").addEventListener("click", takePhoto);
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
$("contribution-submit").addEventListener("click", () => {
  const lot = selected;
  if (!lot || lot.project) return;
  closeDetails(false);
  addProjectFlow?.open({ lot });
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
  const dialogOpen = $("project-player").open || $("journal-dialog").open || $("add-project-dialog").open || $("model-viewer").open;
  if (event.code === "KeyM" && !dialogOpen) {
    event.preventDefault();
    closeDetails(false);
    setView(view === "world" ? "library" : "world");
  }
  if (event.key === "Escape" && !dialogOpen) {
    if (!$("project-details").hidden) closeDetails();
    else if (view === "library") setView("world");
  }
});
$("world-canvas").addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  worldFallback(new Error("Graphics context lost"));
});

async function loadJSON(path) {
  const response = await fetch(new URL(path, document.baseURI), {
    cache: "no-cache",
  });
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
    // The showcase is optional: a missing or broken manifest leaves its island empty.
    models = await loadJSON("./showcase/index.json")
      .then(validateShowcase)
      .catch(() => []);
    plan = buildCityPlan(projects, city, { models });
    lots = plan.lots;
    addProjectFlow = createAddProjectFlow({
      dialog: $("add-project-dialog"), projects, city,
      onOpen: syncInput, onClose: syncInput,
      onSelectExisting: selectLot,
      onSubmit: (lot) => journal.record("submission-start", { slotId: lot.slotId }),
    });
    $("build-toggle").disabled = false;
    const count = lots.filter((l) => !l.project).length;
    $("project-count").textContent = projects.length;
    $("all-count").textContent = projects.length;
    $("vacancy-count").textContent = count;
    $("open-count").textContent = count;
    $("models-count").textContent = models.length;
    $("welcome-model-count").textContent = models.length;
    $("welcome-models").hidden = !models.length;
    $("show-models").hidden = !models.length;
    createTravel();
    renderCards();
    journal.record("arrival");
    loadJSON("./thumbnails/index.json")
      .then((data) => {
        for (const [id, path] of Object.entries(data || {}))
          if (/^\.\/thumbnails\/[a-z0-9-]+\.webp$/.test(path)) thumbnails.set(id, path);
        if (view === "library") renderCards();
        if (selected) addThumbnail($("detail-art"), selected.project);
      })
      .catch(() => {});
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
    forwardButton: $("flight-forward"),
    backButton: $("flight-back"),
    leftButton: $("flight-left"),
    rightButton: $("flight-right"),
    onInteract: interact,
  });
  if (
    navigator.maxTouchPoints > 0 ||
    matchMedia("(any-pointer: coarse)").matches ||
    innerWidth <= 800
  )
    showTouchControls();
  try {
    const { createWorld } = await import("./world.js");
    world = createWorld({
      canvas: $("world-canvas"),
      labelsContainer: $("plot-labels"),
      projects,
      city,
      models,
      flightInput,
      onSelect: selectLot,
      onSelectModel: (model) => openModel(model, { fromWorld: true }),
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
  const shared = /^#model\/(.+)$/.exec(location.hash);
  if (shared) {
    try {
      const model = models.find((item) => item.id === decodeURIComponent(shared[1]));
      if (model) openModel(model);
    } catch {}
  }
  const addDistrict = new URL(location.href).searchParams.get("add");
  if (addDistrict !== null) addProjectFlow?.open({ district: addDistrict });
}
init();
