# PortVerdict fixture verdict: prompt + schema adapter

> **DEVELOPMENT FIXTURE — SYNTHETIC AND UNVERIFIED.** This report is designed for replay and UI testing. No Nebius, NVIDIA, Tavily, GitHub, hosted sandbox, model, build, or test service was invoked.

## Verdict

`candidate_prompt_schema` is the selected synthetic candidate. It is the only branch marked eligible by every configured fixture gate.

| Candidate                 | Strategy                | Fixture outcome | Reason                                                                                                                                                   |
| ------------------------- | ----------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `candidate_direct_sdk`    | Direct SDK port         | Rejected        | It builds in the fixture narrative, then the falsifier exposes schema and tool-call behavior that would return `NaN` instead of rejecting invalid input. |
| `candidate_prompt_schema` | Prompt + schema adapter | Selected        | The fixture records passes for build, behavior, schema, tool-call, regression, security, and evidence-completeness gates.                                |
| `candidate_compat_shim`   | Compatibility shim      | Inconclusive    | A synthetic infrastructure timeout prevents a behavioral judgment; it is not counted as a product failure.                                               |

## Fair comparison

All three branches reference `checkpoint_fixture_shared_v1`, which is a local logical fixture checkpoint. Its hosted sandbox fields are deliberately `null`; this replay does not claim that a Nebius checkpoint exists.

## Counterexample

The decisive input gives `temperature_c` the string value `"hot"`. The direct port coerces it to `NaN`, while the selected adapter rejects it before returning a domain object. The counterexample is authored fixture data and was not executed.

## Research provenance

`artifacts/research-record.json` is Tavily-shaped so the replay UI can render research provenance. It has `synthetic: true`, `verified: false`, a `null` request ID, and an `.invalid` documentation domain. It is not a search result.

## Integrity and limitations

`replay-manifest.json` records the byte length and SHA-256 digest of every replay file except itself, then self-hashes the canonical manifest core. Integrity proves only that fixture bytes have not changed. It does **not** turn synthetic claims into live evidence.
