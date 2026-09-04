import Link from "next/link";

import { StatusBadge } from "../../../../components/status-badge";
import { getPromotedTrialForRun } from "../../../../lib/live-evidence";

function strategyLabel(strategy: string): string {
  return strategy
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export default async function ReportPage({
  params,
}: Readonly<{ params: Promise<{ runId: string }> }>) {
  const { runId } = await params;
  const trial = await getPromotedTrialForRun(runId);
  const selectedCandidateId =
    trial?.verdict.status === "selected" ? trial.verdict.selectedCandidateId : null;
  const selected = trial?.candidates.find(
    (candidate) => candidate.candidateId === selectedCandidateId,
  );
  const passedCount = selected
    ? Object.values(selected.gates).filter((gate) => gate === "passed").length
    : 5;
  const gateCount = selected ? Object.keys(selected.gates).length : 5;
  const abstained = trial?.verdict.status === "abstained";

  return (
    <div className="run-page">
      <section className="verdict-hero">
        <div>
          <p className="section-kicker">{trial ? "Recorded live verdict" : "Fixture verdict"}</p>
          <StatusBadge tone={abstained ? "warning" : "passed"}>
            {abstained ? "Abstained" : "Selected"}
          </StatusBadge>
          <h1>
            {selected
              ? strategyLabel(selected.strategy)
              : abstained
                ? "No trustworthy winner"
                : "Prompt + schema adapter"}
          </h1>
          <p>
            {trial
              ? selected
                ? `Selected only after all ${gateCount} hard gates passed from the shared Sandbox checkpoint.`
                : `PortVerdict refused to choose: ${trial.verdict.status === "abstained" ? trial.verdict.reason : "no eligible candidate"}.`
              : "The only development-fixture candidate to pass every recorded hard gate. This is a UI contract demonstration, not live migration evidence."}
          </p>
        </div>
        <div className="verdict-score" aria-label="Hard gates passed">
          <strong className="mono">
            {selected || !trial ? `${passedCount}/${gateCount}` : "0 claims"}
          </strong>
          <span>{trial ? "measured hard gates passed" : "shown fixture gates passed"}</span>
        </div>
      </section>

      <div className="report-grid">
        <section className="report-panel" aria-labelledby="why-selected-title">
          <p className="section-kicker">Decision basis</p>
          <h2 id="why-selected-title">
            {abstained ? "Why selection stopped" : "Why this branch survives"}
          </h2>
          {trial ? (
            <ul className="report-list">
              <li>
                All three candidate operations branched from checkpoint {trial.checkpoint.imageId}.
              </li>
              <li>
                Model ID {trial.exactModelId} was discovered from the authenticated live catalog.
              </li>
              <li>
                Structured output, tool calling, streaming retry, security, and provenance gates
                were executed in Sandboxes.
              </li>
              <li>
                Tavily Search {trial.tavily.searchRequestId} and Extract{" "}
                {trial.tavily.extractRequestId}
                supplied hashed official-source context.
              </li>
            </ul>
          ) : (
            <ul className="report-list">
              <li>Build and original behavior fixtures complete successfully.</li>
              <li>Typed tool arguments remain objects across the normalized event stream.</li>
              <li>The adversarial schema case that rejected Candidate 01 does not reproduce.</li>
              <li>Every displayed number links back to measured fixture evidence.</li>
            </ul>
          )}
          <Link
            className="text-link text-link--accent"
            href={
              selected
                ? `/runs/${runId}/evidence/${selected.candidateId}`
                : `/runs/${runId}/workflow`
            }
          >
            Inspect supporting {trial ? "recorded" : "fixture"} evidence{" "}
            <span aria-hidden="true">→</span>
          </Link>
        </section>

        <aside className="limitations-panel">
          <p className="section-kicker">Limitations</p>
          <h2>What this report does not claim</h2>
          <ul>
            {trial ? (
              <>
                <li>This is one recorded run, not a statistical performance estimate.</li>
                <li>The safe conclusion is bounded to fixture revision {trial.sourceRevision}.</li>
                <li>Passing gates does not replace human review before applying the patch.</li>
                <li>
                  Freshness expires at {trial.expiresAt}; stale evidence loses verified status.
                </li>
              </>
            ) : (
              <>
                <li>No authenticated Token Factory inference is represented.</li>
                <li>No real Sandbox checkpoint or branch ID is represented.</li>
                <li>No Tavily request or external source record is represented.</li>
                <li>No patch is represented as safe to ship.</li>
              </>
            )}
          </ul>
        </aside>
      </div>

      <section className="report-next">
        <div>
          <p className="section-kicker">Evidence export</p>
          <h2>
            {trial
              ? "Reproduce the decision from immutable artifacts."
              : "Replace fixture identifiers with an immutable live run."}
          </h2>
        </div>
        <div className="hero__actions">
          <a className="button button--primary" href={`/api/runs/${runId}/report`} download>
            Download report
          </a>
          {selected || !trial ? (
            <a
              className="button button--secondary"
              href={`/api/runs/${runId}/patch?acknowledgeUnsafe=true`}
              download
            >
              Download {trial ? "selected" : "synthetic"} patch
            </a>
          ) : null}
          <Link className="button button--quiet" href={`/runs/${runId}/compare`}>
            Return to comparison
          </Link>
        </div>
      </section>
    </div>
  );
}
