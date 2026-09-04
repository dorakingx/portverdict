import type { JsonValue } from "@portverdict/shared-schemas";

export const DEFAULT_SANDBOX_BASE_URL = "https://api.tokenfactory.nebius.com/sandboxes/v1" as const;

export const SANDBOX_TERMINAL_STATUSES = ["SUCCESS", "FAILED", "CANCELLED"] as const;
export type SandboxTerminalStatus = (typeof SANDBOX_TERMINAL_STATUSES)[number];
export type SandboxOperationStatus = "PENDING" | "ASSIGNED" | "EXECUTING" | SandboxTerminalStatus;

export type SandboxClock = {
  now: () => number;
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
};

export type SandboxFetch = typeof fetch;

export type SandboxResourcePolicy = {
  /** Process timeout sent to Token Factory, in whole seconds. */
  timeoutSeconds: number;
  /** Maximum bytes retained per stdout/stderr/stdin stream. */
  outputLimitBytes: number;
  /** Maximum writable image layer size. */
  maxLayerBytes: number;
  networkingEnabled: boolean;
  uid: number;
  gid: number;
};

export type SandboxInstanceRequest = {
  command: string;
  image: string;
  args?: readonly string[];
  shell?: boolean;
  env?: Readonly<Record<string, string>>;
  preserveEnv?: boolean;
  cwd?: string;
  policy?: Partial<SandboxResourcePolicy>;
};

export type SandboxCheckpointRequest = Omit<SandboxInstanceRequest, "policy"> & {
  policy?: Partial<SandboxResourcePolicy>;
};

export type SandboxBranchRequest = Omit<SandboxInstanceRequest, "image" | "policy"> & {
  candidateId: string;
  policy?: Partial<Omit<SandboxResourcePolicy, "networkingEnabled">>;
};

export type SpawnedSandboxInstance = {
  instanceId: string;
  operationId: string;
  operationUrl: string;
  sourceImageId: string;
  disposable: false;
};

export type SandboxOperationResources = {
  durationSeconds: number | null;
  imageSizeBytes: number | null;
  consumedCpuSeconds: number | null;
  consumedMemory: number | null;
};

export type SandboxOperation = {
  operationId: string;
  kind: "instance" | "image_import";
  status: SandboxOperationStatus;
  error: string | null;
  createdAt: string;
  sourceImageId: string | null;
  resultImageId: string | null;
  resources: SandboxOperationResources;
  metadata: JsonValue | null;
  result: JsonValue | null;
};

export type SandboxCheckpoint = {
  checkpointImageId: string;
  sourceImageId: string;
  operationId: string;
  createdAt: string;
  resources: SandboxOperationResources;
};

export type SandboxBranch = {
  candidateId: string;
  checkpointImageId: string;
  instance: SpawnedSandboxInstance;
};

export type SandboxTelemetry = {
  integration: "nebius-token-factory-sandbox";
  method: "POST" | "GET" | "DELETE";
  endpoint: "/instances" | "/operations/{operationId}" | "/operations/{operationId}/events";
  requestId: string | null;
  operationId: string | null;
  httpStatus: number | null;
  outcome: "success" | "transient-error" | "error" | "aborted";
  latencyMs: number;
  retryCount: number;
  recordedAt: string;
  resources: SandboxOperationResources | null;
};

export type SandboxReadiness = {
  integration: "nebius-token-factory-sandbox";
  status: "configured" | "unconfigured";
  tokenConfigured: boolean;
  projectConfigured: boolean;
  baseUrl: string;
};

export type SandboxClientOptions = {
  iamToken: string;
  projectId: string;
  baseUrl?: string;
  fetch?: SandboxFetch;
  clock?: SandboxClock;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  maxTransientRetries?: number;
  maxRetryDelayMs?: number;
  defaultPolicy?: Partial<SandboxResourcePolicy>;
  onTelemetry?: (telemetry: SandboxTelemetry) => void;
};

export type WaitForOperationOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type SandboxSseEvent = {
  kind: "event";
  id: number;
  event: string;
  timestamp: string;
  /** Null only for operation-scoped system events such as `completion`. */
  spawnedProcessId: number | null;
  data: JsonValue;
};

export type SandboxSseError = {
  kind: "error";
  message: string;
  lastEventId: number | null;
};

export type SandboxSseFrame = SandboxSseEvent | SandboxSseError;

export type StreamOperationEventsOptions = {
  follow?: boolean;
  lastEventId?: number;
  spawnedProcessId?: number;
  signal?: AbortSignal;
};
