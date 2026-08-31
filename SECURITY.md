# Security policy

## Supported version

The hackathon branch on `main` is the only supported version before the first release.

## Reporting a vulnerability

Do not open a public issue for a suspected secret exposure, sandbox escape, cross-user data leak, or unsafe repository-execution path. Use GitHub's private vulnerability-reporting feature after the public repository is created. Include the affected commit, reproduction steps, impact, and whether any credential may have been exposed.

## Trust boundaries

- Repository code and retrieved web text are untrusted input.
- Untrusted repository commands may run only in Token Factory Sandboxes with bounded time, output, storage, identity, and network policy.
- The Next.js process must never install dependencies from or execute a submitted repository.
- Nebius inference, Sandbox, Tavily, and GitHub credentials are server-side only and use separate environment variables.
- A model may propose patches or explanations, but deterministic gates alone decide eligibility.
- Synthetic replay artifacts cannot be cited as live sponsor evidence.

## Secret response

If a credential is exposed: revoke it at the provider, remove it from every deployment, rotate dependent credentials, inspect audit logs, purge the affected artifact where the provider supports it, and document the incident. Rewriting Git history is not a substitute for revocation.
