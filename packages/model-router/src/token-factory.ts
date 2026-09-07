import { z, type ZodType } from "zod";

import { validateAuthenticatedCatalog } from "./catalog";
import { isRoutedDecision } from "./router";
import { createRouterTelemetry } from "./telemetry";
import type {
  RouterTelemetry,
  RouterTokenUsage,
  RoutingDecision,
  RoutingRequest,
  ValidatedModelCatalog,
} from "./types";

export const TOKEN_FACTORY_BASE_URL = "https://api.tokenfactory.nebius.com/v1" as const;
const MODELS_URL = `${TOKEN_FACTORY_BASE_URL}/models?verbose=true`;
const CHAT_COMPLETIONS_URL = `${TOKEN_FACTORY_BASE_URL}/chat/completions`;
const TIMEOUT_REASON = Symbol("token-factory-timeout");
const MAX_REPAIR_CONTENT_CHARS = 16_000;
const MIN_REASONING_TOKEN_ALLOWANCE = 2_048;
const MAX_REASONING_TOKEN_ALLOWANCE = 4_096;

const CatalogPricingSchema = z
  .object({
    currency: z.literal("USD"),
    input_per_million_tokens: z.number().finite().nonnegative(),
    output_per_million_tokens: z.number().finite().nonnegative(),
  })
  .passthrough();

const CatalogModelSchema = z
  .object({
    id: z.string().trim().min(1).max(512),
    object: z.string().optional(),
    owned_by: z.string().trim().min(1).optional(),
    context_length: z.number().int().positive().optional(),
    capabilities: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
    supported_features: z.array(z.string().trim().min(1).max(160)).max(100).nullish(),
    status: z.enum(["validating", "active", "error", "deleted"]).nullish(),
    pricing: z.union([CatalogPricingSchema, z.record(z.string(), z.unknown())]).optional(),
  })
  .passthrough();

const CatalogResponseSchema = z
  .object({
    object: z.string().optional(),
    data: z.array(CatalogModelSchema).max(10_000),
  })
  .passthrough();

const ProviderErrorSchema = z
  .object({
    error: z
      .object({
        code: z.union([z.string().max(128), z.number().finite()]).optional(),
        type: z.string().max(128).optional(),
        message: z.string().max(16_000).optional(),
      })
      .passthrough()
      .optional(),
    detail: z.unknown().optional(),
  })
  .passthrough();

const ChatMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().min(1).max(100_000),
  })
  .strict();

const JsonSchemaContractSchema = z
  .object({
    name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/),
    schema: z.record(z.string(), z.unknown()),
  })
  .strict();

const TokenUsageSchema = z
  .object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  })
  .passthrough()
  .refine((usage) => usage.prompt_tokens + usage.completion_tokens === usage.total_tokens, {
    message: "Token usage must be internally consistent",
  });

const ChatCompletionResponseSchema = z
  .object({
    id: z.string().trim().min(1).max(512),
    object: z.string().optional(),
    created: z.number().int().nonnegative().optional(),
    model: z.string().trim().min(1).max(512),
    choices: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative(),
            message: z
              .object({
                role: z.literal("assistant"),
                content: z.string().max(500_000),
              })
              .passthrough(),
            finish_reason: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .length(1),
    usage: TokenUsageSchema,
  })
  .passthrough();

const NumericClientConfigSchema = z
  .object({
    timeoutMs: z.number().int().min(1).max(600_000),
    maxRetries: z.number().int().min(0).max(3),
    maxRetryDelayMs: z.number().int().min(0).max(30_000),
    maxResponseBytes: z.number().int().min(1_024).max(20_000_000),
    maxErrorBytes: z.number().int().min(256).max(1_000_000),
  })
  .strict();

export type TokenFactoryErrorCode =
  | "invalid-config"
  | "invalid-routing-decision"
  | "http-error"
  | "rate-limited"
  | "response-too-large"
  | "invalid-json"
  | "invalid-response"
  | "model-id-mismatch"
  | "structured-output-invalid"
  | "timeout"
  | "aborted"
  | "network-error";

export class TokenFactoryClientError extends Error {
  readonly code: TokenFactoryErrorCode;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly attempts: number;
  readonly retryable: boolean;
  readonly providerCode: string | null;

  constructor(
    message: string,
    options: {
      readonly code: TokenFactoryErrorCode;
      readonly status?: number;
      readonly requestId?: string;
      readonly attempts?: number;
      readonly retryable?: boolean;
      readonly providerCode?: string;
    },
  ) {
    super(message);
    this.name = "TokenFactoryClientError";
    this.code = options.code;
    this.status = options.status ?? null;
    this.requestId = options.requestId ?? null;
    this.attempts = options.attempts ?? 1;
    this.retryable = options.retryable ?? false;
    this.providerCode = options.providerCode ?? null;
  }
}

export interface TokenFactoryClock {
  readonly nowMs: () => number;
  readonly nowIso: () => string;
  readonly setTimeout: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  readonly sleep: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

export interface TokenFactoryClientOptions {
  readonly apiKey: string;
  readonly fetch: typeof globalThis.fetch;
  readonly clock?: TokenFactoryClock;
  readonly idGenerator?: () => string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly maxRetryDelayMs?: number;
  readonly maxResponseBytes?: number;
  readonly maxErrorBytes?: number;
}

export interface TokenFactoryMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface JsonSchemaContract {
  readonly name: string;
  readonly schema: Readonly<Record<string, unknown>>;
}

export interface StructuredCompletionRequest<T> {
  readonly decision: RoutingDecision;
  readonly taskId: string;
  readonly taskCategory: string;
  readonly difficulty: RoutingRequest["difficulty"];
  readonly messages: readonly TokenFactoryMessage[];
  readonly outputContract: JsonSchemaContract;
  readonly outputSchema: ZodType<T>;
  readonly maxOutputTokens: number;
  readonly reasoningEffort?: "none" | "low";
  readonly signal?: AbortSignal;
}

export interface StructuredCompletionResult<T> {
  readonly data: T;
  readonly telemetry: RouterTelemetry;
  /** Provider-issued chat-completion response IDs from the response bodies. */
  readonly requestIds: readonly string[];
  /** HTTP correlation IDs, which may be client-generated only when the provider omits one. */
  readonly httpRequestIds: readonly string[];
  readonly repairAttempted: boolean;
}

interface HttpJsonResult {
  readonly json: unknown;
  readonly requestId: string;
  readonly latencyMs: number;
  readonly retries: number;
}

interface ClientConfig {
  readonly apiKey: string;
  readonly fetch: typeof globalThis.fetch;
  readonly clock: TokenFactoryClock;
  readonly idGenerator: () => string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly maxRetryDelayMs: number;
  readonly maxResponseBytes: number;
  readonly maxErrorBytes: number;
}

function defaultSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const handle = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      globalThis.clearTimeout(handle);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const DEFAULT_CLOCK: TokenFactoryClock = {
  nowMs: () => Date.now(),
  nowIso: () => new Date().toISOString(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  sleep: defaultSleep,
};

function safeProviderCode(json: unknown): string | undefined {
  const parsed = ProviderErrorSchema.safeParse(json);
  if (!parsed.success || parsed.data.error?.code === undefined) return undefined;
  const value = String(parsed.data.error.code);
  return /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : undefined;
}

async function readCappedText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      await response.body?.cancel();
      throw new TokenFactoryClientError(
        "Token Factory response exceeded the configured size cap.",
        {
          code: "response-too-large",
          status: response.status,
        },
      );
    }
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    totalBytes += chunk.value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new TokenFactoryClientError(
        "Token Factory response exceeded the configured size cap.",
        {
          code: "response-too-large",
          status: response.status,
        },
      );
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

function parseJson(text: string, requestId: string, attempts: number): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new TokenFactoryClientError("Token Factory returned invalid JSON.", {
      code: "invalid-json",
      requestId,
      attempts,
    });
  }
}

function responseRequestId(response: Response, fallback: string): string {
  const candidate =
    response.headers.get("x-request-id") ??
    response.headers.get("x-nebius-request-id") ??
    response.headers.get("request-id");
  return candidate !== null && /^[A-Za-z0-9._:-]{1,256}$/.test(candidate) ? candidate : fallback;
}

function parseRetryAfter(
  value: string | null,
  nowIso: string,
  maxDelayMs: number,
): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1_000), maxDelayMs);
  }
  const retryAt = Date.parse(value);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(retryAt) || !Number.isFinite(now)) return undefined;
  return Math.min(Math.max(retryAt - now, 0), maxDelayMs);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function sumUsage(usages: readonly RouterTokenUsage[]): RouterTokenUsage {
  return usages.reduce<RouterTokenUsage>(
    (sum, usage) => ({
      inputTokens: sum.inputTokens + usage.inputTokens,
      outputTokens: sum.outputTokens + usage.outputTokens,
      totalTokens: sum.totalTokens + usage.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
}

function zodIssueSummary(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => `${issue.code}:${issue.path.join(".") || "root"}`)
    .join(", ");
}

function isJsonValue(value: unknown, seen: Set<object>): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((entry) => isJsonValue(entry, seen));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every((entry) => isJsonValue(entry, seen));
}

function validateJsonSerializable(value: unknown): boolean {
  if (!isJsonValue(value, new Set())) return false;
  const encoded = JSON.stringify(value);
  return encoded.length <= 100_000;
}

export class TokenFactoryClient {
  readonly #config: ClientConfig;

  constructor(options: TokenFactoryClientOptions) {
    const numeric = NumericClientConfigSchema.safeParse({
      timeoutMs: options.timeoutMs ?? 30_000,
      maxRetries: options.maxRetries ?? 2,
      maxRetryDelayMs: options.maxRetryDelayMs ?? 5_000,
      maxResponseBytes: options.maxResponseBytes ?? 2_000_000,
      maxErrorBytes: options.maxErrorBytes ?? 64_000,
    });
    if (
      !numeric.success ||
      typeof options.fetch !== "function" ||
      !options.apiKey.trim() ||
      /\s/.test(options.apiKey) ||
      options.apiKey.length > 8_192
    ) {
      throw new TokenFactoryClientError("Token Factory client configuration is invalid.", {
        code: "invalid-config",
      });
    }

    this.#config = {
      apiKey: options.apiKey,
      fetch: options.fetch,
      clock: options.clock ?? DEFAULT_CLOCK,
      idGenerator: options.idGenerator ?? (() => globalThis.crypto.randomUUID()),
      ...numeric.data,
    };
  }

  async #fetchAttempt(
    url: string,
    init: RequestInit,
    externalSignal: AbortSignal | undefined,
    attempt: number,
    clientRequestId: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) controller.abort(externalSignal.reason);
    else externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
    const timeoutHandle = this.#config.clock.setTimeout(
      () => controller.abort(TIMEOUT_REASON),
      this.#config.timeoutMs,
    );

    try {
      return await this.#config.fetch(url, { ...init, signal: controller.signal });
    } catch {
      if (controller.signal.reason === TIMEOUT_REASON) {
        throw new TokenFactoryClientError("Token Factory request timed out.", {
          code: "timeout",
          requestId: clientRequestId,
          attempts: attempt + 1,
        });
      }
      if (externalSignal?.aborted || controller.signal.aborted) {
        throw new TokenFactoryClientError("Token Factory request was aborted.", {
          code: "aborted",
          requestId: clientRequestId,
          attempts: attempt + 1,
        });
      }
      throw new TokenFactoryClientError("Token Factory network request failed.", {
        code: "network-error",
        requestId: clientRequestId,
        attempts: attempt + 1,
      });
    } finally {
      this.#config.clock.clearTimeout(timeoutHandle);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }
  }

  async #requestJson(options: {
    readonly url: string;
    readonly method: "GET" | "POST";
    readonly body?: unknown;
    readonly signal?: AbortSignal;
  }): Promise<HttpJsonResult> {
    const startedAt = this.#config.clock.nowMs();
    const clientRequestId = this.#config.idGenerator();
    if (!/^[A-Za-z0-9._:-]{1,256}$/.test(clientRequestId)) {
      throw new TokenFactoryClientError(
        "Token Factory request ID generator returned an invalid ID.",
        {
          code: "invalid-config",
        },
      );
    }
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${this.#config.apiKey}`,
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    for (let attempt = 0; attempt <= this.#config.maxRetries; attempt += 1) {
      const response = await this.#fetchAttempt(
        options.url,
        {
          method: options.method,
          headers,
          ...(body === undefined ? {} : { body }),
        },
        options.signal,
        attempt,
        clientRequestId,
      );
      const requestId = responseRequestId(response, clientRequestId);

      if (response.ok) {
        const text = await readCappedText(response, this.#config.maxResponseBytes);
        return {
          json: parseJson(text, requestId, attempt + 1),
          requestId,
          latencyMs: Math.max(this.#config.clock.nowMs() - startedAt, 0),
          retries: attempt,
        };
      }

      let errorText: string;
      try {
        errorText = await readCappedText(response, this.#config.maxErrorBytes);
      } catch (error) {
        if (error instanceof TokenFactoryClientError) {
          throw new TokenFactoryClientError(error.message, {
            code: error.code,
            status: response.status,
            requestId,
            attempts: attempt + 1,
          });
        }
        throw error;
      }

      if (isRetryableStatus(response.status) && attempt < this.#config.maxRetries) {
        const retryAfterMs = parseRetryAfter(
          response.headers.get("retry-after"),
          this.#config.clock.nowIso(),
          this.#config.maxRetryDelayMs,
        );
        const backoffMs = Math.min(250 * 2 ** attempt, this.#config.maxRetryDelayMs);
        try {
          await this.#config.clock.sleep(retryAfterMs ?? backoffMs, options.signal);
        } catch {
          throw new TokenFactoryClientError("Token Factory request was aborted.", {
            code: "aborted",
            requestId,
            attempts: attempt + 1,
          });
        }
        continue;
      }

      let errorJson: unknown;
      try {
        errorJson = JSON.parse(errorText) as unknown;
      } catch {
        errorJson = undefined;
      }
      const providerCode = safeProviderCode(errorJson);
      throw new TokenFactoryClientError(
        response.status === 429
          ? "Token Factory rate limit was exhausted."
          : `Token Factory request failed with HTTP ${response.status}.`,
        {
          code: response.status === 429 ? "rate-limited" : "http-error",
          status: response.status,
          requestId,
          attempts: attempt + 1,
          retryable: isRetryableStatus(response.status),
          ...(providerCode === undefined ? {} : { providerCode }),
        },
      );
    }

    throw new TokenFactoryClientError("Token Factory retry budget was exhausted.", {
      code: "network-error",
      requestId: clientRequestId,
      attempts: this.#config.maxRetries + 1,
    });
  }

  async listModels(
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<ValidatedModelCatalog> {
    const result = await this.#requestJson({
      url: MODELS_URL,
      method: "GET",
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const parsed = CatalogResponseSchema.safeParse(result.json);
    if (!parsed.success) {
      throw new TokenFactoryClientError("Token Factory model catalog failed schema validation.", {
        code: "invalid-response",
        requestId: result.requestId,
        attempts: result.retries + 1,
      });
    }
    const validated = validateAuthenticatedCatalog(parsed.data, {
      authenticated: true,
      httpStatus: 200,
      requestId: result.requestId,
      endpoint: MODELS_URL,
      fetchedAt: this.#config.clock.nowIso(),
    });
    if (!validated.ok) {
      throw new TokenFactoryClientError("Token Factory model catalog was not trustworthy.", {
        code: "invalid-response",
        requestId: result.requestId,
        attempts: result.retries + 1,
      });
    }
    return validated.catalog;
  }

  async completeStructured<T>(
    request: StructuredCompletionRequest<T>,
  ): Promise<StructuredCompletionResult<T>> {
    if (!isRoutedDecision(request.decision)) {
      throw new TokenFactoryClientError(
        "Structured completion requires a validated router decision.",
        { code: "invalid-routing-decision" },
      );
    }
    const messages = z.array(ChatMessageSchema).min(1).max(64).safeParse(request.messages);
    const contract = JsonSchemaContractSchema.safeParse(request.outputContract);
    if (
      !messages.success ||
      !contract.success ||
      !validateJsonSerializable(request.outputContract.schema) ||
      !request.taskId.trim() ||
      !request.taskCategory.trim() ||
      !Number.isSafeInteger(request.maxOutputTokens) ||
      request.maxOutputTokens < 1 ||
      request.maxOutputTokens > 1_000_000 ||
      (request.reasoningEffort !== undefined &&
        !["none", "low"].includes(request.reasoningEffort)) ||
      typeof request.outputSchema?.safeParse !== "function"
    ) {
      throw new TokenFactoryClientError("Structured completion request is invalid.", {
        code: "invalid-config",
      });
    }

    const startedAt = this.#config.clock.nowMs();
    const requestIds: string[] = [];
    const httpRequestIds: string[] = [];
    const usages: RouterTokenUsage[] = [];
    let transportRetries = 0;
    const capabilities = request.decision.model.capabilities.map((capability) =>
      capability.toLowerCase(),
    );
    const supportsStrictJsonSchema = capabilities.some((capability) =>
      /structured[-_ ]?output|json[-_ ]?schema/iu.test(capability),
    );
    const isReasoningModel = capabilities.some((capability) => /reasoning/iu.test(capability));
    const completionBudget =
      request.maxOutputTokens +
      (isReasoningModel && request.reasoningEffort !== "none"
        ? Math.min(
            MAX_REASONING_TOKEN_ALLOWANCE,
            Math.max(MIN_REASONING_TOKEN_ALLOWANCE, Math.ceil(request.maxOutputTokens / 2)),
          )
        : 0);
    const serializedSchema = JSON.stringify(contract.data.schema);
    const baseMessages: TokenFactoryMessage[] = [
      ...messages.data,
      {
        role: "user",
        content:
          `Required JSON Schema: ${serializedSchema}\n` +
          "Return exactly one JSON object matching this schema. Do not add Markdown or prose.",
      },
    ];
    let currentMessages = baseMessages;
    let lastFailure = "invalid-json:root";
    const failureMetadata: Array<{
      finish: string;
      contentCharacters: number;
      fenced: boolean;
      reasoningCharacters: number;
      totalTokens: number;
    }> = [];

    for (let schemaAttempt = 0; schemaAttempt < 2; schemaAttempt += 1) {
      const http = await this.#requestJson({
        url: CHAT_COMPLETIONS_URL,
        method: "POST",
        body: {
          model: request.decision.model.exactId,
          messages: currentMessages,
          ...(isReasoningModel
            ? {
                reasoning_effort: request.reasoningEffort ?? "low",
                // Authenticated Super endpoint rejects max_completion_tokens.
                ...(request.decision.model.family === "SUPER"
                  ? { max_tokens: completionBudget }
                  : { max_completion_tokens: completionBudget }),
              }
            : { max_tokens: request.maxOutputTokens }),
          // NVIDIA's Super model card recommends these sampling defaults across tasks.
          ...(request.decision.model.family === "SUPER"
            ? { temperature: 1, top_p: 0.95 }
            : { temperature: 0 }),
          response_format: supportsStrictJsonSchema
            ? {
                type: "json_schema",
                json_schema: {
                  name: contract.data.name,
                  strict: true,
                  schema: contract.data.schema,
                },
              }
            : { type: "json_object" },
        },
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
      httpRequestIds.push(http.requestId);
      transportRetries += http.retries;

      const completion = ChatCompletionResponseSchema.safeParse(http.json);
      if (!completion.success) {
        throw new TokenFactoryClientError(
          "Token Factory chat completion failed schema validation.",
          {
            code: "invalid-response",
            requestId: http.requestId,
            attempts: schemaAttempt + 1,
          },
        );
      }
      if (completion.data.model !== request.decision.model.exactId) {
        throw new TokenFactoryClientError(
          "Token Factory responded with a model ID different from the routed exact ID.",
          {
            code: "model-id-mismatch",
            requestId: http.requestId,
            attempts: schemaAttempt + 1,
          },
        );
      }
      requestIds.push(completion.data.id);

      usages.push({
        inputTokens: completion.data.usage.prompt_tokens,
        outputTokens: completion.data.usage.completion_tokens,
        totalTokens: completion.data.usage.total_tokens,
      });
      const content = completion.data.choices[0]?.message.content ?? "";
      let decoded: unknown;
      try {
        decoded = JSON.parse(content) as unknown;
      } catch {
        lastFailure = "invalid-json:root";
        decoded = undefined;
      }
      const message = completion.data.choices[0]?.message;
      const reason = message?.reasoning_content ?? message?.reasoning;
      failureMetadata.push({
        finish: completion.data.choices[0]?.finish_reason === "length" ? "length" : "other",
        contentCharacters: content.length,
        fenced: content.trimStart().startsWith("```"),
        reasoningCharacters: typeof reason === "string" ? reason.length : 0,
        totalTokens: completion.data.usage.total_tokens,
      });

      const output = decoded === undefined ? undefined : request.outputSchema.safeParse(decoded);
      if (output?.success) {
        const usage = sumUsage(usages);
        const finalRequestId = httpRequestIds.at(-1);
        if (!finalRequestId) {
          throw new TokenFactoryClientError("Token Factory response had no request identity.", {
            code: "invalid-response",
          });
        }
        return {
          data: output.data,
          telemetry: createRouterTelemetry({
            requestId: finalRequestId,
            taskId: request.taskId,
            taskCategory: request.taskCategory,
            difficulty: request.difficulty,
            decision: request.decision,
            latencyMs: Math.max(this.#config.clock.nowMs() - startedAt, 0),
            outcome: "succeeded",
            retries: transportRetries,
            recordedAt: this.#config.clock.nowIso(),
            usage,
          }),
          requestIds: Object.freeze([...requestIds]),
          httpRequestIds: Object.freeze([...httpRequestIds]),
          repairAttempted: schemaAttempt === 1,
        };
      }

      if (output && !output.success) lastFailure = zodIssueSummary(output.error);
      if (schemaAttempt === 0) {
        currentMessages = [
          ...baseMessages,
          ...(content && decoded !== undefined
            ? [
                {
                  role: "assistant" as const,
                  content: content.slice(0, MAX_REPAIR_CONTENT_CHARS),
                },
              ]
            : []),
          {
            role: "user",
            content:
              `The previous JSON response failed the declared schema (${lastFailure}). ` +
              "Return one corrected JSON object only. Do not add Markdown or prose.",
          },
        ];
      }
    }

    const lastRequestId = httpRequestIds.at(-1);
    throw new TokenFactoryClientError(
      `Token Factory structured output remained invalid after one repair attempt (${lastFailure}; content-free diagnostics ${JSON.stringify(failureMetadata)}).`,
      {
        code: "structured-output-invalid",
        ...(lastRequestId === undefined ? {} : { requestId: lastRequestId }),
        attempts: httpRequestIds.length,
      },
    );
  }
}
