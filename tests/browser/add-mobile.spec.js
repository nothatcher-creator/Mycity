import { test, expect } from "@playwright/test";

test("phone contribution flow remains usable without graphics or persistent storage", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      const old = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type.startsWith("webgl") ? null : old.call(this, type, ...args);
      };
      Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage blocked", "SecurityError"); } });
    });
    await page.goto(process.env.DISTRICT_TEST_URL || "http://localhost:5188/Mycity/");
    await page.locator("#build-toggle").tap();
    await page.locator("#add-url").fill("https://friend.itch.io/lighthouse-mystery");
    await expect(page.locator("#add-district")).toHaveValue("games");
    await expect(page.locator("#add-title")).toHaveValue("Lighthouse Mystery");
    await expect(page.locator("#add-draft-note")).toContainText("Storage is unavailable");
    await expect(page.locator("#add-preview-fallback")).toBeVisible();
    const horizontalOverflow = await page.locator("#add-project-dialog").evaluate((dialog) => dialog.scrollWidth > dialog.clientWidth + 1);
    expect(horizontalOverflow).toBe(false);
    await page.locator("#add-close").tap();
    await page.locator("#build-toggle").tap();
    await expect(page.locator("#add-title")).toHaveValue("Lighthouse Mystery");
    await page.locator("#add-submit").scrollIntoViewIfNeeded();
    await expect(page.locator("#add-submit")).toBeInViewport();
    await page.screenshot({ path: "test-results/city-add-phone.png" });
  } finally { await context.close(); }
});
