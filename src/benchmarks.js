import "./benchmarks.css";
import { TASKS, evaluateResponse } from "./benchmark-engine.js";

const byId = (id) => document.getElementById(id);
const storageKey = "nothatcher-district:bench-runs:v1";
const select = byId("task-select");
const responseField = byId("model-response");
const modelField = byId("model-name");
let runs = [];
let storageAvailable = true;
let downloadUrl;

function notice(message, warning = false) {
  const element = byId("app-notice");
  element.textContent = message;
  element.classList.toggle("warning", warning);
  element.hidden = !message;
}

function currentTask() {
  return TASKS.find((task) => task.id === select.value) ?? TASKS[0];
}

function showResult(result, announce = true) {
  byId("evaluation-result").hidden = false;
  byId("result-score").textContent = result.score;
  byId("result-title").textContent =
    result.score === 100 ? "Contract complete." : "Room to improve.";
  byId("result-summary").textContent =
    `${result.passed} of ${result.total} checks passed · ${result.title}`;
  byId("grading-note").textContent = currentTask().note;
  byId("result-checks").replaceChildren(
    ...result.checks.map((check) => {
      const item = document.createElement("li");
      item.className = check.passed ? "passed" : "failed";
      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = check.passed ? "✓" : "×";
      const label = document.createElement("span");
      label.textContent = check.label;
      const status = document.createElement("strong");
      status.textContent = check.passed ? "PASS" : "FAIL";
      item.append(icon, label, status);
      return item;
    }),
  );
  if (announce)
    byId("evaluation-announcement").textContent =
      `Score ${result.score} out of 100. ${result.passed} of ${result.total} checks passed.`;
}

function showTask() {
  const task = currentTask();
  byId("challenge-title").textContent = task.title;
  byId("task-category").textContent = task.category;
  byId("task-description").textContent = task.description;
  byId("task-prompt").textContent = task.prompt;
  byId("grading-note").textContent = task.note;
  byId("evaluation-result").hidden = true;
  byId("evaluation-announcement").textContent = "";
  notice("");
}

function saveRuns() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(runs));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  if (!storageAvailable)
    notice(
      "Browser storage is unavailable. Runs are kept for this session; export JSON to keep a copy.",
      true,
    );
}

function renderHistory() {
  byId("history-count").textContent = runs.length;
  byId("history-empty").hidden = runs.length > 0;
  byId("export-history").disabled = runs.length === 0;
  byId("clear-history").disabled = runs.length === 0;
  byId("history-list").replaceChildren(
    ...runs.map((run) => {
      const result = evaluateResponse(run.taskId, run.response);
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      const label = document.createElement("span");
      const model = document.createElement("strong");
      model.textContent = run.model || "Unnamed model";
      const description = document.createElement("small");
      description.textContent = `${result.title} · ${new Date(run.timestamp).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
      label.append(model, description);
      const score = document.createElement("span");
      score.className = "history-score";
      score.textContent = `${result.score}/100`;
      button.append(label, score);
      button.setAttribute(
        "aria-label",
        `Review ${run.model || "unnamed model"}, ${result.title}, score ${result.score} out of 100`,
      );
      button.addEventListener("click", () => {
        select.value = run.taskId;
        showTask();
        modelField.value = run.model;
        responseField.value = run.response;
        showResult(result);
        byId("evaluation-result").scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
          block: "nearest",
        });
      });
      item.append(button);
      return item;
    }),
  );
}

for (const task of TASKS) {
  const option = document.createElement("option");
  option.value = task.id;
  option.textContent = task.title;
  select.append(option);
}

try {
  const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
  if (!Array.isArray(saved)) throw new Error("Invalid history");
  runs = saved
    .filter(
      (run) =>
        run &&
        TASKS.some((task) => task.id === run.taskId) &&
        typeof run.response === "string" &&
        run.response.length <= 40000 &&
        typeof run.model === "string" &&
        run.model.length <= 80 &&
        typeof run.timestamp === "string" &&
        Number.isFinite(Date.parse(run.timestamp)),
    )
    .slice(0, 10);
} catch {
  storageAvailable = false;
}

select.addEventListener("change", showTask);
byId("copy-prompt").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentTask().prompt);
    notice(
      "Prompt copied. Run it in your model, then paste the complete response.",
    );
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(byId("task-prompt"));
    selection?.removeAllRanges();
    selection?.addRange(range);
    notice(
      "Clipboard access is unavailable. The prompt is selected so you can copy it manually.",
      true,
    );
    byId("task-prompt").focus();
  }
});

byId("benchmark-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!responseField.value.trim()) {
    notice("Paste a model response before evaluating.", true);
    responseField.focus();
    return;
  }
  const task = currentTask();
  const result = evaluateResponse(task.id, responseField.value);
  notice("");
  showResult(result);
  runs.unshift({
    id:
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    taskId: task.id,
    model: modelField.value.trim(),
    response: responseField.value,
    timestamp: new Date().toISOString(),
    ...result,
  });
  runs = runs.slice(0, 10);
  saveRuns();
  renderHistory();
});

byId("clear-history").addEventListener("click", () => {
  runs = [];
  try {
    localStorage.removeItem(storageKey);
  } catch {
    notice(
      "Notebook cleared for this session. Browser storage could not be changed.",
      true,
    );
  }
  renderHistory();
});

byId("export-history").addEventListener("click", () => {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  const exportData = {
    format: "nothatcher-bench-lab-v1",
    exportedAt: new Date().toISOString(),
    scope:
      "Deterministic local response-contract checks; no model calls or intelligence ranking.",
    tasks: TASKS,
    runs: runs.map((run) => ({
      ...run,
      ...evaluateResponse(run.taskId, run.response),
    })),
  };
  downloadUrl = URL.createObjectURL(
    new Blob([JSON.stringify(exportData, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = `bench-lab-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  notice("JSON export downloaded with prompts, responses, and every check.");
});
window.addEventListener("pagehide", () => {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
});

showTask();
renderHistory();
if (!storageAvailable)
  notice(
    "Saved history could not be loaded. The lab still works; export results to keep them.",
    true,
  );
