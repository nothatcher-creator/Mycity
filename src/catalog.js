const CATEGORIES = new Set([
  "tools",
  "games",
  "benchmarks",
  "mods",
  "art",
  "android",
]);
const DISTRICTS = new Set(["games", "tools", "art", "android", "mods"]);
const DEFAULT_BASE = "https://nothatcher-creator.github.io/";

export function safeProjectUrl(value, base = DEFAULT_BASE) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    value.startsWith("//") ||
    /[\u0000-\u0020\\]/.test(value)
  ) {
    throw new Error("Invalid project URL");
  }
  let url;
  try {
    url = new URL(value, base);
  } catch {
    throw new Error("Invalid project URL");
  }
  const localDevelopment =
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    new URL(base).origin === url.origin &&
    !/^[a-z]+:/i.test(value);
  if (
    (url.protocol !== "https:" && !localDevelopment) ||
    url.username ||
    url.password
  ) {
    throw new Error("Project URL must use HTTPS or a local project path");
  }
  return url.href;
}

export function validateCatalog(projects) {
  if (!Array.isArray(projects) || !projects.length)
    throw new Error("Project catalog must be a nonempty array");
  const ids = new Set(),
    plots = new Set(),
    slots = new Set();
  for (const project of projects) {
    if (!project || typeof project !== "object")
      throw new Error("Invalid project record");
    if (
      ids.has(project.id) ||
      plots.has(project.plot) ||
      slots.has(project.slot)
    )
      throw new Error("Duplicate project ID, plot number, or city slot");
    if (
      typeof project.id !== "string" ||
      !/^[a-z][a-z0-9-]*$/.test(project.id) ||
      !Number.isSafeInteger(project.plot) ||
      project.plot < 1 ||
      typeof project.title !== "string" ||
      !project.title.trim() ||
      typeof project.description !== "string" ||
      !project.description.trim() ||
      !CATEGORIES.has(project.category) ||
      !DISTRICTS.has(project.district) ||
      typeof project.slot !== "string" ||
      !new RegExp(`^${project.district}-[0-9]{2}$`).test(project.slot) ||
      typeof project.embed !== "boolean" ||
      !Array.isArray(project.tags) ||
      project.tags.some((tag) => typeof tag !== "string" || !tag.trim())
    ) {
      throw new Error(
        `Invalid project catalog entry: ${project.id || "unnamed"}`,
      );
    }
    safeProjectUrl(project.url);
    if (project.source) safeProjectUrl(project.source);
    if (
      project.originalLot !== undefined &&
      (!Number.isSafeInteger(project.originalLot) ||
        project.originalLot < 1 ||
        project.originalLot !== project.plot)
    )
      throw new Error("Invalid original project lot number");
    if (project.exterior) {
      safeProjectUrl(project.exterior.model);
      if (project.exterior.highModel)
        safeProjectUrl(project.exterior.highModel);
    }
    ids.add(project.id);
    plots.add(project.plot);
    slots.add(project.slot);
  }
  if (projects[0].id !== "astraforge" || projects[0].plot !== 1) {
    throw new Error("Astraforge must remain the first integration on plot 001");
  }
  return projects;
}

export function filterProjects(projects, category = "all", query = "") {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return projects.filter((project) => {
    const text = [
      project.title,
      project.subtitle,
      project.description,
      ...project.tags,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return (
      (category === "all" || project.category === category) &&
      words.every((word) => text.includes(word))
    );
  });
}
