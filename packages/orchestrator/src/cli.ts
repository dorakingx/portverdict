import { loadLocalEnvironment } from "./env.js";
import { promoteLatestEvidence } from "./promotion.js";
import { runSponsorSmoke } from "./smoke.js";
import { verifySubmissionReadiness } from "./submission.js";
import { runLiveEvaluationSuite } from "./trial.js";

async function main(): Promise<void> {
  await loadLocalEnvironment();
  const command = process.argv[2];
  if (command === "smoke") {
    const evidence = await runSponsorSmoke();
    console.log(
      JSON.stringify({
        status: evidence.status,
        runId: evidence.runId,
        exactModelId: evidence.tokenFactory.exactModelId,
        catalogRequestId: evidence.tokenFactory.catalogRequestId,
        inferenceRequestIds: evidence.tokenFactory.inferenceRequestIds,
        sandboxOperationId: evidence.sandbox.operationId,
        tavilySearchRequestId: evidence.tavily.searchRequestId,
        tavilyExtractRequestId: evidence.tavily.extractRequestId,
      }),
    );
    return;
  }
  if (command === "trial") {
    const evidence = await runLiveEvaluationSuite();
    console.log(
      JSON.stringify({
        status: evidence.status,
        suiteId: evidence.suiteId,
        exactModelId: evidence.exactModelId,
        cases: evidence.cases.map((liveCase) => ({
          caseId: liveCase.caseId,
          runId: liveCase.runId,
          checkpointImageId: liveCase.checkpointImageId,
          candidateOperationIds: liveCase.candidateOperationIds,
          singleShotOperationId: liveCase.singleShotBaseline.sandboxOperationId,
        })),
      }),
    );
    return;
  }
  if (command === "promote") {
    const promoted = await promoteLatestEvidence();
    console.log(
      JSON.stringify({
        status: "promoted",
        runId: promoted.trial.runId,
        exactModelId: promoted.trial.exactModelId,
        expiresAt: promoted.trial.expiresAt,
      }),
    );
    return;
  }
  if (command === "submission-verify") {
    console.log(JSON.stringify({ status: "verified", ...(await verifySubmissionReadiness()) }));
    return;
  }
  throw new Error("Usage: cli.ts <smoke|trial|promote|submission-verify>");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown orchestration error.";
  console.error(`PortVerdict command failed: ${message}`);
  process.exitCode = 1;
});
