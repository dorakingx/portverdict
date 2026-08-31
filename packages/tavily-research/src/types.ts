export const DEFAULT_TAVILY_BASE_URL = "https://api.tavily.com" as const;

export type TavilyClock = {
  now: () => number;
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
};

export type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  score: number;
};

export type TavilySearchResponse = {
  query: string;
  results: readonly TavilySearchResult[];
  responseTimeSeconds: number;
  credits: number;
  requestId: string;
};

export type TavilyExtractResult = {
  url: string;
  rawContent: string;
};

export type TavilyExtractFailure = {
  url: string;
  error: string;
};

export type TavilyExtractResponse = {
  results: readonly TavilyExtractResult[];
  failedResults: readonly TavilyExtractFailure[];
  responseTimeSeconds: number;
  credits: number;
  requestId: string;
};

export type TavilyResearchSource = {
  url: string;
  title: string;
  score: number;
  content: string;
  contentSha256: string;
  requestId: string;
  retrievedAt: string;
  trust: "untrusted-external-content";
};

export type TavilyResearchResult = {
  query: string;
  sources: readonly TavilyResearchSource[];
  failedUrls: readonly string[];
  searchRequestId: string;
  extractRequestId: string | null;
  credits: number;
  completedAt: string;
};

export type TavilyTelemetrySource = {
  url: string;
  title: string;
  score: number;
  contentSha256: string;
};

export type TavilyTelemetry = {
  integration: "tavily";
  endpoint: "/search" | "/extract";
  requestId: string | null;
  httpStatus: number | null;
  outcome: "success" | "transient-error" | "error" | "aborted";
  credits: number | null;
  latencyMs: number;
  retryCount: number;
  recordedAt: string;
  sources: readonly TavilyTelemetrySource[];
};

export type TavilyReadiness = {
  integration: "tavily";
  status: "configured" | "unconfigured";
  apiKeyConfigured: boolean;
  allowlistConfigured: boolean;
  allowedHosts: readonly string[];
  baseUrl: string;
};

export type TavilyResearchClientOptions = {
  apiKey: string;
  allowedHosts: readonly string[];
  baseUrl?: string;
  fetch?: typeof fetch;
  clock?: TavilyClock;
  requestTimeoutMs?: number;
  maxRetries?: number;
  maxRetryDelayMs?: number;
  maxResults?: number;
  maxExtractUrls?: number;
  minimumScore?: number;
  onTelemetry?: (telemetry: TavilyTelemetry) => void;
};
