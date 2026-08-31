import { expect, test } from "@playwright/test";

test("judge can enter the recorded sample from the landing page", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A migration can compile—and still break behavior." }),
  ).toBeVisible();
  await expect(page.getByText("synthetic development replay", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Run recorded sample/ }).click();
  await expect(page).toHaveURL(/\/runs\/sample-run\/workflow$/);
  await expect(page.getByRole("heading", { name: "Migration trial" })).toBeVisible();
  await expect(page.getByText("Same checkpoint. Different migration strategies.")).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test("public readiness and process health remain honest", async ({ page, request }) => {
  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "Integration status" })).toBeVisible();
  await expect(
    page.locator(".service-list .status-badge--warning").filter({ hasText: "Unconfigured" }),
  ).toHaveCount(3);

  const health = await request.get("/api/health");
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ status: "healthy" });

  const readiness = await request.get("/api/ready");
  expect(readiness.ok()).toBe(true);
  await expect(readiness.json()).resolves.toMatchObject({
    schemaVersion: 1,
    overall: "live-unconfigured",
    services: expect.arrayContaining([
      expect.objectContaining({ id: "replay", state: "ready" }),
      expect.objectContaining({ id: "token-factory", state: "unconfigured" }),
      expect.objectContaining({ id: "sandboxes", state: "unconfigured" }),
      expect.objectContaining({ id: "tavily", state: "unconfigured" }),
    ]),
  });
});

test("replay API is resumable and unsafe exports require acknowledgement", async ({ request }) => {
  const created = await request.post("/api/runs", {
    data: {
      mode: "replay",
      source: { kind: "fixture", fixtureId: "fixture-weather-tool-migration" },
      idempotencyKey: crypto.randomUUID(),
    },
  });
  expect(created.status()).toBe(202);
  await expect(created.json()).resolves.toMatchObject({
    runId: "sample-run",
    mode: "replay",
  });

  const run = await request.get("/api/runs/sample-run");
  expect(run.ok()).toBe(true);
  await expect(run.json()).resolves.toMatchObject({
    mode: "replay",
    state: "SELECTED",
    checkpoint: { synthetic: true },
  });

  const resumedEvents = await request.get("/api/runs/sample-run/events", {
    headers: { "Last-Event-ID": "13" },
  });
  expect(resumedEvents.ok()).toBe(true);
  expect(resumedEvents.headers()["content-type"]).toContain("text/event-stream");
  const eventBody = await resumedEvents.text();
  expect(eventBody).toContain("id: 15");
  expect(eventBody).toContain("id: 19");
  expect(eventBody).not.toContain("id: 13");

  const guardedPatch = await request.get("/api/runs/sample-run/patch");
  expect(guardedPatch.status()).toBe(409);

  const acknowledgedPatch = await request.get("/api/runs/sample-run/patch?acknowledgeUnsafe=true");
  expect(acknowledgedPatch.ok()).toBe(true);
  expect(acknowledgedPatch.headers()["x-portverdict-safety"]).toBe(
    "synthetic-unsafe-not-for-shipping",
  );
  expect(await acknowledgedPatch.text()).toContain("illustrative synthetic patch");
});

test("live API fails closed when integrations are not authenticated", async ({ request }) => {
  const invalidSource = await request.post("/api/runs", {
    data: {
      mode: "live",
      source: { kind: "github", url: "https://example.com/owner/repository" },
      idempotencyKey: crypto.randomUUID(),
    },
  });
  expect(invalidSource.status()).toBe(422);

  const unavailable = await request.post("/api/runs", {
    data: {
      mode: "live",
      source: { kind: "github", url: "https://github.com/owner/repository" },
      idempotencyKey: crypto.randomUUID(),
    },
  });
  expect(unavailable.status()).toBe(503);
  await expect(unavailable.json()).resolves.toMatchObject({
    title: "Live mode unavailable",
  });
});
