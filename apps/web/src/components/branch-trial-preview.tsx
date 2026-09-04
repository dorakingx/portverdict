import type { TrialSummary } from "../lib/live-evidence";

import { StatusBadge } from "./status-badge";

const FIXTURE_BRANCHES = [
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
] as const;

function labelStrategy(strategy: string): string {
  return strategy
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function BranchTrialPreview({ trial }: Readonly<{ trial: TrialSummary | null }>) {
  const branches = trial
    ? trial.candidates.map((candidate) => {
        const selected =
          trial.verdict.status === "selected" &&
          trial.verdict.selectedCandidateId === candidate.candidateId;
        const passed = Object.values(candidate.gates).filter((gate) => gate === "passed").length;
        const total = Object.keys(candidate.gates).length;
        return {
          name: labelStrategy(candidate.strategy),
          status: selected
            ? "Selected"
            : candidate.disposition === "eligible"
              ? "Eligible"
              : candidate.disposition === "rejected"
                ? "Rejected"
                : "Inconclusive",
          tone:
            candidate.disposition === "eligible"
              ? ("passed" as const)
              : candidate.disposition === "rejected"
                ? ("failed" as const)
                : ("warning" as const),
          detail: `${passed}/${total} deterministic gates passed · ${candidate.durationMs} ms`,
          stages: ["Model patch", "Sandbox", `${passed}/${total} gates`, candidate.disposition],
        };
      })
    : FIXTURE_BRANCHES;

  return (
    <section className="trial-preview" aria-labelledby="trial-preview-title">
      <div className="trial-preview__header">
        <div>
          <p className="section-kicker">Recorded decision path</p>
          <h2 id="trial-preview-title">One checkpoint. Three trials.</h2>
        </div>
        <StatusBadge tone={trial ? "live" : "replay"}>
          {trial ? "Verified live" : "Development fixture"}
        </StatusBadge>
      </div>

      <div className="checkpoint-card">
        <span className="checkpoint-card__icon" aria-hidden="true">
          ◈
        </span>
        <span>
          <strong>Shared Sandbox checkpoint</strong>
          <small>Every candidate begins from identical state</small>
        </span>
        <span className="mono checkpoint-card__id">
          {trial ? trial.checkpoint.imageId : "img_base_7f2a"}
        </span>
      </div>

      <ol className="preview-branches">
        {branches.map((branch, index) => (
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
        {trial
          ? `Authenticated recorded evidence · ${trial.exactModelId} · one measured run, not a statistical claim.`
          : "This preview is a synthetic development fixture—not a claim of live sponsor API execution."}
      </p>
    </section>
  );
}
