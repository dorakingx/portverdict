import type {
  Evidence as SharedEvidence,
  EvidenceClassification as SharedEvidenceClassification,
  EvidenceProvenance as SharedEvidenceProvenance,
  HardGateName as SharedHardGateName,
  HardGateResult as SharedHardGateResult,
  HardGateStatus as SharedHardGateStatus,
  SourceCitation as SharedSourceCitation,
} from "@portverdict/shared-schemas";

export const HARD_GATE_ORDER = [
  "build",
  "original-tests",
  "migration-tests",
  "schema",
  "tool-calls",
  "prompt-regression",
  "secret-scan",
  "security",
  "nebius-runtime",
  "evidence-completeness",
] as const;

export type HardGateName = SharedHardGateName;
export type GateStatus = SharedHardGateStatus;

export const BEHAVIOR_CATEGORIES = [
  "chat",
  "streaming",
  "structured-output",
  "tool-calls",
  "retry-timeout",
  "prompt-semantics",
] as const;

export type BehaviorCategory = (typeof BEHAVIOR_CATEGORIES)[number];
export type EvidenceClassification = SharedEvidenceClassification;
export type SourceCitation = SharedSourceCitation;
export type EvidenceProvenance = SharedEvidenceProvenance;

/** The evaluator accepts only the schema-validated shared domain record shape. */
export type EvaluatorEvidence = SharedEvidence;
export type EvaluatorHardGateResult = SharedHardGateResult;

export interface BehaviorCheckResult {
  readonly category: BehaviorCategory;
  readonly status: GateStatus;
  readonly evidenceIds: readonly string[];
}

export interface SelectionMetric {
  readonly key: string;
  readonly value: number;
  readonly evidenceIds: readonly string[];
}

export interface CandidateEvaluationInput {
  readonly candidateId: string;
  readonly runId: string;
  readonly gates: readonly EvaluatorHardGateResult[];
  readonly behaviorChecks?: readonly BehaviorCheckResult[];
  readonly evidence: readonly EvaluatorEvidence[];
  readonly selectionMetrics?: readonly SelectionMetric[];
}

export interface ValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface BehaviorParityResult {
  readonly category: BehaviorCategory;
  readonly status: GateStatus | "not-tested";
  readonly evidenceIds: readonly string[];
  readonly issues: readonly ValidationIssue[];
}

export type CandidateDisposition = "eligible" | "rejected" | "inconclusive";

export interface CandidateEvaluation {
  readonly candidateId: string;
  readonly disposition: CandidateDisposition;
  readonly primaryGate?: HardGateName;
  readonly reason:
    | "all-hard-gates-passed"
    | "hard-gate-failed"
    | "hard-gate-inconclusive"
    | "behavior-parity-failed"
    | "behavior-parity-inconclusive"
    | "invalid-or-incomplete-evidence";
  readonly parity: readonly BehaviorParityResult[];
  readonly issues: readonly ValidationIssue[];
}

export interface TieBreaker {
  readonly key: string;
  readonly direction: "higher" | "lower";
}

export interface ModelRationaleAdvisory {
  readonly text: string;
  readonly recommendedCandidateId?: string;
  readonly evidenceIds?: readonly string[];
}

export interface RunEvaluationInput {
  readonly candidates: readonly CandidateEvaluationInput[];
  readonly tieBreakers?: readonly TieBreaker[];
  readonly modelRationale?: ModelRationaleAdvisory;
}

export type RunVerdict =
  | {
      readonly status: "selected";
      readonly selectedCandidateId: string;
      readonly candidates: readonly CandidateEvaluation[];
      readonly decisiveMetric?: string;
      readonly modelRationaleDeterminative: false;
      readonly modelRecommendationMatched: boolean | null;
    }
  | {
      readonly status: "abstained";
      readonly reason:
        | "no-candidates"
        | "invalid-candidate-set"
        | "no-eligible-candidates"
        | "insufficient-comparison-evidence"
        | "eligible-candidates-tied";
      readonly candidates: readonly CandidateEvaluation[];
      readonly modelRationaleDeterminative: false;
      readonly modelRecommendationMatched: false | null;
    };

export interface ReportClaim {
  readonly id: string;
  readonly text: string;
  readonly kind?: "descriptive" | "metric";
  readonly evidenceIds: readonly string[];
}

export interface ClaimRejection {
  readonly claim: ReportClaim;
  readonly issues: readonly ValidationIssue[];
}

export interface ClaimGuardResult {
  readonly accepted: readonly ReportClaim[];
  readonly rejected: readonly ClaimRejection[];
}
