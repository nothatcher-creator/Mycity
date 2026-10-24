import test from "node:test";
import assert from "node:assert/strict";

let engine = {};
try {
  engine = await import("../src/benchmark-engine.js");
} catch (error) {
  if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
}

test("structured data task grades exact types and rejects extra fields", () => {
  assert.equal(
    typeof engine.evaluateResponse,
    "function",
    "benchmark evaluator must be implemented",
  );
  const valid = engine.evaluateResponse(
    "structured-data",
    '{"project":"Astraforge","kind":"creative-tool","offline":true}',
  );
  assert.equal(valid.score, 100);
  assert.equal(valid.passed, valid.total);
  const wrongType = engine.evaluateResponse(
    "structured-data",
    '{"project":"Astraforge","kind":"creative-tool","offline":"true","extra":1}',
  );
  assert.equal(
    wrongType.checks.find((check) => check.id === "exact-keys").passed,
    false,
  );
  assert.equal(
    wrongType.checks.find((check) => check.id === "offline").passed,
    false,
  );
  assert.ok(wrongType.score < 100);
});

test("JSON-only contracts reject fences, malformed JSON, arrays, and null", () => {
  assert.equal(typeof engine.evaluateResponse, "function");
  for (const response of ["```json\n{}\n```", "{bad", "[]", "null", ""]) {
    const result = engine.evaluateResponse("structured-data", response);
    assert.equal(result.score, 0, response);
    assert.equal(
      result.checks.find((check) => check.id === "json-object").passed,
      false,
    );
  }
});

test("line contract counts words and blank lines without accepting partial headings", () => {
  assert.equal(typeof engine.evaluateResponse, "function");
  assert.equal(
    engine.evaluateResponse(
      "line-contract",
      "ORBIT READY\nwe build worlds among stars\nEND",
    ).score,
    100,
  );
  assert.equal(
    engine.evaluateResponse(
      "line-contract",
      "ORBIT READY\r\nwe build worlds among stars\r\nEND\r\n",
    ).score,
    100,
  );
  const extra = engine.evaluateResponse(
    "line-contract",
    "ORBIT READY\nwe build worlds among stars\n\nEND",
  );
  assert.equal(
    extra.checks.find((check) => check.id === "three-lines").passed,
    false,
  );
  assert.ok(extra.score < 100);
  const badWords = engine.evaluateResponse(
    "line-contract",
    "ORBIT READY!\nwe build Worlds among stars\nEND",
  );
  assert.equal(
    badWords.checks.find((check) => check.id === "heading").passed,
    false,
  );
  assert.equal(
    badWords.checks.find((check) => check.id === "five-words").passed,
    false,
  );
});

test("scheduling task distinguishes correct reasoning results from numeric strings", () => {
  assert.equal(typeof engine.evaluateResponse, "function");
  assert.equal(
    engine.evaluateResponse(
      "parallel-schedule",
      '{"minutes":18,"waves":3,"bottleneck":"printers"}',
    ).score,
    100,
  );
  const result = engine.evaluateResponse(
    "parallel-schedule",
    '{"minutes":"18","waves":9,"bottleneck":"workers"}',
  );
  assert.equal(
    result.checks.find((check) => check.id === "minutes").passed,
    false,
  );
  assert.equal(
    result.checks.find((check) => check.id === "waves").passed,
    false,
  );
  assert.equal(
    result.checks.find((check) => check.id === "bottleneck").passed,
    false,
  );
});

test("task definitions have distinct IDs and evaluator rejects unknown tasks", () => {
  assert.ok(Array.isArray(engine.TASKS));
  assert.equal(engine.TASKS.length, 3);
  assert.equal(new Set(engine.TASKS.map((task) => task.id)).size, 3);
  assert.throws(
    () => engine.evaluateResponse("missing-task", "{}"),
    /Unknown benchmark/,
  );
});
