import { buildContributionUrl } from "./community.js";
import { chooseOpenLot, inferProjectDetails, findDuplicateProject } from "./add-project-data.js";
import { LOT_STYLES, defaultLotStyle } from "./lot-styles.js";
import { buildCityLots } from "./city-layout.js";
import "./add-project.css";

const DRAFT_KEY = "mycity-project-draft-v1";

/** Local drafts prepare public GitHub requests; they never claim or publish lots. */
export function createAddProjectFlow({ dialog, projects, city, onOpen, onClose, onSelectExisting, onSubmit }) {
  const $ = (id) => dialog.querySelector(`#${id}`);
  let preview = null, previewGeneration = 0, opener = null;
  let chosenStyle = defaultLotStyle("tools"), titleEdited = false, districtEdited = false;
  let duplicate = null;
  let memoryDraft = null;
  const lots = buildCityLots(projects, city);
  const draftFields = ["url", "title", "description", "district", "slot"];
  for (const d of city.districts) {
    const option = new Option(d.name, d.id);
    $("add-district").append(option);
  }
  for (const style of LOT_STYLES) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.style = style.id;
    button.textContent = style.label;
    button.title = style.description;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      setStyle(style.id);
      saveDraft();
    });
    $("add-styles").append(button);
  }
  function setStyle(id) {
    chosenStyle = LOT_STYLES.some((style) => style.id === id) ? id : defaultLotStyle($("add-district").value);
    for (const button of $("add-styles").children) button.setAttribute("aria-pressed", String(button.dataset.style === chosenStyle));
    const style = LOT_STYLES.find((s) => s.id === chosenStyle);
    $("add-style-name").textContent = style?.label || chosenStyle;
    preview?.setStyle(chosenStyle);
  }
  function saveDraft() {
    const draft = Object.fromEntries(draftFields.map((field) => [field, $(`add-${field}`).value]));
    draft.lotStyle = chosenStyle;
    memoryDraft = draft;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      $("add-draft-note").textContent = "Draft saved on this device.";
    } catch {
      $("add-draft-note").textContent = "Storage is unavailable. Your draft stays while this page is open.";
    }
  }
  function loadDraft() {
    if (memoryDraft) return memoryDraft;
    try {
      const value = JSON.parse(localStorage.getItem(DRAFT_KEY));
      return value && typeof value === "object" ? value : {};
    } catch { return {}; }
  }
  function populateSlots(preferred = "") {
    const district = $("add-district").value;
    const available = lots.filter((l) => l.district === district && !l.project);
    $("add-slot").replaceChildren(new Option("Choose an empty lot for me", ""));
    for (const lot of available) $("add-slot").append(new Option(`${lot.displayNumber} · ${lot.slotId}`, lot.slotId));
    if (available.some((l) => l.slotId === preferred)) $("add-slot").value = preferred;
    updateSummary();
  }
  function currentLot() {
    return chooseOpenLot(projects, city, { district: $("add-district").value, slotId: $("add-slot").value || undefined });
  }
  function updateSummary() {
    const lot = currentLot();
    const name = city.districts.find((d) => d.id === $("add-district").value)?.name;
    $("add-lot-summary").textContent = lot ? `${name} / ${lot.displayNumber}` : `${name} is full. Choose another neighborhood.`;
    $("add-preview-title").textContent = $("add-title").value.trim() || "Your next big idea";
    $("add-submit").disabled = !lot || !!duplicate;
  }
  function checkDuplicate() {
    duplicate = findDuplicateProject(projects, $("add-url").value.trim(), document.baseURI);
    $("add-duplicate").hidden = !duplicate;
    if (duplicate) $("add-duplicate-name").textContent = `${duplicate.title} is already in the city.`;
    updateSummary();
  }
  function inferLink() {
    const inferred = inferProjectDetails($("add-url").value.trim());
    if (!titleEdited && inferred.title) $("add-title").value = inferred.title;
    if (!districtEdited && inferred.district && $("add-district").value !== inferred.district) {
      $("add-district").value = inferred.district;
      populateSlots();
      setStyle(defaultLotStyle(inferred.district));
    }
    checkDuplicate();
    saveDraft();
  }
  async function showPreview() {
    const generation = ++previewGeneration;
    $("add-preview-fallback").hidden = false;
    $("add-preview-fallback").textContent = "Loading your building…";
    try {
      const { createLotPreview } = await import("./lot-preview.js");
      if (!dialog.open || generation !== previewGeneration) return;
      preview = createLotPreview({ canvas: $("add-preview-canvas"), onUnavailable(message) {
        $("add-preview-fallback").textContent = message || "Your selected style will appear on your approved lot.";
        $("add-preview-fallback").hidden = false;
      } });
      $("add-preview-fallback").hidden = $("add-preview-canvas").dataset.previewState !== "unavailable";
      preview.setStyle(chosenStyle);
    } catch {
      $("add-preview-fallback").textContent = "Your selected style will appear on your approved lot.";
    }
  }
  function reset(discardDraft = true) {
    $("add-project-form").reset();
    $("add-district").value = "tools";
    titleEdited = districtEdited = false;
    duplicate = null;
    populateSlots();
    setStyle(defaultLotStyle("tools"));
    $("add-duplicate").hidden = true;
    $("add-handoff").hidden = true;
    $("add-error").hidden = true;
    if (discardDraft) {
      memoryDraft = {};
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
    }
    $("add-draft-note").textContent = "Your unfinished draft stays on this device.";
  }
  $("add-url").addEventListener("input", inferLink);
  $("add-title").addEventListener("input", () => { titleEdited = true; updateSummary(); saveDraft(); });
  $("add-description").addEventListener("input", saveDraft);
  $("add-district").addEventListener("change", () => {
    districtEdited = true;
    populateSlots();
    setStyle(defaultLotStyle($("add-district").value));
    saveDraft();
  });
  $("add-slot").addEventListener("change", () => { updateSummary(); saveDraft(); });
  $("add-reset").addEventListener("click", () => reset());
  $("add-close").addEventListener("click", () => dialog.close());
  $("add-visit-existing").addEventListener("click", () => {
    const project = duplicate;
    dialog.close();
    if (project) onSelectExisting?.(project.id);
  });
  $("add-project-form").addEventListener("submit", (event) => {
    event.preventDefault();
    $("add-error").hidden = true;
    checkDuplicate();
    if (duplicate) return;
    try {
      const lot = currentLot();
      const target = buildContributionUrl(lot, {
        direct: true,
        title: $("add-title").value.trim(),
        url: $("add-url").value.trim(),
        description: $("add-description").value.trim(),
        lotStyle: chosenStyle,
      });
      $("add-handoff-link").href = target;
      $("add-handoff").hidden = false;
      window.open(target, "_blank", "noopener,noreferrer");
      saveDraft();
      onSubmit?.(lot);
      $("add-handoff").scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (error) {
      $("add-error").textContent = error.message;
      $("add-error").hidden = false;
    }
  });
  dialog.addEventListener("close", () => {
    previewGeneration++;
    preview?.dispose();
    preview = null;
    onClose?.();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  });
  return {
    open({ lot, district } = {}) {
      if (dialog.open) return;
      opener = document.activeElement;
      const draft = loadDraft();
      reset(false);
      for (const field of ["url", "title", "description"]) if (typeof draft[field] === "string") $(`add-${field}`).value = draft[field].slice(0, field === "description" ? 500 : field === "title" ? 80 : 2000);
      const requestedDistrict = lot?.district || district || draft.district || "tools";
      $("add-district").value = city.districts.some((d) => d.id === requestedDistrict) ? requestedDistrict : "tools";
      titleEdited = !!$("add-title").value;
      districtEdited = !!lot || !!district || !!draft.district;
      populateSlots(lot?.slotId || draft.slot);
      setStyle(draft.lotStyle || defaultLotStyle($("add-district").value));
      checkDuplicate();
      if (draft.url || draft.title) saveDraft();
      dialog.showModal();
      onOpen?.();
      showPreview();
      $("add-url").focus({ preventScroll: true });
    },
    close() { dialog.close(); },
  };
}
