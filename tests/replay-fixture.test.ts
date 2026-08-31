import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  EvidenceSchema,
  ReplayManifestSchema,
  RunEventSchema,
  RunSchema,
  type ReplayManifest,
  type RunEvent,
} from "../packages/shared-schemas/src/index.js";
import { createInitialRunMachineState, reduceRunEvent } from "../packages/agent-core/src/index.js";
import {
  computeReplayManifestSha256,
  EvidenceIntegrityError,
  FileEvidenceStore,
  sha256Bytes,
} from "../packages/evidence-store/src/index.js";
import { describe, expect, it } from "vitest";

const FIXTURE_PARENT = path.join(process.cwd(), "fixtures", "replays");
const FIXTURE_DIR = path.join(FIXTURE_PARENT, "sample-run");

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function readManifest(directory = FIXTURE_DIR): Promise<ReplayManifest> {
  return ReplayManifestSchema.parse(await readJson(path.join(directory, "replay-manifest.json")));
}

async function readEvents(directory = FIXTURE_DIR): Promise<RunEvent[]> {
  const text = await readFile(path.join(directory, "events.ndjson"), "utf8");
  expect(text.endsWith("\n")).toBe(true);

  return text
    .slice(0, -1)
    .split("\n")
    .map((line) => RunEventSchema.parse(JSON.parse(line) as unknown));
}

describe("immutable sample replay", () => {
  it("validates and replays every event into the checked-in selected snapshot", async () => {
    const events = await readEvents();

    expect(events).toHaveLength(19);
    expect(events.map(({ eventId }) => eventId)).toEqual(
      Array.from({ length: 19 }, (_, index) => index + 1),
    );
    expect(new Set(events.map(({ eventKey }) => eventKey)).size).toBe(events.length);
    expect(
      events.every(
        (event, index) =>
          index === 0 ||
          Date.parse(event.recordedAt) > Date.parse(events[index - 1]?.recordedAt ?? ""),
      ),
    ).toBe(true);

    let machine = createInitialRunMachineState();
    for (const event of events) {
      const result = reduceRunEvent(machine, event);
      expect(result.kind, `event ${event.eventId} (${event.type}) must apply`).toBe("applied");
      if (result.kind !== "applied") {
        throw new Error(`Replay rejected event ${event.eventId}: ${result.message}`);
      }
      machine = result.state;
    }

    const snapshot = RunSchema.parse(await readJson(path.join(FIXTURE_DIR, "snapshot.json")));
    expect(machine.run).toEqual(snapshot);
    expect(machine.lastEventId).toBe(19);
    expect(snapshot.state).toBe("SELECTED");
    expect(snapshot.verdict).toEqual({
      kind: "selected",
      selectedCandidateId: "candidate_prompt_schema",
      eligibleCandidateIds: ["candidate_prompt_schema"],
      rejectedCandidateIds: ["candidate_direct_sdk"],
      inconclusiveCandidateIds: ["candidate_compat_shim"],
      decidedAt: "2026-08-31T00:00:19.000Z",
      evidenceIds: ["evidence_verdict"],
      rationaleEvidenceId: "evidence_verdict",
    });
    expect(new Set(snapshot.candidates.map(({ checkpointId }) => checkpointId))).toEqual(
      new Set(["checkpoint_fixture_shared_v1"]),
    );
    expect(Object.fromEntries(snapshot.candidates.map(({ id, state }) => [id, state]))).toEqual({
      candidate_direct_sdk: "REJECTED",
      candidate_prompt_schema: "ELIGIBLE",
      candidate_compat_shim: "INCONCLUSIVE",
    });
    expect(
      snapshot.candidates.find(({ id }) => id === "candidate_direct_sdk")?.failure,
    ).toMatchObject({ kind: "behavioral", code: "TOOL_SCHEMA_COUNTEREXAMPLE" });
    expect(
      snapshot.candidates.find(({ id }) => id === "candidate_compat_shim")?.failure,
    ).toMatchObject({ kind: "infrastructure", code: "FIXTURE_SANDBOX_TIMEOUT" });
  });

  it("validates every evidence record and marks provider-shaped data synthetic and unverified", async () => {
    const evidenceBundle = (await readJson(path.join(FIXTURE_DIR, "artifacts/evidence.json"))) as {
      fixtureDisclosure: string;
      synthetic: boolean;
      verified: boolean;
      records: unknown[];
    };
    expect(evidenceBundle.fixtureDisclosure).toContain("DEVELOPMENT FIXTURE");
    expect(evidenceBundle.synthetic).toBe(true);
    expect(evidenceBundle.verified).toBe(false);
    expect(evidenceBundle.records).toHaveLength(19);

    const evidence = evidenceBundle.records.map((record) => EvidenceSchema.parse(record));
    expect(new Set(evidence.map(({ id }) => id)).size).toBe(evidence.length);
    expect(evidence.every(({ classification }) => classification === "unsupported")).toBe(true);
    expect(
      evidence.every(
        ({ procedure, provenance }) =>
          /synthetic, unverified/i.test(procedure) &&
          provenance.sandboxOperationId === null &&
          provenance.sandboxImageId === null &&
          provenance.integrationRequestId === null,
      ),
    ).toBe(true);

    const source = (await readJson(path.join(FIXTURE_DIR, "artifacts/source-revision.json"))) as {
      fixtureDisclosure: string;
      synthetic: boolean;
      verified: boolean;
    };
    const research = (await readJson(path.join(FIXTURE_DIR, "artifacts/research-record.json"))) as {
      fixtureDisclosure: string;
      provider: string;
      synthetic: boolean;
      verified: boolean;
      requestId: string | null;
    };
    const sponsorEvidence = (await readJson(
      path.join(FIXTURE_DIR, "artifacts/sponsor-evidence.json"),
    )) as {
      fixtureDisclosure: string;
      records: Array<{
        provider: string;
        synthetic: boolean;
        verified: boolean;
        requestId?: string | null;
        operationId?: string | null;
        checkpointId?: string | null;
        modelId?: string | null;
      }>;
    };

    expect(source).toMatchObject({ synthetic: true, verified: false });
    expect(research).toMatchObject({
      provider: "Tavily",
      synthetic: true,
      verified: false,
      requestId: null,
    });
    expect(source.fixtureDisclosure).toContain("DEVELOPMENT FIXTURE");
    expect(research.fixtureDisclosure).toContain("DEVELOPMENT FIXTURE");
    expect(sponsorEvidence.fixtureDisclosure).toContain("DEVELOPMENT FIXTURE");
    expect(sponsorEvidence.records.map(({ provider }) => provider)).toEqual([
      "Nebius Token Factory",
      "Nebius Sandboxes",
      "NVIDIA",
      "Tavily",
    ]);
    for (const record of sponsorEvidence.records) {
      expect(record.synthetic, `${record.provider} must be marked synthetic`).toBe(true);
      expect(record.verified, `${record.provider} must be marked unverified`).toBe(false);
      expect(record.requestId).not.toEqual(expect.any(String));
      expect(record.operationId).not.toEqual(expect.any(String));
      expect(record.checkpointId).not.toEqual(expect.any(String));
      expect(record.modelId).not.toEqual(expect.any(String));
    }
  });

  it("verifies the manifest self-hash and every declared file digest", async () => {
    const manifest = await readManifest();
    const { integritySha256, ...core } = manifest;

    expect(manifest.provenance).toMatchObject({
      kind: "development-fixture",
      originalLiveRun: null,
    });
    expect(manifest.provenance.label).toContain("synthetic and unverified");
    expect(computeReplayManifestSha256(core)).toBe(integritySha256);

    const entries = [manifest.eventLog, manifest.snapshot, ...manifest.artifacts];
    expect(entries.map(({ path: filePath }) => filePath)).toEqual(
      expect.arrayContaining([
        "events.ndjson",
        "snapshot.json",
        "diff.patch",
        "report.md",
        "artifacts/evidence.json",
        "artifacts/research-record.json",
        "artifacts/sponsor-evidence.json",
      ]),
    );
    for (const entry of entries) {
      const bytes = await readFile(path.join(FIXTURE_DIR, entry.path));
      expect(bytes.byteLength, `${entry.path} byte length`).toBe(entry.byteLength);
      expect(sha256Bytes(bytes), `${entry.path} SHA-256`).toBe(entry.sha256);
    }

    const store = new FileEvidenceStore({ rootDir: FIXTURE_PARENT, fsync: false });
    await expect(store.verifyReplayManifest("sample-run", manifest)).resolves.toMatchObject({
      manifest: { runId: "sample-run", integritySha256 },
      fileCount: entries.length,
    });
  });

  it("rejects a replay when an artifact is tampered with", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "portverdict-replay-fixture-"));
    const copiedFixture = path.join(temporaryRoot, "sample-run");

    try {
      await cp(FIXTURE_DIR, copiedFixture, { recursive: true });
      const manifest = await readManifest(copiedFixture);
      const patchPath = path.join(copiedFixture, "diff.patch");
      const original = await readFile(patchPath);
      await writeFile(patchPath, Buffer.concat([original, Buffer.from("# tampered\n", "utf8")]));

      const store = new FileEvidenceStore({ rootDir: temporaryRoot, fsync: false });
      await expect(store.verifyReplayManifest("sample-run", manifest)).rejects.toBeInstanceOf(
        EvidenceIntegrityError,
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
