import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { FileEvidenceStore, canonicalJson, sha256Bytes } from "@portverdict/evidence-store";

import type { LiveEvaluationSuite, SponsorSmokeEvidence, TrialSummary } from "./contracts.js";
import {
  assertSanitized,
  PRIVATE_EVIDENCE_ROOT,
  PUBLIC_EVIDENCE_ROOT,
  WEB_PUBLIC_EVIDENCE_ROOT,
  readJsonFile,
} from "./security.js";
import {
  validatePromotableSuite,
  validatePromotableTrial,
  validateSmokeEvidence,
} from "./invariants.js";

async function latestSuiteFile(): Promise<string> {
  const entries = await readdir(PRIVATE_EVIDENCE_ROOT, { withFileTypes: true });
  const candidates: { file: string; modifiedAt: number }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("suite_")) continue;
    const file = path.join(PRIVATE_EVIDENCE_ROOT, entry.name, "evaluation-suite.json");
    try {
      candidates.push({ file, modifiedAt: (await stat(file)).mtimeMs });
    } catch {
      // Ignore partial suites without a final manifest.
    }
  }
  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
  const latest = candidates[0]?.file;
  if (!latest) throw new Error("No completed private live evaluation suite is available.");
  return latest;
}

async function atomicWrite(directory: string, name: string, content: string): Promise<void> {
  const destination = path.join(directory, name);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o644 });
  await rename(temporary, destination);
}

async function copyVerifiedReplay(summary: TrialSummary, destinationRoot: string): Promise<void> {
  const sourceRun = path.join(PRIVATE_EVIDENCE_ROOT, summary.runId, "replay", summary.runId);
  const destinationReplayRoot = path.join(destinationRoot, "replay");
  const destinationRun = path.join(destinationReplayRoot, summary.runId);
  await mkdir(destinationReplayRoot, { recursive: true, mode: 0o755 });
  await cp(sourceRun, destinationRun, { recursive: true, force: false });
  const store = new FileEvidenceStore({ rootDir: destinationReplayRoot, fsync: false });
  const verified = await store.verifyReplayManifest(summary.runId);
  if (verified.manifest.integritySha256 !== summary.lifecycle.replayManifestSha256) {
    throw new Error(`Replay manifest and live summary disagree for ${summary.runId}.`);
  }
}

async function loadSuiteEvidence(now = Date.now()): Promise<{
  suite: LiveEvaluationSuite;
  trials: TrialSummary[];
  smoke: SponsorSmokeEvidence;
}> {
  const suite = validatePromotableSuite(await readJsonFile(await latestSuiteFile()), now);
  const trials = await Promise.all(
    suite.cases.map(async (liveCase) => {
      const trial = validatePromotableTrial(
        await readJsonFile(path.join(PRIVATE_EVIDENCE_ROOT, liveCase.runId, "trial-summary.json")),
        now,
      );
      if (
        trial.integritySha256 !== liveCase.trialIntegritySha256 ||
        trial.sourceRevision !== suite.portVerdictCommitSha ||
        trial.fixtureRevision !== liveCase.fixtureRevision ||
        trial.fixtureSha256 !== liveCase.fixtureSha256 ||
        trial.inputSourceSha256 !== liveCase.inputSourceSha256 ||
        trial.exactModelId !== suite.exactModelId ||
        trial.sponsorSmokeRunId !== suite.sponsorSmokeRunId ||
        trial.checkpoint.imageId !== liveCase.checkpointImageId ||
        canonicalJson(trial.candidates.map((candidate) => candidate.sandboxOperationId)) !==
          canonicalJson(liveCase.candidateOperationIds) ||
        trial.baseline.sandboxOperationId !== liveCase.singleShotBaseline.sandboxOperationId
      ) {
        throw new Error(`Suite and trial evidence disagree for ${liveCase.caseId}.`);
      }
      return trial;
    }),
  );
  const smoke = validateSmokeEvidence(
    await readJsonFile(
      path.join(PRIVATE_EVIDENCE_ROOT, suite.sponsorSmokeRunId, "sponsor-smoke.json"),
    ),
    now,
  );
  if (smoke.tokenFactory.exactModelId !== suite.exactModelId) {
    throw new Error("Smoke and evaluation suite exact model IDs disagree.");
  }
  assertSanitized({ suite, trials, smoke });
  return { suite, trials, smoke };
}

function trialReport(suite: LiveEvaluationSuite, trials: readonly TrialSummary[]): string {
  const rows = trials.flatMap((trial, caseIndex) =>
    trial.candidates.map((candidate) => {
      const liveCase = suite.cases[caseIndex];
      return `| ${liveCase?.behaviorFamily ?? "unknown"} | \`${candidate.candidateId}\` | ${candidate.disposition} | ${Object.values(candidate.gates).filter((status) => status === "passed").length}/${Object.keys(candidate.gates).length} | \`${candidate.sandboxOperationId}\` |`;
    }),
  );
  return `# PortVerdict verified live evaluation suite

> AUTHENTICATED RECORDED EVIDENCE — ${suite.recordedAt}

- Suite: \`${suite.suiteId}\`
- PortVerdict commit: \`${suite.portVerdictCommitSha}\`
- Exact NVIDIA model: \`${suite.exactModelId}\`
- Cases: ${suite.cases.length}

| Behavior family | Candidate | Disposition | Hard gates | Sandbox operation |
| --- | --- | --- | ---: | --- |
${rows.join("\n")}

Each case used one immutable checkpoint for three tournament candidates and one model-generated single-shot baseline. These are measured single runs, not statistical performance claims.
`;
}

async function buildStagingBundle(
  destinationRoot: string,
  suite: LiveEvaluationSuite,
  trials: readonly TrialSummary[],
  smoke: SponsorSmokeEvidence,
): Promise<string> {
  await mkdir(destinationRoot, { recursive: true, mode: 0o755 });
  for (const trial of trials) await copyVerifiedReplay(trial, destinationRoot);

  const primary = trials[0];
  if (!primary) throw new Error("Evaluation suite has no primary live trial.");
  const suiteText = `${canonicalJson(suite)}\n`;
  const smokeText = `${canonicalJson(smoke)}\n`;
  const primaryText = `${canonicalJson(primary)}\n`;
  const report = trialReport(suite, trials);
  assertSanitized({ suiteText, smokeText, primaryText, report });

  await atomicWrite(destinationRoot, "evaluation-suite.json", suiteText);
  await atomicWrite(destinationRoot, "sponsor-smoke.json", smokeText);
  await atomicWrite(destinationRoot, "trial-summary.json", primaryText);
  await atomicWrite(destinationRoot, "report.md", report);
  for (const [index, trial] of trials.entries()) {
    const liveCase = suite.cases[index];
    if (!liveCase) throw new Error("Suite case and trial counts diverged.");
    await atomicWrite(
      destinationRoot,
      path.join("evaluation-cases", liveCase.caseId, "trial-summary.json"),
      `${canonicalJson(trial)}\n`,
    );
  }

  const primaryReplayRoot = path.join(destinationRoot, "replay", primary.runId);
  const eventsText = await readFile(path.join(primaryReplayRoot, "events.ndjson"), "utf8");
  const snapshotText = await readFile(path.join(primaryReplayRoot, "snapshot.json"), "utf8");
  const manifestText = await readFile(path.join(primaryReplayRoot, "replay-manifest.json"), "utf8");
  assertSanitized({ eventsText, snapshotText, manifestText });
  await atomicWrite(destinationRoot, "events.ndjson", eventsText);
  await atomicWrite(destinationRoot, "snapshot.json", snapshotText);
  await atomicWrite(destinationRoot, "replay-manifest.json", manifestText);

  let selectedPatch = "";
  if (primary.verdict.status === "selected") {
    const selectedCandidateId = primary.verdict.selectedCandidateId;
    const selected = primary.candidates.find(
      (candidate) => candidate.candidateId === selectedCandidateId,
    );
    if (!selected) throw new Error("Selected candidate evidence is missing.");
    selectedPatch = await readFile(
      path.join(primaryReplayRoot, "artifacts", "sha256", selected.diffSha256),
      "utf8",
    );
    assertSanitized(selectedPatch);
    await atomicWrite(destinationRoot, "selected.patch", selectedPatch);
  }

  const sums: string[] = [
    `${sha256Bytes(suiteText)}  evaluation-suite.json`,
    `${sha256Bytes(smokeText)}  sponsor-smoke.json`,
    `${sha256Bytes(primaryText)}  trial-summary.json`,
    `${sha256Bytes(report)}  report.md`,
    `${sha256Bytes(eventsText)}  events.ndjson`,
    `${sha256Bytes(snapshotText)}  snapshot.json`,
    `${sha256Bytes(manifestText)}  replay-manifest.json`,
  ];
  for (const [index, trial] of trials.entries()) {
    const liveCase = suite.cases[index];
    if (!liveCase) continue;
    const text = `${canonicalJson(trial)}\n`;
    const replayManifest = await readFile(
      path.join(destinationRoot, "replay", trial.runId, "replay-manifest.json"),
    );
    sums.push(
      `${sha256Bytes(text)}  evaluation-cases/${liveCase.caseId}/trial-summary.json`,
      `${sha256Bytes(replayManifest)}  replay/${trial.runId}/replay-manifest.json`,
    );
  }
  if (selectedPatch) sums.push(`${sha256Bytes(selectedPatch)}  selected.patch`);
  const sha256Sums = `${sums.sort().join("\n")}\n`;
  const readme = `# Verified live evidence

This immutable public bundle was promoted only after authenticated Nebius Token Factory inference, three independent migration cases, one shared Token Factory Sandbox checkpoint per case, three sibling candidate operations per case, a model-generated single-shot baseline, Tavily Search + Extract, deterministic gates, cleanup, redaction, and replay integrity verification.

- Suite: \`${suite.suiteId}\`
- Primary replay: \`${primary.runId}\`
- Recorded: ${suite.recordedAt}
- Evidence TTL: ${suite.expiresAt}
- Exact NVIDIA model ID: \`${suite.exactModelId}\`
`;
  await atomicWrite(destinationRoot, "SHA256SUMS", sha256Sums);
  await atomicWrite(destinationRoot, "README.md", readme);
  return sha256Sums;
}

export async function replaceDirectoriesAtomically(
  entries: readonly { destination: string; staging: string }[],
): Promise<void> {
  const prepared: Array<{
    destination: string;
    staging: string;
    backup: string;
    hadDestination: boolean;
    installed: boolean;
  }> = [];
  for (const entry of entries) {
    const backup = `${entry.destination}.backup`;
    await rm(backup, { recursive: true, force: true });
    let hadDestination = false;
    try {
      await access(entry.destination);
      hadDestination = true;
      await rename(entry.destination, backup);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    prepared.push({ ...entry, backup, hadDestination, installed: false });
  }
  try {
    for (const entry of prepared) {
      await rename(entry.staging, entry.destination);
      entry.installed = true;
    }
  } catch (error) {
    for (const entry of [...prepared].reverse()) {
      if (entry.installed) await rm(entry.destination, { recursive: true, force: true });
      if (entry.hadDestination) await rename(entry.backup, entry.destination);
    }
    throw error;
  }
  await Promise.all(
    prepared
      .filter((entry) => entry.hadDestination)
      .map((entry) => rm(entry.backup, { recursive: true, force: true })),
  );
}

export async function promoteLatestEvidence(): Promise<{
  suite: LiveEvaluationSuite;
  trial: TrialSummary;
  smoke: SponsorSmokeEvidence;
  sha256Sums: string;
}> {
  const { suite, trials, smoke } = await loadSuiteEvidence();
  let sha256Sums = "";
  const staged: Array<{ destination: string; staging: string }> = [];
  for (const publicRoot of [PUBLIC_EVIDENCE_ROOT, WEB_PUBLIC_EVIDENCE_ROOT]) {
    const staging = `${publicRoot}.staging`;
    await rm(staging, { recursive: true, force: true });
    const currentSums = await buildStagingBundle(staging, suite, trials, smoke);
    if (sha256Sums && sha256Sums !== currentSums) {
      throw new Error("Public evidence mirrors produced different hash manifests.");
    }
    sha256Sums = currentSums;
    staged.push({ destination: publicRoot, staging });
  }
  await replaceDirectoriesAtomically(staged);
  const trial = trials[0];
  if (!trial) throw new Error("Promoted suite has no primary trial.");
  return { suite, trial, smoke, sha256Sums };
}
