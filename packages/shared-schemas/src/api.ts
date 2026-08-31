import { z } from "zod";

import {
  CandidateIdSchema,
  EvidenceIdSchema,
  EventKeySchema,
  HttpsUrlSchema,
  IdentifierSchema,
  IsoDateTimeSchema,
  RunIdSchema,
} from "./primitives.js";
import { GitHubSourceRequestSchema, FixtureSourceRequestSchema } from "./source.js";
import { RunModeSchema, RunSchema } from "./run.js";
import { RunEventSchema } from "./events.js";

export const ReplayCreateRunRequestSchema = z
  .object({
    mode: z.literal("replay"),
    source: FixtureSourceRequestSchema,
    idempotencyKey: z.uuid(),
  })
  .strict();

export const LiveCreateRunRequestSchema = z
  .object({
    mode: z.literal("live"),
    source: GitHubSourceRequestSchema,
    idempotencyKey: z.uuid(),
  })
  .strict();

export const CreateRunRequestSchema = z.discriminatedUnion("mode", [
  ReplayCreateRunRequestSchema,
  LiveCreateRunRequestSchema,
]);

export const CreateRunAcceptedResponseSchema = z
  .object({
    runId: RunIdSchema,
    state: z.literal("RECEIVED"),
    mode: RunModeSchema,
    statusUrl: z.string().startsWith("/api/runs/"),
    eventsUrl: z.string().startsWith("/api/runs/"),
  })
  .strict();

export const RunViewResponseSchema = RunSchema;

export const RunEventStreamItemSchema = z
  .object({
    id: z.number().int().positive(),
    event: RunEventSchema,
  })
  .strict()
  .refine((item) => item.id === item.event.eventId, {
    message: "SSE ID must match the persisted event ID",
  });

export const CancelRunRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(1_000).nullable(),
    idempotencyKey: EventKeySchema,
  })
  .strict();

export const CancelRunAcceptedResponseSchema = z
  .object({
    runId: RunIdSchema,
    state: z.enum(["CANCELING", "CANCELED"]),
  })
  .strict();

export const PullRequestPreviewRequestSchema = z
  .object({
    candidateId: CandidateIdSchema,
    acknowledgeUnsafe: z.boolean(),
  })
  .strict();

export const PullRequestPreviewResponseSchema = z
  .object({
    previewId: IdentifierSchema,
    candidateId: CandidateIdSchema,
    destination: HttpsUrlSchema,
    title: z.string().trim().min(1).max(256),
    body: z.string().max(20_000),
    patchEvidenceId: EvidenceIdSchema,
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const PullRequestConfirmRequestSchema = z
  .object({
    previewId: IdentifierSchema,
    confirmationToken: z.string().min(16).max(512),
  })
  .strict();

export const ProblemDocumentSchema = z
  .object({
    type: HttpsUrlSchema,
    title: z.string().trim().min(1).max(256),
    status: z.number().int().min(400).max(599),
    detail: z.string().trim().min(1).max(4_000),
    instance: z.string().startsWith("/"),
    requestId: IdentifierSchema,
  })
  .strict();

export const ReadinessStatusSchema = z.enum(["configured", "unconfigured", "degraded"]);

export const ReadinessResponseSchema = z
  .object({
    checkedAt: IsoDateTimeSchema,
    replay: ReadinessStatusSchema,
    tokenFactory: ReadinessStatusSchema,
    sandbox: ReadinessStatusSchema,
    tavily: ReadinessStatusSchema,
    githubWrite: ReadinessStatusSchema,
  })
  .strict();

export type ReplayCreateRunRequest = z.infer<typeof ReplayCreateRunRequestSchema>;
export type LiveCreateRunRequest = z.infer<typeof LiveCreateRunRequestSchema>;
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;
export type CreateRunAcceptedResponse = z.infer<typeof CreateRunAcceptedResponseSchema>;
export type RunViewResponse = z.infer<typeof RunViewResponseSchema>;
export type RunEventStreamItem = z.infer<typeof RunEventStreamItemSchema>;
export type CancelRunRequest = z.infer<typeof CancelRunRequestSchema>;
export type CancelRunAcceptedResponse = z.infer<typeof CancelRunAcceptedResponseSchema>;
export type PullRequestPreviewRequest = z.infer<typeof PullRequestPreviewRequestSchema>;
export type PullRequestPreviewResponse = z.infer<typeof PullRequestPreviewResponseSchema>;
export type PullRequestConfirmRequest = z.infer<typeof PullRequestConfirmRequestSchema>;
export type ProblemDocument = z.infer<typeof ProblemDocumentSchema>;
export type ReadinessStatus = z.infer<typeof ReadinessStatusSchema>;
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;
