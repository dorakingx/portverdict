import { StatusBadge } from "./status-badge";

const PREVIEW_BRANCHES = [
  {
    name: "Direct port",
    status: "Rejected",
    tone: "failed" as const,
    detail: "Tool arguments became a JSON string",
    stages: ["Patch", "Build", "Verify", "Schema ×"],
  },
  {
    name: "Prompt + schema adapter",
    status: "Selected",
    tone: "passed" as const,
    detail: "All hard gates preserved behavior",
    stages: ["Patch", "Build", "Verify", "Eligible ✓"],
  },
  {
    name: "Compatibility shim",
    status: "Inconclusive",
    tone: "warning" as const,
    detail: "Evidence ended at the timeout boundary",
    stages: ["Patch", "Build", "Timeout !"],
  },
];

export function BranchTrialPreview() {
  return (
    <section className="trial-preview" aria-labelledby="trial-preview-title">
      <div className="trial-preview__header">
        <div>
          <p className="section-kicker">Recorded decision path</p>
          <h2 id="trial-preview-title">One checkpoint. Three trials.</h2>
        </div>
        <StatusBadge tone="replay">Development fixture</StatusBadge>
      </div>

      <div className="checkpoint-card">
        <span className="checkpoint-card__icon" aria-hidden="true">
          ◈
        </span>
        <span>
          <strong>Shared Sandbox checkpoint</strong>
          <small>Every candidate begins from identical state</small>
        </span>
        <span className="mono checkpoint-card__id">img_base_7f2a</span>
      </div>

      <ol className="preview-branches">
        {PREVIEW_BRANCHES.map((branch, index) => (
          <li className={`preview-branch preview-branch--${branch.tone}`} key={branch.name}>
            <span className="preview-branch__number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="preview-branch__body">
              <div className="preview-branch__title">
                <strong>{branch.name}</strong>
                <StatusBadge tone={branch.tone}>{branch.status}</StatusBadge>
              </div>
              <ol className="stage-row" aria-label={`${branch.name} stages`}>
                {branch.stages.map((stage) => (
                  <li key={stage}>{stage}</li>
                ))}
              </ol>
              <p>{branch.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="fixture-disclosure">
        This preview is a synthetic development fixture—not a claim of live sponsor API execution.
      </p>
    </section>
  );
}
