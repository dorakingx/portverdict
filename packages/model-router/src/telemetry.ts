import type {
  ReliableCost,
  RouterTelemetry,
  RouterTelemetryInput,
  RouterTokenUsage,
} from "./types";

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validUsage(usage: RouterTokenUsage): boolean {
  return (
    validCount(usage.inputTokens) &&
    validCount(usage.outputTokens) &&
    validCount(usage.totalTokens) &&
    usage.inputTokens + usage.outputTokens === usage.totalTokens
  );
}

function validCost(cost: ReliableCost, input: RouterTelemetryInput): boolean {
  if (!Number.isFinite(cost.usd) || cost.usd < 0) return false;
  if (cost.source === "provider-reported") {
    return cost.providerRequestId === input.requestId;
  }
  if (
    input.decision.status !== "routed" ||
    input.usage === undefined ||
    input.decision.model.pricing === undefined
  ) {
    return false;
  }
  const expectedCost =
    (input.usage.inputTokens / 1_000_000) * input.decision.model.pricing.inputPerMillionTokens +
    (input.usage.outputTokens / 1_000_000) * input.decision.model.pricing.outputPerMillionTokens;
  return (
    cost.catalogRecordFingerprint === input.decision.model.provenance.catalogRecordFingerprint &&
    Math.abs(cost.usd - expectedCost) <= 1e-12
  );
}

/**
 * Builds an allowlisted operational record. Unknown caller properties, prompts,
 * model responses, and private reasoning are never copied into telemetry.
 */
export function createRouterTelemetry(input: RouterTelemetryInput): RouterTelemetry {
  if (!input.requestId.trim() || !input.taskId.trim() || !input.taskCategory.trim()) {
    throw new Error("Telemetry identifiers and task category are required.");
  }
  if (
    !Number.isFinite(input.latencyMs) ||
    input.latencyMs < 0 ||
    !validCount(input.retries) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      input.recordedAt,
    ) ||
    !Number.isFinite(Date.parse(input.recordedAt))
  ) {
    throw new Error("Telemetry timing or retry fields are invalid.");
  }
  if (input.usage !== undefined && !validUsage(input.usage)) {
    throw new Error("Token usage must be non-negative and internally consistent.");
  }
  if (input.reliableCost !== undefined && !validCost(input.reliableCost, input)) {
    throw new Error("Cost telemetry lacks reliable provider or catalog provenance.");
  }
  if (input.decision.status === "abstained" && input.outcome !== "abstained") {
    throw new Error("An abstained routing decision must use the abstained telemetry outcome.");
  }

  const routed = input.decision.status === "routed" ? input.decision : undefined;
  return Object.freeze({
    requestId: input.requestId,
    taskId: input.taskId,
    role: input.decision.role,
    taskCategory: input.taskCategory,
    difficulty: input.difficulty,
    modelId: routed?.model.exactId ?? null,
    family: routed?.model.family ?? null,
    catalogRequestId: routed?.model.provenance.catalogRequestId ?? null,
    catalogRecordFingerprint: routed?.model.provenance.catalogRecordFingerprint ?? null,
    fallbackUsed: routed?.fallbackUsed ?? false,
    latencyMs: input.latencyMs,
    outcome: input.outcome,
    retries: input.retries,
    recordedAt: input.recordedAt,
    ...(input.usage === undefined ? {} : { usage: { ...input.usage } }),
    ...(input.reliableCost === undefined ? {} : { cost: { ...input.reliableCost } }),
  });
}
