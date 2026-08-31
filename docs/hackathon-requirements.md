# Hackathon requirements

Last reviewed: 2026-08-31 (Asia/Tokyo).

## Official event facts

- Event: [Nebius x NVIDIA Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com/)
- Submission period: August 26, 2026 09:00 PT through October 30, 2026 10:00 PT (October 31, 2026 02:00 JST).
- Target category: Coding and Agentic Engineering.
- Secondary prize: Best Use of Tavily.
- Required platform use: the project must make a runtime Token Factory inference call or run/deploy on Nebius AI Cloud, and use at least one NVIDIA open-source model.
- Working demo URL, English project description, public repository, detectable open-source license, setup README, platform feedback, and public YouTube demonstration shorter than three minutes are required.
- The project must function as shown. Existing projects need a significant-update explanation; PortVerdict is a new project created during the submission period.
- Individual entrants must satisfy the age-of-majority and conflict/employee eligibility rules. These attestations require explicit user confirmation.

The [official rules](https://nebiusglobalaihackathon.devpost.com/rules) control if this summary differs.

## Technical source of truth

- [Token Factory quickstart](https://docs.tokenfactory.nebius.com/quickstart)
- [Token Factory API introduction](https://docs.tokenfactory.nebius.com/api-reference/introduction)
- [Sandbox overview](https://docs.tokenfactory.nebius.com/sandboxes/overview)
- [Sandboxes for SWE agents](https://docs.tokenfactory.nebius.com/sandboxes/swe-agents)
- [Sandbox CLI](https://docs.tokenfactory.nebius.com/sandboxes/cli)
- [Nebius Serverless overview](https://docs.nebius.com/serverless/overview)
- [Serverless Endpoints](https://docs.nebius.com/serverless/quickstart/endpoints)
- [Serverless Jobs](https://docs.nebius.com/serverless/quickstart/jobs)
- [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search)
- [Tavily Extract](https://docs.tavily.com/documentation/api-reference/endpoint/extract)

## Enforced interpretation

1. Token Factory model IDs are discovered at runtime from authenticated `GET /v1/models`. Documentation/model-card names are preferences, never executable IDs.
2. Model routing may select only NVIDIA entries proven by that catalog snapshot. Exact request IDs, chosen model IDs, usage, latency, and retries are structured telemetry.
3. Sandbox credentials are separate from inference credentials. Every candidate must derive from one checkpoint. Candidate networking is off; identity, time, layer, and output are bounded.
4. Tavily uses authenticated `/search` then `/extract`, requests usage metadata, filters to exact official HTTPS hosts, and treats all returned content as untrusted.
5. Replay fixtures remain synthetic until replaced by a recorded authenticated run. Null sponsor IDs are intentional and cannot be filled with fabricated values.

## Judging alignment

- Technological implementation: catalog-bound Nemotron routing, real branchable Sandboxes, falsification, provenance, and deterministic selection.
- Design: a guest-accessible evidence flight recorder that preserves losing branches and exposes sources/artifacts.
- Potential impact: safer migration away from closed-model dependencies without silent schema/tool/streaming regressions.
- Quality of idea: a controlled checkpoint tournament that can abstain, rather than a one-shot patch generator.
