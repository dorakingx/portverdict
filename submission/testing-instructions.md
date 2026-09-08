# Testing instructions

## Fastest judge path (no account)

1. Open https://portverdict.vercel.app in a private browser window.
2. Confirm the disclosure identifies an authenticated recorded live run, with its recording time and freshness status.
3. Choose **Inspect verified live run** (or **Inspect recorded live run** after freshness expires).
4. On **Workflow**, inspect the one shared checkpoint and all three visible branches.
5. Open a branch's evidence and inspect the executed test logs and exact proposed diff.
6. Open **Compare** and verify that hard gates precede secondary assessments.
7. Open **Report**, inspect Tavily official-source provenance, and confirm patch export requires unsafe acknowledgement.
8. Open https://portverdict.vercel.app/status and inspect recorded evidence readiness. Historical expiry is not a new live execution.

The primary structured-output case selects candidate 03, with all three candidates eligible. The tool-calling and streaming/retry cases abstain because all their candidates fail behavioral checks. Inspect each recorded case using its `runId` from `/evidence/verified-live/evaluation-suite.json` at `/runs/<runId>/workflow`. The separate `sample-run` is synthetic: candidate 02 selected, 01 rejected, 03 inconclusive; never interpret that fixture as sponsor proof.

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
