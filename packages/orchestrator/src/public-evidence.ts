import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  FileEvidenceStore,
  canonicalJson,
  type ReplayManifest,
  type Run,
  type RunEvent,
} from "@portverdict/evidence-store";
import { createInitialRunMachineState, reduceRunEvent } from "@portverdict/agent-core";

import { TrialSummarySchema, type TrialSummary } from "./contracts.js";
import { validatePromotableTrial } from "./invariants.js";

export type VerifiedPublicReplay = Readonly<{
  summary: TrialSummary;
  snapshot: Run;
  events: readonly RunEvent[];
  manifest: ReplayManifest;
}>;

export async function readVerifiedPublicReplay(options: {
  evidenceRoot: string;
  runId: string;
  summaryRelativePath?: string;
}): Promise<VerifiedPublicReplay | null> {
  try {
    const evidenceRoot = path.resolve(options.evidenceRoot);
    const summaryPath = path.resolve(
      evidenceRoot,
      options.summaryRelativePath ?? "trial-summary.json",
    );
    if (!summaryPath.startsWith(`${evidenceRoot}${path.sep}`)) return null;
    const summary = TrialSummarySchema.parse(
      JSON.parse(await readFile(summaryPath, "utf8")) as unknown,
    );
    validatePromotableTrial(summary, Date.parse(summary.recordedAt));
    // Never use a path parameter to address the filesystem until it exactly
    // matches the already validated identifier in the promoted summary.
    if (!summary || summary.runId !== options.runId) return null;
    const store = new FileEvidenceStore({
      rootDir: path.join(evidenceRoot, "replay"),
      fsync: false,
    });
    const verification = await store.verifyReplayManifest(summary.runId);
    if (verification.manifest.integritySha256 !== summary.lifecycle.replayManifestSha256) {
      return null;
    }
    const [snapshot, events] = await Promise.all([
      store.readSnapshot(summary.runId),
      store.readEvents(summary.runId, { recoverTruncatedTail: false }),
    ]);
    if (
      !snapshot ||
      events.length !== summary.lifecycle.eventCount ||
      snapshot.state !== summary.lifecycle.reducerFinalState ||
      snapshot.source?.kind !== "fixture" ||
      snapshot.source.revision !== summary.fixtureRevision ||
      snapshot.source.contentSha256 !== summary.fixtureSha256 ||
      snapshot.baseCheckpoint?.id !== summary.checkpoint.imageId
    ) {
      return null;
    }
    let state = createInitialRunMachineState();
    for (const event of events) {
      const transition = reduceRunEvent(state, event);
      if (transition.kind !== "applied") return null;
      state = transition.state;
    }
    if (!state.run || canonicalJson(state.run) !== canonicalJson(snapshot)) return null;
    return {
      summary,
      snapshot,
      events,
      manifest: verification.manifest,
    };
  } catch {
    return null;
  }
}
