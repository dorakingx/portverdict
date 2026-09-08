# English demo narration

170-second public production capture. Voice: macOS Samantha (synthetic narration), no music. Exact model: `nvidia/nemotron-3-super-120b-a12b`. Recorded run: `live_20260907092016_structured_output_fe957f0f`.

## Scene 1: A compiling migration can still break behavior

A model migration can compile and still break behavior. Streaming, structured output, tool arguments, and retries are contracts that a plausible patch can silently change. PortVerdict puts those migrations on trial.

## Scene 2: Recorded live experiment · no account required

This is an authenticated, recorded experiment, not a mock sponsor integration. Anyone can inspect the evidence without an account. New execution stays in an owner-only runner, so public visitors cannot spend API credits.

## Scene 3: Catalog-bound model: nvidia/nemotron-3-super-120b-a12b

The runner discovers the exact NVIDIA model from the authenticated Nebius catalog. This evaluation uses Nemotron Three Super. It generates three different migration strategies: minimal compatibility, prompt and schema adaptation, and resilience. Each proposal has provider response identities, measured token usage, and a source hash. Model commentary never decides whether the code is safe.

## Scene 4: One immutable checkpoint · three real sibling operations

Nebius Token Factory Sandboxes provide the controlled experiment. All three candidate operations start from the same immutable checkpoint. The proposed code runs as a non-root user with networking disabled. Fixed tests, source hashes, operation identities, and resource observations make each branch attributable. A separate single-shot proposal is tested from that same checkpoint.

## Scene 5: Executed tests · exit codes · losing evidence retained

Here is a losing branch from the tool calling case. Its build passed, but behavioral contracts failed. The real logs preserve the failing checks, exit codes, and timings. Any failed hard gate rejects the candidate. This view keeps the proposed diff even when that branch cannot ship. A hash verified artifact backs the readable evidence.

## Scene 6: Tavily Search → official-domain filter → Extract

Tavily performs real Search and Extract calls for official compatibility guidance. The recorded evidence preserves request identities, source URLs, retrieval times, and content hashes. Bounded excerpts inform generation, but retrieved text stays untrusted and cannot change execution policy or the fixed tests.

## Scene 7: Recorded verdict: SELECTED

In this recorded case, PortVerdict selects a candidate only after every required hard gate passes. 3 of the three candidate proposals satisfied all required gates. The three-case suite covers structured output, tool calling, and streaming with retries. Results are descriptive, not a statistical claim of model superiority. Inspect the adverse outcomes and the single-shot baselines alongside the tournament.

## Scene 8: Public source · Apache-2.0 · reproducible evidence

The public repository includes the Apache licensed source, immutable evidence, reproducible tests, and the owner-run workflow. Earlier failed development attempts are documented, not hidden. PortVerdict turns a model migration into an experiment you can inspect, and a verdict you can defend.
