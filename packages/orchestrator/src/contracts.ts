import { z } from "zod";

export const VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const LIVE_EVIDENCE_SCHEMA_VERSION = 2 as const;

const IsoTimestampSchema = z.iso.datetime({ offset: true });
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,255}$/u);
const NullableMetricSchema = z.number().finite().nonnegative().nullable();

export const SandboxResourcesSchema = z
  .object({
    durationSeconds: NullableMetricSchema,
    imageSizeBytes: NullableMetricSchema,
    consumedCpuSeconds: NullableMetricSchema,
    consumedMemory: NullableMetricSchema,
  })
  .strict();

export const SponsorSmokeEvidenceSchema = z
  .object({
    schemaVersion: z.literal(LIVE_EVIDENCE_SCHEMA_VERSION),
    kind: z.literal("portverdict.sponsor-smoke"),
    status: z.literal("verified"),
    runId: IdentifierSchema,
    recordedAt: IsoTimestampSchema,
    expiresAt: IsoTimestampSchema,
    tokenFactory: z
      .object({
        catalogRequestId: IdentifierSchema,
        catalogFetchedAt: IsoTimestampSchema,
        catalogFingerprint: Sha256Schema,
        exactModelId: z.string().trim().min(3).max(512),
        modelRecordFingerprint: Sha256Schema,
        inferenceRequestIds: z.array(IdentifierSchema).min(1).max(3),
        latencyMs: z.number().int().nonnegative(),
        usage: z
          .object({
            inputTokens: z.number().int().nonnegative(),
            outputTokens: z.number().int().nonnegative(),
            totalTokens: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict(),
    sandbox: z
      .object({
        checkpointImageId: IdentifierSchema,
        sourceImageId: z.string().trim().min(3).max(512),
        operationId: IdentifierSchema,
        resources: SandboxResourcesSchema,
      })
      .strict(),
    tavily: z
      .object({
        searchRequestId: IdentifierSchema,
        extractRequestId: IdentifierSchema,
        credits: z.number().finite().nonnegative(),
        sourceCount: z.number().int().positive(),
        sourceHashes: z.array(Sha256Schema).min(1).max(10),
      })
      .strict(),
    redactionVersion: z.literal("1"),
    integritySha256: Sha256Schema,
  })
  .strict();

export const GateStatusSchema = z.enum(["passed", "failed", "inconclusive"]);
export const LiveBehaviorFamilySchema = z.enum([
  "structured-output",
  "tool-calling",
  "streaming-retry",
]);

export const CandidateTrialEvidenceSchema = z
  .object({
    candidateId: IdentifierSchema,
    strategy: z.enum([
      "minimal-compatibility",
      "prompt-schema-adaptation",
      "resilience-routing-adaptation",
    ]),
    checkpointImageId: IdentifierSchema,
    sandboxOperationId: IdentifierSchema,
    resultImageId: IdentifierSchema.nullable(),
    modelRequestIds: z.array(IdentifierSchema).min(1).max(6),
    modelLatencyMs: z.number().int().nonnegative(),
    modelRetryCount: z.number().int().nonnegative(),
    modelUsage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        totalTokens: z.number().int().nonnegative(),
      })
      .strict(),
    sourceSha256: Sha256Schema,
    diffSha256: Sha256Schema,
    outputSha256: Sha256Schema,
    resources: SandboxResourcesSchema,
    gates: z.record(z.string(), GateStatusSchema),
    disposition: z.enum(["eligible", "rejected", "inconclusive"]),
    durationMs: z.number().int().nonnegative(),
    evidenceIds: z.array(IdentifierSchema).min(1),
  })
  .strict();

export const TrialSummarySchema = z
  .object({
    schemaVersion: z.literal(LIVE_EVIDENCE_SCHEMA_VERSION),
    kind: z.literal("portverdict.live-trial"),
    status: z.literal("verified"),
    runId: IdentifierSchema,
    recordedAt: IsoTimestampSchema,
    expiresAt: IsoTimestampSchema,
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
    fixtureRevision: IdentifierSchema,
    fixtureSha256: Sha256Schema,
    inputSourceSha256: Sha256Schema,
    exactModelId: z.string().trim().min(3).max(512),
    sponsorSmokeRunId: IdentifierSchema,
    checkpoint: z
      .object({
        imageId: IdentifierSchema,
        operationId: IdentifierSchema,
        sourceImageId: z.string().trim().min(3).max(512),
        createdAt: IsoTimestampSchema,
        resources: SandboxResourcesSchema,
      })
      .strict(),
    baseline: z
      .object({
        sandboxOperationId: IdentifierSchema,
        outputSha256: Sha256Schema,
        passedGateCount: z.number().int().nonnegative(),
        totalGateCount: z.number().int().positive(),
        durationMs: z.number().int().nonnegative(),
      })
      .strict(),
    tavily: z
      .object({
        searchRequestId: IdentifierSchema,
        extractRequestId: IdentifierSchema,
        credits: z.number().finite().nonnegative(),
        citations: z
          .array(
            z
              .object({
                url: z.url().startsWith("https://"),
                title: z.string().trim().min(1).max(500),
                contentSha256: Sha256Schema,
                retrievedAt: IsoTimestampSchema,
              })
              .strict(),
          )
          .min(1)
          .max(10),
      })
      .strict(),
    candidates: z.array(CandidateTrialEvidenceSchema).length(3),
    verdict: z.discriminatedUnion("status", [
      z
        .object({
          status: z.literal("selected"),
          selectedCandidateId: IdentifierSchema,
          eligibleCandidateIds: z.array(IdentifierSchema).min(1),
          rejectedCandidateIds: z.array(IdentifierSchema),
          inconclusiveCandidateIds: z.array(IdentifierSchema),
        })
        .strict(),
      z
        .object({
          status: z.literal("abstained"),
          reason: z.string().trim().min(1).max(160),
          eligibleCandidateIds: z.array(IdentifierSchema),
          rejectedCandidateIds: z.array(IdentifierSchema),
          inconclusiveCandidateIds: z.array(IdentifierSchema),
        })
        .strict(),
    ]),
    lifecycle: z
      .object({
        reducerFinalState: z.enum(["SELECTED", "ABSTAINED"]),
        eventCount: z.number().int().positive(),
        replayManifestSha256: Sha256Schema,
        cleanupComplete: z.boolean(),
      })
      .strict(),
    redactionVersion: z.literal("1"),
    integritySha256: Sha256Schema,
  })
  .strict();

export const SingleShotBaselineEvidenceSchema = z
  .object({
    kind: z.literal("single-shot-model-generated"),
    checkpointImageId: IdentifierSchema,
    sandboxOperationId: IdentifierSchema,
    modelResponseIds: z.array(IdentifierSchema).min(1).max(3),
    modelLatencyMs: z.number().int().nonnegative(),
    modelRetryCount: z.number().int().nonnegative(),
    modelUsage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        totalTokens: z.number().int().nonnegative(),
      })
      .strict(),
    sourceSha256: Sha256Schema,
    diffSha256: Sha256Schema,
    outputSha256: Sha256Schema,
    passedGateCount: z.number().int().nonnegative(),
    totalGateCount: z.number().int().positive(),
    disposition: z.enum(["eligible", "rejected", "inconclusive"]),
    durationMs: z.number().int().nonnegative(),
  })
  .strict();

export const LiveEvaluationSuiteSchema = z
  .object({
    schemaVersion: z.literal(LIVE_EVIDENCE_SCHEMA_VERSION),
    kind: z.literal("portverdict.live-evaluation-suite"),
    status: z.literal("verified"),
    suiteId: IdentifierSchema,
    recordedAt: IsoTimestampSchema,
    expiresAt: IsoTimestampSchema,
    portVerdictCommitSha: z.string().regex(/^[a-f0-9]{40}$/u),
    exactModelId: z.string().trim().min(3).max(512),
    sponsorSmokeRunId: IdentifierSchema,
    cases: z
      .array(
        z
          .object({
            caseId: IdentifierSchema,
            behaviorFamily: LiveBehaviorFamilySchema,
            fixtureRevision: IdentifierSchema,
            fixtureSha256: Sha256Schema,
            inputSourceSha256: Sha256Schema,
            runId: IdentifierSchema,
            trialIntegritySha256: Sha256Schema,
            checkpointImageId: IdentifierSchema,
            candidateOperationIds: z.array(IdentifierSchema).length(3),
            singleShotBaseline: SingleShotBaselineEvidenceSchema,
            metrics: z
              .object({
                endToEndLatencyMs: z.number().int().nonnegative(),
                retryCount: z.number().int().nonnegative(),
                apiErrorCount: z.number().int().nonnegative(),
                estimatedCostUsd: NullableMetricSchema,
                estimatedCostReason: z.string().trim().min(1).max(240).nullable(),
              })
              .strict(),
          })
          .strict(),
      )
      .length(3),
    redactionVersion: z.literal("1"),
    integritySha256: Sha256Schema,
  })
  .strict();

export const ReadinessStateSchema = z.enum([
  "unconfigured",
  "configured-unverified",
  "verifying",
  "verified",
  "stale",
  "degraded",
]);

export type SponsorSmokeEvidence = z.infer<typeof SponsorSmokeEvidenceSchema>;
export type CandidateTrialEvidence = z.infer<typeof CandidateTrialEvidenceSchema>;
export type TrialSummary = z.infer<typeof TrialSummarySchema>;
export type SingleShotBaselineEvidence = z.infer<typeof SingleShotBaselineEvidenceSchema>;
export type LiveEvaluationSuite = z.infer<typeof LiveEvaluationSuiteSchema>;
export type ReadinessState = z.infer<typeof ReadinessStateSchema>;
