import { getReadinessSnapshot } from "../../../lib/readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getReadinessSnapshot(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
