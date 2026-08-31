# Build Checklist

## Build Preferences

- **Build mode:** Autonomous (locked once implementation begins)
- **Comprehension checks:** N/A; the participant requested an autonomous principal-engineer workflow
- **Git:** Commit after each coherent, verified milestone; never commit secrets or fabricated evidence
- **Verification:** Continuous automated verification; no optional look-at-it pauses. Stop only for credentials, legal attestations, paid-resource approval, account-bound uploads, or an external write that requires confirmation
- **Check-in cadence:** Speed-run with concise progress updates at meaningful milestones
- **Wow moment:** A plausible migration compiles but is rejected by a tool/schema counterexample; a sibling branch from the same Sandbox checkpoint passes every hard gate and reaches an evidence-backed verdict

## Checklist

- [x] **1. Establish the repository, workspace, and safety baseline**
      Spec ref: `spec.md > Stack`, `File Structure`, `Security Architecture`
      What to build: Initialize the pnpm workspace, Next.js app, modular packages, strict shared TypeScript configuration, `.gitignore`, `.env.example`, Apache-2.0 license, security headers, formatting/lint/test scripts, and CI skeleton. Create the required docs/submission/infra directories.
      Acceptance: A clean install and minimal production build succeed with no secrets tracked; the public license and environment contract are explicit.
      Verify: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and a tracked-secret scan.

- [x] **2. Implement validated domain schemas and the run state machine**
      Spec ref: `spec.md > Domain Model`, `Architecture > Run state machine`, `HTTP And Event Contracts`
      What to build: Zod schemas for runs, candidates, evidence, gates, events, API payloads, and replay manifests; implement a pure exhaustive reducer, commands, idempotency, retries, cancellation, terminal states, and versioning.
      Acceptance: Behavioral failure, infrastructure failure, cancellation, selection, and abstention are distinct; invalid or out-of-order events cannot mutate state.
      Verify: Unit tests covering every valid transition, rejected transition, duplicate event, retry boundary, cancel path, and all-branches-fail path.

- [x] **3. Build the evidence store, provenance guard, evaluator, and model router**
      Spec ref: `spec.md > Evidence store`, `Evaluator and provenance guard`, `Model router`
      What to build: Append-only event/artifact persistence, atomic snapshots, replay integrity manifests, redaction, unsupported-number guard, hard-gate evaluator, parity categories, deterministic selection/abstention, catalog-driven routing, and structured telemetry.
      Acceptance: No number reaches a report without measured provenance; failed/inconclusive hard gates cannot be overridden by a model rationale; no unverified model ID is selectable.
      Verify: Store crash/integrity tests, provenance-negative tests, gate-precedence tests, and router catalog/fallback/budget tests.

- [x] **4. Create the honest sample evidence replay**
      Spec ref: `spec.md > Data Flow`, `Demo And Submission Flow`
      What to build: A schema-valid sample run with immutable source revision, shared checkpoint, three candidate branches, one schema/tool failure, one inconclusive branch, one selected branch, Tavily source records, diff, report, and patch. Mark every artifact synthetic/placeholder until replaced by a recorded authenticated live run; do not claim sponsor API execution yet.
      Acceptance: Replay mode exercises the complete UI contract while remaining unmistakably labeled as development fixture evidence.
      Verify: Manifest hash validation, fixture schema tests, negative tamper test, and a full reducer replay to the expected verdict.

- [x] **5. Build the landing, repository selection, and run shell**
      Spec ref: `spec.md > Marketing and repository selection`, `Visual System`; `prd.md > Epic 1`, `Epic 2`, `Epic 8`
      What to build: Evidence Flight Recorder landing page, one-click sample launch, public repository input with bounds, live/replay disclosure, persistent run identity bar, status route, loading/empty/error states, and responsive navigation.
      Acceptance: A judge reaches the sample without login; the primary action is above the fold; mode, source commit, run ID, and verdict remain visible; mobile/keyboard flows work.
      Verify: Component tests plus Playwright at 390×844, 768×1024, and 1440×900, including keyboard-only and reduced-motion runs.

- [x] **6. Build the branch workflow and evidence experience**
      Spec ref: `spec.md > Run shell and accessible branch rail`, `Evidence, comparison, diff, and report UI`; `prd.md > Epic 3`, `Epic 4`, `Epic 5`
      What to build: Repository inventory, shared-checkpoint rail, three semantic candidate lanes, stage nodes, replay scrubber, SSE-compatible client island, evidence sheet/deep links, provenance chain, source cards, raw redacted artifacts, and accurate partial/timeout/failure states.
      Acceptance: Rejected branches remain visible; evidence opens from every claim; status uses icon+text+color; no fake activity or chain-of-thought appears.
      Verify: UI state matrix tests, screen-reader semantics, focus return, SSE resume simulation, and screenshot review.

- [x] **7. Build comparison, verdict, diff, report, and guarded export**
      Spec ref: `spec.md > Evaluator and provenance guard`, `GitHub integration`, `Demo And Submission Flow`; `prd.md > Epic 6`, `Epic 7`
      What to build: Gate-first comparison, behavioral matrix, deterministic verdict hero, accessible unified diff, report export, patch download, abstention behavior, and pull-request preview/confirm boundary.
      Acceptance: Only an eligible branch is called selected; abstention never exposes a normal safe-to-ship action; every metric/source links to evidence; pull-request writes require confirmation.
      Verify: Selected and abstained E2E flows, patch content test, unsafe-export acknowledgement test, and report provenance validation.

- [ ] **8. Implement and contract-test live Token Factory, Sandbox, and Tavily adapters**
      Spec ref: `spec.md > External APIs And Dependencies`, `AI Usage`, `Data Flow`
      What to build: Authenticated model catalog and chat clients, exact-ID router binding, Zod-validated structured calls, Sandbox operation/poll/SSE/cancel/checkpoint branching, Tavily search→filter→extract policy, retry budgets, request telemetry, and redacted readiness.
      Acceptance: Unit/contract tests pass without credentials; live smoke tests use real server-side credentials when supplied; three candidates demonstrably derive from one real checkpoint; Tavily makes a functional runtime call.
      Verify: Captured contract fixtures, mocked failure tests, then authenticated catalog/inference/Sandbox-branch/Tavily smoke scripts. This item pauses only if credentials or quota are unavailable.

- [x] **9. Add ten migration fixtures and run the baseline comparison**
      Spec ref: `spec.md > Verification Matrix`; `prd.md > Submission Proof Points`
      What to build: Five TypeScript and five Python fixtures covering chat, streaming, structured output, tool calls, retries/timeouts, plus single-shot baseline and branch-and-verify runners. Store raw results, methodology, provenance, and charts generated from data.
      Acceptance: Results are reproducible and honest; branch-and-verify is improved if possible but remaining failures/abstentions are reported without selection bias.
      Verify: `pnpm benchmark`, schema validation of `results.json`, repeated-trial consistency checks, and regenerated docs/charts from stored results.

- [ ] **10. Harden security, reliability, accessibility, and CI**
      Spec ref: `spec.md > Security Architecture`, `Risks And Verification`
      What to build: Threat model, `SECURITY.md`, input limits, rate/concurrency controls, source/domain allowlists, prompt-injection fixtures, redaction, secure headers, timeout/cancel cleanup, dependency/license/secret scans, end-to-end accessibility, and CI quality gates.
      Acceptance: No critical finding remains; untrusted code never executes on the app host; CI runs build, lint, types, unit/integration/E2E, accessibility, and scans.
      Verify: Full CI-equivalent local command, dependency audit, license report, secret scan across working tree and Git history, Playwright/axe, and malicious-input tests.

- [ ] **11. Deploy, verify public judge access, and replace fixture claims with live evidence**
      Spec ref: `spec.md > Deployment`, `Demo And Submission Flow`
      What to build: Production container, Nebius Endpoint deployment scripts, optional benchmark Job, health/readiness, budget/shutdown instructions, monitoring, immutable recorded replay from a verified live run, and public demo configuration.
      Acceptance: Incognito access works without VPN/payment/account; core sample completes; exact Nemotron IDs, Sandbox branches, Tavily request, and measured artifacts are evidenced; replay is derived from that run and clearly labeled.
      Verify: Clean image build, public health checks, incognito Playwright E2E, fresh-clone setup, logs/metrics review, URL checks, and secret scan of the deployed UI/artifacts.

- [ ] **12. Prepare the public repository, demo media, and Devpost handoff**
      Spec ref: `spec.md > Demo And Submission Flow`; `prd.md > Submission Proof Points`
      What to build: Comprehensive English README, architecture/requirements/traceability/evaluation/security/deployment docs, public GitHub repository, topics/description, tagged `v1.0.0-hackathon` release, actual screenshots, thumbnail, 2:35–2:55 English demo video/captions, Devpost description/answers, testing instructions, and final checklist.
      Acceptance: Repository, demo, and video URLs are public; every claim matches stored evidence; no secret is present; materials satisfy the verified submission requirements and are ready for legal attestations and final submit confirmation.
      Verify: Fresh public clone, green CI, public URL checks, video duration/caption inspection, requirements traceability review, submission field completeness, and `submission/final-checklist.md`.

## Devpost Handoff

After all checklist items pass, run `$prepare-submission`. The final Devpost write still requires explicit legal attestations and the submission skill's required confirmation.
