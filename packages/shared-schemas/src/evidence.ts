import { z } from "zod";

import {
  ArtifactIdSchema,
  CandidateIdSchema,
  EvidenceIdSchema,
  HttpsUrlSchema,
  IsoDateTimeSchema,
  JsonValueSchema,
  RunIdSchema,
  Sha256Schema,
  uniqueStrings,
} from "./primitives.js";

export const EvidenceClassificationSchema = z.enum([
  "measured",
  "observed",
  "external-source",
  "model-rationale",
  "unsupported",
]);

export const TextEvidenceObservationSchema = z
  .object({
    kind: z.literal("text"),
    value: z.string().max(20_000),
  })
  .strict();

export const JsonEvidenceObservationSchema = z
  .object({
    kind: z.literal("json"),
    value: JsonValueSchema,
  })
  .strict();

export const CommandEvidenceObservationSchema = z
  .object({
    kind: z.literal("command"),
    commandTemplate: z.string().trim().min(1).max(240),
    exitCode: z.number().int().min(0).max(255).nullable(),
    durationMs: z.number().int().nonnegative(),
    timedOut: z.boolean(),
    stdoutArtifactId: ArtifactIdSchema.nullable(),
    stderrArtifactId: ArtifactIdSchema.nullable(),
  })
  .strict()
  .superRefine((observation, context) => {
    if (!observation.timedOut && observation.exitCode === null) {
      context.addIssue({ code: "custom", message: "A completed command needs an exit code" });
    }
  });

export const MetricEvidenceObservationSchema = z
  .object({
    kind: z.literal("metric"),
    metric: z.string().trim().min(1).max(160),
    value: z.number().finite(),
    unit: z.string().trim().min(1).max(64),
    sampleSize: z.number().int().positive().nullable(),
  })
  .strict();

export const StatusEvidenceObservationSchema = z
  .object({
    kind: z.literal("status"),
    status: z.enum(["passed", "failed", "inconclusive"]),
    detail: z.string().max(4_000),
  })
  .strict();

export const EvidenceObservationSchema = z.discriminatedUnion("kind", [
  TextEvidenceObservationSchema,
  JsonEvidenceObservationSchema,
  CommandEvidenceObservationSchema,
  MetricEvidenceObservationSchema,
  StatusEvidenceObservationSchema,
]);

export const EvidenceProvenanceSchema = z
  .object({
    sourceRevision: z.string().trim().min(1).max(160),
    sandboxOperationId: z.string().trim().min(1).max(256).nullable(),
    sandboxImageId: z.string().trim().min(1).max(256).nullable(),
    integrationRequestId: z.string().trim().min(1).max(256).nullable(),
    artifactId: ArtifactIdSchema,
    contentSha256: Sha256Schema,
    recordedAt: IsoDateTimeSchema,
  })
  .strict();

export const SourceCitationSchema = z
  .object({
    url: HttpsUrlSchema,
    title: z.string().trim().min(1).max(500),
    publisher: z.string().trim().min(1).max(160),
    retrievedAt: IsoDateTimeSchema,
    contentSha256: Sha256Schema,
    requestId: z.string().trim().min(1).max(256).nullable(),
  })
  .strict();

export const EvidenceSchema = z
  .object({
    id: EvidenceIdSchema,
    runId: RunIdSchema,
    candidateId: CandidateIdSchema.nullable(),
    claim: z.string().trim().min(1).max(4_000),
    classification: EvidenceClassificationSchema,
    procedure: z.string().trim().min(1).max(8_000),
    observation: EvidenceObservationSchema,
    provenance: EvidenceProvenanceSchema,
    sources: z.array(SourceCitationSchema).max(20),
    redactionVersion: z.string().trim().min(1).max(64),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (evidence.classification === "external-source" && evidence.sources.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "External-source evidence needs at least one citation",
      });
    }
  });

export const HardGateNameSchema = z.enum([
  "build",
  "original-tests",
  "migration-tests",
  "schema",
  "tool-calls",
  "prompt-regression",
  "secret-scan",
  "security",
  "nebius-runtime",
  "evidence-completeness",
]);

export const HardGateStatusSchema = z.enum(["passed", "failed", "inconclusive"]);

export const HardGateResultSchema = z
  .object({
    gate: HardGateNameSchema,
    status: HardGateStatusSchema,
    evidenceIds: z.array(EvidenceIdSchema).min(1).refine(uniqueStrings, {
      message: "Gate evidence IDs must be unique",
    }),
  })
  .strict();

export type EvidenceClassification = z.infer<typeof EvidenceClassificationSchema>;
export type EvidenceObservation = z.infer<typeof EvidenceObservationSchema>;
export type EvidenceProvenance = z.infer<typeof EvidenceProvenanceSchema>;
export type SourceCitation = z.infer<typeof SourceCitationSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type HardGateName = z.infer<typeof HardGateNameSchema>;
export type HardGateStatus = z.infer<typeof HardGateStatusSchema>;
export type HardGateResult = z.infer<typeof HardGateResultSchema>;
