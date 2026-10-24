import "./gallery.css";
import { safeProjectUrl } from "./catalog.js";
import { buildCityLots } from "./city-layout.js";
import { buildContributionUrl } from "./community.js";
const root = new URL(import.meta.env.BASE_URL, location.origin);
const $ = (id) => document.getElementById(id);
function fullView(item) {
  $("art-full").src = safeProjectUrl(item.src, root);
  $("art-full").alt = item.title;
  $("art-title").textContent = item.title;
  $("art-caption").textContent = item.caption;
  $("art-source").hidden = !item.sourceLot;
  if (item.sourceLot)
    $("art-source").href = `https://project0.city/#${Number(item.sourceLot)}`;
  $("art-dialog").showModal();
  $("art-close").focus();
}
$("art-close").addEventListener("click", () => $("art-dialog").close());
$("art-dialog").addEventListener("close", () =>
  $("art-full").removeAttribute("src"),
);
async function load(path) {
  const response = await fetch(new URL(path, root));
  if (!response.ok) throw new Error("Gallery could not load.");
  return response.json();
}
try {
  const [gallery, projects, city] = await Promise.all([
    load("gallery.json"),
    load("projects.json"),
    load("city.json"),
  ]);
  for (const item of gallery.items) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "art-card";
    const image = document.createElement("img");
    image.src = safeProjectUrl(item.src, root);
    image.alt = item.title;
    image.loading = "lazy";
    const copy = document.createElement("div");
    const number = document.createElement("span");
    number.textContent = String(gallery.items.indexOf(item) + 1).padStart(
      2,
      "0",
    );
    const title = document.createElement("h2");
    title.textContent = item.title;
    const caption = document.createElement("p");
    caption.textContent = item.caption;
    copy.append(number, title, caption);
    card.append(image, copy);
    card.addEventListener("click", () => fullView(item));
    $("art-grid").append(card);
  }
  const vacant = buildCityLots(projects, city).find(
    (l) => l.district === "art" && !l.project,
  );
  if (vacant) $("add-art").href = buildContributionUrl(vacant);
  else $("add-art").hidden = true;
} catch (error) {
  $("gallery-notice").textContent = error.message;
  $("gallery-notice").hidden = false;
}
