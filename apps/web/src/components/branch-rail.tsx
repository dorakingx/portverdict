import Link from "next/link";

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

export function BranchRail({ runId }: Readonly<{ runId: string }>) {
  return (
    <section className="branch-rail" aria-labelledby="branch-rail-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Branch tournament</p>
          <h2 id="branch-rail-title">Same checkpoint. Different migration strategies.</h2>
        </div>
        <span className="evidence-count">18 fixture records</span>
      </div>

      <div className="shared-checkpoint">
        <span className="shared-checkpoint__glyph" aria-hidden="true">
          ◈
        </span>
        <span>
          <strong>Shared base checkpoint</strong>
          <small className="mono">img_base_7f2a · source 6e4c1bf</small>
        </span>
        <StatusBadge tone="passed">Fixture ready</StatusBadge>
      </div>

      <ol className="branch-list">
        {BRANCHES.map((branch) => (
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
              Inspect fixture evidence <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
