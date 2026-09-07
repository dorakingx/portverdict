# Evaluation methodology

PortVerdict keeps two evaluation tiers separate so development-fixture results cannot be mistaken for sponsor-platform evidence.

## Tier 1: deterministic local contract preflight

`pnpm benchmark` reads ten versioned fixtures: five TypeScript and five Python cases covering chat, streaming, structured output, tool calls, and retry/timeout behavior. Every fixture stores a deliberately naive baseline, two candidate snippets, and explicit required/forbidden contract markers. The runner evaluates every snippet without network access, selects only a candidate that passes all markers, and abstains otherwise.

This tier tests the evaluator and abstention mechanics. It does **not** measure model quality, compilation success, runtime parity, Nebius latency, Sandbox resources, Tavily quality, token usage, or cost. The fixtures are small synthetic probes, not representative production repositories.

The runner records the SHA-256 digest of every fixture and of the canonical result body in `local-contract-results.json`. `tests/benchmark-results.test.ts` verifies both integrity layers. `pnpm results:live` combines that separate local record with the promoted live suite in `results.json`; it verifies the public SHA256SUMS before deriving live metrics.

## Tier 2: authenticated live evaluation

Status: **implemented-unverified**. The owner-run orchestration path exists, but no Tier 2 result is final until the complete protocol below has been executed, promoted, and independently rechecked. No Tier 1 result may be promoted into a Tier 2 claim.

### Experimental unit

The final evaluation contains at least three independent behavior cases:

1. structured output and exact schema adherence;
2. tool calling and argument validity;
3. streaming plus bounded retry/error handling.

Each case fixes its input source revision and hidden tests before patch generation. For every case, PortVerdict must prepare one immutable Token Factory Sandbox checkpoint and start three distinct sibling candidate operations from that exact checkpoint. Candidate source changes must be generated through the exact NVIDIA model ID selected from the authenticated Token Factory catalog, applied inside the Sandbox, and evaluated by executed commands rather than model self-assessment.

The three-case requirement is not satisfied by reporting three behavior assertions from one aggregate fixture as three separate trials. Each reported case needs its own attributable source, checkpoint, branch operations, commands, results, and hashes.

### Baseline

At least one case also runs a single-shot, model-generated migration baseline under the same source contract and model-access policy. The baseline gets one migration proposal and no tournament selection. A deliberately broken hand-written adapter or the unmodified source is useful as a fixture control, but it is not the required single-shot migration baseline.

The baseline and tournament use the same model, visible migration contract, official-source excerpts, fixed tests, and checkpoint. The baseline receives one proposal plus at most one JSON-schema repair. Tournament candidates may also receive at most one syntax/AST repair and one diversity reattempt. No proposal receives behavior-test feedback before measurement. This is not an equal-token-budget comparison.

### Required evidence per case

- PortVerdict Git commit SHA and immutable fixture/source SHA-256;
- authenticated catalog fetch time, catalog request/fingerprint, and exact NVIDIA model ID;
- model response/request IDs, usage, latency, retries, and API errors;
- one checkpoint ID and three distinct candidate/operation IDs;
- applied source and diff hashes proving that each branch changed code;
- every executed command, exit code, duration, log hash, and artifact hash;
- build, original-test, migration-test, hidden-contract, schema, tool-call, streaming/retry, security, and evidence-completeness outcomes;
- Sandbox resource observations and cleanup outcome;
- Tavily Search and Extract request IDs, credits, official source URLs, retrieval times, content hashes, and the migration decision each source supported;
- deterministic selected/abstained verdict and a short decision summary without private chain-of-thought;
- replay-manifest SHA-256 and evidence expiry time.

### Metrics

Metrics are calculated from stored evidence, never copied from model prose:

- **Build success:** terminal build exit code equals zero.
- **Test pass rate:** passed executed Python unittest methods divided by all executed methods for that candidate or baseline; not the overlapping hard-gate count. Counts are parsed from retained runner logs and left unavailable if absent.
- **Hidden contract pass rate:** passed hidden unittest methods divided by all executed hidden methods. The gate is named `security` in the runner but tests adversarial behavior contracts, not a comprehensive vulnerability audit.
- **Schema adherence:** exact structured-output contract validations passed divided by those executed.
- **Tool-call validity:** schema-valid tool calls divided by tool calls exercised by the case.
- **Regressions caught:** building candidate proposals with at least one failed executed behavior test. Multiple overlapping hard-gate labels for the same failure are not double counted. The single-shot baseline is listed separately.
- **Abstention count:** trials whose deterministic verdict is abstained.
- **End-to-end latency:** wall-clock time from each recorded case start to its terminal verdict. Earlier failed development runs remain in the attempt ledger and are not silently folded into, or erased by, this case latency.
- **Inference token usage:** provider-reported input, output, and total tokens summed without estimating missing values.
- **Sandbox resource usage:** provider-reported duration, image size, CPU, and memory fields; unavailable fields remain `null`.
- **Retry count and API errors:** explicit attempts beyond the first and attributable provider/API failures.
- **Estimated cost:** suite inference only, using the authenticated catalog price snapshot and provider token usage. Excludes earlier attempts, smoke, Sandbox and Tavily; it is not a total development bill. Missing prices remain unavailable.

Pass-rate denominators, missing fields, infrastructure failures, and cancellations remain visible. A behavior failure is `REJECTED`; a provider outage, timeout, or missing execution proof is `INCONCLUSIVE`. Only candidates with every hard gate passed are `ELIGIBLE`. If none is eligible, the trial must abstain.

### Attempt retention and interpretation

Every authenticated attempt receives a unique run ID. Failed or interrupted attempts remain in the private development ledger even when a later retry succeeds; promotion selects a complete run for public replay but does not erase prior attempts.

Results are descriptive observations for the recorded cases. A single run, three cases, or a small free-credit sample cannot establish statistical significance or broad model superiority. Negative and inconclusive results are reported without cherry-picking.

### Promotion gate

Raw records live under the ignored `.private/evidence/<run-id>/` directory. Public evidence is generated only by `pnpm evidence:promote`, after schema validation, secret redaction, sibling-checkpoint invariants, cleanup verification, replay-manifest verification, and TTL assignment. Documentation must reference the promoted run and its hashes rather than private files.

## Reproduction

```bash
pnpm benchmark
pnpm test
pnpm sponsor:smoke
pnpm trial:live
pnpm evidence:promote
pnpm submission:verify
```

The first two commands are credential-free development checks. The last four are owner-only and credential-gated. A normal CI skip of live integration tests is not live evidence. The elapsed time in the current local `results.json` is runner diagnostics only and is intentionally not interpreted as application performance.
