import { CreateRunRequestSchema, problem } from "../../../lib/replay-api";
import { getReadinessSnapshot } from "../../../lib/readiness";

export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 4_096;

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) {
    return problem(413, "Request too large", "Run requests are limited to 4 KiB.", "/api/runs");
  }
  const text = await request.text();
  if (text.length === 0 || text.length > MAX_REQUEST_BYTES) {
    return problem(400, "Invalid request", "A bounded JSON request body is required.", "/api/runs");
  }
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return problem(400, "Invalid request", "The request body must be valid JSON.", "/api/runs");
  }
  const parsed = CreateRunRequestSchema.safeParse(json);
  if (!parsed.success) {
    return problem(
      422,
      "Invalid run request",
      "Choose the built-in fixture or provide one bounded public GitHub repository URL.",
      "/api/runs",
    );
  }
  if (parsed.data.mode === "live") {
    const readiness = getReadinessSnapshot();
    if (readiness.overall !== "live-configured") {
      return problem(
        503,
        "Live mode unavailable",
        "Replay is ready, but live mode needs server-side Nebius, Sandbox, and Tavily credentials.",
        "/api/runs",
      );
    }
    return problem(
      501,
      "Live orchestration not verified",
      "Credentials are configured, but authenticated smoke evidence must pass before public live runs are enabled.",
      "/api/runs",
    );
  }
  return Response.json(
    {
      runId: "sample-run",
      state: "RECEIVED",
      mode: "replay",
      statusUrl: "/api/runs/sample-run",
      eventsUrl: "/api/runs/sample-run/events",
    },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
