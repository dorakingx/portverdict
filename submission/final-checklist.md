# Final submission checklist

Status as of 2026-08-31. Checked items are backed by repository or public-deployment evidence. Blocked items must not be inferred or fabricated.

## Build and public access

- [x] Public replay demo loads without login: https://portverdict.vercel.app
- [x] Health, readiness, replay snapshot, resumable events, report, and guarded patch endpoints respond correctly.
- [x] Desktop browser, keyboard, axe WCAG A/AA, API contract, and security-header checks pass against production.
- [x] Non-root read-only container builds and serves health/readiness.
- [x] Ten-fixture deterministic local preflight and integrity tests pass.
- [x] Dependency audit reports no known vulnerabilities.
- [x] License inventory, repository-file secret heuristic, and Git-history Gitleaks scan complete.
- [x] Actual production screenshots are stored in `submission/screenshots/`.
- [x] Public GitHub repository, description, topics, and CI configuration verified: https://github.com/dorakingx/portverdict
- [ ] Green CI on the release commit and `v1.0.0-hackathon` release tag verified.

## Mandatory sponsor proof

- [ ] `NEBIUS_API_KEY` supplied server-side and authenticated model catalog stored.
- [ ] Exact NVIDIA open-source model ID and real inference request evidence stored.
- [ ] Separate Sandbox token/project supplied server-side.
- [ ] One real checkpoint and three sibling branch/operation IDs stored.
- [ ] Candidate build/test/falsification artifacts captured from those branches.
- [ ] `TAVILY_API_KEY` supplied server-side and functional search→extract evidence stored.
- [ ] Public replay regenerated from the authenticated live run with integrity manifest.
- [ ] Public deployment reverified after live replay replacement.

## Media and Devpost

- [ ] Final English video recorded from verified live evidence, 2:35–2:55 target.
- [ ] English captions reviewed; video is public on YouTube and under three minutes.
- [ ] Demo, repository, video, description, built-with, category, feedback, and testing fields entered.
- [ ] Every Devpost claim compared with stored evidence; no fixture number described as live/model performance.
- [ ] Entrant explicitly confirms age of majority and all employee/conflict eligibility questions.
- [ ] Final Devpost preview reviewed and explicit submit confirmation received.
- [ ] Submitted status and final public URLs verified.

## Release rule

Do not submit while any mandatory sponsor proof, public video, legal attestation, or final confirmation box remains unchecked.
