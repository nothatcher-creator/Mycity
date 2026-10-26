import { test, expect } from "@playwright/test";

const ready = (page) =>
  expect(page.locator("#world-canvas")).toHaveAttribute("data-ready", "true", { timeout: 60000 });
const coordinates = async (page) =>
  (await page.locator("#player-coordinates").textContent()).split("·").map(Number);

// Software rendering runs at a few frames per second, so movement is judged by
// the path actually flown rather than by how long a key was held.
async function holdUntil(page, keys, done, { timeout = 60000 } = {}) {
  const path = [await coordinates(page)];
  for (const key of keys) await page.keyboard.down(key);
  try {
    const end = Date.now() + timeout;
    while (Date.now() < end && !done(path.at(-1))) {
      await page.waitForTimeout(500);
      path.push(await coordinates(page));
    }
    return path;
  } finally {
    for (const key of keys) await page.keyboard.up(key);
  }
}
// Closest approach of a flown path (as straight segments) to the plaza centre.
function closestToCentre(path) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, , az] = path[i - 1], [bx, , bz] = path[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, -(ax * dx + az * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(ax + dx * t, az + dz * t));
  }
  return best;
}

test("the beacon is solid: the cube goes around its tower at street height and over it from above", async ({ page }) => {
  test.setTimeout(240000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await ready(page);
  await page.locator("#start-flying").click();
  await page.locator("#reset-camera").click();
  await page.locator("#world-canvas").focus();
  // From the front of the plaza, W + D heads at the beacon, about 6 m off its centre.
  const ground = await holdUntil(page, ["w", "d"], ([, , z]) => z < -12);
  expect(ground.at(-1)[2], "the cube got stuck instead of sliding round").toBeLessThan(-12);
  // Flying, the cube clears the low stone drum but never enters the 3.5 m tower.
  expect(closestToCentre(ground), "the cube flew through the beacon").toBeGreaterThan(4.5);
  await page.locator("#reset-camera").click();
  await page.locator("#world-canvas").focus();
  await holdUntil(page, ["Space"], ([, y]) => y >= 24);
  const air = await holdUntil(page, ["w", "d"], ([, , z]) => z < -12);
  expect(air.at(-1)[2]).toBeLessThan(-12);
  expect(closestToCentre(air), "at altitude the cube should cross the beacon").toBeLessThan(7);
  expect(errors).toEqual([]);
});

test("exteriors beyond the old 115 m radius stream in after the first frame", async ({ page }) => {
  test.setTimeout(150000);
  await page.goto("./");
  await ready(page);
  // Only one project lot lies within 115 m of the start; the rest are farther away.
  await expect
    .poll(async () => Number(await page.locator("#world-canvas").getAttribute("data-exteriors")), { timeout: 120000 })
    .toBeGreaterThanOrEqual(5);
});

test("the city map draws every lot, names it on hover and opens it on click", async ({ page }) => {
  await page.goto("./");
  await page.locator("#library-toggle").click();
  const canvas = page.locator("#city-map-canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  let found = null;
  for (let y = box.y + 8; y < box.y + box.height && !found; y += 9)
    for (let x = box.x + 8; x < box.x + box.width && !found; x += 9) {
      await page.mouse.move(x, y);
      if (await page.locator("#city-map-tip").isVisible()) found = { x, y };
    }
  expect(found, "no lot answered to hover").not.toBeNull();
  const tip = await page.locator("#city-map-tip").textContent();
  await page.mouse.click(found.x, found.y);
  const [number, name] = tip.split(" · ");
  if (/^S\d+$/.test(number)) {
    // A showcase pedestal opens the model viewer.
    await expect(page.locator("#model-viewer")).toBeVisible();
    await expect(page.locator("#viewer-title")).toHaveText(name);
    return;
  }
  await expect(page.locator("#project-details")).toBeVisible();
  if (name.startsWith("Open lot")) await expect(page.locator("#detail-title")).toContainText("Open lot");
  else await expect(page.locator("#detail-title")).toHaveText(name);
});

test("library cards show pictures of the real buildings", async ({ page }) => {
  await page.goto("./");
  await page.locator("#library-toggle").click();
  const image = page.locator('.project-card[data-project="meridian-ironwatch"] img.lot-thumb');
  await expect(image).toHaveAttribute("src", "./thumbnails/meridian-ironwatch.webp");
  await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
  await page.locator('.project-card[data-project="astraforge"]').click();
  await expect(page.locator("#detail-art img.lot-thumb")).toHaveAttribute("src", "./thumbnails/astraforge.webp");
});

test("the Model Showcase: a pedestal is inspected with E, and the viewer shows real statistics", async ({ page }) => {
  test.setTimeout(180000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await ready(page);
  await expect(page.locator("#welcome-model-count")).toHaveText("12");
  await page.locator("#start-flying").click();
  await page.locator("[data-travel=showcase]").click();
  await expect(page.locator("#location-name")).toHaveText("Model Showcase");
  // From the library, fly to a pedestal, then inspect it with E like any lot.
  await page.locator("#library-toggle").click();
  await page.locator("#show-models").click();
  await expect(page.locator(".model-card")).toHaveCount(12);
  await page.locator('.model-card[data-model="skybound-build"]').click();
  await expect(page.locator("#viewer-canvas")).toHaveAttribute("data-state", "ready", { timeout: 90000 });
  await expect(page.locator("#viewer-stats")).toContainText("65,953");
  await expect(page.locator("#viewer-clips button")).toHaveCount(2);
  expect(await page.evaluate(() => location.hash)).toBe("#model/skybound-build");
  await page.locator("#viewer-fly").click();
  await expect(page.locator("#model-viewer")).not.toBeVisible();
  await expect(page.locator("#nearby-title")).toHaveText("Skybound: Beaconfall");
  await expect(page.locator("#interact-label")).toHaveText("Inspect");
  await page.locator("#world-canvas").focus();
  await page.keyboard.press("e");
  await expect(page.locator("#viewer-title")).toHaveText("Skybound: Beaconfall");
  await page.keyboard.press("Escape");
  await expect(page.locator("#model-viewer")).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("a shared #model link opens the viewer, and any lot's building can be viewed in 3D", async ({ page }) => {
  await page.goto("./#model/abyssal-relic-build");
  await expect(page.locator("#viewer-title")).toHaveText("Abyssal Relic", { timeout: 60000 });
  await page.locator("#viewer-close").click();
  await page.locator("#library-toggle").click();
  await page.locator('.project-card[data-project="meridian-ironwatch"]').click();
  await page.locator("#detail-model").click();
  await expect(page.locator("#viewer-title")).toHaveText("Meridian Ironwatch");
  await expect(page.locator("#viewer-canvas")).toHaveAttribute("data-state", "ready", { timeout: 90000 });
});
