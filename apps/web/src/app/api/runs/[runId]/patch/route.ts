import { isSampleRun, problem, SAMPLE_PATCH } from "../../../../../lib/replay-api";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!isSampleRun(runId)) {
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
      "This synthetic patch is investigation-only. Add acknowledgeUnsafe=true to download it.",
      `/api/runs/${runId}/patch`,
    );
  }
  return new Response(SAMPLE_PATCH, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="portverdict-synthetic.patch"',
      "Content-Type": "text/x-diff; charset=utf-8",
      "X-PortVerdict-Safety": "synthetic-unsafe-not-for-shipping",
    },
  });
}
