import { describe, expect, it } from "vitest";

import {
  HARD_GATE_ORDER,
  calculateBehaviorParity,
  evaluateCandidate,
  evaluateRun,
  guardReportClaims,
  type CandidateEvaluationInput,
  type EvaluatorEvidence,
  type EvaluatorHardGateResult,
} from "./index";

const HASH = "a".repeat(64);

function makeEvidence(
  id: string,
  candidateId: string,
  overrides: Partial<EvaluatorEvidence> = {},
): EvaluatorEvidence {
  return {
    id,
    runId: "run_1",
    candidateId,
    claim: `Deterministic observation for ${id}`,
    classification: "observed",
    procedure: "Run the bounded test command and capture its exit state.",
    observation: { kind: "status", status: "passed", detail: "Bounded check completed." },
    provenance: {
      sourceRevision: "0123456789abcdef",
      sandboxOperationId: "operation_1",
      sandboxImageId: "image_1",
      integrationRequestId: null,
      artifactId: `artifact_${id}`,
      contentSha256: HASH,
      recordedAt: "2026-08-31T00:00:00.000Z",
    },
    sources: [],
    redactionVersion: "1",
    ...overrides,
  };
}

function makeCandidate(
  candidateId: string,
  statuses: Partial<
    Record<(typeof HARD_GATE_ORDER)[number], EvaluatorHardGateResult["status"]>
  > = {},
): CandidateEvaluationInput {
  const evidence = HARD_GATE_ORDER.map((gate) => {
    const status = statuses[gate] ?? "passed";
    return makeEvidence(`ev_${candidateId}_${gate}`, candidateId, {
      observation: { kind: "status", status, detail: `${gate} was ${status}.` },
    });
  });
  const gates = HARD_GATE_ORDER.map((gate) => ({
    gate,
    status: statuses[gate] ?? "passed",
    evidenceIds: [`ev_${candidateId}_${gate}`],
  }));
  return { candidateId, runId: "run_1", gates, evidence };
}

describe("evidence and numeric provenance guard", () => {
  it("rejects unsupported numbers and accepts a measured value with complete provenance", () => {
    const observed = makeEvidence("ev_observed", "candidate_a");
    const measured = makeEvidence("ev_measured", "candidate_a", {
      classification: "measured",
      observation: {
        kind: "metric",
        metric: "latency_ms",
        value: 120,
        unit: "ms",
        sampleSize: 1,
      },
    });
    const result = guardReportClaims(
      [
        { id: "plain", text: "The schema gate passed.", evidenceIds: [] },
        { id: "bad", text: "Latency was 120ms.", evidenceIds: [observed.id] },
        { id: "good", text: "Latency was 120ms.", kind: "metric", evidenceIds: [measured.id] },
        {
          id: "missing-value",
          text: "Latency improved.",
          kind: "metric",
          evidenceIds: [measured.id],
        },
        { id: "mismatch", text: "Latency was 999ms.", evidenceIds: [measured.id] },
      ],
      [observed, measured],
    );

    expect(result.accepted.map((claim) => claim.id)).toEqual(["plain", "good"]);
    expect(result.rejected.map(({ claim }) => claim.id)).toEqual([
      "bad",
      "missing-value",
      "mismatch",
    ]);
    expect(result.rejected[0]?.issues.map((issue) => issue.code)).toContain(
      "unsupported-numeric-claim",
    );
    expect(result.rejected[1]?.issues.map((issue) => issue.code)).toContain("metric-without-value");
    expect(result.rejected[2]?.issues.map((issue) => issue.code)).toContain(
      "measurement-value-mismatch",
    );
  });

  it("treats missing hashes, timestamps, and unknown evidence references as inconclusive", () => {
    const candidate = makeCandidate("candidate_a");
    const firstEvidence = candidate.evidence[0];
    if (!firstEvidence) throw new Error("fixture invariant");
    const invalid = {
      ...firstEvidence,
      runId: "run_other",
      provenance: {
        ...firstEvidence.provenance,
        contentSha256: "not-a-hash",
        recordedAt: "yesterday",
      },
    };
    const gates = candidate.gates.map((gate, index) =>
      index === 1 ? { ...gate, evidenceIds: ["ev_missing"] } : gate,
    );
    const result = evaluateCandidate({
      ...candidate,
      gates,
      evidence: [invalid, ...candidate.evidence.slice(1)],
    });

    expect(result.disposition).toBe("inconclusive");
    expect(result.primaryGate).toBe("evidence-completeness");
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "cross-run-evidence",
        "invalid-content-sha256",
        "invalid-recorded-at",
        "unknown-evidence-id",
      ]),
    );
  });

  it("does not allow model rationale evidence to prove a hard gate", () => {
    const candidate = makeCandidate("candidate_a", { schema: "failed" });
    const schemaId = `ev_${candidate.candidateId}_schema`;
    const evidence = candidate.evidence.map((record) =>
      record.id === schemaId ? { ...record, classification: "model-rationale" as const } : record,
    );
    const result = evaluateCandidate({ ...candidate, evidence });

    expect(result.disposition).toBe("inconclusive");
    expect(result.reason).toBe("invalid-or-incomplete-evidence");
    expect(result.issues.map((issue) => issue.code)).toContain("non-execution-gate-evidence");
  });

  it("refuses evidence whose observed status contradicts its gate", () => {
    const candidate = makeCandidate("candidate_a", { schema: "failed" });
    const schemaId = `ev_${candidate.candidateId}_schema`;
    const evidence = candidate.evidence.map((record) =>
      record.id === schemaId
        ? {
            ...record,
            observation: {
              kind: "status" as const,
              status: "passed" as const,
              detail: "This contradicts the failed gate.",
            },
          }
        : record,
    );
    const result = evaluateCandidate({ ...candidate, evidence });

    expect(result).toMatchObject({
      disposition: "inconclusive",
      reason: "invalid-or-incomplete-evidence",
    });
    expect(result.issues.map((issue) => issue.code)).toContain("evidence-status-mismatch");
  });
});

describe("hard-gate precedence and behavior parity", () => {
  it("uses the first hard gate in the fixed precedence order", () => {
    const rejected = evaluateCandidate(
      makeCandidate("candidate_a", { "migration-tests": "failed", schema: "failed" }),
    );
    const inconclusive = evaluateCandidate(
      makeCandidate("candidate_b", { build: "inconclusive", schema: "failed" }),
    );

    expect(rejected).toMatchObject({
      disposition: "rejected",
      primaryGate: "migration-tests",
      reason: "hard-gate-failed",
    });
    expect(inconclusive).toMatchObject({
      disposition: "inconclusive",
      primaryGate: "build",
      reason: "hard-gate-inconclusive",
    });
  });

  it("aggregates parity by category with failure before inconclusive", () => {
    const evidence = [
      makeEvidence("ev_1", "candidate_a", {
        observation: {
          kind: "status",
          status: "inconclusive",
          detail: "Infrastructure result was unavailable.",
        },
      }),
      makeEvidence("ev_2", "candidate_a", {
        observation: {
          kind: "status",
          status: "failed",
          detail: "Tool-call parity failed.",
        },
      }),
    ];
    const parity = calculateBehaviorParity(
      [
        { category: "tool-calls", status: "inconclusive", evidenceIds: ["ev_1"] },
        { category: "tool-calls", status: "failed", evidenceIds: ["ev_2"] },
      ],
      evidence,
      "candidate_a",
      "run_1",
    );

    expect(parity.find((result) => result.category === "tool-calls")?.status).toBe("failed");
    expect(parity.find((result) => result.category === "streaming")?.status).toBe("not-tested");
  });

  it("downgrades an unproven parity result to inconclusive", () => {
    const candidate = makeCandidate("candidate_a");
    const result = evaluateCandidate({
      ...candidate,
      behaviorChecks: [{ category: "streaming", status: "passed", evidenceIds: [] }],
    });

    expect(result.disposition).toBe("inconclusive");
    expect(result.reason).toBe("invalid-or-incomplete-evidence");
  });

  it("rejects an unknown behavior category at the evaluator boundary", () => {
    const candidate = makeCandidate("candidate_a");
    const result = evaluateCandidate({
      ...candidate,
      behaviorChecks: [
        {
          category: "invented-category",
          status: "passed",
          evidenceIds: [candidate.evidence[0]?.id ?? "missing"],
        },
      ],
    } as unknown as CandidateEvaluationInput);

    expect(result).toMatchObject({
      disposition: "inconclusive",
      reason: "invalid-or-incomplete-evidence",
    });
    expect(result.issues.map((issue) => issue.code)).toContain("unknown-behavior-category");
  });
});

describe("deterministic run verdict", () => {
  it("selects the sole eligible candidate even when model rationale recommends a rejected branch", () => {
    const verdict = evaluateRun({
      candidates: [
        makeCandidate("candidate_rejected", { schema: "failed" }),
        makeCandidate("candidate_selected"),
      ],
      modelRationale: {
        text: "Prefer the smaller patch.",
        recommendedCandidateId: "candidate_rejected",
      },
    });

    expect(verdict).toMatchObject({
      status: "selected",
      selectedCandidateId: "candidate_selected",
      modelRationaleDeterminative: false,
      modelRecommendationMatched: false,
    });
  });

  it("abstains when every candidate is rejected or inconclusive", () => {
    const verdict = evaluateRun({
      candidates: [
        makeCandidate("candidate_rejected", { "tool-calls": "failed" }),
        makeCandidate("candidate_inconclusive", { "nebius-runtime": "inconclusive" }),
      ],
      modelRationale: {
        text: "Ship candidate_rejected anyway.",
        recommendedCandidateId: "candidate_rejected",
      },
    });

    expect(verdict).toMatchObject({
      status: "abstained",
      reason: "no-eligible-candidates",
      modelRationaleDeterminative: false,
    });
  });

  it("uses only measured tie-break metrics and abstains on missing support", () => {
    const first = makeCandidate("candidate_a");
    const second = makeCandidate("candidate_b");
    const firstMetric = makeEvidence("ev_a_latency", "candidate_a", {
      classification: "measured",
      observation: {
        kind: "metric",
        metric: "latency_ms",
        value: 91,
        unit: "ms",
        sampleSize: 1,
      },
    });
    const secondMetric = makeEvidence("ev_b_latency", "candidate_b", {
      classification: "measured",
      observation: {
        kind: "metric",
        metric: "latency_ms",
        value: 105,
        unit: "ms",
        sampleSize: 1,
      },
    });

    const selected = evaluateRun({
      candidates: [
        {
          ...first,
          evidence: [...first.evidence, firstMetric],
          selectionMetrics: [{ key: "latency-ms", value: 91, evidenceIds: [firstMetric.id] }],
        },
        {
          ...second,
          evidence: [...second.evidence, secondMetric],
          selectionMetrics: [{ key: "latency-ms", value: 105, evidenceIds: [secondMetric.id] }],
        },
      ],
      tieBreakers: [{ key: "latency-ms", direction: "lower" }],
    });
    expect(selected).toMatchObject({
      status: "selected",
      selectedCandidateId: "candidate_a",
      decisiveMetric: "latency-ms",
    });

    const unsupported = evaluateRun({
      candidates: [
        {
          ...first,
          selectionMetrics: [{ key: "latency-ms", value: 91, evidenceIds: [] }],
        },
        {
          ...second,
          evidence: [...second.evidence, secondMetric],
          selectionMetrics: [{ key: "latency-ms", value: 105, evidenceIds: [secondMetric.id] }],
        },
      ],
      tieBreakers: [{ key: "latency-ms", direction: "lower" }],
    });
    expect(unsupported).toMatchObject({
      status: "abstained",
      reason: "insufficient-comparison-evidence",
    });
  });

  it("abstains rather than breaking an evidence-equivalent tie arbitrarily", () => {
    const verdict = evaluateRun({
      candidates: [makeCandidate("candidate_a"), makeCandidate("candidate_b")],
    });
    expect(verdict).toMatchObject({ status: "abstained", reason: "eligible-candidates-tied" });
  });

  it("abstains on duplicate candidate identities", () => {
    const verdict = evaluateRun({
      candidates: [makeCandidate("candidate_a"), makeCandidate("candidate_a")],
    });
    expect(verdict).toMatchObject({ status: "abstained", reason: "invalid-candidate-set" });
  });
});
