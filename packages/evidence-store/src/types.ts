import type {
  ReplayFileRole,
  ReplayManifest as SharedReplayManifest,
  ReplayProvenance,
  Run,
  RunEvent,
} from "@portverdict/shared-schemas";

import type { REDACTION_VERSION } from "./redaction";

export type { ReplayFileRole, ReplayProvenance, Run, RunEvent } from "@portverdict/shared-schemas";

export const EVIDENCE_STORE_VERSION = 1 as const;

export type ReplayManifest = SharedReplayManifest;
export type ReplayManifestCore = Omit<SharedReplayManifest, "integritySha256">;
export type ArtifactReplayRole = Exclude<ReplayFileRole, "events" | "snapshot">;

export type EvidenceStoreFaultPoint =
  "beforeArtifactRename" | "beforeManifestRename" | "beforeSnapshotRename";

export type FileEvidenceStoreOptions = {
  rootDir?: string;
  environment?: Readonly<Record<string, string | undefined>>;
  clock?: () => Date;
  fsync?: boolean;
  maxArtifactBytes?: number;
  faultInjector?: (point: EvidenceStoreFaultPoint) => Promise<void> | void;
};

export type ReadEventsOptions = {
  afterEventId?: number;
  limit?: number;
  recoverTruncatedTail?: boolean;
};

export type EventLogRecovery = {
  bytesRemoved: number;
  recovered: boolean;
};

export type SnapshotWriteResult = {
  contentSha256: string;
  byteLength: number;
  path: "snapshot.json";
  state: Run["state"];
  redacted: boolean;
  redactionVersion: typeof REDACTION_VERSION;
};

export type PutArtifactOptions = {
  mediaType?: string;
  originalName?: string;
  recordedAt?: string;
  role?: ArtifactReplayRole;
};

export type StoredArtifact = {
  storageSchemaVersion: typeof EVIDENCE_STORE_VERSION;
  artifactId: string;
  runId: string;
  contentSha256: string;
  byteLength: number;
  mediaType: string;
  role: ArtifactReplayRole;
  originalName?: string;
  recordedAt: string;
  redacted: boolean;
  redactionVersion: typeof REDACTION_VERSION;
};

export type ArtifactReadResult = {
  metadata: StoredArtifact;
  content: Uint8Array;
};

export type BuildReplayManifestOptions = {
  provenance: ReplayProvenance;
};

export type ReplayVerificationResult = {
  manifest: ReplayManifest;
  verifiedAt: string;
  fileCount: number;
  totalBytes: number;
};

export interface EvidenceStorePort {
  appendEvent(runId: string, event: RunEvent): Promise<RunEvent>;
  readEvents(runId: string, options?: ReadEventsOptions): Promise<RunEvent[]>;
  recoverEventLog(runId: string): Promise<EventLogRecovery>;
  writeSnapshot(runId: string, snapshot: Run): Promise<SnapshotWriteResult>;
  readSnapshot(runId: string): Promise<Run | null>;
  putArtifact(
    runId: string,
    content: string | Uint8Array,
    options?: PutArtifactOptions,
  ): Promise<StoredArtifact>;
  getArtifact(runId: string, artifactId: string): Promise<ArtifactReadResult>;
  buildReplayManifest(runId: string, options: BuildReplayManifestOptions): Promise<ReplayManifest>;
  verifyReplayManifest(
    runId: string,
    suppliedManifest?: ReplayManifest,
  ): Promise<ReplayVerificationResult>;
}
