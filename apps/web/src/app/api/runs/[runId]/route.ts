import { isSampleRun, problem, SAMPLE_RUN } from "../../../../lib/replay-api";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!isSampleRun(runId)) {
    return problem(
      404,
      "Run not found",
      "No public run exists with that identifier.",
      `/api/runs/${runId}`,
    );
  }
  return Response.json(SAMPLE_RUN, { headers: { "Cache-Control": "public, max-age=60" } });
}
