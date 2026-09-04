import { z } from "zod";

import {
  IsoDateTimeSchema,
  RelativeArtifactPathSchema,
  RunIdSchema,
  SchemaVersionSchema,
  Sha256Schema,
  uniqueStrings,
} from "./primitives";
import { OriginalLiveRunSchema, RunStateSchema } from "./run";
import { SourceRevisionSchema } from "./source";

export const ReplayFileRoleSchema = z.enum([
  "events",
  "snapshot",
  "evidence",
  "artifact",
  "report",
  "patch",
]);

export const ReplayFileEntrySchema = z
  .object({
    path: RelativeArtifactPathSchema,
    mediaType: z.string().trim().min(1).max(160),
    byteLength: z.number().int().nonnegative(),
    sha256: Sha256Schema,
    role: ReplayFileRoleSchema,
  })
  .strict();

export const ReplayEventLogEntrySchema = z
  .object({
    path: RelativeArtifactPathSchema,
    mediaType: z.literal("application/x-ndjson"),
    byteLength: z.number().int().positive(),
    sha256: Sha256Schema,
    role: z.literal("events"),
    eventCount: z.number().int().positive(),
    firstEventId: z.number().int().positive(),
    lastEventId: z.number().int().positive(),
  })
  .strict()
  .refine(
    (entry) =>
      entry.lastEventId >= entry.firstEventId &&
      entry.eventCount <= entry.lastEventId - entry.firstEventId + 1,
    { message: "Event log bounds do not match its count" },
  );

export const ReplaySnapshotEntrySchema = z
  .object({
    path: RelativeArtifactPathSchema,
    mediaType: z.literal("application/json"),
    byteLength: z.number().int().positive(),
    sha256: Sha256Schema,
    role: z.literal("snapshot"),
    state: RunStateSchema,
  })
  .strict();

export const ReplayProvenanceSchema = z
  .object({
    kind: z.enum(["development-fixture", "recorded-live-run"]),
    label: z.string().trim().min(1).max(240),
    originalLiveRun: OriginalLiveRunSchema.nullable(),
  })
  .strict()
  .superRefine((provenance, context) => {
    if ((provenance.kind === "recorded-live-run") !== (provenance.originalLiveRun !== null)) {
      context.addIssue({
        code: "custom",
        path: ["originalLiveRun"],
        message: "Recorded live replays must identify the original run",
      });
    }
  });

export const ReplayManifestSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    manifestType: z.literal("portverdict.replay"),
    runId: RunIdSchema,
    provenance: ReplayProvenanceSchema,
    source: SourceRevisionSchema,
    createdAt: IsoDateTimeSchema,
    eventLog: ReplayEventLogEntrySchema,
    snapshot: ReplaySnapshotEntrySchema,
    artifacts: z.array(
      ReplayFileEntrySchema.refine(
        (entry) => entry.role !== "events" && entry.role !== "snapshot",
        { message: "Event and snapshot files have dedicated manifest fields" },
      ),
    ),
    integritySha256: Sha256Schema,
  })
  .strict()
  .superRefine((manifest, context) => {
    const paths = [
      manifest.eventLog.path,
      manifest.snapshot.path,
      ...manifest.artifacts.map((artifact) => artifact.path),
    ];
    if (!uniqueStrings(paths)) {
      context.addIssue({ code: "custom", path: ["artifacts"], message: "Paths must be unique" });
    }
  });

export type ReplayFileRole = z.infer<typeof ReplayFileRoleSchema>;
export type ReplayFileEntry = z.infer<typeof ReplayFileEntrySchema>;
export type ReplayEventLogEntry = z.infer<typeof ReplayEventLogEntrySchema>;
export type ReplaySnapshotEntry = z.infer<typeof ReplaySnapshotEntrySchema>;
export type ReplayProvenance = z.infer<typeof ReplayProvenanceSchema>;
export type ReplayManifest = z.infer<typeof ReplayManifestSchema>;
