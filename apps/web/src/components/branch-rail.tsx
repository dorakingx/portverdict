import Link from "next/link";

import type { TrialSummary } from "../lib/live-evidence";

import { StatusBadge } from "./status-badge";

type StageTone = "passed" | "failed" | "warning";

type Branch = {
  id: string;
  number: string;
  strategy: string;
  verdict: string;
  tone: StageTone;
  summary: string;
  stages: ReadonlyArray<{ label: string; detail: string; tone: StageTone }>;
};

const BRANCHES: ReadonlyArray<Branch> = [
  {
    id: "candidate-direct",
    number: "01",
    strategy: "Direct SDK port",
    verdict: "Rejected",
    tone: "failed",
    summary: "Compiled, then falsified: tool arguments changed from an object to a JSON string.",
    stages: [
      { label: "Patch", detail: "+31 −18", tone: "passed" },
      { label: "Build", detail: "Passed", tone: "passed" },
      { label: "Verify", detail: "7 / 8", tone: "failed" },
      { label: "Counterexample", detail: "Schema drift", tone: "failed" },
    ],
  },
  {
    id: "candidate-adapter",
    number: "02",
    strategy: "Prompt + schema adapter",
    verdict: "Selected",
    tone: "passed",
    summary: "Preserved streaming and tool-call behavior across every fixture hard gate.",
    stages: [
      { label: "Patch", detail: "+46 −21", tone: "passed" },
      { label: "Build", detail: "Passed", tone: "passed" },
      { label: "Verify", detail: "8 / 8", tone: "passed" },
      { label: "Counterexample", detail: "No break", tone: "passed" },
    ],
  },
  {
    id: "candidate-shim",
    number: "03",
    strategy: "Compatibility shim",
    verdict: "Inconclusive",
    tone: "warning",
    summary:
      "Sandbox evidence ended before verification completed; no behavioral judgment was inferred.",
    stages: [
      { label: "Patch", detail: "+68 −9", tone: "passed" },
      { label: "Build", detail: "Passed", tone: "passed" },
      { label: "Verify", detail: "Timed out", tone: "warning" },
      { label: "Counterexample", detail: "Not run", tone: "warning" },
    ],
  },
];

function strategyLabel(strategy: string): string {
  return strategy
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function liveBranches(trial: TrialSummary): ReadonlyArray<Branch> {
  const selectedCandidateId =
    trial.verdict.status === "selected" ? trial.verdict.selectedCandidateId : null;
  return trial.candidates.map((candidate, index) => {
    const passCount = Object.values(candidate.gates).filter((status) => status === "passed").length;
    const gateCount = Object.keys(candidate.gates).length;
    const tone =
      candidate.disposition === "eligible"
        ? ("passed" as const)
        : candidate.disposition === "rejected"
          ? ("failed" as const)
          : ("warning" as const);
    const verdict =
      candidate.candidateId === selectedCandidateId
        ? "Selected"
        : candidate.disposition === "eligible"
          ? "Eligible"
          : candidate.disposition === "rejected"
            ? "Rejected"
            : "Inconclusive";
    const buildStatus = candidate.gates.build ?? "inconclusive";
    return {
      id: candidate.candidateId,
      number: String(index + 1).padStart(2, "0"),
      strategy: strategyLabel(candidate.strategy),
      verdict,
      tone,
      summary: `${passCount}/${gateCount} hard gates passed in one Sandbox branch (${candidate.durationMs} ms).`,
      stages: [
        { label: "Patch", detail: "Generated", tone: "passed" },
        {
          label: "Build",
          detail: buildStatus === "passed" ? "Passed" : buildStatus,
          tone: buildStatus === "passed" ? "passed" : tone,
        },
        {
          label: "Verify",
          detail: `${passCount} / ${gateCount}`,
          tone,
        },
        { label: "Verdict", detail: candidate.disposition, tone },
      ],
    };
  });
}

export function BranchRail({
  runId,
  trial,
}: Readonly<{ runId: string; trial: TrialSummary | null }>) {
  const branches = trial ? liveBranches(trial) : BRANCHES;
  const evidenceCount = trial
    ? trial.candidates.reduce((count, candidate) => count + candidate.evidenceIds.length, 0)
    : 18;
  return (
    <section className="branch-rail" aria-labelledby="branch-rail-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Branch tournament</p>
          <h2 id="branch-rail-title">Same checkpoint. Different migration strategies.</h2>
        </div>
        <span className="evidence-count">
          {evidenceCount} {trial ? "measured records" : "fixture records"}
        </span>
      </div>

      <div className="shared-checkpoint">
        <span className="shared-checkpoint__glyph" aria-hidden="true">
          ◈
        </span>
        <span>
          <strong>Shared base checkpoint</strong>
          <small className="mono">
            {trial
              ? `${trial.checkpoint.imageId} · source ${trial.sourceRevision}`
              : "img_base_7f2a · source 6e4c1bf"}
          </small>
        </span>
        <StatusBadge tone="passed">{trial ? "Verified live" : "Fixture ready"}</StatusBadge>
      </div>

      <ol className="branch-list">
        {branches.map((branch) => (
          <li className={`branch-lane branch-lane--${branch.tone}`} key={branch.id}>
            <div className="branch-lane__strategy">
              <span className="branch-number">{branch.number}</span>
              <div>
                <strong>{branch.strategy}</strong>
                <p>{branch.summary}</p>
              </div>
              <StatusBadge tone={branch.tone}>{branch.verdict}</StatusBadge>
            </div>

            <ol className="branch-stages" aria-label={`${branch.strategy} recorded stages`}>
              {branch.stages.map((stage) => (
                <li className={`branch-stage branch-stage--${stage.tone}`} key={stage.label}>
                  <span>{stage.label}</span>
                  <strong>{stage.detail}</strong>
                </li>
              ))}
            </ol>

            <Link className="evidence-link" href={`/runs/${runId}/evidence/${branch.id}`}>
              Inspect {trial ? "measured" : "fixture"} evidence <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
