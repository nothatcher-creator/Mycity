import "./style.css";
import { validateCatalog, filterProjects, safeProjectUrl } from "./catalog.js";

const $ = (id) => document.getElementById(id);
const categoryNames = {
  tools: "Creative tools",
  games: "Games",
  benchmarks: "AI benchmarks",
  mods: "Mods & downloads",
};
const categorySymbols = { tools: "✦", games: "◈", benchmarks: "⌘", mods: "♢" };
let projects = [],
  visible = [],
  category = "all",
  view = "world",
  world = null,
  selected = null,
  worldAvailable = true,
  lastSelectionFocus = null;

function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => ($("toast").hidden = true), 4000);
}

function setView(next) {
  view = next === "world" && !worldAvailable ? "library" : next;
  $("library-view").hidden = view !== "library";
  $("intro").hidden = view === "library";
  $("world-panel").hidden = view === "library";
  $("library-toggle").setAttribute("aria-pressed", String(view === "library"));
  $("view-label").textContent =
    view === "library" ? "3D world" : "Library view";
  document.body.dataset.view = view;
  world?.setPaused(view !== "world" || $("project-player").open);
  updateEmpty();
  if (view === "world")
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
}

function updateEmpty() {
  $("empty-state").hidden = visible.length !== 0;
  $("result-count").textContent =
    `${visible.length} ${visible.length === 1 ? "plot" : "plots"} to explore`;
}

function filter() {
  visible = filterProjects(projects, category, $("project-search").value);
  world?.setVisible(visible.map((project) => project.id));
  renderCards();
  updateEmpty();
  if (selected && !visible.some((project) => project.id === selected.id)) {
    closeDetails(false);
    world?.reset();
  }
}

function renderCards() {
  const fragment = document.createDocumentFragment();
  for (const project of visible) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "project-card";
    card.dataset.project = project.id;
    card.dataset.theme = project.theme;
    const art = document.createElement("div");
    art.className = "card-art";
    art.setAttribute("aria-hidden", "true");
    for (const tag of ["span", "i", "b"])
      art.append(document.createElement(tag));
    const number = document.createElement("span");
    number.className = "card-plot";
    number.textContent = `PLOT ${String(project.plot).padStart(3, "0")}`;
    art.append(number);
    const copy = document.createElement("div");
    copy.className = "card-copy";
    const type = document.createElement("span");
    type.className = "card-category";
    type.textContent = `${categorySymbols[project.category]} ${categoryNames[project.category]}`;
    const title = document.createElement("h2");
    title.textContent = project.title;
    const subtitle = document.createElement("p");
    subtitle.textContent = project.subtitle || project.description;
    const enter = document.createElement("span");
    enter.className = "card-enter";
    enter.textContent =
      project.id === "astraforge" ? "FIRST INTEGRATION" : "EXPLORE PROJECT";
    copy.append(type, title, subtitle, enter);
    card.append(art, copy);
    card.addEventListener("click", () => selectProject(project.id));
    fragment.append(card);
  }
  $("project-grid").replaceChildren(fragment);
}

function selectProject(id, updateHash = true) {
  const project = projects.find((project) => project.id === id);
  if (!project) return;
  lastSelectionFocus = document.activeElement;
  selected = project;
  $("detail-plot").textContent =
    `PROJECT PLOT ${String(project.plot).padStart(3, "0")}`;
  $("detail-title").textContent = project.title;
  $("detail-subtitle").textContent = project.subtitle || "";
  $("detail-description").textContent = project.description;
  $("detail-category").textContent =
    `${categorySymbols[project.category]} ${categoryNames[project.category]}`;
  $("detail-art").dataset.theme = project.theme;
  $("detail-tags").replaceChildren(
    ...project.tags.map((tag) => {
      const el = document.createElement("span");
      el.textContent = tag;
      return el;
    }),
  );
  $("detail-launch").firstChild.textContent =
    `${project.embed ? "Enter" : project.category === "mods" ? "View releases" : "Visit"} ${project.category === "mods" ? "" : project.title} `;
  $("detail-source").hidden = !project.source;
  if (project.source)
    $("detail-source").href = safeProjectUrl(project.source, document.baseURI);
  $("detail-destination").textContent = project.embed
    ? "Opens here, inside the district."
    : project.category === "games"
      ? "Opens the original Project 0 lot in a new tab."
      : "Opens GitHub in a new tab.";
  $("project-details").hidden = false;
  world?.focusProject(project.id);
  document
    .querySelectorAll(".plot-label")
    .forEach((label) =>
      label.classList.toggle("selected", label.dataset.project === id),
    );
  if (updateHash)
    history.replaceState(null, "", `#plot/${encodeURIComponent(id)}`);
  $("detail-close").focus({ preventScroll: true });
}

function closeDetails(restoreFocus = true) {
  $("project-details").hidden = true;
  selected = null;
  document
    .querySelectorAll(".plot-label")
    .forEach((label) => label.classList.remove("selected"));
  if (location.hash.startsWith("#plot/"))
    history.replaceState(null, "", location.pathname + location.search);
  if (restoreFocus && lastSelectionFocus?.isConnected)
    lastSelectionFocus.focus({ preventScroll: true });
}

function launch(project) {
  if (!project) return;
  const url = safeProjectUrl(project.url, document.baseURI);
  if (!project.embed) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  $("player-title").textContent = project.title;
  $("player-external").href = url;
  $("project-frame").title = `${project.title} app`;
  $("player-loading").hidden = false;
  $("project-player").showModal();
  world?.setPaused(true);
  $("project-frame").src = url;
  $("player-close").focus();
}

function worldFallback(error) {
  if (!worldAvailable) return;
  console.info(
    "Using the accessible project library:",
    error?.message || "3D unavailable",
  );
  worldAvailable = false;
  world?.dispose();
  world = null;
  $("world-loading").hidden = true;
  $("fallback-notice").hidden = false;
  setView("library");
  $("library-toggle").disabled = true;
  $("view-label").textContent = "Library view";
}

$("library-toggle").addEventListener("click", () => {
  closeDetails(false);
  setView(view === "world" ? "library" : "world");
});
$("reset-camera").addEventListener("click", () => {
  closeDetails(false);
  world?.reset();
});
$("featured-launch").addEventListener("click", () => launch(projects[0]));
$("detail-close").addEventListener("click", () => closeDetails());
$("detail-launch").addEventListener("click", () => launch(selected));
$("project-search").addEventListener("input", filter);
document.querySelectorAll(".filter-button").forEach((button) =>
  button.addEventListener("click", () => {
    category = button.dataset.category;
    document.querySelectorAll(".filter-button").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
    filter();
  }),
);
$("player-close").addEventListener("click", () => $("project-player").close());
$("project-player").addEventListener("close", () => {
  $("project-frame").removeAttribute("src");
  $("player-loading").hidden = true;
  world?.setPaused(view !== "world");
});
$("project-frame").addEventListener("load", () => {
  $("player-loading").hidden = true;
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    !$("project-player").open &&
    !$("project-details").hidden
  )
    closeDetails();
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) &&
    !$("project-player").open
  ) {
    event.preventDefault();
    $("project-search").focus();
  }
});
$("world-canvas").addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  worldFallback(new Error("Graphics context lost"));
});

async function init() {
  try {
    const response = await fetch(new URL("./projects.json", document.baseURI));
    if (!response.ok)
      throw new Error(`Catalog request failed (${response.status})`);
    projects = validateCatalog(await response.json());
    $("total-count").textContent = String(projects.length).padStart(2, "0");
    $("all-count").textContent = projects.length;
    filter();
  } catch (error) {
    $("world-loading").hidden = true;
    $("featured-launch").disabled = true;
    $("empty-state").hidden = false;
    $("empty-state").textContent =
      "The project catalog could not load. Please refresh or visit github.com/nothatcher-creator.";
    toast(error.message);
    return;
  }
  try {
    const { createWorld } = await import("./world.js");
    world = createWorld({
      canvas: $("world-canvas"),
      labelsContainer: $("plot-labels"),
      projects,
      onSelect: selectProject,
      onReady: () => ($("world-loading").hidden = true),
    });
    world.setVisible(visible.map((project) => project.id));
    world.setPaused(view !== "world" || $("project-player").open);
  } catch (error) {
    worldFallback(error);
  }
  if (location.hash.startsWith("#plot/")) {
    try {
      selectProject(decodeURIComponent(location.hash.slice(6)), false);
    } catch {
      /* Unknown deep links leave the district available. */
    }
  }
}
init();
