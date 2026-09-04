import { JsonValueSchema, type JsonValue } from "@portverdict/shared-schemas";

import { SandboxAdapterError } from "./errors.js";
import type { SandboxSseFrame } from "./types.js";

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseEventId(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new SandboxAdapterError("INVALID_RESPONSE", `${label} must be a non-negative integer.`);
  }
  return parsed;
}

/** Parses a complete Token Factory operation SSE response, ignoring keepalive comments. */
export function parseSandboxSse(text: string): readonly SandboxSseFrame[] {
  if (text.length > 20_000_000) {
    throw new SandboxAdapterError("INVALID_RESPONSE", "Sandbox SSE response exceeds 20 MB.");
  }
  const frames: SandboxSseFrame[] = [];
  let previousId = -1;

  for (const rawFrame of text.replace(/\r\n?/gu, "\n").split("\n\n")) {
    if (rawFrame.trim().length === 0) continue;
    const fields = new Map<string, string[]>();
    for (const line of rawFrame.split("\n")) {
      if (line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const name = separator === -1 ? line : line.slice(0, separator);
      let value = separator === -1 ? "" : line.slice(separator + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      const current = fields.get(name) ?? [];
      current.push(value);
      fields.set(name, current);
    }
    if (fields.size === 0) continue;
    const event = fields.get("event")?.at(-1) ?? "message";
    const data = (fields.get("data") ?? []).join("\n");
    if (event === "sse_error") {
      if (data.length === 0 || data.length > 4_000) {
        throw new SandboxAdapterError("INVALID_RESPONSE", "Sandbox SSE error frame is invalid.");
      }
      const idValue = fields.get("id")?.at(-1);
      frames.push({
        kind: "error",
        message: data,
        lastEventId:
          idValue === undefined
            ? previousId < 0
              ? null
              : previousId
            : parseEventId(idValue, "SSE error id"),
      });
      continue;
    }

    const idValue = fields.get("id")?.at(-1);
    if (idValue === undefined || data.length === 0) {
      throw new SandboxAdapterError("INVALID_RESPONSE", "Sandbox SSE event lacks id or data.");
    }
    const id = parseEventId(idValue, "SSE event id");
    if (id <= previousId) {
      throw new SandboxAdapterError(
        "INVALID_RESPONSE",
        "Sandbox SSE event IDs must increase monotonically.",
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(data) as unknown;
    } catch (error) {
      throw new SandboxAdapterError("INVALID_RESPONSE", "Sandbox SSE data is not JSON.", {
        cause: error,
      });
    }
    const validated = JsonValueSchema.safeParse(json);
    if (!validated.success || !isRecord(validated.data)) {
      throw new SandboxAdapterError("INVALID_RESPONSE", "Sandbox SSE payload is invalid.");
    }
    const payload = validated.data;
    const payloadId = payload.id;
    const timestamp = payload.ts;
    const spawnedProcessId = payload.spid;
    const payloadType = payload.type;
    const payloadData = payload.data;
    const validSpawnedProcessId =
      (typeof spawnedProcessId === "number" &&
        Number.isSafeInteger(spawnedProcessId) &&
        spawnedProcessId >= 0) ||
      (payloadType === "completion" && spawnedProcessId === undefined);
    if (
      typeof payloadId !== "number" ||
      payloadId !== id ||
      typeof timestamp !== "string" ||
      !timestamp.includes("T") ||
      !Number.isFinite(Date.parse(timestamp)) ||
      !validSpawnedProcessId ||
      typeof payloadType !== "string" ||
      payloadType !== event ||
      payloadData === undefined
    ) {
      throw new SandboxAdapterError(
        "INVALID_RESPONSE",
        "Sandbox SSE headers and payload do not agree.",
      );
    }
    frames.push({
      kind: "event",
      id,
      event,
      timestamp,
      spawnedProcessId: typeof spawnedProcessId === "number" ? spawnedProcessId : null,
      data: payloadData,
    });
    previousId = id;
  }
  return frames;
}
