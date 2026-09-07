import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const READINESS_STATES = [
  "unconfigured",
  "configured-unverified",
  "verifying",
  "verified",
  "stale",
  "degraded",
] as const;

test("judge enters the honest primary replay from the landing page", async ({ page, request }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const readiness = (await (await request.get("/api/ready")).json()) as {
    overall: (typeof READINESS_STATES)[number];
    runId: string | null;
    exactModelId: string | null;
  };

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A migration can compile—and still break behavior." }),
  ).toBeVisible();

  if (["verified", "stale"].includes(readiness.overall) && readiness.runId) {
    await expect(page.getByText("authenticated recorded evidence", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: /Inspect (?:verified|recorded) live run/ }).click();
    await expect(page).toHaveURL(new RegExp(`/runs/${readiness.runId}/workflow$`, "u"));
    await expect(
      page.getByText(readiness.exactModelId ?? "missing-model", { exact: true }),
    ).toBeVisible();
  } else {
    await expect(page.getByText("synthetic development replay", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: /Run recorded sample/ }).click();
    await expect(page).toHaveURL(/\/runs\/sample\/workflow$/u);
  }

  await expect(page.getByRole("heading", { name: "Migration trial" })).toBeVisible();
  await expect(page.getByText("Same checkpoint. Different migration strategies.")).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test("public readiness and process health remain honest", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ status: "healthy" });

  const response = await request.get("/api/ready");
  expect(response.ok()).toBe(true);
  const readiness = (await response.json()) as {
    schemaVersion: number;
    overall: string;
    services: { id: string; state: string; detail: string }[];
  };
  expect(readiness.schemaVersion).toBe(2);
  expect(READINESS_STATES).toContain(readiness.overall);
  expect(readiness.services.map((service) => service.id)).toEqual([
    "replay",
    "token-factory",
    "sandboxes",
    "tavily",
  ]);
  expect(readiness.services.every((service) => service.state === readiness.overall)).toBe(true);
  expect(JSON.stringify(readiness)).not.toMatch(
    /Bearer\s+\S+|(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|SECRET)\s*[=:]\s*\S{8,}/u,
  );

  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "Integration status" })).toBeVisible();
  await expect(page.locator(".service-list article")).toHaveCount(4);
});

test("fixture replay API is resumable and unsafe exports require acknowledgement", async ({
  request,
}) => {
  const created = await request.post("/api/runs", {
    data: {
      mode: "replay",
      source: { kind: "fixture", fixtureId: "fixture-weather-tool-migration" },
      idempotencyKey: crypto.randomUUID(),
    },
  });
  expect(created.status()).toBe(202);
  await expect(created.json()).resolves.toMatchObject({ runId: "sample-run", mode: "replay" });

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
  expect(resumedEvents.headers().vary).toContain("Last-Event-ID");
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

test("public live execution is owner-only and unknown run IDs fail closed", async ({ request }) => {
  const invalidSource = await request.post("/api/runs", {
    data: {
      mode: "live",
      source: { kind: "github", url: "https://example.com/owner/repository" },
      idempotencyKey: crypto.randomUUID(),
    },
  });
  expect(invalidSource.status()).toBe(422);

  const ownerOnly = await request.post("/api/runs", {
    data: {
      mode: "live",
      source: { kind: "github", url: "https://github.com/owner/repository" },
      idempotencyKey: crypto.randomUUID(),
    },
  });
  expect(ownerOnly.status()).toBe(403);
  await expect(ownerOnly.json()).resolves.toMatchObject({ title: "Owner runner required" });

  expect((await request.get("/api/runs/not-a-real-run")).status()).toBe(404);
  expect((await request.get("/runs/not-a-real-run/workflow")).status()).toBe(404);
});

test("verified live replay exposes a complete immutable public story", async ({
  page,
  request,
}) => {
  const readinessResponse = await request.get("/api/ready");
  const readiness = (await readinessResponse.json()) as { overall: string; runId: string | null };
  test.skip(
    readiness.overall !== "verified" || !readiness.runId,
    "No promoted live evidence is present; this skip is not live-integration proof.",
  );
  const runId = readiness.runId as string;
  const summaryResponse = await request.get("/evidence/verified-live/trial-summary.json");
  expect(summaryResponse.ok()).toBe(true);
  const summary = (await summaryResponse.json()) as {
    exactModelId: string;
    candidates: { candidateId: string }[];
    verdict: { status: "selected" | "abstained" };
  };

  const run = await request.get(`/api/runs/${runId}`);
  expect(run.ok()).toBe(true);
  await expect(run.json()).resolves.toMatchObject({
    id: runId,
    recording: { kind: "authenticated-live-replay", exactModelId: summary.exactModelId },
  });
  const events = await request.get(`/api/runs/${runId}/events`, {
    headers: { "Last-Event-ID": "0" },
  });
  expect(events.ok()).toBe(true);
  expect(await events.text()).toContain("event: run.received");
  expect((await request.get(`/api/runs/${runId}/report`)).ok()).toBe(true);
  expect(
    (await request.get(`/evidence/verified-live/replay/${runId}/replay-manifest.json`)).ok(),
  ).toBe(true);

  await page.goto(`/runs/${runId}/compare`);
  await expect(page.getByText(summary.exactModelId, { exact: false }).first()).toBeVisible();
  await page.goto(`/runs/${runId}/evidence/${summary.candidates[0]?.candidateId}`);
  await expect(page.getByText("authenticated recorded trial", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Executed test logs and proposed diff" }),
  ).toBeVisible();
  await expect(page.getByLabel("Executed test logs", { exact: true })).toContainText("build:");
  await page.getByText("Inspect candidate diff", { exact: true }).click();
  await expect(page.getByLabel("Candidate diff", { exact: true })).toContainText("adapter.py");
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  const patch = await request.get(`/api/runs/${runId}/patch`);
  expect(patch.status()).toBe(summary.verdict.status === "selected" ? 409 : 404);
  if (summary.verdict.status === "selected") {
    const acknowledged = await request.get(`/api/runs/${runId}/patch?acknowledgeUnsafe=true`);
    expect(acknowledged.ok()).toBe(true);
    expect(acknowledged.headers()["x-portverdict-safety"]).toBe(
      "verified-one-run-human-review-required",
    );
  }
});
