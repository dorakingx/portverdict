import { EvidenceStoreError } from "./errors";
import type { JsonValue } from "./hash";

export const REDACTION_VERSION = "1" as const;
export const REDACTED_VALUE = "[REDACTED]" as const;

export type RedactionResult<T extends JsonValue = JsonValue> = {
  value: T;
  findings: number;
  redacted: boolean;
  redactionVersion: typeof REDACTION_VERSION;
};

const SECRET_KEY =
  /(?:^|[-_])(?:api[-_]?key|authorization|auth[-_]?token|access[-_]?token|refresh[-_]?token|bearer|client[-_]?secret|cookie|password|passwd|private[-_]?key|secret|session[-_]?token|token)$|(?:ApiKey|Authorization|AuthToken|AccessToken|RefreshToken|ClientSecret|Password|PrivateKey|SessionToken)$/iu;

const TEXT_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/giu, `Bearer ${REDACTED_VALUE}`],
  [/\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gu, REDACTED_VALUE],
  [/\b(?:sk|pk)-(?:live|test|proj)-[A-Za-z0-9_-]{12,}\b/gu, REDACTED_VALUE],
  [
    /\b([A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|PASSWORD|SECRET|PRIVATE_KEY))\s*=\s*([^\s,;]+)/gu,
    `$1=${REDACTED_VALUE}`,
  ],
  [/https:\/\/([^\s:/@]+):([^\s/@]+)@/giu, `https://${REDACTED_VALUE}:${REDACTED_VALUE}@`],
  [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu,
    REDACTED_VALUE,
  ],
];

export function redactText(input: string): RedactionResult<string> {
  let value = input;
  let findings = 0;

  for (const [pattern, replacement] of TEXT_PATTERNS) {
    pattern.lastIndex = 0;
    findings += value.match(pattern)?.length ?? 0;
    pattern.lastIndex = 0;
    value = value.replace(pattern, replacement);
  }

  return {
    value,
    findings,
    redacted: findings > 0,
    redactionVersion: REDACTION_VERSION,
  };
}

export function redactForPersistence<T extends JsonValue>(input: T): RedactionResult<T> {
  const seen = new Set<object>();
  let findings = 0;

  function visit(value: unknown, location: string): JsonValue {
    if (value === null || typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new EvidenceStoreError(
          "SERIALIZATION_FAILURE",
          `${location} contains a non-finite number`,
        );
      }
      return value;
    }

    if (typeof value === "string") {
      const result = redactText(value);
      findings += result.findings;
      return result.value;
    }

    if (typeof value !== "object") {
      throw new EvidenceStoreError(
        "SERIALIZATION_FAILURE",
        `${location} contains a non-JSON ${typeof value}`,
      );
    }

    if (seen.has(value)) {
      throw new EvidenceStoreError("SERIALIZATION_FAILURE", `${location} contains a cycle`);
    }

    seen.add(value);
    try {
      if (Array.isArray(value)) {
        return value.map((item, index) => visit(item, `${location}[${index}]`));
      }

      const prototype = Object.getPrototypeOf(value) as object | null;
      if (prototype !== Object.prototype && prototype !== null) {
        throw new EvidenceStoreError(
          "SERIALIZATION_FAILURE",
          `${location} must be a plain JSON object`,
        );
      }

      const result: Record<string, JsonValue> = {};
      for (const [key, item] of Object.entries(value)) {
        if (SECRET_KEY.test(key)) {
          result[key] = REDACTED_VALUE;
          findings += 1;
        } else {
          result[key] = visit(item, `${location}.${key}`);
        }
      }
      return result;
    } finally {
      seen.delete(value);
    }
  }

  return {
    value: visit(input, "value") as T,
    findings,
    redacted: findings > 0,
    redactionVersion: REDACTION_VERSION,
  };
}
