# Architecture

PortVerdict is an evidence-first migration tournament. The browser never decides whether a branch is safe; it renders a validated run snapshot and linked evidence. A pure reducer owns orchestration state, adapters own side effects, an append-only store owns provenance, and the deterministic evaluator owns eligibility.

```text
Browser / replay API
        │
        ▼
Next.js control plane
  ├── run reducer ──> append-only evidence store
  ├── catalog-driven model router ──> Nebius Token Factory
  ├── official-source research ─────> Tavily
  └── checkpoint tournament ────────> Token Factory Sandboxes
           ├── candidate A: direct port ──────┐
           ├── candidate B: schema adapter ───┼─> hard gates → select / abstain
           └── candidate C: resilience shim ──┘
```

All live branches must reference the same immutable Sandbox checkpoint. Candidate networking is disabled and execution uses a non-root UID/GID with bounded timeout, output, and writable-layer size. Infrastructure failures become `INCONCLUSIVE`; behavior failures become `REJECTED`; only complete hard-gate passes become `ELIGIBLE`.

Replay uses the same decision vocabulary but clearly marks its hosted IDs and sponsor request IDs as absent. The public API exposes the sample run, resumable SSE-shaped events, a report, and a guarded synthetic patch. Live run creation fails closed until all credentials and authenticated smoke checks are available.

Detailed schemas, states, ports, API contracts, and flows are in `docs/hackathon-build/spec.md`.
