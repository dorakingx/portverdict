import { z } from "zod";

import {
  ArtifactIdSchema,
  CandidateIdSchema,
  EventKeySchema,
  EvidenceIdSchema,
  IsoDateTimeSchema,
  RunIdSchema,
  SchemaVersionSchema,
  uniqueStrings,
} from "./primitives";
import {
  BaseCheckpointSchema,
  CandidateFailureSchema,
  CandidateScoreSchema,
  CandidateStateSchema,
  CandidateStrategySchema,
  RunConfigSchema,
  RunFailureSchema,
  RunModeSchema,
  SelectedVerdictSchema,
  AbstainedVerdictSchema,
} from "./run";
import { HardGateResultSchema } from "./evidence";
import { SourceRequestSchema, SourceRevisionSchema } from "./source";

export const OrchestrationStageSchema = z.enum([
  "source-resolution",
  "inventory",
  "specification",
  "base-checkpoint",
  "candidate-execution",
  "candidate-evaluation",
  "falsification",
  "scoring",
  "verdict",
]);

const EventBaseShape = {
  schemaVersion: SchemaVersionSchema,
  eventId: z.number().int().positive(),
  eventKey: EventKeySchema,
  runId: RunIdSchema,
  recordedAt: IsoDateTimeSchema,
};

export const RunReceivedEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("run.received"),
    mode: RunModeSchema,
    sourceRequest: SourceRequestSchema,
    config: RunConfigSchema,
    idempotencyKey: z.uuid(),
  })
  .strict();

export const SourceResolvedEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("source.resolved"),
    source: SourceRevisionSchema,
    evidenceIds: z.array(EvidenceIdSchema).refine(uniqueStrings),
  })
  .strict();

export const InventoryCompletedEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("inventory.completed"),
    artifactId: ArtifactIdSchema,
    evidenceIds: z.array(EvidenceIdSchema).min(1).refine(uniqueStrings),
  })
  .strict();

export const SpecificationCompletedEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("specification.completed"),
    artifactId: ArtifactIdSchema,
    evidenceIds: z.array(EvidenceIdSchema).min(1).refine(uniqueStrings),
  })
  .strict();

export const CandidateSeedSchema = z
  .object({
    id: CandidateIdSchema,
    strategy: CandidateStrategySchema,
  })
  .strict();

export const BaseCheckpointReadyEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("checkpoint.ready"),
    checkpoint: BaseCheckpointSchema,
    candidateSeeds: z.array(CandidateSeedSchema).min(1).max(3),
    evidenceIds: z.array(EvidenceIdSchema).min(1).refine(uniqueStrings),
  })
  .strict()
  .superRefine((event, context) => {
    if (!uniqueStrings(event.candidateSeeds.map((seed) => seed.id))) {
      context.addIssue({ code: "custom", path: ["candidateSeeds"], message: "Duplicate ID" });
    }
    if (!uniqueStrings(event.candidateSeeds.map((seed) => seed.strategy))) {
      context.addIssue({
        code: "custom",
        path: ["candidateSeeds"],
        message: "Duplicate strategy",
      });
    }
  });

export const CandidatesStartedEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("candidates.started"),
  })
  .strict();

export const CandidateTransitionedEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("candidate.transitioned"),
    candidateId: CandidateIdSchema,
    from: CandidateStateSchema,
    to: CandidateStateSchema,
    sandboxOperationId: z.string().trim().min(1).max(256).nullable(),
    hardGates: z.array(HardGateResultSchema),
    score: CandidateScoreSchema.nullable(),
    failure: CandidateFailureSchema.nullable(),
    evidenceIds: z.array(EvidenceIdSchema).refine(uniqueStrings),
  })
  .strict();

export const CandidatesEvaluatedEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("candidates.evaluated"),
    evidenceIds: z.array(EvidenceIdSchema).min(1).refine(uniqueStrings),
  })
  .strict();

export const FalsificationCompletedEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("falsification.completed"),
    evidenceIds: z.array(EvidenceIdSchema).min(1).refine(uniqueStrings),
  })
  .strict();

export const ScoringCompletedEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("scoring.completed"),
    scores: z.array(CandidateScoreSchema).min(1),
    evidenceIds: z.array(EvidenceIdSchema).min(1).refine(uniqueStrings),
  })
  .strict()
  .refine((event) => uniqueStrings(event.scores.map((score) => score.candidateId)), {
    path: ["scores"],
    message: "Candidate scores must be unique",
  });

export const VerdictSelectedEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("verdict.selected"),
    verdict: SelectedVerdictSchema,
  })
  .strict();

export const VerdictAbstainedEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("verdict.abstained"),
    verdict: AbstainedVerdictSchema,
  })
  .strict();

export const OrchestrationStageFailedEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("orchestration.stage.failed"),
    stage: OrchestrationStageSchema,
    code: z.string().trim().min(1).max(160),
    message: z.string().trim().min(1).max(4_000),
    evidenceIds: z.array(EvidenceIdSchema).refine(uniqueStrings),
  })
  .strict();

export const RunCancelRequestedEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("run.cancel.requested"),
    reason: z.string().trim().min(1).max(1_000).nullable(),
  })
  .strict();

export const RunCanceledEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("run.canceled"),
    evidenceIds: z.array(EvidenceIdSchema).refine(uniqueStrings),
  })
  .strict();

export const RunFailedEventSchema = z
  .object({
    ...EventBaseShape,
    type: z.literal("run.failed"),
    failure: RunFailureSchema,
  })
  .strict();

export const RunEventSchema = z.discriminatedUnion("type", [
  RunReceivedEventSchema,
  SourceResolvedEventSchema,
  InventoryCompletedEventSchema,
  SpecificationCompletedEventSchema,
  BaseCheckpointReadyEventSchema,
  CandidatesStartedEventSchema,
  CandidateTransitionedEventSchema,
  CandidatesEvaluatedEventSchema,
  FalsificationCompletedEventSchema,
  ScoringCompletedEventSchema,
  VerdictSelectedEventSchema,
  VerdictAbstainedEventSchema,
  OrchestrationStageFailedEventSchema,
  RunCancelRequestedEventSchema,
  RunCanceledEventSchema,
  RunFailedEventSchema,
]);

export type OrchestrationStage = z.infer<typeof OrchestrationStageSchema>;
export type RunReceivedEvent = z.infer<typeof RunReceivedEventSchema>;
export type SourceResolvedEvent = z.infer<typeof SourceResolvedEventSchema>;
export type InventoryCompletedEvent = z.infer<typeof InventoryCompletedEventSchema>;
export type SpecificationCompletedEvent = z.infer<typeof SpecificationCompletedEventSchema>;
export type CandidateSeed = z.infer<typeof CandidateSeedSchema>;
export type BaseCheckpointReadyEvent = z.infer<typeof BaseCheckpointReadyEventSchema>;
export type CandidatesStartedEvent = z.infer<typeof CandidatesStartedEventSchema>;
export type CandidateTransitionedEvent = z.infer<typeof CandidateTransitionedEventSchema>;
export type CandidatesEvaluatedEvent = z.infer<typeof CandidatesEvaluatedEventSchema>;
export type FalsificationCompletedEvent = z.infer<typeof FalsificationCompletedEventSchema>;
export type ScoringCompletedEvent = z.infer<typeof ScoringCompletedEventSchema>;
export type VerdictSelectedEvent = z.infer<typeof VerdictSelectedEventSchema>;
export type VerdictAbstainedEvent = z.infer<typeof VerdictAbstainedEventSchema>;
export type OrchestrationStageFailedEvent = z.infer<typeof OrchestrationStageFailedEventSchema>;
export type RunCancelRequestedEvent = z.infer<typeof RunCancelRequestedEventSchema>;
export type RunCanceledEvent = z.infer<typeof RunCanceledEventSchema>;
export type RunFailedEvent = z.infer<typeof RunFailedEventSchema>;
export type RunEvent = z.infer<typeof RunEventSchema>;
