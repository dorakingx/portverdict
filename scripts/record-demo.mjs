import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "submission");
const generated = resolve(output, "screenshots/generated");
const base = "https://portverdict.vercel.app";
const load = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const suite = await load("fixtures/verified-live/evaluation-suite.json");
const trial = await load("fixtures/verified-live/trial-summary.json");
const ready = await fetch(`${base}/api/ready`).then((response) => response.json());
const published = await fetch(`${base}/evidence/verified-live/evaluation-suite.json`).then(
  (response) => response.json(),
);
if (
  ready.overall !== "verified" ||
  ready.runId !== trial.runId ||
  published.integritySha256 !== suite.integritySha256
)
  throw new Error("Record only after the exact live suite is verified in production");
await mkdir(generated, { recursive: true });
const run = `/runs/${trial.runId}`;
const candidate = trial.candidates[0];
const rejectedCase = suite.cases.find((entry) => entry.behaviorFamily === "tool-calling");
if (!rejectedCase) throw new Error("Missing the recorded tool-calling counterexample case");
const rejectedTrial = await load(
  `fixtures/verified-live/evaluation-cases/${rejectedCase.caseId}/trial-summary.json`,
);
const rejectedCandidate = rejectedTrial.candidates.find(
  (entry) => entry.disposition === "rejected",
);
if (!rejectedCandidate)
  throw new Error("The counterexample scene requires an actual rejected candidate");
const eligible = trial.verdict.eligibleCandidateIds.length;
const verdict =
  trial.verdict.status === "abstained"
    ? "abstains. It refuses to choose a least-bad patch"
    : "selects a candidate only after every required hard gate passes";
const scenes = [
  {
    duration: 15,
    path: "/",
    title: "A compiling migration can still break behavior",
    text: "A model migration can compile and still break behavior. Streaming, structured output, tool arguments, and retries are contracts that a plausible patch can silently change. PortVerdict puts those migrations on trial.",
  },
  {
    duration: 15,
    path: `${run}/workflow`,
    title: "Recorded live experiment · no account required",
    text: "This is an authenticated, recorded experiment, not a mock sponsor integration. Anyone can inspect the evidence without an account. New execution stays in an owner-only runner, so public visitors cannot spend API credits.",
  },
  {
    duration: 25,
    path: `${run}/workflow`,
    title: `Catalog-bound model: ${trial.exactModelId}`,
    text: "The runner discovers the exact NVIDIA model from the authenticated Nebius catalog. This evaluation uses Nemotron Three Super. It generates three different migration strategies: minimal compatibility, prompt and schema adaptation, and resilience. Each proposal has provider response identities, measured token usage, and a source hash. Model commentary never decides whether the code is safe.",
  },
  {
    duration: 25,
    path: `${run}/compare`,
    title: "One immutable checkpoint · three real sibling operations",
    text: "Nebius Token Factory Sandboxes provide the controlled experiment. All three candidate operations start from the same immutable checkpoint. The proposed code runs as a non-root user with networking disabled. Fixed tests, source hashes, operation identities, and resource observations make each branch attributable. A separate single-shot proposal is tested from that same checkpoint.",
  },
  {
    duration: 25,
    path: `/runs/${rejectedCase.runId}/evidence/${rejectedCandidate.candidateId}`,
    title: "Executed tests · exit codes · losing evidence retained",
    text: "Here is a losing branch from the tool calling case. Its build passed, but behavioral contracts failed. The real logs preserve the failing checks, exit codes, and timings. Any failed hard gate rejects the candidate. This view keeps the proposed diff even when that branch cannot ship. A hash verified artifact backs the readable evidence.",
    scroll: ".artifact-viewer",
  },
  {
    duration: 20,
    path: `${run}/report`,
    title: "Tavily Search → official-domain filter → Extract",
    text: "Tavily performs real Search and Extract calls for official compatibility guidance. The report preserves request identities, source URLs, retrieval times, and content hashes. Bounded excerpts inform generation, but retrieved text stays untrusted and cannot change execution policy or the fixed tests.",
  },
  {
    duration: 25,
    path: `${run}/report`,
    title: `Recorded verdict: ${trial.verdict.status.toUpperCase()}`,
    text: `In this recorded case, PortVerdict ${verdict}. ${eligible} of the three candidate proposals satisfied all required gates. The three-case suite covers structured output, tool calling, and streaming with retries. Results are descriptive, not a statistical claim of model superiority. Inspect the adverse outcomes and the single-shot baselines alongside the tournament.`,
    secondPath: `${run}/evidence/${candidate.candidateId}`,
  },
  {
    duration: 20,
    path: "https://github.com/dorakingx/portverdict",
    title: "Public source · Apache-2.0 · reproducible evidence",
    text: "The public repository includes the Apache licensed source, immutable evidence, reproducible tests, and the owner-run workflow. Earlier failed development attempts are documented, not hidden. PortVerdict turns a model migration into an experiment you can inspect, and a verdict you can defend.",
  },
];
const probe = async (file) =>
  Number(
    (
      await exec("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        file,
      ])
    ).stdout.trim(),
  );
const timestamp = (seconds) =>
  new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23).replace(".", ",");
const captions = [];
let offset = 0;
for (const [index, scene] of scenes.entries()) {
  const speechText = resolve(generated, `narration-${index}.txt`);
  scene.audio = resolve(generated, `narration-${index}.aiff`);
  await writeFile(speechText, scene.text);
  await exec("say", ["-v", "Samantha", "-r", "175", "-f", speechText, "-o", scene.audio]);
  scene.audioDuration = await probe(scene.audio);
  if (scene.audioDuration > scene.duration - 0.2)
    throw new Error(`Narration ${index} exceeds its scene: ${scene.audioDuration}`);
  const sentences = scene.text.match(/[^.!?]+[.!?]+/gu) ?? [scene.text];
  const totalWords = scene.text.trim().split(/\s+/u).length;
  let sentenceOffset = offset;
  for (const sentence of sentences) {
    const duration = (scene.audioDuration * sentence.trim().split(/\s+/u).length) / totalWords;
    captions.push(
      `${captions.length + 1}\n${timestamp(sentenceOffset)} --> ${timestamp(sentenceOffset + duration)}\n${sentence.trim()}\n`,
    );
    sentenceOffset += duration;
  }
  offset += scene.duration;
}
await writeFile(resolve(output, "video-captions.srt"), `${captions.join("\n")}\n`);
await writeFile(
  resolve(output, "video-script.md"),
  `# English demo narration\n\n170-second public production capture. Voice: macOS Samantha (synthetic narration), no music. Exact model: \`${trial.exactModelId}\`. Recorded run: \`${trial.runId}\`.\n\n${scenes.map((scene, index) => `## Scene ${index + 1}: ${scene.title}\n\n${scene.text}`).join("\n\n")}\n`,
);
let shotStart = 0;
await writeFile(
  resolve(output, "video-shot-list.md"),
  `# Actual production shot list\n\n${scenes
    .map((scene) => {
      const from = shotStart;
      shotStart += scene.duration;
      return `- ${from}–${shotStart}s: ${scene.path}; ${scene.title}.`;
    })
    .join(
      "\n",
    )}\n\nThe bottom callout is an editorial demo overlay, not an added execution result. All application content is captured from production.\n`,
);
const browser = await chromium.launch({
  executablePath: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: generated, size: { width: 1920, height: 1080 } },
  colorScheme: "dark",
});
const page = await context.newPage();
const consoleErrors = [];
page.on("pageerror", (error) => consoleErrors.push(error.message));
await page.goto(base, { waitUntil: "networkidle" });
await page.screenshot({ path: resolve(output, "youtube-thumbnail.png") });
const start = Date.now();
let deadline = start;
for (const [index, scene] of scenes.entries()) {
  deadline += scene.duration * 1000;
  await page.goto(scene.path.startsWith("https:") ? scene.path : base + scene.path, {
    waitUntil: "networkidle",
  });
  if (scene.scroll) await page.locator(scene.scroll).scrollIntoViewIfNeeded();
  const overlay = async () =>
    page.evaluate(
      ({ title }) => {
        document.getElementById("portverdict-demo-callout")?.remove();
        const element = document.createElement("div");
        element.id = "portverdict-demo-callout";
        element.textContent = `DEMO GUIDE  ·  ${title}`;
        Object.assign(element.style, {
          position: "fixed",
          bottom: "18px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: "2147483647",
          background: "#06130fed",
          color: "#d4ffe9",
          border: "1px solid #73d6ab",
          borderRadius: "10px",
          padding: "13px 25px",
          font: "600 20px system-ui",
          maxWidth: "90vw",
          textAlign: "center",
          pointerEvents: "none",
        });
        document.body.append(element);
      },
      { title: scene.title },
    );
  await overlay();
  await page.screenshot({ path: resolve(generated, `production-scene-${index + 1}.png`) });
  console.log(`Recording scene ${index + 1}/${scenes.length}: ${scene.title}`);
  if (scene.secondPath) {
    await page.waitForTimeout(Math.max(0, deadline - Date.now() - 11000));
    await page.goto(base + scene.secondPath, { waitUntil: "networkidle" });
    await page.getByText("Inspect candidate diff", { exact: true }).click();
    await page.getByLabel("Candidate diff", { exact: true }).scrollIntoViewIfNeeded();
    await overlay();
  }
  await page.waitForTimeout(Math.max(0, deadline - Date.now()));
}
const video = page.video();
await context.close();
await browser.close();
if (consoleErrors.length)
  throw new Error(`Page errors during recording: ${consoleErrors.join("; ")}`);
const rawVideo = await video.path();
const rawDuration = await probe(rawVideo);
const trimStart = Math.max(0, rawDuration - 170);
const args = ["-y", "-ss", trimStart.toFixed(3), "-i", rawVideo];
for (const scene of scenes) args.push("-i", scene.audio);
args.push("-i", resolve(output, "video-captions.srt"));
let audioOffset = 0;
const filters = scenes.map((scene, index) => {
  const value = `[${index + 1}:a]adelay=${audioOffset}|${audioOffset}[a${index}]`;
  audioOffset += scene.duration * 1000;
  return value;
});
filters.push(
  `${scenes.map((_, index) => `[a${index}]`).join("")}amix=inputs=${scenes.length}:normalize=0,apad,atrim=duration=170[narration]`,
);
args.push(
  "-filter_complex",
  filters.join(";"),
  "-map",
  "0:v",
  "-map",
  "[narration]",
  "-map",
  `${scenes.length + 1}:s`,
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "23",
  "-pix_fmt",
  "yuv420p",
  "-r",
  "30",
  "-c:a",
  "aac",
  "-b:a",
  "160k",
  "-c:s",
  "mov_text",
  "-metadata:s:s:0",
  "language=eng",
  "-t",
  "170",
  "-movflags",
  "+faststart",
  resolve(output, "demo-video.mp4"),
);
await exec("ffmpeg", args, { maxBuffer: 5_000_000 });
console.log(
  JSON.stringify({
    video: resolve(output, "demo-video.mp4"),
    duration: await probe(resolve(output, "demo-video.mp4")),
    exactModelId: trial.exactModelId,
    runId: trial.runId,
  }),
);
