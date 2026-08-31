export type EvidenceStoreErrorCode =
  | "INVALID_IDENTIFIER"
  | "INVALID_PATH"
  | "INVALID_EVENT"
  | "INVALID_MANIFEST"
  | "INTEGRITY_FAILURE"
  | "SERIALIZATION_FAILURE"
  | "NOT_FOUND";

export class EvidenceStoreError extends Error {
  readonly code: EvidenceStoreErrorCode;
  override readonly cause?: unknown;

  constructor(code: EvidenceStoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "EvidenceStoreError";
    this.code = code;
    this.cause = options?.cause;
  }
}

export class EvidenceIntegrityError extends EvidenceStoreError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("INTEGRITY_FAILURE", message, options);
    this.name = "EvidenceIntegrityError";
  }
}

export class EvidencePathError extends EvidenceStoreError {
  constructor(message: string) {
    super("INVALID_PATH", message);
    this.name = "EvidencePathError";
  }
}
