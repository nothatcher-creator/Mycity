import { test, expect } from "@playwright/test";

const ready = async (page) =>
  expect(page.locator("#world-canvas")).toHaveAttribute("data-ready", "true", {
    timeout: 60000,
  });
const coordinates = async (page) =>
  (await page.locator("#player-coordinates").textContent())
    .split("·")
    .map(Number);

test("the cube really flies and neighborhood travel reaches the first original game", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await ready(page);
  await page.locator("#start-flying").click();
  const before = await page.locator("#player-coordinates").textContent();
  await page.keyboard.down("w");
  try {
    await expect
      .poll(() => page.locator("#player-coordinates").textContent(), {
        timeout: 12000,
      })
      .not.toBe(before);
  } finally {
    await page.keyboard.up("w");
  }
  await page.locator("[data-travel=games]").click();
  await expect(page.locator("#location-name")).toHaveText("Game Quarter");
  await expect(page.locator("#nearby-title")).toContainText(
    "Meridian Ironwatch",
  );
  await page.locator("#library-toggle").click();
  await page.locator("[data-district=games]").click();
  await expect(page.locator(".project-card")).toHaveCount(16);
  await expect(page.locator("[data-project=relicfall] .card-plot")).toHaveText(
    "ORIGINAL LOT 3672",
  );
  expect(errors).toEqual([]);
});

test("the map groups every project and offers 73 stable empty lots", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#library-toggle").click();
  await expect(page.locator(".project-card")).toHaveCount(23);
  await expect(page.locator(".project-card").first()).toHaveAttribute(
    "data-project",
    "astraforge",
  );
  await page.locator("[data-district=android]").click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await expect(page.locator(".project-card")).toHaveAttribute(
    "data-project",
    "balatro-modpack",
  );
  await page.locator("[data-district=mods]").click();
  await page.locator(".project-card[data-project=nexus-mods]").click();
  await expect(page.locator("#detail-title")).toContainText("Nexus Mods");
  await page.locator("#detail-close").click();
  await page.locator("[data-district=all]").click();
  await page.locator("#show-open").click();
  await expect(page.locator(".project-card")).toHaveCount(73);
  await page.locator("#project-search").fill("art-02");
  await expect(page.locator(".project-card")).toHaveCount(1);
});

test("friends are handed to real GitHub sign-in with a vacant lot and their project fields", async ({
  page,
  context,
}) => {
  await context.route("https://github.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "GitHub authentication handoff",
    }),
  );
  await page.goto("./");
  await page.locator("#build-toggle").click();
  await expect(page.locator("#add-project-dialog")).toBeVisible();
  await page.locator("#add-url").fill("https://example.com/gallery/");
  await page.locator("#add-title").fill("A friend’s art");
  await page.locator("#add-district").selectOption("art");
  await page.locator("[data-style=garden]").click();
  await page.locator("#add-description").fill("An original collection for the art district.");
  const popupPromise = page.waitForEvent("popup");
  await page.locator("#add-submit").click();
  const popup = await popupPromise;
  const target = new URL(popup.url());
  expect(target.origin).toBe("https://github.com");
  expect(target.pathname).toBe("/nothatcher-creator/Mycity/issues/new");
  expect(target.searchParams.get("body")).toContain("### Lot slot\n\nart-02");
  expect(target.searchParams.get("body")).toContain("### Project title\n\nA friend’s art");
  expect(target.searchParams.get("body")).toContain("### Lot style\n\ngarden");
  expect(target.searchParams.get("labels")).toBe("city:submission");
  await expect(page.locator("#add-handoff")).toBeVisible();
  expect(await page.locator("#open-count").textContent()).toBe("73");
  await popup.close();
});

test("add flow keeps drafts, detects existing links, and previews downloaded buildings", async ({ page }) => {
  await page.goto("./");
  await page.locator("#build-toggle").click();
  await page.locator("#add-url").fill("https://a-friend.itch.io/moon-garden");
  await expect(page.locator("#add-title")).toHaveValue("Moon Garden");
  await expect(page.locator("#add-district")).toHaveValue("games");
  await expect(page.locator("#add-lot-summary")).toContainText("G17");
  await expect(page.locator("#add-preview-canvas")).toHaveAttribute("data-preview-state", "ready", { timeout: 30000 });
  await page.screenshot({ path: "test-results/city-add-desktop.png" });
  await page.locator("[data-style=tower]").click();
  await expect(page.locator("#add-preview-canvas")).toHaveAttribute("data-preview-style", "tower");
  await page.locator("#add-close").click();
  await page.locator("#build-toggle").click();
  await expect(page.locator("#add-url")).toHaveValue("https://a-friend.itch.io/moon-garden");
  await expect(page.locator("[data-style=tower]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#add-preview-canvas")).toHaveAttribute("data-preview-state", "ready", { timeout: 30000 });
  await page.locator("#add-url").fill("https://nothatcher-creator.github.io/Astraforge/?utm_source=friend");
  await expect(page.locator("#add-duplicate")).toBeVisible();
  await expect(page.locator("#add-submit")).toBeDisabled();
  await page.locator("#add-visit-existing").click();
  await expect(page.locator("#detail-title")).toHaveText("Astraforge");
});

test("Astraforge remains the first integration and closes back to the cube", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#featured-launch").click();
  await expect(page.locator("#project-frame")).toHaveAttribute(
    "src",
    "https://nothatcher-creator.github.io/Astraforge/",
  );
  await expect(
    page.frameLocator("#project-frame").locator("body"),
  ).toContainText(/LyricForge/i, { timeout: 45000 });
  await page.locator("#player-close").click();
  await expect(page.locator("#project-player")).not.toBeVisible();
  await expect(page.locator("#project-frame")).not.toHaveAttribute("src");
});

test("the original RELICFALL game boots inside the sandbox guest player", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("./#plot/relicfall");
  await expect(page.locator("#detail-title")).toContainText("RELICFALL", {
    timeout: 60000,
  });
  await page.locator("#detail-launch").click();
  await expect(page.locator("#project-frame")).toHaveAttribute(
    "src",
    /^https:\/\/project0\.city\/sandbox\/shell\.html\?lot=3672&v=/,
  );
  await expect(page.locator("#player-loading")).not.toBeVisible({
    timeout: 90000,
  });
  await expect(page.locator("#player-status")).toContainText(
    /guest mode|Auto|Desktop|original lot/i,
  );
  await expect(
    page.frameLocator("#project-frame").locator("canvas"),
  ).toHaveCount(1);
  await expect(page.locator("#player-external")).toHaveAttribute(
    "href",
    "https://project0.city/#3672",
  );
  await page.locator("#player-close").click();
  await expect(page.locator("#project-frame")).not.toHaveAttribute("sandbox");
});

test("local history persists, exports, and clears without erasing other app data", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("another-app-sentinel", "keep"),
  );
  await page.goto("./");
  await expect(page.locator("#project-count")).toHaveText("23");
  await page.locator("#journal-toggle").click();
  await page.locator("[data-journal=device]").click();
  await expect(page.locator("#journal-events")).toContainText(
    "Arrived in Mycity",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#journal-export").click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "mycity-device-history.json",
  );
  await page.locator("#journal-clear").click();
  await expect(page.locator("#journal-events")).toContainText(
    "journal is empty",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("another-app-sentinel")),
  ).toBe("keep");
});

test("phone joystick plus altitude and boost move the cube without losing touch inputs", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await ready(page);
  await page.locator("#start-flying").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#touch-mode-toggle").click();
  const stick = await page.locator("#flight-joystick").boundingBox(),
    up = await page.locator("#flight-up").boundingBox(),
    boost = await page.locator("#flight-boost").boundingBox();
  const cdp = await context.newCDPSession(page);
  const points = [
    { x: stick.x + stick.width / 2, y: stick.y + stick.height * 0.16, id: 1 },
    { x: up.x + up.width / 2, y: up.y + up.height / 2, id: 2 },
    { x: boost.x + boost.width / 2, y: boost.y + boost.height / 2, id: 3 },
  ];
  const before = await coordinates(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points,
  });
  try {
    await expect
      .poll(
        async () => {
          const now = await coordinates(page);
          return now[1] > before[1];
        },
        { timeout: 15000 },
      )
      .toBe(true);
  } finally {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
  await expect(page.locator("#project-details")).not.toBeVisible();
  await page.screenshot({ path: "test-results/city-phone.png" });
});

test("without WebGL the map, contributions, gallery, and benchmark remain accessible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const old = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.startsWith("webgl") ? null : old.call(this, type, ...args);
    };
  });
  await page.goto("./");
  await expect(page.locator("#fallback-notice")).toBeVisible({
    timeout: 45000,
  });
  await expect(page.locator(".project-card")).toHaveCount(23);
  await page.locator(".project-card[data-project=city-gallery]").click();
  await page.locator("#detail-launch").click();
  await expect(
    page.frameLocator("#project-frame").locator(".art-card"),
  ).toHaveCount(3);
  await page.locator("#player-close").click();
  await page.locator("#detail-close").click();
  await page.locator(".project-card[data-project=bench-lab]").click();
  await page.locator("#detail-launch").click();
  const frame = page.frameLocator("#project-frame");
  await frame
    .locator("#model-response")
    .fill('{"project":"Astraforge","kind":"creative-tool","offline":true}');
  await frame.locator("#evaluate-response").click();
  await expect(frame.locator("#result-score")).toHaveText("100");
});
