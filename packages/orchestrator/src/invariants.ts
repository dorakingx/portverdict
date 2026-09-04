import { assertSameCheckpoint, type SandboxBranch } from "@portverdict/sandbox-runner";

import {
  LiveEvaluationSuiteSchema,
  SponsorSmokeEvidenceSchema,
  TrialSummarySchema,
  VERIFICATION_TTL_MS,
  type LiveEvaluationSuite,
  type TrialSummary,
} from "./contracts.js";
import { verifyIntegrity } from "./security.js";

export function assertBranchIdentity(branches: readonly SandboxBranch[]): string {
  const checkpoint = assertSameCheckpoint(branches);
  const candidateIds = branches.map((branch) => branch.candidateId);
  const operationIds = branches.map((branch) => branch.instance.operationId);
  const instanceIds = branches.map((branch) => branch.instance.instanceId);
  if (
    new Set(candidateIds).size !== branches.length ||
    new Set(operationIds).size !== branches.length ||
    new Set(instanceIds).size !== branches.length
  ) {
    throw new Error("Sandbox branches require distinct candidate, operation, and instance IDs.");
  }
  return checkpoint;
}

export function validatePromotableTrial(value: unknown, now = Date.now()): TrialSummary {
  const parsed = TrialSummarySchema.parse(value);
  if (!verifyIntegrity(parsed)) throw new Error("Live trial integrity hash is invalid.");
  assertEvidenceWindow(parsed.recordedAt, parsed.expiresAt, now, "Live trial");
  if (!parsed.lifecycle.cleanupComplete) throw new Error("Sandbox cleanup is incomplete.");
  const checkpointIds = new Set(parsed.candidates.map((candidate) => candidate.checkpointImageId));
  if (checkpointIds.size !== 1 || !checkpointIds.has(parsed.checkpoint.imageId)) {
    throw new Error("Candidate evidence does not share the recorded immutable checkpoint.");
  }
  if (new Set(parsed.candidates.map((candidate) => candidate.candidateId)).size !== 3) {
    throw new Error("Candidate IDs are not distinct.");
  }
  if (new Set(parsed.candidates.map((candidate) => candidate.sandboxOperationId)).size !== 3) {
    throw new Error("Sandbox operation IDs are not distinct.");
  }
  if (parsed.candidates.some((candidate) => candidate.sourceSha256 === parsed.inputSourceSha256)) {
    throw new Error("A candidate did not produce an actual source change.");
  }
  if (new Set(parsed.candidates.map((candidate) => candidate.sourceSha256)).size !== 3) {
    throw new Error("Candidate model patches are not distinct.");
  }
  if (new Set(parsed.candidates.map((candidate) => candidate.diffSha256)).size !== 3) {
    throw new Error("Candidate patch diffs are not distinct.");
  }
  if (
    parsed.verdict.status === "selected" &&
    !parsed.verdict.eligibleCandidateIds.includes(parsed.verdict.selectedCandidateId)
  ) {
    throw new Error("The selected candidate is not eligible.");
  }
  return parsed;
}

function assertEvidenceWindow(
  recordedAt: string,
  expiration: string,
  now: number,
  label: string,
): void {
  const recorded = Date.parse(recordedAt);
  const expires = Date.parse(expiration);
  if (recorded > now + 5 * 60_000) throw new Error(`${label} timestamp is in the future.`);
  if (expires - recorded !== VERIFICATION_TTL_MS) {
    throw new Error(`${label} does not use the fixed seven-day verification TTL.`);
  }
  if (expires <= now) throw new Error(`${label} evidence is stale.`);
}

export function validateSmokeEvidence(
  value: unknown,
  now = Date.now(),
): ReturnType<typeof SponsorSmokeEvidenceSchema.parse> {
  const parsed = SponsorSmokeEvidenceSchema.parse(value);
  if (!verifyIntegrity(parsed)) throw new Error("Sponsor smoke integrity hash is invalid.");
  assertEvidenceWindow(parsed.recordedAt, parsed.expiresAt, now, "Sponsor smoke");
  return parsed;
}

export function validatePromotableSuite(value: unknown, now = Date.now()): LiveEvaluationSuite {
  const parsed = LiveEvaluationSuiteSchema.parse(value);
  if (!verifyIntegrity(parsed)) throw new Error("Live evaluation suite integrity hash is invalid.");
  assertEvidenceWindow(parsed.recordedAt, parsed.expiresAt, now, "Live evaluation suite");
  if (new Set(parsed.cases.map((item) => item.caseId)).size !== 3) {
    throw new Error("Live evaluation case IDs are not distinct.");
  }
  if (new Set(parsed.cases.map((item) => item.behaviorFamily)).size !== 3) {
    throw new Error("Live evaluation behavior families are not distinct.");
  }
  if (new Set(parsed.cases.map((item) => item.runId)).size !== 3) {
    throw new Error("Live evaluation run IDs are not distinct.");
  }
  for (const item of parsed.cases) {
    if (new Set(item.candidateOperationIds).size !== 3) {
      throw new Error(`Candidate operations are not distinct for ${item.caseId}.`);
    }
    if (item.singleShotBaseline.checkpointImageId !== item.checkpointImageId) {
      throw new Error(`Single-shot baseline did not use the shared checkpoint for ${item.caseId}.`);
    }
    if (item.singleShotBaseline.sourceSha256 === item.inputSourceSha256) {
      throw new Error(`Single-shot baseline did not modify source for ${item.caseId}.`);
    }
    if (item.candidateOperationIds.includes(item.singleShotBaseline.sandboxOperationId)) {
      throw new Error(`Single-shot baseline reused a tournament operation for ${item.caseId}.`);
    }
  }
  return parsed;
}
