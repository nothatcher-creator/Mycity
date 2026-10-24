const REPOSITORY = "nothatcher-creator/Mycity";
const REPOSITORY_OWNER = "nothatcher-creator";
const DISTRICTS = new Set(["games", "tools", "art", "android", "mods"]);
const THEMES = {
  games: "lighthouse",
  tools: "workshop",
  art: "gallery",
  android: "android",
  mods: "cards",
};
const FORM_FIELDS = new Map([
  ["lot slot", "slot"],
  ["neighborhood", "district"],
  ["project title", "title"],
  ["project url", "url"],
  ["description", "description"],
]);

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function validateSlot(slot, district) {
  requireValue(
    typeof slot === "string" &&
      typeof district === "string" &&
      DISTRICTS.has(district),
    "Invalid lot slot or neighborhood",
  );
  const match = /^([a-z]+)-(\d{2,})$/.exec(slot);
  requireValue(
    match &&
      match[1] === district &&
      Number(match[2]) > 0 &&
      slot === `${district}-${String(Number(match[2])).padStart(2, "0")}`,
    "Invalid lot slot or neighborhood",
  );
  return Number(match[2]);
}

function publicProjectUrl(raw) {
  requireValue(
    typeof raw === "string" &&
      raw === raw.trim() &&
      !/[\u0000-\u0020\\]/.test(raw),
    "Invalid project URL",
  );
  let value;
  try {
    value = new URL(raw);
  } catch {
    throw new Error("Invalid project URL");
  }
  requireValue(
    value.protocol === "https:" && !value.username && !value.password,
    "Project URL must use HTTPS without credentials",
  );
  const host = value.hostname.toLowerCase();
  requireValue(
    host.includes(".") &&
      !host.endsWith(".local") &&
      !host.endsWith(".localhost") &&
      !/^\d+(?:\.\d+){3}$/.test(host) &&
      !host.includes(":") &&
      /^[a-z0-9.-]+$/.test(host) &&
      /\.[a-z]{2,}$/.test(host),
    "Project URL must use a public domain name",
  );
  return value.href;
}

/** GitHub supplies the real authentication. This creates no in-world session. */
export function buildContributionUrl(lot, { title, url, description } = {}) {
  requireValue(
    lot && lot.project === null,
    "Choose a vacant lot to submit a project",
  );
  validateSlot(lot.slotId, lot.district);
  const destination = new URL(`https://github.com/${REPOSITORY}/issues/new`);
  destination.searchParams.set("template", "city-lot.yml");
  destination.searchParams.set(
    "title",
    `[City lot] ${lot.slotId}${title ? `: ${String(title).slice(0, 80)}` : ""}`,
  );
  destination.searchParams.set("slot", lot.slotId);
  destination.searchParams.set("district", lot.district);
  if (title)
    destination.searchParams.set("project_title", String(title).slice(0, 80));
  if (url) destination.searchParams.set("project_url", String(url));
  if (description)
    destination.searchParams.set(
      "description",
      String(description).slice(0, 500),
    );
  return destination.href;
}

/** Parse the immutable issue body captured when the owner approved the label. */
export function parseIssueForm(body) {
  requireValue(
    typeof body === "string" && body.length <= 12000,
    "Invalid issue form body",
  );
  const text = body.replace(/\r\n/g, "\n");
  const headings = [...text.matchAll(/^### ([^\n]+)\n/gm)];
  const result = {};
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    const field = FORM_FIELDS.get(heading[1].trim().toLowerCase());
    requireValue(field, `Unknown issue form section: ${heading[1].trim()}`);
    requireValue(
      !Object.hasOwn(result, field),
      `Duplicate issue form section: ${heading[1].trim()}`,
    );
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? text.length;
    const value = text.slice(start, end).trim();
    requireValue(
      value && value !== "_No response_",
      `Missing issue form field: ${field}`,
    );
    result[field] = value;
  }
  for (const field of FORM_FIELDS.values()) {
    requireValue(
      Object.hasOwn(result, field),
      `Missing issue form field: ${field}`,
    );
  }
  return result;
}

/** Data-only publication. Submitted pages, code and repositories are never run. */
export function publishSubmission({
  catalog,
  city,
  activity,
  issue,
  approver,
  now = new Date().toISOString(),
  repoOwner = REPOSITORY_OWNER,
}) {
  requireValue(
    typeof approver === "string" &&
      approver.toLowerCase() === repoOwner.toLowerCase(),
    "Only the repository owner can approve community lots",
  );
  requireValue(
    Array.isArray(catalog) && Array.isArray(activity),
    "Invalid catalog or activity index",
  );
  requireValue(
    issue && Number.isSafeInteger(issue.number) && issue.number > 0,
    "Invalid source issue number",
  );
  const issueUrl = `https://github.com/${REPOSITORY}/issues/${issue.number}`;
  requireValue(
    issue.html_url === issueUrl,
    "Issue does not belong to this city repository",
  );
  const login = issue.user?.login;
  requireValue(
    typeof login === "string" &&
      /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login),
    "Invalid GitHub issue author",
  );

  const existing = catalog.find(
    (project) =>
      project.submission?.issue === issue.number &&
      project.submission?.url === issueUrl,
  );
  if (existing)
    return {
      catalog: [...catalog],
      activity: [...activity],
      changed: false,
      project: existing,
    };
  requireValue(
    issue.state === "open",
    "The source issue must be open when approved",
  );
  const fields = parseIssueForm(issue.body);
  const slotIndex = validateSlot(fields.slot, fields.district);
  const districts = Array.isArray(city) ? city : city?.districts;
  const district = Array.isArray(districts)
    ? districts.find((item) => item.id === fields.district)
    : null;
  requireValue(
    district &&
      Number.isSafeInteger(district.slotCount) &&
      slotIndex <= district.slotCount,
    "The requested slot is not in this city neighborhood",
  );
  requireValue(
    !catalog.some((project) => project.slot === fields.slot),
    "The requested slot is already occupied",
  );
  requireValue(
    fields.title.length <= 80 && !/[\u0000-\u001f\u007f]/.test(fields.title),
    "Project title must be at most 80 characters on one line",
  );
  requireValue(
    fields.description.length <= 500 &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(
        fields.description,
      ),
    "Project description must be at most 500 characters",
  );
  const destination = publicProjectUrl(fields.url);
  const projectId = `community-${issue.number}`;
  requireValue(
    !catalog.some((project) => project.id === projectId),
    "A different project already uses this issue identity",
  );
  const plots = new Set(catalog.map((project) => project.plot));
  let plot = 10000 + issue.number;
  while (plots.has(plot)) plot++;
  requireValue(
    Number.isSafeInteger(plot),
    "Could not allocate a unique project plot",
  );
  const date = new Date(now);
  requireValue(!Number.isNaN(date.getTime()), "Invalid publication timestamp");
  const approvedAt = date.toISOString();
  const project = {
    id: projectId,
    plot,
    slot: fields.slot,
    district: fields.district,
    title: fields.title,
    subtitle: `By ${login}`,
    description: fields.description,
    category: fields.district,
    url: destination,
    embed: false,
    theme: THEMES[fields.district],
    tags: ["Community", login],
    owner: { login, url: `https://github.com/${login}` },
    submission: {
      issue: issue.number,
      url: issueUrl,
      approvedBy: repoOwner,
      approvedAt,
    },
  };
  const event = {
    id: `community-issue-${issue.number}`,
    type: "lot-published",
    at: approvedAt,
    actor: login,
    approvedBy: repoOwner,
    slotId: fields.slot,
    district: fields.district,
    projectId,
    title: "Community lot published",
    message: `${login} added ${fields.title} to ${fields.slot}.`,
    url: issueUrl,
  };
  return {
    catalog: [...catalog, project],
    activity: [event, ...activity],
    changed: true,
    project,
  };
}
