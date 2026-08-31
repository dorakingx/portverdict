import { isValidatedModelCatalog } from "./catalog";
import type {
  CapabilityTestEvidence,
  DiscoveredModel,
  NemotronFamily,
  RoutingAbstentionReason,
  RoutingDecision,
  RoutingRequest,
  ValidatedModelCatalog,
} from "./types";

const FAMILY_POLICY: Readonly<Record<RoutingRequest["role"], readonly NemotronFamily[]>> = {
  LIGHT: ["LIGHTNING"],
  STANDARD: ["SUPER", "LIGHTNING"],
  HEAVY: ["ULTRA", "SUPER"],
};

const routedDecisions = new WeakSet<object>();

function routed(decision: Extract<RoutingDecision, { status: "routed" }>): RoutingDecision {
  const frozen = Object.freeze(decision);
  routedDecisions.add(frozen);
  return frozen;
}

export function isRoutedDecision(
  value: unknown,
): value is Extract<RoutingDecision, { status: "routed" }> {
  return (
    typeof value === "object" &&
    value !== null &&
    routedDecisions.has(value) &&
    (value as { status?: unknown }).status === "routed"
  );
}

function positiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validRequest(request: RoutingRequest): boolean {
  const totalTokens = request.estimatedInputTokens + request.maxOutputTokens;
  return (
    request.taskCategory.trim().length > 0 &&
    positiveSafeInteger(request.estimatedInputTokens) &&
    positiveSafeInteger(request.maxOutputTokens) &&
    Number.isSafeInteger(totalTokens) &&
    (request.minContextTokens === undefined || positiveSafeInteger(request.minContextTokens)) &&
    (request.requiredCapabilities ?? []).every((capability) => capability.trim().length > 0) &&
    (request.budget?.maxTotalTokens === undefined ||
      positiveSafeInteger(request.budget.maxTotalTokens)) &&
    (request.budget?.maxEstimatedCostUsd === undefined ||
      (Number.isFinite(request.budget.maxEstimatedCostUsd) &&
        request.budget.maxEstimatedCostUsd >= 0))
  );
}

function validCapabilityTest(
  test: CapabilityTestEvidence,
  modelId: string,
  taskCategory: string,
): boolean {
  return (
    test.modelId === modelId &&
    test.taskCategory === taskCategory &&
    test.passed &&
    test.evidenceIds.length > 0 &&
    test.recordedAt.includes("T") &&
    Number.isFinite(Date.parse(test.recordedAt))
  );
}

function estimatedCost(model: DiscoveredModel, request: RoutingRequest): number | undefined {
  if (!model.pricing) return undefined;
  return (
    (request.estimatedInputTokens / 1_000_000) * model.pricing.inputPerMillionTokens +
    (request.maxOutputTokens / 1_000_000) * model.pricing.outputPerMillionTokens
  );
}

function chooseModel(
  models: readonly DiscoveredModel[],
  request: RoutingRequest,
): {
  readonly model: DiscoveredModel;
  readonly selectionBasis: "caller-preference" | "largest-context" | "exact-id-lexicographic";
} {
  const preferences = request.preferredExactIds ?? [];
  for (const preferredId of preferences) {
    const preferred = models.find((model) => model.exactId === preferredId);
    if (preferred) return { model: preferred, selectionBasis: "caller-preference" };
  }

  const knownContext = models.filter((model) => model.contextWindowTokens !== undefined);
  if (knownContext.length > 0) {
    const largest = Math.max(...knownContext.map((model) => model.contextWindowTokens ?? 0));
    const contenders = knownContext
      .filter((model) => model.contextWindowTokens === largest)
      .sort((left, right) => left.exactId.localeCompare(right.exactId));
    const selected = contenders[0];
    if (selected) return { model: selected, selectionBasis: "largest-context" };
  }

  const selected = [...models].sort((left, right) => left.exactId.localeCompare(right.exactId))[0];
  if (!selected) throw new Error("Cannot choose from an empty model list.");
  return { model: selected, selectionBasis: "exact-id-lexicographic" };
}

function abstain(
  role: RoutingRequest["role"],
  reason: RoutingAbstentionReason,
  detail: string,
): RoutingDecision {
  return { status: "abstained", role, reason, detail };
}

export function routeModel(
  catalog: ValidatedModelCatalog,
  request: RoutingRequest,
): RoutingDecision {
  if (!isValidatedModelCatalog(catalog)) {
    return abstain(
      request.role,
      "catalog-not-validated",
      "The model catalog was not produced by authenticated catalog validation.",
    );
  }
  if (!validRequest(request)) {
    return abstain(request.role, "invalid-request", "Routing constraints are invalid.");
  }

  const requiredContextTokens = Math.max(
    request.minContextTokens ?? 0,
    request.estimatedInputTokens + request.maxOutputTokens,
  );
  if (
    request.budget?.maxTotalTokens !== undefined &&
    request.estimatedInputTokens + request.maxOutputTokens > request.budget.maxTotalTokens
  ) {
    return abstain(
      request.role,
      "budget-exceeded",
      "The task token estimate exceeds the declared total-token budget.",
    );
  }

  const familyPolicy = FAMILY_POLICY[request.role];
  const familyModels = catalog.models.filter(
    (model) => model.family !== "OTHER" && familyPolicy.includes(model.family),
  );
  if (familyModels.length === 0) {
    return abstain(
      request.role,
      "no-qualifying-model",
      "No authenticated NVIDIA Nemotron model from the role policy was discovered.",
    );
  }

  const requiredCapabilities = new Set(request.requiredCapabilities ?? []);
  const capabilityModels = familyModels.filter((model) =>
    [...requiredCapabilities].every((capability) => model.capabilities.includes(capability)),
  );
  if (capabilityModels.length === 0) {
    return abstain(
      request.role,
      "capability-mismatch",
      "No policy model has every capability explicitly discovered in the catalog.",
    );
  }

  const contextModels = capabilityModels.filter(
    (model) =>
      model.contextWindowTokens !== undefined && model.contextWindowTokens >= requiredContextTokens,
  );
  if (contextModels.length === 0) {
    return abstain(
      request.role,
      "context-limit",
      "No policy model has a discovered hosted context limit large enough for the task.",
    );
  }

  const maxCost = request.budget?.maxEstimatedCostUsd;
  const costModels = contextModels.filter((model) => {
    if (maxCost === undefined) return true;
    const cost = estimatedCost(model, request);
    return cost !== undefined && cost <= maxCost;
  });
  if (costModels.length === 0 && maxCost !== undefined) {
    const everyModelHasReliablePricing = contextModels.every(
      (model) => estimatedCost(model, request) !== undefined,
    );
    return abstain(
      request.role,
      everyModelHasReliablePricing ? "budget-exceeded" : "budget-unverifiable",
      everyModelHasReliablePricing
        ? "Every qualifying model exceeds the authenticated pricing budget."
        : "Cost budget cannot be checked because qualifying catalog records have no reliable pricing.",
    );
  }

  for (let index = 0; index < familyPolicy.length; index += 1) {
    const family = familyPolicy[index];
    const inFamily = costModels.filter((model) => model.family === family);
    if (inFamily.length === 0) continue;

    const fallbackUsed = index > 0;
    if (request.role === "STANDARD" && family === "LIGHTNING") {
      const certified = inFamily.filter((model) =>
        (request.capabilityTests ?? []).some((test) =>
          validCapabilityTest(test, model.exactId, request.taskCategory),
        ),
      );
      if (certified.length === 0) {
        return abstain(
          request.role,
          "fallback-not-certified",
          "Lightning fallback requires a passing task-specific capability test with evidence.",
        );
      }
      const chosen = chooseModel(certified, request);
      const cost = estimatedCost(chosen.model, request);
      return routed({
        status: "routed",
        role: request.role,
        model: chosen.model,
        fallbackUsed,
        requiredContextTokens,
        ...(cost === undefined ? {} : { estimatedCostUsd: cost }),
        selectionBasis: chosen.selectionBasis,
      });
    }

    const chosen = chooseModel(inFamily, request);
    const cost = estimatedCost(chosen.model, request);
    return routed({
      status: "routed",
      role: request.role,
      model: chosen.model,
      fallbackUsed,
      requiredContextTokens,
      ...(cost === undefined ? {} : { estimatedCostUsd: cost }),
      selectionBasis: chosen.selectionBasis,
    });
  }

  return abstain(
    request.role,
    "no-qualifying-model",
    "No discovered model remained after safe fallback policy evaluation.",
  );
}
