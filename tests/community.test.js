import test from "node:test";
import assert from "node:assert/strict";
import {
  buildContributionUrl,
  parseIssueForm,
  publishSubmission,
} from "../src/community.js";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main as importApproval } from "../scripts/publish-community-lot.js";

const city = {
  districts: [
    { id: "games", slotCount: 32 },
    { id: "tools", slotCount: 16 },
    { id: "art", slotCount: 16 },
    { id: "android", slotCount: 16 },
    { id: "mods", slotCount: 16 },
  ],
};
const first = {
  id: "astraforge",
  plot: 1,
  title: "Astraforge",
  district: "tools",
  slot: "tools-01",
};
const fields = {
  slot: "tools-02",
  district: "tools",
  title: "Friend Workshop",
  url: "https://friend.example/app/",
  description: "A browser project from a friend.",
};
function body(values = fields) {
  return `### Lot slot\n\n${values.slot}\n\n### Neighborhood\n\n${values.district}\n\n### Project title\n\n${values.title}\n\n### Project URL\n\n${values.url}\n\n### Description\n\n${values.description}\n`;
}
function issue(changes = {}) {
  return {
    number: 47,
    state: "open",
    body: body(),
    html_url: "https://github.com/nothatcher-creator/Mycity/issues/47",
    user: { login: "friend-one", html_url: "https://github.com/friend-one" },
    ...changes,
  };
}
function publish(changes = {}) {
  return publishSubmission({
    catalog: [first],
    city,
    activity: [],
    issue: issue(),
    approver: "nothatcher-creator",
    now: "2026-10-24T15:00:00Z",
    ...changes,
  });
}

test("vacant lot links use GitHub sign-in and prefill the real slot", () => {
  const url = new URL(
    buildContributionUrl(
      {
        slotId: "games-09",
        district: "games",
        project: null,
        title: "Vacant lot",
      },
      {
        title: "My game",
        url: "https://friend.example/game/",
        description: "Test project",
      },
    ),
  );
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.pathname, "/nothatcher-creator/Mycity/issues/new");
  assert.equal(url.searchParams.get("template"), "city-lot.yml");
  assert.equal(url.searchParams.get("slot"), "games-09");
  assert.equal(url.searchParams.get("district"), "games");
  assert.equal(url.searchParams.get("project_title"), "My game");
  assert.equal(
    url.searchParams.get("project_url"),
    "https://friend.example/game/",
  );
  assert.throws(
    () =>
      buildContributionUrl({
        slotId: "tools-01",
        district: "tools",
        project: first,
      }),
    /vacant|empty/i,
  );
});
test("issue form parsing handles GitHub headings and rejects missing or duplicate sections", () => {
  assert.deepEqual(parseIssueForm(body().replaceAll("\n", "\r\n")), fields);
  assert.throws(
    () => parseIssueForm(body() + "\n### Lot slot\n\ntools-03"),
    /duplicate/i,
  );
  assert.throws(() => parseIssueForm("### Lot slot\n\ntools-02"), /missing/i);
  assert.throws(
    () => parseIssueForm(body({ ...fields, title: "_No response_" })),
    /missing/i,
  );
});
test("only the repository owner can approve a publication", () => {
  assert.throws(() => publish({ approver: "friend-one" }), /owner/i);
  const result = publish({ approver: "Nothatcher-Creator" });
  assert.equal(result.changed, true);
});
test("approved publication preserves existing projects and records actual GitHub authorship", () => {
  const catalog = [structuredClone(first)],
    activity = [];
  const result = publish({ catalog, activity });
  assert.equal(result.changed, true);
  assert.equal(result.catalog[0].id, "astraforge");
  assert.equal(result.catalog[0].plot, 1);
  assert.equal(result.project.id, "community-47");
  assert.equal(result.project.plot, 10047);
  assert.equal(result.project.slot, "tools-02");
  assert.equal(result.project.district, "tools");
  assert.equal(result.project.category, "tools");
  assert.equal(result.project.embed, false);
  assert.deepEqual(result.project.owner, {
    login: "friend-one",
    url: "https://github.com/friend-one",
  });
  assert.equal(result.project.submission.issue, 47);
  assert.equal(result.project.submission.approvedBy, "nothatcher-creator");
  assert.equal(result.activity[0].type, "lot-published");
  assert.equal(result.activity[0].actor, "friend-one");
  assert.equal(result.activity[0].slotId, "tools-02");
  assert.equal(catalog.length, 1);
  assert.equal(activity.length, 0);
});
test("another issue cannot overwrite an occupied slot and invalid slot aliases are rejected", () => {
  assert.throws(
    () =>
      publish({
        catalog: [
          first,
          { id: "other", plot: 12, slot: "tools-02", district: "tools" },
        ],
      }),
    /occupied/i,
  );
  for (const value of [
    { slot: "tools-17" },
    { slot: "tools-002" },
    { slot: "games-02" },
    { district: "unknown" },
  ]) {
    assert.throws(
      () => publish({ issue: issue({ body: body({ ...fields, ...value }) }) }),
      /slot|district|neighborhood/i,
    );
  }
});
test("a repeated approval is idempotent even when the original issue has since been edited", () => {
  const firstRun = publish();
  const repeated = publish({
    catalog: firstRun.catalog,
    activity: firstRun.activity,
    issue: issue({ body: "Edited after publication" }),
  });
  assert.equal(repeated.changed, false);
  assert.equal(repeated.catalog.length, 2);
  assert.equal(repeated.activity.length, 1);
  assert.deepEqual(repeated.project, firstRun.project);
});
test("unsafe URLs, excessive content and forged issue identity cannot be published", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "http://example.com",
    "//example.com",
    "https://user:password@example.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://service.local",
  ]) {
    assert.throws(
      () => publish({ issue: issue({ body: body({ ...fields, url }) }) }),
      /URL/i,
    );
  }
  assert.throws(
    () =>
      publish({
        issue: issue({ body: body({ ...fields, title: "a".repeat(81) }) }),
      }),
    /title/i,
  );
  assert.throws(
    () =>
      publish({
        issue: issue({
          body: body({ ...fields, description: "a".repeat(501) }),
        }),
      }),
    /description/i,
  );
  assert.throws(
    () =>
      publish({
        issue: issue({ html_url: "https://github.com/other/repo/issues/47" }),
      }),
    /issue/i,
  );
  assert.throws(
    () => publish({ issue: issue({ user: { login: "<script>" } }) }),
    /author/i,
  );
});
test("plot allocation cannot collide with an existing project", () => {
  const result = publish({
    catalog: [
      first,
      { id: "existing", plot: 10047, slot: "games-01", district: "games" },
    ],
  });
  assert.equal(result.project.plot, 10048);
});
test("the CLI rejects forged event approval before touching catalog files", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "mycity-community-"));
  try {
    const event = join(temporary, "event.json"),
      catalog = join(temporary, "projects.json"),
      configuration = join(temporary, "city.json"),
      activity = join(temporary, "activity.json");
    await writeFile(catalog, JSON.stringify([first]));
    await writeFile(configuration, JSON.stringify(city));
    await writeFile(activity, "[]");
    await writeFile(
      event,
      JSON.stringify({
        action: "labeled",
        repository: {
          full_name: "nothatcher-creator/Mycity",
          owner: { login: "nothatcher-creator" },
        },
        label: { name: "city:approved" },
        sender: { login: "friend-one" },
        issue: issue(),
      }),
    );
    await assert.rejects(
      importApproval(
        [
          "--event",
          event,
          "--catalog",
          catalog,
          "--city",
          configuration,
          "--activity",
          activity,
        ],
        {},
      ),
      /owner/i,
    );
    assert.deepEqual(JSON.parse(await readFile(catalog, "utf8")), [first]);
    assert.deepEqual(JSON.parse(await readFile(activity, "utf8")), []);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
test("the CLI imports its approved snapshot and writes a deterministic no-op on retry", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "mycity-community-"));
  try {
    const event = join(temporary, "event.json"),
      catalog = join(temporary, "projects.json"),
      configuration = join(temporary, "city.json"),
      activity = join(temporary, "activity.json"),
      output = join(temporary, "outputs.txt");
    await writeFile(catalog, JSON.stringify([first]));
    await writeFile(configuration, JSON.stringify(city));
    await writeFile(activity, "[]");
    await writeFile(
      event,
      JSON.stringify({
        action: "labeled",
        repository: {
          full_name: "nothatcher-creator/Mycity",
          owner: { login: "nothatcher-creator" },
        },
        label: { name: "city:approved" },
        sender: { login: "nothatcher-creator" },
        issue: issue(),
      }),
    );
    const args = [
      "--event",
      event,
      "--catalog",
      catalog,
      "--city",
      configuration,
      "--activity",
      activity,
    ];
    await importApproval(args, { GITHUB_OUTPUT: output });
    const published = await readFile(catalog, "utf8"),
      journal = await readFile(activity, "utf8");
    assert.equal(JSON.parse(published)[1].owner.login, "friend-one");
    await importApproval(args, { GITHUB_OUTPUT: output });
    assert.equal(await readFile(catalog, "utf8"), published);
    assert.equal(await readFile(activity, "utf8"), journal);
    assert.equal(
      await readFile(output, "utf8"),
      "changed=true\nchanged=false\n",
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
