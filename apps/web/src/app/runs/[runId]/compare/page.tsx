import Link from "next/link";

import { StatusBadge } from "../../../../components/status-badge";
import {
  FIXTURE_CANDIDATES,
  FIXTURE_GATES,
  type FixtureGateStatus,
} from "../../../../lib/development-fixture";
import { getPromotedTrialForRun } from "../../../../lib/live-evidence";

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

function gateLabel(gate: string): string {
  return gate
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export default async function ComparePage({
  params,
}: Readonly<{ params: Promise<{ runId: string }> }>) {
  const { runId } = await params;
  const trial = await getPromotedTrialForRun(runId);
  const gates = trial
    ? Object.keys(trial.candidates[0]?.gates ?? {}).map((id) => ({ id, label: gateLabel(id) }))
    : FIXTURE_GATES;
  const selectedCandidateId =
    trial?.verdict.status === "selected" ? trial.verdict.selectedCandidateId : null;
  const candidates = trial
    ? trial.candidates.map((candidate) => {
        const status: FixtureGateStatus =
          candidate.disposition === "eligible"
            ? "passed"
            : candidate.disposition === "rejected"
              ? "failed"
              : "inconclusive";
        return {
          id: candidate.candidateId,
          name: gateLabel(candidate.strategy),
          verdict:
            candidate.candidateId === selectedCandidateId
              ? "Selected"
              : gateLabel(candidate.disposition),
          status,
          gates: candidate.gates,
          rationale: `${candidate.evidenceIds.length} evidence records · ${candidate.durationMs} ms measured once.`,
        };
      })
    : FIXTURE_CANDIDATES;

  return (
    <div className="run-page">
      <section className="run-page__intro">
        <div>
          <p className="section-kicker">Deterministic comparison</p>
          <h1>Hard gates decide eligibility first.</h1>
          <p>
            {trial
              ? "Measured candidate evidence is shown below. A model rationale cannot override a failed or inconclusive hard gate."
              : "Fixture data is shown below. A model rationale cannot override a failed or inconclusive hard gate."}
          </p>
          {trial ? <p>Recorded NVIDIA model: {trial.exactModelId}</p> : null}
        </div>
        <StatusBadge tone={trial ? "live" : "replay"}>
          {trial ? "Recorded live comparison" : "Synthetic comparison"}
        </StatusBadge>
      </section>

      <section className="comparison-panel" aria-labelledby="comparison-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Candidate matrix</p>
            <h2 id="comparison-title">Behavioral eligibility</h2>
          </div>
          <span className="evidence-count">
            {trial ? `Checkpoint ${trial.checkpoint.imageId}` : "Development fixture"}
          </span>
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
                {gates.map((gate) => (
                  <th scope="col" key={gate.id}>
                    {gate.label}
                  </th>
                ))}
                <th scope="col">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr key={candidate.id}>
                  <th scope="row">
                    <strong>{candidate.name}</strong>
                    <small>{candidate.rationale}</small>
                  </th>
                  {gates.map((gate) => {
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
            <strong>{trial ? "Recorded verdict:" : "Fixture selection:"}</strong>{" "}
            {trial
              ? trial.verdict.status === "selected"
                ? `${trial.verdict.selectedCandidateId} was selected after hard-gate eligibility; timings are one-run observations.`
                : `PortVerdict abstained: ${trial.verdict.reason}.`
              : "Prompt + schema adapter is the only branch with complete passing evidence."}
          </p>
          <Link className="button button--primary" href={`/runs/${runId}/report`}>
            View {trial ? "recorded" : "fixture"} report <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
