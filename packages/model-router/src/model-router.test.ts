import { describe, expect, it } from "vitest";

import {
  createRouterTelemetry,
  routeModel,
  validateAuthenticatedCatalog,
  type CatalogValidationContext,
  type RoutingRequest,
  type ValidatedModelCatalog,
} from "./index";

const CONTEXT: CatalogValidationContext = {
  authenticated: true,
  httpStatus: 200,
  requestId: "catalog_request_1",
  endpoint: "https://api.tokenfactory.nebius.com/v1/models",
  fetchedAt: "2026-08-31T00:00:00.000Z",
};

const MODEL_IDS = {
  lightning: "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4",
  super: "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B",
  ultra: "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-NVFP4",
} as const;

function model(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    object: "model",
    owned_by: "NVIDIA",
    context_length: 131_072,
    capabilities: ["chat", "structured-output", "tool-calls"],
    ...overrides,
  };
}

function catalogOf(...models: readonly Record<string, unknown>[]): ValidatedModelCatalog {
  const result = validateAuthenticatedCatalog({ object: "list", data: models }, CONTEXT);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.catalog;
}

function request(overrides: Partial<RoutingRequest> = {}): RoutingRequest {
  return {
    role: "STANDARD",
    taskCategory: "patch-worker",
    difficulty: "medium",
    estimatedInputTokens: 8_000,
    maxOutputTokens: 2_000,
    requiredCapabilities: ["chat", "structured-output"],
    ...overrides,
  };
}

describe("authenticated model catalog", () => {
  it("rejects unauthenticated, non-200, malformed, and unofficial catalog responses", () => {
    const unauthenticated = validateAuthenticatedCatalog(
      { data: [] },
      {
        ...CONTEXT,
        authenticated: false,
        httpStatus: 401,
        endpoint: "http://example.test/v1/models",
      },
    );
    expect(unauthenticated.ok).toBe(false);
    if (!unauthenticated.ok) {
      expect(unauthenticated.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining([
          "catalog-not-authenticated",
          "catalog-http-status",
          "invalid-catalog-endpoint",
        ]),
      );
    }

    const malformed = validateAuthenticatedCatalog({ models: [] }, CONTEXT);
    expect(malformed).toMatchObject({ ok: false });
  });

  it("rejects duplicate IDs and malformed hosted limits instead of guessing", () => {
    const result = validateAuthenticatedCatalog(
      {
        data: [
          model(MODEL_IDS.super),
          model(MODEL_IDS.super),
          model(MODEL_IDS.ultra, { context_length: "huge" }),
        ],
      },
      CONTEXT,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(["duplicate-model-id", "invalid-context-length"]),
      );
    }
  });

  it("preserves the exact discovered ID and attaches catalog/record fingerprints", () => {
    const result = validateAuthenticatedCatalog({ data: [model(MODEL_IDS.lightning)] }, CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.catalog.models[0]).toMatchObject({
      exactId: MODEL_IDS.lightning,
      family: "LIGHTNING",
      provenance: {
        source: "authenticated-catalog",
        catalogRequestId: CONTEXT.requestId,
        catalogIndex: 0,
      },
    });
    expect(result.catalog.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.catalog.models[0]?.provenance.catalogRecordFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(result.catalog.models)).toBe(true);
    expect(Object.isFrozen(result.catalog.models[0]?.capabilities)).toBe(true);
    expect(Object.isFrozen(result.catalog.models[0]?.provenance)).toBe(true);
  });

  it("does not classify a lookalike model without NVIDIA ownership", () => {
    const catalog = catalogOf(model("acme/Nemotron-3-Ultra-counterfeit", { owned_by: "Acme" }));
    expect(catalog.models[0]?.family).toBe("OTHER");
    expect(routeModel(catalog, request({ role: "HEAVY" }))).toMatchObject({
      status: "abstained",
      reason: "no-qualifying-model",
    });
  });
});

describe("family policy and safe fallback", () => {
  it.each([
    ["LIGHT", MODEL_IDS.lightning, "LIGHTNING"],
    ["STANDARD", MODEL_IDS.super, "SUPER"],
    ["HEAVY", MODEL_IDS.ultra, "ULTRA"],
  ] as const)("routes %s only to its discovered preferred family", (role, expectedId, family) => {
    const catalog = catalogOf(
      model(MODEL_IDS.lightning),
      model(MODEL_IDS.super),
      model(MODEL_IDS.ultra),
    );
    const result = routeModel(catalog, request({ role }));
    expect(result).toMatchObject({
      status: "routed",
      role,
      model: { exactId: expectedId, family },
      fallbackUsed: false,
    });
  });

  it("allows Ultra to Super fallback but requires task-specific proof for Super to Lightning", () => {
    const superOnly = catalogOf(model(MODEL_IDS.super));
    expect(routeModel(superOnly, request({ role: "HEAVY" }))).toMatchObject({
      status: "routed",
      model: { exactId: MODEL_IDS.super },
      fallbackUsed: true,
    });

    const lightningOnly = catalogOf(model(MODEL_IDS.lightning));
    expect(routeModel(lightningOnly, request())).toMatchObject({
      status: "abstained",
      reason: "fallback-not-certified",
    });
    expect(
      routeModel(
        lightningOnly,
        request({
          capabilityTests: [
            {
              modelId: MODEL_IDS.lightning,
              taskCategory: "patch-worker",
              passed: true,
              evidenceIds: ["ev_capability_1"],
              recordedAt: "2026-08-31T00:01:00.000Z",
            },
          ],
        }),
      ),
    ).toMatchObject({
      status: "routed",
      model: { exactId: MODEL_IDS.lightning },
      fallbackUsed: true,
    });
  });

  it("refuses a fabricated catalog object that skipped authenticated validation", () => {
    const fake = {
      models: [],
      requestId: "fake",
      fetchedAt: CONTEXT.fetchedAt,
      endpoint: CONTEXT.endpoint,
      fingerprint: "a".repeat(64),
    } as unknown as ValidatedModelCatalog;
    expect(routeModel(fake, request())).toMatchObject({
      status: "abstained",
      reason: "catalog-not-validated",
    });
  });

  it("abstains when required capability, hosted context, or qualifying models are absent", () => {
    const catalog = catalogOf(
      model(MODEL_IDS.super, {
        context_length: 4_096,
        capabilities: ["chat"],
      }),
    );
    expect(routeModel(catalog, request())).toMatchObject({
      status: "abstained",
      reason: "capability-mismatch",
    });
    expect(routeModel(catalog, request({ requiredCapabilities: ["chat"] }))).toMatchObject({
      status: "abstained",
      reason: "context-limit",
    });

    const empty = catalogOf(model("openai/something", { owned_by: "OpenAI" }));
    expect(routeModel(empty, request())).toMatchObject({
      status: "abstained",
      reason: "no-qualifying-model",
    });
    expect(routeModel(catalogOf(), request())).toMatchObject({
      status: "abstained",
      reason: "no-qualifying-model",
    });
  });
});

describe("context and budget constraints", () => {
  it("enforces total-token budgets before selecting a model", () => {
    const catalog = catalogOf(model(MODEL_IDS.super));
    expect(routeModel(catalog, request({ budget: { maxTotalTokens: 9_999 } }))).toMatchObject({
      status: "abstained",
      reason: "budget-exceeded",
    });
    expect(
      routeModel(
        catalog,
        request({ estimatedInputTokens: Number.MAX_SAFE_INTEGER, maxOutputTokens: 1 }),
      ),
    ).toMatchObject({ status: "abstained", reason: "invalid-request" });
  });

  it("requires authenticated catalog pricing to enforce a cost budget", () => {
    const withoutPricing = catalogOf(model(MODEL_IDS.super));
    expect(
      routeModel(withoutPricing, request({ budget: { maxEstimatedCostUsd: 1 } })),
    ).toMatchObject({ status: "abstained", reason: "budget-unverifiable" });

    const priced = catalogOf(
      model(MODEL_IDS.super, {
        pricing: {
          currency: "USD",
          input_per_million_tokens: 10,
          output_per_million_tokens: 20,
        },
      }),
    );
    expect(routeModel(priced, request({ budget: { maxEstimatedCostUsd: 0.01 } }))).toMatchObject({
      status: "abstained",
      reason: "budget-exceeded",
    });

    const routed = routeModel(priced, request({ budget: { maxEstimatedCostUsd: 1 } }));
    expect(routed).toMatchObject({ status: "routed", estimatedCostUsd: 0.12 });

    const mixedPricing = catalogOf(
      model(`${MODEL_IDS.super}-priced`, {
        pricing: {
          currency: "USD",
          input_per_million_tokens: 10,
          output_per_million_tokens: 20,
        },
      }),
      model(`${MODEL_IDS.super}-unknown-price`),
    );
    expect(
      routeModel(mixedPricing, request({ budget: { maxEstimatedCostUsd: 0.01 } })),
    ).toMatchObject({ status: "abstained", reason: "budget-unverifiable" });
  });

  it("honors a preferred exact ID only when it remains a qualifying discovered model", () => {
    const first = `${MODEL_IDS.super}-BF16`;
    const second = `${MODEL_IDS.super}-NVFP4`;
    const catalog = catalogOf(model(first), model(second));
    const result = routeModel(catalog, request({ preferredExactIds: [second, "not-discovered"] }));
    expect(result).toMatchObject({
      status: "routed",
      model: { exactId: second },
      selectionBasis: "caller-preference",
    });
  });
});

describe("structured router telemetry", () => {
  it("records exact-ID provenance and strips unknown private-reasoning properties", () => {
    const catalog = catalogOf(model(MODEL_IDS.super));
    const decision = routeModel(catalog, request());
    const telemetry = createRouterTelemetry({
      requestId: "completion_request_1",
      taskId: "task_1",
      taskCategory: "patch-worker",
      difficulty: "medium",
      decision,
      latencyMs: 812,
      outcome: "succeeded",
      retries: 0,
      recordedAt: "2026-08-31T00:02:00.000Z",
      usage: { inputTokens: 500, outputTokens: 100, totalTokens: 600 },
      privateReasoning: "never persist this",
      prompt: "nor this",
    } as Parameters<typeof createRouterTelemetry>[0] & Record<string, unknown>);

    expect(telemetry).toMatchObject({
      modelId: MODEL_IDS.super,
      family: "SUPER",
      catalogRequestId: CONTEXT.requestId,
      fallbackUsed: false,
    });
    expect(telemetry).not.toHaveProperty("privateReasoning");
    expect(telemetry).not.toHaveProperty("prompt");
  });

  it("rejects inconsistent usage and costs without reliable provenance", () => {
    const decision = routeModel(catalogOf(model(MODEL_IDS.super)), request());
    const base = {
      requestId: "completion_request_1",
      taskId: "task_1",
      taskCategory: "patch-worker",
      difficulty: "medium" as const,
      decision,
      latencyMs: 812,
      outcome: "succeeded" as const,
      retries: 0,
      recordedAt: "2026-08-31T00:02:00.000Z",
    };
    expect(() =>
      createRouterTelemetry({
        ...base,
        usage: { inputTokens: 500, outputTokens: 100, totalTokens: 599 },
      }),
    ).toThrow(/Token usage/);
    expect(() =>
      createRouterTelemetry({
        ...base,
        reliableCost: {
          usd: 0.2,
          source: "authenticated-catalog-pricing",
          catalogRecordFingerprint: "wrong",
        },
      }),
    ).toThrow(/Cost telemetry/);
    expect(() =>
      createRouterTelemetry({
        ...base,
        reliableCost: {
          usd: 0.2,
          source: "provider-reported",
          providerRequestId: "another-request",
        },
      }),
    ).toThrow(/Cost telemetry/);
  });

  it("accepts catalog-priced cost only when it matches actual token usage", () => {
    const catalog = catalogOf(
      model(MODEL_IDS.super, {
        pricing: {
          currency: "USD",
          input_per_million_tokens: 10,
          output_per_million_tokens: 20,
        },
      }),
    );
    const decision = routeModel(catalog, request());
    if (decision.status !== "routed") throw new Error("fixture invariant");
    const telemetry = createRouterTelemetry({
      requestId: "completion_request_2",
      taskId: "task_2",
      taskCategory: "patch-worker",
      difficulty: "medium",
      decision,
      latencyMs: 500,
      outcome: "succeeded",
      retries: 0,
      recordedAt: "2026-08-31T00:03:00.000Z",
      usage: { inputTokens: 500, outputTokens: 100, totalTokens: 600 },
      reliableCost: {
        usd: 0.007,
        source: "authenticated-catalog-pricing",
        catalogRecordFingerprint: decision.model.provenance.catalogRecordFingerprint,
      },
    });
    expect(telemetry.cost).toEqual({
      usd: 0.007,
      source: "authenticated-catalog-pricing",
      catalogRecordFingerprint: decision.model.provenance.catalogRecordFingerprint,
    });
  });
});
