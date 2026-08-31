import {
  BEHAVIOR_CATEGORIES,
  HARD_GATE_ORDER,
  type BehaviorCheckResult,
  type BehaviorParityResult,
  type CandidateEvaluation,
  type CandidateEvaluationInput,
  type EvaluatorEvidence,
  type EvaluatorHardGateResult,
  type HardGateName,
  type RunEvaluationInput,
  type RunVerdict,
  type SelectionMetric,
  type TieBreaker,
  type ValidationIssue,
} from "./types";
import { validateEvidenceProvenance, validateMeasuredEvidenceReferences } from "./provenance";

const EXECUTION_EVIDENCE_CLASSIFICATIONS = new Set(["measured", "observed"]);

function evidenceIndex(
  evidence: readonly EvaluatorEvidence[],
): ReadonlyMap<string, EvaluatorEvidence> {
  const index = new Map<string, EvaluatorEvidence>();
  for (const record of evidence) {
    if (!index.has(record.id)) index.set(record.id, record);
  }
  return index;
}

function duplicateEvidenceIssues(
  evidence: readonly EvaluatorEvidence[],
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const record of evidence) {
    if (seen.has(record.id)) {
      issues.push({
        code: "duplicate-evidence-id",
        path: `evidence.${record.id}`,
        message: `Evidence ID ${record.id} is not unique.`,
      });
    }
    seen.add(record.id);
  }
  return issues;
}

function validateExecutionEvidence(
  evidenceIds: readonly string[],
  evidence: readonly EvaluatorEvidence[],
  candidateId: string,
  runId: string,
  expectedStatus: "passed" | "failed" | "inconclusive",
  path: string,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const index = evidenceIndex(evidence);

  if (evidenceIds.length === 0) {
    issues.push({
      code: "missing-gate-evidence",
      path,
      message: "A deterministic gate or behavior result must reference evidence.",
    });
    return issues;
  }

  const uniqueIds = new Set<string>();
  for (const evidenceId of evidenceIds) {
    if (uniqueIds.has(evidenceId)) {
      issues.push({
        code: "duplicate-evidence-reference",
        path,
        message: `Evidence ${evidenceId} is referenced more than once.`,
      });
      continue;
    }
    uniqueIds.add(evidenceId);

    const record = index.get(evidenceId);
    if (!record) {
      issues.push({
        code: "unknown-evidence-id",
        path,
        message: `Evidence ${evidenceId} does not exist.`,
      });
      continue;
    }

    if (record.candidateId !== null && record.candidateId !== candidateId) {
      issues.push({
        code: "cross-candidate-evidence",
        path,
        message: `Evidence ${evidenceId} belongs to candidate ${record.candidateId}.`,
      });
    }

    if (record.runId !== runId) {
      issues.push({
        code: "cross-run-evidence",
        path,
        message: `Evidence ${evidenceId} belongs to run ${record.runId}.`,
      });
    }

    issues.push(...validateEvidenceProvenance(record, `evidence.${evidenceId}`));
    if (!EXECUTION_EVIDENCE_CLASSIFICATIONS.has(record.classification)) {
      issues.push({
        code: "non-execution-gate-evidence",
        path: `evidence.${evidenceId}.classification`,
        message: `${record.classification} evidence cannot prove a deterministic execution result.`,
      });
    }
    if (record.observation.kind === "status" && record.observation.status !== expectedStatus) {
      issues.push({
        code: "evidence-status-mismatch",
        path: `evidence.${evidenceId}.observation.status`,
        message: `Evidence status ${record.observation.status} does not prove ${expectedStatus}.`,
      });
    }
  }

  return issues;
}

function validateGateSet(candidate: CandidateEvaluationInput): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [...duplicateEvidenceIssues(candidate.evidence)];
  const gatesByName = new Map<HardGateName, EvaluatorHardGateResult[]>();

  for (const gate of candidate.gates) {
    const existing = gatesByName.get(gate.gate) ?? [];
    existing.push(gate);
    gatesByName.set(gate.gate, existing);
  }

  for (const gateName of HARD_GATE_ORDER) {
    const matches = gatesByName.get(gateName) ?? [];
    if (matches.length === 0) {
      issues.push({
        code: "missing-hard-gate",
        path: `candidates.${candidate.candidateId}.gates.${gateName}`,
        message: `Required hard gate ${gateName} is missing.`,
      });
      continue;
    }
    if (matches.length > 1) {
      issues.push({
        code: "duplicate-hard-gate",
        path: `candidates.${candidate.candidateId}.gates.${gateName}`,
        message: `Required hard gate ${gateName} appears more than once.`,
      });
      continue;
    }

    const gate = matches[0];
    if (!gate) continue;
    issues.push(
      ...validateExecutionEvidence(
        gate.evidenceIds,
        candidate.evidence,
        candidate.candidateId,
        candidate.runId,
        gate.status,
        `candidates.${candidate.candidateId}.gates.${gateName}.evidenceIds`,
      ),
    );
  }

  return issues;
}

function parityForCategory(
  category: (typeof BEHAVIOR_CATEGORIES)[number],
  checks: readonly BehaviorCheckResult[],
  evidence: readonly EvaluatorEvidence[],
  candidateId: string,
  runId: string,
): BehaviorParityResult {
  const matching = checks.filter((check) => check.category === category);
  if (matching.length === 0) {
    return { category, status: "not-tested", evidenceIds: [], issues: [] };
  }

  const evidenceIds = [...new Set(matching.flatMap((check) => check.evidenceIds))];
  const issues = matching.flatMap((check, index) =>
    validateExecutionEvidence(
      check.evidenceIds,
      evidence,
      candidateId,
      runId,
      check.status,
      `candidates.${candidateId}.behaviorChecks.${category}.${index}.evidenceIds`,
    ),
  );

  if (issues.length > 0) {
    return { category, status: "inconclusive", evidenceIds, issues };
  }
  if (matching.some((check) => check.status === "failed")) {
    return { category, status: "failed", evidenceIds, issues: [] };
  }
  if (matching.some((check) => check.status === "inconclusive")) {
    return { category, status: "inconclusive", evidenceIds, issues: [] };
  }
  return { category, status: "passed", evidenceIds, issues: [] };
}

export function calculateBehaviorParity(
  checks: readonly BehaviorCheckResult[],
  evidence: readonly EvaluatorEvidence[],
  candidateId: string,
  runId: string,
): readonly BehaviorParityResult[] {
  return BEHAVIOR_CATEGORIES.map((category) =>
    parityForCategory(category, checks, evidence, candidateId, runId),
  );
}

function validateBehaviorChecks(candidate: CandidateEvaluationInput): readonly ValidationIssue[] {
  return (candidate.behaviorChecks ?? []).flatMap((check, index) => {
    if ((BEHAVIOR_CATEGORIES as readonly string[]).includes(check.category)) return [];
    return [
      {
        code: "unknown-behavior-category",
        path: `candidates.${candidate.candidateId}.behaviorChecks.${index}.category`,
        message: `Unknown behavior category: ${String(check.category)}.`,
      },
    ];
  });
}

export function evaluateCandidate(candidate: CandidateEvaluationInput): CandidateEvaluation {
  const parity = calculateBehaviorParity(
    candidate.behaviorChecks ?? [],
    candidate.evidence,
    candidate.candidateId,
    candidate.runId,
  );
  const issues = [
    ...validateGateSet(candidate),
    ...validateBehaviorChecks(candidate),
    ...parity.flatMap((result) => result.issues),
  ];

  if (issues.length > 0) {
    return {
      candidateId: candidate.candidateId,
      disposition: "inconclusive",
      primaryGate: "evidence-completeness",
      reason: "invalid-or-incomplete-evidence",
      parity,
      issues,
    };
  }

  const gateByName = new Map(candidate.gates.map((gate) => [gate.gate, gate]));
  for (const gateName of HARD_GATE_ORDER) {
    const gate = gateByName.get(gateName);
    if (!gate || gate.status === "passed") continue;

    return {
      candidateId: candidate.candidateId,
      disposition: gate.status === "failed" ? "rejected" : "inconclusive",
      primaryGate: gateName,
      reason: gate.status === "failed" ? "hard-gate-failed" : "hard-gate-inconclusive",
      parity,
      issues: [],
    };
  }

  if (parity.some((result) => result.status === "failed")) {
    return {
      candidateId: candidate.candidateId,
      disposition: "rejected",
      reason: "behavior-parity-failed",
      parity,
      issues: [],
    };
  }

  if (parity.some((result) => result.status === "inconclusive")) {
    return {
      candidateId: candidate.candidateId,
      disposition: "inconclusive",
      reason: "behavior-parity-inconclusive",
      parity,
      issues: [],
    };
  }

  return {
    candidateId: candidate.candidateId,
    disposition: "eligible",
    reason: "all-hard-gates-passed",
    parity,
    issues: [],
  };
}

function metricFor(
  candidate: CandidateEvaluationInput,
  tieBreaker: TieBreaker,
): { metric?: SelectionMetric; issues: readonly ValidationIssue[] } {
  const matches = (candidate.selectionMetrics ?? []).filter(
    (metric) => metric.key === tieBreaker.key,
  );
  const path = `candidates.${candidate.candidateId}.selectionMetrics.${tieBreaker.key}`;
  const issues: ValidationIssue[] = [];

  if (matches.length !== 1) {
    issues.push({
      code: matches.length === 0 ? "missing-selection-metric" : "duplicate-selection-metric",
      path,
      message: `Tie-break metric ${tieBreaker.key} must appear exactly once.`,
    });
    return { issues };
  }

  const metric = matches[0];
  if (!metric) return { issues };
  if (!Number.isFinite(metric.value)) {
    issues.push({
      code: "invalid-selection-metric",
      path: `${path}.value`,
      message: "Selection metric values must be finite numbers.",
    });
  }
  issues.push(
    ...validateMeasuredEvidenceReferences(
      metric.evidenceIds,
      candidate.evidence,
      `${path}.evidenceIds`,
      candidate.candidateId,
      [metric.value],
      candidate.runId,
    ),
  );
  return { metric, issues };
}

function recommendationMatches(candidateId: string, input: RunEvaluationInput): boolean | null {
  const recommendation = input.modelRationale?.recommendedCandidateId;
  return recommendation === undefined ? null : recommendation === candidateId;
}

export function evaluateRun(input: RunEvaluationInput): RunVerdict {
  const candidateEvaluations = input.candidates.map(evaluateCandidate);
  if (input.candidates.length === 0) {
    return {
      status: "abstained",
      reason: "no-candidates",
      candidates: candidateEvaluations,
      modelRationaleDeterminative: false,
      modelRecommendationMatched: null,
    };
  }

  const candidateIds = input.candidates.map((candidate) => candidate.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    return {
      status: "abstained",
      reason: "invalid-candidate-set",
      candidates: candidateEvaluations,
      modelRationaleDeterminative: false,
      modelRecommendationMatched: null,
    };
  }

  const inputById = new Map(
    input.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  let eligible = candidateEvaluations.filter((candidate) => candidate.disposition === "eligible");

  if (eligible.length === 0) {
    return {
      status: "abstained",
      reason: "no-eligible-candidates",
      candidates: candidateEvaluations,
      modelRationaleDeterminative: false,
      modelRecommendationMatched: null,
    };
  }

  if (eligible.length === 1) {
    const selectedCandidateId = eligible[0]?.candidateId;
    if (!selectedCandidateId) throw new Error("Eligible candidate is missing an ID.");
    return {
      status: "selected",
      selectedCandidateId,
      candidates: candidateEvaluations,
      modelRationaleDeterminative: false,
      modelRecommendationMatched: recommendationMatches(selectedCandidateId, input),
    };
  }

  for (const tieBreaker of input.tieBreakers ?? []) {
    const measured = eligible.map((evaluation) => {
      const candidate = inputById.get(evaluation.candidateId);
      return candidate ? metricFor(candidate, tieBreaker) : { issues: [] };
    });
    if (measured.some((result) => result.issues.length > 0 || result.metric === undefined)) {
      return {
        status: "abstained",
        reason: "insufficient-comparison-evidence",
        candidates: candidateEvaluations,
        modelRationaleDeterminative: false,
        modelRecommendationMatched: false,
      };
    }

    const values = measured.map((result) => result.metric?.value ?? Number.NaN);
    const best = tieBreaker.direction === "higher" ? Math.max(...values) : Math.min(...values);
    eligible = eligible.filter((_, index) => values[index] === best);

    if (eligible.length === 1) {
      const selectedCandidateId = eligible[0]?.candidateId;
      if (!selectedCandidateId) throw new Error("Eligible candidate is missing an ID.");
      return {
        status: "selected",
        selectedCandidateId,
        candidates: candidateEvaluations,
        decisiveMetric: tieBreaker.key,
        modelRationaleDeterminative: false,
        modelRecommendationMatched: recommendationMatches(selectedCandidateId, input),
      };
    }
  }

  return {
    status: "abstained",
    reason: "eligible-candidates-tied",
    candidates: candidateEvaluations,
    modelRationaleDeterminative: false,
    modelRecommendationMatched: false,
  };
}
