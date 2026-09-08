# Live evidence delivery verification — 2026-09-08

Story: a guest opens the public viewer, follows authenticated recorded Sandbox branches, inspects actual logs and diffs, and receives a patch only for a selected case.

- Recorded runner: `b8f912021bc76a343b9bcf43bbd80f207ba253d3`; suite `suite_20260907092016_6afcbf7b`.
- Published application: `7c1d035cd3929cd5565ef516cff4929fd4858436`, Vercel production deployment `dpl_FFqztL9LXLXSWBEncqykHzPFQCew`.
- Credential-free public check: all 67 nested artifacts matched their exact recorded hashes and sizes; all three case APIs and Workflow/Compare/Report routes responded successfully. See `public-verification.json`.
- Selected structured-output case: guarded export. Both abstained cases: no export, including after unsafe acknowledgement.
- Full browser/accessibility baseline: 19 passed, one mobile keyboard-only test intentionally skipped. After fixing secondary-case routing and per-case patch binding, the expanded complete three-case story passed again on desktop and mobile against production, without preview authentication.
- Local source verification before publication: formatting, lint, types, 99 unit tests passed, one credential-gated test skipped, optimized build passed. Subsequent app fixes passed type checking and remote CI source checks; the final CI run is independently visible on GitHub.
- Public evidence and Git history secret scans passed. Eight initial generic-key findings were inspected: all were three exact non-authenticating random UUID idempotency identifiers. The allowlist excludes only those exact values, not arbitrary key fields.
- Dependency audit: no known vulnerabilities at verification time.
- A clean Linux Docker build and non-root/read-only runtime readiness passed for the initial published-evidence snapshot (image `sha256:234ebe3bfb8fb7747863949bdad42db104a7cd97836c1fd52b91cd4d7e91efcb`), before the secondary-case routing fix. This is not a claim that the later application commit was container-retested.

## Issues retained rather than hidden

The initial high-concurrency local browser run timed out under host load. A second run started while the previous test-owned server was shutting down and encountered connection refusal. A dedicated server and one browser worker resolved that verification setup issue. Live evidence also exposed a hidden model name on mobile, an overly exact test locator, secondary case pages returning 404, and a shared patch lookup that needed binding to each case's verdict; each was corrected and relevant paths rechecked.

Protected Vercel previews inject a feedback toolbar blocked by the application's CSP. The preview-only test ignores only that specific blocked toolbar script; production continues to reject every console error. CSP was not weakened.

## Remaining submission boundary

The entrant requested manual YouTube upload. Provide the actual MP4, English subtitle file, title and description; obtain the real public YouTube URL afterward. Do not claim public playback, legal attestations, a formal final release, or Devpost final submission until those steps actually complete.
