# Live integration notes

Status: **implemented-unverified template**. No authenticated Nebius, NVIDIA, Sandbox, or Tavily observation is recorded here yet.

This is the factual source for the final Devpost feedback answers. Add an entry for every authenticated attempt, including failures and inconclusive runs. Never record API keys, authorization headers, cookies, private project names, personal information, private prompts, or chain-of-thought.

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
