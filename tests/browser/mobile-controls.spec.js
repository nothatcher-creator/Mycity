import { test, expect } from "@playwright/test";

test("landscape touch devices get directional controls and can actually fly", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 900, height: 420 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await page.goto(
      process.env.DISTRICT_TEST_URL || "http://localhost:5188/Mycity/",
    );
    await expect(page.locator("#touch-controls")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("#flight-forward")).toBeVisible();
    await expect(page.locator("#world-canvas")).toHaveAttribute(
      "data-ready",
      "true",
      { timeout: 60000 },
    );
    const before = await page.locator("#player-coordinates").textContent();
    const button = await page.locator("#flight-forward").boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          x: button.x + button.width / 2,
          y: button.y + button.height / 2,
          id: 1,
        },
      ],
    });
    try {
      await expect
        .poll(() => page.locator("#player-coordinates").textContent(), {
          timeout: 15000,
        })
        .not.toBe(before);
    } finally {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/landscape-touch-controls.png",
    });
  } finally {
    await context.close();
  }
});
