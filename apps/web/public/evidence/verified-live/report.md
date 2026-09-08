# PortVerdict verified live evaluation suite

> AUTHENTICATED RECORDED EVIDENCE — 2026-09-07T09:20:16.918Z

- Suite: `suite_20260907092016_6afcbf7b`
- PortVerdict commit: `b8f912021bc76a343b9bcf43bbd80f207ba253d3`
- Exact NVIDIA model: `nvidia/nemotron-3-super-120b-a12b`
- Cases: 3

| Behavior family | Candidate | Disposition | Hard gates | Sandbox operation |
| --- | --- | --- | ---: | --- |
| structured-output | `candidate_1_minimal_compatibility` | eligible | 10/10 | `01a07b2b-5c8e-707b-83df-e54dbcbf8212` |
| structured-output | `candidate_2_prompt_schema_adaptation` | eligible | 10/10 | `01a07b2b-5c91-7127-8fb7-fce71d34f07e` |
| structured-output | `candidate_3_resilience_routing_adaptation` | eligible | 10/10 | `01a07b2b-5ee0-7398-ad26-1b9781f2e2f6` |
| tool-calling | `candidate_1_minimal_compatibility` | rejected | 8/10 | `01a07b2b-b43d-7420-849b-fab8ae60ab0d` |
| tool-calling | `candidate_2_prompt_schema_adaptation` | rejected | 8/10 | `01a07b2b-b43b-754f-bcb8-576ee62624ce` |
| tool-calling | `candidate_3_resilience_routing_adaptation` | rejected | 8/10 | `01a07b2b-b65e-737c-ac45-607ea95c84f4` |
| streaming-retry | `candidate_1_minimal_compatibility` | rejected | 9/10 | `01a07b2c-0d94-7275-bc61-20369fe4c945` |
| streaming-retry | `candidate_2_prompt_schema_adaptation` | rejected | 9/10 | `01a07b2c-0d9c-7543-8ea6-c304951673ac` |
| streaming-retry | `candidate_3_resilience_routing_adaptation` | rejected | 9/10 | `01a07b2c-1028-7754-af9d-610725074e2f` |

Each case used one immutable checkpoint for three tournament candidates and one model-generated single-shot baseline. These are measured single runs, not statistical performance claims.
