import type { ReactNode } from "react";

import { RunShell } from "../../../components/run-shell";
import { getPromotedTrialForRun } from "../../../lib/live-evidence";
import { getReadinessSnapshot } from "../../../lib/readiness";
import { isSampleRun } from "../../../lib/replay-api";
import { notFound } from "next/navigation";

export default async function RunLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ runId: string }> }>) {
  const { runId } = await params;
  const [trial, readiness] = await Promise.all([
    getPromotedTrialForRun(runId),
    getReadinessSnapshot(),
  ]);
  if (!trial && !isSampleRun(runId)) notFound();

  return (
    <RunShell
      runId={runId.slice(0, 64)}
      trial={trial}
      verified={Boolean(trial && readiness.overall === "verified")}
    >
      {children}
    </RunShell>
  );
}
