#!/usr/bin/env node
import { readFile, writeFile, rename, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { publishSubmission } from "../src/community.js";
export { parseIssueForm, publishSubmission } from "../src/community.js";

function argumentsFrom(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    if (
      !["--event", "--catalog", "--city", "--activity"].includes(name) ||
      !values[index + 1]
    ) {
      throw new Error(
        "Use --event PATH [--catalog PATH --city PATH --activity PATH]",
      );
    }
    result[name.slice(2)] = values[index + 1];
  }
  return result;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
async function writeJson(path, data) {
  const staged = `${path}.community-tmp`;
  await writeFile(staged, `${JSON.stringify(data, null, 2)}\n`);
  await rename(staged, path);
}

export async function main(
  args = process.argv.slice(2),
  environment = process.env,
) {
  const options = argumentsFrom(args);
  const eventPath = options.event || environment.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("An approval event snapshot is required");
  const event = await readJson(eventPath);
  const owner = event.repository?.owner?.login;
  if (
    event.repository?.full_name !== "nothatcher-creator/Mycity" ||
    owner !== "nothatcher-creator" ||
    event.action !== "labeled" ||
    event.label?.name !== "city:approved" ||
    event.sender?.login?.toLowerCase() !== owner.toLowerCase()
  ) {
    throw new Error(
      "This must be a city:approved label applied by the Mycity repository owner",
    );
  }
  const catalogPath = options.catalog || "public/projects.json";
  const cityPath = options.city || "public/city.json";
  const activityPath = options.activity || "public/city-activity.json";
  const result = publishSubmission({
    catalog: await readJson(catalogPath),
    city: await readJson(cityPath),
    activity: await readJson(activityPath),
    issue: event.issue,
    approver: event.sender.login,
    repoOwner: owner,
  });
  if (result.changed) {
    await writeJson(catalogPath, result.catalog);
    await writeJson(activityPath, result.activity);
  }
  if (environment.GITHUB_OUTPUT)
    await appendFile(environment.GITHUB_OUTPUT, `changed=${result.changed}\n`);
  console.log(
    JSON.stringify({
      changed: result.changed,
      project: result.project.id,
      slot: result.project.slot,
    }),
  );
  return result;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
