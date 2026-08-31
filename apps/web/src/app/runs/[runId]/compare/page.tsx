import Link from "next/link";

import { StatusBadge } from "../../../../components/status-badge";
import {
  FIXTURE_CANDIDATES,
  FIXTURE_GATES,
  type FixtureGateStatus,
} from "../../../../lib/development-fixture";

const TONE_BY_STATUS = {
  passed: "passed",
  failed: "failed",
  inconclusive: "warning",
} as const;

const LABEL_BY_STATUS: Record<FixtureGateStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  inconclusive: "Inconclusive",
};

export default async function ComparePage({
  params,
}: Readonly<{ params: Promise<{ runId: string }> }>) {
  const { runId } = await params;

  return (
    <div className="run-page">
      <section className="run-page__intro">
        <div>
          <p className="section-kicker">Deterministic comparison</p>
          <h1>Hard gates decide eligibility first.</h1>
          <p>
            Fixture data is shown below. A model rationale cannot override a failed or inconclusive
            hard gate.
          </p>
        </div>
        <StatusBadge tone="replay">Synthetic comparison</StatusBadge>
      </section>

      <section className="comparison-panel" aria-labelledby="comparison-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Candidate matrix</p>
            <h2 id="comparison-title">Behavioral eligibility</h2>
          </div>
          <span className="evidence-count">Development fixture</span>
        </div>

        <div
          className="comparison-scroll"
          tabIndex={0}
          aria-label="Scrollable candidate comparison"
        >
          <table className="comparison-table">
            <thead>
              <tr>
                <th scope="col">Candidate</th>
                {FIXTURE_GATES.map((gate) => (
                  <th scope="col" key={gate.id}>
                    {gate.label}
                  </th>
                ))}
                <th scope="col">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {FIXTURE_CANDIDATES.map((candidate) => (
                <tr key={candidate.id}>
                  <th scope="row">
                    <strong>{candidate.name}</strong>
                    <small>{candidate.rationale}</small>
                  </th>
                  {FIXTURE_GATES.map((gate) => {
                    const status = candidate.gates[gate.id] ?? "inconclusive";
                    return (
                      <td key={gate.id}>
                        <StatusBadge tone={TONE_BY_STATUS[status]}>
                          {LABEL_BY_STATUS[status]}
                        </StatusBadge>
                      </td>
                    );
                  })}
                  <td>
                    <StatusBadge tone={TONE_BY_STATUS[candidate.status]}>
                      {candidate.verdict}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="comparison-footer">
          <p>
            <strong>Fixture selection:</strong> Prompt + schema adapter is the only branch with
            complete passing evidence.
          </p>
          <Link className="button button--primary" href={`/runs/${runId}/report`}>
            View fixture report <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
