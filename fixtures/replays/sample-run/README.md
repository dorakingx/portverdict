# PortVerdict sample replay

> **DEVELOPMENT FIXTURE — SYNTHETIC AND UNVERIFIED**

This immutable replay exists to exercise PortVerdict's UI, reducer, and integrity checks without sponsor credentials. It is not evidence of a real Nebius, NVIDIA, Tavily, or GitHub execution.

The replay starts from one local fixture revision and one shared logical checkpoint, then compares three synthetic candidate branches:

- `candidate_direct_sdk`: a direct SDK port that builds, then fails a schema/tool-call behavioral counterexample.
- `candidate_prompt_schema`: a prompt-and-schema adapter that passes the configured fixture gates and is selected.
- `candidate_compat_shim`: a resilience compatibility shim whose synthetic build operation times out, so it remains inconclusive rather than being counted as a product failure.

Useful entry points:

- `replay-manifest.json` — file inventory, SHA-256 digests, provenance, and final state.
- `events.ndjson` — the complete monotonic event stream.
- `snapshot.json` — the reducer's final `SELECTED` run state.
- `report.md` — human-readable verdict and limitations.
- `diff.patch` — illustrative patch for the selected candidate.
- `artifacts/` — source, research-shaped records, candidate outcomes, and structured evidence.

All timestamps, commands, outcomes, scores, provider-shaped records, and source material in this directory are deterministic fixture data. No network request or hosted sandbox operation was performed to create them.
