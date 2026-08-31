export type SandboxErrorCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_REQUEST"
  | "INVALID_RESPONSE"
  | "UNSAFE_LOCATION"
  | "HTTP_ERROR"
  | "OPERATION_FAILED"
  | "OPERATION_CANCELLED"
  | "TIMEOUT"
  | "ABORTED"
  | "CHECKPOINT_INVARIANT";

export class SandboxAdapterError extends Error {
  readonly code: SandboxErrorCode;
  readonly status: number | null;
  readonly retriable: boolean;
  readonly requestId: string | null;
  override readonly cause?: unknown;

  constructor(
    code: SandboxErrorCode,
    message: string,
    options: {
      status?: number;
      retriable?: boolean;
      requestId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "SandboxAdapterError";
    this.code = code;
    this.status = options.status ?? null;
    this.retriable = options.retriable ?? false;
    this.requestId = options.requestId ?? null;
    this.cause = options.cause;
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
