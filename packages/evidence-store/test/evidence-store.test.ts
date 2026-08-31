import { appendFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DEFAULT_RUN_CONFIG,
  SCHEMA_VERSION,
  type Run,
  type RunEvent,
} from "@portverdict/shared-schemas";
import { afterEach, describe, expect, it } from "vitest";

import {
  computeReplayManifestSha256,
  EvidenceIntegrityError,
  EvidencePathError,
  EvidenceStoreError,
  FileEvidenceStore,
  redactForPersistence,
  type ReplayManifest,
  type ReplayManifestCore,
} from "../src";

const NOW = "2026-08-31T00:00:00.000Z";
const HASH = "a".repeat(64);
const IDEMPOTENCY_KEY = "00000000-0000-4000-8000-000000000001";
const temporaryDirectories: string[] = [];

const SOURCE = {
  kind: "fixture" as const,
  fixtureId: "fixture-weather",
  revision: "fixture-v1",
  displayName: "Weather tool migration",
  contentSha256: HASH,
};

function makeRun(runId: string, state: "RECEIVED" | "SOURCE_RESOLVED"): Run {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: runId,
    idempotencyKey: IDEMPOTENCY_KEY,
    mode: "replay",
    state,
    sourceRequest: { kind: "fixture", fixtureId: SOURCE.fixtureId },
    source: state === "RECEIVED" ? null : SOURCE,
    config: DEFAULT_RUN_CONFIG,
    inventoryArtifactId: null,
    migrationSpecArtifactId: null,
    baseCheckpoint: null,
    candidates: [],
    verdict: null,
    evidenceIds: [],
    failure: null,
    createdAt: NOW,
    updatedAt: NOW,
    originalLiveRun: null,
  };
}

function makeEvent(runId: string, eventId: number, reason = "test event"): RunEvent {
  return {
    schemaVersion: SCHEMA_VERSION,
    eventId,
    eventKey: `event_${eventId.toString().padStart(3, "0")}`,
    runId,
    recordedAt: NOW,
    type: "run.cancel.requested",
    reason,
  };
}

async function createStore(
  options: ConstructorParameters<typeof FileEvidenceStore>[0] = {},
): Promise<FileEvidenceStore> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "portverdict-evidence-store-"));
  temporaryDirectories.push(rootDir);
  return new FileEvidenceStore({ rootDir, fsync: false, ...options });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("FileEvidenceStore", () => {
  it("uses PORTVERDICT_RUN_DIR when an explicit root is absent", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "portverdict-configured-run-dir-"));
    temporaryDirectories.push(rootDir);
    const store = new FileEvidenceStore({
      environment: { PORTVERDICT_RUN_DIR: rootDir },
      fsync: false,
    });

    expect(store.rootDir).toBe(path.resolve(rootDir));
  });

  it("keeps the previous snapshot visible when an atomic replacement fails", async () => {
    const store = await createStore();
    await store.writeSnapshot("run_atomic", makeRun("run_atomic", "RECEIVED"));

    const failingStore = new FileEvidenceStore({
      rootDir: store.rootDir,
      fsync: false,
      faultInjector(point) {
        if (point === "beforeSnapshotRename") {
          throw new Error("simulated crash");
        }
      },
    });

    await expect(
      failingStore.writeSnapshot("run_atomic", makeRun("run_atomic", "SOURCE_RESOLVED")),
    ).rejects.toThrow("simulated crash");
    await expect(store.readSnapshot("run_atomic")).resolves.toMatchObject({
      id: "run_atomic",
      state: "RECEIVED",
      source: null,
    });

    const runFiles = await readdir(store.resolveRunDirectory("run_atomic"));
    expect(runFiles.filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("uses shared schemas and rejects invalid or non-monotonic events", async () => {
    const store = await createStore();
    await expect(
      store.appendEvent("run_schema", {
        ...makeEvent("run_schema", 1),
        recordedAt: "not-a-timestamp",
      }),
    ).rejects.toMatchObject({ code: "INVALID_EVENT" });

    await store.appendEvent("run_schema", makeEvent("run_schema", 1));
    await expect(store.appendEvent("run_schema", makeEvent("run_schema", 3))).rejects.toMatchObject(
      { code: "INVALID_EVENT" },
    );
  });

  it("rejects manifest and artifact tampering", async () => {
    const store = await createStore();
    await store.appendEvent("run_integrity", makeEvent("run_integrity", 1));
    const artifact = await store.putArtifact("run_integrity", "trusted output", {
      mediaType: "text/plain",
      role: "evidence",
    });
    const duplicateArtifact = await store.putArtifact("run_integrity", "trusted output", {
      mediaType: "text/plain",
      role: "evidence",
    });
    expect(duplicateArtifact).toEqual(artifact);
    await expect(
      store.putArtifact("run_integrity", "trusted output", {
        mediaType: "text/plain",
        role: "report",
      }),
    ).rejects.toMatchObject({ code: "SERIALIZATION_FAILURE" });
    await store.writeSnapshot("run_integrity", makeRun("run_integrity", "SOURCE_RESOLVED"));
    const manifest = await store.buildReplayManifest("run_integrity", {
      provenance: {
        kind: "development-fixture",
        label: "Synthetic development fixture",
        originalLiveRun: null,
      },
    });

    await expect(store.verifyReplayManifest("run_integrity")).resolves.toMatchObject({
      fileCount: 3,
      manifest: { integritySha256: manifest.integritySha256 },
    });
    await expect(
      store.verifyReplayManifest("run_integrity", {
        ...manifest,
        createdAt: "2026-08-31T00:00:01.000Z",
      }),
    ).rejects.toBeInstanceOf(EvidenceIntegrityError);

    const contentPath = path.join(
      store.resolveRunDirectory("run_integrity"),
      "artifacts",
      "sha256",
      artifact.contentSha256,
    );
    await writeFile(contentPath, "tampered output", "utf8");
    await expect(store.verifyReplayManifest("run_integrity")).rejects.toBeInstanceOf(
      EvidenceIntegrityError,
    );
  });

  it("discards only an uncommitted NDJSON tail and continues monotonic event IDs", async () => {
    const store = await createStore();
    await store.appendEvent("run_crash", makeEvent("run_crash", 1));
    await store.appendEvent("run_crash", makeEvent("run_crash", 2));

    const eventPath = path.join(store.resolveRunDirectory("run_crash"), "events.ndjson");
    await appendFile(eventPath, '{"schemaVersion":1,"eventId":3', "utf8");

    const recovery = await store.recoverEventLog("run_crash");
    expect(recovery.recovered).toBe(true);
    expect(recovery.bytesRemoved).toBeGreaterThan(0);
    const third = await store.appendEvent("run_crash", makeEvent("run_crash", 3));
    expect(third.eventId).toBe(3);
    await expect(store.readEvents("run_crash")).resolves.toMatchObject([
      { eventId: 1, type: "run.cancel.requested" },
      { eventId: 2, type: "run.cancel.requested" },
      { eventId: 3, type: "run.cancel.requested" },
    ]);
  });

  it("redacts structured secrets and text credentials before persistence", async () => {
    const store = await createStore();
    const structured = redactForPersistence({
      tavilyApiKey: "super-secret-key",
      NEBIUS_API_KEY: "structured-nebius-secret",
    });
    expect(structured.value).toEqual({
      tavilyApiKey: "[REDACTED]",
      NEBIUS_API_KEY: "[REDACTED]",
    });

    const event = await store.appendEvent(
      "run_redaction",
      makeEvent("run_redaction", 1, "Bearer should-not-survive NEBIUS_API_KEY=also-secret"),
    );
    const artifact = await store.putArtifact(
      "run_redaction",
      Buffer.from(
        "Authorization: Bearer artifact-secret-value\nTAVILY_API_KEY=search-secret",
        "utf8",
      ),
      { mediaType: "text/plain" },
    );

    expect(event).toMatchObject({
      reason: "Bearer [REDACTED] NEBIUS_API_KEY=[REDACTED]",
    });
    expect(artifact.redacted).toBe(true);
    const persisted = await readFile(
      path.join(store.resolveRunDirectory("run_redaction"), "events.ndjson"),
      "utf8",
    );
    const persistedArtifact = Buffer.from(
      (await store.getArtifact("run_redaction", artifact.artifactId)).content,
    ).toString("utf8");
    expect(`${persisted}\n${persistedArtifact}`).not.toMatch(
      /should-not-survive|also-secret|artifact-secret-value|search-secret/u,
    );
  });

  it("rejects traversal in run IDs, artifact IDs, and signed manifest paths", async () => {
    const store = await createStore();
    expect(() => store.resolveRunDirectory("../escape")).toThrow(EvidenceStoreError);
    await expect(store.getArtifact("run_safe", "../../outside")).rejects.toBeInstanceOf(
      EvidenceStoreError,
    );

    await store.appendEvent("run_safe", makeEvent("run_safe", 1));
    await store.writeSnapshot("run_safe", makeRun("run_safe", "SOURCE_RESOLVED"));
    const manifest = await store.buildReplayManifest("run_safe", {
      provenance: {
        kind: "development-fixture",
        label: "Synthetic development fixture",
        originalLiveRun: null,
      },
    });
    const maliciousCore: ReplayManifestCore = {
      ...manifest,
      eventLog: { ...manifest.eventLog, path: "../events.ndjson" },
    };
    delete (maliciousCore as Partial<ReplayManifest>).integritySha256;
    const maliciousManifest: ReplayManifest = {
      ...maliciousCore,
      integritySha256: computeReplayManifestSha256(maliciousCore),
    };
    await expect(store.verifyReplayManifest("run_safe", maliciousManifest)).rejects.toBeInstanceOf(
      EvidencePathError,
    );
  });

  it("returns only persisted events after Last-Event-ID semantics", async () => {
    const store = await createStore();
    await Promise.all(
      [1, 2, 3, 4].map((eventId) =>
        store.appendEvent("run_resume", makeEvent("run_resume", eventId)),
      ),
    );

    await expect(store.readEvents("run_resume", { afterEventId: 2 })).resolves.toMatchObject([
      { eventId: 3 },
      { eventId: 4 },
    ]);
    await expect(
      store.readEvents("run_resume", { afterEventId: 2, limit: 1 }),
    ).resolves.toMatchObject([{ eventId: 3 }]);
    await expect(store.readEvents("run_resume", { afterEventId: 4 })).resolves.toEqual([]);
  });

  it("rejects corruption in a committed NDJSON line instead of hiding it as recovery", async () => {
    const store = await createStore();
    await store.appendEvent("run_committed_corruption", makeEvent("run_committed_corruption", 1));
    const eventPath = path.join(
      store.resolveRunDirectory("run_committed_corruption"),
      "events.ndjson",
    );
    await appendFile(eventPath, "not-json\n", "utf8");

    await expect(store.readEvents("run_committed_corruption")).rejects.toBeInstanceOf(
      EvidenceIntegrityError,
    );
  });
});
