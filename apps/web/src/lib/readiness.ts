import "server-only";

import { getEvidenceReadiness, type EvidenceReadinessState } from "./live-evidence";

export type ReadinessState = EvidenceReadinessState;

export type ReadinessService = Readonly<{
  id: "replay" | "token-factory" | "sandboxes" | "tavily";
  name: string;
  state: ReadinessState;
  detail: string;
}>;

export type ReadinessSnapshot = Readonly<{
  schemaVersion: 2;
  overall: ReadinessState;
  checkedAt: string;
  runId: string | null;
  exactModelId: string | null;
  recordedAt: string | null;
  expiresAt: string | null;
  services: readonly ReadinessService[];
}>;

const VERIFIED_SERVICE_DETAILS = {
  replay: "Integrity, branch identity, cleanup, TTL, and replay-manifest checks passed.",
  "token-factory": "Authenticated catalog discovery and inference request evidence were promoted.",
  sandboxes:
    "One immutable checkpoint and three distinct sibling Sandbox operations were verified.",
  tavily: "Authenticated Search and Extract request evidence with source hashes was promoted.",
} as const;

export async function getReadinessSnapshot(): Promise<ReadinessSnapshot> {
  const readiness = await getEvidenceReadiness();
  const services = [
    { id: "replay", name: "Evidence replay" },
    { id: "token-factory", name: "Token Factory inference" },
    { id: "sandboxes", name: "Token Factory Sandboxes" },
    { id: "tavily", name: "Tavily Search + Extract" },
  ] as const;

  return {
    schemaVersion: 2,
    overall: readiness.state,
    checkedAt: readiness.checkedAt,
    runId: readiness.trial?.runId ?? null,
    exactModelId: readiness.trial?.exactModelId ?? null,
    recordedAt: readiness.trial?.recordedAt ?? null,
    expiresAt: readiness.trial?.expiresAt ?? null,
    services: services.map((service) => ({
      ...service,
      state: readiness.state,
      detail:
        readiness.state === "verified"
          ? VERIFIED_SERVICE_DETAILS[service.id]
          : readiness.detail,
    })),
  };
}
