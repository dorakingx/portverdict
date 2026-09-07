import Link from "next/link";

export function RepositoryLauncher({
  liveRunId,
  fresh = true,
}: Readonly<{ liveRunId: string | null; fresh?: boolean }>) {
  return (
    <div className="repository-launcher" aria-label="Evidence replays">
      <div className="repository-launcher__primary">
        <Link
          className="button button--primary"
          href={liveRunId ? `/runs/${liveRunId}/workflow` : "/runs/sample/workflow"}
        >
          {liveRunId
            ? fresh
              ? "Inspect verified live run"
              : "Inspect recorded live run"
            : "Run recorded sample"}{" "}
          <span aria-hidden="true">→</span>
        </Link>
        <span>
          {liveRunId
            ? fresh
              ? "authenticated sponsor evidence"
              : "historical evidence · freshness expired"
            : "no account required"}
        </span>
      </div>
      <div className="repository-launcher__primary">
        <Link
          className="button button--secondary"
          href={liveRunId ? "/runs/sample/workflow" : "/status"}
        >
          {liveRunId ? "Open development fixture" : "Check live readiness"}
        </Link>
        <span>kept visibly separate from recorded live evidence</span>
      </div>
      <p className="repository-launcher__disclosure">
        Live execution is owner-only. The public application serves immutable, redacted replays and
        never receives sponsor credentials.
      </p>
    </div>
  );
}
