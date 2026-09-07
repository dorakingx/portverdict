# Live integration notes

Status: **authenticated sponsor smoke verified on 2026-09-07; evaluation in progress**. The attempt ledger below distinguishes integration success from a completed migration evaluation.

## Authenticated attempt ledger

### 2026-09-06 — Sandbox Beta access pending

Authenticated inference and Tavily calls worked, but Sandbox `whoami` returned all execution permissions false and a minimal spawn returned HTTP 403. Supplying the actual project ID did not change this. No Sandbox success was claimed. The entrant requested Beta access; no billing setting was changed by the runner.

### 2026-09-07 — Sponsor smoke succeeded

- Run: `smoke_20260907075540_859b605b`.
- Model discovered from the authenticated catalog: `nvidia/Nemotron-3_5-Lightning`.
- Catalog request: `cc4f7b4ddfa720b10bdfd502286634ca`.
- Inference response: `chatcmpl-462e71a1`.
- Sandbox operation: `01a07ade-25a1-7083-8628-c9293f67fe8a`.
- Tavily Search: `71d01aa7-f443-4420-aca3-df419bf759aa`; Extract: `d6e7eba6-08e8-4599-83a3-523ade4082f6`.
- After the activation email, existing-key permissions were enabled and the non-root, network-disabled execution created a checkpoint. No new key was needed.

### 2026-09-07 — Initial trial rejected before Sandbox execution

Run `live_20260907075806_structured_output_dbdf45a4`, source commit `f1979488ff5494517849a7df7ed9deb9eeae7f92`, failed the local patch acceptance check. Inspection found that the check rejected any triple-backtick literal, including legitimate Python strings needed to parse fenced JSON. The wrapper check was narrowed; AST validation and the Sandbox security policy were retained. The failed run record remains in the private ledger. Per-response usage was not retained for this early attempt and is unavailable.

### 2026-09-07 — Structured generation failed its bounded repair

Run `live_20260907080033_structured_output_863bdc86`, source commit `781a6bf`, failed with `structured-output-invalid`. No successful migration or Sandbox trial was claimed. We fixed a separate repair-path defect: the JSON Schema now remains in the prompt on repair, and non-JSON content is not replayed as an assistant message. Failed model-patch outputs that pass the JSON contract are now retained with usage and request IDs, without reasoning content.

### 2026-09-07 — Bounded generation diagnostic

An authenticated diagnostic with the same catalog-selected model, `reasoning_effort: none`, JSON-object mode, and a 4,000-token completion cap returned valid JSON and a 2,420-character Python adapter in 8,510 ms. Response `chatcmpl-6aa15126`: 680 prompt tokens, 930 completion tokens, zero reported reasoning tokens, finish reason `stop`. This was a generation diagnostic, not a Sandbox or benchmark result. The same non-reasoning setting is now used for both tournament and single-shot patches. No cross-model comparison or fine-tuning was performed.

Official references: [chat completion](https://docs.tokenfactory.nebius.com/api-reference/inference/create-chat-completion), [Sandbox overview](https://docs.tokenfactory.nebius.com/sandboxes/overview). The live catalog reported USD 0.06 per million input tokens and USD 0.24 per million output tokens for the selected model. Published run costs will use recorded usage; unrecorded development-attempt costs remain unavailable.

This is the factual source for the final Devpost feedback answers. Add an entry for every authenticated attempt, including failures and inconclusive runs. Never record API keys, authorization headers, cookies, private project names, personal information, private prompts, or chain-of-thought.

### 2026-09-07 — Subsequent development attempts (all retained)

| Run suffix (UTC start)              | Source commit | Observation and correction                                                                                                                                                                                                       |
| ----------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `080530_structured_output_66b683bf` | `df99c22`     | A generated branch had an unmatched closing brace. Moved AST validation inside the bounded syntax-repair loop; no behavior-test feedback is supplied to that loop.                                                               |
| `080828_structured_output_3a50b017` | `70521cd`     | Single-shot output contained prose in the source field. Made the executable-source contract explicit in both the prompt and output schema.                                                                                       |
| `081044_structured_output_871eec76` | `420e5e4`     | Valid baseline string parsing used `.index`/`.rindex`, which the AST allowlist incorrectly rejected. Allowed pure string operations while preserving the I/O restrictions.                                                       |
| `081226_structured_output_78567201` | `6eb2239`     | The live API reports `duration: -1` while an operation is executing. Treat that sentinel as unknown only for nonterminal states; keep negative terminal durations invalid.                                                       |
| `081516_structured_output_53cddfe0` | `7ac71a7`     | All Sandbox branches executed, but the reducer rejected a live run with a pinned fixture input. Authenticated execution and input origin are independent; fixed that constraint and tested both live and replay lifecycles.      |
| `081743_structured_output_31b356a8` | `0c07aaf`     | Completed real checkpoint, three candidates and baseline. All three candidates built; all were rejected by behavioral gates, so the final state was ABSTAINED. This is an adverse evaluation result, not an integration failure. |
| `081835_tool_calling_c7e93af1`      | `0c07aaf`     | Generation stopped with `structured-output-invalid` after the bounded repair. Two earlier generated patches were retained. Added a content-free schema error category for diagnosis.                                             |

Full IDs have the prefix `live_20260907`. Private attempt records and any generated artifacts remain under `.private/evidence`; incomplete runs are not promoted as completed cases. Early failed calls without retained usage cannot be included in a reliable total development-spend figure.

At source `7830d21`, a subsequent suite completed structured output (`live_20260907082510_structured_output_df4fc842`) and tool calling (`live_20260907082630_tool_calling_30aad5df`), then stopped on streaming/retry (`live_20260907082707_streaming_retry_9875fbd5`). The content-free diagnostic was `too_big:testFocus`. At source `45a13d3`, structured output (`live_20260907082805_structured_output_d7b90b2a`) completed but tool calling (`live_20260907082847_tool_calling_3e527aa4`) stopped with `too_big:summary`.

These fields were unused model-authored commentary, not executable evidence. Removed both from the requested output; the worker now returns only the complete source. Deterministic strategy labels and test results remain the explanation. Executable tests, security policy, source validation, and winner eligibility are unchanged. This reduces schema surface instead of repeatedly increasing unused metadata limits.

At `72922f9`, structured output (`live_20260907083142_structured_output_92a62117`) completed; tool calling (`live_20260907083305_tool_calling_3e1054d8`) failed because two strategies produced identical code even after one diversity reattempt. The runner correctly refused to count duplicates as distinct candidates. Added prior candidate sources as explicitly untrusted comparison data and concrete control-flow strategy guidance. No test outputs or hidden assertions are supplied. Diversity retry tokens, request IDs, and latency are now accumulated, with a regression test preventing undercounting.

At `eb616ae`, structured output (`live_20260907083805_structured_output_caa2c7f3`) completed, but tool calling (`live_20260907084002_tool_calling_96afef15`) still produced duplicate code. Stopped whole-suite reruns and used small generation-only diagnostics. Lightning with low reasoning also failed bounded JSON parsing. These observations do not establish a controlled cross-model benchmark.

The authenticated catalog also offered `nvidia/nemotron-3-super-120b-a12b`, with USD 0.30/M input and USD 0.90/M output tokens. Its live endpoint rejected `reasoning_effort: none` and `max_completion_tokens`; it accepts low reasoning with `max_tokens`. Added a regression test for that provider-specific parameter difference. A small JSON probe succeeded in 3,266 ms with 109 total tokens. A subsequent code diagnostic (`diagnostic_super_low_1788771021868`) returned the requested match/case structure but had a malformed string delimiter; AST validation rejected it before execution. Requested `chr(96) * 3` for fence delimiters to avoid escaping confusion. Final inference is still bounded, catalog-selected, and no model output bypasses AST or behavioral gates.

The revised diagnostic succeeded (`chatcmpl-09995a9641044d82a54d94ac42ebf5b8`, 15,017 ms, 4,808 total tokens). Super sponsor smoke `smoke_20260907085301_f18d7fd1` verified all three provider integrations. The first complete-context trial (`live_20260907085414_structured_output_88665ad6`) then exhausted its 6,048-token completion budget during reasoning, leaving zero final-content characters on both bounded attempts. No reasoning text was retained or published. Increased the bounded completion allowance to 12,000 tokens (8,000 requested plus 4,000 reasoning allowance); source size, execution limits, and a USD 0.02 routing estimate cap remain enforced.

At `f1f7bdd`, structured output (`live_20260907085642_structured_output_e6e78dfa`) completed with all three builds passing and all candidates rejected by hidden contracts; the tool case (`live_20260907085849_tool_calling_6f008f39`) exhausted the enlarged completion allowance. Replaced full-file generation with targeted model-written function edits and mechanical preservation of all other source. Restored the smaller 4,000 + 2,048 completion allowance. The assembly path is unit-tested, every assembled module still passes the unchanged AST policy before Sandbox execution, and no human-written behavioral fix is substituted for model output.

## Recording rules

1. Link every observation to a private run ID during development and to a sanitized public evidence ID after promotion.
2. Separate measured facts from opinions and suggested improvements.
3. Keep failed attempts; do not replace them with only the eventual successful run.
4. Use provider-reported request IDs, usage, latency, credits, and resources when available. Leave unavailable fields explicitly unavailable rather than estimating them.
5. Record ratings only after the corresponding workflow has run. Do not default any rating to 10.
6. State the scope of every comparison. A non-controlled impression is not a benchmark.
7. Tavily may be marked as used only when Search and Extract made functional runtime calls that informed a migration decision.

## Attempt entry template

Copy this section once for each smoke, trial, retry, or deployment verification:

```markdown
### Attempt: <run ID>

- Recorded at: <ISO-8601 timestamp>
- PortVerdict commit: <full Git SHA>
- Attempt type: sponsor smoke | live evaluation | evidence promotion | production replay verification
- Outcome: succeeded | failed | inconclusive
- Exact model ID: <catalog-returned ID, if applicable>
- Evidence reference: <private path during development; public URL/hash only after promotion>

#### What happened

- Measured observations:
- What worked well:
- What fell short:
- Error or friction encountered:
- Workaround or retry, if any:
- Product decision affected:
- Remaining uncertainty:

#### Service-specific notes

- Token Factory catalog and inference:
- NVIDIA model behavior:
- Token Factory Sandboxes / ConTree:
- Tavily Search and Extract:
- Vercel public replay:
```

## Devpost feedback synthesis gate

Do not draft final answers until the promoted evidence and attempt notes support each item below.

| Official feedback topic                                 | Evidence required before answering                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Model(s) used and why that size/variant                 | Exact catalog-returned model ID, actual task, usage, latency, and selection rationale                                      |
| Nemotron output quality, 1–10                           | Observed patch validity, instruction following, retries, failures, and a non-automatic rating rationale                    |
| Fine-tuning, prompt engineering, or out-of-box approach | Exact implemented approach; do not claim fine-tuning unless it occurred                                                    |
| Comparison with other models                            | Controlled baseline/comparison if run; otherwise a clear statement that no controlled cross-model comparison was performed |
| Most valuable Nebius capabilities                       | Capabilities actually exercised, such as catalog-bound inference and Sandbox checkpoint branching                          |
| Likelihood to recommend, 1–10                           | Observed benefits and friction with a justified, non-automatic score                                                       |
| Nebius inference experience versus cloud/local, 1–10    | Measured setup/runtime observations and the limited comparison scope                                                       |
| Features or improvements requested                      | Concrete friction from the attempt ledger, not hypothetical complaints presented as experience                             |
| What to see next from Nemotron                          | A request grounded in the migration cases that were actually executed                                                      |

## Tavily contribution

For each promoted live case, record the official URL, Search request ID, Extract request ID, retrieved-at time, content hash, and the exact compatibility or migration decision the source supported. Retrieved content is untrusted reference data; it cannot change system policy or execution commands.

## Human confirmation boundary

Submitter identity, organization, residence, age, employee status, conflicts of interest, Builders & Brews attendance, official-rules agreement, and permission to submit are not integration feedback. They remain **human-confirmation-required** and must not be inferred from these notes.
