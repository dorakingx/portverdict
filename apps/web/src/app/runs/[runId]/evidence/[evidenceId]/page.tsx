import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBadge } from "../../../../../components/status-badge";
import { FIXTURE_EVIDENCE } from "../../../../../lib/development-fixture";

export default async function EvidencePage({
  params,
}: Readonly<{ params: Promise<{ runId: string; evidenceId: string }> }>) {
  const { runId, evidenceId } = await params;
  const evidence = FIXTURE_EVIDENCE[evidenceId];

  if (!evidence) notFound();

  return (
    <div className="run-page evidence-page">
      <section className="run-page__intro">
        <div>
          <p className="section-kicker">Evidence record</p>
          <h1>{evidence.claim}</h1>
          <p>{evidence.candidate} · development fixture</p>
        </div>
        <StatusBadge tone="replay">Synthetic evidence</StatusBadge>
      </section>

      <article className="evidence-record">
        <div className="evidence-record__field evidence-record__field--wide">
          <span>Classification</span>
          <strong>{evidence.classification}</strong>
        </div>
        <div className="evidence-record__field evidence-record__field--wide">
          <span>Procedure</span>
          <p>{evidence.procedure}</p>
        </div>
        <div className="evidence-record__field evidence-record__field--wide">
          <span>Observed result</span>
          <p>{evidence.observation}</p>
        </div>
        <div className="evidence-record__field">
          <span>Source revision</span>
          <code>6e4c1bf</code>
        </div>
        <div className="evidence-record__field">
          <span>Sandbox operation</span>
          <code>Not available — development fixture</code>
        </div>
        <div className="evidence-record__field evidence-record__field--wide">
          <span>Artifact</span>
          <code>{evidence.artifact}</code>
        </div>
        <div className="evidence-record__field evidence-record__field--wide">
          <span>Content SHA-256</span>
          <code>{evidence.contentSha256}</code>
        </div>
      </article>

      <aside className="fixture-warning">
        <strong>Fixture provenance boundary</strong>
        <p>
          This record exists to exercise the evidence UI contract. It must not be cited as proof of
          Nebius, NVIDIA, Tavily, or repository execution.
        </p>
      </aside>

      <Link className="text-link text-link--accent" href={`/runs/${runId}/workflow`}>
        ← Return to branch workflow
      </Link>
    </div>
  );
}
