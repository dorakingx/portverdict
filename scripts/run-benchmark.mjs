import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const root = resolve(import.meta.dirname, "..");
const fixturePaths = [
  "fixtures/typescript/chat-basic/fixture.json",
  "fixtures/typescript/streaming/fixture.json",
  "fixtures/typescript/structured-output/fixture.json",
  "fixtures/typescript/tool-calling/fixture.json",
  "fixtures/typescript/retries/fixture.json",
  "fixtures/python/chat-basic/fixture.json",
  "fixtures/python/streaming/fixture.json",
  "fixtures/python/structured-output/fixture.json",
  "fixtures/python/tool-calling/fixture.json",
  "fixtures/python/retries/fixture.json",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validateFixture(value, path) {
  const stringFields = ["id", "language", "behavior", "source", "baseline"];
  if (
    value === null ||
    typeof value !== "object" ||
    stringFields.some((field) => typeof value[field] !== "string") ||
    !["typescript", "python"].includes(value.language) ||
    !Array.isArray(value.candidates) ||
    value.candidates.length !== 2 ||
    !value.candidates.every((candidate) => typeof candidate === "string") ||
    !Array.isArray(value.required) ||
    !value.required.every((pattern) => typeof pattern === "string" && pattern.length > 0) ||
    !Array.isArray(value.forbidden) ||
    !value.forbidden.every((pattern) => typeof pattern === "string" && pattern.length > 0)
  ) {
    throw new Error(`Invalid benchmark fixture: ${path}`);
  }
  return value;
}

function evaluate(candidate, fixture) {
  const missing = fixture.required.filter((pattern) => !candidate.includes(pattern));
  const forbidden = fixture.forbidden.filter((pattern) => candidate.includes(pattern));
  return {
    passed: missing.length === 0 && forbidden.length === 0,
    missing,
    forbidden,
  };
}

const startedAt = performance.now();
const fixtures = await Promise.all(
  fixturePaths.map(async (path) => {
    const bytes = await readFile(resolve(root, path), "utf8");
    return { path, bytes, fixture: validateFixture(JSON.parse(bytes), path) };
  }),
);

const cases = fixtures.map(({ path, bytes, fixture }) => {
  const baseline = evaluate(fixture.baseline, fixture);
  const candidateResults = fixture.candidates.map((candidate, index) => ({
    candidate: index + 1,
    ...evaluate(candidate, fixture),
  }));
  const selected = candidateResults.find((candidate) => candidate.passed)?.candidate ?? null;
  return {
    id: fixture.id,
    language: fixture.language,
    behavior: fixture.behavior,
    fixturePath: path,
    fixtureSha256: sha256(bytes),
    baseline,
    candidates: candidateResults,
    verdict: selected === null ? "abstained" : "selected",
    selectedCandidate: selected,
  };
});

const completedAt = performance.now();
const baselinePassed = cases.filter((item) => item.baseline.passed).length;
const workflowSelected = cases.filter((item) => item.verdict === "selected").length;
const regressionsCaught = cases.filter(
  (item) => !item.baseline.passed && item.verdict === "selected",
).length;
const resultCore = {
  schemaVersion: 1,
  benchmarkKind: "deterministic-local-contract-preflight",
  sponsorCallsMade: false,
  modelCallsMade: false,
  sandboxCallsMade: false,
  fixtureCount: cases.length,
  methodology:
    "Evaluate stored candidate snippets against explicit required and forbidden behavior-contract markers. This checks the evaluator harness, not model quality or live migration performance.",
  cases,
  summary: {
    baselinePassed,
    baselineFailed: cases.length - baselinePassed,
    workflowSelected,
    workflowAbstained: cases.length - workflowSelected,
    regressionsCaught,
    elapsedMilliseconds: Number((completedAt - startedAt).toFixed(3)),
  },
};
const results = { ...resultCore, contentSha256: sha256(JSON.stringify(resultCore)) };
const outputPath = resolve(root, "docs/evaluations/local-contract-results.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
process.stdout.write(
  `Wrote ${relative(root, outputPath)}: ${cases.length} fixtures, ${regressionsCaught} known regressions caught.\n`,
);
