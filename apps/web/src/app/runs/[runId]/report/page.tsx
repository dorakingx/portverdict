import Link from "next/link";

import { StatusBadge } from "../../../../components/status-badge";

export default async function ReportPage({
  params,
}: Readonly<{ params: Promise<{ runId: string }> }>) {
  const { runId } = await params;

  return (
    <div className="run-page">
      <section className="verdict-hero">
        <div>
          <p className="section-kicker">Fixture verdict</p>
          <StatusBadge tone="passed">Selected</StatusBadge>
          <h1>Prompt + schema adapter</h1>
          <p>
            The only development-fixture candidate to pass every recorded hard gate. This is a UI
            contract demonstration, not live migration evidence.
          </p>
        </div>
        <div className="verdict-score" aria-label="Fixture hard gates passed">
          <strong className="mono">5/5</strong>
          <span>shown fixture gates passed</span>
        </div>
      </section>

      <div className="report-grid">
        <section className="report-panel" aria-labelledby="why-selected-title">
          <p className="section-kicker">Decision basis</p>
          <h2 id="why-selected-title">Why this fixture branch survives</h2>
          <ul className="report-list">
            <li>Build and original behavior fixtures complete successfully.</li>
            <li>Typed tool arguments remain objects across the normalized event stream.</li>
            <li>The adversarial schema case that rejected Candidate 01 does not reproduce.</li>
            <li>Every displayed number links back to measured fixture evidence.</li>
          </ul>
          <Link
            className="text-link text-link--accent"
            href={`/runs/${runId}/evidence/candidate-adapter`}
          >
            Inspect supporting fixture evidence <span aria-hidden="true">→</span>
          </Link>
        </section>

        <aside className="limitations-panel">
          <p className="section-kicker">Limitations</p>
          <h2>What this report does not claim</h2>
          <ul>
            <li>No authenticated Token Factory inference has run.</li>
            <li>No real Sandbox checkpoint or branch ID has been recorded.</li>
            <li>No Tavily request or external source record exists yet.</li>
            <li>No patch is currently represented as safe to ship.</li>
          </ul>
        </aside>
      </div>

      <section className="report-next">
        <div>
          <p className="section-kicker">Next proof boundary</p>
          <h2>Replace every fixture identifier with an immutable live run.</h2>
        </div>
        <div className="hero__actions">
          <a className="button button--primary" href={`/api/runs/${runId}/report`} download>
            Download report
          </a>
          <a
            className="button button--secondary"
            href={`/api/runs/${runId}/patch?acknowledgeUnsafe=true`}
            download
          >
            Download synthetic patch
          </a>
          <Link className="button button--quiet" href={`/runs/${runId}/compare`}>
            Return to comparison
          </Link>
        </div>
      </section>
    </div>
  );
}
