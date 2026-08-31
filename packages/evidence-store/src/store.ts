import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, truncate, unlink } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

import {
  ReplayManifestSchema,
  ReplayProvenanceSchema,
  RunEventSchema,
  RunSchema,
  SCHEMA_VERSION,
  type JsonValue,
  type ReplayFileEntry,
  type ReplayManifest,
  type Run,
  type RunEvent,
} from "@portverdict/shared-schemas";

import { EvidenceIntegrityError, EvidenceStoreError } from "./errors";
import { canonicalJson, isSha256, sha256Bytes, sha256CanonicalJson } from "./hash";
import { assertSafeIdentifier, assertSafeRelativePath, resolveContainedPath } from "./path-safety";
import { redactForPersistence, redactText, REDACTION_VERSION } from "./redaction";
import {
  EVIDENCE_STORE_VERSION,
  type ArtifactReadResult,
  type BuildReplayManifestOptions,
  type EventLogRecovery,
  type EvidenceStoreFaultPoint,
  type FileEvidenceStoreOptions,
  type PutArtifactOptions,
  type ReadEventsOptions,
  type ReplayManifestCore,
  type ReplayVerificationResult,
  type SnapshotWriteResult,
  type StoredArtifact,
} from "./types";

const EVENTS_FILE = "events.ndjson";
const SNAPSHOT_FILE = "snapshot.json";
const MANIFEST_FILE = "replay-manifest.json";
const ARTIFACT_ID = /^artifact_sha256_([a-f0-9]{64})$/u;
const ARTIFACT_ROLES = new Set(["evidence", "artifact", "report", "patch"] as const);
const MEDIA_TYPE =
  /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}(?:\s*;\s*charset=[a-z0-9._-]+)?$/iu;
const DEFAULT_MAX_ARTIFACT_BYTES = 20_000_000;

type FileDigest = {
  path: string;
  byteLength: number;
  sha256: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJson(text: string, description: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new EvidenceIntegrityError(`${description} is not valid JSON`, { cause: error });
  }
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new EvidenceStoreError("INVALID_EVENT", `${label} must be a non-negative safe integer`);
  }
}

function assertIsoTimestamp(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || Number.isNaN(Date.parse(value))) {
    throw new EvidenceStoreError("INVALID_EVENT", `${label} must be an ISO timestamp`);
  }
}

function schemaIssueSummary(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): string {
  return issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`)
    .join("; ");
}

function parseIncomingRunEvent(value: unknown, expectedRunId: string): RunEvent {
  const result = RunEventSchema.safeParse(value);
  if (!result.success) {
    throw new EvidenceStoreError(
      "INVALID_EVENT",
      `Event does not match RunEventSchema: ${schemaIssueSummary(result.error.issues)}`,
    );
  }
  if (result.data.runId !== expectedRunId) {
    throw new EvidenceStoreError("INVALID_EVENT", "Event run ID does not match its run directory");
  }
  return result.data;
}

function parsePersistedRunEvent(value: unknown, expectedRunId: string): RunEvent {
  try {
    return parseIncomingRunEvent(value, expectedRunId);
  } catch (error) {
    throw new EvidenceIntegrityError("Persisted event does not match RunEventSchema", {
      cause: error,
    });
  }
}

function parsePersistedRun(value: unknown, expectedRunId: string): Run {
  const result = RunSchema.safeParse(value);
  if (!result.success || result.data.id !== expectedRunId) {
    throw new EvidenceIntegrityError(
      result.success
        ? "Snapshot run ID does not match its run directory"
        : `Snapshot does not match RunSchema: ${schemaIssueSummary(result.error.issues)}`,
    );
  }
  return result.data;
}

function asStoredArtifact(value: unknown, expectedRunId: string): StoredArtifact {
  if (
    !isRecord(value) ||
    value.storageSchemaVersion !== EVIDENCE_STORE_VERSION ||
    typeof value.artifactId !== "string" ||
    !ARTIFACT_ID.test(value.artifactId) ||
    value.runId !== expectedRunId ||
    !isSha256(value.contentSha256) ||
    typeof value.byteLength !== "number" ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 0 ||
    typeof value.mediaType !== "string" ||
    value.mediaType.length === 0 ||
    typeof value.role !== "string" ||
    !ARTIFACT_ROLES.has(value.role as "evidence" | "artifact" | "report" | "patch") ||
    typeof value.recordedAt !== "string" ||
    typeof value.redacted !== "boolean" ||
    value.redactionVersion !== REDACTION_VERSION ||
    (value.originalName !== undefined && typeof value.originalName !== "string")
  ) {
    throw new EvidenceIntegrityError("Artifact metadata does not match the persisted contract");
  }

  assertIsoTimestamp(value.recordedAt, "artifact recordedAt");
  const artifactHash = ARTIFACT_ID.exec(value.artifactId)?.[1];
  if (artifactHash !== value.contentSha256) {
    throw new EvidenceIntegrityError("Artifact ID and content hash disagree");
  }
  return value as StoredArtifact;
}

function preflightManifestPaths(value: unknown): void {
  if (!isRecord(value)) {
    return;
  }
  if (isRecord(value.eventLog) && typeof value.eventLog.path === "string") {
    assertSafeRelativePath(value.eventLog.path);
  }
  if (isRecord(value.snapshot) && typeof value.snapshot.path === "string") {
    assertSafeRelativePath(value.snapshot.path);
  }
  if (Array.isArray(value.artifacts)) {
    for (const artifact of value.artifacts) {
      if (isRecord(artifact) && typeof artifact.path === "string") {
        assertSafeRelativePath(artifact.path);
      }
    }
  }
}

function parseReplayManifest(value: unknown): ReplayManifest {
  preflightManifestPaths(value);
  const result = ReplayManifestSchema.safeParse(value);
  if (!result.success) {
    throw new EvidenceStoreError(
      "INVALID_MANIFEST",
      `Replay manifest does not match ReplayManifestSchema: ${schemaIssueSummary(result.error.issues)}`,
    );
  }
  return result.data;
}

function withoutManifestHash(manifest: ReplayManifest): ReplayManifestCore {
  const { integritySha256: _integritySha256, ...core } = manifest;
  return core;
}

export function computeReplayManifestSha256(manifest: ReplayManifestCore): string {
  return sha256CanonicalJson(manifest);
}

function mediaTypeIsTextual(mediaType: string): boolean {
  const normalized = mediaType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return (
    normalized.startsWith("text/") ||
    /(?:json|javascript|xml|yaml|toml|csv|svg\+xml)$/u.test(normalized)
  );
}

function prepareArtifactBytes(
  content: string | Uint8Array,
  mediaType: string,
): { bytes: Buffer; redacted: boolean } {
  if (typeof content === "string") {
    const result = redactText(content);
    return { bytes: Buffer.from(result.value, "utf8"), redacted: result.redacted };
  }

  if (!mediaTypeIsTextual(mediaType)) {
    return { bytes: Buffer.from(content), redacted: false };
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch (error) {
    throw new EvidenceStoreError(
      "SERIALIZATION_FAILURE",
      `Artifact declared as ${mediaType} is not valid UTF-8`,
      { cause: error },
    );
  }
  const result = redactText(decoded);
  return { bytes: Buffer.from(result.value, "utf8"), redacted: result.redacted };
}

export class FileEvidenceStore {
  readonly rootDir: string;

  private readonly clock: () => Date;
  private readonly shouldFsync: boolean;
  private readonly maxArtifactBytes: number;
  private readonly faultInjector?: FileEvidenceStoreOptions["faultInjector"];
  private readonly runLocks = new Map<string, Promise<void>>();

  constructor(options: FileEvidenceStoreOptions = {}) {
    const environment = options.environment ?? process.env;
    this.rootDir = path.resolve(
      options.rootDir ??
        environment.PORTVERDICT_RUN_DIR ??
        path.join(process.cwd(), ".portverdict", "runs"),
    );
    this.clock = options.clock ?? (() => new Date());
    this.shouldFsync = options.fsync ?? true;
    this.maxArtifactBytes = options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;
    if (!Number.isSafeInteger(this.maxArtifactBytes) || this.maxArtifactBytes <= 0) {
      throw new EvidenceStoreError(
        "SERIALIZATION_FAILURE",
        "maxArtifactBytes must be a positive safe integer",
      );
    }
    this.faultInjector = options.faultInjector;
  }

  resolveRunDirectory(runId: string): string {
    assertSafeIdentifier(runId, "run ID");
    return path.join(this.rootDir, runId);
  }

  async appendEvent(runId: string, event: RunEvent): Promise<RunEvent> {
    return this.withRunLock(runId, async () => {
      const runDirectory = await this.ensureRunDirectory(runId);
      await this.recoverEventLogUnlocked(runDirectory);
      const previous = await this.readEventsUnlocked(runId, runDirectory);
      const validated = parseIncomingRunEvent(event, runId);
      const expectedEventId = (previous.at(-1)?.eventId ?? 0) + 1;
      if (validated.eventId !== expectedEventId) {
        throw new EvidenceStoreError(
          "INVALID_EVENT",
          `Expected event ID ${expectedEventId}, received ${validated.eventId}`,
        );
      }
      if (previous.some((persisted) => persisted.eventKey === validated.eventKey)) {
        throw new EvidenceStoreError(
          "INVALID_EVENT",
          `Event key ${validated.eventKey} has already been persisted`,
        );
      }

      const redaction = redactForPersistence(validated as JsonValue);
      const persisted = parseIncomingRunEvent(redaction.value, runId);
      const line = `${canonicalJson(persisted)}\n`;
      const eventPath = path.join(runDirectory, EVENTS_FILE);
      const handle = await open(eventPath, "a", 0o600);
      try {
        await handle.writeFile(line, "utf8");
        if (this.shouldFsync) {
          await handle.sync();
        }
      } finally {
        await handle.close();
      }
      return persisted;
    });
  }

  async readEvents(runId: string, options: ReadEventsOptions = {}): Promise<RunEvent[]> {
    const afterEventId = options.afterEventId ?? 0;
    assertNonNegativeInteger(afterEventId, "afterEventId");
    if (
      options.limit !== undefined &&
      (!Number.isSafeInteger(options.limit) || options.limit <= 0)
    ) {
      throw new EvidenceStoreError("INVALID_EVENT", "limit must be a positive safe integer");
    }

    if (options.recoverTruncatedTail ?? true) {
      return this.withRunLock(runId, async () => {
        const runDirectory = await this.ensureRunDirectory(runId);
        await this.recoverEventLogUnlocked(runDirectory);
        return this.filterEvents(
          await this.readEventsUnlocked(runId, runDirectory),
          afterEventId,
          options.limit,
        );
      });
    }

    return this.filterEvents(
      await this.readEventsUnlocked(runId, this.resolveRunDirectory(runId)),
      afterEventId,
      options.limit,
    );
  }

  async recoverEventLog(runId: string): Promise<EventLogRecovery> {
    return this.withRunLock(runId, async () => {
      const runDirectory = await this.ensureRunDirectory(runId);
      return this.recoverEventLogUnlocked(runDirectory);
    });
  }

  async writeSnapshot(runId: string, snapshot: Run): Promise<SnapshotWriteResult> {
    return this.withRunLock(runId, async () => {
      const parsed = RunSchema.safeParse(snapshot);
      if (!parsed.success) {
        throw new EvidenceStoreError(
          "SERIALIZATION_FAILURE",
          `Snapshot does not match RunSchema: ${schemaIssueSummary(parsed.error.issues)}`,
        );
      }
      if (parsed.data.id !== runId) {
        throw new EvidenceStoreError(
          "SERIALIZATION_FAILURE",
          "Snapshot run ID does not match its run directory",
        );
      }
      const redaction = redactForPersistence(parsed.data as JsonValue);
      const persisted = RunSchema.safeParse(redaction.value);
      if (!persisted.success) {
        throw new EvidenceStoreError(
          "SERIALIZATION_FAILURE",
          "Redaction made the snapshot invalid; secret-bearing identity fields are not persistable",
        );
      }

      const runDirectory = await this.ensureRunDirectory(runId);
      const bytes = Buffer.from(`${canonicalJson(persisted.data)}\n`, "utf8");
      await this.atomicWrite(path.join(runDirectory, SNAPSHOT_FILE), bytes, "beforeSnapshotRename");
      return {
        contentSha256: sha256Bytes(bytes),
        byteLength: bytes.byteLength,
        path: SNAPSHOT_FILE,
        state: persisted.data.state,
        redacted: redaction.redacted,
        redactionVersion: REDACTION_VERSION,
      };
    });
  }

  async readSnapshot(runId: string): Promise<Run | null> {
    const snapshotPath = path.join(this.resolveRunDirectory(runId), SNAPSHOT_FILE);
    try {
      return parsePersistedRun(parseJson(await readFile(snapshotPath, "utf8"), "Snapshot"), runId);
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async putArtifact(
    runId: string,
    content: string | Uint8Array,
    options: PutArtifactOptions = {},
  ): Promise<StoredArtifact> {
    return this.withRunLock(runId, async () => {
      const runDirectory = await this.ensureRunDirectory(runId);
      const mediaType =
        options.mediaType ??
        (typeof content === "string" ? "text/plain; charset=utf-8" : "application/octet-stream");
      if (mediaType.length > 160 || !MEDIA_TYPE.test(mediaType)) {
        throw new EvidenceStoreError(
          "SERIALIZATION_FAILURE",
          "Artifact media type must be a bounded MIME type",
        );
      }
      const role = options.role ?? "artifact";
      if (!ARTIFACT_ROLES.has(role)) {
        throw new EvidenceStoreError("SERIALIZATION_FAILURE", "Artifact replay role is invalid");
      }
      if (
        options.originalName !== undefined &&
        (options.originalName.length > 512 || /[\u0000-\u001f\u007f]/u.test(options.originalName))
      ) {
        throw new EvidenceStoreError(
          "SERIALIZATION_FAILURE",
          "Artifact originalName must be at most 512 printable characters",
        );
      }
      const prepared = prepareArtifactBytes(content, mediaType);
      if (prepared.bytes.byteLength > this.maxArtifactBytes) {
        throw new EvidenceStoreError(
          "SERIALIZATION_FAILURE",
          `Artifact exceeds the configured ${this.maxArtifactBytes}-byte limit`,
        );
      }
      const contentSha256 = sha256Bytes(prepared.bytes);
      const artifactId = `artifact_sha256_${contentSha256}`;
      const contentPath = path.join(runDirectory, "artifacts", "sha256", contentSha256);
      const metadataPath = path.join(
        runDirectory,
        "artifacts",
        "metadata",
        `${contentSha256}.json`,
      );

      try {
        const existing = await readFile(contentPath);
        if (sha256Bytes(existing) !== contentSha256) {
          throw new EvidenceIntegrityError(
            `Existing content-addressed artifact ${artifactId} is corrupt`,
          );
        }
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
        await this.atomicWrite(contentPath, prepared.bytes, "beforeArtifactRename");
      }

      const originalName =
        options.originalName === undefined ? undefined : redactText(options.originalName).value;

      try {
        const existingMetadata = asStoredArtifact(
          parseJson(await readFile(metadataPath, "utf8"), "Artifact metadata"),
          runId,
        );
        if (existingMetadata.mediaType !== mediaType || existingMetadata.role !== role) {
          throw new EvidenceStoreError(
            "SERIALIZATION_FAILURE",
            "The same content hash is already registered with different immutable metadata",
          );
        }
        return existingMetadata;
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
      }

      const recordedAt = options.recordedAt ?? this.clock().toISOString();
      assertIsoTimestamp(recordedAt, "artifact recordedAt");
      const metadata: StoredArtifact = {
        storageSchemaVersion: EVIDENCE_STORE_VERSION,
        artifactId,
        runId,
        contentSha256,
        byteLength: prepared.bytes.byteLength,
        mediaType,
        role,
        recordedAt,
        redacted: prepared.redacted,
        redactionVersion: REDACTION_VERSION,
        ...(originalName === undefined ? {} : { originalName }),
      };
      await this.atomicWrite(metadataPath, Buffer.from(`${canonicalJson(metadata)}\n`, "utf8"));
      return metadata;
    });
  }

  async getArtifact(runId: string, artifactId: string): Promise<ArtifactReadResult> {
    const match = ARTIFACT_ID.exec(artifactId);
    if (!match) {
      throw new EvidenceStoreError("INVALID_IDENTIFIER", "Artifact ID is invalid");
    }
    const contentSha256 = match[1] as string;
    const runDirectory = this.resolveRunDirectory(runId);
    const metadataPath = path.join(runDirectory, "artifacts", "metadata", `${contentSha256}.json`);
    const contentPath = path.join(runDirectory, "artifacts", "sha256", contentSha256);
    try {
      const [metadataBytes, content] = await Promise.all([
        readFile(metadataPath, "utf8"),
        readFile(contentPath),
      ]);
      const metadata = asStoredArtifact(parseJson(metadataBytes, "Artifact metadata"), runId);
      if (metadata.artifactId !== artifactId || sha256Bytes(content) !== metadata.contentSha256) {
        throw new EvidenceIntegrityError(`Artifact ${artifactId} failed content verification`);
      }
      return { metadata, content };
    } catch (error) {
      if (isNotFound(error)) {
        throw new EvidenceStoreError("NOT_FOUND", `Artifact ${artifactId} was not found`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  async buildReplayManifest(
    runId: string,
    options: BuildReplayManifestOptions,
  ): Promise<ReplayManifest> {
    return this.withRunLock(runId, async () => {
      const provenance = ReplayProvenanceSchema.safeParse(options.provenance);
      if (!provenance.success) {
        throw new EvidenceStoreError(
          "INVALID_MANIFEST",
          `Replay provenance is invalid: ${schemaIssueSummary(provenance.error.issues)}`,
        );
      }

      const runDirectory = await this.ensureRunDirectory(runId);
      await this.recoverEventLogUnlocked(runDirectory);
      const eventPath = path.join(runDirectory, EVENTS_FILE);
      const events = await this.readEventsUnlocked(runId, runDirectory);
      if (events.length === 0) {
        throw new EvidenceStoreError(
          "INVALID_MANIFEST",
          "A replay manifest requires at least one persisted event",
        );
      }
      const snapshot = await this.readSnapshot(runId);
      if (snapshot === null || snapshot.source === null) {
        throw new EvidenceStoreError(
          "INVALID_MANIFEST",
          "A replay manifest requires a source-resolved Run snapshot",
        );
      }

      const eventDigest = await this.digestFile(eventPath, EVENTS_FILE);
      const snapshotDigest = await this.digestFile(
        path.join(runDirectory, SNAPSHOT_FILE),
        SNAPSHOT_FILE,
      );
      const artifacts = await this.collectArtifactDigests(runId, runDirectory);
      const core: ReplayManifestCore = {
        schemaVersion: SCHEMA_VERSION,
        manifestType: "portverdict.replay",
        runId,
        provenance: provenance.data,
        source: snapshot.source,
        createdAt: this.clock().toISOString(),
        eventLog: {
          ...eventDigest,
          mediaType: "application/x-ndjson",
          role: "events",
          eventCount: events.length,
          firstEventId: events[0]?.eventId ?? 1,
          lastEventId: events.at(-1)?.eventId ?? 1,
        },
        snapshot: {
          ...snapshotDigest,
          mediaType: "application/json",
          role: "snapshot",
          state: snapshot.state,
        },
        artifacts,
      };
      const manifest = parseReplayManifest({
        ...core,
        integritySha256: computeReplayManifestSha256(core),
      });
      await this.atomicWrite(
        path.join(runDirectory, MANIFEST_FILE),
        Buffer.from(`${canonicalJson(manifest)}\n`, "utf8"),
        "beforeManifestRename",
      );
      return manifest;
    });
  }

  async readReplayManifest(runId: string): Promise<ReplayManifest> {
    const manifestPath = path.join(this.resolveRunDirectory(runId), MANIFEST_FILE);
    try {
      return parseReplayManifest(
        parseJson(await readFile(manifestPath, "utf8"), "Replay manifest"),
      );
    } catch (error) {
      if (isNotFound(error)) {
        throw new EvidenceStoreError("NOT_FOUND", `Replay manifest for ${runId} was not found`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  async verifyReplayManifest(
    runId: string,
    suppliedManifest?: ReplayManifest,
  ): Promise<ReplayVerificationResult> {
    const manifest = parseReplayManifest(
      suppliedManifest ?? (await this.readReplayManifest(runId)),
    );
    if (manifest.runId !== runId) {
      throw new EvidenceIntegrityError("Replay manifest run ID does not match the requested run");
    }
    const expectedManifestHash = computeReplayManifestSha256(withoutManifestHash(manifest));
    if (manifest.integritySha256 !== expectedManifestHash) {
      throw new EvidenceIntegrityError("Replay manifest self-hash does not match its contents");
    }

    const runDirectory = this.resolveRunDirectory(runId);
    const eventPath = resolveContainedPath(runDirectory, manifest.eventLog.path);
    await this.verifyFileDigest(eventPath, manifest.eventLog, "event log");
    const events = await this.readEventsFromPath(runId, eventPath);
    if (
      events.length !== manifest.eventLog.eventCount ||
      events[0]?.eventId !== manifest.eventLog.firstEventId ||
      events.at(-1)?.eventId !== manifest.eventLog.lastEventId
    ) {
      throw new EvidenceIntegrityError("Replay event bounds do not match the manifest");
    }

    const snapshotPath = resolveContainedPath(runDirectory, manifest.snapshot.path);
    await this.verifyFileDigest(snapshotPath, manifest.snapshot, "snapshot");
    const snapshot = parsePersistedRun(
      parseJson(await readFile(snapshotPath, "utf8"), "Snapshot"),
      runId,
    );
    if (
      snapshot.state !== manifest.snapshot.state ||
      snapshot.source === null ||
      canonicalJson(snapshot.source) !== canonicalJson(manifest.source)
    ) {
      throw new EvidenceIntegrityError(
        "Replay snapshot state or source disagrees with the manifest",
      );
    }

    let totalBytes = manifest.eventLog.byteLength + manifest.snapshot.byteLength;
    for (const artifact of manifest.artifacts) {
      await this.verifyFileDigest(
        resolveContainedPath(runDirectory, artifact.path),
        artifact,
        `artifact ${artifact.path}`,
      );
      totalBytes += artifact.byteLength;
    }

    return {
      manifest,
      verifiedAt: this.clock().toISOString(),
      fileCount: 2 + manifest.artifacts.length,
      totalBytes,
    };
  }

  private async ensureRunDirectory(runId: string): Promise<string> {
    const runDirectory = this.resolveRunDirectory(runId);
    await mkdir(runDirectory, { recursive: true, mode: 0o700 });
    return runDirectory;
  }

  private filterEvents(events: RunEvent[], afterEventId: number, limit?: number): RunEvent[] {
    const resumed = events.filter((event) => event.eventId > afterEventId);
    return limit === undefined ? resumed : resumed.slice(0, limit);
  }

  private async readEventsUnlocked(runId: string, runDirectory: string): Promise<RunEvent[]> {
    return this.readEventsFromPath(runId, path.join(runDirectory, EVENTS_FILE));
  }

  private async readEventsFromPath(runId: string, eventPath: string): Promise<RunEvent[]> {
    let bytes: Buffer;
    try {
      bytes = await readFile(eventPath);
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }

    if (bytes.byteLength > 0 && bytes.at(-1) !== 0x0a) {
      throw new EvidenceIntegrityError("Event log has an uncommitted trailing fragment");
    }

    const lines = bytes.toString("utf8").split("\n");
    lines.pop();
    const events: RunEvent[] = [];
    const eventKeys = new Set<string>();
    for (const [index, line] of lines.entries()) {
      if (line.length === 0) {
        throw new EvidenceIntegrityError(
          `Event log contains a blank committed line at ${index + 1}`,
        );
      }
      const event = parsePersistedRunEvent(parseJson(line, `Event line ${index + 1}`), runId);
      const expectedId = index + 1;
      if (event.eventId !== expectedId) {
        throw new EvidenceIntegrityError(
          `Event ${event.eventId} violates the expected monotonic cursor ${expectedId}`,
        );
      }
      if (eventKeys.has(event.eventKey)) {
        throw new EvidenceIntegrityError(`Event key ${event.eventKey} is duplicated`);
      }
      eventKeys.add(event.eventKey);
      events.push(event);
    }
    return events;
  }

  private async recoverEventLogUnlocked(runDirectory: string): Promise<EventLogRecovery> {
    const eventPath = path.join(runDirectory, EVENTS_FILE);
    let bytes: Buffer;
    try {
      bytes = await readFile(eventPath);
    } catch (error) {
      if (isNotFound(error)) {
        return { recovered: false, bytesRemoved: 0 };
      }
      throw error;
    }

    if (bytes.byteLength === 0 || bytes.at(-1) === 0x0a) {
      return { recovered: false, bytesRemoved: 0 };
    }

    const finalNewline = bytes.lastIndexOf(0x0a);
    const committedLength = finalNewline + 1;
    const bytesRemoved = bytes.byteLength - committedLength;
    await truncate(eventPath, committedLength);
    return { recovered: true, bytesRemoved };
  }

  private async collectArtifactDigests(
    runId: string,
    runDirectory: string,
  ): Promise<ReplayFileEntry[]> {
    const metadataDirectory = path.join(runDirectory, "artifacts", "metadata");
    let names: string[];
    try {
      names = await readdir(metadataDirectory);
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }

    const artifacts: ReplayFileEntry[] = [];
    for (const name of names.sort()) {
      if (!/^[a-f0-9]{64}\.json$/u.test(name)) {
        throw new EvidenceIntegrityError(`Unexpected artifact metadata filename ${name}`);
      }
      const metadata = asStoredArtifact(
        parseJson(await readFile(path.join(metadataDirectory, name), "utf8"), "Artifact metadata"),
        runId,
      );
      const relativePath = `artifacts/sha256/${metadata.contentSha256}`;
      const digest = await this.digestFile(path.join(runDirectory, relativePath), relativePath);
      if (digest.sha256 !== metadata.contentSha256 || digest.byteLength !== metadata.byteLength) {
        throw new EvidenceIntegrityError(
          `Artifact ${metadata.artifactId} metadata does not match content`,
        );
      }
      artifacts.push({
        ...digest,
        mediaType: metadata.mediaType,
        role: metadata.role,
      });
    }
    return artifacts;
  }

  private async digestFile(absolutePath: string, manifestPath: string): Promise<FileDigest> {
    const bytes = await readFile(absolutePath);
    return {
      path: manifestPath,
      sha256: sha256Bytes(bytes),
      byteLength: bytes.byteLength,
    };
  }

  private async verifyFileDigest(
    absolutePath: string,
    expected: { byteLength: number; sha256: string },
    label: string,
  ): Promise<void> {
    let bytes: Buffer;
    try {
      bytes = await readFile(absolutePath);
    } catch (error) {
      if (isNotFound(error)) {
        throw new EvidenceIntegrityError(`Replay ${label} is missing`, { cause: error });
      }
      throw error;
    }
    if (bytes.byteLength !== expected.byteLength || sha256Bytes(bytes) !== expected.sha256) {
      throw new EvidenceIntegrityError(`Replay ${label} failed its SHA-256 or size check`);
    }
  }

  private async atomicWrite(
    destination: string,
    bytes: Uint8Array,
    faultPoint?: EvidenceStoreFaultPoint,
  ): Promise<void> {
    const directory = path.dirname(destination);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(
      directory,
      `.${path.basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
    );
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      if (this.shouldFsync) {
        await handle.sync();
      }
    } finally {
      await handle.close();
    }

    try {
      if (faultPoint !== undefined) {
        await this.faultInjector?.(faultPoint);
      }
      await rename(temporary, destination);
      if (this.shouldFsync) {
        await this.syncDirectory(directory);
      }
    } finally {
      await unlink(temporary).catch((error: unknown) => {
        if (!isNotFound(error)) {
          throw error;
        }
      });
    }
  }

  private async syncDirectory(directory: string): Promise<void> {
    const handle = await open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async withRunLock<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    assertSafeIdentifier(runId, "run ID");
    const previous = this.runLocks.get(runId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.runLocks.set(runId, tail);
    try {
      return await current;
    } finally {
      if (this.runLocks.get(runId) === tail) {
        this.runLocks.delete(runId);
      }
    }
  }
}

function isNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}
