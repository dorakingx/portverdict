import { randomUUID } from "node:crypto";

import { z } from "zod";

import { REDACTION_VERSION } from "@portverdict/evidence-store";

import {
  LIVE_EVIDENCE_SCHEMA_VERSION,
  SponsorSmokeEvidenceSchema,
  type SponsorSmokeEvidence,
} from "./contracts.js";
import { LIVE_FIXTURE_IMAGE } from "./fixture.js";
import { createLiveClients, selectNvidiaDecision, type LiveEnvironment } from "./runtime.js";
import { expiresAt, withIntegrity, writePrivateJson } from "./security.js";

const SmokeOutputSchema = z
  .object({
    summary: z.string().trim().min(3).max(240),
    safe: z.literal(true),
  })
  .strict();

const SMOKE_OUTPUT_CONTRACT = {
  name: "portverdict_sponsor_smoke",
  schema: {
    type: "object",
    properties: {
      summary: { type: "string", minLength: 3, maxLength: 240 },
      safe: { const: true },
    },
    required: ["summary", "safe"],
    additionalProperties: false,
  },
} as const;

export async function runSponsorSmoke(
  environment: LiveEnvironment = process.env,
): Promise<SponsorSmokeEvidence> {
  const recordedAt = new Date().toISOString();
  const runId = `smoke_${recordedAt.replace(/\D/gu, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`;
  const telemetry = { sandbox: [], tavily: [] };
  const clients = createLiveClients(environment, telemetry);

  const catalog = await clients.tokenFactory.listModels();
  const decision = selectNvidiaDecision(catalog);
  const inference = await clients.tokenFactory.completeStructured({
    decision,
    taskId: `${runId}_inference`,
    taskCategory: "portverdict-migration",
    difficulty: "low",
    messages: [
      {
        role: "system",
        content:
          "Return only the requested JSON. Confirm that this is a bounded, non-destructive integration smoke test.",
      },
      {
        role: "user",
        content:
          "Summarize in one short sentence that PortVerdict can evaluate a safe model-migration fixture. Set safe to true.",
      },
    ],
    outputContract: SMOKE_OUTPUT_CONTRACT,
    outputSchema: SmokeOutputSchema,
    maxOutputTokens: 160,
  });

  const research = await clients.tavily.research(
    "official Nebius Token Factory Sandboxes branching and Tavily Search Extract API documentation",
  );
  if (!research.extractRequestId || research.sources.length === 0) {
    throw new Error("Tavily Search returned no extractable official documentation source.");
  }

  const checkpoint = await clients.sandbox.createCheckpoint(
    {
      image: LIVE_FIXTURE_IMAGE,
      command:
        "python -c \"from pathlib import Path; Path('/tmp/portverdict-smoke.txt').write_text('verified')\"",
      shell: true,
      cwd: "/tmp",
      policy: {
        timeoutSeconds: 90,
        outputLimitBytes: 262_144,
        maxLayerBytes: 134_217_728,
        networkingEnabled: false,
        uid: 1_000,
        gid: 1_000,
      },
    },
    { timeoutMs: 180_000 },
  );

  const evidence = withIntegrity({
    schemaVersion: LIVE_EVIDENCE_SCHEMA_VERSION,
    kind: "portverdict.sponsor-smoke" as const,
    status: "verified" as const,
    runId,
    recordedAt,
    expiresAt: expiresAt(recordedAt),
    tokenFactory: {
      catalogRequestId: catalog.requestId,
      catalogFetchedAt: catalog.fetchedAt,
      catalogFingerprint: catalog.fingerprint,
      exactModelId: decision.model.exactId,
      modelRecordFingerprint: decision.model.provenance.catalogRecordFingerprint,
      inferenceRequestIds: [...inference.requestIds],
      latencyMs: inference.telemetry.latencyMs,
      usage: inference.telemetry.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    },
    sandbox: {
      checkpointImageId: checkpoint.checkpointImageId,
      sourceImageId: checkpoint.sourceImageId,
      operationId: checkpoint.operationId,
      resources: checkpoint.resources,
    },
    tavily: {
      searchRequestId: research.searchRequestId,
      extractRequestId: research.extractRequestId,
      credits: research.credits,
      sourceCount: research.sources.length,
      sourceHashes: research.sources.map((source) => source.contentSha256),
    },
    redactionVersion: REDACTION_VERSION,
  });
  const parsed = SponsorSmokeEvidenceSchema.parse(evidence);
  await writePrivateJson(runId, "sponsor-smoke.json", parsed);
  return parsed;
}
