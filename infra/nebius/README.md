# Nebius deployment boundary

The production image is a non-root Next.js standalone container. Build and test it locally with:

```bash
docker build -f infra/nebius/Dockerfile -t portverdict:local .
docker run --rm -p 3000:3000 --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m portverdict:local
curl --fail http://localhost:3000/api/health
curl --fail http://localhost:3000/api/ready
```

The image intentionally starts in replay-only mode without secrets. For a Nebius deployment, inject credentials through the platform secret manager rather than image build arguments:

- `NEBIUS_API_KEY`
- `NEBIUS_AI_PROJECT`
- `CONTREE_TOKEN`
- `CONTREE_PROJECT`
- `TAVILY_API_KEY`

Do not enable public live runs merely because variables exist. First capture authenticated catalog, inference, shared-checkpoint branching, and Tavily smoke evidence; then add distributed rate limiting and cleanup monitoring.

The precise Nebius Serverless Endpoint create/update command is not committed until it has been verified against the user's current project, region, registry, quota, and current CLI/API contract. This avoids publishing an untested deployment recipe. The Vercel deployment is the replay-only public fallback and does not count as Nebius runtime evidence.

Serverless Endpoints remain billable while active, so creation and shutdown must be explicit operations after project, region, registry, quota, and cost approval are known.
