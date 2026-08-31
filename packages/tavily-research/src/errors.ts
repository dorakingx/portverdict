export type TavilyErrorCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_QUERY"
  | "INVALID_RESPONSE"
  | "UNSAFE_SOURCE"
  | "UNSAFE_REDIRECT"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "ABORTED";

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export class TavilyAdapterError extends Error {
  readonly code: TavilyErrorCode;
  readonly status: number | null;
  readonly retriable: boolean;
  readonly requestId: string | null;
  override readonly cause?: unknown;

  constructor(
    code: TavilyErrorCode,
    message: string,
    options: {
      status?: number;
      retriable?: boolean;
      requestId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "TavilyAdapterError";
    this.code = code;
    this.status = options.status ?? null;
    this.retriable = options.retriable ?? false;
    this.requestId = options.requestId ?? null;
    this.cause = options.cause;
  }
}
