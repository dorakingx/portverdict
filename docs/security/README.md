# Security

PortVerdict treats source repositories, model output, and retrieved documentation as hostile data. The web host validates and displays bounded metadata; repository execution belongs exclusively in isolated Token Factory Sandboxes.

Implemented controls include strict external-response validation, exact-host Tavily allowlists, same-origin Sandbox operation URLs, non-root Sandbox identities, explicit network policy, bounded retries/timeouts/output, secret-pattern rejection and redaction, append-only hashed evidence, provenance guards, guarded unsafe patch download, secure response headers, and deterministic abstention.

See [threat-model.md](./threat-model.md) for assets, trust boundaries, abuse cases, residual risks, and verification mapping. See the repository-root `SECURITY.md` for reporting instructions.
