import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const json = async (file) => JSON.parse(await readFile(resolve(root, file), "utf8"));
const suite = await json("fixtures/verified-live/evaluation-suite.json");
const smoke = await json("fixtures/verified-live/sponsor-smoke.json");
const trial = await json("fixtures/verified-live/trial-summary.json");
const measured = (await json("docs/evaluations/results.json")).tiers.authenticatedLive;
if (measured.suiteIntegritySha256 !== suite.integritySha256 || suite.cases.length !== 3)
  throw new Error("Submission copy requires the measured promoted suite");
const stats = measured.aggregate;
const demo = "https://portverdict.vercel.app";
const repo = "https://github.com/dorakingx/portverdict";
const evidence = suite.cases
  .map(
    (entry) =>
      `### ${entry.caseId}\n\n- Run: \`${entry.runId}\`\n- Checkpoint: \`${entry.checkpointImageId}\`\n- Candidate operations: ${entry.candidateOperationIds.map((id) => `\`${id}\``).join(", ")}\n- Single-shot operation: \`${entry.singleShotBaseline.sandboxOperationId}\`\n- [Inspect recorded case](${demo}/runs/${entry.runId}/workflow)`,
  )
  .join("\n\n");
const description = `## Inspiration

A provider migration can compile while silently changing structured output, tool arguments, streaming usage, or retries. A confident patch is not evidence of behavioral compatibility. We wanted a migration result that another engineer can inspect and falsify.

## What it does

PortVerdict runs a controlled three-strategy migration trial for pinned Python provider adapters. An owner-run CLI obtains official compatibility context, asks a catalog-selected NVIDIA model for targeted function edits, and forks three real Nebius Sandbox operations from one immutable checkpoint. Deterministic build, behavior, adversarial contract, security-policy and provenance gates decide eligibility. If no candidate qualifies, the system abstains.

The public app serves sanitized, immutable recordings of authenticated executions. It requires no login and cannot spend visitor-triggered API credits. It is not a public arbitrary-repository migration service. The development fixture remains separately labeled and is not the submission's sponsor proof.

## How we built it

A TypeScript/pnpm monorepo combines Next.js, Zod contracts, a pure run reducer, an append-only hash-verified evidence store, and a gate-first evaluator. Python fixtures and fixed hidden contracts execute in Nebius Token Factory Sandboxes as a non-root user with networking disabled. The runner mechanically preserves unchanged source while applying model-written function definitions; it never inserts a human-authored behavioral repair.

The exact runtime model was **\`${suite.exactModelId}\`**, discovered from the authenticated Token Factory catalog. The final worker uses NVIDIA-recommended Super sampling (temperature 1.0, top-p 0.95) and the live endpoint's top-level chat-template control to disable thinking for bounded edits. Syntax-invalid final proposals are measured as build failures; valid-but-unsafe code is blocked before execution. One separate single-shot model proposal per case uses the same input, model and checkpoint, without tournament selection or behavior-test feedback.

Tavily performs functional Search and Extract calls. Exact official-domain filtering, bounded excerpts, retrieval timestamps, content hashes and request identities preserve provenance. Retrieved text is untrusted reference data, never authority to change execution policy.

## Measured results

Suite \`${suite.suiteId}\`, recorded ${suite.recordedAt}, runner commit \`${suite.portVerdictCommitSha}\`.

- ${stats.caseCount} distinct behavior cases: structured output, tool calling, and streaming/retry.
- ${stats.buildSuccesses}/${stats.candidateCount} candidate builds passed.
- ${stats.regressionsCaught} building candidates had at least one failing executed behavior test.
- ${stats.rejectedCandidates} rejected and ${stats.inconclusiveCandidates} inconclusive candidate proposals.
- ${stats.abstentions}/${stats.caseCount} trials abstained; single-shot baselines fully eligible: ${stats.singleShotEligible}/${stats.caseCount}.
- Recorded-suite inference estimate: ${stats.inferenceCostEstimateUsd === null ? "unavailable" : `$${stats.inferenceCostEstimateUsd.toFixed(6)} USD`}, from catalog pricing and provider token usage. Excludes earlier attempts, smoke, Sandbox and Tavily; not a total bill.

These are small descriptive observations, not a statistically significant improvement or cross-model benchmark. Earlier unsuccessful development attempts remain documented. Test counts unavailable after compilation/import failure remain unavailable, not invented passes. [Full measured results](${repo}/blob/main/docs/evaluations/results.md) and [immutable suite](${demo}/evidence/verified-live/evaluation-suite.json).

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

- Catalog request: \`${smoke.tokenFactory.catalogRequestId}\`.
- Smoke inference responses: ${smoke.tokenFactory.inferenceRequestIds.map((id) => `\`${id}\``).join(", ")}.
- Smoke Sandbox operation: \`${smoke.sandbox.operationId}\`.
- Primary Tavily Search: \`${trial.tavily.searchRequestId}\`; Extract: \`${trial.tavily.extractRequestId}\`.
- Primary official sources: ${trial.tavily.citations.map((source) => `[${source.title}](${source.url})`).join("; ")}.

${evidence}

## Built with

Nebius Token Factory, NVIDIA Nemotron, Token Factory Sandboxes, Tavily, Python, TypeScript, Next.js, React, Zod, Vitest, Playwright, Docker, GitHub Actions, Vercel.

## Links

- [Public demo](${demo})
- [Public Apache-2.0 repository](${repo})
`;
await writeFile(
  resolve(root, "submission/devpost-draft.md"),
  `# PortVerdict\n\nThe model migration agent that puts every candidate branch on trial.\n\nTrack: Coding and agentic engineering. Sponsor category: Best Use of Tavily.\n\n${description}`,
);
await writeFile(
  resolve(root, "devpost-submission.md"),
  `# PortVerdict\n\n## One-line Summary\n\nThe model migration agent that puts every candidate branch on trial.\n\n${description}\n## Demo Video\n\nPublic YouTube upload is pending; do not submit before the actual URL and signed-out playback are verified.\n\n## Screenshot Shot List\n\nLanding, shared-checkpoint workflow, candidate comparison, executed logs and diff, Tavily-backed report.\n\n## Submission Readiness Notes\n\nDraft only. Production verification, final video, release and legal confirmation are separate gates.\n\n## Known Limitations\n\nThree pinned Python adapters; owner-only new execution; recorded evidence expires for readiness after seven days but remains historical. No arbitrary-repository service, equal-budget comparison or statistical superiority claim.\n\n## TODO Official Form Fields\n\nEntrant type, organization if applicable, residence and Canadian province if applicable, age-of-majority and promotion-entity employment attestations, optional IRL city, official rules acceptance and explicit final Submit permission must be confirmed by the entrant after the actual assets are ready.\n`,
);
await writeFile(
  resolve(root, "submission/youtube-title.txt"),
  "PortVerdict — Put AI Model Migrations on Trial | Nebius × NVIDIA\n",
);
await writeFile(
  resolve(root, "submission/youtube-description.md"),
  `PortVerdict tests competing model-migration patches from a shared Nebius Sandbox checkpoint and selects only candidates with complete passing evidence—or abstains.\n\nThis video shows authenticated recorded execution, not a simulated sponsor integration. English narration is synthesized with macOS Samantha.\n\nDemo: ${demo}\nRepository: ${repo}\nMeasured results: ${repo}/blob/main/docs/evaluations/results.md\nEvidence: ${demo}/evidence/verified-live/evaluation-suite.json\nSuite: ${suite.suiteId}\nExact model: ${suite.exactModelId}\nRecorded: ${suite.recordedAt}\n\n${stats.caseCount} cases, ${stats.candidateCount} candidate branches, ${stats.buildSuccesses} successful builds, ${stats.abstentions} abstentions. Small descriptive sample, not a statistical superiority claim.\n\nNebius Token Factory provides catalog-bound NVIDIA inference and isolated checkpoint branching. Tavily Search and Extract provide attributable official documentation. The public viewer never receives sponsor keys and cannot launch paid runs.\n\n0:00 Migration risk\n0:15 The evidence recorder\n0:30 NVIDIA model and strategies\n0:55 Shared Sandbox checkpoint\n1:20 Executed contracts and logs\n1:45 Tavily source provenance\n2:05 Verdict and proposed diff\n2:30 Public source and reproduction\n`,
);
await writeFile(
  resolve(root, "submission/integration-feedback.md"),
  `# Evidence-based integration feedback\n\n- Model: \`${suite.exactModelId}\`, chosen from the authenticated catalog for bounded migration edits. Earlier Lightning and Super configuration diagnostics are in the attempt ledger; no controlled cross-model benchmark was run.\n- Output quality: 7/10, an engineering assessment, not a benchmark score. Useful edits and strategy diversity coexist with malformed outputs and failed contracts; see the actual ${stats.caseCount}-case results.\n- Approach: prompt engineering, fixed visible contracts, official-source context, targeted edits, bounded schema/syntax handling, deterministic hidden tests. No fine-tuning.\n- Valuable Nebius capabilities: authenticated model discovery and real non-root, network-disabled Sandbox checkpoint branching.\n- Likelihood to recommend: 8/10. Shared-state experiments are useful; activation and model-specific parameter differences added integration work.\n- Inference experience: 7/10. Working authenticated inference with attributable usage, but parameters required live validation. This is not a controlled cloud-versus-local comparison.\n- Improvements requested: expose per-model parameter support and thinking controls in catalog metadata; clarify nonterminal duration sentinels and code-generation budget guidance.\n- Nemotron next: stronger compact structured-code output and migration-contract adherence under bounded generation budgets.\n- Tavily: Yes; functional Search and Extract are recorded for each live case. Credits include bounded empty-result retries when present.\n\nRatings reflect observed engineering experience and do not replace entrant eligibility or legal answers.\n`,
);
console.log(
  JSON.stringify({
    suiteId: suite.suiteId,
    descriptionCharacters: description.length,
    filesPrepared: 5,
  }),
);
