import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const path of ["/", "/runs/sample/workflow", "/runs/sample/compare", "/status"] as const) {
  test(`${path} has no detectable WCAG A/AA violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
}

test("keyboard users can reach the primary sample action", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Touch emulation does not expose hardware tabbing.",
  );
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "PortVerdict home" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "How it works" })).toBeFocused();
});
