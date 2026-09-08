# PortVerdict

## One-line Summary

The model migration agent that puts every candidate branch on trial.

## Inspiration

A provider migration can compile while silently changing structured output, tool arguments, streaming usage, or retries. A confident patch is not evidence of behavioral compatibility. We wanted a migration result that another engineer can inspect and falsify.

## What it does

PortVerdict runs a controlled three-strategy migration trial for pinned Python provider adapters. An owner-run CLI obtains official compatibility context, asks a catalog-selected NVIDIA model for targeted function edits, and forks three real Nebius Sandbox operations from one immutable checkpoint. Deterministic build, behavior, adversarial contract, security-policy and provenance gates decide eligibility. If no candidate qualifies, the system abstains.

The public app serves sanitized, immutable recordings of authenticated executions. It requires no login and cannot spend visitor-triggered API credits. It is not a public arbitrary-repository migration service. The development fixture remains separately labeled and is not the submission's sponsor proof.

## How we built it

A TypeScript/pnpm monorepo combines Next.js, Zod contracts, a pure run reducer, an append-only hash-verified evidence store, and a gate-first evaluator. Python fixtures and fixed hidden contracts execute in Nebius Token Factory Sandboxes as a non-root user with networking disabled. The runner mechanically preserves unchanged source while applying model-written function definitions; it never inserts a human-authored behavioral repair.

The exact runtime model was **`nvidia/nemotron-3-super-120b-a12b`**, discovered from the authenticated Token Factory catalog. The final worker uses NVIDIA-recommended Super sampling (temperature 1.0, top-p 0.95) and the live endpoint's top-level chat-template control to disable thinking for bounded edits. Syntax-invalid final proposals are measured as build failures; valid-but-unsafe code is blocked before execution. One separate single-shot model proposal per case uses the same input, model and checkpoint, without tournament selection or behavior-test feedback.

Tavily performs functional Search and Extract calls. Exact official-domain filtering, bounded excerpts, retrieval timestamps, content hashes and request identities preserve provenance. Retrieved text is untrusted reference data, never authority to change execution policy.

## Measured results

Suite `suite_20260907092016_6afcbf7b`, recorded 2026-09-07T09:20:16.918Z, runner commit `b8f912021bc76a343b9bcf43bbd80f207ba253d3`.

- 3 distinct behavior cases: structured output, tool calling, and streaming/retry.
- 9/9 candidate builds passed.
- 6 building candidates had at least one failing executed behavior test.
- 6 rejected and 0 inconclusive candidate proposals.
- 2/3 trials abstained; single-shot baselines fully eligible: 1/3.
- Recorded-suite inference estimate: $0.010991 USD, from catalog pricing and provider token usage. Excludes earlier attempts, smoke, Sandbox and Tavily; not a total bill.

These are small descriptive observations, not a statistically significant improvement or cross-model benchmark. Earlier unsuccessful development attempts remain documented. Test counts unavailable after compilation/import failure remain unavailable, not invented passes. [Full measured results](https://github.com/dorakingx/portverdict/blob/main/docs/evaluations/results.md) and [immutable suite](https://portverdict.vercel.app/evidence/verified-live/evaluation-suite.json).

## Challenges

The hardest part was making boundaries honest: a provider timeout is not a code failure, a compiling patch is not compatible behavior, and stored fixture data is not live sponsor execution. Real integration exposed endpoint-specific inference parameters, a pending Sandbox duration sentinel, JSON/code escaping problems, duplicate proposals, and overly narrow source validation. The attempt ledger records these issues, including our own configuration mistakes. The final design uses bounded targeted edits and retains adverse outcomes.

## Accomplishments

Real NVIDIA inference, functional Tavily research, shared-checkpoint Sandbox branching, all three live behavior cases, attributable single-shot baselines, and inspectable logs/diffs are connected to the public evidence recorder. There is no model rationale capable of overriding a failed hard gate. The project also retains ten credential-free synthetic contract probes, automated browser/accessibility checks, integrity validation, secret scans, and a non-root container.

## What we learned

The useful unit is the experiment, not the patch. Identical starting state makes candidate comparisons inspectable; a failing counterexample is more useful than self-reported confidence. Model-specific serving defaults need live verification. Narrow edit scope preserves known-good code and makes failures easier to attribute. Abstention is an explicit product outcome.

## How we used Codex

Codex helped turn the participant's brief into scope, requirements, a technical specification and a sequenced checklist. It implemented and tested the state machine, adapters and public replay, diagnosed real provider parameter mismatches, retained unsuccessful attempts, and derived the result tables from verified artifacts. The participant supplied account access and sponsor activation. Codex does not replace the entrant's legal attestations or final submission confirmation.

## Testing instructions

Open the public demo without an account and choose Inspect verified live run (Inspect recorded live run after freshness expires). Inspect Workflow, Compare, Evidence and Report. The structured-output case selects an eligible candidate; the other two cases abstain. Exact case links are below. The public viewer never launches paid execution. Clone the repository, install locked dependencies with pnpm, then run pnpm verify and pnpm test:e2e. See submission/testing-instructions.md for commands and limitations.

## What's next

Generalize beyond pinned adapters: scoped private-repository access, per-tenant authorization/storage, more languages and provider contracts, cost-enforced run admission, and post-merge canary checks. The current evidence does not claim these future capabilities already exist.

## Sponsor evidence

- Catalog request: `84687012b45168b2955c77e7ecfcc389`.
- Smoke inference responses: `chatcmpl-3de3ab1f404c46768b73c6bcde71e3bc`.
- Smoke Sandbox operation: `01a07b12-4646-70d5-9cd3-3fd28d03192c`.
- Primary Tavily Search: `6ba67a65-b788-462b-88f2-99d210197e4c`; Extract: `43e8ebc0-b369-41e3-bc2a-853f1c1e2a9e`.
- Primary official sources: [Structured output & JSON - Nebius Token Factory documentation](https://docs.tokenfactory.nebius.com/ai-models-inference/json); [Text generation - Nebius Token Factory documentation](https://docs.tokenfactory.nebius.com/api-reference/examples/text-generation); [Image generation - Nebius Token Factory documentation](https://docs.tokenfactory.nebius.com/api-reference/examples/image-generation).

### structured-output-contract

- Run: `live_20260907092016_structured_output_fe957f0f`
- Checkpoint: `a5f4ee5a-4a9d-43ce-8e89-88eb829da30b`
- Candidate operations: `01a07b2b-5c8e-707b-83df-e54dbcbf8212`, `01a07b2b-5c91-7127-8fb7-fce71d34f07e`, `01a07b2b-5ee0-7398-ad26-1b9781f2e2f6`
- Single-shot operation: `01a07b2b-6006-75b8-8c1e-672890a47b71`
- [Inspect recorded case](https://portverdict.vercel.app/runs/live_20260907092016_structured_output_fe957f0f/workflow)

### tool-calling-contract

- Run: `live_20260907092039_tool_calling_01e67058`
- Checkpoint: `33e951f6-aa57-4d89-ac43-fc927702125c`
- Candidate operations: `01a07b2b-b43d-7420-849b-fab8ae60ab0d`, `01a07b2b-b43b-754f-bcb8-576ee62624ce`, `01a07b2b-b65e-737c-ac45-607ea95c84f4`
- Single-shot operation: `01a07b2b-b78e-74a2-a15a-167d98a72891`
- [Inspect recorded case](https://portverdict.vercel.app/runs/live_20260907092039_tool_calling_01e67058/workflow)

### streaming-retry-contract

- Run: `live_20260907092102_streaming_retry_de3e3674`
- Checkpoint: `d35afebd-6f37-4b3e-8930-4db0606dd54d`
- Candidate operations: `01a07b2c-0d94-7275-bc61-20369fe4c945`, `01a07b2c-0d9c-7543-8ea6-c304951673ac`, `01a07b2c-1028-7754-af9d-610725074e2f`
- Single-shot operation: `01a07b2c-115b-7195-a931-6d5003f2bea7`
- [Inspect recorded case](https://portverdict.vercel.app/runs/live_20260907092102_streaming_retry_de3e3674/workflow)

## Built with

Nebius Token Factory, NVIDIA Nemotron, Token Factory Sandboxes, Tavily, Python, TypeScript, Next.js, React, Zod, Vitest, Playwright, Docker, GitHub Actions, Vercel.

## Links

- [Public demo](https://portverdict.vercel.app)
- [Public Apache-2.0 repository](https://github.com/dorakingx/portverdict)

## Demo Video

Public YouTube upload is pending; do not submit before the actual URL and signed-out playback are verified.

## Screenshot Shot List

Landing, shared-checkpoint workflow, candidate comparison, executed logs and diff, Tavily-backed report.

## Submission Readiness Notes

Draft only. Production verification, final video, release and legal confirmation are separate gates.

## Known Limitations

Three pinned Python adapters; owner-only new execution; recorded evidence expires for readiness after seven days but remains historical. No arbitrary-repository service, equal-budget comparison or statistical superiority claim.

## TODO Official Form Fields

Entrant type, organization if applicable, residence and Canadian province if applicable, age-of-majority and promotion-entity employment attestations, optional IRL city, official rules acceptance and explicit final Submit permission must be confirmed by the entrant after the actual assets are ready.
