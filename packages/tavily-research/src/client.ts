import { isAbortError } from "./errors.js";
import { TavilyAdapterError } from "./errors.js";
import type {
  TavilyClock,
  TavilyReadiness,
  TavilyResearchClientOptions,
  TavilyResearchResult,
  TavilyTelemetry,
} from "./types.js";
import { DEFAULT_TAVILY_BASE_URL } from "./types.js";
import {
  filterOfficialSearchResults,
  normalizeAllowedHosts,
  parseRetryAfterHeader,
  parseTavilyExtractResponse,
  parseTavilySearchResponse,
  sha256Text,
  validateAllowedSourceUrl,
  validateResearchQuery,
} from "./validation.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_RETRY_DELAY_MS = 5_000;
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MAX_EXTRACT_URLS = 3;
const DEFAULT_MINIMUM_SCORE = 0.25;
const MAX_SEARCH_RESPONSE_BYTES = 2_000_000;
const MAX_EXTRACT_RESPONSE_BYTES = 6_000_000;

const defaultClock: TavilyClock = {
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

function validateApiKey(value: string): string {
  const apiKey = value.trim();
  if (apiKey.length < 8 || apiKey.length > 8_192 || /[\r\n\s]/u.test(apiKey)) {
    throw new TavilyAdapterError(
      "INVALID_CONFIGURATION",
      "Tavily API key is not configured safely.",
    );
  }
  return apiKey;
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new TavilyAdapterError("INVALID_CONFIGURATION", "Tavily base URL is invalid.", {
      cause: error,
    });
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.replace(/\/+$/u, "") !== ""
  ) {
    throw new TavilyAdapterError(
      "INVALID_CONFIGURATION",
      "Tavily base URL must be a credential-free HTTPS origin.",
    );
  }
  return url.origin;
}

function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
}

function requestId(response: Response): string | null {
  const value = response.headers.get("x-request-id") ?? response.headers.get("request-id");
  return value === null ? null : value.slice(0, 256);
}

async function boundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new TavilyAdapterError("INVALID_RESPONSE", "Tavily response is oversized.");
  }
  const text = await response.text();
  if (text.length === 0 || text.length > maximumBytes) {
    throw new TavilyAdapterError("INVALID_RESPONSE", "Tavily response is empty or oversized.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new TavilyAdapterError("INVALID_RESPONSE", "Tavily response is not JSON.", {
      cause: error,
    });
  }
}

type Endpoint = "/search" | "/extract";

export class TavilyResearchClient {
  readonly #apiKey: string;
  readonly #allowedHosts: readonly string[];
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #clock: TavilyClock;
  readonly #requestTimeoutMs: number;
  readonly #maxRetries: number;
  readonly #maxRetryDelayMs: number;
  readonly #maxResults: number;
  readonly #maxExtractUrls: number;
  readonly #minimumScore: number;
  readonly #onTelemetry: ((telemetry: TavilyTelemetry) => void) | undefined;

  constructor(options: TavilyResearchClientOptions) {
    this.#apiKey = validateApiKey(options.apiKey);
    this.#allowedHosts = normalizeAllowedHosts(options.allowedHosts);
    this.#baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_TAVILY_BASE_URL);
    this.#fetch = options.fetch ?? fetch;
    this.#clock = options.clock ?? defaultClock;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.#maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
    this.#maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
    this.#maxExtractUrls = options.maxExtractUrls ?? DEFAULT_MAX_EXTRACT_URLS;
    this.#minimumScore = options.minimumScore ?? DEFAULT_MINIMUM_SCORE;
    this.#onTelemetry = options.onTelemetry;

    if (
      !Number.isSafeInteger(this.#requestTimeoutMs) ||
      this.#requestTimeoutMs < 1_000 ||
      this.#requestTimeoutMs > 120_000 ||
      !Number.isSafeInteger(this.#maxRetries) ||
      this.#maxRetries < 0 ||
      this.#maxRetries > 3 ||
      !Number.isSafeInteger(this.#maxRetryDelayMs) ||
      this.#maxRetryDelayMs < 0 ||
      this.#maxRetryDelayMs > 30_000 ||
      !Number.isSafeInteger(this.#maxResults) ||
      this.#maxResults < 1 ||
      this.#maxResults > 5 ||
      !Number.isSafeInteger(this.#maxExtractUrls) ||
      this.#maxExtractUrls < 1 ||
      this.#maxExtractUrls > 3 ||
      !Number.isFinite(this.#minimumScore) ||
      this.#minimumScore < 0 ||
      this.#minimumScore > 1
    ) {
      throw new TavilyAdapterError(
        "INVALID_CONFIGURATION",
        "Tavily timeout, retry, result, or score configuration is out of bounds.",
      );
    }
  }

  get readiness(): TavilyReadiness {
    return {
      integration: "tavily",
      status: "configured",
      apiKeyConfigured: true,
      allowlistConfigured: true,
      allowedHosts: this.#allowedHosts,
      baseUrl: this.#baseUrl,
    };
  }

  #emit(
    endpoint: Endpoint,
    response: Response | null,
    outcome: TavilyTelemetry["outcome"],
    startedAt: number,
    retryCount: number,
    credits: number | null,
    sources: TavilyTelemetry["sources"],
  ): void {
    this.#onTelemetry?.({
      integration: "tavily",
      endpoint,
      requestId: response === null ? null : requestId(response),
      httpStatus: response?.status ?? null,
      outcome,
      credits,
      latencyMs: Math.max(0, this.#clock.now() - startedAt),
      retryCount,
      recordedAt: new Date(this.#clock.now()).toISOString(),
      sources,
    });
  }

  async #post(
    endpoint: Endpoint,
    body: object,
    maximumBytes: number,
    signal?: AbortSignal,
  ): Promise<{ json: unknown; response: Response; retryCount: number; startedAt: number }> {
    const startedAt = this.#clock.now();
    if (signal?.aborted) {
      this.#emit(endpoint, null, "aborted", startedAt, 0, null, []);
      throw new TavilyAdapterError("ABORTED", "Tavily request was aborted.");
    }
    for (let retryCount = 0; ; retryCount += 1) {
      const timeoutController = new AbortController();
      const abortFromCaller = (): void => timeoutController.abort(signal?.reason);
      signal?.addEventListener("abort", abortFromCaller, { once: true });
      const timer = setTimeout(
        () => timeoutController.abort(new Error("request timeout")),
        this.#requestTimeoutMs,
      );
      let response: Response;
      try {
        response = await this.#fetch(`${this.#baseUrl}${endpoint}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.#apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          redirect: "error",
          signal: timeoutController.signal,
        });
      } catch (error) {
        const aborted = timeoutController.signal.aborted || isAbortError(error);
        this.#emit(endpoint, null, aborted ? "aborted" : "error", startedAt, retryCount, null, []);
        if (aborted) {
          throw new TavilyAdapterError(
            signal?.aborted ? "ABORTED" : "TIMEOUT",
            signal?.aborted ? "Tavily request was aborted." : "Tavily request timed out.",
            { cause: error, retriable: !signal?.aborted },
          );
        }
        throw new TavilyAdapterError("HTTP_ERROR", "Tavily request failed before a response.", {
          cause: error,
          retriable: true,
        });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abortFromCaller);
      }

      if (response.ok) {
        return {
          json: await boundedJson(response, maximumBytes),
          response,
          retryCount,
          startedAt,
        };
      }

      const transient = isTransient(response.status);
      this.#emit(
        endpoint,
        response,
        transient ? "transient-error" : "error",
        startedAt,
        retryCount,
        null,
        [],
      );
      if (!transient || retryCount >= this.#maxRetries) {
        const providerRequestId = requestId(response);
        throw new TavilyAdapterError("HTTP_ERROR", "Tavily rejected the request.", {
          status: response.status,
          retriable: transient,
          ...(providerRequestId === null ? {} : { requestId: providerRequestId }),
        });
      }
      const delay =
        parseRetryAfterHeader(
          response.headers.get("retry-after"),
          this.#clock.now(),
          this.#maxRetryDelayMs,
        ) ?? Math.min(250 * 2 ** retryCount, this.#maxRetryDelayMs);
      await this.#clock.sleep(delay, signal);
    }
  }

  async research(queryValue: string, signal?: AbortSignal): Promise<TavilyResearchResult> {
    const query = validateResearchQuery(queryValue);
    const searchCall = await this.#post(
      "/search",
      {
        query,
        search_depth: "basic",
        max_results: this.#maxResults,
        include_usage: true,
        include_raw_content: false,
        include_answer: false,
        include_images: false,
        include_domains: this.#allowedHosts,
      },
      MAX_SEARCH_RESPONSE_BYTES,
      signal,
    );
    const search = parseTavilySearchResponse(searchCall.json);
    const officialResults = filterOfficialSearchResults(
      search.results,
      this.#allowedHosts,
      this.#minimumScore,
      this.#maxExtractUrls,
    );
    this.#emit(
      "/search",
      searchCall.response,
      "success",
      searchCall.startedAt,
      searchCall.retryCount,
      search.credits,
      officialResults.map(({ url, title, score, content }) => ({
        url,
        title,
        score,
        contentSha256: sha256Text(content),
      })),
    );

    const nowIso = new Date(this.#clock.now()).toISOString();
    if (officialResults.length === 0) {
      return {
        query,
        sources: [],
        failedUrls: [],
        searchRequestId: search.requestId,
        extractRequestId: null,
        credits: search.credits,
        completedAt: nowIso,
      };
    }

    const selectedUrls = officialResults.map((result) => result.url);
    const extractCall = await this.#post(
      "/extract",
      {
        urls: selectedUrls,
        extract_depth: "basic",
        query,
        chunks_per_source: 3,
        include_usage: true,
      },
      MAX_EXTRACT_RESPONSE_BYTES,
      signal,
    );
    const extract = parseTavilyExtractResponse(extractCall.json);
    const selectedSet = new Set(selectedUrls);
    const metadataByUrl = new Map(officialResults.map((result) => [result.url, result]));
    const sources = extract.results.map((result) => {
      const url = validateAllowedSourceUrl(result.url, this.#allowedHosts);
      if (!selectedSet.has(url)) {
        throw new TavilyAdapterError(
          "UNSAFE_SOURCE",
          "Tavily extract returned a source that was not selected from search.",
        );
      }
      const metadata = metadataByUrl.get(url);
      if (metadata === undefined) {
        throw new TavilyAdapterError("INVALID_RESPONSE", "Tavily source metadata is missing.");
      }
      return {
        url,
        title: metadata.title,
        score: metadata.score,
        content: result.rawContent,
        contentSha256: sha256Text(result.rawContent),
        requestId: extract.requestId,
        retrievedAt: nowIso,
        trust: "untrusted-external-content" as const,
      };
    });
    const failedUrls = extract.failedResults.map((failure) => {
      const url = validateAllowedSourceUrl(failure.url, this.#allowedHosts);
      if (!selectedSet.has(url)) {
        throw new TavilyAdapterError(
          "UNSAFE_SOURCE",
          "Tavily extract failure referenced an unselected source.",
        );
      }
      return url;
    });
    this.#emit(
      "/extract",
      extractCall.response,
      "success",
      extractCall.startedAt,
      extractCall.retryCount,
      extract.credits,
      sources.map(({ url, title, score, contentSha256 }) => ({
        url,
        title,
        score,
        contentSha256,
      })),
    );
    return {
      query,
      sources,
      failedUrls,
      searchRequestId: search.requestId,
      extractRequestId: extract.requestId,
      credits: search.credits + extract.credits,
      completedAt: nowIso,
    };
  }
}

export function tavilyReadinessFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  allowedHosts: readonly string[],
  baseUrl = DEFAULT_TAVILY_BASE_URL,
): TavilyReadiness {
  const apiKeyConfigured = Boolean(environment.TAVILY_API_KEY?.trim());
  let normalizedHosts: readonly string[] = [];
  try {
    normalizedHosts = normalizeAllowedHosts(allowedHosts);
  } catch {
    normalizedHosts = [];
  }
  return {
    integration: "tavily",
    status: apiKeyConfigured && normalizedHosts.length > 0 ? "configured" : "unconfigured",
    apiKeyConfigured,
    allowlistConfigured: normalizedHosts.length > 0,
    allowedHosts: normalizedHosts,
    baseUrl: normalizeBaseUrl(baseUrl),
  };
}

export function createTavilyClientFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  options: Omit<TavilyResearchClientOptions, "apiKey">,
): TavilyResearchClient {
  const apiKey = environment.TAVILY_API_KEY;
  if (!apiKey?.trim()) {
    throw new TavilyAdapterError(
      "INVALID_CONFIGURATION",
      "Tavily API key is required for live research.",
    );
  }
  return new TavilyResearchClient({ ...options, apiKey });
}
