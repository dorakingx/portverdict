# Build Notes

## 2026-08-31 — Guided build initialization

- The participant supplied a comprehensive autonomous project brief, so it serves as the onboarding brain dump and answers the target-user, product, demo, security, evaluation, and deadline questions normally collected interactively.
- Coding experience was not supplied and is recorded as unknown rather than inferred.
- The project started under the provisional name **ParityPilot** pending current conflict checks.
- The primary track is **Coding and agentic engineering**; the secondary award target is **Best Use of Tavily**.
- Scope principle: one persuasive guest workflow with real Nebius/Nemotron/Tavily evidence, deterministic hard gates, and honest abstention.
- Deepening rounds: 0 interactive rounds. The supplied brief already contains unusually detailed product and engineering constraints.

## 2026-08-31 — Product requirements

- Converted the scope into eight user-facing epics with observable acceptance criteria.
- The wow moment is the comparison: a plausible branch fails falsification while another passes, with abstention demonstrated as a first-class outcome.
- Live and replay modes must be visually and semantically distinct.
- Untrusted-repository, missing-evidence, infrastructure-timeout, catalog-drift, and all-branches-fail cases are explicit product states.
- Private repositories, multi-tenant SaaS, and post-merge production monitoring remain out of scope.
- Deepening rounds: 0 additional interactive rounds; the supplied goal defined the required states and proof points.

## 2026-08-31 — Concept and name validation

- The official hackathon gallery is not yet published, so current-event entry comparison is unavailable.
- Nearby products already cover model comparison, API translation, migration agents, and eval generation. The defensible combination is repository-specific migration + identical-checkpoint branch tournament + executable code patch + adversarial falsification + explicit abstention.
- A five-concept scorecard retained the migration-assurance concept because no alternative was meaningfully superior on the four official judging criteria.
- **ParityPilot** was rejected after finding an existing 2026 AI fairness product with the exact name.
- **PortVerdict** was selected: no exact GitHub repository, no occupied `dorakingx/portverdict` path, and no indexed exact Devpost/product conflict were found at research time. This is an availability check, not formal trademark clearance.
- Final working tagline: **The model migration agent that puts every candidate branch on trial.**

## 2026-08-31 — Technical specification

- Chose a pnpm/TypeScript monorepo with one Next.js 16 standalone application and modular ports/adapters.
- Live and replay execution share one validated event schema and UI view model.
- Chose a pure event-sourced state reducer instead of an agent framework; model output cannot mutate state or gate results.
- Chose a single-instance file-backed evidence store for the first deploy, with an explicit shared-storage limitation.
- Chose direct REST adapters for Token Factory, Sandboxes, and Tavily so current request/response contracts remain inspectable.
- Exact Token Factory model IDs remain blocked on an authenticated `/v1/models` call; model-card names are preferences only.
- Preferred deployment is the full container on a Nebius Serverless Endpoint, with a Serverless Job for benchmarks if credits/quota permit.
- Adopted the **Evidence Flight Recorder** visual direction and an accessible DOM/CSS branch rail.
- Deepening rounds: one autonomous architecture self-review; complexity was cut by avoiding a database, private-repository auth, distributed queues, a graph library, and a separate API service in v1.

## 2026-08-31 — Build checklist

- The participant already chose full autonomous execution and requested no discretionary pauses, so build mode is locked to autonomous with continuous automated verification.
- Git commits are milestone-level revert points, never substitutes for verification.
- Risk-first ordering puts schemas/state/provenance before UI and live API contracts before evaluation claims.
- The wow moment is fixed: one candidate compiles but fails falsification; a sibling from the same checkpoint survives and is selected.
- Live credentials/quota, public deployment, video upload, legal attestations, and final submission are the only expected human-bound gates.
- Deepening rounds: skipped on the hand-off path; the checklist was self-reviewed for dependencies, verification quality, and submission completeness.

## 2026-08-31 — Milestone 1: repository and safety baseline

- Initialized the `portverdict` Git repository on `main` under `Developer/App`, with a ten-workspace pnpm monorepo, Next.js 16 standalone app, strict shared TypeScript configuration, modular package boundaries, Apache-2.0 license, documented environment contract, and required architecture/evaluation/security/submission/infrastructure directories.
- Pinned the application and toolchain dependencies exactly. Node 24.19.0 and pnpm 11.19.0 from the bundled workspace runtime are used because the host Node 20.2.0 is below Next.js 16's supported minimum.
- Approved only `unrs-resolver@1.12.2` for dependency lifecycle scripts after inspecting its pinned postinstall and confirming it verifies the installed platform-specific optional binary.
- `pnpm install --frozen-lockfile` passed, and the full `pnpm verify` pipeline passed: formatting, zero-warning ESLint, strict type checking across all packages, Vitest, and the optimized production build.
- A broad Gitleaks directory scan reported only generated Next.js `.next` preview/encryption material, which is ignored by Git. A second scan limited to the staged 259 KB source set found no leaks.
