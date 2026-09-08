# Measured evaluation results

## Authenticated live suite

Recorded 2026-09-07T09:20:16.918Z; model `nvidia/nemotron-3-super-120b-a12b`; suite `suite_20260907092016_6afcbf7b`; source `b8f912021bc76a343b9bcf43bbd80f207ba253d3`. [Public evidence](https://portverdict.vercel.app/evidence/verified-live/evaluation-suite.json).

9 candidate branches in 3 independent cases. 9 builds passed, 6 building candidates had behavioral failures, 2 trials abstained. Single-shot baselines fully eligible: 1/3. No statistical-superiority claim is made.

| Case                       | Proposal                                  | Build | All tests | Hidden | Schema | Tool calls | Disposition |
| -------------------------- | ----------------------------------------- | ----- | --------- | ------ | ------ | ---------- | ----------- |
| structured-output-contract | candidate_1_minimal_compatibility         | true  | 8/8       | 2/2    | 2/2    | 1/1        | eligible    |
| structured-output-contract | candidate_2_prompt_schema_adaptation      | true  | 8/8       | 2/2    | 2/2    | 1/1        | eligible    |
| structured-output-contract | candidate_3_resilience_routing_adaptation | true  | 8/8       | 2/2    | 2/2    | 1/1        | eligible    |
| structured-output-contract | single-shot                               | true  | 8/8       | 2/2    | 2/2    | 1/1        | eligible    |
| tool-calling-contract      | candidate_1_minimal_compatibility         | true  | 7/8       | 1/2    | 2/2    | 1/1        | rejected    |
| tool-calling-contract      | candidate_2_prompt_schema_adaptation      | true  | 7/8       | 1/2    | 2/2    | 1/1        | rejected    |
| tool-calling-contract      | candidate_3_resilience_routing_adaptation | true  | 7/8       | 1/2    | 2/2    | 1/1        | rejected    |
| tool-calling-contract      | single-shot                               | true  | 7/8       | 1/2    | 2/2    | 1/1        | rejected    |
| streaming-retry-contract   | candidate_1_minimal_compatibility         | true  | 7/8       | 2/2    | 2/2    | 1/1        | rejected    |
| streaming-retry-contract   | candidate_2_prompt_schema_adaptation      | true  | 7/8       | 2/2    | 2/2    | 1/1        | rejected    |
| streaming-retry-contract   | candidate_3_resilience_routing_adaptation | true  | 7/8       | 2/2    | 2/2    | 1/1        | rejected    |
| streaming-retry-contract   | single-shot                               | true  | 7/8       | 2/2    | 2/2    | 1/1        | rejected    |

Counts are executed Python unittest methods, not the ten overlapping eligibility labels. Missing counts stay unavailable. The hidden/security gate tests adversarial behavior contracts, not a general vulnerability audit.

| Case                       | End-to-end ms | Retries | Recorded API errors | Inference estimate USD |
| -------------------------- | ------------- | ------- | ------------------- | ---------------------- |
| structured-output-contract | 23004         | 0       | 0                   | 0.0036042              |
| tool-calling-contract      | 22322         | 0       | 0                   | 0.0032487              |
| streaming-retry-contract   | 21812         | 0       | 0                   | 0.0041376              |

Per-proposal provider token usage, latency, raw Sandbox resource fields, request IDs, output hashes, and Tavily sources are in [results.json](results.json).

### Limitations

- Three pinned Python adapters, one completed suite; not a production-repository or cross-model benchmark.
- Tournament may receive bounded syntax/schema repairs; baseline receives one proposal plus at most one JSON-schema repair, never behavior-test feedback.
- Regressions caught counts building candidates with at least one failing executed behavior test; redundant hard-gate labels are not double counted.
- Costs cover recorded suite inference only, excluding earlier attempts, smoke, Sandbox and Tavily. This is not a total bill.
- End-to-end latency covers each recorded case, not earlier failed development runs; see the retained attempt ledger.
- Model API errors absent from this completed suite are not evidence that earlier calls never failed.

## Local contract preflight (separate tier)

Ten synthetic TypeScript/Python marker fixtures; no sponsor API calls. Stored naive baseline passes 0/10; the stored tournament selects 9/10 and abstains 1/10. These validate harness mechanics, not live model quality. [Local record](local-contract-results.json).
