import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  TOKEN_FACTORY_BASE_URL,
  TokenFactoryClient,
  TokenFactoryClientError,
  routeModel,
  validateAuthenticatedCatalog,
  type RoutingDecision,
  type TokenFactoryClock,
  type TokenFactoryClientOptions,
} from "./index";

const EXACT_MODEL_ID = "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B";
const API_KEY = "tf-secret-test-key";
const START_TIME = Date.parse("2026-08-31T00:00:00.000Z");
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function rawResponse(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

function catalogPayload(): unknown {
  return {
    object: "list",
    data: [
      {
        id: EXACT_MODEL_ID,
        object: "model",
        owned_by: "NVIDIA",
        context_length: 131_072,
        capabilities: ["chat", "structured-output", "tool-calls"],
      },
    ],
  };
}

function routedDecision(): Extract<RoutingDecision, { status: "routed" }> {
  const validated = validateAuthenticatedCatalog(catalogPayload(), {
    authenticated: true,
    httpStatus: 200,
    requestId: "catalog_fixture_request",
    endpoint: `${TOKEN_FACTORY_BASE_URL}/models`,
    fetchedAt: "2026-08-31T00:00:00.000Z",
  });
  if (!validated.ok) throw new Error("catalog fixture invalid");
  const decision = routeModel(validated.catalog, {
    role: "STANDARD",
    taskCategory: "patch-worker",
    difficulty: "medium",
    estimatedInputTokens: 1_000,
    maxOutputTokens: 500,
    requiredCapabilities: ["chat", "structured-output"],
  });
  if (decision.status !== "routed") throw new Error("routing fixture invalid");
  return decision;
}

function reasoningOnlyDecision(): Extract<RoutingDecision, { status: "routed" }> {
  const validated = validateAuthenticatedCatalog(
    {
      object: "list",
      data: [
        {
          id: "nvidia/Nemotron-3_5-Lightning",
          object: "model",
          owned_by: "NVIDIA",
          context_length: 131_072,
          capabilities: ["tools", "reasoning"],
        },
      ],
    },
    {
      authenticated: true,
      httpStatus: 200,
      requestId: "reasoning_catalog_fixture_request",
      endpoint: `${TOKEN_FACTORY_BASE_URL}/models`,
      fetchedAt: "2026-08-31T00:00:00.000Z",
    },
  );
  if (!validated.ok) throw new Error("reasoning catalog fixture invalid");
  const decision = routeModel(validated.catalog, {
    role: "LIGHT",
    taskCategory: "patch-worker",
    difficulty: "low",
    estimatedInputTokens: 1_000,
    maxOutputTokens: 500,
  });
  if (decision.status !== "routed") throw new Error("reasoning routing fixture invalid");
  return decision;
}

function completionResponse(
  content: string,
  options: {
    readonly id?: string;
    readonly model?: string;
    readonly promptTokens?: number;
    readonly completionTokens?: number;
  } = {},
): unknown {
  const promptTokens = options.promptTokens ?? 10;
  const completionTokens = options.completionTokens ?? 4;
  return {
    id: options.id ?? "completion_1",
    object: "chat.completion",
    created: 1_788_134_400,
    model: options.model ?? EXACT_MODEL_ID,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

function createClock(options: { readonly immediateTimeout?: boolean } = {}) {
  let elapsedMs = 0;
  const sleepDelays: number[] = [];
  const clock: TokenFactoryClock = {
    nowMs: () => START_TIME + elapsedMs,
    nowIso: () => new Date(START_TIME + elapsedMs).toISOString(),
    setTimeout: (callback) => {
      if (options.immediateTimeout) queueMicrotask(callback);
      return Symbol("timer");
    },
    clearTimeout: () => undefined,
    sleep: async (delayMs, signal) => {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      sleepDelays.push(delayMs);
      elapsedMs += delayMs;
    },
  };
  return {
    clock,
    sleepDelays,
    advance: (milliseconds: number) => {
      elapsedMs += milliseconds;
    },
  };
}

function createClient(
  fetchMock: typeof globalThis.fetch,
  options: Partial<TokenFactoryClientOptions> = {},
): TokenFactoryClient {
  let id = 0;
  return new TokenFactoryClient({
    apiKey: API_KEY,
    fetch: fetchMock,
    idGenerator: () => `client_request_${++id}`,
    ...options,
  });
}

const OutputSchema = z.object({ answer: z.string().min(1) }).strict();
const OUTPUT_CONTRACT = {
  name: "migration_answer",
  schema: {
    type: "object",
    properties: { answer: { type: "string" } },
    required: ["answer"],
    additionalProperties: false,
  },
} as const;

function structuredRequest(decision: RoutingDecision = routedDecision()) {
  return {
    decision,
    taskId: "task_1",
    taskCategory: "patch-worker",
    difficulty: "medium" as const,
    messages: [
      { role: "system" as const, content: "Return the migration result." },
      { role: "user" as const, content: "Analyze the bounded fixture." },
    ],
    outputContract: OUTPUT_CONTRACT,
    outputSchema: OutputSchema,
    maxOutputTokens: 500,
  };
}

describe("Token Factory catalog contract", () => {
  it("uses direct bearer-authenticated GET and preserves exact catalog provenance", async () => {
    const fetchMock = vi.fn(async (_input: FetchInput, _init?: FetchInit) =>
      jsonResponse(catalogPayload(), 200, { "x-request-id": "provider_catalog_1" }),
    );
    const { clock } = createClock();
    const client = createClient(fetchMock as typeof fetch, { clock });

    const catalog = await client.listModels();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${TOKEN_FACTORY_BASE_URL}/models?verbose=true`);
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(catalog.models[0]).toMatchObject({
      exactId: EXACT_MODEL_ID,
      family: "SUPER",
      provenance: {
        source: "authenticated-catalog",
        catalogRequestId: "provider_catalog_1",
        catalogEndpoint: `${TOKEN_FACTORY_BASE_URL}/models?verbose=true`,
      },
    });
  });

  it("normalizes the current verbose catalog feature and pricing fields", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          object: "list",
          data: [
            {
              id: "nvidia/Nemotron-3_5-Lightning",
              object: "model",
              owned_by: "system",
              context_length: 262_144,
              status: "active",
              supported_features: ["chat", "structured-output", "tool-calls"],
              pricing: { prompt: "0.00000006", completion: "0.00000024" },
            },
            {
              id: "nvidia/retired-model",
              object: "model",
              owned_by: "system",
              context_length: 8_192,
              status: "deleted",
              supported_features: ["chat"],
              pricing: { prompt: "0", completion: "0" },
            },
          ],
        },
        200,
        { "x-request-id": "provider_catalog_verbose" },
      ),
    );
    const client = createClient(fetchMock as typeof fetch);

    const catalog = await client.listModels();

    expect(catalog.models).toHaveLength(1);
    expect(catalog.models[0]).toMatchObject({
      exactId: "nvidia/Nemotron-3_5-Lightning",
      family: "LIGHTNING",
      capabilities: ["chat", "structured-output", "tool-calls"],
      pricing: {
        currency: "USD",
        inputPerMillionTokens: 0.06,
        outputPerMillionTokens: 0.24,
        source: "authenticated-catalog",
      },
    });
  });

  it("accepts nullable features and classifies current Nemotron Nano IDs", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          object: "list",
          data: [
            {
              id: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16",
              owned_by: "NVIDIA",
              context_length: 131_072,
              status: "active",
              supported_features: null,
              pricing: { prompt: "0", completion: "0" },
            },
          ],
        },
        200,
        { "x-request-id": "provider_catalog_nullable" },
      ),
    );
    const client = createClient(fetchMock as typeof fetch);

    const catalog = await client.listModels();

    expect(catalog.models[0]).toMatchObject({
      exactId: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16",
      family: "LIGHTNING",
      capabilities: [],
    });
  });

  it("rejects invalid JSON and Zod-invalid catalog envelopes", async () => {
    const invalidJson = createClient(
      vi.fn(async () =>
        rawResponse("not-json", 200, { "x-request-id": "bad_json" }),
      ) as typeof fetch,
    );
    await expect(invalidJson.listModels()).rejects.toMatchObject({ code: "invalid-json" });

    const invalidSchema = createClient(
      vi.fn(async () =>
        jsonResponse({ models: [] }, 200, { "x-request-id": "bad_schema" }),
      ) as typeof fetch,
    );
    await expect(invalidSchema.listModels()).rejects.toMatchObject({ code: "invalid-response" });
  });

  it("redacts bearer secrets and provider error text", async () => {
    const hostileText = `credential=${API_KEY}; prompt=Analyze private repository`;
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { code: "AUTH_FAILED", message: hostileText } }, 401, {
        "x-request-id": "auth_failure_1",
      }),
    );
    const client = createClient(fetchMock as typeof fetch, { maxRetries: 0 });

    let caught: unknown;
    try {
      await client.listModels();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TokenFactoryClientError);
    expect(caught).toMatchObject({
      code: "http-error",
      status: 401,
      requestId: "auth_failure_1",
      providerCode: "AUTH_FAILED",
    });
    const serialized = `${String(caught)} ${JSON.stringify(caught)} ${(caught as Error).stack ?? ""}`;
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain("private repository");
  });

  it("honors bounded Retry-After retries for 429/5xx only", async () => {
    const responses = [
      jsonResponse({ error: { code: "RATE_LIMIT" } }, 429, {
        "retry-after": "2",
        "x-request-id": "retry_1",
      }),
      jsonResponse({ error: { code: "TEMPORARY" } }, 503, {
        "x-request-id": "retry_2",
      }),
      jsonResponse(catalogPayload(), 200, { "x-request-id": "retry_3" }),
    ];
    const fetchMock = vi.fn(async () => {
      const response = responses.shift();
      if (!response) throw new Error("unexpected request");
      return response;
    });
    const testClock = createClock();
    const client = createClient(fetchMock as typeof fetch, {
      clock: testClock.clock,
      maxRetries: 2,
      maxRetryDelayMs: 3_000,
    });

    await expect(client.listModels()).resolves.toMatchObject({ requestId: "retry_3" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(testClock.sleepDelays).toEqual([2_000, 500]);
  });

  it("aborts an in-flight request at the configured timeout", async () => {
    const testClock = createClock({ immediateTimeout: true });
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit): Promise<Response> =>
        await new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const client = createClient(fetchMock as typeof fetch, {
      clock: testClock.clock,
      timeoutMs: 1,
    });

    await expect(client.listModels()).rejects.toMatchObject({ code: "timeout", attempts: 1 });
  });

  it("caps oversized success and error bodies before parsing or retrying", async () => {
    const success = createClient(
      vi.fn(async () =>
        rawResponse("x".repeat(2_000), 200, { "content-length": "2000" }),
      ) as typeof fetch,
      { maxResponseBytes: 1_024 },
    );
    await expect(success.listModels()).rejects.toMatchObject({ code: "response-too-large" });

    const failure = createClient(
      vi.fn(async () => rawResponse("x".repeat(2_000), 503)) as typeof fetch,
      { maxErrorBytes: 256, maxRetries: 2 },
    );
    await expect(failure.listModels()).rejects.toMatchObject({
      code: "response-too-large",
      attempts: 1,
    });
  });
});

describe("Token Factory structured completion contract", () => {
  it("rejects an unbranded/fabricated route before any network call", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(completionResponse('{"answer":"ok"}')));
    const client = createClient(fetchMock as typeof fetch);
    const fakeDecision = { ...routedDecision() } as RoutingDecision;

    await expect(client.completeStructured(structuredRequest(fakeDecision))).rejects.toMatchObject({
      code: "invalid-routing-decision",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("binds POST /chat/completions to the exact routed ID and emits redacted usage telemetry", async () => {
    const testClock = createClock();
    const fetchMock = vi.fn(async (_input: FetchInput, _init?: FetchInit) => {
      testClock.advance(37);
      return jsonResponse(
        completionResponse('{"answer":"safe patch"}', {
          promptTokens: 12,
          completionTokens: 3,
        }),
        200,
        { "x-request-id": "completion_request_1" },
      );
    });
    const client = createClient(fetchMock as typeof fetch, { clock: testClock.clock });

    const result = await client.completeStructured(structuredRequest());

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${TOKEN_FACTORY_BASE_URL}/chat/completions`);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.model).toBe(EXACT_MODEL_ID);
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "migration_answer", strict: true },
    });
    expect(result).toMatchObject({
      data: { answer: "safe patch" },
      repairAttempted: false,
      requestIds: ["completion_1"],
      httpRequestIds: ["completion_request_1"],
      telemetry: {
        requestId: "completion_request_1",
        modelId: EXACT_MODEL_ID,
        latencyMs: 37,
        usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
      },
    });
    const serializedTelemetry = JSON.stringify(result.telemetry);
    expect(serializedTelemetry).not.toContain("Analyze the bounded fixture");
    expect(serializedTelemetry).not.toContain("privateReasoning");
  });

  it("uses bounded low-effort JSON mode when the routed reasoning model lacks JSON-schema capability", async () => {
    const decision = reasoningOnlyDecision();
    const fetchMock = vi.fn(async (_input: FetchInput, _init?: FetchInit) =>
      jsonResponse(
        completionResponse('{"answer":"safe patch"}', {
          model: decision.model.exactId,
          promptTokens: 20,
          completionTokens: 30,
        }),
      ),
    );
    const client = createClient(fetchMock as typeof fetch);

    await expect(client.completeStructured(structuredRequest(decision))).resolves.toMatchObject({
      data: { answer: "safe patch" },
    });

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: decision.model.exactId,
      reasoning_effort: "low",
      max_completion_tokens: 2_548,
      temperature: 0,
      response_format: { type: "json_object" },
    });
    expect(body).not.toHaveProperty("max_tokens");
    expect(JSON.stringify(body.messages)).toContain("Required JSON Schema");
  });

  it("honors a bounded non-reasoning request without adding a reasoning token allowance", async () => {
    const decision = reasoningOnlyDecision();
    const fetchMock = vi.fn(async (_input: FetchInput, _init?: FetchInit) =>
      jsonResponse(
        completionResponse('{"answer":"safe patch"}', { model: decision.model.exactId }),
      ),
    );
    const client = createClient(fetchMock as typeof fetch);
    await client.completeStructured({ ...structuredRequest(decision), reasoningEffort: "none" });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ reasoning_effort: "none", max_completion_tokens: 500 });
  });

  it("rejects a response whose model ID differs from the routed exact ID", async () => {
    const client = createClient(
      vi.fn(async () =>
        jsonResponse(
          completionResponse('{"answer":"wrong model"}', { model: "nvidia/another-model" }),
          200,
          { "x-request-id": "model_mismatch_1" },
        ),
      ) as typeof fetch,
    );

    await expect(client.completeStructured(structuredRequest())).rejects.toMatchObject({
      code: "model-id-mismatch",
      requestId: "model_mismatch_1",
    });
  });

  it("performs one schema-repair call and aggregates usage/request telemetry", async () => {
    const responses = [
      jsonResponse(
        completionResponse('{"answer":42}', {
          id: "completion_repair_1",
          promptTokens: 10,
          completionTokens: 2,
        }),
        200,
        { "x-request-id": "repair_1" },
      ),
      jsonResponse(
        completionResponse('{"answer":"repaired"}', {
          id: "completion_repair_2",
          promptTokens: 14,
          completionTokens: 3,
        }),
        200,
        { "x-request-id": "repair_2" },
      ),
    ];
    const fetchMock = vi.fn(async (_input: FetchInput, _init?: FetchInit) => {
      const response = responses.shift();
      if (!response) throw new Error("unexpected third request");
      return response;
    });
    const client = createClient(fetchMock as typeof fetch);

    const result = await client.completeStructured(structuredRequest());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      data: { answer: "repaired" },
      repairAttempted: true,
      requestIds: ["completion_repair_1", "completion_repair_2"],
      httpRequestIds: ["repair_1", "repair_2"],
      telemetry: {
        requestId: "repair_2",
        usage: { inputTokens: 24, outputTokens: 5, totalTokens: 29 },
      },
    });
    const secondBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
    ) as { messages: Array<{ role: string; content: string }> };
    expect(secondBody.messages.at(-1)).toMatchObject({
      role: "user",
      content: expect.stringContaining("failed the declared schema"),
    });
    expect(JSON.stringify(secondBody.messages)).toContain("Required JSON Schema");
  });

  it("repairs malformed JSON once, then fails closed without a third call", async () => {
    const responses = [
      jsonResponse(completionResponse("not-json"), 200, { "x-request-id": "repair_fail_1" }),
      jsonResponse(completionResponse('{"answer":7}'), 200, {
        "x-request-id": "repair_fail_2",
      }),
    ];
    const fetchMock = vi.fn(async () => {
      const response = responses.shift();
      if (!response) throw new Error("unexpected third request");
      return response;
    });
    const client = createClient(fetchMock as typeof fetch);

    await expect(client.completeStructured(structuredRequest())).rejects.toMatchObject({
      code: "structured-output-invalid",
      requestId: "repair_fail_2",
      attempts: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a Zod-invalid OpenAI response envelope without treating it as repairable output", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ id: "broken", model: EXACT_MODEL_ID, choices: [] }, 200, {
        "x-request-id": "invalid_envelope_1",
      }),
    );
    const client = createClient(fetchMock as typeof fetch);

    await expect(client.completeStructured(structuredRequest())).rejects.toMatchObject({
      code: "invalid-response",
      requestId: "invalid_envelope_1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
