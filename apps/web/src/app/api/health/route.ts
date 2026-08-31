export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      status: "healthy",
      service: "portverdict-web",
      version: process.env.npm_package_version ?? "unknown",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
