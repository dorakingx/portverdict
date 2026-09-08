import { isSampleRun, problem, SAMPLE_REPORT } from "../../../../../lib/replay-api";
import { readPromotedAsset } from "../../../../../lib/live-evidence";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const report = isSampleRun(runId) ? SAMPLE_REPORT : await readPromotedAsset(runId, "report");
  if (!report) {
    return problem(
      404,
      "Run not found",
      "No report exists for this run.",
      `/api/runs/${runId}/report`,
    );
  }
  return new Response(report, {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Content-Disposition": `attachment; filename="portverdict-${isSampleRun(runId) ? "synthetic" : "verified"}-report.md"`,
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
