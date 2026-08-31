import type { ReactNode } from "react";

import { RunShell } from "../../../components/run-shell";

export default async function RunLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ runId: string }> }>) {
  const { runId } = await params;

  return <RunShell runId={runId.slice(0, 64)}>{children}</RunShell>;
}
