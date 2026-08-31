import { expect, test } from "@playwright/test";

test("foundation page and health endpoint are available", async ({ page, request }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A migration can compile—and still break behavior." }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Foundation initialized");

  const health = await request.get("/api/health");
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ status: "healthy" });
});
