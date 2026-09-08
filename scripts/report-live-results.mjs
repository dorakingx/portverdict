import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const evidence = resolve(root, "fixtures/verified-live");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (file) => JSON.parse(await readFile(file, "utf8"));

// Never calculate a published metric from an unverified artifact.
const manifest = await readFile(resolve(evidence, "SHA256SUMS"), "utf8");
const hashes = new Map();
for (const line of manifest.trim().split(/\r?\n/u)) {
  const match = /^([a-f0-9]{64})  ([A-Za-z0-9._/-]+)$/u.exec(line);
  if (!match) throw new Error("Malformed evidence digest entry");
  const file = resolve(evidence, match[2]);
  if (!file.startsWith(`${evidence}/`)) throw new Error("Unsafe evidence path");
  if (digest(await readFile(file)) !== match[1]) throw new Error("Evidence digest mismatch");
  hashes.set(match[2], match[1]);
}
const suite = await json(resolve(evidence, "evaluation-suite.json"));
for (const entry of suite.cases) {
  const prefix = `replay/${entry.runId}/`;
  if (!hashes.has(`${prefix}replay-manifest.json`))
    throw new Error("Replay manifest absent from verified bundle");
  const replay = await json(resolve(evidence, `${prefix}replay-manifest.json`));
  for (const artifact of replay.artifacts) {
    if (!/^artifacts\/sha256\/[a-f0-9]{64}$/u.test(artifact.path))
      throw new Error("Unsafe replay artifact path");
    const file = `${prefix}${artifact.path}`;
    const bytes = await readFile(resolve(evidence, file));
    if (digest(bytes) !== artifact.sha256 || bytes.length !== artifact.byteLength)
      throw new Error("Replay artifact integrity mismatch");
    hashes.set(file, artifact.sha256);
  }
}
const local = await json(resolve(root, "docs/evaluations/local-contract-results.json"));
const { contentSha256: localHash, ...localCore } = local;
if (digest(JSON.stringify(localCore)) !== localHash)
  throw new Error("Local result digest mismatch");

function testCounts(result) {
  if (!result) return { passed: null, executed: null, reason: "Gate output unavailable" };
  const count = /Ran (\d+) tests? in /u.exec(result.stderr);
  if (!count) return { passed: null, executed: null, reason: "Test count absent in bounded log" };
  const executed = Number(count[1]);
  if (result.passed) return { passed: executed, executed, reason: null };
  const failures = Number(/failures=(\d+)/u.exec(result.stderr)?.[1] ?? 0);
  const errors = Number(/errors=(\d+)/u.exec(result.stderr)?.[1] ?? 0);
  if (failures + errors === 0)
    return { passed: null, executed, reason: "Failure count unavailable" };
  return { passed: Math.max(0, executed - failures - errors), executed, reason: null };
}

async function metrics(runId, candidate) {
  const file = `replay/${runId}/artifacts/sha256/${candidate.outputSha256}`;
  if (!hashes.has(file)) throw new Error("Gate output absent from verified manifest");
  const raw = await readFile(resolve(evidence, file), "utf8");
  const line = raw.split(/\r?\n/u).find((entry) => entry.startsWith("PORTVERDICT_RESULT="));
  const gates = line ? JSON.parse(line.slice("PORTVERDICT_RESULT=".length)).results : [];
  const gate = (name) => gates.find((value) => value.name === name);
  const measuredTests = (name) =>
    gate("build")?.passed === false
      ? {
          passed: null,
          executed: null,
          reason: "Module did not compile; behavioral assertions could not execute",
        }
      : testCounts(gate(name));
  const counts = ["original-tests", "schema", "tool-calls", "streaming-retry", "security"].map(
    measuredTests,
  );
  const available = counts.every((value) => value.passed !== null && value.executed !== null);
  return {
    candidateId: candidate.candidateId ?? "single-shot",
    disposition: candidate.disposition,
    sandboxOperationId: candidate.sandboxOperationId,
    buildSuccess: gate("build")?.passed ?? null,
    tests: available
      ? {
          passed: counts.reduce((sum, value) => sum + value.passed, 0),
          executed: counts.reduce((sum, value) => sum + value.executed, 0),
        }
      : { passed: null, executed: null, reason: "At least one test count unavailable" },
    hiddenContracts: measuredTests("security"),
    schema: measuredTests("schema"),
    toolCalls: measuredTests("tool-calls"),
    streamingRetry: measuredTests("streaming-retry"),
    regressionCaught:
      gate("build")?.passed === true &&
      counts.some(
        (value) =>
          value.passed !== null && value.executed !== null && value.passed < value.executed,
      ),
    modelUsage: candidate.modelUsage,
    modelLatencyMs: candidate.modelLatencyMs,
    modelRetryCount: candidate.modelRetryCount,
    sandboxDurationMs: candidate.durationMs,
    resources: candidate.resources ?? null,
    resourceNote: candidate.resources
      ? "Provider memory field is retained without inventing a unit."
      : "Baseline resource fields beyond duration are not exposed in the suite summary.",
    outputSha256: candidate.outputSha256,
  };
}

const cases = [];
for (const entry of suite.cases) {
  const trial = await json(
    resolve(evidence, `evaluation-cases/${entry.caseId}/trial-summary.json`),
  );
  const candidates = await Promise.all(
    trial.candidates.map((candidate) => metrics(entry.runId, candidate)),
  );
  cases.push({
    caseId: entry.caseId,
    runId: entry.runId,
    checkpointImageId: entry.checkpointImageId,
    verdict: trial.verdict,
    metrics: entry.metrics,
    candidates,
    singleShotBaseline: await metrics(entry.runId, entry.singleShotBaseline),
    tavily: trial.tavily,
  });
}
const flat = cases.flatMap((entry) => entry.candidates);
const live = {
  kind: "authenticated-live-evaluation",
  suiteId: suite.suiteId,
  suiteIntegritySha256: suite.integritySha256,
  recordedAt: suite.recordedAt,
  expiresAt: suite.expiresAt,
  sourceCommit: suite.portVerdictCommitSha,
  exactModelId: suite.exactModelId,
  cases,
  aggregate: {
    caseCount: cases.length,
    candidateCount: flat.length,
    buildSuccesses: flat.filter((entry) => entry.buildSuccess === true).length,
    rejectedCandidates: flat.filter((entry) => entry.disposition === "rejected").length,
    inconclusiveCandidates: flat.filter((entry) => entry.disposition === "inconclusive").length,
    regressionsCaught: flat.filter((entry) => entry.regressionCaught).length,
    abstentions: cases.filter((entry) => entry.verdict.status === "abstained").length,
    singleShotEligible: cases.filter((entry) => entry.singleShotBaseline.disposition === "eligible")
      .length,
    inferenceCostEstimateUsd: cases.every((entry) => entry.metrics.estimatedCostUsd !== null)
      ? cases.reduce((sum, entry) => sum + entry.metrics.estimatedCostUsd, 0)
      : null,
  },
  limitations: [
    "Three pinned Python adapters, one completed suite; not a production-repository or cross-model benchmark.",
    "Tournament may receive bounded syntax/schema repairs; baseline receives one proposal plus at most one JSON-schema repair, never behavior-test feedback.",
    "Regressions caught counts building candidates with at least one failing executed behavior test; redundant hard-gate labels are not double counted.",
    "Costs cover recorded suite inference only, excluding earlier attempts, smoke, Sandbox and Tavily. This is not a total bill.",
    "End-to-end latency covers each recorded case, not earlier failed development runs; see the retained attempt ledger.",
    "Model API errors absent from this completed suite are not evidence that earlier calls never failed.",
  ],
};
const core = {
  schemaVersion: 2,
  tiers: { localContractPreflight: local, authenticatedLive: live },
};
await writeFile(
  resolve(root, "docs/evaluations/results.json"),
  `${JSON.stringify({ ...core, contentSha256: digest(JSON.stringify(core)) }, null, 2)}\n`,
);
const rate = (value) =>
  value.passed === null ? "unavailable" : `${value.passed}/${value.executed}`;
const rows = cases.flatMap((entry) =>
  [...entry.candidates, entry.singleShotBaseline].map(
    (candidate) =>
      `| ${entry.caseId} | ${candidate.candidateId} | ${candidate.buildSuccess} | ${rate(candidate.tests)} | ${rate(candidate.hiddenContracts)} | ${rate(candidate.schema)} | ${rate(candidate.toolCalls)} | ${candidate.disposition} |`,
  ),
);
const md = `# Measured evaluation results\n\n## Authenticated live suite\n\nRecorded ${suite.recordedAt}; model \`${suite.exactModelId}\`; suite \`${suite.suiteId}\`; source \`${suite.portVerdictCommitSha}\`. [Public evidence](https://portverdict.vercel.app/evidence/verified-live/evaluation-suite.json).\n\n${flat.length} candidate branches in ${cases.length} independent cases. ${live.aggregate.buildSuccesses} builds passed, ${live.aggregate.regressionsCaught} building candidates had behavioral failures, ${live.aggregate.abstentions} trials abstained. Single-shot baselines fully eligible: ${live.aggregate.singleShotEligible}/${cases.length}. No statistical-superiority claim is made.\n\n| Case | Proposal | Build | All tests | Hidden | Schema | Tool calls | Disposition |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\nCounts are executed Python unittest methods, not the ten overlapping eligibility labels. Missing counts stay unavailable. The hidden/security gate tests adversarial behavior contracts, not a general vulnerability audit.\n\n| Case | End-to-end ms | Retries | Recorded API errors | Inference estimate USD |\n| --- | --- | --- | --- | --- |\n${cases.map((entry) => `| ${entry.caseId} | ${entry.metrics.endToEndLatencyMs} | ${entry.metrics.retryCount} | ${entry.metrics.apiErrorCount} | ${entry.metrics.estimatedCostUsd ?? "unavailable"} |`).join("\n")}\n\nPer-proposal provider token usage, latency, raw Sandbox resource fields, request IDs, output hashes, and Tavily sources are in [results.json](results.json).\n\n### Limitations\n\n${live.limitations.map((value) => `- ${value}`).join("\n")}\n\n## Local contract preflight (separate tier)\n\nTen synthetic TypeScript/Python marker fixtures; no sponsor API calls. Stored naive baseline passes 0/10; the stored tournament selects 9/10 and abstains 1/10. These validate harness mechanics, not live model quality. [Local record](local-contract-results.json).\n`;
await writeFile(resolve(root, "docs/evaluations/results.md"), md);
console.log(JSON.stringify({ suiteId: suite.suiteId, ...live.aggregate }));
