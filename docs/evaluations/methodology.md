# Evaluation methodology

PortVerdict keeps two evaluation tiers separate so development-fixture results cannot be mistaken for sponsor-platform evidence.

## Tier 1: deterministic local contract preflight

`pnpm benchmark` reads ten versioned fixtures: five TypeScript and five Python cases covering chat, streaming, structured output, tool calls, and retry/timeout behavior. Every fixture stores a deliberately naive baseline, two candidate snippets, and explicit required/forbidden contract markers. The runner evaluates every snippet without network access, selects only a candidate that passes all markers, and abstains otherwise.

This tier tests the evaluator and abstention mechanics. It does **not** measure model quality, compilation success, runtime parity, Nebius latency, Sandbox resources, Tavily quality, token usage, or cost. The fixtures are small synthetic probes, not representative production repositories.

The runner records the SHA-256 digest of every fixture and of the canonical result body. `tests/benchmark-results.test.ts` verifies both integrity layers.

## Tier 2: authenticated live benchmark (blocked)

The final benchmark must repeat the same behavior families using:

1. Exact NVIDIA model IDs returned by the authenticated Token Factory model catalog.
2. A real shared Token Factory Sandbox checkpoint and three branches per case.
3. Executed build, test, schema, tool-call, security, and falsification gates.
4. Actual request IDs, timings, token usage, and Sandbox resource observations.
5. Tavily search and extract request IDs for official migration sources.

Tier 2 remains blocked until server-side credentials are supplied. No Tier 1 result may be promoted into a Tier 2 claim.

## Reproduction

```bash
pnpm benchmark
pnpm test
```

The elapsed time in `results.json` is recorded for runner diagnostics only and is intentionally not interpreted as application performance.
