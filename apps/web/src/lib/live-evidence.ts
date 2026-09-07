import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

import { z } from "zod";
import { createInitialRunMachineState, reduceRunEvent } from "@portverdict/agent-core";
import { RunEventSchema, RunSchema } from "@portverdict/shared-schemas";

const EVIDENCE_ROOT = path.join(process.cwd(), "public", "evidence", "verified-live");
const MAX_FILE_BYTES = 10 * 1_024 * 1_024;
const MAX_REPLAY_BYTES = 50 * 1_024 * 1_024;
const SHA256 = z.string().regex(/^[a-f0-9]{64}$/u);
const IDENTIFIER = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,255}$/u);
const ISO_TIMESTAMP = z.iso.datetime({ offset: true });
const METRIC = z.number().finite().nonnegative().nullable();

const ResourcesSchema = z
  .object({
    durationSeconds: METRIC,
    imageSizeBytes: METRIC,
    consumedCpuSeconds: METRIC,
    consumedMemory: METRIC,
  })
  .strict();

const CandidateSchema = z
  .object({
    candidateId: IDENTIFIER,
    strategy: z.enum([
      "minimal-compatibility",
      "prompt-schema-adaptation",
      "resilience-routing-adaptation",
    ]),
    checkpointImageId: IDENTIFIER,
    sandboxOperationId: IDENTIFIER,
    resultImageId: IDENTIFIER.nullable(),
    modelRequestIds: z.array(IDENTIFIER).min(1).max(8),
    modelLatencyMs: z.number().int().nonnegative(),
    modelRetryCount: z.number().int().nonnegative(),
    modelUsage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        totalTokens: z.number().int().nonnegative(),
      })
      .strict(),
    sourceSha256: SHA256,
    diffSha256: SHA256,
    outputSha256: SHA256,
    resources: ResourcesSchema,
    gates: z.record(z.string(), z.enum(["passed", "failed", "inconclusive"])),
    disposition: z.enum(["eligible", "rejected", "inconclusive"]),
    durationMs: z.number().int().nonnegative(),
    evidenceIds: z.array(IDENTIFIER).min(1),
  })
  .strict();

const TrialSummarySchema = z
  .object({
    schemaVersion: z.literal(2),
    kind: z.literal("portverdict.live-trial"),
    status: z.literal("verified"),
    runId: IDENTIFIER,
    recordedAt: ISO_TIMESTAMP,
    expiresAt: ISO_TIMESTAMP,
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
    fixtureRevision: IDENTIFIER,
    fixtureSha256: SHA256,
    inputSourceSha256: SHA256,
    exactModelId: z.string().trim().min(3).max(512),
    sponsorSmokeRunId: IDENTIFIER,
    checkpoint: z
      .object({
        imageId: IDENTIFIER,
        operationId: IDENTIFIER,
        sourceImageId: z.string().trim().min(3).max(512),
        createdAt: ISO_TIMESTAMP,
        resources: ResourcesSchema,
      })
      .strict(),
    baseline: z
      .object({
        sandboxOperationId: IDENTIFIER,
        outputSha256: SHA256,
        passedGateCount: z.number().int().nonnegative(),
        totalGateCount: z.number().int().positive(),
        durationMs: z.number().int().nonnegative(),
      })
      .strict(),
    tavily: z
      .object({
        searchRequestId: IDENTIFIER,
        extractRequestId: IDENTIFIER,
        credits: z.number().finite().nonnegative(),
        citations: z
          .array(
            z
              .object({
                url: z.url().startsWith("https://"),
                title: z.string().trim().min(1).max(500),
                contentSha256: SHA256,
                retrievedAt: ISO_TIMESTAMP,
              })
              .strict(),
          )
          .min(1)
          .max(10),
      })
      .strict(),
    candidates: z.array(CandidateSchema).length(3),
    verdict: z.discriminatedUnion("status", [
      z
        .object({
          status: z.literal("selected"),
          selectedCandidateId: IDENTIFIER,
          eligibleCandidateIds: z.array(IDENTIFIER).min(1),
          rejectedCandidateIds: z.array(IDENTIFIER),
          inconclusiveCandidateIds: z.array(IDENTIFIER),
        })
        .strict(),
      z
        .object({
          status: z.literal("abstained"),
          reason: z.string().trim().min(1).max(160),
          eligibleCandidateIds: z.array(IDENTIFIER),
          rejectedCandidateIds: z.array(IDENTIFIER),
          inconclusiveCandidateIds: z.array(IDENTIFIER),
        })
        .strict(),
    ]),
    lifecycle: z
      .object({
        reducerFinalState: z.enum(["SELECTED", "ABSTAINED"]),
        eventCount: z.number().int().positive(),
        replayManifestSha256: SHA256,
        cleanupComplete: z.boolean(),
      })
      .strict(),
    redactionVersion: z.literal("1"),
    integritySha256: SHA256,
  })
  .strict();

const SAFE_REPLAY_PATH = z
  .string()
  .min(1)
  .max(1_024)
  .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[A-Za-z0-9._/-]+$/u);
const ReplayFileSchema = z
  .object({
    path: SAFE_REPLAY_PATH,
    mediaType: z.string().trim().min(1).max(160),
    byteLength: z.number().int().nonnegative().max(MAX_FILE_BYTES),
    sha256: SHA256,
    role: z.enum(["evidence", "artifact", "report", "patch"]),
  })
  .strict();
const ReplayManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    manifestType: z.literal("portverdict.replay"),
    runId: IDENTIFIER,
    provenance: z
      .object({
        kind: z.literal("recorded-live-run"),
        label: z.string().trim().min(1).max(240),
        originalLiveRun: z.object({ id: IDENTIFIER, recordedAt: ISO_TIMESTAMP }).strict(),
      })
      .strict(),
    source: z
      .object({
        kind: z.literal("fixture"),
        fixtureId: z.string().trim().min(1).max(160),
        revision: z.string().trim().min(1).max(160),
        displayName: z.string().trim().min(1).max(240),
        contentSha256: SHA256,
      })
      .strict(),
    createdAt: ISO_TIMESTAMP,
    eventLog: z
      .object({
        path: SAFE_REPLAY_PATH,
        mediaType: z.literal("application/x-ndjson"),
        byteLength: z.number().int().positive().max(MAX_FILE_BYTES),
        sha256: SHA256,
        role: z.literal("events"),
        eventCount: z.number().int().positive(),
        firstEventId: z.number().int().positive(),
        lastEventId: z.number().int().positive(),
      })
      .strict(),
    snapshot: z
      .object({
        path: SAFE_REPLAY_PATH,
        mediaType: z.literal("application/json"),
        byteLength: z.number().int().positive().max(MAX_FILE_BYTES),
        sha256: SHA256,
        role: z.literal("snapshot"),
        state: z.enum(["SELECTED", "ABSTAINED"]),
      })
      .strict(),
    artifacts: z.array(ReplayFileSchema).max(100),
    integritySha256: SHA256,
  })
  .strict();

const ReplayEventSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.number().int().positive(),
    eventKey: IDENTIFIER,
    runId: IDENTIFIER,
    recordedAt: ISO_TIMESTAMP,
    type: z.string().trim().min(1).max(160),
  })
  .passthrough();

const ReplaySnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: IDENTIFIER,
    state: z.enum(["SELECTED", "ABSTAINED"]),
    source: z
      .object({
        kind: z.literal("fixture"),
        revision: z.string().trim().min(1).max(160),
        contentSha256: SHA256,
      })
      .passthrough(),
    baseCheckpoint: z.object({ id: IDENTIFIER }).passthrough(),
  })
  .passthrough();

export type TrialSummary = z.infer<typeof TrialSummarySchema>;
export type VerifiedPublicReplay = Readonly<{
  summary: TrialSummary;
  snapshot: z.infer<typeof ReplaySnapshotSchema>;
  events: readonly z.infer<typeof ReplayEventSchema>[];
  manifest: z.infer<typeof ReplayManifestSchema>;
}>;
export type EvidenceReadinessState =
  "unconfigured" | "configured-unverified" | "verifying" | "verified" | "stale" | "degraded";

type JsonValue = boolean | null | number | string | JsonValue[] | { [key: string]: JsonValue };

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key] as JsonValue)]),
    );
  }
  return value;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function integrityHash(value: Record<string, unknown>): string {
  const core = { ...value };
  delete core.integritySha256;
  return sha256(JSON.stringify(canonicalize(core as JsonValue)));
}

function configured(environment: Readonly<Record<string, string | undefined>>): boolean {
  const nebius = Boolean(environment.NEBIUS_API_KEY?.trim());
  const sandboxToken = Boolean(environment.CONTREE_TOKEN?.trim()) || nebius;
  const sandboxProject = Boolean(
    environment.CONTREE_PROJECT?.trim() || environment.NEBIUS_AI_PROJECT?.trim(),
  );
  return nebius && sandboxToken && sandboxProject && Boolean(environment.TAVILY_API_KEY?.trim());
}

function validTrialInvariants(trial: TrialSummary): boolean {
  const checkpointIds = new Set(trial.candidates.map((candidate) => candidate.checkpointImageId));
  const candidateIds = new Set(trial.candidates.map((candidate) => candidate.candidateId));
  const operationIds = new Set(trial.candidates.map((candidate) => candidate.sandboxOperationId));
  const sourceHashes = new Set(trial.candidates.map((candidate) => candidate.sourceSha256));
  const diffHashes = new Set(trial.candidates.map((candidate) => candidate.diffSha256));
  const selectedIsEligible =
    trial.verdict.status !== "selected" ||
    trial.verdict.eligibleCandidateIds.includes(trial.verdict.selectedCandidateId);
  return (
    integrityHash(trial) === trial.integritySha256 &&
    Date.parse(trial.expiresAt) - Date.parse(trial.recordedAt) === 7 * 24 * 60 * 60 * 1_000 &&
    trial.lifecycle.cleanupComplete &&
    checkpointIds.size === 1 &&
    checkpointIds.has(trial.checkpoint.imageId) &&
    candidateIds.size === 3 &&
    operationIds.size === 3 &&
    sourceHashes.size === 3 &&
    diffHashes.size === 3 &&
    trial.candidates.every((candidate) => candidate.sourceSha256 !== trial.inputSourceSha256) &&
    selectedIsEligible
  );
}

async function readBounded(relativePath: string, limit = MAX_FILE_BYTES): Promise<Uint8Array> {
  SAFE_REPLAY_PATH.parse(relativePath);
  const bytes = await readFile(/* turbopackIgnore: true */ path.join(EVIDENCE_ROOT, relativePath));
  if (bytes.byteLength > limit) throw new Error("Public evidence file exceeds its bound.");
  return bytes;
}

type SummaryRead =
  { kind: "absent" } | { kind: "invalid" } | { kind: "valid"; trial: TrialSummary };

const readSummary = cache(async (): Promise<SummaryRead> => {
  let bytes: Uint8Array;
  try {
    bytes = await readBounded("trial-summary.json");
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT"
      ? { kind: "absent" }
      : { kind: "invalid" };
  }
  try {
    const trial = TrialSummarySchema.parse(JSON.parse(Buffer.from(bytes).toString("utf8")));
    return validTrialInvariants(trial) ? { kind: "valid", trial } : { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
});

export const getPromotedTrial = cache(async (): Promise<TrialSummary | null> => {
  const result = await readSummary();
  return result.kind === "valid" ? result.trial : null;
});

async function getPromotedSummaryForRun(runId: string): Promise<TrialSummary | null> {
  const trial = await getPromotedTrial();
  return trial?.runId === runId ? trial : null;
}

async function verifyManifestFile(
  runId: string,
  entry: { path: string; byteLength: number; sha256: string },
): Promise<Uint8Array> {
  const bytes = await readBounded(path.posix.join("replay", runId, entry.path));
  if (bytes.byteLength !== entry.byteLength || sha256(bytes) !== entry.sha256) {
    throw new Error("Replay file digest mismatch.");
  }
  return bytes;
}

export const getPromotedReplay = cache(
  async (runId: string): Promise<VerifiedPublicReplay | null> => {
    try {
      const summary = await getPromotedSummaryForRun(runId);
      if (!summary) return null;
      const manifestBytes = await readBounded(
        path.posix.join("replay", summary.runId, "replay-manifest.json"),
      );
      const manifest = ReplayManifestSchema.parse(
        JSON.parse(Buffer.from(manifestBytes).toString("utf8")),
      );
      const totalBytes = [manifest.eventLog, manifest.snapshot, ...manifest.artifacts].reduce(
        (total, entry) => total + entry.byteLength,
        0,
      );
      if (
        manifest.runId !== summary.runId ||
        manifest.provenance.originalLiveRun.id !== summary.runId ||
        manifest.integritySha256 !== summary.lifecycle.replayManifestSha256 ||
        integrityHash(manifest) !== manifest.integritySha256 ||
        manifest.source.revision !== summary.fixtureRevision ||
        manifest.source.contentSha256 !== summary.fixtureSha256 ||
        totalBytes > MAX_REPLAY_BYTES
      ) {
        return null;
      }
      const [eventsBytes, snapshotBytes] = await Promise.all([
        verifyManifestFile(summary.runId, manifest.eventLog),
        verifyManifestFile(summary.runId, manifest.snapshot),
        ...manifest.artifacts.map((entry) => verifyManifestFile(summary.runId, entry)),
      ]);
      if (!eventsBytes || !snapshotBytes) return null;
      const events = Buffer.from(eventsBytes)
        .toString("utf8")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => ReplayEventSchema.parse(JSON.parse(line)));
      const snapshot = ReplaySnapshotSchema.parse(
        JSON.parse(Buffer.from(snapshotBytes).toString("utf8")),
      );
      if (
        events.length !== manifest.eventLog.eventCount ||
        events.length !== summary.lifecycle.eventCount ||
        events[0]?.eventId !== manifest.eventLog.firstEventId ||
        events.at(-1)?.eventId !== manifest.eventLog.lastEventId ||
        events.some(
          (event, index) => event.eventId !== index + 1 || event.runId !== summary.runId,
        ) ||
        snapshot.id !== summary.runId ||
        snapshot.state !== summary.lifecycle.reducerFinalState ||
        snapshot.source.revision !== summary.fixtureRevision ||
        snapshot.source.contentSha256 !== summary.fixtureSha256 ||
        snapshot.baseCheckpoint.id !== summary.checkpoint.imageId
      ) {
        return null;
      }
      const typedEvents = events.map((event) => RunEventSchema.parse(event));
      const typedSnapshot = RunSchema.parse(snapshot);
      let state = createInitialRunMachineState();
      for (const event of typedEvents) {
        const transition = reduceRunEvent(state, event);
        if (transition.kind !== "applied") return null;
        state = transition.state;
      }
      if (
        !state.run ||
        JSON.stringify(canonicalize(state.run as JsonValue)) !==
          JSON.stringify(canonicalize(typedSnapshot as JsonValue))
      ) {
        return null;
      }
      return { summary, snapshot, events, manifest };
    } catch {
      return null;
    }
  },
);

export async function getPromotedTrialForRun(runId: string): Promise<TrialSummary | null> {
  return (await getPromotedReplay(runId))?.summary ?? null;
}

export async function readCandidateArtifact(
  runId: string,
  candidateId: string,
  kind: "output" | "diff",
): Promise<string | null> {
  const trial = await getPromotedTrialForRun(runId);
  const candidate = trial?.candidates.find((entry) => entry.candidateId === candidateId);
  if (!candidate) return null;
  const expected = kind === "output" ? candidate.outputSha256 : candidate.diffSha256;
  try {
    const bytes = await readBounded(`replay/${runId}/artifacts/sha256/${expected}`, 1_048_576);
    return sha256(bytes) === expected ? Buffer.from(bytes).toString("utf8") : null;
  } catch {
    return null;
  }
}

export async function readPromotedAsset(
  runId: string,
  kind: "patch" | "report",
): Promise<string | null> {
  if (!(await getPromotedReplay(runId))) return null;
  try {
    return Buffer.from(
      await readBounded(kind === "patch" ? "selected.patch" : "report.md"),
    ).toString("utf8");
  } catch {
    return null;
  }
}

export async function getEvidenceReadiness(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<{
  state: EvidenceReadinessState;
  detail: string;
  checkedAt: string;
  trial: TrialSummary | null;
}> {
  const checkedAt = new Date().toISOString();
  if (environment.PORTVERDICT_VERIFICATION_IN_PROGRESS === "1") {
    return {
      state: "verifying",
      detail: "Authenticated sponsor verification is running in the owner-only runner.",
      checkedAt,
      trial: null,
    };
  }
  const result = await readSummary();
  if (result.kind === "absent") {
    return {
      state: configured(environment) ? "configured-unverified" : "unconfigured",
      detail: configured(environment)
        ? "Credentials are present, but no authenticated evidence bundle has been promoted."
        : "No promoted live bundle is present; the synthetic sample remains available.",
      checkedAt,
      trial: null,
    };
  }
  if (result.kind === "invalid") {
    return {
      state: "degraded",
      detail: "The promoted summary failed schema, integrity, or branch-invariant validation.",
      checkedAt,
      trial: null,
    };
  }
  if (!(await getPromotedReplay(result.trial.runId))) {
    return {
      state: "degraded",
      detail: "The promoted replay tree failed manifest or file-digest verification.",
      checkedAt,
      trial: result.trial,
    };
  }
  if (Date.parse(result.trial.expiresAt) <= Date.now()) {
    return {
      state: "stale",
      detail: "The last authenticated live evidence exceeded its seven-day verification TTL.",
      checkedAt,
      trial: result.trial,
    };
  }
  return {
    state: "verified",
    detail:
      "Authenticated inference, one shared checkpoint with three branches, Tavily Search + Extract, cleanup, and replay integrity verified.",
    checkedAt,
    trial: result.trial,
  };
}
