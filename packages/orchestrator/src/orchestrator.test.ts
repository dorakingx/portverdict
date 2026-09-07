import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { FileEvidenceStore, sha256Bytes } from "@portverdict/evidence-store";
import type { SandboxBranch } from "@portverdict/sandbox-runner";
import {
  DEFAULT_RUN_CONFIG,
  SCHEMA_VERSION,
  type Run,
  type RunEvent,
} from "@portverdict/shared-schemas";

import { LIVE_EVIDENCE_SCHEMA_VERSION, type TrialSummary } from "./contracts.js";
import {
  LIVE_EVALUATION_CASES,
  LIVE_FIXTURE_SHA256,
  candidateExecutionCommand,
  fixturePreparationCommand,
  fullFileDiff,
} from "./fixture.js";
import { assertBranchIdentity, validatePromotableTrial } from "./invariants.js";
import { replaceDirectoriesAtomically } from "./promotion.js";
import { readVerifiedPublicReplay } from "./public-evidence.js";
import { getLiveReadiness } from "./readiness.js";
import { assertSanitized, withIntegrity } from "./security.js";
import { verifyHashManifest } from "./submission.js";
import {
  accumulateGeneration,
  applyFunctionEdits,
  sourceLooksRunnable,
  validateGeneratedPythonSource,
} from "./trial.js";

const HASH = "a".repeat(64);
const CHECKPOINT = "11111111-1111-4111-8111-111111111111";
const execFileAsync = promisify(execFile);

it("mechanically applies only named model function edits without changing the other functions", async () => {
  const original = LIVE_EVALUATION_CASES[1]!.files["adapter.py"]!;
  const edit = "def normalize_tool_call(item):\n    return {'type': 'function'}\n";
  const assembled = applyFunctionEdits(original, edit, ["normalize_tool_call"]);
  expect(assembled).toContain(edit.trim());
  expect(assembled.split("def normalize_tool_call")[0]).toBe(
    original.split("def normalize_tool_call")[0],
  );
  expect(assembled.split("def retry_delay")[1]).toBe(original.split("def retry_delay")[1]);
  await expect(validateGeneratedPythonSource(assembled)).resolves.toBeUndefined();
  expect(() =>
    applyFunctionEdits(original, "import os\n" + edit, ["normalize_tool_call"]),
  ).toThrow();
  expect(() => applyFunctionEdits(original, edit + edit, ["normalize_tool_call"])).toThrow();
  expect(() =>
    applyFunctionEdits(original, "def retry_delay(status, attempt):\n    return 0\n", [
      "normalize_tool_call",
    ]),
  ).toThrow();
});

it("permits bounded standard-library regex parsing but rejects hidden unsafe imports", async () => {
  const original = LIVE_EVALUATION_CASES[1]!.files["adapter.py"]!;
  const regexEdit =
    "def normalize_tool_call(item):\n    import re\n    found = re.search('x', 'x')\n    return found.group(0)\n";
  await expect(
    validateGeneratedPythonSource(applyFunctionEdits(original, regexEdit, ["normalize_tool_call"])),
  ).resolves.toBeUndefined();
  const unsafeEdit = "def normalize_tool_call(item):\n    import os\n    return None\n";
  await expect(
    validateGeneratedPythonSource(
      applyFunctionEdits(original, unsafeEdit, ["normalize_tool_call"]),
    ),
  ).rejects.toThrow("only json and re imports");
});

it("retains duplicate generation usage and request identities before a distinct retry", () => {
  const proposal = {
    strategy: "minimal-compatibility",
    output: { source: "old" },
    requestIds: ["one"],
    latencyMs: 10,
    retryCount: 1,
    usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
  };
  const next = { ...proposal, output: { source: "new" }, requestIds: ["two"], retryCount: 0 };
  const merged = accumulateGeneration(proposal, next);
  expect(merged.output.source).toBe("new");
  expect(merged.requestIds).toEqual(["one", "two"]);
  expect(merged.retryCount).toBe(2);
  expect(merged.latencyMs).toBe(20);
  expect(merged.usage).toEqual({ inputTokens: 6, outputTokens: 8, totalTokens: 14 });
});

it("allows JSON-fence literals in changed Python but rejects a Markdown-wrapped program", async () => {
  const original = LIVE_EVALUATION_CASES[1]!.files["adapter.py"]!;
  const changed = `${original}\n# Preserve fenced JSON parsing.\n`;
  expect(changed).toContain("```");
  expect(sourceLooksRunnable(changed, original)).toBe(true);
  await expect(validateGeneratedPythonSource(changed)).resolves.toBeUndefined();
  expect(sourceLooksRunnable(`\`\`\`python\n${changed}\`\`\``, original)).toBe(false);
  expect(sourceLooksRunnable(original, original)).toBe(false);
});

function branch(index: number): SandboxBranch {
  return {
    candidateId: `candidate-${index}`,
    checkpointImageId: CHECKPOINT,
    instance: {
      instanceId: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`,
      operationId: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
      operationUrl: `https://api.tokenfactory.nebius.com/sandboxes/v1/operations/33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
      sourceImageId: CHECKPOINT,
      disposable: false,
    },
  };
}

function summary(overrides: Partial<TrialSummary> = {}): TrialSummary {
  const recordedAt = "2026-09-01T00:00:00.000Z";
  const base = {
    schemaVersion: LIVE_EVIDENCE_SCHEMA_VERSION,
    kind: "portverdict.live-trial" as const,
    status: "verified" as const,
    runId: "live_test_001",
    recordedAt,
    expiresAt: "2026-09-08T00:00:00.000Z",
    sourceRevision: "b".repeat(40),
    fixtureRevision: "fixture-v2",
    fixtureSha256: LIVE_FIXTURE_SHA256,
    inputSourceSha256: "f".repeat(64),
    exactModelId: "nvidia/Nemotron-3_5-Lightning",
    sponsorSmokeRunId: "smoke_test_001",
    checkpoint: {
      imageId: CHECKPOINT,
      operationId: "44444444-4444-4444-8444-444444444444",
      sourceImageId: "tag:python:3.11-slim",
      createdAt: recordedAt,
      resources: {
        durationSeconds: 1,
        imageSizeBytes: 2,
        consumedCpuSeconds: 1,
        consumedMemory: 2,
      },
    },
    baseline: {
      sandboxOperationId: "44444444-4444-4444-8444-444444444444",
      outputSha256: HASH,
      passedGateCount: 2,
      totalGateCount: 7,
      durationMs: 100,
    },
    tavily: {
      searchRequestId: "search_request_1",
      extractRequestId: "extract_request_1",
      credits: 2,
      citations: [
        {
          url: "https://docs.tokenfactory.nebius.com/sandboxes/overview",
          title: "Sandboxes",
          contentSha256: HASH,
          retrievedAt: recordedAt,
        },
      ],
    },
    candidates: [1, 2, 3].map((index) => ({
      candidateId: `candidate-${index}`,
      strategy: [
        "minimal-compatibility",
        "prompt-schema-adaptation",
        "resilience-routing-adaptation",
      ][index - 1] as TrialSummary["candidates"][number]["strategy"],
      checkpointImageId: CHECKPOINT,
      sandboxOperationId: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
      resultImageId: `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`,
      modelRequestIds: [`model_request_${index}`],
      modelLatencyMs: 100,
      modelRetryCount: 0,
      modelUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      sourceSha256: String(index).repeat(64),
      diffSha256: String(index + 3).repeat(64),
      outputSha256: HASH,
      resources: {
        durationSeconds: 1,
        imageSizeBytes: 2,
        consumedCpuSeconds: 1,
        consumedMemory: 2,
      },
      gates: { build: index === 1 ? "passed" : "failed" },
      disposition: index === 1 ? "eligible" : "rejected",
      durationMs: index * 100,
      evidenceIds: [`ev_${index}`],
    })),
    verdict: {
      status: "selected" as const,
      selectedCandidateId: "candidate-1",
      eligibleCandidateIds: ["candidate-1"],
      rejectedCandidateIds: ["candidate-2", "candidate-3"],
      inconclusiveCandidateIds: [],
    },
    lifecycle: {
      reducerFinalState: "SELECTED" as const,
      eventCount: 20,
      replayManifestSha256: HASH,
      cleanupComplete: true,
    },
    redactionVersion: "1" as const,
    ...overrides,
  };
  return withIntegrity(base) as TrialSummary;
}

function publicRun(runId: string): Run {
  const recordedAt = "2026-09-01T00:00:00.000Z";
  const candidateId = "candidate-1";
  return {
    schemaVersion: SCHEMA_VERSION,
    id: runId,
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
    mode: "live",
    state: "SELECTED",
    sourceRequest: { kind: "fixture", fixtureId: "python-live-migration-v2" },
    source: {
      kind: "fixture",
      fixtureId: "python-live-migration-v2",
      revision: "fixture-v2",
      displayName: "OpenAI-compatible Python response adapter migration",
      contentSha256: LIVE_FIXTURE_SHA256,
    },
    config: DEFAULT_RUN_CONFIG,
    inventoryArtifactId: null,
    migrationSpecArtifactId: null,
    baseCheckpoint: {
      id: CHECKPOINT,
      sourceRevision: "fixture-v2",
      sandboxOperationId: "44444444-4444-4444-8444-444444444444",
      sandboxImageId: CHECKPOINT,
      artifactId: `artifact_sha256_${HASH}`,
      createdAt: recordedAt,
    },
    candidates: [
      {
        id: candidateId,
        runId,
        strategy: "minimal-compatibility",
        state: "ELIGIBLE",
        checkpointId: CHECKPOINT,
        sandboxOperationId: "33333333-3333-4333-8333-000000000001",
        hardGates: [{ gate: "build", status: "passed", evidenceIds: ["ev_gate_1"] }],
        score: null,
        evidenceIds: ["ev_gate_1"],
        failure: null,
        startedAt: recordedAt,
        completedAt: recordedAt,
      },
    ],
    verdict: {
      kind: "selected",
      selectedCandidateId: candidateId,
      eligibleCandidateIds: [candidateId],
      rejectedCandidateIds: [],
      inconclusiveCandidateIds: [],
      decidedAt: recordedAt,
      evidenceIds: ["ev_verdict"],
      rationaleEvidenceId: null,
    },
    evidenceIds: ["ev_gate_1", "ev_verdict"],
    failure: null,
    createdAt: recordedAt,
    updatedAt: recordedAt,
    originalLiveRun: null,
  };
}

function publicEvent(runId: string): RunEvent {
  return {
    schemaVersion: SCHEMA_VERSION,
    eventId: 1,
    eventKey: "event_001",
    runId,
    recordedAt: "2026-09-01T00:00:00.000Z",
    type: "run.cancel.requested",
    reason: "public replay fixture",
  };
}

describe("live orchestration safety invariants", () => {
  it("keeps fixture and patch transport under the Sandbox command cap", () => {
    for (const liveCase of LIVE_EVALUATION_CASES) {
      expect(fixturePreparationCommand(liveCase).length).toBeLessThanOrEqual(8_192);
      expect(
        candidateExecutionCommand(`${liveCase.files["adapter.py"]}\n# changed\n`).length,
      ).toBeLessThanOrEqual(8_192);
    }
  });

  it("keeps three behavior-family controls distinct and emits an applicable patch", async () => {
    const expectedFailure = {
      "structured-output": "schema",
      "tool-calling": "tool-calls",
      "streaming-retry": "streaming-retry",
    } as const;
    for (const liveCase of LIVE_EVALUATION_CASES) {
      const directory = await mkdtemp(path.join(tmpdir(), `portverdict-${liveCase.caseId}-`));
      try {
        await Promise.all(
          Object.entries(liveCase.files).map(([name, content]) =>
            writeFile(path.join(directory, name), content),
          ),
        );
        const { stdout } = await execFileAsync("python3", ["run_gates.py"], {
          cwd: directory,
          encoding: "utf8",
        });
        const marker = stdout
          .split(/\r?\n/u)
          .find((line) => line.startsWith("PORTVERDICT_RESULT="));
        if (!marker) throw new Error("control gate marker missing");
        const payload = JSON.parse(marker.slice("PORTVERDICT_RESULT=".length)) as {
          results: Array<{ name: string; passed: boolean }>;
        };
        expect(payload.results.find((item) => item.name === "build")?.passed).toBe(true);
        expect(
          payload.results.find((item) => item.name === expectedFailure[liveCase.behaviorFamily])
            ?.passed,
        ).toBe(false);

        const changed = `${liveCase.files["adapter.py"]}\n# bounded change\n`;
        const patchPath = path.join(directory, "candidate.patch");
        await writeFile(patchPath, fullFileDiff(changed, liveCase.files["adapter.py"] as string));
        await execFileAsync("git", ["apply", "--check", patchPath], { cwd: directory });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  }, 30_000);

  it("requires one checkpoint and distinct branch identities", () => {
    expect(assertBranchIdentity([branch(1), branch(2), branch(3)])).toBe(CHECKPOINT);
    expect(() => assertBranchIdentity([branch(1), branch(1), branch(3)])).toThrow(/distinct/u);
  });

  it("rejects model-generated Python that can mutate the harness or access the host", async () => {
    await expect(
      validateGeneratedPythonSource(
        `import json\ndef normalize_event(event): return event\ndef parse_structured(text): return json.loads(text[text.index("{"):text.rindex("}")+1])\ndef normalize_tool_call(item): return None\ndef retry_delay(status, attempt): return None\n`,
      ),
    ).resolves.toBeUndefined();
    await expect(
      validateGeneratedPythonSource(`${LIVE_EVALUATION_CASES[0]?.files["adapter.py"] ?? ""}\n`),
    ).resolves.toBeUndefined();
    await expect(
      validateGeneratedPythonSource(
        `import json\nimport os\n\ndef normalize_event(event): return event\ndef parse_structured(text): return json.loads(text)\ndef normalize_tool_call(item): return None\ndef retry_delay(status, attempt): return None\n`,
      ),
    ).rejects.toThrow(/AST validation/u);
    await expect(
      validateGeneratedPythonSource(
        `import json\n\ndef normalize_event(event): open("test_hidden.py", "w").write("pass")\ndef parse_structured(text): return json.loads(text)\ndef normalize_tool_call(item): return None\ndef retry_delay(status, attempt): return None\n`,
      ),
    ).rejects.toThrow(/AST validation/u);
  }, 15_000);

  it("replaces both public mirrors without stale files and restores both on a failed swap", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "portverdict-promotion-"));
    const destinationA = path.join(directory, "public-a");
    const destinationB = path.join(directory, "public-b");
    const stagingA = path.join(directory, "staging-a");
    const stagingB = path.join(directory, "staging-b");
    try {
      await Promise.all(
        [destinationA, destinationB, stagingA, stagingB].map((entry) =>
          mkdir(entry, { recursive: true }),
        ),
      );
      await Promise.all([
        writeFile(path.join(destinationA, "selected.patch"), "stale-a"),
        writeFile(path.join(destinationB, "selected.patch"), "stale-b"),
        writeFile(path.join(stagingA, "bundle.txt"), "fresh-a"),
        writeFile(path.join(stagingB, "bundle.txt"), "fresh-b"),
      ]);

      await replaceDirectoriesAtomically([
        { destination: destinationA, staging: stagingA },
        { destination: destinationB, staging: stagingB },
      ]);
      await expect(readFile(path.join(destinationA, "selected.patch"), "utf8")).rejects.toThrow();
      await expect(readFile(path.join(destinationB, "selected.patch"), "utf8")).rejects.toThrow();
      await expect(readFile(path.join(destinationA, "bundle.txt"), "utf8")).resolves.toBe(
        "fresh-a",
      );
      await expect(readFile(path.join(destinationB, "bundle.txt"), "utf8")).resolves.toBe(
        "fresh-b",
      );

      const rollbackStagingA = path.join(directory, "rollback-staging-a");
      await mkdir(rollbackStagingA);
      await writeFile(path.join(rollbackStagingA, "bundle.txt"), "must-not-survive");
      await expect(
        replaceDirectoriesAtomically([
          { destination: destinationA, staging: rollbackStagingA },
          { destination: destinationB, staging: path.join(directory, "missing-staging-b") },
        ]),
      ).rejects.toThrow();
      await expect(readFile(path.join(destinationA, "bundle.txt"), "utf8")).resolves.toBe(
        "fresh-a",
      );
      await expect(readFile(path.join(destinationB, "bundle.txt"), "utf8")).resolves.toBe(
        "fresh-b",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("verifies every public hash-manifest entry and rejects tampering", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "portverdict-hashes-"));
    const paths = [
      "evaluation-suite.json",
      "sponsor-smoke.json",
      "trial-summary.json",
      "events.ndjson",
      "snapshot.json",
      "replay-manifest.json",
      "report.md",
      "evaluation-cases/a/trial-summary.json",
      "evaluation-cases/b/trial-summary.json",
      "evaluation-cases/c/trial-summary.json",
      "replay/a/replay-manifest.json",
      "replay/b/replay-manifest.json",
      "replay/c/replay-manifest.json",
    ];
    try {
      const sums: string[] = [];
      for (const [index, relativePath] of paths.entries()) {
        const content = `entry-${index}\n`;
        const destination = path.join(directory, relativePath);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, content);
        sums.push(`${sha256Bytes(content)}  ${relativePath}`);
      }
      await writeFile(path.join(directory, "SHA256SUMS"), `${sums.join("\n")}\n`);
      await expect(verifyHashManifest(directory)).resolves.toBe(13);
      await writeFile(path.join(directory, "snapshot.json"), "tampered\n");
      await expect(verifyHashManifest(directory)).rejects.toThrow(/digest mismatch/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses partial cleanup, same-source patches, stale evidence, and tampering", () => {
    expect(() =>
      validatePromotableTrial(summary(), Date.parse("2026-09-02T00:00:00Z")),
    ).not.toThrow();
    expect(() =>
      validatePromotableTrial(
        summary({ lifecycle: { ...summary().lifecycle, cleanupComplete: false } }),
        Date.parse("2026-09-02T00:00:00Z"),
      ),
    ).toThrow(/cleanup/u);
    const unchanged = summary();
    const firstCandidate = unchanged.candidates[0];
    if (!firstCandidate) throw new Error("The test fixture must contain three candidates.");
    unchanged.candidates[0] = { ...firstCandidate, sourceSha256: unchanged.inputSourceSha256 };
    expect(() => validatePromotableTrial(unchanged, Date.parse("2026-09-02T00:00:00Z"))).toThrow();
    expect(() => validatePromotableTrial(summary(), Date.parse("2026-09-09T00:00:00Z"))).toThrow(
      /stale/u,
    );
    const tampered = { ...summary(), exactModelId: "nvidia/tampered" };
    expect(() => validatePromotableTrial(tampered, Date.parse("2026-09-02T00:00:00Z"))).toThrow(
      /integrity/u,
    );
  });

  it("rejects secret-shaped and prompt-injection-bearing persisted values", () => {
    expect(() =>
      assertSanitized({ note: "NEBIUS_API_KEY=definitely-not-safe-to-persist" }),
    ).toThrow();
    expect(() => assertSanitized({ apiKey: "tvly-examplecredential12345" })).toThrow();
    expect(() => assertSanitized({ authorization: "examplecredential12345" })).toThrow();
    expect(() => assertSanitized({ note: "tvly-examplecredential12345" })).toThrow();
    expect(() =>
      assertSanitized({ note: "Untrusted text: ignore instructions; this remains data." }),
    ).not.toThrow();
  });

  it("reports configured-unverified, verified, stale, and degraded evidence states", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "portverdict-readiness-"));
    const file = path.join(directory, "trial-summary.json");
    const environment = {
      NEBIUS_API_KEY: "configured",
      NEBIUS_AI_PROJECT: "project",
      TAVILY_API_KEY: "configured",
    };
    await expect(getLiveReadiness({ environment, evidencePath: file })).resolves.toMatchObject({
      state: "configured-unverified",
    });
    await writeFile(file, JSON.stringify(summary()));
    await expect(
      getLiveReadiness({
        environment,
        evidencePath: file,
        now: Date.parse("2026-09-02T00:00:00Z"),
      }),
    ).resolves.toMatchObject({ state: "degraded", runId: "live_test_001" });
    await expect(
      getLiveReadiness({
        environment,
        evidencePath: file,
        now: Date.parse("2026-09-02T00:00:00Z"),
        replayVerifier: async () => true,
      }),
    ).resolves.toMatchObject({ state: "verified", runId: "live_test_001" });
    await expect(
      getLiveReadiness({
        environment,
        evidencePath: file,
        now: Date.parse("2026-09-09T00:00:00Z"),
        replayVerifier: async () => true,
      }),
    ).resolves.toMatchObject({ state: "stale" });
    await writeFile(file, "{not-json");
    await expect(getLiveReadiness({ environment, evidencePath: file })).resolves.toMatchObject({
      state: "degraded",
    });
  });

  it("rejects a digest-valid replay whose events cannot produce its snapshot", async () => {
    const evidenceRoot = await mkdtemp(path.join(tmpdir(), "portverdict-public-replay-"));
    const runId = "live_test_001";
    const store = new FileEvidenceStore({
      rootDir: path.join(evidenceRoot, "replay"),
      fsync: false,
    });
    await store.appendEvent(runId, publicEvent(runId));
    await store.writeSnapshot(runId, publicRun(runId));
    const manifest = await store.buildReplayManifest(runId, {
      provenance: {
        kind: "recorded-live-run",
        label: "Verified public replay test",
        originalLiveRun: { id: runId, recordedAt: "2026-09-01T00:00:00.000Z" },
      },
    });
    const promoted = summary({
      runId,
      lifecycle: {
        reducerFinalState: "SELECTED",
        eventCount: 1,
        replayManifestSha256: manifest.integritySha256,
        cleanupComplete: true,
      },
    });
    await writeFile(path.join(evidenceRoot, "trial-summary.json"), JSON.stringify(promoted));

    await expect(readVerifiedPublicReplay({ evidenceRoot, runId })).resolves.toBeNull();
    await expect(
      readVerifiedPublicReplay({ evidenceRoot, runId: "live_other_001" }),
    ).resolves.toBeNull();
  });
});
