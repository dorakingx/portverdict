# Technical Spec

## Overview

PortVerdict is a single-deployable Next.js application backed by modular TypeScript packages. The product serves an immutable evidence-replay demo from repository fixtures and, when server-side credentials are present, executes the same run state machine against live Nebius Token Factory inference, real Token Factory Sandboxes, and Tavily.

The architecture optimizes for one auditable vertical slice rather than a general agent platform. Deterministic gates own all pass/fail and numeric claims. Models may propose plans, patches, tests, counterexamples, and a final rationale, but cannot manufacture evidence or override a failed hard gate.

## Stack

### Runtime and package management

- Node.js 24.x for development and CI; production supports Node.js 20.9+.
- pnpm 11 workspace with a committed lockfile.
- TypeScript in strict mode across applications and packages.

### Web application

- Next.js `16.3.3`, App Router, default Node.js runtime, standalone output.
- React and React DOM `19.2.8`.
- Tailwind CSS `4.3.3` with semantic CSS variables.
- Zod `4.5.4` for every external boundary, persisted artifact, event, and model output.
- Lucide icons; no canvas-only graph or heavy dashboard framework.
- IBM Plex Sans and IBM Plex Mono through `next/font` or vendored local assets after license verification.

### Testing

- Vitest `4.1.11` for unit, contract, integration, and fixture tests.
- Playwright `1.62.1` for end-to-end, screenshot, keyboard, and responsive verification.
- `@axe-core/playwright` for automated accessibility checks.
- Native Node test helpers and mocked `fetch`; no tests depend on live paid APIs by default.

### Deployment

- Multi-stage Docker image with Next.js standalone output and a non-root runtime user.
- Preferred judged deployment: one Nebius Serverless Endpoint running the full container, subject to verified credits/quota and public URL behavior.
- Optional Nebius Serverless Job for the benchmark batch.
- Static replay remains available if live integrations are temporarily degraded, but is always labeled as recorded evidence.

References: [Next.js App Router](https://nextjs.org/docs/app), [Next.js 16 upgrade requirements](https://nextjs.org/docs/app/guides/upgrading/version-16), [self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [React versions](https://react.dev/versions), [Vitest](https://vitest.dev/guide/), [Playwright](https://playwright.dev/docs/intro).

## Architecture

### Deployment topology

```text
Browser
  ├─ Server-rendered pages and client event islands
  ├─ REST route handlers
  └─ SSE event stream
          │
          ▼
Next.js Node process (Nebius Serverless Endpoint candidate)
  ├─ Run state machine
  ├─ Append-only evidence store
  ├─ Model catalog + router
  ├─ Tavily research adapter
  ├─ Sandbox adapter
  └─ GitHub public-source/export adapter
          │
          ├─ Nebius Token Factory /v1/models + /chat/completions
          ├─ Token Factory Sandboxes API
          ├─ Tavily /search + /extract
          └─ GitHub REST/archive APIs
```

### Run state machine

The state machine is a pure reducer over validated events. Side effects are requested as commands and completed through new events; state transitions never call network or filesystem APIs directly.

```text
RECEIVED
  → SOURCE_RESOLVED
  → INVENTORIED
  → SPECIFIED
  → BASE_CHECKPOINT_READY
  → CANDIDATES_RUNNING
  → CANDIDATES_EVALUATED
  → FALSIFIED
  → SCORED
  → SELECTED | ABSTAINED

Any active state → CANCELING → CANCELED
Any active state → FAILED (only for unrecoverable orchestration failure)
```

Candidate states are independent:

```text
QUEUED → PATCHING → BUILDING → VERIFYING → FALSIFYING
  → ELIGIBLE | REJECTED | INCONCLUSIVE
```

Infrastructure failures use `INCONCLUSIVE`; deterministic behavioral failures use `REJECTED`. Only `ELIGIBLE` candidates enter model-based comparison.

### Ports and adapters

Core orchestration imports only interfaces:

- `ModelCatalogPort`
- `ModelCompletionPort`
- `SandboxPort`
- `ResearchPort`
- `SourceRepositoryPort`
- `EvidenceStorePort`
- `ClockPort`
- `IdGeneratorPort`

Each has `live`, `replay`, and test-double implementations where applicable. Replay re-emits the same domain event schema as live execution, so the UI has no replay-only data path.

## Domain Model

### Run

```ts
type Run = {
  id: string;
  mode: "live" | "replay";
  state: RunState;
  source: SourceRevision;
  config: RunConfig;
  candidates: Candidate[];
  verdict: Verdict | null;
  createdAt: string;
  updatedAt: string;
  originalLiveRun?: { id: string; recordedAt: string };
};
```

### Evidence

```ts
type Evidence = {
  id: string;
  runId: string;
  candidateId?: string;
  claim: string;
  classification: "measured" | "observed" | "external-source" | "model-rationale" | "unsupported";
  procedure: string;
  observation: EvidenceObservation;
  provenance: {
    sourceRevision: string;
    sandboxOperationId?: string;
    sandboxImageId?: string;
    integrationRequestId?: string;
    artifactId: string;
    contentSha256: string;
    recordedAt: string;
  };
  sources: SourceCitation[];
  redactionVersion: string;
};
```

### Hard gate result

```ts
type HardGateResult = {
  gate:
    | "build"
    | "original-tests"
    | "migration-tests"
    | "schema"
    | "tool-calls"
    | "prompt-regression"
    | "secret-scan"
    | "security"
    | "nebius-runtime"
    | "evidence-completeness";
  status: "passed" | "failed" | "inconclusive";
  evidenceIds: string[];
};
```

The report serializer rejects any metric without at least one `measured` evidence record containing a valid procedure, artifact, timestamp, and hash.

## HTTP And Event Contracts

### `POST /api/runs`

Request:

```json
{
  "mode": "replay",
  "source": { "kind": "fixture", "fixtureId": "typescript-tool-weather" },
  "idempotencyKey": "client-generated-uuid"
}
```

Live public source:

```json
{
  "mode": "live",
  "source": { "kind": "github", "url": "https://github.com/owner/repository" },
  "idempotencyKey": "client-generated-uuid"
}
```

Response `202`:

```json
{
  "runId": "run_...",
  "state": "RECEIVED",
  "mode": "live",
  "statusUrl": "/api/runs/run_...",
  "eventsUrl": "/api/runs/run_.../events"
}
```

The server hashes normalized source revision + configuration + idempotency key. A duplicate active request returns the existing run.

### `GET /api/runs/{runId}`

Returns a validated, redacted run view model. Dynamic route parameters are awaited per Next.js 16 conventions. Missing IDs return a stable problem document with a request reference.

### `GET /api/runs/{runId}/events`

SSE response with monotonic integer event IDs:

```text
id: 42
event: candidate.stage.completed
data: {"schemaVersion":1,"runId":"...","candidateId":"...","stage":"schema","status":"failed","evidenceIds":["ev_..."]}
```

Clients reconnect with `Last-Event-ID`; the server replays missing persisted events before following new events. Heartbeats contain no fabricated activity.

### `POST /api/runs/{runId}/cancel`

Transitions to `CANCELING`, sends bounded cancellation to active Sandbox operations, then records `CANCELED`. Repeated cancellation is idempotent.

### Evidence and artifact endpoints

- `GET /api/runs/{runId}/evidence/{evidenceId}`
- `GET /api/runs/{runId}/report`
- `GET /api/runs/{runId}/patch`
- `POST /api/runs/{runId}/pull-request/preview`
- `POST /api/runs/{runId}/pull-request/confirm`

Unsafe-candidate artifacts require an explicit query acknowledgement and are watermarked as investigation-only. Pull-request confirmation is an external write and requires owner authorization.

### Health and readiness

- `GET /api/health`: process liveness only.
- `GET /api/ready`: redacted readiness for replay, Token Factory, Sandbox, Tavily, and optional GitHub actions. It reports configured/unconfigured/degraded, never secret values.
- `/status`: human-readable public equivalent.

## File Structure

```text
.
├── apps/
│   └── web/
│       ├── public/
│       ├── src/
│       │   ├── app/
│       │   │   ├── (marketing)/page.tsx
│       │   │   ├── runs/new/page.tsx
│       │   │   ├── runs/[runId]/layout.tsx
│       │   │   ├── runs/[runId]/workflow/page.tsx
│       │   │   ├── runs/[runId]/compare/page.tsx
│       │   │   ├── runs/[runId]/candidates/[candidateId]/page.tsx
│       │   │   ├── runs/[runId]/evidence/[evidenceId]/page.tsx
│       │   │   ├── runs/[runId]/report/page.tsx
│       │   │   ├── runs/[runId]/export/page.tsx
│       │   │   ├── status/page.tsx
│       │   │   ├── api/health/route.ts
│       │   │   ├── api/ready/route.ts
│       │   │   ├── api/runs/route.ts
│       │   │   ├── api/runs/[runId]/route.ts
│       │   │   ├── api/runs/[runId]/events/route.ts
│       │   │   ├── api/runs/[runId]/cancel/route.ts
│       │   │   ├── error.tsx
│       │   │   ├── global-error.tsx
│       │   │   ├── not-found.tsx
│       │   │   ├── layout.tsx
│       │   │   └── globals.css
│       │   ├── components/
│       │   │   ├── marketing/
│       │   │   ├── run-shell/
│       │   │   ├── branch-rail/
│       │   │   ├── evidence/
│       │   │   ├── comparison/
│       │   │   ├── diff/
│       │   │   └── ui/
│       │   └── lib/
│       │       ├── actions/
│       │       ├── server/
│       │       └── view-models/
│       ├── next.config.ts
│       └── package.json
├── packages/
│   ├── shared-schemas/       # Domain and API Zod schemas
│   ├── agent-core/           # Pure state machine and orchestration commands
│   ├── model-router/         # Catalog discovery, policy, telemetry
│   ├── sandbox-runner/       # Sandbox interface and live/replay adapters
│   ├── evaluator/            # Gates, provenance guard, branch selection
│   ├── tavily-research/      # Search/extract policy and evidence normalization
│   ├── github-integration/   # Public source resolution and guarded PR export
│   └── evidence-store/       # Append-only events/artifacts and integrity checks
├── fixtures/
│   ├── typescript/
│   │   ├── chat-basic/
│   │   ├── streaming/
│   │   ├── structured-output/
│   │   ├── tool-calling/
│   │   └── retries/
│   ├── python/
│   │   ├── chat-basic/
│   │   ├── streaming/
│   │   ├── structured-output/
│   │   ├── tool-calling/
│   │   └── retries/
│   └── replays/
│       └── sample-run/
├── infra/
│   ├── nebius/
│   │   ├── Dockerfile
│   │   ├── deploy-endpoint.sh
│   │   ├── run-benchmark-job.sh
│   │   └── README.md
│   └── local/
│       └── compose.yaml
├── docs/
│   ├── architecture/
│   ├── evaluations/
│   ├── security/
│   ├── submission/
│   └── hackathon-build/
├── submission/
├── tests/
│   ├── contract/
│   ├── integration/
│   └── e2e/
├── package.json
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

## Data Flow

### 1. Source resolution

The source adapter resolves a built-in fixture or a public GitHub URL to an immutable commit SHA. The web host may inspect bounded text and metadata but never installs dependencies or executes repository code.

### 2. Inventory

A deterministic scanner finds common SDK imports/calls, environment variable names, schemas, tools, prompts, streaming, retry logic, and tests. A model may add inferred findings, which remain separately labeled. Secret-like values are redacted before persistence or model calls.

### 3. Model discovery and migration specification

Before the first live model task, `GET https://api.tokenfactory.nebius.com/v1/models` runs with `Authorization: Bearer ${NEBIUS_API_KEY}`. Only returned `data[].id` values are eligible. Catalog snapshot, fetch time, and selected exact ID are persisted.

The router chooses by task category, difficulty, latency target, remaining token budget, retry count, and discovered availability. NVIDIA model-card names guide preferred roles but are never assumed to be Token Factory IDs.

### 4. Base Sandbox checkpoint

The Sandbox adapter resolves a supported SWE or OCI image, copies the immutable source revision, and installs dependencies under a bounded timeout. This run uses `disposable: false` to preserve the resulting checkpoint. Network is disabled for later test execution wherever the fixture does not need it.

### 5. Candidate branches

Three operations use the same checkpoint image/state:

- `minimal-compatibility`
- `prompt-schema-adaptation`
- `resilience-routing-adaptation`

Each patch is generated from a validated structured plan. Patches and commands pass allowlists before they reach the Sandbox adapter.

### 6. Verification and falsification

Each branch executes bounded commands for install verification, build, original tests, migration fixtures, schema/tool calls, static checks, secret scanning, and security checks. A counterexample task proposes additional bounded fixtures; they run through the same deterministic parser.

### 7. Research

For current compatibility questions, Tavily searches allowlisted official domains, filters results, and extracts only selected HTTPS URLs. Content is wrapped as untrusted evidence, hashed, bounded, and never concatenated into system instructions.

### 8. Selection or abstention

The evaluator first eliminates candidates with any failed/inconclusive hard gate. Deterministic tie-break dimensions follow. A model may write the final explanation only after the selected/abstained outcome is already fixed.

### 9. Presentation and export

Server Components load the initial validated snapshot. Small client islands subscribe to SSE, manage graph focus/evidence sheets, and control replay. Reports and patches are derived from stored artifacts rather than regenerated on request.

## Components And Responsibilities

### Marketing and repository selection

Implements: `prd.md > Epic 1`, `Epic 2`.

- Explains the risk and one-click sample path.
- Shows live/replay status before launch.
- Validates GitHub URLs, size limits, and fixture selection.
- Uses Server Components for initial content and a small client form island.

### Run shell and accessible branch rail

Implements: `prd.md > Epic 4`, `Epic 8`.

- Keeps run ID, mode, commit, and verdict visible across nested routes.
- Renders candidates as semantic ordered lists/CSS Grid; an `aria-hidden` SVG layer draws connectors.
- Uses status icon + text + color and `aria-live="polite"` stage updates.
- Converts branches to accordions on narrow screens rather than horizontal pan/zoom.

### Agent core

Implements: `prd.md > Core User Journey`, `Epic 4`.

- Owns validated state transitions, idempotency, retries, cancellation, and side-effect commands.
- Prevents models or adapters from directly mutating persisted run state.
- Records every transition before dispatching the next effect.

### Model router

Implements: `prd.md > Epic 3`, `Epic 4`, `Epic 6`, `Submission Proof Points`.

- Preferred light role: Nemotron 3.5 Lightning model-card family.
- Preferred standard role: Nemotron 3 Super model-card family.
- Preferred heavy role: Nemotron 3 Ultra model-card family.
- Resolves these roles only against authenticated catalog results.
- Logs exact model ID, category, difficulty, latency, usage, outcome, retries, and reliable cost fields.
- Never persists private reasoning traces.

### Sandbox runner

Implements: `prd.md > Epic 4`, `Epic 5`.

- Live base API: `https://api.tokenfactory.nebius.com/sandboxes/v1`.
- Auth: separate IAM bearer token plus `Project` header; do not reuse blindly with inference credentials.
- Follows `Location`, `Retry-After`, operation states, cancellation, and SSE resume IDs.
- Uses the same non-disposable checkpoint as the image/state for every candidate.
- Defaults to non-root UID/GID when supported, bounded writable layer, output truncation, command timeout, and disabled networking for verification.
- Persists operation/image IDs and resource metrics as evidence.

### Evaluator and provenance guard

Implements: `prd.md > Epic 5`, `Epic 6`, `Epic 8`.

- Parses only known test-result schemas and exit states.
- Calculates parity by behavior category.
- Rejects unsupported numbers and incomplete provenance.
- Keeps deterministic results above and separate from model rationale.
- Emits selected, rejected, inconclusive, or abstained verdicts.

### Tavily research

Implements: `prd.md > Epic 5` documentation story.

- Uses REST directly to match current API enums.
- Search: `POST https://api.tavily.com/search`, basic depth, up to 5 results, usage enabled, exact official-domain allowlist.
- Extract: `POST https://api.tavily.com/extract`, basic depth, 1–3 selected URLs, query-guided chunks, 10-second timeout.
- Respects `retry-after`; bounded retries only for 429/5xx.
- Logs request ID, credits, latency, URL, title, score, time, and content hash.

### Evidence store

Implements: `prd.md > Epic 5`, `Epic 7`, `Epic 8`.

- Writes append-only NDJSON events followed by atomic JSON snapshots.
- Writes artifacts by content hash under a run directory.
- Uses a configurable `PORTVERDICT_RUN_DIR`; immutable replay fixtures ship in the image.
- Verifies replay manifest hashes before serving.
- A production multi-instance deployment requires a shared store; v1 deliberately runs one application instance and documents this limit.

### GitHub integration

Implements: `prd.md > Epic 2`, `Epic 7`.

- Resolves public repository URLs and exact commit archives.
- Never executes cloned code on the web host.
- Patch download is anonymous; pull-request creation is owner-only and split into preview/confirm.
- Uses least-privilege credentials and refuses cross-repository destinations.

### Evidence, comparison, diff, and report UI

Implements: `prd.md > Epic 5`, `Epic 6`, `Epic 7`.

- Every conclusion opens the same evidence sheet: claim, classification, procedure, observation, origin, sources, artifact.
- Comparison uses hard gates first and preserves failed candidates.
- Diff uses a lightweight accessible unified-diff renderer, not Monaco.
- Report generation reads fixed evidence and includes explicit limitations.

## External APIs And Dependencies

### Nebius Token Factory inference

- Base: `https://api.tokenfactory.nebius.com/v1/`
- Catalog: `GET /models`
- Chat: `POST /chat/completions`
- Server secret: `NEBIUS_API_KEY`
- Sources: [quickstart](https://docs.tokenfactory.nebius.com/quickstart), [API introduction](https://docs.tokenfactory.nebius.com/api-reference/introduction), [model list](https://docs.tokenfactory.nebius.com/api-reference/models/list-models).

### Token Factory Sandboxes

- Base: `https://api.tokenfactory.nebius.com/sandboxes/v1`
- Server secrets/config: `CONTREE_TOKEN` or appropriate IAM token, `CONTREE_PROJECT` / `NEBIUS_AI_PROJECT`.
- Sources: [overview](https://docs.tokenfactory.nebius.com/sandboxes/overview), [SWE agents](https://docs.tokenfactory.nebius.com/sandboxes/swe-agents), [CLI](https://docs.tokenfactory.nebius.com/sandboxes/cli), [SDK branching](https://docs.tokenfactory.nebius.com/sandboxes/sdk/python_sdk/branching), [instances API](https://docs.tokenfactory.nebius.com/api-reference/sandboxes/instances/spawn-a-new-container-instance).

### Nebius Serverless AI

- Control plane: `https://api.nebius.cloud/ai/v1/endpoints` and `/jobs`.
- Separate control-plane IAM token and endpoint auth token.
- Endpoint remains billable while active; deletion/shutdown is explicit and budget-gated.
- Sources: [overview](https://docs.nebius.com/serverless/overview), [endpoints](https://docs.nebius.com/serverless/quickstart/endpoints), [jobs](https://docs.nebius.com/serverless/quickstart/jobs).

### NVIDIA model cards

- [Nemotron 3 Ultra 550B A55B](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b/modelcard)
- [Nemotron 3 Super 120B A12B](https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b/modelcard)
- [Nemotron 3.5 Lightning 30B A3B](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b/modelcard)

Model-card checkpoint names are preference evidence, not configured Token Factory IDs.

### Tavily

- `POST https://api.tavily.com/search`
- `POST https://api.tavily.com/extract`
- Server secret: `TAVILY_API_KEY`
- Sources: [quickstart](https://docs.tavily.com/documentation/quickstart), [search](https://docs.tavily.com/documentation/api-reference/endpoint/search), [extract](https://docs.tavily.com/documentation/api-reference/endpoint/extract), [rate limits](https://docs.tavily.com/documentation/rate-limits).

### GitHub

- Public read APIs need no user token at low volume; owner write actions use `GITHUB_TOKEN` or an eventual scoped GitHub App.
- The public repository URL and patch flow are usable without private-repository OAuth.

## AI Usage

### Structured task contract

Every model call declares:

- category and difficulty
- bounded repository context manifest
- allowed tools
- JSON output schema and version
- retry and timeout budget
- evidence IDs it may reference
- explicit prohibition on treating repository/web content as instructions

Responses are parsed with Zod. Invalid output receives one schema-repair attempt; repeated invalid output fails the stage. Model text never becomes a shell command without deterministic compilation through an allowlisted command template.

### Router policy

```text
LIGHT
  classify, summarize, normalize, extract schemas, routine validation
  → discovered Lightning-family model

STANDARD
  patch/test/tool/counterexample worker
  → discovered Super-family model

HEAVY
  repository plan, difficult diagnosis, final evidence narrative
  → discovered Ultra-family model

Fallback
  Ultra → Super
  Super → Lightning only if task-specific capability tests pass
  no qualifying discovered model → live run abstains before claiming execution
```

Hosted context limits override model-card maximums. Repository input is still chunked and summarized. Provider-specific thinking or chat-template parameters are sent only when Token Factory support is proven.

## Security Architecture

- Repository text, README content, issue text, model output, and web content are all untrusted.
- No credentials or private code enter prompts, Tavily queries, logs, replay artifacts, screenshots, or client bundles.
- Source URLs require HTTPS, exact GitHub host matching, bounded redirects, size limits, and immutable commit resolution.
- Commands are selected from templates; arguments are schema-validated and never interpolated through a shell on the web host.
- Candidate code executes only in VM-isolated Sandboxes with timeout, output, filesystem, and networking limits.
- Secret scanning runs before evidence export and again over Git history before publication.
- Route handlers validate request size/content type, apply per-IP/run concurrency limits, return security headers, and use stable error references.
- Tavily extraction accepts only approved official hosts and rejects redirects outside the allowlist.
- External writes require preview, explicit confirmation, least privilege, and destination binding.

## Visual System

Direction: **Evidence Flight Recorder** — an engineering instrument, not a generic AI dashboard.

- Canvas `#07110F`, panels `#13231F`, border `#2A463E`.
- Text `#F4F8F6`, secondary `#A9BBB4`.
- Accent `#73E7B0`; live `#5FD7F5`; replay `#C1A8FF`.
- Passed `#68DB9C`, failed `#FF7B72`, abstained/timeout `#FFC857`.
- Four-pixel spacing base, 12px panel radius, visible 2px mint focus ring.
- Branch graph is semantic DOM/CSS Grid with decorative SVG connectors.
- Motion reflects recorded state only, honors reduced motion, and never simulates fake logs or thought bubbles.

The signature view is one shared checkpoint splitting into three evidence rails; one branch visibly terminates at a falsified behavior while another reaches the verdict.

## Risks And Verification

### Credential and catalog blocker

Current environment has no `NEBIUS_API_KEY`, Sandbox token/project, or `TAVILY_API_KEY`. Unauthenticated `/v1/models` returned HTTP 401. Until credentials are supplied, only replay/test adapters can be verified and no exact Token Factory model ID may be claimed.

Verification: configuration tests, redacted readiness endpoint, then authenticated model-catalog contract test before enabling live mode.

### Sandbox Beta/API drift

The Sandbox product is Beta. Operation/checkpoint response shapes and image availability may change.

Verification: pin captured schemas from a real authenticated run, contract-test them, record API version/evidence, and keep the adapter isolated.

### Untrusted dependency installation

Package installers can execute arbitrary hooks and use the network.

Verification: only Sandboxes install; prebuilt fixture images reduce network use; candidate verification runs with networking disabled; all operations have strict time/layer/output limits.

### Single-instance evidence store

The first deployment is intentionally single-instance and file-backed. Horizontal scaling would diverge without shared storage.

Verification: configure one instance, add startup integrity scan and end-to-end refresh/reconnect tests, and document the limitation. Introduce object storage only after the vertical slice is stable.

### Demo latency and API availability

Three live branches may exceed a judge's attention window or credits.

Verification: one curated small repository, parallel branches, explicit budget limits, and a pre-recorded replay created from actual live artifacts. The video shows the real run; the public app exposes both modes honestly.

### Weak differentiation

Model comparison, migration agents, and eval platforms already exist.

Verification: every main screenshot and the demo must show the unique combination of same-checkpoint branches, patch production, adversarial failure, and abstention. Do not position PortVerdict as a generic agent or cheap-model selector.

### Accessibility and layout density

Branch trees and diffs can become unusable on keyboard/mobile.

Verification: semantic ordered branches, decorative-only connectors, mobile accordions, keyboard evidence sheets, 200% zoom, reduced-motion checks, and Playwright/axe coverage at 390×844, 768×1024, and 1440×900.

## Verification Matrix

| Layer           | Verification                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------- |
| Schemas         | Unit tests for valid, invalid, redacted, and version-mismatch payloads                       |
| State machine   | Exhaustive transition, retry, cancel, duplicate, and abstention tests                        |
| Router          | Catalog drift, unavailable family, budget, retry, telemetry, and fallback tests              |
| Sandbox adapter | Captured contract fixtures plus one authenticated branch smoke test                          |
| Evaluator       | Gate precedence, infrastructure-vs-behavior classification, provenance rejection             |
| Tavily          | Request allowlist, redirect rejection, 429 handling, usage logging, prompt-injection fixture |
| Evidence store  | Atomicity, replay hash integrity, SSE resume, redaction, crash recovery                      |
| UI              | Component tests for every state and semantic status label                                    |
| E2E             | Sample launch → failure evidence → comparison → selected diff/report/patch                   |
| Abstention E2E  | All candidates fail/incomplete → no safe export                                              |
| Deployment      | Clean build, container health, public incognito flow, secret scan                            |

## Demo And Submission Flow

1. Landing: **A migration can compile—and still break behavior.**
2. Launch the TypeScript tool-calling sample with a visible Live or Evidence replay badge.
3. Show the immutable source commit and provider-integration inventory.
4. Show one base Sandbox checkpoint split into three candidate rails.
5. Open the naive branch's schema/tool-call failure evidence, including Sandbox artifact and current Tavily source.
6. Compare all candidates with hard gates first; keep rejected candidates visible.
7. Open the selected branch diff and explain why it alone passed.
8. Download the patch and run the migrated sample against the exact discovered Nemotron model on Nebius.
9. Close with measured results, known limits, public repository, and explicit abstention behavior.

The same route sequence supports screenshot capture and video narration; no special hidden demo UI exists.
