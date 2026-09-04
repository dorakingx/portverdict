import { describe, expect, it, vi } from "vitest";

import {
  SandboxAdapterError,
  TokenFactorySandboxClient,
  assertSameCheckpoint,
  buildSpawnBody,
  parseSandboxSse,
  sandboxReadinessFromEnvironment,
  type SandboxClock,
  type SandboxTelemetry,
} from "./index.js";

const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const INSTANCE_ID = "22222222-2222-4222-8222-222222222222";
const CHECKPOINT_ID = "33333333-3333-4333-8333-333333333333";
const BASE_URL = "https://api.tokenfactory.nebius.com/sandboxes/v1";

function operation(status: string, overrides: Record<string, unknown> = {}): object {
  return {
    uuid: OPERATION_ID,
    kind: "instance",
    status,
    created_at: "2026-08-31T00:00:00.000Z",
    image_uuid: CHECKPOINT_ID,
    result_image_uuid: status === "SUCCESS" ? INSTANCE_ID : null,
    duration: status === "SUCCESS" ? 2.4 : null,
    image_size: status === "SUCCESS" ? 4_096 : null,
    consumed_cpu: status === "SUCCESS" ? 1.2 : null,
    consumed_memory: status === "SUCCESS" ? 512 : null,
    metadata: {},
    result: null,
    error: null,
    ...overrides,
  };
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json", ...init.headers },
    ...init,
  });
}

function testClock(): { clock: SandboxClock; sleeps: number[] } {
  let now = Date.parse("2026-08-31T00:00:00.000Z");
  const sleeps: number[] = [];
  return {
    sleeps,
    clock: {
      now: () => now,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        now += milliseconds;
      },
    },
  };
}

describe("TokenFactorySandboxClient", () => {
  it("spawns a bounded non-root non-disposable instance with separate auth headers", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(
          { uuid: INSTANCE_ID, image: CHECKPOINT_ID, disposable: false },
          { status: 201, headers: { location: `${BASE_URL}/operations/${OPERATION_ID}` } },
        ),
      );
    const telemetry: SandboxTelemetry[] = [];
    const client = new TokenFactorySandboxClient({
      iamToken: "separate-sandbox-token",
      projectId: "project-test-123",
      fetch: fetchMock,
      onTelemetry: (event) => telemetry.push(event),
    });

    const spawned = await client.spawn({
      command: "pnpm",
      image: CHECKPOINT_ID,
      args: ["test"],
    });

    expect(spawned).toMatchObject({
      operationId: OPERATION_ID,
      sourceImageId: CHECKPOINT_ID,
      disposable: false,
    });
    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer separate-sandbox-token");
    expect(headers.get("project")).toBe("project-test-123");
    expect(init?.redirect).toBe("error");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      uid: 1_000,
      gid: 1_000,
      disposable: false,
      networking: { enabled: false },
      timeout: 600,
    });
    expect(JSON.stringify(telemetry)).not.toContain("separate-sandbox-token");
  });

  it("polls operations, honors Retry-After, and records resource evidence", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(operation("PENDING"), { headers: { "retry-after": "2" } }),
      )
      .mockResolvedValueOnce(jsonResponse(operation("SUCCESS")));
    const { clock, sleeps } = testClock();
    const client = new TokenFactorySandboxClient({
      iamToken: "separate-sandbox-token",
      projectId: "project-test-123",
      fetch: fetchMock,
      clock,
    });

    const result = await client.waitForOperation(OPERATION_ID, { timeoutMs: 10_000 });

    expect(result.status).toBe("SUCCESS");
    expect(result.resources).toEqual({
      durationSeconds: 2.4,
      imageSizeBytes: 4_096,
      consumedCpuSeconds: 1.2,
      consumedMemory: 512,
    });
    expect(sleeps).toEqual([2_000]);
  });

  it("treats cancellation conflict as idempotently completed", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }));
    const client = new TokenFactorySandboxClient({
      iamToken: "separate-sandbox-token",
      projectId: "project-test-123",
      fetch: fetchMock,
    });

    await expect(client.cancelOperation(OPERATION_ID)).resolves.toEqual({ accepted: true });
    await expect(client.cancelOperation(OPERATION_ID)).resolves.toEqual({ accepted: false });
  });

  it("rejects unsafe locations, root execution, and invalid environment keys", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(
          { uuid: INSTANCE_ID, image: CHECKPOINT_ID, disposable: false },
          { status: 201, headers: { location: `https://evil.example/operations/${OPERATION_ID}` } },
        ),
      );
    const client = new TokenFactorySandboxClient({
      iamToken: "separate-sandbox-token",
      projectId: "project-test-123",
      fetch: fetchMock,
    });
    await expect(client.spawn({ command: "true", image: CHECKPOINT_ID })).rejects.toMatchObject({
      code: "UNSAFE_LOCATION",
    });
    expect(() =>
      buildSpawnBody({ command: "true", image: CHECKPOINT_ID, policy: { uid: 0 } }),
    ).toThrow(SandboxAdapterError);
    expect(() =>
      buildSpawnBody({ command: "true", image: CHECKPOINT_ID, env: { "BAD-KEY": "x" } }),
    ).toThrow(SandboxAdapterError);
  });

  it("parses monotonic SSE frames and rejects replayed IDs", () => {
    const valid = [
      ": keepalive",
      "",
      "id: 1",
      "event: stdout",
      'data: {"id":1,"ts":"2026-08-31T00:00:00.000Z","spid":7,"type":"stdout","data":"ok"}',
      "",
      "id: 2",
      "event: exit",
      'data: {"id":2,"ts":"2026-08-31T00:00:01.000Z","spid":7,"type":"exit","data":{"code":0}}',
      "",
    ].join("\n");
    expect(parseSandboxSse(valid)).toHaveLength(2);

    const replay = `${valid}\nid: 2\nevent: exit\ndata: {"id":2,"ts":"2026-08-31T00:00:02.000Z","spid":7,"type":"exit","data":{}}\n\n`;
    expect(() => parseSandboxSse(replay)).toThrow(/monotonically/u);
  });

  it("accepts official stream payloads and an operation-scoped completion event", () => {
    const official = [
      "id: 1",
      "event: stdout",
      'data: {"id":1,"ts":"2026-08-31T00:00:00.000Z","spid":1,"type":"stdout","data":{"value":"ok\\n","encoding":"ascii","truncated":false}}',
      "",
      "id: 2",
      "event: completion",
      'data: {"id":2,"ts":"2026-08-31T00:00:01.000Z","type":"completion","data":{"status":"SUCCESS"}}',
      "",
    ].join("\n");

    const frames = parseSandboxSse(official);
    expect(frames).toHaveLength(2);
    expect(frames[1]).toMatchObject({ event: "completion", spawnedProcessId: null });
  });

  it("enforces the shared checkpoint invariant and reports readiness", () => {
    const branch = {
      candidateId: "candidate-a",
      checkpointImageId: CHECKPOINT_ID,
      instance: {
        instanceId: INSTANCE_ID,
        operationId: OPERATION_ID,
        operationUrl: `${BASE_URL}/operations/${OPERATION_ID}`,
        sourceImageId: CHECKPOINT_ID,
        disposable: false as const,
      },
    };
    expect(assertSameCheckpoint([branch])).toBe(CHECKPOINT_ID);
    expect(() =>
      assertSameCheckpoint([
        branch,
        {
          ...branch,
          candidateId: "candidate-b",
          checkpointImageId: INSTANCE_ID,
        },
      ]),
    ).toThrow(/share one non-disposable checkpoint/u);
    expect(
      sandboxReadinessFromEnvironment({
        CONTREE_TOKEN: "separate-sandbox-token",
        CONTREE_PROJECT: "project-test-123",
      }),
    ).toMatchObject({ status: "configured", tokenConfigured: true, projectConfigured: true });
  });

  it("cancels branches that were already spawned when sibling creation fails", async () => {
    const secondOperationId = "44444444-4444-4444-8444-444444444444";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          { uuid: INSTANCE_ID, image: CHECKPOINT_ID, disposable: false },
          { status: 201, headers: { location: `${BASE_URL}/operations/${OPERATION_ID}` } },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { uuid: "55555555-5555-4555-8555-555555555555", image: CHECKPOINT_ID, disposable: false },
          {
            status: 201,
            headers: { location: `${BASE_URL}/operations/${secondOperationId}` },
          },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const client = new TokenFactorySandboxClient({
      iamToken: "separate-sandbox-token",
      projectId: "project-test-123",
      fetch: fetchMock,
      maxTransientRetries: 0,
    });

    await expect(
      client.spawnBranches(CHECKPOINT_ID, [
        { candidateId: "candidate-a", command: "true" },
        { candidateId: "candidate-b", command: "true" },
        { candidateId: "candidate-c", command: "true" },
      ]),
    ).rejects.toBeInstanceOf(SandboxAdapterError);

    const cancellationUrls = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "DELETE")
      .map(([url]) => String(url));
    expect(cancellationUrls).toEqual(
      expect.arrayContaining([
        `${BASE_URL}/operations/${OPERATION_ID}`,
        `${BASE_URL}/operations/${secondOperationId}`,
      ]),
    );
  });
});
