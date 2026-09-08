import { z } from "zod";

import {
  ArtifactIdSchema,
  CandidateIdSchema,
  EvidenceIdSchema,
  IdentifierSchema,
  IsoDateTimeSchema,
  RunIdSchema,
  SCHEMA_VERSION,
  SchemaVersionSchema,
  uniqueStrings,
} from "./primitives";
import { HardGateNameSchema, HardGateResultSchema } from "./evidence";
import { SourceRequestSchema, SourceRevisionSchema } from "./source";

export const RunModeSchema = z.enum(["live", "replay"]);

export const RunStateSchema = z.enum([
  "RECEIVED",
  "SOURCE_RESOLVED",
  "INVENTORIED",
  "SPECIFIED",
  "BASE_CHECKPOINT_READY",
  "CANDIDATES_RUNNING",
  "CANDIDATES_EVALUATED",
  "FALSIFIED",
  "SCORED",
  "SELECTED",
  "ABSTAINED",
  "CANCELING",
  "CANCELED",
  "FAILED",
]);

export const TerminalRunStateSchema = z.enum(["SELECTED", "ABSTAINED", "CANCELED", "FAILED"]);

export const CandidateStateSchema = z.enum([
  "QUEUED",
  "PATCHING",
  "BUILDING",
  "VERIFYING",
  "FALSIFYING",
  "ELIGIBLE",
  "REJECTED",
  "INCONCLUSIVE",
]);

export const TerminalCandidateStateSchema = z.enum(["ELIGIBLE", "REJECTED", "INCONCLUSIVE"]);

export const CandidateStrategySchema = z.enum([
  "minimal-compatibility",
  "prompt-schema-adaptation",
  "resilience-routing-adaptation",
]);

export const RetryPolicySchema = z
  .object({
    maxRetries: z.number().int().min(0).max(4),
    baseDelayMs: z.number().int().min(0).max(30_000),
    maxDelayMs: z.number().int().min(0).max(120_000),
  })
  .strict()
  .refine((policy) => policy.maxDelayMs >= policy.baseDelayMs, {
    message: "maxDelayMs must be greater than or equal to baseDelayMs",
  });

export const RunTimeoutsSchema = z
  .object({
    modelCallMs: z.number().int().min(1_000).max(600_000),
    sandboxOperationMs: z.number().int().min(1_000).max(3_600_000),
    cancellationMs: z.number().int().min(1_000).max(120_000),
  })
  .strict();

export const RunConfigSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    strategies: z.array(CandidateStrategySchema).min(1).max(3).refine(uniqueStrings, {
      message: "Candidate strategies must be unique",
    }),
    hardGates: z.array(HardGateNameSchema).min(1).refine(uniqueStrings, {
      message: "Hard gates must be unique",
    }),
    retryPolicy: RetryPolicySchema,
    timeouts: RunTimeoutsSchema,
    maxSourceBytes: z.number().int().positive().max(250_000_000),
    maxArtifactBytes: z.number().int().positive().max(100_000_000),
    researchEnabled: z.boolean(),
  })
  .strict();

export const CandidateFailureSchema = z
  .object({
    kind: z.enum(["behavioral", "infrastructure"]),
    code: z.string().trim().min(1).max(160),
    message: z.string().trim().min(1).max(4_000),
    retriable: z.boolean(),
    evidenceIds: z.array(EvidenceIdSchema).min(1).refine(uniqueStrings, {
      message: "Failure evidence IDs must be unique",
    }),
  })
  .strict();

export const CandidateScoreDimensionSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    value: z.number().finite(),
    unit: z.string().trim().min(1).max(64),
    direction: z.enum(["minimize", "maximize"]),
    evidenceIds: z.array(EvidenceIdSchema).min(1).refine(uniqueStrings, {
      message: "Score evidence IDs must be unique",
    }),
  })
  .strict();

export const CandidateScoreSchema = z
  .object({
    candidateId: CandidateIdSchema,
    eligible: z.boolean(),
    rank: z.number().int().positive().nullable(),
    dimensions: z.array(CandidateScoreDimensionSchema).min(1).max(20),
  })
  .strict()
  .superRefine((score, context) => {
    const names = score.dimensions.map((dimension) => dimension.name);
    if (!uniqueStrings(names)) {
      context.addIssue({
        code: "custom",
        path: ["dimensions"],
        message: "Score dimension names must be unique",
      });
    }
    if (!score.eligible && score.rank !== null) {
      context.addIssue({
        code: "custom",
        path: ["rank"],
        message: "An ineligible candidate cannot be ranked",
      });
    }
  });

export const CandidateSchema = z
  .object({
    id: CandidateIdSchema,
    runId: RunIdSchema,
    strategy: CandidateStrategySchema,
    state: CandidateStateSchema,
    checkpointId: IdentifierSchema,
    sandboxOperationId: z.string().trim().min(1).max(256).nullable(),
    hardGates: z.array(HardGateResultSchema),
    score: CandidateScoreSchema.nullable(),
    evidenceIds: z.array(EvidenceIdSchema).refine(uniqueStrings, {
      message: "Candidate evidence IDs must be unique",
    }),
    failure: CandidateFailureSchema.nullable(),
    startedAt: IsoDateTimeSchema.nullable(),
    completedAt: IsoDateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((candidate, context) => {
    const gateNames = candidate.hardGates.map((gate) => gate.gate);
    if (!uniqueStrings(gateNames)) {
      context.addIssue({
        code: "custom",
        path: ["hardGates"],
        message: "A candidate cannot contain duplicate hard gates",
      });
    }

    const terminal = ["ELIGIBLE", "REJECTED", "INCONCLUSIVE"].includes(candidate.state);
    if (terminal !== (candidate.completedAt !== null)) {
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "Only terminal candidates must have a completion timestamp",
      });
    }

    if (candidate.state === "ELIGIBLE") {
      if (
        candidate.failure !== null ||
        candidate.hardGates.length === 0 ||
        candidate.hardGates.some((gate) => gate.status !== "passed")
      ) {
        context.addIssue({
          code: "custom",
          message: "Eligible candidates need passed hard gates and no failure",
        });
      }
    } else if (candidate.state === "REJECTED") {
      if (
        candidate.failure?.kind !== "behavioral" ||
        !candidate.hardGates.some((gate) => gate.status === "failed")
      ) {
        context.addIssue({
          code: "custom",
          message: "Rejected candidates require a behavioral failure and a failed hard gate",
        });
      }
    } else if (candidate.state === "INCONCLUSIVE") {
      if (candidate.failure?.kind !== "infrastructure") {
        context.addIssue({
          code: "custom",
          message: "Inconclusive candidates require an infrastructure failure",
        });
      }
    } else if (candidate.failure !== null || candidate.completedAt !== null) {
      context.addIssue({
        code: "custom",
        message: "Active candidates cannot have terminal failure metadata",
      });
    }
  });

const VerdictOutcomeListsShape = {
  eligibleCandidateIds: z.array(CandidateIdSchema).refine(uniqueStrings),
  rejectedCandidateIds: z.array(CandidateIdSchema).refine(uniqueStrings),
  inconclusiveCandidateIds: z.array(CandidateIdSchema).refine(uniqueStrings),
  decidedAt: IsoDateTimeSchema,
  evidenceIds: z.array(EvidenceIdSchema).min(1).refine(uniqueStrings),
  rationaleEvidenceId: EvidenceIdSchema.nullable(),
};

export const SelectedVerdictSchema = z
  .object({
    kind: z.literal("selected"),
    selectedCandidateId: CandidateIdSchema,
    ...VerdictOutcomeListsShape,
  })
  .strict()
  .refine((verdict) => verdict.eligibleCandidateIds.includes(verdict.selectedCandidateId), {
    message: "The selected candidate must be listed as eligible",
  });

export const AbstentionReasonSchema = z.enum([
  "all-candidates-failed",
  "insufficient-evidence",
  "no-trustworthy-winner",
  "catalog-unavailable",
  "budget-exhausted",
]);

export const AbstainedVerdictSchema = z
  .object({
    kind: z.literal("abstained"),
    reason: AbstentionReasonSchema,
    message: z.string().trim().min(1).max(4_000),
    ...VerdictOutcomeListsShape,
  })
  .strict()
  .superRefine((verdict, context) => {
    if (verdict.reason === "all-candidates-failed" && verdict.eligibleCandidateIds.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["eligibleCandidateIds"],
        message: "All-candidates-failed cannot include an eligible candidate",
      });
    }
  });

export const VerdictSchema = z.discriminatedUnion("kind", [
  SelectedVerdictSchema,
  AbstainedVerdictSchema,
]);

export const BaseCheckpointSchema = z
  .object({
    id: IdentifierSchema,
    sourceRevision: z.string().trim().min(1).max(160),
    sandboxOperationId: z.string().trim().min(1).max(256).nullable(),
    sandboxImageId: z.string().trim().min(1).max(256).nullable(),
    artifactId: ArtifactIdSchema,
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export const RunFailureSchema = z
  .object({
    kind: z.literal("orchestration"),
    code: z.string().trim().min(1).max(160),
    message: z.string().trim().min(1).max(4_000),
    evidenceIds: z.array(EvidenceIdSchema).refine(uniqueStrings),
  })
  .strict();

export const OriginalLiveRunSchema = z
  .object({
    id: RunIdSchema,
    recordedAt: IsoDateTimeSchema,
  })
  .strict();

export const RunSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    id: RunIdSchema,
    idempotencyKey: z.uuid(),
    mode: RunModeSchema,
    state: RunStateSchema,
    sourceRequest: SourceRequestSchema,
    source: SourceRevisionSchema.nullable(),
    config: RunConfigSchema,
    inventoryArtifactId: ArtifactIdSchema.nullable(),
    migrationSpecArtifactId: ArtifactIdSchema.nullable(),
    baseCheckpoint: BaseCheckpointSchema.nullable(),
    candidates: z.array(CandidateSchema),
    verdict: VerdictSchema.nullable(),
    evidenceIds: z.array(EvidenceIdSchema).refine(uniqueStrings),
    failure: RunFailureSchema.nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    originalLiveRun: OriginalLiveRunSchema.nullable(),
  })
  .strict()
  .superRefine((run, context) => {
    if (run.mode === "live" && run.originalLiveRun !== null) {
      context.addIssue({
        code: "custom",
        path: ["originalLiveRun"],
        message: "Only replay runs can reference an original live run",
      });
    }

    if (run.source !== null && run.source.kind !== run.sourceRequest.kind) {
      context.addIssue({
        code: "custom",
        path: ["source"],
        message: "Resolved source kind must match its request",
      });
    }

    const statesRequiringSource = new Set([
      "SOURCE_RESOLVED",
      "INVENTORIED",
      "SPECIFIED",
      "BASE_CHECKPOINT_READY",
      "CANDIDATES_RUNNING",
      "CANDIDATES_EVALUATED",
      "FALSIFIED",
      "SCORED",
      "SELECTED",
      "ABSTAINED",
    ]);
    if (statesRequiringSource.has(run.state) && run.source === null) {
      context.addIssue({
        code: "custom",
        path: ["source"],
        message: "Run state requires a source",
      });
    }

    const statesRequiringCandidates = new Set([
      "BASE_CHECKPOINT_READY",
      "CANDIDATES_RUNNING",
      "CANDIDATES_EVALUATED",
      "FALSIFIED",
      "SCORED",
      "SELECTED",
      "ABSTAINED",
    ]);
    if (statesRequiringCandidates.has(run.state) && run.candidates.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["candidates"],
        message: "Run state requires at least one candidate",
      });
    }

    if (run.state === "SELECTED" && run.verdict?.kind !== "selected") {
      context.addIssue({
        code: "custom",
        path: ["verdict"],
        message: "Selected run needs verdict",
      });
    } else if (run.state === "ABSTAINED" && run.verdict?.kind !== "abstained") {
      context.addIssue({
        code: "custom",
        path: ["verdict"],
        message: "Abstained run needs verdict",
      });
    } else if (!["SELECTED", "ABSTAINED"].includes(run.state) && run.verdict !== null) {
      context.addIssue({
        code: "custom",
        path: ["verdict"],
        message: "Only verdict terminal states can store a verdict",
      });
    }

    if (run.state === "FAILED" && run.failure === null) {
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "Failed run needs a failure",
      });
    } else if (run.state !== "FAILED" && run.failure !== null) {
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "Only failed runs can store a run failure",
      });
    }

    if (run.verdict?.kind === "selected") {
      const selectedCandidateId = run.verdict.selectedCandidateId;
      const candidate = run.candidates.find((item) => item.id === selectedCandidateId);
      if (candidate?.state !== "ELIGIBLE") {
        context.addIssue({
          code: "custom",
          path: ["verdict", "selectedCandidateId"],
          message: "A verdict can select only an eligible candidate",
        });
      }
    }

    if (new Date(run.updatedAt).getTime() < new Date(run.createdAt).getTime()) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "updatedAt cannot precede createdAt",
      });
    }
  });

export const DEFAULT_RUN_CONFIG = RunConfigSchema.parse({
  schemaVersion: SCHEMA_VERSION,
  strategies: [
    "minimal-compatibility",
    "prompt-schema-adaptation",
    "resilience-routing-adaptation",
  ],
  hardGates: [
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
  ],
  retryPolicy: { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 5_000 },
  timeouts: { modelCallMs: 120_000, sandboxOperationMs: 900_000, cancellationMs: 30_000 },
  maxSourceBytes: 25_000_000,
  maxArtifactBytes: 20_000_000,
  researchEnabled: true,
});

export type RunMode = z.infer<typeof RunModeSchema>;
export type RunState = z.infer<typeof RunStateSchema>;
export type TerminalRunState = z.infer<typeof TerminalRunStateSchema>;
export type CandidateState = z.infer<typeof CandidateStateSchema>;
export type TerminalCandidateState = z.infer<typeof TerminalCandidateStateSchema>;
export type CandidateStrategy = z.infer<typeof CandidateStrategySchema>;
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;
export type RunTimeouts = z.infer<typeof RunTimeoutsSchema>;
export type RunConfig = z.infer<typeof RunConfigSchema>;
export type CandidateFailure = z.infer<typeof CandidateFailureSchema>;
export type CandidateScoreDimension = z.infer<typeof CandidateScoreDimensionSchema>;
export type CandidateScore = z.infer<typeof CandidateScoreSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type SelectedVerdict = z.infer<typeof SelectedVerdictSchema>;
export type AbstentionReason = z.infer<typeof AbstentionReasonSchema>;
export type AbstainedVerdict = z.infer<typeof AbstainedVerdictSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type BaseCheckpoint = z.infer<typeof BaseCheckpointSchema>;
export type RunFailure = z.infer<typeof RunFailureSchema>;
export type OriginalLiveRun = z.infer<typeof OriginalLiveRunSchema>;
export type Run = z.infer<typeof RunSchema>;
