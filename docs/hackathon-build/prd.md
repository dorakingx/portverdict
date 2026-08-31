# Product Requirements Document

## Product Summary

PortVerdict is a developer-facing migration workbench for moving an existing AI application to NVIDIA Nemotron on Nebius. It does not treat a successful edit or build as proof of a safe migration. It creates multiple candidate approaches from a shared starting point, runs executable checks, asks a counterexample agent to find regressions, and either recommends the strongest passing branch or explicitly abstains.

The guest experience must communicate the central claim within three minutes: one migration that looks plausible fails under adversarial evaluation, another survives, and every conclusion is connected to inspectable evidence.

## Target User

### Primary user

An AI application engineer responsible for a small Python or TypeScript service that currently uses a closed-model SDK and must evaluate a migration to an open NVIDIA model.

### Secondary user

A technical lead or reviewer who did not author the migration but must decide whether its behavioral evidence is strong enough to merge.

### Hackathon judge

A time-constrained evaluator who needs a reliable, no-login path that proves the product works and makes the role of Nebius, NVIDIA Nemotron, Token Factory Sandboxes, and Tavily immediately clear.

## Product Principles

- Evidence before confidence: every pass/fail state and number links to provenance.
- Honest state: live, replayed, partial, failed, and abstained runs are visibly different.
- One primary action: a first-time visitor should always know how to launch the sample.
- Progressive disclosure: show the verdict first, then branches, checks, sources, and raw details.
- No theater: activity indicators correspond to real recorded operations.
- Safe by default: third-party code is never executed on the web application host.

## Core User Journey

1. The visitor lands on a concise explanation and sees **Run the sample migration** as the primary action.
2. The visitor may instead paste a public GitHub URL and sees the supported-size and safety limits before starting.
3. PortVerdict validates the input, creates a named run, and shows an inventory of the detected provider integration.
4. The visitor reviews the migration goal and launches candidate exploration.
5. A live workflow view shows a shared base checkpoint and three named branches with current stage, model, elapsed time, and evidence count.
6. The visitor sees deterministic checks finish and a counterexample pass challenge each candidate.
7. The comparison view eliminates candidates that fail hard gates before showing any subjective ranking.
8. The visitor opens the winning branch, inspects the diff, documentation sources, behavioral matrix, and final rationale.
9. If no branch passes, the product presents an abstention report with exact blockers rather than a patch.
10. For a passing branch, the visitor downloads a patch; an authenticated owner may optionally create a GitHub pull request.

## Epics And User Stories

### Epic 1: Understand and start the product

- As a first-time visitor, I want to understand the migration risk and PortVerdict's promise in one screen so that I can decide whether the demo is relevant.

Acceptance criteria:

- The landing screen names the user problem without assuming knowledge of Nebius.
- The screen explains in plain language that multiple migrations are tested and may all be rejected.
- The primary sample action is visible without scrolling at common laptop and mobile sizes.
- Sponsor technologies appear in the workflow explanation, not as an isolated logo strip.
- A short safety note states that code runs in isolated Sandboxes.

- As a judge, I want a sample that needs no account or secret so that I can reach the product's core result immediately.

Acceptance criteria:

- The sample can be launched without login, payment, or credentials.
- Before launch, the sample states whether the run will be live or a labeled evidence replay.
- If live capacity is unavailable, the sample offers replay without presenting it as a live run.

### Epic 2: Select and validate a repository

- As an engineer, I want to select a built-in repository or paste a public GitHub URL so that I can define the migration target.

Acceptance criteria:

- At least one TypeScript and one Python sample are available with short descriptions of the behaviors they exercise.
- A pasted URL is normalized and previewed before any run starts.
- Invalid, private, oversized, unsupported, or unreachable repositories produce specific recovery guidance.
- The product states its supported repository size and runtime limits.
- Starting the same request twice does not create two active jobs without an explicit retry.

### Epic 3: Inspect what must be migrated

- As an engineer, I want a repository inventory so that I can verify the agent understood the existing integration before it edits code.

Acceptance criteria:

- The inventory distinguishes confirmed findings from model inferences.
- Confirmed findings link to a repository path and relevant excerpt.
- The view reports provider SDK calls, model configuration, prompts, structured-output schemas, tools, streaming, retry/error handling, and existing tests when found.
- Missing categories are shown as not detected rather than silently omitted.
- Suspected secrets are redacted and never displayed verbatim.
- The user can cancel before candidate code execution begins.

### Epic 4: Observe branchable candidate exploration

- As an engineer, I want competing migration strategies to start from the same checkpoint so that their results are meaningfully comparable.

Acceptance criteria:

- The workflow view has a visible shared root and at least three candidate branches.
- Each branch has a human-readable strategy name and one-sentence hypothesis.
- Each stage shows queued, running, passed, failed, timed out, or canceled state.
- A stage exposes its actual start/end times and associated evidence when available.
- The product clearly identifies the selected Nemotron model for each model-backed task.
- A failure in one branch does not erase completed evidence from other branches.
- Refreshing or reopening a run preserves its current and completed state.

### Epic 5: Verify behavior and attempt falsification

- As a reviewer, I want deterministic checks to run before model-based scoring so that a persuasive explanation cannot override a broken migration.

Acceptance criteria:

- Build, existing tests, migration tests, schema checks, tool-call checks, prompt fixtures, secret scan, static/security checks, and required runtime-integration evidence each have separate statuses.
- A hard-gate failure marks the candidate ineligible for selection.
- A check's status links to its command or procedure, normalized result, raw artifact reference, timestamp, and origin.
- Numeric metrics are not displayed when their provenance is missing or invalid.
- The counterexample stage states which behaviors it attempted to falsify and records every found regression.
- Timeouts and infrastructure failures are distinct from behavioral failures.

- As an engineer, I want current documentation evidence for compatibility decisions so that the patch is not based solely on remembered API behavior.

Acceptance criteria:

- Documentation research runs as part of the migration workflow when compatibility questions arise.
- Sources show title, URL, retrieval time, and the decision they support.
- Official documentation is visually prioritized.
- Retrieved text is labeled untrusted and cannot change product policy or execution limits.
- If research fails, the affected claim is marked unsupported; the product does not invent a citation.

### Epic 6: Compare candidates and receive a verdict

- As a technical lead, I want a compact comparison so that I can see why one branch is safer than the alternatives.

Acceptance criteria:

- The comparison table shows hard gates before secondary quality dimensions.
- Failed candidates remain inspectable and include a concise rejection reason.
- Subjective model-based assessment is visually separated from deterministic results.
- Behavioral parity is reported by behavior category rather than as an unexplained single score.
- Latency, tokens, resource usage, and cost appear only when measured and attributable.
- The selected branch includes a concise rationale tied to evidence.
- If every branch fails a hard gate, the verdict is **Abstained** and no branch is labeled safe to ship.

### Epic 7: Inspect and export the migration

- As an engineer, I want to inspect the selected diff and report so that I can decide whether to adopt it.

Acceptance criteria:

- The diff view groups changes by file and supports keyboard navigation.
- The report includes repository inventory, strategies, hard-gate results, parity matrix, sources, measurements, security findings, verdict, and limitations.
- Every reported metric links back to stored evidence.
- The patch download contains only the selected candidate's changes.
- The product prevents export when the verdict abstains unless the user explicitly downloads an unsafe candidate marked for investigation.
- Pull-request creation is optional and clearly separates preview from the external write action.
- A successful external action shows its destination URL; a failed action remains safely retryable.

### Epic 8: Trust the run state

- As a judge, I want to distinguish live proof from replayed evidence so that I can evaluate claims accurately.

Acceptance criteria:

- Every run has a prominent **Live** or **Evidence replay** label.
- Replay artifacts identify when the original live run occurred and preserve immutable identifiers.
- Live integrations expose redacted request/run identifiers and timestamps without credentials.
- The application health view reports web, API, and dependency readiness without leaking configuration.
- Errors have a stable reference identifier and never expose tokens, repository credentials, or private content.

## Edge Cases

- The repository has no detectable AI provider integration: stop before execution and explain what was inspected.
- The repository includes instructions attempting to override PortVerdict's policy: flag the prompt-injection content and continue only under fixed policy.
- A repository is deleted or changes after analysis: bind the run to the fetched commit and disclose that commit.
- A branch builds but changes a required schema: fail the schema gate even when other tests pass.
- A candidate has incomplete evidence because a Sandbox timed out: mark it inconclusive and ineligible, not failed behaviorally.
- Nemotron is unavailable or returns invalid structured output: retry within policy, then classify the stage failure and preserve prior evidence.
- The live model catalog differs from configured preferences: select only an allowed discovered model and show the exact identifier.
- Tavily returns no official source: show the gap and do not treat unverified content as compatibility evidence.
- A user refreshes during execution: reconnect to the existing run rather than starting over.
- A user launches the same sample repeatedly: apply rate and concurrency limits with a clear retry time.
- All candidates fail: abstain, explain the minimal next investigations, and offer no misleading green state.
- Replay evidence is missing or fails integrity checks: disable replay and show an honest unavailable state.
- Mobile viewport: preserve verdict, branch states, and primary actions; dense diffs may open in a focused view.
- Keyboard-only use: every action, branch, evidence row, dialog, and tab is reachable with visible focus.

## Empty, Loading, Error, and Partial States

- Empty: explain what input is accepted and offer the sample as the primary next action.
- Loading: name the real current operation and elapsed time; never use fabricated log messages.
- Recoverable error: preserve the run and offer a bounded retry for the failed stage.
- Fatal error: retain completed evidence and provide an exportable incident summary.
- Partial success: show passing branches and incomplete branches without collapsing them into one score.
- Canceled: stop future work, preserve evidence already generated, and show which external resources may still be shutting down.

## What We Are Building

- Anonymous built-in sample workflow.
- Small public GitHub repository workflow with clear bounds.
- Repository inventory and migration specification.
- Three comparable candidate branches.
- Deterministic hard gates plus counterexample testing.
- Source-backed compatibility evidence.
- Branch tree, activity view, comparison matrix, evidence viewer, diff, verdict, and report.
- Patch download and guarded optional pull-request action.
- Live/replay labeling, provenance, secret redaction, rate limits, and abstention.

## What We Would Add With More Time

- Private repository connections with scoped installation tokens.
- Organization policies and custom acceptance thresholds.
- Additional providers, languages, and monorepo-aware analysis.
- Human review comments and collaborative approval workflows.
- Historical migration analytics across repositories.
- Automatic canary deployment and runtime shadow traffic comparison.
- Long-running production monitoring after a migration is merged.

## Submission Proof Points

- A real shared Sandbox checkpoint forks into three visible candidates.
- A naive candidate passes compilation but fails an adversarial behavioral fixture.
- A stronger candidate is selected only after every hard gate passes.
- An intentionally unfixable sample triggers abstention.
- Exact Nemotron model identifiers and task routing are visible in run evidence.
- Tavily sources are retrieved at runtime and attached to a concrete migration decision.
- The demo can replay a previously recorded live run without pretending it is live.
- The final report refuses to display unsupported numeric claims.
