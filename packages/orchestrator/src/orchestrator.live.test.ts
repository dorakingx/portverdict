import { describe, expect, it } from "vitest";

import { runSponsorSmoke } from "./smoke.js";
import { runLiveEvaluationSuite } from "./trial.js";

describe.skipIf(process.env.PORTVERDICT_LIVE_TEST !== "1")("opt-in live sponsor contracts", () => {
  it(
    "runs authenticated smoke and the three-case live evaluation suite",
    async () => {
      const smoke = await runSponsorSmoke();
      expect(smoke.status).toBe("verified");
      const suite = await runLiveEvaluationSuite();
      expect(suite.cases).toHaveLength(3);
      expect(new Set(suite.cases.map((liveCase) => liveCase.behaviorFamily)).size).toBe(3);
      for (const liveCase of suite.cases) {
        expect(new Set(liveCase.candidateOperationIds).size).toBe(3);
        expect(liveCase.singleShotBaseline.checkpointImageId).toBe(liveCase.checkpointImageId);
      }
    },
    30 * 60 * 1_000,
  );
});
