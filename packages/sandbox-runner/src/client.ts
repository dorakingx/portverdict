import type { JsonValue } from "@portverdict/shared-schemas";

import { isAbortError, SandboxAdapterError } from "./errors.js";
import { parseSandboxSse } from "./sse.js";
import type {
  SandboxBranch,
  SandboxBranchRequest,
  SandboxCheckpoint,
  SandboxCheckpointRequest,
  SandboxClientOptions,
  SandboxClock,
  SandboxInstanceRequest,
  SandboxOperation,
  SandboxReadiness,
  SandboxResourcePolicy,
  SandboxSseFrame,
  SandboxTelemetry,
  SpawnedSandboxInstance,
  StreamOperationEventsOptions,
  WaitForOperationOptions,
} from "./types.js";
import { DEFAULT_SANDBOX_BASE_URL, SANDBOX_TERMINAL_STATUSES } from "./types.js";
import {
  assertUuid,
  buildSpawnBody,
  normalizePolicy,
  parseJsonValue,
  parseOperation,
  parseRetryAfter,
  parseSpawnResponse,
} from "./validation.js";

const MAX_JSON_RESPONSE_BYTES = 5_000_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 750;
const DEFAULT_MAX_TRANSIENT_RETRIES = 2;
const DEFAULT_MAX_RETRY_DELAY_MS = 5_000;

const defaultClock: SandboxClock = {
  now: () => Date.now(),
  sleep: (milliseconds, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      let settled = false;
      const abort = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", abort);
        resolve();
      }, milliseconds);
      signal?.addEventListener("abort", abort, { once: true });
    }),
};

function validateSecret(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 8_192 || /[\r\n]/u.test(trimmed)) {
    throw new SandboxAdapterError("INVALID_CONFIGURATION", `${label} is not configured safely.`);
  }
  return trimmed;
}

function validateProject(value: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,255}$/u.test(trimmed)) {
    throw new SandboxAdapterError(
      "INVALID_CONFIGURATION",
      "Sandbox project ID is not configured safely.",
    );
  }
  return trimmed;
}

function normalizeBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new SandboxAdapterError("INVALID_CONFIGURATION", "Sandbox base URL is invalid.", {
      cause: error,
    });
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new SandboxAdapterError(
      "INVALID_CONFIGURATION",
      "Sandbox base URL must be credential-free HTTPS.",
    );
  }
  return parsed.toString().replace(/\/+$/u, "");
}

function responseRequestId(response: Response): string | null {
  const value = response.headers.get("x-request-id") ?? response.headers.get("request-id");
  return value === null ? null : value.slice(0, 256);
}

function transientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function boundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_RESPONSE_BYTES) {
    throw new SandboxAdapterError("INVALID_RESPONSE", "Sandbox response exceeds 5 MB.");
  }
  const text = await response.text();
  if (text.length === 0 || text.length > MAX_JSON_RESPONSE_BYTES) {
    throw new SandboxAdapterError(
      "INVALID_RESPONSE",
      "Sandbox response body is empty or oversized.",
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new SandboxAdapterError("INVALID_RESPONSE", "Sandbox response is not JSON.", {
      cause: error,
    });
  }
}

type RequestMetadata = Pick<SandboxTelemetry, "method" | "endpoint"> & {
  operationId?: string;
  retryCount: number;
};

export class TokenFactorySandboxClient {
  readonly #token: string;
  readonly #project: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #clock: SandboxClock;
  readonly #requestTimeoutMs: number;
  readonly #pollIntervalMs: number;
  readonly #maxTransientRetries: number;
  readonly #maxRetryDelayMs: number;
  readonly #defaultPolicy: Partial<SandboxResourcePolicy>;
  readonly #onTelemetry: ((telemetry: SandboxTelemetry) => void) | undefined;

  constructor(options: SandboxClientOptions) {
    this.#token = validateSecret(options.iamToken, "Sandbox IAM token");
    this.#project = validateProject(options.projectId);
    this.#baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_SANDBOX_BASE_URL);
    this.#fetch = options.fetch ?? fetch;
    this.#clock = options.clock ?? defaultClock;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.#maxTransientRetries = options.maxTransientRetries ?? DEFAULT_MAX_TRANSIENT_RETRIES;
    this.#maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
    this.#defaultPolicy = options.defaultPolicy ?? {};
    this.#onTelemetry = options.onTelemetry;
    if (
      !Number.isSafeInteger(this.#requestTimeoutMs) ||
      this.#requestTimeoutMs < 1_000 ||
      this.#requestTimeoutMs > 120_000 ||
      !Number.isSafeInteger(this.#pollIntervalMs) ||
      this.#pollIntervalMs < 10 ||
      this.#pollIntervalMs > 30_000 ||
      !Number.isSafeInteger(this.#maxTransientRetries) ||
      this.#maxTransientRetries < 0 ||
      this.#maxTransientRetries > 4 ||
      !Number.isSafeInteger(this.#maxRetryDelayMs) ||
      this.#maxRetryDelayMs < 0 ||
      this.#maxRetryDelayMs > 30_000
    ) {
      throw new SandboxAdapterError(
        "INVALID_CONFIGURATION",
        "Sandbox timeout, polling, or retry configuration is out of bounds.",
      );
    }
    normalizePolicy(this.#defaultPolicy, undefined);
  }

  get readiness(): SandboxReadiness {
    return {
      integration: "nebius-token-factory-sandbox",
      status: "configured",
      tokenConfigured: true,
      projectConfigured: true,
      baseUrl: this.#baseUrl,
    };
  }

  async #request(url: string, init: RequestInit, metadata: RequestMetadata): Promise<Response> {
    const startedAt = this.#clock.now();
    if (init.signal?.aborted) {
      this.#emitTelemetry(metadata, null, "aborted", startedAt, null);
      throw new SandboxAdapterError("ABORTED", "Sandbox request was aborted.");
    }
    const timeoutController = new AbortController();
    const callerSignal = init.signal;
    const abortFromCaller = (): void => timeoutController.abort(callerSignal?.reason);
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    const timer = setTimeout(
      () => timeoutController.abort(new Error("request timeout")),
      this.#requestTimeoutMs,
    );
    try {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${this.#token}`);
      headers.set("Project", this.#project);
      if (!headers.has("Accept")) headers.set("Accept", "application/json");
      return await this.#fetch(url, {
        ...init,
        headers,
        redirect: "error",
        signal: timeoutController.signal,
      });
    } catch (error) {
      const aborted = timeoutController.signal.aborted || isAbortError(error);
      this.#emitTelemetry(metadata, null, aborted ? "aborted" : "error", startedAt, null);
      if (aborted) {
        throw new SandboxAdapterError(
          callerSignal?.aborted ? "ABORTED" : "TIMEOUT",
          callerSignal?.aborted ? "Sandbox request was aborted." : "Sandbox request timed out.",
          { cause: error, retriable: !callerSignal?.aborted },
        );
      }
      throw new SandboxAdapterError("HTTP_ERROR", "Sandbox request failed before a response.", {
        cause: error,
        retriable: true,
      });
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  }

  #emitTelemetry(
    metadata: RequestMetadata,
    response: Response | null,
    outcome: SandboxTelemetry["outcome"],
    startedAt: number,
    resources: SandboxOperation["resources"] | null,
  ): void {
    if (!this.#onTelemetry) return;
    this.#onTelemetry({
      integration: "nebius-token-factory-sandbox",
      method: metadata.method,
      endpoint: metadata.endpoint,
      requestId: response === null ? null : responseRequestId(response),
      operationId: metadata.operationId ?? null,
      httpStatus: response?.status ?? null,
      outcome,
      latencyMs: Math.max(0, this.#clock.now() - startedAt),
      retryCount: metadata.retryCount,
      recordedAt: new Date(this.#clock.now()).toISOString(),
      resources,
    });
  }

  async spawn(
    request: SandboxInstanceRequest,
    signal?: AbortSignal,
  ): Promise<SpawnedSandboxInstance> {
    const body = buildSpawnBody(request, this.#defaultPolicy);
    const metadata = { method: "POST", endpoint: "/instances", retryCount: 0 } as const;
    const startedAt = this.#clock.now();
    const response = await this.#request(
      `${this.#baseUrl}/instances`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        ...(signal === undefined ? {} : { signal }),
      },
      metadata,
    );
    if (response.status !== 201) {
      this.#emitTelemetry(
        metadata,
        response,
        transientStatus(response.status) ? "transient-error" : "error",
        startedAt,
        null,
      );
      const providerRequestId = responseRequestId(response);
      throw new SandboxAdapterError("HTTP_ERROR", "Sandbox rejected the spawn request.", {
        status: response.status,
        retriable: transientStatus(response.status),
        ...(providerRequestId === null ? {} : { requestId: providerRequestId }),
      });
    }
    const instance = parseSpawnResponse(
      await boundedJson(response),
      response.headers.get("location"),
      this.#baseUrl,
    );
    this.#emitTelemetry(
      { ...metadata, operationId: instance.operationId },
      response,
      "success",
      startedAt,
      null,
    );
    return instance;
  }

  async #operationResponse(
    operationId: string,
    signal?: AbortSignal,
  ): Promise<{ operation: SandboxOperation; retryAfterMs: number | null }> {
    assertUuid(operationId, "operationId");
    for (let retryCount = 0; ; retryCount += 1) {
      const metadata = {
        method: "GET",
        endpoint: "/operations/{operationId}",
        operationId,
        retryCount,
      } as const;
      const startedAt = this.#clock.now();
      const response = await this.#request(
        `${this.#baseUrl}/operations/${operationId}`,
        { method: "GET", ...(signal === undefined ? {} : { signal }) },
        metadata,
      );
      if (response.status === 200) {
        const operation = parseOperation(await boundedJson(response));
        if (operation.operationId !== operationId) {
          throw new SandboxAdapterError(
            "INVALID_RESPONSE",
            "Sandbox returned a different operation ID.",
          );
        }
        this.#emitTelemetry(metadata, response, "success", startedAt, operation.resources);
        return {
          operation,
          retryAfterMs: parseRetryAfter(
            response.headers.get("retry-after"),
            this.#clock.now(),
            this.#maxRetryDelayMs,
          ),
        };
      }
      const isTransient = transientStatus(response.status);
      this.#emitTelemetry(
        metadata,
        response,
        isTransient ? "transient-error" : "error",
        startedAt,
        null,
      );
      if (!isTransient || retryCount >= this.#maxTransientRetries) {
        const providerRequestId = responseRequestId(response);
        throw new SandboxAdapterError("HTTP_ERROR", "Sandbox operation status request failed.", {
          status: response.status,
          retriable: isTransient,
          ...(providerRequestId === null ? {} : { requestId: providerRequestId }),
        });
      }
      const retryAfter =
        parseRetryAfter(
          response.headers.get("retry-after"),
          this.#clock.now(),
          this.#maxRetryDelayMs,
        ) ?? Math.min(250 * 2 ** retryCount, this.#maxRetryDelayMs);
      await this.#clock.sleep(retryAfter, signal);
    }
  }

  async getOperation(operationId: string, signal?: AbortSignal): Promise<SandboxOperation> {
    return (await this.#operationResponse(operationId, signal)).operation;
  }

  async waitForOperation(
    operationId: string,
    options: WaitForOperationOptions = {},
  ): Promise<SandboxOperation> {
    const timeoutMs = options.timeoutMs ?? 900_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 3_600_000) {
      throw new SandboxAdapterError(
        "INVALID_REQUEST",
        "Sandbox operation timeout must be from 1 second through 1 hour.",
      );
    }
    const deadline = this.#clock.now() + timeoutMs;
    for (;;) {
      if (options.signal?.aborted) {
        throw new SandboxAdapterError("ABORTED", "Sandbox operation wait was aborted.");
      }
      const { operation, retryAfterMs } = await this.#operationResponse(
        operationId,
        options.signal,
      );
      if (
        SANDBOX_TERMINAL_STATUSES.includes(
          operation.status as (typeof SANDBOX_TERMINAL_STATUSES)[number],
        )
      ) {
        return operation;
      }
      const delay = retryAfterMs ?? this.#pollIntervalMs;
      if (this.#clock.now() + delay > deadline) {
        throw new SandboxAdapterError("TIMEOUT", "Sandbox operation exceeded its poll timeout.", {
          retriable: true,
        });
      }
      await this.#clock.sleep(delay, options.signal);
    }
  }

  async cancelOperation(operationId: string, signal?: AbortSignal): Promise<{ accepted: boolean }> {
    assertUuid(operationId, "operationId");
    const metadata = {
      method: "DELETE",
      endpoint: "/operations/{operationId}",
      operationId,
      retryCount: 0,
    } as const;
    const startedAt = this.#clock.now();
    const response = await this.#request(
      `${this.#baseUrl}/operations/${operationId}`,
      { method: "DELETE", ...(signal === undefined ? {} : { signal }) },
      metadata,
    );
    if (response.status === 202 || response.status === 409) {
      this.#emitTelemetry(metadata, response, "success", startedAt, null);
      return { accepted: response.status === 202 };
    }
    this.#emitTelemetry(
      metadata,
      response,
      transientStatus(response.status) ? "transient-error" : "error",
      startedAt,
      null,
    );
    const providerRequestId = responseRequestId(response);
    throw new SandboxAdapterError("HTTP_ERROR", "Sandbox cancellation request failed.", {
      status: response.status,
      retriable: transientStatus(response.status),
      ...(providerRequestId === null ? {} : { requestId: providerRequestId }),
    });
  }

  async streamOperationEvents(
    operationId: string,
    options: StreamOperationEventsOptions = {},
  ): Promise<readonly SandboxSseFrame[]> {
    assertUuid(operationId, "operationId");
    if (
      options.lastEventId !== undefined &&
      (!Number.isSafeInteger(options.lastEventId) || options.lastEventId < 0)
    ) {
      throw new SandboxAdapterError("INVALID_REQUEST", "lastEventId must be non-negative.");
    }
    if (
      options.spawnedProcessId !== undefined &&
      (!Number.isSafeInteger(options.spawnedProcessId) || options.spawnedProcessId < 0)
    ) {
      throw new SandboxAdapterError("INVALID_REQUEST", "spawnedProcessId must be non-negative.");
    }
    const url = new URL(`${this.#baseUrl}/operations/${operationId}/events`);
    url.searchParams.set("follow", options.follow ? "1" : "0");
    if (options.spawnedProcessId !== undefined) {
      url.searchParams.set("spid", String(options.spawnedProcessId));
    }
    const headers = new Headers({ Accept: "text/event-stream" });
    if (options.lastEventId !== undefined) {
      headers.set("Last-Event-Id", String(options.lastEventId));
    }
    const metadata = {
      method: "GET",
      endpoint: "/operations/{operationId}/events",
      operationId,
      retryCount: 0,
    } as const;
    const startedAt = this.#clock.now();
    const response = await this.#request(
      url.toString(),
      {
        method: "GET",
        headers,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
      metadata,
    );
    if (
      response.status !== 200 ||
      !response.headers.get("content-type")?.startsWith("text/event-stream")
    ) {
      this.#emitTelemetry(
        metadata,
        response,
        [410, 425, 429, 502, 504].includes(response.status) ? "transient-error" : "error",
        startedAt,
        null,
      );
      throw new SandboxAdapterError("HTTP_ERROR", "Sandbox event stream could not be opened.", {
        status: response.status,
        retriable: [410, 425, 429, 502, 504].includes(response.status),
      });
    }
    const frames = parseSandboxSse(await response.text());
    this.#emitTelemetry(metadata, response, "success", startedAt, null);
    return frames;
  }

  async createCheckpoint(
    request: SandboxCheckpointRequest,
    options: WaitForOperationOptions = {},
  ): Promise<SandboxCheckpoint> {
    const instance = await this.spawn(
      {
        ...request,
        policy: { networkingEnabled: true, ...request.policy },
      },
      options.signal,
    );
    const operation = await this.waitForOperation(instance.operationId, options);
    if (operation.status === "FAILED") {
      throw new SandboxAdapterError("OPERATION_FAILED", "Sandbox checkpoint operation failed.");
    }
    if (operation.status === "CANCELLED") {
      throw new SandboxAdapterError(
        "OPERATION_CANCELLED",
        "Sandbox checkpoint operation was cancelled.",
      );
    }
    if (operation.resultImageId === null) {
      throw new SandboxAdapterError(
        "INVALID_RESPONSE",
        "Successful checkpoint operation omitted result_image_uuid.",
      );
    }
    return {
      checkpointImageId: operation.resultImageId,
      sourceImageId: operation.sourceImageId ?? instance.sourceImageId,
      operationId: operation.operationId,
      createdAt: operation.createdAt,
      resources: operation.resources,
    };
  }

  async spawnBranches(
    checkpointImageId: string,
    branches: readonly SandboxBranchRequest[],
    signal?: AbortSignal,
  ): Promise<readonly SandboxBranch[]> {
    assertUuid(checkpointImageId, "checkpointImageId");
    if (branches.length < 1 || branches.length > 3) {
      throw new SandboxAdapterError("INVALID_REQUEST", "One through three branches are required.");
    }
    const candidateIds = branches.map((branch) => branch.candidateId);
    if (
      new Set(candidateIds).size !== candidateIds.length ||
      candidateIds.some((id) => !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u.test(id))
    ) {
      throw new SandboxAdapterError(
        "INVALID_REQUEST",
        "Branch candidate IDs must be safe and unique.",
      );
    }
    const spawned = await Promise.all(
      branches.map(async (branch): Promise<SandboxBranch> => {
        const { candidateId, policy, ...request } = branch;
        const instance = await this.spawn(
          {
            ...request,
            image: checkpointImageId,
            policy: { ...policy, networkingEnabled: false },
          },
          signal,
        );
        if (instance.sourceImageId !== checkpointImageId) {
          throw new SandboxAdapterError(
            "CHECKPOINT_INVARIANT",
            "A candidate branch was not spawned from the shared checkpoint.",
          );
        }
        return { candidateId, checkpointImageId, instance };
      }),
    );
    assertSameCheckpoint(spawned);
    return spawned;
  }
}

export function assertSameCheckpoint(branches: readonly SandboxBranch[]): string {
  if (branches.length === 0) {
    throw new SandboxAdapterError("CHECKPOINT_INVARIANT", "No Sandbox branches were supplied.");
  }
  const checkpoint = branches[0]?.checkpointImageId ?? "";
  if (
    branches.some(
      (branch) =>
        branch.checkpointImageId !== checkpoint ||
        branch.instance.sourceImageId !== checkpoint ||
        branch.instance.disposable !== false,
    )
  ) {
    throw new SandboxAdapterError(
      "CHECKPOINT_INVARIANT",
      "Sandbox candidate branches do not share one non-disposable checkpoint.",
    );
  }
  return checkpoint;
}

export function sandboxReadinessFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  baseUrl = DEFAULT_SANDBOX_BASE_URL,
): SandboxReadiness {
  const tokenConfigured = Boolean(environment.CONTREE_TOKEN?.trim());
  const projectConfigured = Boolean(
    environment.CONTREE_PROJECT?.trim() ?? environment.NEBIUS_AI_PROJECT?.trim(),
  );
  return {
    integration: "nebius-token-factory-sandbox",
    status: tokenConfigured && projectConfigured ? "configured" : "unconfigured",
    tokenConfigured,
    projectConfigured,
    baseUrl: normalizeBaseUrl(baseUrl),
  };
}

export function createSandboxClientFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  options: Omit<SandboxClientOptions, "iamToken" | "projectId"> = {},
): TokenFactorySandboxClient {
  const iamToken = environment.CONTREE_TOKEN;
  const projectId = environment.CONTREE_PROJECT ?? environment.NEBIUS_AI_PROJECT;
  if (!iamToken?.trim() || !projectId?.trim()) {
    throw new SandboxAdapterError(
      "INVALID_CONFIGURATION",
      "Sandbox IAM token and project ID are required for live execution.",
    );
  }
  return new TokenFactorySandboxClient({ ...options, iamToken, projectId });
}

/** Narrows arbitrary test fixtures through the same Zod JSON boundary used by live responses. */
export function validateSandboxContractFixture(value: unknown): JsonValue {
  return parseJsonValue(value, "Sandbox contract fixture");
}
