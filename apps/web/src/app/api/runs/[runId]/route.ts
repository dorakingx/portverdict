import { isSampleRun, problem, SAMPLE_RUN } from "../../../../lib/replay-api";
import { getPromotedReplay } from "../../../../lib/live-evidence";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (isSampleRun(runId)) {
    return Response.json(SAMPLE_RUN, { headers: { "Cache-Control": "public, max-age=60" } });
  }
  const replay = await getPromotedReplay(runId);
  if (!replay) {
    return problem(
      404,
      "Run not found",
      "No verified public replay exists with that identifier.",
      `/api/runs/${runId}`,
    );
  }
  return Response.json(
    {
      ...replay.snapshot,
      recording: {
        kind: "authenticated-live-replay",
        recordedAt: replay.summary.recordedAt,
        expiresAt: replay.summary.expiresAt,
        exactModelId: replay.summary.exactModelId,
        checkpointImageId: replay.summary.checkpoint.imageId,
        replayManifestSha256: replay.manifest.integritySha256,
      },
    },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
