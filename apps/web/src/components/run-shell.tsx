import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "./brand-mark";
import { RunNavigation } from "./run-navigation";
import { StatusBadge } from "./status-badge";

export function RunShell({ children, runId }: Readonly<{ children: ReactNode; runId: string }>) {
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
          <StatusBadge tone="replay">Evidence replay</StatusBadge>
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
          <strong className="mono">typescript-tool-weather@6e4c1bf</strong>
        </div>
        <div>
          <span>Recorded</span>
          <strong>Development fixture</strong>
        </div>
        <div>
          <span>Fixture verdict</span>
          <strong className="identity-verdict">Selected · Candidate 02</strong>
        </div>
      </section>

      <div className="run-layout">
        <aside className="run-sidebar">
          <RunNavigation runId={runId} />
          <div className="run-sidebar__notice">
            <StatusBadge tone="replay">Synthetic evidence</StatusBadge>
            <p>UI contract fixture. Live sponsor evidence has not been recorded yet.</p>
          </div>
        </aside>
        <main id="run-content" className="run-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
