# Testing instructions

## Fastest judge path (no account)

1. Open https://portverdict.vercel.app in a private browser window.
2. Confirm the disclosure says **synthetic development replay**.
3. Choose **Run recorded sample**.
4. On **Workflow**, inspect the one shared checkpoint and all three visible branches.
5. Open the rejected branch's evidence and confirm the tool/schema counterexample.
6. Open **Compare** and verify that hard gates precede secondary assessments.
7. Open **Report**, download the synthetic report, then confirm patch export requires unsafe acknowledgement.
8. Open https://portverdict.vercel.app/status and confirm replay is ready while unconfigured sponsor integrations remain explicit.

Expected fixture verdict: candidate 02 is selected, candidate 01 is rejected, and candidate 03 is inconclusive. This is a deterministic synthetic UI/API fixture, not live sponsor evidence.

## Public API checks

```bash
curl --fail https://portverdict.vercel.app/api/health
curl --fail https://portverdict.vercel.app/api/ready
curl --fail https://portverdict.vercel.app/api/runs/sample-run
curl --fail -H 'Last-Event-ID: 13' \
  https://portverdict.vercel.app/api/runs/sample-run/events
```

The patch endpoint returns `409 Acknowledgement required` unless `?acknowledgeUnsafe=true` is present.

## Local reproduction

Requirements: Node.js 24 and pnpm 11.19.0.

```bash
git clone https://github.com/dorakingx/portverdict.git
cd portverdict
pnpm install --frozen-lockfile
pnpm verify
pnpm benchmark
pnpm exec playwright install chromium
pnpm test:e2e
```

Replay mode needs no environment variables. Live mode remains disabled without server-side Nebius inference, Sandbox, and Tavily credentials plus authenticated smoke evidence.

## Integrity and security checks

```bash
pnpm secret:scan
gitleaks git --redact .
pnpm audit --audit-level high
docker build -f infra/nebius/Dockerfile -t portverdict:local .
```

The benchmark is a deterministic local contract preflight. Read `docs/evaluations/methodology.md` before interpreting its numbers.
