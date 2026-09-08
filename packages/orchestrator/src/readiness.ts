import { readFile } from "node:fs/promises";
import path from "node:path";

import type { TrialSummary } from "./contracts.js";
import { TrialSummarySchema, type ReadinessState } from "./contracts.js";
import { validatePromotableTrial } from "./invariants.js";
import { readVerifiedPublicReplay } from "./public-evidence.js";
import { WEB_PUBLIC_EVIDENCE_ROOT } from "./security.js";

export type LiveReadiness = Readonly<{
  state: ReadinessState;
  detail: string;
  checkedAt: string;
  runId: string | null;
  exactModelId: string | null;
  recordedAt: string | null;
  expiresAt: string | null;
}>;

function configured(environment: Readonly<Record<string, string | undefined>>): boolean {
  const nebius = Boolean(environment.NEBIUS_API_KEY?.trim());
  const sandboxToken = Boolean(environment.CONTREE_TOKEN?.trim()) || nebius;
  const sandboxProject = Boolean(
    environment.CONTREE_PROJECT?.trim() || environment.NEBIUS_AI_PROJECT?.trim(),
  );
  const tavily = Boolean(environment.TAVILY_API_KEY?.trim());
  return nebius && sandboxToken && sandboxProject && tavily;
}

export async function readPromotedTrialSummary(
  evidencePath = path.join(WEB_PUBLIC_EVIDENCE_ROOT, "trial-summary.json"),
): Promise<TrialSummary | null> {
  try {
    const summary = TrialSummarySchema.parse(
      JSON.parse(await readFile(evidencePath, "utf8")) as unknown,
    );
    // Validate all invariants and the integrity hash while evaluating freshness
    // separately. A stale recording remains an inspectable public replay.
    validatePromotableTrial(summary, Date.parse(summary.recordedAt));
    return summary;
  } catch {
    return null;
  }
}

export async function getLiveReadiness(
  options: {
    environment?: Readonly<Record<string, string | undefined>>;
    evidencePath?: string;
    now?: number;
    replayVerifier?: (evidenceRoot: string, runId: string) => Promise<boolean>;
  } = {},
): Promise<LiveReadiness> {
  const environment = options.environment ?? process.env;
  const checkedAt = new Date(options.now ?? Date.now()).toISOString();
  if (environment.PORTVERDICT_VERIFICATION_IN_PROGRESS === "1") {
    return {
      state: "verifying",
      detail: "Authenticated sponsor verification is currently running in the owner-only runner.",
      checkedAt,
      runId: null,
      exactModelId: null,
      recordedAt: null,
      expiresAt: null,
    };
  }
  const evidencePath =
    options.evidencePath ?? path.join(WEB_PUBLIC_EVIDENCE_ROOT, "trial-summary.json");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(evidencePath, "utf8")) as unknown;
  } catch (error) {
    const absent = error instanceof Error && "code" in error && error.code === "ENOENT";
    return {
      state: absent
        ? configured(environment)
          ? "configured-unverified"
          : "unconfigured"
        : "degraded",
      detail: absent
        ? configured(environment)
          ? "Server credentials are present, but no authenticated evidence bundle has been promoted."
          : "Live sponsor credentials and a promoted evidence bundle are not present."
        : "The promoted evidence file could not be read.",
      checkedAt,
      runId: null,
      exactModelId: null,
      recordedAt: null,
      expiresAt: null,
    };
  }
  const parsed = TrialSummarySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      state: "degraded",
      detail: "The promoted live evidence does not match the current schema.",
      checkedAt,
      runId: null,
      exactModelId: null,
      recordedAt: null,
      expiresAt: null,
    };
  }
  const summary: TrialSummary = parsed.data;
  try {
    validatePromotableTrial(summary, Date.parse(summary.recordedAt));
  } catch (error) {
    return {
      state: "degraded",
      detail: `The promoted evidence failed integrity or invariant verification: ${error instanceof Error ? error.message : "unknown error"}`,
      checkedAt,
      runId: summary.runId,
      exactModelId: summary.exactModelId,
      recordedAt: summary.recordedAt,
      expiresAt: summary.expiresAt,
    };
  }
  const evidenceRoot = path.dirname(evidencePath);
  const replayVerified = options.replayVerifier
    ? await options.replayVerifier(evidenceRoot, summary.runId)
    : (await readVerifiedPublicReplay({ evidenceRoot, runId: summary.runId })) !== null;
  if (!replayVerified) {
    return {
      state: "degraded",
      detail: "The promoted replay failed manifest, file-digest, or semantic event verification.",
      checkedAt,
      runId: summary.runId,
      exactModelId: summary.exactModelId,
      recordedAt: summary.recordedAt,
      expiresAt: summary.expiresAt,
    };
  }
  if (Date.parse(summary.expiresAt) <= (options.now ?? Date.now())) {
    return {
      state: "stale",
      detail: "The last authenticated live evidence exceeded its seven-day verification TTL.",
      checkedAt,
      runId: summary.runId,
      exactModelId: summary.exactModelId,
      recordedAt: summary.recordedAt,
      expiresAt: summary.expiresAt,
    };
  }
  return {
    state: "verified",
    detail:
      "Authenticated Token Factory inference, one shared Sandbox checkpoint with three branches, Tavily Search + Extract, and the replay manifest all verified.",
    checkedAt,
    runId: summary.runId,
    exactModelId: summary.exactModelId,
    recordedAt: summary.recordedAt,
    expiresAt: summary.expiresAt,
  };
}
