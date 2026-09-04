import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBadge } from "../../../../../components/status-badge";
import { FIXTURE_EVIDENCE } from "../../../../../lib/development-fixture";
import { getPromotedTrialForRun } from "../../../../../lib/live-evidence";

function label(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export default async function EvidencePage({
  params,
}: Readonly<{ params: Promise<{ runId: string; evidenceId: string }> }>) {
  const { runId, evidenceId } = await params;
  const trial = await getPromotedTrialForRun(runId);
  const candidate = trial?.candidates.find((item) => item.candidateId === evidenceId);
  const fixture = trial ? null : FIXTURE_EVIDENCE[evidenceId];

  if (!candidate && !fixture) notFound();

  const passed = candidate
    ? Object.values(candidate.gates).filter((status) => status === "passed").length
    : 0;
  const total = candidate ? Object.keys(candidate.gates).length : 0;
  const claim = candidate
    ? `${label(candidate.strategy)} was ${candidate.disposition} after ${passed}/${total} hard gates passed.`
    : fixture?.claim;

  return (
    <div className="run-page evidence-page">
      <section className="run-page__intro">
        <div>
          <p className="section-kicker">Evidence record</p>
          <h1>{claim}</h1>
          <p>
            {candidate ? label(candidate.strategy) : fixture?.candidate} ·{" "}
            {candidate ? "authenticated recorded trial" : "development fixture"}
          </p>
        </div>
        <StatusBadge tone={candidate ? "live" : "replay"}>
          {candidate ? "Measured evidence" : "Synthetic evidence"}
        </StatusBadge>
      </section>

      <article className="evidence-record">
        <div className="evidence-record__field evidence-record__field--wide">
          <span>Classification</span>
          <strong>{candidate ? "measured" : fixture?.classification}</strong>
        </div>
        <div className="evidence-record__field evidence-record__field--wide">
          <span>Procedure</span>
          <p>
            {candidate
              ? "Generate a complete migration patch with the catalog-discovered NVIDIA model, execute it in a sibling Nebius Sandbox branch from the shared checkpoint, and classify all deterministic hard gates."
              : fixture?.procedure}
          </p>
        </div>
        <div className="evidence-record__field evidence-record__field--wide">
          <span>Observed result</span>
          <p>
            {candidate
              ? `${passed} of ${total} hard gates passed; disposition ${candidate.disposition}; measured branch duration ${candidate.durationMs} ms (sample size 1).`
              : fixture?.observation}
          </p>
        </div>
        <div className="evidence-record__field">
          <span>Source revision</span>
          <code>{trial?.sourceRevision ?? "6e4c1bf"}</code>
        </div>
        <div className="evidence-record__field">
          <span>Sandbox operation</span>
          <code>{candidate?.sandboxOperationId ?? "Not available — development fixture"}</code>
        </div>
        <div className="evidence-record__field evidence-record__field--wide">
          <span>Artifact</span>
          <code>
            {candidate
              ? `replay/${runId}/artifacts/sha256/${candidate.outputSha256}`
              : fixture?.artifact}
          </code>
        </div>
        <div className="evidence-record__field evidence-record__field--wide">
          <span>Content SHA-256</span>
          <code>{candidate?.outputSha256 ?? fixture?.contentSha256}</code>
        </div>
        {candidate ? (
          <div className="evidence-record__field evidence-record__field--wide">
            <span>Evidence IDs</span>
            <code>{candidate.evidenceIds.join(", ")}</code>
          </div>
        ) : null}
      </article>

      <aside className="fixture-warning">
        <strong>{candidate ? "Measured scope boundary" : "Fixture provenance boundary"}</strong>
        <p>
          {candidate
            ? "This evidence supports one bounded recorded trial only. It is not a statistical claim and does not eliminate the need for patch review."
            : "This record exists to exercise the evidence UI contract. It must not be cited as proof of Nebius, NVIDIA, Tavily, or repository execution."}
        </p>
      </aside>

      <Link className="text-link text-link--accent" href={`/runs/${runId}/workflow`}>
        ← Return to branch workflow
      </Link>
    </div>
  );
}
