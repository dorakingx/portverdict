import { createHash } from "node:crypto";

import type { JsonValue as SharedJsonValue } from "@portverdict/shared-schemas";

import { EvidenceStoreError } from "./errors";

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = SharedJsonValue;

export function assertJsonValue(
  value: unknown,
  location = "value",
  seen = new Set<object>(),
): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new EvidenceStoreError(
        "SERIALIZATION_FAILURE",
        `${location} contains a non-finite number`,
      );
    }
    return;
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
      for (const [index, item] of value.entries()) {
        assertJsonValue(item, `${location}[${index}]`, seen);
      }
      return;
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new EvidenceStoreError(
        "SERIALIZATION_FAILURE",
        `${location} must be a plain JSON object`,
      );
    }

    for (const [key, item] of Object.entries(value)) {
      assertJsonValue(item, `${location}.${key}`, seen);
    }
  } finally {
    seen.delete(value);
  }
}

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key] as JsonValue)]),
    );
  }

  return value;
}

export function canonicalJson(value: unknown): string {
  assertJsonValue(value);
  return JSON.stringify(canonicalize(value));
}

export function sha256Bytes(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256CanonicalJson(value: unknown): string {
  return sha256Bytes(canonicalJson(value));
}

export function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}
