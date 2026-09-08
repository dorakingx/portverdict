import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const base = new URL(process.argv[2] ?? "https://portverdict.vercel.app");
if (base.protocol !== "https:" || !base.hostname.endsWith(".vercel.app"))
  throw new Error("Expected the public Vercel viewer");
const local = JSON.parse(await readFile("fixtures/verified-live/evaluation-suite.json", "utf8"));
const get = async (path) => {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, `Public endpoint failed: ${path}`);
  return response;
};
const suite = await (await get("/evidence/verified-live/evaluation-suite.json")).json();
assert.equal(suite.integritySha256, local.integritySha256);
const ready = await (await get("/api/ready")).json();
assert.equal(ready.overall, "verified");
const checked = [];
let artifacts = 0;
for (const entry of suite.cases) {
  const prefix = `/evidence/verified-live/replay/${entry.runId}/`;
  const manifestPath = `${prefix}replay-manifest.json`;
  const manifestBytes = Buffer.from(await (await get(manifestPath)).arrayBuffer());
  assert.deepEqual(
    manifestBytes,
    await readFile(`apps/web/public${manifestPath}`),
    "Published replay manifest differs from reviewed source",
  );
  const manifest = JSON.parse(manifestBytes);
  for (const artifact of manifest.artifacts) {
    assert.match(artifact.path, /^artifacts\/sha256\/[a-f0-9]{64}$/u);
    const bytes = Buffer.from(await (await get(prefix + artifact.path)).arrayBuffer());
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256);
    assert.equal(bytes.length, artifact.byteLength);
    artifacts += 1;
  }
  const run = await (await get(`/api/runs/${entry.runId}`)).json();
  assert.equal(run.recording.exactModelId, suite.exactModelId);
  const summary = await (
    await get(`/evidence/verified-live/evaluation-cases/${entry.caseId}/trial-summary.json`)
  ).json();
  const patch = await fetch(new URL(`/api/runs/${entry.runId}/patch`, base));
  assert.equal(patch.status, summary.verdict.status === "selected" ? 409 : 404);
  for (const route of ["workflow", "compare", "report"]) await get(`/runs/${entry.runId}/${route}`);
  await get(`/api/runs/${entry.runId}/report`);
  checked.push({ caseId: entry.caseId, runId: entry.runId, verdict: summary.verdict.status });
}
const result = {
  checkedAt: new Date().toISOString(),
  baseUrl: base.origin,
  suiteId: suite.suiteId,
  suiteIntegritySha256: suite.integritySha256,
  authentication: "none",
  verifiedArtifactCount: artifacts,
  cases: checked,
};
await writeFile(
  "docs/evaluations/public-verification.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
