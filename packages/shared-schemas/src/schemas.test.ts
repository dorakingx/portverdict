import { describe, expect, it } from "vitest";

import {
  CandidateSchema,
  CreateRunRequestSchema,
  EvidenceSchema,
  ReplayManifestSchema,
  SCHEMA_VERSION,
} from "./index.js";

const HASH = "a".repeat(64);
const NOW = "2026-08-31T00:00:00.000Z";

describe("shared schemas", () => {
  it("binds replay mode to a fixture and live mode to GitHub", () => {
    expect(
      CreateRunRequestSchema.safeParse({
        mode: "replay",
        source: { kind: "fixture", fixtureId: "fixture-weather" },
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(true);

    expect(
      CreateRunRequestSchema.safeParse({
        mode: "live",
        source: { kind: "fixture", fixtureId: "fixture-weather" },
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
  });

  it("requires citations for external-source evidence", () => {
    const evidence = {
      id: "evidence_001",
      runId: "run_001",
      candidateId: null,
      claim: "The provider documents a structured-output constraint.",
      classification: "external-source",
      procedure: "Fetch the allowlisted provider documentation and hash the response.",
      observation: { kind: "text", value: "A bounded excerpt." },
      provenance: {
        sourceRevision: "fixture-v1",
        sandboxOperationId: null,
        sandboxImageId: null,
        integrationRequestId: "request_001",
        artifactId: "artifact_001",
        contentSha256: HASH,
        recordedAt: NOW,
      },
      sources: [],
      redactionVersion: "redaction-v1",
    };

    expect(EvidenceSchema.safeParse(evidence).success).toBe(false);
    expect(
      EvidenceSchema.safeParse({
        ...evidence,
        sources: [
          {
            url: "https://docs.example.com/model",
            title: "Model documentation",
            publisher: "Example",
            retrievedAt: NOW,
            contentSha256: HASH,
            requestId: "request_001",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("keeps behavioral and infrastructure candidate outcomes distinct", () => {
    const base = {
      id: "candidate_001",
      runId: "run_001",
      strategy: "minimal-compatibility",
      checkpointId: "checkpoint_001",
      sandboxOperationId: "operation_001",
      score: null,
      evidenceIds: ["evidence_001"],
      startedAt: NOW,
      completedAt: NOW,
    };
    const failedGate = {
      gate: "schema",
      status: "failed",
      evidenceIds: ["evidence_001"],
    };

    expect(
      CandidateSchema.safeParse({
        ...base,
        state: "REJECTED",
        hardGates: [failedGate],
        failure: {
          kind: "behavioral",
          code: "schema-mismatch",
          message: "Tool arguments violate the target schema.",
          retriable: false,
          evidenceIds: ["evidence_001"],
        },
      }).success,
    ).toBe(true);

    expect(
      CandidateSchema.safeParse({
        ...base,
        state: "REJECTED",
        hardGates: [failedGate],
        failure: {
          kind: "infrastructure",
          code: "sandbox-timeout",
          message: "Sandbox operation timed out.",
          retriable: false,
          evidenceIds: ["evidence_001"],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects replay path traversal and duplicate manifest paths", () => {
    const source = {
      kind: "fixture",
      fixtureId: "fixture-weather",
      revision: "fixture-v1",
      displayName: "Weather tool migration",
      contentSha256: HASH,
    };
    const manifest = {
      schemaVersion: SCHEMA_VERSION,
      manifestType: "portverdict.replay",
      runId: "run_001",
      provenance: {
        kind: "development-fixture",
        label: "Synthetic development fixture",
        originalLiveRun: null,
      },
      source,
      createdAt: NOW,
      eventLog: {
        path: "events.ndjson",
        mediaType: "application/x-ndjson",
        byteLength: 100,
        sha256: HASH,
        role: "events",
        eventCount: 2,
        firstEventId: 1,
        lastEventId: 2,
      },
      snapshot: {
        path: "snapshot.json",
        mediaType: "application/json",
        byteLength: 100,
        sha256: HASH,
        role: "snapshot",
        state: "SELECTED",
      },
      artifacts: [
        {
          path: "../secret",
          mediaType: "text/plain",
          byteLength: 4,
          sha256: HASH,
          role: "artifact",
        },
      ],
      integritySha256: HASH,
    };

    expect(ReplayManifestSchema.safeParse(manifest).success).toBe(false);
    expect(
      ReplayManifestSchema.safeParse({
        ...manifest,
        artifacts: [
          {
            path: "snapshot.json",
            mediaType: "text/plain",
            byteLength: 4,
            sha256: HASH,
            role: "artifact",
          },
        ],
      }).success,
    ).toBe(false);
  });
});
