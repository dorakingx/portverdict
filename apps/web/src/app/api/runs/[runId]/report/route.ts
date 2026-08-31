import { isSampleRun, problem, SAMPLE_REPORT } from "../../../../../lib/replay-api";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!isSampleRun(runId)) {
    return problem(
      404,
      "Run not found",
      "No report exists for this run.",
      `/api/runs/${runId}/report`,
    );
  }
  return new Response(SAMPLE_REPORT, {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Content-Disposition": 'attachment; filename="portverdict-synthetic-report.md"',
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
