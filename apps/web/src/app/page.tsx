import Link from "next/link";

import { BranchTrialPreview } from "../components/branch-trial-preview";
import { BrandMark } from "../components/brand-mark";
import { RepositoryLauncher } from "../components/repository-launcher";

const WORKFLOW_STEPS = [
  {
    number: "01",
    title: "Resolve the real migration surface",
    body: "Inventory provider calls, schemas, streaming paths, tests, and the exact source revision before a model touches code.",
  },
  {
    number: "02",
    title: "Fork strategies from one checkpoint",
    body: "Run competing Nemotron migration plans from identical Nebius Sandbox state so the comparison is controlled.",
  },
  {
    number: "03",
    title: "Falsify before you select",
    body: "Build, replay behavior contracts, attack schema and tool edges, then select only an eligible branch—or abstain.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="marketing-page">
      <header className="site-header">
        <Link aria-label="PortVerdict home" href="/">
          <BrandMark />
        </Link>
        <nav aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#evidence-preview">Evidence</a>
          <Link href="/status">Status</Link>
        </nav>
        <Link className="button button--quiet header-cta" href="/runs/sample/workflow">
          Inspect sample
        </Link>
      </header>

      <main>
        <section className="hero">
          <div className="hero__copy">
            <p className="eyebrow">Behavioral parity, tested—not assumed</p>
            <h1>A migration can compile—and still break behavior.</h1>
            <p className="lede">
              PortVerdict forks competing Nemotron migration strategies from one isolated
              checkpoint, attacks them with executable parity tests, and ships only evidence-backed
              code.
            </p>
            <RepositoryLauncher />
            <div className="hero__trust" aria-label="Sample properties">
              <span>✓ No login</span>
              <span>◇ Isolated execution design</span>
              <span>! Can abstain</span>
            </div>
            <p className="hero__disclosure">
              Current sample: <strong>synthetic development replay</strong>. Live Nebius, NVIDIA,
              and Tavily evidence will replace it after authenticated verification.
            </p>
          </div>
          <div className="hero__visual" id="evidence-preview">
            <BranchTrialPreview />
          </div>
        </section>

        <section className="proof-strip" aria-label="Workflow contract">
          <p>Decision contract</p>
          <dl>
            <div>
              <dt>03</dt>
              <dd>Sibling branches</dd>
            </div>
            <div>
              <dt>10</dt>
              <dd>Deterministic hard gates</dd>
            </div>
            <div>
              <dt>01</dt>
              <dd>Shared checkpoint</dd>
            </div>
            <div>
              <dt>0</dt>
              <dd>Unsupported safe-to-ship claims</dd>
            </div>
          </dl>
        </section>

        <section className="workflow-section" id="how-it-works">
          <div className="workflow-section__intro">
            <p className="section-kicker">A controlled migration trial</p>
            <h2>From repository to verdict without hiding the losing branches.</h2>
            <p>
              Models propose. Sandboxes execute. Deterministic gates decide. Every conclusion
              remains connected to a procedure, artifact, source revision, and hash.
            </p>
          </div>
          <ol className="workflow-steps">
            {WORKFLOW_STEPS.map((step) => (
              <li key={step.number}>
                <span className="mono">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="abstention-section">
          <div>
            <p className="section-kicker">Safety is a product state</p>
            <h2>No complete evidence? No winner.</h2>
          </div>
          <p>
            PortVerdict separates behavioral rejection from infrastructure failure. If every branch
            fails, times out, or loses provenance, it abstains instead of manufacturing confidence.
          </p>
          <Link className="text-link text-link--accent" href="/runs/sample/report">
            See the fixture verdict <span aria-hidden="true">→</span>
          </Link>
        </section>
      </main>

      <footer className="site-footer">
        <BrandMark />
        <p>Migration assurance for AI applications.</p>
        <p className="mono">Apache-2.0 · Built for Nebius × NVIDIA Global AI Hackathon</p>
      </footer>
    </div>
  );
}
