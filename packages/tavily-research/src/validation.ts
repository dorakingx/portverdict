import { createHash } from "node:crypto";

import { JsonValueSchema, type JsonValue } from "@portverdict/shared-schemas";

import { TavilyAdapterError } from "./errors.js";
import type { TavilyExtractResponse, TavilySearchResponse, TavilySearchResult } from "./types.js";

const HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;
const SECRET_TEXT_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/iu,
  /\b(?:tvly|sk|pk)-(?:live-|test-|proj-)?[A-Za-z0-9_-]{12,}\b/iu,
  /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/iu,
  /\b[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|PASSWORD|SECRET)\s*=\s*\S+/u,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
] as const;

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new TavilyAdapterError("INVALID_RESPONSE", message);
}

function boundedString(
  value: JsonValue | undefined,
  label: string,
  maximum: number,
  allowEmpty = false,
): string {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.trim().length === 0) ||
    value.length > maximum
  ) {
    return invalid(`Tavily response ${label} is invalid.`);
  }
  return value;
}

function nonNegativeNumber(value: JsonValue | undefined, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return invalid(`Tavily response ${label} must be non-negative.`);
  }
  return value;
}

function parseUsage(value: JsonValue | undefined): number {
  if (!isRecord(value)) return invalid("Tavily response usage is missing.");
  return nonNegativeNumber(value.credits, "usage.credits");
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeAllowedHosts(hosts: readonly string[]): readonly string[] {
  if (hosts.length < 1 || hosts.length > 20) {
    throw new TavilyAdapterError(
      "INVALID_CONFIGURATION",
      "Tavily requires one through twenty exact official hosts.",
    );
  }
  const normalized = hosts.map((host) => host.trim().toLowerCase().replace(/\.$/u, ""));
  if (
    normalized.some(
      (host) =>
        !HOST_PATTERN.test(host) ||
        host.includes("*") ||
        host === "localhost" ||
        /^\d+(?:\.\d+){3}$/u.test(host),
    )
  ) {
    throw new TavilyAdapterError(
      "INVALID_CONFIGURATION",
      "Tavily allowlist entries must be exact public DNS hostnames.",
    );
  }
  return Object.freeze([...new Set(normalized)].sort());
}

export function validateResearchQuery(value: string): string {
  const query = value.trim();
  if (query.length < 3 || query.length > 500 || query.includes("\0")) {
    throw new TavilyAdapterError(
      "INVALID_QUERY",
      "Tavily query must contain 3 through 500 safe characters.",
    );
  }
  if (SECRET_TEXT_PATTERNS.some((pattern) => pattern.test(query))) {
    throw new TavilyAdapterError(
      "INVALID_QUERY",
      "Tavily query appears to contain credential material.",
    );
  }
  return query;
}

export function validateAllowedSourceUrl(value: string, allowedHosts: readonly string[]): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new TavilyAdapterError("UNSAFE_SOURCE", "Tavily returned an invalid source URL.", {
      cause: error,
    });
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port !== "" && url.port !== "443") ||
    !allowedHosts.includes(url.hostname.toLowerCase())
  ) {
    throw new TavilyAdapterError(
      "UNSAFE_SOURCE",
      "Tavily source is outside the exact HTTPS allowlist.",
    );
  }
  url.hash = "";
  return url.toString();
}

export function parseTavilySearchResponse(value: unknown): TavilySearchResponse {
  const validated = JsonValueSchema.safeParse(value);
  if (!validated.success || !isRecord(validated.data)) {
    return invalid("Tavily search response is not valid JSON object data.");
  }
  const response = validated.data;
  if (!Array.isArray(response.results) || response.results.length > 20) {
    return invalid("Tavily search results are missing or oversized.");
  }
  const results: TavilySearchResult[] = response.results.map((raw, index) => {
    if (!isRecord(raw)) return invalid(`Tavily search result ${index} is not an object.`);
    const score = nonNegativeNumber(raw.score, `results[${index}].score`);
    if (score > 1) return invalid(`Tavily search result ${index} score exceeds one.`);
    return {
      title: boundedString(raw.title, `results[${index}].title`, 1_000),
      url: boundedString(raw.url, `results[${index}].url`, 2_048),
      content: boundedString(raw.content, `results[${index}].content`, 25_000, true),
      score,
    };
  });
  return {
    query: boundedString(response.query, "query", 1_000),
    results,
    responseTimeSeconds: nonNegativeNumber(response.response_time, "response_time"),
    credits: parseUsage(response.usage),
    requestId: boundedString(response.request_id, "request_id", 256),
  };
}

export function parseTavilyExtractResponse(value: unknown): TavilyExtractResponse {
  const validated = JsonValueSchema.safeParse(value);
  if (!validated.success || !isRecord(validated.data)) {
    return invalid("Tavily extract response is not valid JSON object data.");
  }
  const response = validated.data;
  if (
    !Array.isArray(response.results) ||
    response.results.length > 3 ||
    !Array.isArray(response.failed_results) ||
    response.failed_results.length > 3
  ) {
    return invalid("Tavily extract result arrays are missing or oversized.");
  }
  const results = response.results.map((raw, index) => {
    if (!isRecord(raw)) return invalid(`Tavily extract result ${index} is not an object.`);
    return {
      url: boundedString(raw.url, `results[${index}].url`, 2_048),
      rawContent: boundedString(raw.raw_content, `results[${index}].raw_content`, 100_000, true),
    };
  });
  const failedResults = response.failed_results.map((raw, index) => {
    if (!isRecord(raw)) return invalid(`Tavily failed result ${index} is not an object.`);
    return {
      url: boundedString(raw.url, `failed_results[${index}].url`, 2_048),
      error: boundedString(raw.error, `failed_results[${index}].error`, 2_000),
    };
  });
  return {
    results,
    failedResults,
    responseTimeSeconds: nonNegativeNumber(response.response_time, "response_time"),
    credits: parseUsage(response.usage),
    requestId: boundedString(response.request_id, "request_id", 256),
  };
}

export function filterOfficialSearchResults(
  results: readonly TavilySearchResult[],
  allowedHosts: readonly string[],
  minimumScore: number,
  limit: number,
): readonly TavilySearchResult[] {
  const accepted: TavilySearchResult[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    if (result.score < minimumScore) continue;
    let url: string;
    try {
      url = validateAllowedSourceUrl(result.url, allowedHosts);
    } catch (error) {
      if (error instanceof TavilyAdapterError && error.code === "UNSAFE_SOURCE") continue;
      throw error;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    accepted.push({ ...result, url });
    if (accepted.length === limit) break;
  }
  return accepted;
}

export function parseRetryAfterHeader(
  value: string | null,
  nowMs: number,
  maximumMs: number,
): number | null {
  if (value === null) return null;
  const seconds = Number(value);
  const delay =
    Number.isFinite(seconds) && seconds >= 0
      ? Math.ceil(seconds * 1_000)
      : Math.max(0, Date.parse(value) - nowMs);
  if (!Number.isFinite(delay)) return null;
  return Math.min(delay, maximumMs);
}
