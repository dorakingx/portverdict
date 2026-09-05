# Title

PortVerdict

## One-line Summary

An evidence-first model-migration agent that compares candidate branches, rejects behavioral regressions, and abstains when no migration is safe.

## Problem

AI-provider migrations can compile while silently breaking streaming chunks, structured output, tool arguments, retries, timeouts, and error behavior. A single plausible patch is not enough evidence that a migration is safe.

## Solution

PortVerdict treats migration as a controlled experiment. It inventories the provider boundary, creates three candidate strategies from a common checkpoint, evaluates each with deterministic compatibility gates, preserves rejected and inconclusive branches, and selects a candidate only if every hard gate passes. If no candidate qualifies, it abstains.

The public build currently presents a clearly labeled synthetic development replay. It demonstrates the complete evidence and decision contract, but it is not an authenticated Nebius Token Factory, Token Factory Sandbox, NVIDIA-model, or Tavily run.

## Why This Matters

Teams need to know whether an AI migration preserved behavior, not merely whether generated code looks convincing. PortVerdict makes each verdict inspectable and ties claims to artifacts, timestamps, hashes, test outcomes, and source revisions.

## How We Used AI

The repository implements a catalog-bound Token Factory model router and structured generation path intended to produce three distinct migration strategies. It also implements a counterexample stage and deterministic gates that prevent model confidence from overriding executable failures.

No authenticated Token Factory or NVIDIA-model execution has been completed for the current public replay. Therefore this draft makes no claim about a model ID, request ID, output quality, latency, token usage, or comparative model performance.

## How We Used Codex

Codex helped inspect the existing repository, formalize the state machine and evidence contracts, implement and test the Token Factory, Sandbox, and Tavily adapters, strengthen redaction and replay integrity, add deterministic migration fixtures, run TypeScript and browser checks, and prepare the public deployment and submission material. Codex-generated changes remained subject to executable tests and source review.

## Key Features

- Three comparable migration candidates with a shared-checkpoint invariant.
- Deterministic build, test, schema, tool-call, streaming, retry, security, and provenance gates.
- Explicit rejected, inconclusive, eligible, selected, and abstained outcomes.
- Append-only evidence records with hashes, redaction, and replay-manifest verification.
- Catalog-driven Token Factory, Sandbox, and Tavily adapters implemented behind server-only configuration.
- Guest-accessible replay UI with comparison, evidence, diff, report, resumable events, and guarded patch export.
- Ten deterministic TypeScript and Python migration probes.

## Architecture

PortVerdict is a TypeScript/pnpm monorepo with a Next.js control plane. A pure reducer owns run transitions; service adapters own bounded external effects; the evidence store owns integrity and redaction; and the evaluator owns eligibility and abstention. The intended live owner workflow is Token Factory catalog and NVIDIA inference, Tavily official-source research, and three sibling Token Factory Sandbox branches. The public Vercel application serves sanitized immutable replay data rather than holding a long-running tournament request open.

## Testing Instructions

1. Open <https://portverdict.vercel.app> without signing in.
2. Launch the sample replay and confirm the page labels it as a synthetic development fixture.
3. Inspect the shared checkpoint and all three candidate branches.
4. Open comparison, evidence, diff, and report views.
5. Confirm rejected and inconclusive candidates remain visible and that unsupported claims are not presented as live measurements.
6. Check <https://portverdict.vercel.app/status> or `/api/ready`; sponsor services should honestly report unconfigured until authenticated evidence exists.
7. For local verification, use Node.js 24 and pnpm 11.19.0, then run `pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm benchmark`, and `pnpm test:e2e`.

## Public Demo Link

<https://portverdict.vercel.app>

## Public Repository Link

<https://github.com/dorakingx/portverdict>

## Demo Video

**TODO — required by the event.** No public YouTube video currently exists. A truthful video can demonstrate the synthetic replay and implemented architecture, but it cannot state that Nebius or NVIDIA inference ran without authenticated evidence.

## Screenshot Shot List

1. Landing page and explicit evidence-replay disclosure.
2. Shared checkpoint with three candidate branches.
3. Gate-first comparison with rejected and inconclusive outcomes.
4. Evidence/provenance view.
5. Verdict, report, and guarded export.

Existing captures are stored under `submission/screenshots/`.

## Submission Readiness Notes

**Not ready for this hackathon.** The official requirements say every entry must run on Nebius Token Factory or Nebius AI Cloud and use an NVIDIA open-source model. The current build has tested adapters and a synthetic replay, but no authenticated sponsor execution. The required public YouTube video and human legal attestations are also incomplete.

The project must not be represented as eligible for Best Use of Tavily: the public replay contains source-shaped fixture records, not a functional runtime Tavily API call.

## Known Limitations

- Sponsor integrations are implemented but unverified without credentials and quota.
- The public replay is synthetic and cannot establish sponsor-platform or model-quality claims.
- Anonymous live execution remains disabled; the long-running workflow is designed for a trusted owner CLI.
- Private-repository authorization, per-tenant isolation, and distributed abuse controls are future work.
- No public demo video is available yet.

## TODO Official Form Fields

- Submitter Type: **human confirmation required**
- Organization Name: **human confirmation required**
- Country of Residence: **human confirmation required**
- Canadian province or N/A: **human confirmation required**
- Track: Coding and agentic engineering
- Existing before August 26, 2026: **human confirmation required**
- Significant update explanation: The evidence-first live orchestration path, strict readiness model, replay promotion controls, and expanded verification suite were implemented during the submission period; authenticated sponsor execution is still absent.
- Models used and rationale: No authenticated NVIDIA-model run has been completed.
- Nemotron quality rating and feedback: Cannot be rated truthfully without a run.
- Prompting/fine-tuning approach: Structured prompts and schemas are implemented; no authenticated inference has been executed.
- Comparison with other models: No evidence-backed comparison is available.
- Valuable Nebius capabilities: Sandbox checkpoint branching and catalog-bound inference are implemented as architectural dependencies but not yet exercised.
- Recommendation and inference-experience ratings: Cannot be rated truthfully without a run.
- Requested improvements: A card-free, immediately provisioned hackathon sandbox and API quota would make participant validation easier.
- Tavily used: No
- Builders & Brews city: **human confirmation required or blank**
- Age and employee attestations: **human confirmation required**
