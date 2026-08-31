export const MODEL_ROLES = ["LIGHT", "STANDARD", "HEAVY"] as const;
export type ModelRole = (typeof MODEL_ROLES)[number];

export const NEMOTRON_FAMILIES = ["LIGHTNING", "SUPER", "ULTRA"] as const;
export type NemotronFamily = (typeof NEMOTRON_FAMILIES)[number];
export type CatalogModelFamily = NemotronFamily | "OTHER";

export interface CatalogValidationContext {
  readonly authenticated: boolean;
  readonly httpStatus: number;
  readonly requestId: string;
  readonly endpoint: string;
  readonly fetchedAt: string;
}

export interface CatalogValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface CatalogModelPricing {
  readonly currency: "USD";
  readonly inputPerMillionTokens: number;
  readonly outputPerMillionTokens: number;
  readonly source: "authenticated-catalog";
}

export interface ModelIdProvenance {
  readonly source: "authenticated-catalog";
  readonly catalogRequestId: string;
  readonly catalogFetchedAt: string;
  readonly catalogEndpoint: string;
  readonly catalogFingerprint: string;
  readonly catalogRecordFingerprint: string;
  readonly catalogIndex: number;
}

export interface DiscoveredModel {
  /** Exact, unmodified ID returned by the authenticated provider catalog. */
  readonly exactId: string;
  readonly owner?: string;
  readonly family: CatalogModelFamily;
  readonly contextWindowTokens?: number;
  readonly capabilities: readonly string[];
  readonly pricing?: CatalogModelPricing;
  readonly provenance: ModelIdProvenance;
}

declare const validatedCatalogBrand: unique symbol;

export interface ValidatedModelCatalog {
  readonly [validatedCatalogBrand]: true;
  readonly models: readonly DiscoveredModel[];
  readonly requestId: string;
  readonly fetchedAt: string;
  readonly endpoint: string;
  readonly fingerprint: string;
}

export type CatalogValidationResult =
  | { readonly ok: true; readonly catalog: ValidatedModelCatalog }
  | { readonly ok: false; readonly issues: readonly CatalogValidationIssue[] };

export interface CapabilityTestEvidence {
  readonly modelId: string;
  readonly taskCategory: string;
  readonly passed: boolean;
  readonly evidenceIds: readonly string[];
  readonly recordedAt: string;
}

export interface RoutingBudget {
  readonly maxTotalTokens?: number;
  readonly maxEstimatedCostUsd?: number;
}

export interface RoutingRequest {
  readonly role: ModelRole;
  readonly taskCategory: string;
  readonly difficulty: "low" | "medium" | "high";
  readonly estimatedInputTokens: number;
  readonly maxOutputTokens: number;
  readonly minContextTokens?: number;
  readonly requiredCapabilities?: readonly string[];
  readonly budget?: RoutingBudget;
  readonly capabilityTests?: readonly CapabilityTestEvidence[];
  readonly preferredExactIds?: readonly string[];
}

export type RoutingAbstentionReason =
  | "catalog-not-validated"
  | "invalid-request"
  | "no-qualifying-model"
  | "capability-mismatch"
  | "context-limit"
  | "budget-exceeded"
  | "budget-unverifiable"
  | "fallback-not-certified";

export type RoutingDecision =
  | {
      readonly status: "routed";
      readonly role: ModelRole;
      readonly model: DiscoveredModel;
      readonly fallbackUsed: boolean;
      readonly requiredContextTokens: number;
      readonly estimatedCostUsd?: number;
      readonly selectionBasis: "caller-preference" | "largest-context" | "exact-id-lexicographic";
    }
  | {
      readonly status: "abstained";
      readonly role: ModelRole;
      readonly reason: RoutingAbstentionReason;
      readonly detail: string;
    };

export interface RouterTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface ReliableCost {
  readonly usd: number;
  readonly source: "provider-reported" | "authenticated-catalog-pricing";
  readonly providerRequestId?: string;
  readonly catalogRecordFingerprint?: string;
}

export interface RouterTelemetryInput {
  readonly requestId: string;
  readonly taskId: string;
  readonly taskCategory: string;
  readonly difficulty: RoutingRequest["difficulty"];
  readonly decision: RoutingDecision;
  readonly latencyMs: number;
  readonly outcome: "succeeded" | "failed" | "abstained" | "timed-out";
  readonly retries: number;
  readonly recordedAt: string;
  readonly usage?: RouterTokenUsage;
  readonly reliableCost?: ReliableCost;
}

export interface RouterTelemetry {
  readonly requestId: string;
  readonly taskId: string;
  readonly role: ModelRole;
  readonly taskCategory: string;
  readonly difficulty: RoutingRequest["difficulty"];
  readonly modelId: string | null;
  readonly family: CatalogModelFamily | null;
  readonly catalogRequestId: string | null;
  readonly catalogRecordFingerprint: string | null;
  readonly fallbackUsed: boolean;
  readonly latencyMs: number;
  readonly outcome: RouterTelemetryInput["outcome"];
  readonly retries: number;
  readonly recordedAt: string;
  readonly usage?: RouterTokenUsage;
  readonly cost?: ReliableCost;
}
