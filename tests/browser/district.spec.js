import { test, expect } from "@playwright/test";

test("3D district renders and every plot can be reached in the library", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#world-canvas")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 45000 },
  );
  await expect(page.locator(".plot-label:visible")).toHaveCount(8);
  await page
    .getByRole("button", { name: "Plot 001: Astraforge", exact: true })
    .click();
  await expect(page.locator("#detail-title")).toHaveText("Astraforge");
  await expect(page.locator("#detail-source")).toHaveAttribute(
    "href",
    "https://github.com/nothatcher-creator/Astraforge",
  );
  await page.getByRole("button", { name: "Close project details" }).click();
  await page.getByRole("button", { name: "Library view" }).click();
  await expect(page.locator(".project-card")).toHaveCount(8);
  await expect(page.locator(".project-card").first()).toHaveAttribute(
    "data-project",
    "astraforge",
  );
  await page.screenshot({ path: "test-results/library-desktop.png" });
  expect(errors).toEqual([]);
});

test("search and category filters compose and show an empty state", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Library view" }).click();
  await page.locator("[data-category=games]").click();
  await expect(page.locator(".project-card")).toHaveCount(3);
  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill("lighthouse");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await expect(page.locator(".project-card")).toHaveAttribute(
    "data-project",
    "relicfall",
  );
  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill("no-such-project");
  await expect(page.locator("#empty-state")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search projects" }).fill("");
  await page.locator("[data-category=all]").click();
  await expect(page.locator(".project-card")).toHaveCount(8);
});

test("Astraforge opens its existing live editor and closes cleanly", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Enter Astraforge", exact: true })
    .click();
  await expect(page.locator("#project-player")).toBeVisible();
  await expect(page.locator("#project-frame")).toHaveAttribute(
    "src",
    "https://nothatcher-creator.github.io/Astraforge/",
  );
  await expect(page.locator("#player-external")).toHaveAttribute(
    "href",
    "https://nothatcher-creator.github.io/Astraforge/",
  );
  await expect(
    page.frameLocator("#project-frame").locator("body"),
  ).toContainText(/LyricForge/i, { timeout: 45000 });
  await page.screenshot({ path: "test-results/astraforge-integration.png" });
  await page
    .getByRole("button", { name: "Close app and return to district" })
    .click();
  await expect(page.locator("#project-player")).not.toBeVisible();
  await expect(page.locator("#project-frame")).not.toHaveAttribute("src");
});

test("benchmark integration resolves under Mycity and grades a real response", async ({
  page,
}) => {
  await page.goto("./#plot/bench-lab");
  await expect(page.locator("#detail-title")).toHaveText("Bench Lab", {
    timeout: 45000,
  });
  await page
    .getByRole("button", { name: "Enter Bench Lab", exact: true })
    .click();
  await expect(page.locator("#project-frame")).toHaveAttribute(
    "src",
    /\/Mycity\/benchmarks\/$/,
  );
  const frame = page.frameLocator("#project-frame");
  await expect(
    frame.getByRole("heading", { name: /Measure the response/ }),
  ).toBeVisible();
  await frame.locator("#model-name").fill("Smoke test model");
  await frame
    .locator("#model-response")
    .fill('{"project":"Astraforge","kind":"creative-tool","offline":true}');
  await frame.locator("#evaluate-response").click();
  await expect(frame.locator("#result-score")).toHaveText("100");
  await expect(frame.locator("#history-count")).toHaveText("1");
});

test("a device without WebGL can still launch every catalog project", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.startsWith("webgl")
        ? null
        : original.call(this, type, ...args);
    };
  });
  await page.goto("./");
  await expect(page.locator("#fallback-notice")).toBeVisible({
    timeout: 45000,
  });
  await expect(page.locator(".project-card")).toHaveCount(8);
  await page.locator(".project-card").first().click();
  await expect(page.locator("#detail-title")).toHaveText("Astraforge");
});

test("phone layout has no overflow and pinch does not accidentally select a plot", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(page.locator("#world-canvas")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 45000 },
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#world-canvas").scrollIntoViewIfNeeded();
  const box = await page.locator("#world-canvas").boundingBox();
  const x = box.x + box.width / 2,
    y = Math.min(box.y + box.height * 0.4, 650);
  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: x - 30, y, id: 1 },
      { x: x + 30, y, id: 2 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: x - 65, y, id: 1 },
      { x: x + 65, y, id: 2 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator("#project-details")).not.toBeVisible();
  await page.screenshot({
    path: "test-results/district-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Library view" }).click();
  await expect(page.locator(".project-card")).toHaveCount(8);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
