import Link from "next/link";
import type { ReactNode } from "react";

import type { TrialSummary } from "../lib/live-evidence";

import { BrandMark } from "./brand-mark";
import { RunNavigation } from "./run-navigation";
import { StatusBadge } from "./status-badge";

export function RunShell({
  children,
  runId,
  trial,
  verified,
}: Readonly<{
  children: ReactNode;
  runId: string;
  trial: TrialSummary | null;
  verified: boolean;
}>) {
  const selectedCandidateId =
    trial?.verdict.status === "selected" ? trial.verdict.selectedCandidateId : null;
  const selectedCandidate = trial?.candidates.find(
    (candidate) => candidate.candidateId === selectedCandidateId,
  );
  return (
    <div className="run-app">
      <a className="skip-link" href="#run-content">
        Skip to run content
      </a>
      <header className="run-header">
        <Link aria-label="PortVerdict home" href="/">
          <BrandMark />
        </Link>
        <div className="run-header__actions">
          <StatusBadge tone={trial ? (verified ? "live" : "warning") : "replay"}>
            {trial ? (verified ? "Verified live replay" : "Stale live replay") : "Evidence replay"}
          </StatusBadge>
          <Link className="text-link" href="/status">
            System status
          </Link>
        </div>
      </header>

      <section className="run-identity" aria-label="Run identity">
        <div>
          <span>Run</span>
          <strong className="mono">{runId}</strong>
        </div>
        <div>
          <span>Source</span>
          <strong className="mono">
            {trial
              ? `python-response-adapter@${trial.sourceRevision}`
              : "typescript-tool-weather@6e4c1bf"}
          </strong>
        </div>
        <div>
          <span>Recorded</span>
          <strong>{trial ? trial.recordedAt : "Development fixture"}</strong>
        </div>
        <div>
          <span>{trial ? "Live verdict" : "Fixture verdict"}</span>
          <strong className="identity-verdict">
            {trial
              ? selectedCandidate
                ? `Selected · ${selectedCandidate.candidateId}`
                : "Abstained · no trustworthy winner"
              : "Selected · Candidate 02"}
          </strong>
        </div>
      </section>

      <div className="run-layout">
        <aside className="run-sidebar">
          <RunNavigation runId={runId} />
          <div className="run-sidebar__notice">
            <StatusBadge tone={trial ? (verified ? "live" : "warning") : "replay"}>
              {trial ? (verified ? "Authenticated evidence" : "TTL expired") : "Synthetic evidence"}
            </StatusBadge>
            <p>
              {trial
                ? `${trial.exactModelId}. One recorded trial; inspect provenance before reusing its patch.`
                : "UI contract fixture. No live sponsor execution is represented."}
            </p>
          </div>
        </aside>
        <main id="run-content" className="run-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
