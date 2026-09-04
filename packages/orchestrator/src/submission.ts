import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { sha256Bytes } from "@portverdict/evidence-store";

import { LiveEvaluationSuiteSchema, type LiveEvaluationSuite } from "./contracts.js";
import { validatePromotableSuite } from "./invariants.js";
import { readVerifiedPublicReplay } from "./public-evidence.js";
import { getLiveReadiness } from "./readiness.js";
import { assertSanitized, WEB_PUBLIC_EVIDENCE_ROOT } from "./security.js";

const execFileAsync = promisify(execFile);
const PUBLIC_DEMO_URL = "https://portverdict.vercel.app";
const PUBLIC_REPOSITORY_URL = "https://github.com/dorakingx/portverdict";
const REQUIRED_SUBMISSION_FILES = [
  "devpost-draft.md",
  "demo-video.mp4",
  "video-script.md",
  "video-shot-list.md",
  "video-captions.srt",
  "youtube-title.txt",
  "youtube-description.md",
  "youtube-thumbnail.png",
  "youtube-url.txt",
] as const;
const FINAL_TEXT_FILES = [
  "devpost-draft.md",
  "video-script.md",
  "video-shot-list.md",
  "video-captions.srt",
  "youtube-title.txt",
  "youtube-description.md",
  "youtube-url.txt",
] as const;
const INCOMPLETE_MARKER =
  /\[(?:blocked|todo|placeholder)[^\]]*\]|live evidence required|synthetic development replay|501\s+not implemented/iu;

function resolveInside(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Unsafe relative path in submission verification: ${relativePath}.`);
  }
  return resolved;
}

async function requireFile(root: string, relativePath: string, minimumBytes = 1): Promise<string> {
  const absolute = resolveInside(root, relativePath);
  const metadata = await stat(absolute);
  if (!metadata.isFile() || metadata.size < minimumBytes) {
    throw new Error(`${path.join(path.basename(root), relativePath)} is missing or incomplete.`);
  }
  return absolute;
}

async function requestPublicUrl(url: string): Promise<Response> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": "PortVerdict-submission-verifier/1.0" },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return response;
}

function parseYouTubeUrl(value: string): string {
  const url = new URL(value.trim());
  const host = url.hostname.toLowerCase();
  const isYouTube =
    (host === "www.youtube.com" || host === "youtube.com") &&
    url.pathname === "/watch" &&
    Boolean(url.searchParams.get("v"));
  const isShort = host === "youtu.be" && /^\/[A-Za-z0-9_-]{6,}$/u.test(url.pathname);
  if (url.protocol !== "https:" || (!isYouTube && !isShort)) {
    throw new Error("submission/youtube-url.txt is not a public HTTPS YouTube video URL.");
  }
  return url.toString();
}

async function probeVideoDuration(videoPath: string): Promise<number> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        videoPath,
      ],
      { encoding: "utf8", timeout: 30_000 },
    ));
  } catch {
    throw new Error("ffprobe could not validate submission/demo-video.mp4.");
  }
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration < 160 || duration > 175) {
    throw new Error(
      `Demo video duration must be 160–175 seconds; measured ${Number.isFinite(duration) ? duration.toFixed(2) : "invalid"} seconds.`,
    );
  }
  return duration;
}

export async function verifyHashManifest(evidenceRoot: string): Promise<number> {
  const manifest = await readFile(resolveInside(evidenceRoot, "SHA256SUMS"), "utf8");
  const entries = manifest.split(/\r?\n/u).filter(Boolean);
  if (entries.length < 13)
    throw new Error("Public SHA256SUMS is incomplete for the three-case suite.");
  const seen = new Set<string>();
  for (const entry of entries) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._/-]+)$/u.exec(entry);
    if (!match) throw new Error("Public SHA256SUMS contains a malformed entry.");
    const expected = match[1] as string;
    const relativePath = match[2] as string;
    if (seen.has(relativePath)) throw new Error(`Duplicate SHA256SUMS entry: ${relativePath}.`);
    seen.add(relativePath);
    const actual = sha256Bytes(await readFile(resolveInside(evidenceRoot, relativePath)));
    if (actual !== expected) throw new Error(`Public evidence digest mismatch: ${relativePath}.`);
  }
  for (const required of [
    "evaluation-suite.json",
    "sponsor-smoke.json",
    "trial-summary.json",
    "events.ndjson",
    "snapshot.json",
    "replay-manifest.json",
  ]) {
    if (!seen.has(required)) throw new Error(`Public SHA256SUMS omits ${required}.`);
  }
  return entries.length;
}

async function verifyEvaluationSuite(evidenceRoot: string): Promise<LiveEvaluationSuite> {
  const suite = validatePromotableSuite(
    LiveEvaluationSuiteSchema.parse(
      JSON.parse(
        await readFile(resolveInside(evidenceRoot, "evaluation-suite.json"), "utf8"),
      ) as unknown,
    ),
  );
  for (const liveCase of suite.cases) {
    const replay = await readVerifiedPublicReplay({
      evidenceRoot,
      runId: liveCase.runId,
      summaryRelativePath: path.join("evaluation-cases", liveCase.caseId, "trial-summary.json"),
    });
    if (!replay) throw new Error(`Public replay failed verification for ${liveCase.caseId}.`);
    if (
      replay.summary.integritySha256 !== liveCase.trialIntegritySha256 ||
      replay.summary.sourceRevision !== suite.portVerdictCommitSha ||
      replay.summary.exactModelId !== suite.exactModelId ||
      replay.summary.checkpoint.imageId !== liveCase.checkpointImageId
    ) {
      throw new Error(`Suite, summary, and replay disagree for ${liveCase.caseId}.`);
    }
  }
  return suite;
}

async function verifyNetworkPublication(
  suite: LiveEvaluationSuite,
  primaryRunId: string,
  youtubeUrl: string,
): Promise<void> {
  const [demo, readinessResponse, suiteResponse, repository, license, youtube] = await Promise.all([
    requestPublicUrl(PUBLIC_DEMO_URL),
    requestPublicUrl(`${PUBLIC_DEMO_URL}/api/ready`),
    requestPublicUrl(`${PUBLIC_DEMO_URL}/evidence/verified-live/evaluation-suite.json`),
    requestPublicUrl(PUBLIC_REPOSITORY_URL),
    requestPublicUrl("https://raw.githubusercontent.com/dorakingx/portverdict/main/LICENSE"),
    requestPublicUrl(youtubeUrl),
  ]);
  if (!demo.headers.get("content-type")?.includes("text/html")) {
    throw new Error("The production demo did not return HTML.");
  }
  const readiness = (await readinessResponse.json()) as {
    overall?: unknown;
    runId?: unknown;
    exactModelId?: unknown;
  };
  if (
    readiness.overall !== "verified" ||
    readiness.runId !== primaryRunId ||
    readiness.exactModelId !== suite.exactModelId
  ) {
    throw new Error("The production readiness endpoint does not match the verified live suite.");
  }
  const publicSuite = LiveEvaluationSuiteSchema.parse(await suiteResponse.json());
  if (publicSuite.integritySha256 !== suite.integritySha256) {
    throw new Error("The production evidence suite differs from the locally verified bundle.");
  }
  const repositoryText = await repository.text();
  const licenseText = await license.text();
  if (
    !repositoryText.includes("PortVerdict") ||
    !/Apache License\s+Version 2\.0/iu.test(licenseText)
  ) {
    throw new Error("The public repository or Apache-2.0 license could not be verified.");
  }
  const youtubeText = await youtube.text();
  if (/private video|video unavailable|this video is unavailable/iu.test(youtubeText)) {
    throw new Error("The YouTube demo is not publicly watchable.");
  }
}

export async function verifySubmissionReadiness(
  options: {
    network?: boolean;
    evidenceRoot?: string;
    submissionRoot?: string;
  } = {},
): Promise<{
  runId: string;
  suiteId: string;
  exactModelId: string;
  files: number;
  hashEntries: number;
  videoDurationSeconds: number;
  youtubeUrl: string;
  networkVerified: boolean;
}> {
  const evidenceRoot = path.resolve(options.evidenceRoot ?? WEB_PUBLIC_EVIDENCE_ROOT);
  const submissionRoot = path.resolve(
    options.submissionRoot ?? path.join(process.cwd(), "submission"),
  );
  const readiness = await getLiveReadiness({
    evidencePath: resolveInside(evidenceRoot, "trial-summary.json"),
  });
  if (readiness.state !== "verified" || !readiness.runId || !readiness.exactModelId) {
    throw new Error(`Promoted live evidence is not submission-ready (${readiness.state}).`);
  }
  const suite = await verifyEvaluationSuite(evidenceRoot);
  const primary = suite.cases[0];
  if (
    !primary ||
    primary.runId !== readiness.runId ||
    suite.exactModelId !== readiness.exactModelId
  ) {
    throw new Error("Primary readiness evidence does not match the three-case evaluation suite.");
  }
  const hashEntries = await verifyHashManifest(evidenceRoot);

  await Promise.all(
    REQUIRED_SUBMISSION_FILES.map((file) =>
      requireFile(
        submissionRoot,
        file,
        file.endsWith(".mp4") ? 100_000 : file.endsWith(".png") ? 10_000 : 1,
      ),
    ),
  );
  const textEntries = await Promise.all(
    FINAL_TEXT_FILES.map(
      async (file) => [file, await readFile(resolveInside(submissionRoot, file), "utf8")] as const,
    ),
  );
  const text = Object.fromEntries(textEntries) as Record<(typeof FINAL_TEXT_FILES)[number], string>;
  for (const [file, content] of textEntries) {
    if (INCOMPLETE_MARKER.test(content)) {
      throw new Error(`submission/${file} still contains an incomplete marker.`);
    }
  }
  assertSanitized(text);
  const claimText = `${text["devpost-draft.md"]}\n${text["youtube-description.md"]}`;
  for (const requiredClaim of [
    suite.suiteId,
    suite.exactModelId,
    PUBLIC_DEMO_URL,
    PUBLIC_REPOSITORY_URL,
    ...suite.cases.flatMap((liveCase) => [
      liveCase.checkpointImageId,
      ...liveCase.candidateOperationIds,
    ]),
  ]) {
    if (!claimText.includes(requiredClaim)) {
      throw new Error(
        `Final submission copy omits verified evidence identifier: ${requiredClaim}.`,
      );
    }
  }

  const videoPath = resolveInside(submissionRoot, "demo-video.mp4");
  const thumbnail = await readFile(resolveInside(submissionRoot, "youtube-thumbnail.png"));
  const videoHeader = await readFile(videoPath).then((value) => value.subarray(0, 12));
  if (thumbnail.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("submission/youtube-thumbnail.png is not a PNG file.");
  }
  if (videoHeader.subarray(4, 8).toString("ascii") !== "ftyp") {
    throw new Error("submission/demo-video.mp4 is not an MP4 container.");
  }
  const videoDurationSeconds = await probeVideoDuration(videoPath);
  const youtubeUrl = parseYouTubeUrl(text["youtube-url.txt"]);

  const networkVerified = options.network !== false;
  if (networkVerified) {
    await verifyNetworkPublication(suite, readiness.runId, youtubeUrl);
  }
  return {
    runId: readiness.runId,
    suiteId: suite.suiteId,
    exactModelId: readiness.exactModelId,
    files: REQUIRED_SUBMISSION_FILES.length,
    hashEntries,
    videoDurationSeconds,
    youtubeUrl,
    networkVerified,
  };
}
