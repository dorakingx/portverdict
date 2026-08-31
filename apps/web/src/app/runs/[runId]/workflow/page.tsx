import { BranchRail } from "../../../../components/branch-rail";
import { StatusBadge } from "../../../../components/status-badge";

export default async function WorkflowPage({
  params,
}: Readonly<{ params: Promise<{ runId: string }> }>) {
  const { runId } = await params;

  return (
    <div className="run-page">
      <section className="run-page__intro">
        <div>
          <p className="section-kicker">Recorded workflow</p>
          <h1>Migration trial</h1>
          <p>
            The fixture below demonstrates the complete decision contract. Values are synthetic and
            cannot be presented as live sponsor evidence.
          </p>
        </div>
        <StatusBadge tone="replay">Replay complete</StatusBadge>
      </section>

      <section className="inventory-panel" aria-labelledby="inventory-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Repository inventory</p>
            <h2 id="inventory-title">Migration surface confirmed before patching</h2>
          </div>
          <span className="mono">source 6e4c1bf</span>
        </div>
        <dl className="inventory-grid">
          <div>
            <dt>Provider boundary</dt>
            <dd className="mono">src/weather-agent.ts:42</dd>
          </div>
          <div>
            <dt>Behavior contract</dt>
            <dd>Streaming tool call + typed arguments</dd>
          </div>
          <div>
            <dt>Verification</dt>
            <dd>8 deterministic fixture cases</dd>
          </div>
          <div>
            <dt>Target constraint</dt>
            <dd>Catalog-discovered NVIDIA model only</dd>
          </div>
        </dl>
      </section>

      <BranchRail runId={runId} />
    </div>
  );
}
