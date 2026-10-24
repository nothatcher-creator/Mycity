export const TASKS = Object.freeze([
  {
    id: "structured-data",
    title: "Structured handoff",
    category: "JSON · TYPE ACCURACY",
    description: "Can the model return exactly the data you asked for?",
    prompt:
      'Return only a valid JSON object. Do not include Markdown fences or explanation. Use exactly these three keys: "project", "kind", and "offline". Set project to the string "Astraforge", kind to the string "creative-tool", and offline to the boolean true. No additional keys.',
    note: "Checks raw JSON, exact keys, two string values, and a boolean. Object key order and surrounding JSON whitespace do not matter.",
  },
  {
    id: "line-contract",
    title: "Follow the small print",
    category: "WRITING · CONSTRAINTS",
    description:
      "A tiny writing task with a deliberately exact output contract.",
    prompt:
      'Write exactly three lines. Line 1 must be exactly: ORBIT READY\nLine 2 must contain exactly five lowercase English words, using only letters a–z separated by single spaces. One word must be exactly "stars". You choose the other words.\nLine 3 must be exactly: END\nDo not add blank lines, punctuation, headings, or explanation. A single final newline is allowed.',
    note: "Checks line count, exact opening and ending, lowercase five-word format, and the required word. It does not judge the writing’s creativity.",
  },
  {
    id: "parallel-schedule",
    title: "The print queue",
    category: "REASONING · SCHEDULING",
    description: "Check a simple parallel-work problem with a known answer.",
    prompt:
      'A workshop has three identical printers. Each printer makes one part every six minutes. All printers start at time zero, run in parallel without delays, and must finish nine parts in total. Return only a valid JSON object with exactly these keys: "minutes" (the earliest whole number of minutes when all nine parts are finished), "waves" (the number of six-minute production waves needed), and "bottleneck" (the string "printers"). Use JSON numbers for minutes and waves. No Markdown or explanation.',
    note: "Three printers produce three parts per six-minute wave: three waves take 18 minutes. This is an answer check, not a test of hidden reasoning.",
  },
]);

function readObject(response) {
  try {
    const value = JSON.parse(response);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

/** Deterministic checks only: never executes submitted code or calls a model. */
export function evaluateResponse(taskId, response) {
  const task = TASKS.find((candidate) => candidate.id === taskId);
  if (!task) throw new RangeError(`Unknown benchmark: ${taskId}`);
  const text = typeof response === "string" ? response : "";
  const checks = [];
  const check = (id, label, passed) =>
    checks.push({ id, label, passed: Boolean(passed) });

  if (taskId === "line-contract") {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\n$/, "");
    const lines = normalized.split("\n");
    check(
      "three-lines",
      "Exactly three lines with no blank lines",
      lines.length === 3 && lines.every((line) => line.length > 0),
    );
    check(
      "heading",
      "First line is exactly ORBIT READY",
      lines[0] === "ORBIT READY",
    );
    check(
      "five-words",
      "Second line has five lowercase words and single spaces",
      /^[a-z]+(?: [a-z]+){4}$/.test(lines[1] ?? ""),
    );
    check(
      "required-word",
      "Second line includes the word stars",
      (lines[1] ?? "").split(" ").includes("stars"),
    );
    check("ending", "Third line is exactly END", lines[2] === "END");
  } else {
    const value = readObject(text);
    check("json-object", "Response is a raw JSON object", value !== null);
    if (taskId === "structured-data") {
      check(
        "exact-keys",
        "Only project, kind, and offline keys",
        exactKeys(value, ["project", "kind", "offline"]),
      );
      check(
        "project",
        "project is the string Astraforge",
        value?.project === "Astraforge",
      );
      check(
        "kind",
        "kind is the string creative-tool",
        value?.kind === "creative-tool",
      );
      check("offline", "offline is the boolean true", value?.offline === true);
    } else {
      check(
        "exact-keys",
        "Only minutes, waves, and bottleneck keys",
        exactKeys(value, ["minutes", "waves", "bottleneck"]),
      );
      check(
        "minutes",
        "Earliest completion is 18 minutes, as a number",
        value?.minutes === 18,
      );
      check("waves", "Three production waves, as a number", value?.waves === 3);
      check(
        "bottleneck",
        "bottleneck is the string printers",
        value?.bottleneck === "printers",
      );
    }
  }

  const passed = checks.filter((item) => item.passed).length;
  return {
    taskId,
    title: task.title,
    score: Math.round((passed / checks.length) * 100),
    passed,
    total: checks.length,
    checks,
  };
}
