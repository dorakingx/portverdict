import { getReadinessSnapshot } from "../../../lib/readiness";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(getReadinessSnapshot(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
