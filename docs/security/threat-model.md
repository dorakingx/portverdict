# Threat model

## Assets

- Nebius Token Factory, Sandbox, Tavily, and GitHub credentials.
- User-supplied repository content and immutable revision metadata.
- Generated patches, evaluation artifacts, request identifiers, and reports.
- Availability and spend limits of sponsor services.
- The integrity of the selected/abstained verdict.

## Trust boundaries

```text
Public browser ──validated JSON──> Next.js control plane
                                      │
Untrusted GitHub archive ─metadata───┤ (never execute here)
                                      │
                                      ├──> Token Factory inference
                                      ├──> Tavily official-source retrieval
                                      └──> Token Factory Sandbox (execution boundary)
```

Credentials cross only from the server control plane to their intended provider. Model output, source files, command output, and Tavily content return as untrusted data and cannot modify policy.

## Threats and controls

| Threat                                      | Primary controls                                                                                                                                                        | Residual risk / operating rule                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Malicious repository executes on app host   | No clone/install/command path in web routes; Sandbox adapter is the only execution port                                                                                 | Live orchestration must not be enabled until a real Sandbox smoke test passes                                   |
| Prompt injection in source or documentation | External content labeled untrusted; tool policy and allowlists are code-owned; no retrieved instruction becomes a system instruction                                    | Model-generated patches still require deterministic tests                                                       |
| Secret exfiltration                         | Server-only environment variables, separate provider credentials, redaction, telemetry omits prompts/content, Sandbox candidate branches default to networking disabled | A dependency-install checkpoint needs temporary network and must be snapshotted before candidate branching      |
| Sandbox escape or privilege abuse           | Non-root UID/GID, VM-isolation assumption, bounded layer/output/time, no disposable branch confusion, same checkpoint invariant                                         | Platform isolation remains a provider dependency; never place control-plane credentials in a branch environment |
| SSRF / unsafe redirects                     | Exact HTTPS host allowlist for Tavily sources; `redirect: "error"`; Sandbox `Location` must stay on configured HTTPS origin                                             | DNS rebinding is a provider/client concern; custom base URLs are deployment-admin input only                    |
| Denial of service / spend exhaustion        | 4 KiB public run requests, bounded URLs/query/results/retries/timeouts, maximum three branches, live mode disabled until configured                                     | Distributed rate limiting is still required before opening anonymous live runs                                  |
| Cross-user data leakage                     | Public deployment exposes only the built-in replay; no private repository support; no shared mutable run store in public mode                                           | Multi-user live mode needs per-tenant authorization and storage isolation                                       |
| Hallucinated metrics or verdicts            | Evidence classifications, content hashes, measured-number provenance guard, hard gates precede model scoring, explicit abstention                                       | Human-readable model rationale is never accepted as test evidence                                               |
| Malicious patch export                      | Replay patch is watermarked, requires unsafe acknowledgement, and is never labeled safe to ship; PR confirm boundary is not enabled                                     | Owner-scoped GitHub write flow requires an additional authenticated confirmation design                         |
| Supply-chain compromise                     | Exact dependency versions, lockfile, lifecycle-script allowlist, read-only CI permissions, pinned action commits                                                        | Automated vulnerability/license databases can change and must be rerun before release                           |

## Verification

- Unit/contract tests cover input bounds, redaction, path traversal, tamper detection, provenance rejection, unsafe URLs, retry ceilings, cancellation, SSE replay IDs, checkpoint invariants, gate precedence, and abstention.
- Playwright and axe cover guest replay navigation, keyboard access, responsive layouts, security endpoints, and download guards.
- CI uses read-only contents permission and immutable action commits.
- Release procedure requires a working-tree and Git-history secret scan plus a dependency audit.

## Known gaps before live mode

Anonymous live runs need a distributed rate/concurrency limiter, per-run storage isolation, cleanup reconciliation, and abuse monitoring. GitHub PR writes need an owner-authenticated preview/confirm token. These are intentionally unavailable in the public replay deployment rather than represented as completed controls.
