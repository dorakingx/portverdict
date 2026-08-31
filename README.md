# PortVerdict

> The model migration agent that puts every candidate branch on trial.

PortVerdict is being built for the Nebius x NVIDIA Global AI Hackathon. It explores competing migrations to NVIDIA Nemotron in branchable Nebius Token Factory Sandboxes, attempts to falsify them with executable checks, and selects a branch only when its evidence passes deterministic hard gates.

## Current status

Active development. Replay fixtures are development artifacts until replaced by evidence captured from authenticated live Nebius and Tavily runs. No unverified model identifiers or benchmark claims are treated as final.

## Local development

Requirements: Node.js 20.9+ and pnpm 11+.

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Verification

```bash
pnpm verify
pnpm test:e2e
```

Detailed architecture, security, evaluation, deployment, and submission documentation will be added as their corresponding checklist items are verified.

## License

Apache-2.0.
