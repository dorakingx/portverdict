import { JsonValueSchema, type JsonValue } from "@portverdict/shared-schemas";

import { SandboxAdapterError } from "./errors.js";
import type {
  SandboxInstanceRequest,
  SandboxOperation,
  SandboxOperationStatus,
  SandboxResourcePolicy,
  SpawnedSandboxInstance,
} from "./types.js";

export const DEFAULT_SANDBOX_POLICY: Readonly<SandboxResourcePolicy> = Object.freeze({
  timeoutSeconds: 600,
  outputLimitBytes: 1_048_576,
  maxLayerBytes: 1_073_741_824,
  networkingEnabled: false,
  uid: 1_000,
  gid: 1_000,
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ENVIRONMENT_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u;
const STATUSES = new Set<SandboxOperationStatus>([
  "PENDING",
  "ASSIGNED",
  "EXECUTING",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
]);

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new SandboxAdapterError("INVALID_RESPONSE", message);
}

function nullableNumber(value: JsonValue | undefined, label: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return invalid(`Sandbox response ${label} must be a non-negative number or null.`);
  }
  return value;
}

function nullableInteger(value: JsonValue | undefined, label: string): number | null {
  const parsed = nullableNumber(value, label);
  if (parsed !== null && !Number.isSafeInteger(parsed)) {
    return invalid(`Sandbox response ${label} must be a safe integer.`);
  }
  return parsed;
}

function nullableUuid(value: JsonValue | undefined, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    return invalid(`Sandbox response ${label} must be a UUID or null.`);
  }
  return value;
}

export function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new SandboxAdapterError("INVALID_REQUEST", `${label} must be a UUID.`);
  }
}

export function parseJsonValue(value: unknown, label: string): JsonValue {
  const parsed = JsonValueSchema.safeParse(value);
  if (!parsed.success) {
    throw new SandboxAdapterError("INVALID_RESPONSE", `${label} is not valid bounded JSON.`);
  }
  return parsed.data;
}

export function normalizePolicy(
  defaults: Partial<SandboxResourcePolicy> | undefined,
  overrides: Partial<SandboxResourcePolicy> | undefined,
): SandboxResourcePolicy {
  const policy = { ...DEFAULT_SANDBOX_POLICY, ...defaults, ...overrides };
  const wholeWithin = (value: number, minimum: number, maximum: number): boolean =>
    Number.isSafeInteger(value) && value >= minimum && value <= maximum;

  if (!wholeWithin(policy.timeoutSeconds, 1, 3_600)) {
    throw new SandboxAdapterError(
      "INVALID_REQUEST",
      "Sandbox timeoutSeconds must be an integer from 1 through 3600.",
    );
  }
  if (!wholeWithin(policy.outputLimitBytes, 1, 10_485_760)) {
    throw new SandboxAdapterError(
      "INVALID_REQUEST",
      "Sandbox outputLimitBytes must be an integer from 1 through 10485760.",
    );
  }
  if (!wholeWithin(policy.maxLayerBytes, 1_048_576, 10_737_418_240)) {
    throw new SandboxAdapterError(
      "INVALID_REQUEST",
      "Sandbox maxLayerBytes must be bounded between 1 MiB and 10 GiB.",
    );
  }
  if (
    !wholeWithin(policy.uid, 1, 65_535) ||
    !wholeWithin(policy.gid, 1, 65_535) ||
    typeof policy.networkingEnabled !== "boolean"
  ) {
    throw new SandboxAdapterError(
      "INVALID_REQUEST",
      "Sandbox execution must use a bounded non-root UID/GID and explicit network policy.",
    );
  }
  return policy;
}

export function buildSpawnBody(
  request: SandboxInstanceRequest,
  defaults?: Partial<SandboxResourcePolicy>,
): Record<string, JsonValue> {
  const command = request.command.trim();
  const image = request.image.trim();
  if (command.length === 0 || command.length > 8_192) {
    throw new SandboxAdapterError(
      "INVALID_REQUEST",
      "Sandbox command must contain 1 through 8192 characters.",
    );
  }
  if (image.length === 0 || image.length > 512 || /[\r\n]/u.test(image)) {
    throw new SandboxAdapterError("INVALID_REQUEST", "Sandbox image reference is invalid.");
  }
  const args = request.args ?? [];
  if (
    args.length > 64 ||
    args.some((argument) => argument.length > 4_096 || /\0/u.test(argument))
  ) {
    throw new SandboxAdapterError("INVALID_REQUEST", "Sandbox arguments exceed safe bounds.");
  }
  const cwd = request.cwd ?? "/workspace";
  if (cwd !== "" && (!cwd.startsWith("/") || cwd.length > 1_024 || cwd.includes("\0"))) {
    throw new SandboxAdapterError(
      "INVALID_REQUEST",
      "Sandbox cwd must be empty or a bounded absolute path.",
    );
  }
  const env = request.env ?? {};
  if (
    Object.keys(env).length > 128 ||
    Object.entries(env).some(
      ([key, value]) => !ENVIRONMENT_KEY.test(key) || value.length > 16_384 || value.includes("\0"),
    )
  ) {
    throw new SandboxAdapterError(
      "INVALID_REQUEST",
      "Sandbox environment contains an invalid key or oversized value.",
    );
  }

  const policy = normalizePolicy(defaults, request.policy);
  return {
    command,
    image,
    args: [...args],
    shell: request.shell ?? false,
    env: { ...env },
    preserve_env: request.preserveEnv ?? false,
    cwd,
    uid: policy.uid,
    gid: policy.gid,
    resources_limits: { max_layer_bytes: policy.maxLayerBytes },
    networking: { enabled: policy.networkingEnabled },
    timeout: policy.timeoutSeconds,
    truncate_output_at: policy.outputLimitBytes,
    disposable: false,
  };
}

export function resolveOperationLocation(
  location: string | null,
  baseUrl: string,
): { operationId: string; operationUrl: string } {
  if (location === null || location.trim().length === 0) {
    throw new SandboxAdapterError(
      "INVALID_RESPONSE",
      "Sandbox spawn response omitted the required Location header.",
    );
  }
  let resolved: URL;
  let base: URL;
  try {
    base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    resolved = new URL(location, base);
  } catch (error) {
    throw new SandboxAdapterError("UNSAFE_LOCATION", "Sandbox returned an invalid Location.", {
      cause: error,
    });
  }
  if (resolved.protocol !== "https:" || resolved.origin !== base.origin) {
    throw new SandboxAdapterError(
      "UNSAFE_LOCATION",
      "Sandbox Location must remain on the configured HTTPS origin.",
    );
  }
  const operationId = resolved.pathname.split("/").filter(Boolean).at(-1) ?? "";
  const expectedPrefix = `${base.pathname.replace(/\/+$/u, "")}/operations/`;
  if (!resolved.pathname.startsWith(expectedPrefix) || !UUID_PATTERN.test(operationId)) {
    throw new SandboxAdapterError(
      "UNSAFE_LOCATION",
      "Sandbox Location is not a valid operation URL.",
    );
  }
  return { operationId, operationUrl: resolved.toString() };
}

export function parseSpawnResponse(
  value: unknown,
  location: string | null,
  baseUrl: string,
): SpawnedSandboxInstance {
  const parsed = parseJsonValue(value, "Sandbox spawn response");
  if (!isRecord(parsed)) return invalid("Sandbox spawn response must be an object.");
  const instanceId = parsed.uuid;
  const sourceImageId = parsed.image;
  if (typeof instanceId !== "string" || !UUID_PATTERN.test(instanceId)) {
    return invalid("Sandbox spawn response uuid is invalid.");
  }
  if (
    typeof sourceImageId !== "string" ||
    sourceImageId.length === 0 ||
    sourceImageId.length > 512
  ) {
    return invalid("Sandbox spawn response image is invalid.");
  }
  if (parsed.disposable !== false) {
    return invalid("Sandbox spawn response did not preserve a non-disposable image.");
  }
  const operation = resolveOperationLocation(location, baseUrl);
  return {
    instanceId,
    sourceImageId,
    disposable: false,
    ...operation,
  };
}

export function parseOperation(value: unknown): SandboxOperation {
  const parsed = parseJsonValue(value, "Sandbox operation response");
  if (!isRecord(parsed)) return invalid("Sandbox operation response must be an object.");

  const operationId = parsed.uuid;
  const kind = parsed.kind;
  const rawStatus = parsed.status;
  const createdAt = parsed.created_at;
  if (typeof operationId !== "string" || !UUID_PATTERN.test(operationId)) {
    return invalid("Sandbox operation uuid is invalid.");
  }
  if (kind !== "instance" && kind !== "image_import") {
    return invalid("Sandbox operation kind is invalid.");
  }
  if (typeof rawStatus !== "string") {
    return invalid("Sandbox operation status is missing.");
  }
  const status = rawStatus.toUpperCase() as SandboxOperationStatus;
  if (!STATUSES.has(status)) return invalid("Sandbox operation status is unknown.");
  if (
    typeof createdAt !== "string" ||
    createdAt.length > 128 ||
    !createdAt.includes("T") ||
    !Number.isFinite(Date.parse(createdAt))
  ) {
    return invalid("Sandbox operation created_at is invalid.");
  }
  const error = parsed.error;
  if (error !== undefined && error !== null && typeof error !== "string") {
    return invalid("Sandbox operation error must be a string or null.");
  }

  return {
    operationId,
    kind,
    status,
    error: typeof error === "string" ? error.slice(0, 4_000) : null,
    createdAt,
    sourceImageId: nullableUuid(parsed.image_uuid, "image_uuid"),
    resultImageId: nullableUuid(parsed.result_image_uuid, "result_image_uuid"),
    resources: {
      durationSeconds: nullableNumber(parsed.duration, "duration"),
      imageSizeBytes: nullableInteger(parsed.image_size, "image_size"),
      consumedCpuSeconds: nullableNumber(parsed.consumed_cpu, "consumed_cpu"),
      consumedMemory: nullableInteger(parsed.consumed_memory, "consumed_memory"),
    },
    metadata: parsed.metadata ?? null,
    result: parsed.result ?? null,
  };
}

export function parseRetryAfter(
  value: string | null,
  nowMs: number,
  maximumMs: number,
): number | null {
  if (value === null) return null;
  const seconds = Number(value);
  let milliseconds: number;
  if (Number.isFinite(seconds) && seconds >= 0) {
    milliseconds = Math.ceil(seconds * 1_000);
  } else {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return null;
    milliseconds = Math.max(0, timestamp - nowMs);
  }
  return Math.min(milliseconds, maximumMs);
}
