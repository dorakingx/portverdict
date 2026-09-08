# PortVerdict

> The model migration agent that puts every candidate branch on trial.

[Public demo](https://portverdict.vercel.app) · [System status](https://portverdict.vercel.app/status) · [Architecture](docs/architecture/README.md) · [Evaluation](docs/evaluations/methodology.md) · [Security](SECURITY.md)

PortVerdict is an evidence-first coding agent for migrating AI applications to NVIDIA models on Nebius. Instead of trusting one plausible patch, it forks three migration strategies from one immutable Sandbox checkpoint, attacks each with executable compatibility checks, and selects a branch only when every hard gate has attributable evidence. If none qualifies, it abstains.

![PortVerdict workflow showing one shared checkpoint and three candidate branches](submission/screenshots/workflow.png)

## Why it exists

A provider migration can compile while silently changing streaming, structured output, tool arguments, retries, or error semantics. Conventional code generation optimizes for a patch. PortVerdict optimizes for a defensible verdict:

1. Inventory the real provider boundary and behavior contract.
2. Discover an exact NVIDIA model ID from the authenticated Token Factory catalog.
3. Prepare dependencies once, checkpoint the isolated Nebius Sandbox, and fork three sibling strategies.
4. Build, test, replay contracts, validate schemas and tool calls, scan security, and ask a counterexample stage to falsify each candidate.
5. Reject behavioral failures, preserve infrastructure failures as inconclusive, and select only a fully eligible branch—or abstain.
6. Produce a provenance-linked report and guarded patch export without hiding losing branches.

## Judge path

The public deployment opens without an account. Its primary judge path is an immutable recording of authenticated NVIDIA inference, Tavily research, and Nebius Sandbox execution. Choose **Inspect verified live run**, then inspect Workflow, Compare, Evidence and Report. The separate synthetic development fixture is not sponsor-platform proof.

Suite `suite_20260907092016_6afcbf7b` records three pinned Python behavior cases using `nvidia/nemotron-3-super-120b-a12b`: nine builds passed, six candidates failed behavioral checks, and two trials abstained. The single-shot baseline was fully eligible in one of three cases. These are small descriptive observations, not superiority claims. [Measured results](docs/evaluations/results.md) include hashes and limitations.

The long-running tournament runs from the local owner CLI, not inside a synchronous Vercel request; visitors cannot spend sponsor credits. Evidence freshness expires after seven days; the immutable historical recording remains inspectable with an explicit stale label. This release does not implement arbitrary-repository migration or multi-tenant live execution.

## Architecture

```text
Browser / replay API
        │
        ▼
Next.js control plane
  ├── pure run reducer ─────────────> append-only evidence store
  ├── catalog-bound model router ───> Nebius Token Factory / NVIDIA model
  ├── official-source research ─────> Tavily search → filter → extract
  └── checkpoint tournament ────────> Token Factory Sandboxes
           ├── direct SDK port ───────────┐
           ├── prompt + schema adapter ───┼─> deterministic gates → select / abstain
           └── compatibility shim ────────┘
```

The browser renders validated snapshots; it never decides whether code is safe. The reducer owns state transitions, adapters own bounded side effects, the evidence store owns integrity and redaction, and the evaluator owns eligibility. Untrusted repository code is designed to execute only inside a non-root, network-disabled Sandbox branch—not on the web host.

## What is implemented

- Strict Zod schemas for runs, events, evidence, replay manifests, and HTTP contracts.
- Exhaustive, idempotent reducer with rejection, inconclusive, cancellation, retry, selection, and abstention semantics.
- Append-only evidence records, atomic snapshots, content hashes, traversal protection, redaction, and replay integrity checks.
- Provenance guard that rejects unsupported numeric claims and a gate-first deterministic evaluator.
- Runtime Token Factory catalog discovery, exact NVIDIA model binding, structured chat validation, bounded retries, and content-free telemetry.
- Sandbox operation, polling, SSE resume, cancellation, non-root execution, network policy, location validation, and shared-checkpoint invariants.
- Tavily search→exact-domain-filter→extract flow with bounded content, no redirects, retry budgets, usage capture, and untrusted-content treatment.
- Owner-run orchestrator commands for authenticated sponsor smoke, a three-case migration suite, evidence promotion, and submission preflight. The recorded suite and sanitized artifacts are in `fixtures/verified-live/`; media and final submission checks remain separate gates.
- Guest replay UI, accessible branch rail, comparison, evidence pages, report, resumable SSE API, and acknowledged unsafe patch export.
- Ten deterministic TypeScript/Python migration contract fixtures, security headers, threat model, CI, Vercel deployment, and a non-root standalone container.

## Repository map

```text
apps/web/                  Next.js guest experience and replay API
packages/agent-core/       Run state machine and reducer
packages/evaluator/        Hard gates, provenance, selection, abstention
packages/evidence-store/   Append-only artifacts, hashes, redaction
packages/model-router/     Token Factory catalog and chat adapter
packages/orchestrator/     Owner-run live trial and evidence promotion
packages/sandbox-runner/   Token Factory Sandbox adapter
packages/shared-schemas/   Cross-boundary Zod contracts
packages/tavily-research/  Official-source research adapter
fixtures/                  Ten deterministic migration probes + sample replay
docs/                      Architecture, evaluation, security, requirements
infra/                     Local Compose and Nebius-ready container boundary
submission/                Devpost draft, testing guide, media plan, screenshots
```

## Local development

Requirements: Node.js 24 and pnpm 11.19.0.

```bash
git clone https://github.com/dorakingx/portverdict.git
cd portverdict
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. Replay mode needs no credentials.

Live adapter credentials are server-side only:

- `NEBIUS_API_KEY` and `NEBIUS_AI_PROJECT` for Token Factory inference.
- `CONTREE_TOKEN` and `CONTREE_PROJECT` for Token Factory Sandboxes.
- `TAVILY_API_KEY` for runtime documentation research.

Variable presence alone does not enable public live runs. Authenticated catalog, inference, shared-checkpoint branching, and Tavily smoke evidence must pass first; anonymous live mode also needs distributed rate limiting and cleanup monitoring.

Keep `.env.local` ignored and mode `0600`. Never place a credential in a browser bundle, command argument, log, screenshot, fixture, or promoted artifact. The live verification policy permits free hackathon credits only; the repository does not authorize paid usage. Actual credit consumption can be reported only from recorded provider evidence.

## Authenticated evidence workflow

Run the live workflow only from a trusted owner environment:

```bash
pnpm sponsor:smoke
pnpm trial:live
pnpm evidence:promote
pnpm submission:verify
```

`sponsor:smoke` must authenticate and exercise the Token Factory catalog and inference API, a minimal Sandbox operation, and Tavily Search plus Extract. `trial:live` runs structured-output, tool-calling, and streaming/retry cases and creates raw evidence under the ignored `.private/evidence/<run-id>/` tree. `evidence:promote` validates invariants, redacts secret-shaped values, verifies every replay manifest, and publishes only sanitized records under `fixtures/verified-live/` and the web public evidence directory.

Readiness uses these states:

- `unconfigured`: required server credentials are absent.
- `configured-unverified`: credentials exist, but authenticated proof is absent.
- `verifying`: an owner verification is in progress.
- `verified`: fresh authenticated evidence and every integrity gate pass.
- `stale`: the promoted evidence exceeded its seven-day TTL.
- `degraded`: evidence is missing, malformed, inconsistent, or failed validation.

No readiness response includes credential values, prefixes, lengths, or private project names.

## Verification

```bash
pnpm verify
pnpm benchmark
pnpm test:e2e
pnpm secret:scan
pnpm audit --audit-level high
pnpm sponsor:smoke
pnpm trial:live
pnpm evidence:promote
pnpm submission:verify
```

The last four commands require owner credentials and are not implied by an ordinary credential-free CI pass. A skipped live integration test is never reported as authenticated success.

The local contract suite currently contains ten synthetic probes across chat, streaming, structured output, tool calling, and retry/timeout behavior in TypeScript and Python. Results are reproducible harness evidence—not sponsor-platform or model-quality claims. See [methodology](docs/evaluations/methodology.md) and [recorded results](docs/evaluations/results.md).

The production container can be checked with:

```bash
docker build -f infra/nebius/Dockerfile -t portverdict:local .
docker run --rm -p 3000:3000 --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m portverdict:local
```

## Public API

| Endpoint                                                | Purpose                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET /api/health`                                       | Process liveness without credential details                                       |
| `GET /api/ready`                                        | Redacted replay/live dependency readiness                                         |
| `POST /api/runs`                                        | Development replay launch; owner live execution stays off the public request path |
| `GET /api/runs/sample-run`                              | Immutable sample snapshot                                                         |
| `GET /api/runs/sample-run/events`                       | Resumable SSE-formatted replay via `Last-Event-ID`                                |
| `GET /api/runs/sample-run/report`                       | Watermarked synthetic Markdown report                                             |
| `GET /api/runs/sample-run/patch?acknowledgeUnsafe=true` | Explicitly acknowledged synthetic patch                                           |

## Security and evidence policy

- Secrets never enter browser bundles, model prompts, repository branches, or content-bearing telemetry.
- Repository URLs, provider origins, request sizes, output, retries, time, and candidate count are bounded.
- Retrieved documentation and model/repository output remain untrusted data; they cannot alter policy.
- Hard-gate failures cannot be overridden by a persuasive model rationale.
- Rejected and inconclusive candidates stay visible; incomplete evidence never becomes a winner.
- The replay patch is watermarked investigation-only and requires acknowledgement.

See the [threat model](docs/security/threat-model.md), [security policy](SECURITY.md), and [requirements traceability](docs/requirements-traceability.md).

## Hackathon status

The live orchestrator and evidence-promotion path are **implemented-unverified**. No exact model ID, sponsor request ID, Sandbox checkpoint, branch ID, live performance number, or Tavily runtime claim is final until an authenticated run has passed promotion and public replay verification. The final YouTube video, live-result copy, release, and Devpost draft must be produced from that same promoted record.

Legal eligibility answers, Builders & Brews participation, official-rules agreement, and authorization to press Devpost Submit are **human-confirmation-required**. Repository state, account profile data, or a pre-existing checkbox must never be treated as that confirmation.

PortVerdict targets **Coding and Agentic Engineering** and **Best Use of Tavily** in the Nebius x NVIDIA Global AI Hackathon.

## License

[Apache-2.0](LICENSE)
