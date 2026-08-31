import type { ClaimGuardResult, EvaluatorEvidence, ReportClaim, ValidationIssue } from "./types";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const NUMERIC_TOKEN_PATTERN =
  /(?<![\p{L}\p{N}_])([-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?)(?:%|ms|s|x)?(?![\p{L}\p{N}_])/giu;

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function isIsoTimestamp(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

export function validateEvidenceProvenance(
  evidence: EvaluatorEvidence,
  path = `evidence.${evidence.id || "<missing-id>"}`,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const requiredStrings: ReadonlyArray<readonly [string, string]> = [
    ["id", evidence.id],
    ["runId", evidence.runId],
    ["claim", evidence.claim],
    ["procedure", evidence.procedure],
    ["redactionVersion", evidence.redactionVersion],
    ["provenance.sourceRevision", evidence.provenance.sourceRevision],
    ["provenance.artifactId", evidence.provenance.artifactId],
  ];

  for (const [field, value] of requiredStrings) {
    if (!isNonEmpty(value)) {
      issues.push({
        code: "missing-provenance-field",
        path: `${path}.${field}`,
        message: `${field} must be a non-empty string.`,
      });
    }
  }

  if (!SHA256_PATTERN.test(evidence.provenance.contentSha256)) {
    issues.push({
      code: "invalid-content-sha256",
      path: `${path}.provenance.contentSha256`,
      message: "contentSha256 must be a 64-character hexadecimal SHA-256 digest.",
    });
  }

  if (!isIsoTimestamp(evidence.provenance.recordedAt)) {
    issues.push({
      code: "invalid-recorded-at",
      path: `${path}.provenance.recordedAt`,
      message: "recordedAt must be a parseable ISO timestamp.",
    });
  }

  return issues;
}

export function hasNumericToken(text: string): boolean {
  return extractNumericValues(text).length > 0;
}

export function extractNumericValues(text: string): readonly number[] {
  NUMERIC_TOKEN_PATTERN.lastIndex = 0;
  return [...text.matchAll(NUMERIC_TOKEN_PATTERN)].flatMap((match) => {
    const token = match[1];
    if (token === undefined) return [];
    const value = Number(token);
    return Number.isFinite(value) ? [value] : [];
  });
}

function indexEvidence(
  evidence: readonly EvaluatorEvidence[],
): ReadonlyMap<string, EvaluatorEvidence> {
  const index = new Map<string, EvaluatorEvidence>();
  for (const record of evidence) {
    if (!index.has(record.id)) index.set(record.id, record);
  }
  return index;
}

export function validateMeasuredEvidenceReferences(
  evidenceIds: readonly string[],
  evidence: readonly EvaluatorEvidence[],
  path: string,
  candidateId?: string,
  expectedValues: readonly number[] = [],
  runId?: string,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const evidenceIndex = indexEvidence(evidence);
  const measuredRecords: EvaluatorEvidence[] = [];

  if (evidenceIds.length === 0) {
    issues.push({
      code: "missing-measurement-evidence",
      path,
      message: "A numeric claim must reference measured evidence.",
    });
    return issues;
  }

  for (const evidenceId of evidenceIds) {
    const record = evidenceIndex.get(evidenceId);
    if (!record) {
      issues.push({
        code: "unknown-evidence-id",
        path,
        message: `Evidence ${evidenceId} does not exist.`,
      });
      continue;
    }

    if (
      candidateId !== undefined &&
      record.candidateId !== null &&
      record.candidateId !== candidateId
    ) {
      issues.push({
        code: "cross-candidate-evidence",
        path,
        message: `Evidence ${evidenceId} belongs to another candidate.`,
      });
      continue;
    }

    if (runId !== undefined && record.runId !== runId) {
      issues.push({
        code: "cross-run-evidence",
        path,
        message: `Evidence ${evidenceId} belongs to another run.`,
      });
      continue;
    }

    if (record.classification === "measured" && record.observation.kind === "metric") {
      measuredRecords.push(record);
    }
  }

  if (measuredRecords.length === 0) {
    issues.push({
      code: "unsupported-numeric-claim",
      path,
      message: "No referenced evidence is a measured metric observation.",
    });
    return issues;
  }

  const completeMeasurement = measuredRecords.some(
    (record) => validateEvidenceProvenance(record).length === 0,
  );
  if (!completeMeasurement) {
    issues.push({
      code: "incomplete-measurement-provenance",
      path,
      message: "Measured evidence is missing its procedure, artifact, timestamp, or hash.",
    });
  }

  const observedValues = measuredRecords.flatMap((record) => {
    if (record.observation.kind !== "metric") return [];
    return [
      record.observation.value,
      ...(record.observation.sampleSize === null ? [] : [record.observation.sampleSize]),
    ];
  });
  const unmatched = expectedValues.filter(
    (expected) => !observedValues.some((observed) => Object.is(observed, expected)),
  );
  if (unmatched.length > 0) {
    issues.push({
      code: "measurement-value-mismatch",
      path,
      message: `Reported values are absent from measured evidence: ${unmatched.join(", ")}.`,
    });
  }

  return issues;
}

export function guardReportClaims(
  claims: readonly ReportClaim[],
  evidence: readonly EvaluatorEvidence[],
): ClaimGuardResult {
  const accepted: ReportClaim[] = [];
  const rejected: ClaimGuardResult["rejected"][number][] = [];

  for (const claim of claims) {
    const numericValues = extractNumericValues(claim.text);
    const numeric = claim.kind === "metric" || numericValues.length > 0;
    if (!numeric) {
      accepted.push(claim);
      continue;
    }

    const issues: ValidationIssue[] = [];
    if (!hasNumericToken(claim.text)) {
      issues.push({
        code: "metric-without-value",
        path: `claims.${claim.id}.text`,
        message: "A metric claim must contain an explicit numeric value.",
      });
    }
    issues.push(
      ...validateMeasuredEvidenceReferences(
        claim.evidenceIds,
        evidence,
        `claims.${claim.id}.evidenceIds`,
        undefined,
        numericValues,
      ),
    );

    if (issues.length === 0) accepted.push(claim);
    else rejected.push({ claim, issues });
  }

  return { accepted, rejected };
}
