# Devpost draft

## Project name

PortVerdict

## Tagline

The model migration agent that puts every candidate branch on trial.

## Category and sponsor prize

- Coding and Agentic Engineering
- Best Use of Tavily

## Inspiration

AI provider migrations fail in ways compilation cannot see. Streaming chunks change shape, structured output drifts, tool arguments become strings, and retry semantics disappear. A coding agent can produce a convincing patch while preserving none of those behavioral contracts. We wanted the result of a migration to be a falsifiable verdict, not a confident paragraph.

## What it does

PortVerdict inventories an AI application's provider boundary, researches current official compatibility guidance, and explores three migration strategies from one immutable Sandbox checkpoint. Each branch is built and attacked with deterministic tests for prompts, streaming, schemas, tool calls, retries, security, and source provenance. Behavioral failures are rejected, infrastructure failures remain inconclusive, and a branch is selected only when every hard gate passes. If no branch qualifies, PortVerdict abstains and explains the blockers.

The evidence flight recorder keeps losing branches visible. Reviewers can inspect the shared checkpoint, candidate stages, counterexamples, source records, diffs, and the provenance behind every reported number. Patch export is guarded, and an abstained run never exposes a normal safe-to-ship action.

## How we built it

The application is a strict TypeScript/pnpm monorepo with a Next.js 16 interface. Zod schemas validate every cross-boundary payload. A pure reducer owns idempotent run transitions. An append-only evidence store hashes artifacts, redacts secrets, and verifies replay manifests. A deterministic evaluator applies hard gates before any model-based preference and rejects unsupported numeric claims.

The Token Factory adapter discovers executable model IDs from the authenticated catalog and allows only catalog-proven NVIDIA models. The Sandbox adapter handles bounded operations, polling, resumable SSE, cancellation, non-root execution, network policy, and the invariant that all candidates descend from the same checkpoint. The Tavily adapter performs bounded search, filters to exact official HTTPS hosts, extracts only approved sources, records usage and content-free telemetry, and treats returned text as untrusted.

The public deployment currently exposes an honest synthetic evidence replay and redacted integration status. It fails closed for live repository runs until authenticated smoke evidence and anonymous-run abuse controls are present.

## Challenges

The hardest design problem was preserving epistemic boundaries. A timeout cannot be called a behavioral failure; a fluent rationale cannot override a broken tool-call schema; an unverified model name cannot become an executable ID; and a synthetic fixture cannot be presented as a sponsor API run. Those distinctions shaped the state machine, provenance model, UI language, and release checklist.

## Accomplishments

- A controlled three-branch migration tournament with explicit selection and abstention.
- Inspectable evidence for rejected and inconclusive branches, not only the winner.
- Contract-tested Token Factory, Sandbox, and Tavily adapters with bounded failure behavior.
- Ten deterministic TypeScript/Python migration probes covering five behavior families.
- Guest-accessible, keyboard-friendly replay with resumable events and guarded export.
- Non-root container, security headers, threat model, pinned CI, secret scans, and public deployment.

## What we learned

The useful unit of agentic engineering is not the patch; it is the experiment. Shared starting state makes candidates comparable, counterexamples are more valuable than self-reported confidence, and abstention is a product capability rather than a missing result. We also learned that sponsor integrations are strongest when they are structural: Sandboxes provide the controlled experimental branches, Token Factory provides catalog-bound inference, and Tavily supplies attributable current guidance for compatibility decisions.

## What's next

Add private repositories with scoped installations, per-tenant storage and authorization, distributed abuse controls for anonymous live runs, organization-specific policy gates, additional languages and providers, and post-merge canary verification.

## Built with

Nebius Token Factory, NVIDIA open-source model via Token Factory, Token Factory Sandboxes, Tavily, Next.js, React, TypeScript, Zod, Vitest, Playwright, Docker, GitHub Actions, and Vercel.

## Links

- Demo: https://portverdict.vercel.app
- Repository: https://github.com/dorakingx/portverdict
- Video: **[BLOCKED — LIVE EVIDENCE REQUIRED, THEN PUBLIC YOUTUBE UPLOAD]**

## Required live-evidence insert before submission

**[BLOCKED — LIVE EVIDENCE REQUIRED]** Replace this section only after storing and reviewing:

- exact authenticated NVIDIA model catalog ID and inference request ID;
- one real Sandbox checkpoint ID and three child operation/branch IDs;
- one functional Tavily search/extract request chain and official source URLs;
- measured gate outputs, timings, usage, and immutable replay manifest;
- public replay regenerated from that live record.

Until then, do not claim that the production replay represents sponsor API execution.
