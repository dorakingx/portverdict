import { isSampleRun, problem, SAMPLE_EVENTS } from "../../../../../lib/replay-api";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!isSampleRun(runId)) {
    return problem(
      404,
      "Run not found",
      "No public run exists with that identifier.",
      `/api/runs/${runId}/events`,
    );
  }
  const rawLastId = request.headers.get("last-event-id");
  const lastId = rawLastId === null ? 0 : Number(rawLastId);
  if (!Number.isSafeInteger(lastId) || lastId < 0) {
    return problem(
      400,
      "Invalid event cursor",
      "Last-Event-ID must be a non-negative integer.",
      `/api/runs/${runId}/events`,
    );
  }
  const body = SAMPLE_EVENTS.filter(({ id }) => id > lastId)
    .map(({ id, event, data }) => `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
  return new Response(body || ": replay complete\n\n", {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
