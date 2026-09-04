import { isSampleRun, problem, SAMPLE_PATCH } from "../../../../../lib/replay-api";
import { readPromotedAsset } from "../../../../../lib/live-evidence";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const patch = isSampleRun(runId) ? SAMPLE_PATCH : await readPromotedAsset(runId, "patch");
  if (!patch) {
    return problem(
      404,
      "Run not found",
      "No patch exists for this run.",
      `/api/runs/${runId}/patch`,
    );
  }
  if (new URL(request.url).searchParams.get("acknowledgeUnsafe") !== "true") {
    return problem(
      409,
      "Acknowledgement required",
      "This evidence patch requires human review. Add acknowledgeUnsafe=true to download it.",
      `/api/runs/${runId}/patch`,
    );
  }
  const synthetic = isSampleRun(runId);
  return new Response(patch, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="portverdict-${synthetic ? "synthetic" : "selected"}.patch"`,
      "Content-Type": "text/x-diff; charset=utf-8",
      "X-PortVerdict-Safety": synthetic
        ? "synthetic-unsafe-not-for-shipping"
        : "verified-one-run-human-review-required",
    },
  });
}
