import { z } from "zod";

const ReplayRequestSchema = z
  .object({
    mode: z.literal("replay"),
    source: z
      .object({
        kind: z.literal("fixture"),
        fixtureId: z.literal("fixture-weather-tool-migration"),
      })
      .strict(),
    idempotencyKey: z.uuid(),
  })
  .strict();

const LiveRequestSchema = z
  .object({
    mode: z.literal("live"),
    source: z
      .object({
        kind: z.literal("github"),
        url: z
          .url()
          .max(500)
          .refine((value) => {
            const url = new URL(value);
            return (
              url.protocol === "https:" &&
              url.hostname === "github.com" &&
              !url.username &&
              !url.password &&
              /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/u.test(url.pathname)
            );
          }, "Use a public GitHub repository URL."),
      })
      .strict(),
    idempotencyKey: z.uuid(),
  })
  .strict();

export const CreateRunRequestSchema = z.discriminatedUnion("mode", [
  ReplayRequestSchema,
  LiveRequestSchema,
]);

export const SAMPLE_RUN = Object.freeze({
  schemaVersion: 1,
  id: "sample-run",
  mode: "replay",
  state: "SELECTED",
  source: {
    kind: "fixture",
    fixtureId: "fixture-weather-tool-migration",
    revision: "fixture-weather-v1",
    displayName: "Synthetic forecast tool-call migration",
    contentSha256: "0dfe8c2cb9c9250023ae429eaf26e3164529738a81e5ab07e2b241a94a1ed7a1",
  },
  checkpoint: {
    id: "checkpoint_fixture_shared_v1",
    sandboxOperationId: null,
    sandboxImageId: null,
    synthetic: true,
  },
  candidates: [
    { id: "candidate_direct_sdk", state: "REJECTED", strategy: "minimal-compatibility" },
    {
      id: "candidate_prompt_schema",
      state: "ELIGIBLE",
      strategy: "prompt-schema-adaptation",
    },
    {
      id: "candidate_compat_shim",
      state: "INCONCLUSIVE",
      strategy: "resilience-routing-adaptation",
    },
  ],
  verdict: {
    kind: "selected",
    selectedCandidateId: "candidate_prompt_schema",
    evidenceIds: ["evidence_verdict"],
  },
  disclosure:
    "Synthetic development replay. No Nebius, NVIDIA, Tavily, GitHub, or hosted Sandbox call is represented.",
  updatedAt: "2026-08-31T00:00:19.000Z",
});

export const SAMPLE_EVENTS = Object.freeze([
  { id: 1, event: "run.received", data: { runId: "sample-run", mode: "replay" } },
  { id: 2, event: "source.resolved", data: { revision: "fixture-weather-v1" } },
  { id: 5, event: "checkpoint.ready", data: { checkpointId: "checkpoint_fixture_shared_v1" } },
  { id: 6, event: "candidates.started", data: { count: 3 } },
  {
    id: 13,
    event: "candidate.rejected",
    data: { candidateId: "candidate_direct_sdk", gate: "tool-calls" },
  },
  {
    id: 15,
    event: "candidate.eligible",
    data: { candidateId: "candidate_prompt_schema" },
  },
  {
    id: 19,
    event: "verdict.selected",
    data: { candidateId: "candidate_prompt_schema" },
  },
]);

export const SAMPLE_REPORT = `# PortVerdict fixture verdict: prompt + schema adapter

> DEVELOPMENT FIXTURE — SYNTHETIC AND UNVERIFIED. No sponsor API or hosted Sandbox was invoked.

The prompt + schema adapter is the only fixture branch that passes every recorded hard gate. The direct SDK port is rejected by a typed tool-call counterexample; the compatibility shim remains inconclusive after a synthetic infrastructure timeout.
`;

export const SAMPLE_PATCH = `# DEVELOPMENT FIXTURE — illustrative synthetic patch; not safe to ship.
diff --git a/src/forecast-tool.ts b/src/forecast-tool.ts
--- a/src/forecast-tool.ts
+++ b/src/forecast-tool.ts
@@
-  return { temperatureC: Number(payload.temperature_c) };
+  if (typeof payload.temperature_c !== "number") throw new TypeError("temperature_c");
+  return { temperatureC: payload.temperature_c };
`;

export function problem(status: number, title: string, detail: string, instance: string): Response {
  return Response.json(
    {
      type: `https://portverdict.dev/problems/${title.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`,
      title,
      status,
      detail,
      instance,
      requestId: `request_${crypto.randomUUID()}`,
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function isSampleRun(runId: string): boolean {
  return runId === "sample" || runId === "sample-run";
}
