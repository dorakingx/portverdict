# Evaluations

PortVerdict keeps development-harness evidence and authenticated sponsor-platform evidence in separate tiers.

- [Methodology](methodology.md) defines the experiment, metrics, failure treatment, and promotion gates before live values are known.
- [Recorded results](results.md) currently describe the deterministic local contract preflight.
- [`results.json`](results.json) is the machine-readable local record and must not be relabeled as model or sponsor-platform performance.

## Current status

- Local contract preflight: recorded development evidence.
- Authenticated live evaluation: **implemented-unverified**; no final live result is documented here yet.
- Legal or account-bound submission actions: **human-confirmation-required** where identified in the final checklist.

A live result becomes reportable only after the raw attempt is retained, its sanitized evidence passes schema and hash verification, Sandbox cleanup is proven, and the evidence remains within its TTL. Skipped credential-gated tests do not satisfy that standard.
