# Final submission checklist

Status as of 2026-09-08. Checked items are backed by repository or public-deployment evidence. See `docs/evaluations/delivery-verification-2026-09-08.md` for exact commits and caveats. Blocked items must not be inferred or fabricated.

## Build and public access

- [x] Public replay demo loads without login: https://portverdict.vercel.app
- [x] Health, readiness, replay snapshot, resumable events, report, and guarded patch endpoints respond correctly.
- [x] Desktop browser, keyboard, axe WCAG A/AA, API contract, and security-header checks pass against production.
- [x] Non-root read-only container builds and serves health/readiness for the initial live-evidence snapshot; the later secondary-case routing fix was verified on Vercel, not container-retested.
- [x] Ten-fixture deterministic local preflight and integrity tests pass.
- [x] Dependency audit reports no known vulnerabilities.
- [x] License inventory, repository-file secret heuristic, and Git-history Gitleaks scan complete.
- [x] Actual production screenshots are stored in `submission/screenshots/`.
- [x] Public GitHub repository, description, topics, and CI configuration verified: https://github.com/dorakingx/portverdict
- [x] Green CI on the merged live-evidence PR; the earlier `v1.0.0-hackathon` prerelease remains historical.
- [ ] Formal `v1.1.0-hackathon-live` release with final public video and submission links.

## Mandatory sponsor proof

- [x] `NEBIUS_API_KEY` supplied server-side and authenticated model catalog stored.
- [x] Exact NVIDIA open-source model ID and real inference request evidence stored.
- [x] Authorized Sandbox token/project configured server-side.
- [x] One real checkpoint and three sibling branch/operation IDs stored for each of three cases.
- [x] Candidate build/test/falsification artifacts captured from those branches.
- [x] `TAVILY_API_KEY` supplied server-side and functional search→extract evidence stored.
- [x] Public replay regenerated from the authenticated live run with integrity manifest.
- [x] Public deployment reverified after live replay replacement, including all 67 nested artifact hashes and the two abstention cases.

## Media and Devpost

- [x] Final English video recorded from verified live evidence: 170 seconds, 1920×1080, 30 fps, H.264/AAC, English subtitle track and separate SRT. Final media hashes are in `video-verification.json`.
- [ ] English captions reviewed; video is public on YouTube and under three minutes.
- [ ] Demo, repository, video, description, built-with, category, feedback, and testing fields entered.
- [ ] Every Devpost claim compared with stored evidence; no fixture number described as live/model performance.
- [ ] Entrant explicitly confirms age of majority and all employee/conflict eligibility questions.
- [ ] Final Devpost preview reviewed and explicit submit confirmation received.
- [ ] Submitted status and final public URLs verified.

## Release rule

Do not submit while any mandatory sponsor proof, public video, legal attestation, or final confirmation box remains unchecked.

The entrant requested manual YouTube upload. Do not operate YouTube or infer a public video URL. Request final legal attestations and Submit confirmation only after the actual public video and Devpost draft are ready.
