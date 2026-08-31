import { createHash } from "node:crypto";

import type {
  CatalogModelFamily,
  CatalogModelPricing,
  CatalogValidationContext,
  CatalogValidationIssue,
  CatalogValidationResult,
  DiscoveredModel,
  ValidatedModelCatalog,
} from "./types";

const validatedCatalogs = new WeakSet<object>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function fingerprint(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function validTimestamp(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isOfficialCatalogEndpoint(endpoint: string): boolean {
  try {
    const parsed = new URL(endpoint);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "api.tokenfactory.nebius.com" &&
      parsed.pathname.replace(/\/+$/, "") === "/v1/models"
    );
  } catch {
    return false;
  }
}

function nvidiaOwned(id: string, owner: string | undefined): boolean {
  if (owner !== undefined) return /(^|[^a-z0-9])nvidia([^a-z0-9]|$)/i.test(owner);
  return /(^|[\/:._-])nvidia([\/:._-]|$)/i.test(id);
}

export function classifyCatalogModelFamily(exactId: string, owner?: string): CatalogModelFamily {
  if (!nvidiaOwned(exactId, owner)) return "OTHER";
  const normalized = exactId.toLowerCase();
  if (/nemotron[\s._/-]*3(?:[\s._/-]*5)?[\s._/-]*lightning/.test(normalized)) {
    return "LIGHTNING";
  }
  if (/nemotron[\s._/-]*3[\s._/-]*super/.test(normalized)) return "SUPER";
  if (/nemotron[\s._/-]*3[\s._/-]*ultra/.test(normalized)) return "ULTRA";
  return "OTHER";
}

function parsePricing(
  value: unknown,
  path: string,
  issues: CatalogValidationIssue[],
): CatalogModelPricing | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push({
      code: "invalid-pricing",
      path,
      message: "pricing must be an object when present.",
    });
    return undefined;
  }

  const currency = value.currency;
  const input = value.input_per_million_tokens;
  const output = value.output_per_million_tokens;
  if (
    currency !== "USD" ||
    typeof input !== "number" ||
    !Number.isFinite(input) ||
    input < 0 ||
    typeof output !== "number" ||
    !Number.isFinite(output) ||
    output < 0
  ) {
    issues.push({
      code: "invalid-pricing",
      path,
      message:
        "Catalog pricing requires USD and finite non-negative per-million input/output rates.",
    });
    return undefined;
  }
  return {
    currency: "USD",
    inputPerMillionTokens: input,
    outputPerMillionTokens: output,
    source: "authenticated-catalog",
  };
}

function parseModel(
  value: unknown,
  index: number,
  context: CatalogValidationContext,
  catalogFingerprint: string,
  issues: CatalogValidationIssue[],
): DiscoveredModel | undefined {
  const path = `data.${index}`;
  if (!isRecord(value)) {
    issues.push({ code: "invalid-model", path, message: "Catalog model must be an object." });
    return undefined;
  }

  const id = value.id;
  if (typeof id !== "string" || id.length === 0 || id.length > 512 || id.trim() !== id) {
    issues.push({
      code: "invalid-model-id",
      path: `${path}.id`,
      message: "Model ID must be a non-empty, unpadded string of at most 512 characters.",
    });
    return undefined;
  }

  const ownerValue = value.owned_by;
  const owner = typeof ownerValue === "string" && ownerValue.trim() ? ownerValue : undefined;
  if (ownerValue !== undefined && owner === undefined) {
    issues.push({
      code: "invalid-model-owner",
      path: `${path}.owned_by`,
      message: "owned_by must be a non-empty string when present.",
    });
  }

  const contextValue = value.context_length;
  const contextWindowTokens =
    typeof contextValue === "number" && Number.isSafeInteger(contextValue) && contextValue > 0
      ? contextValue
      : undefined;
  if (contextValue !== undefined && contextWindowTokens === undefined) {
    issues.push({
      code: "invalid-context-length",
      path: `${path}.context_length`,
      message: "context_length must be a positive safe integer when present.",
    });
  }

  const capabilitiesValue = value.capabilities;
  let capabilities: string[] = [];
  if (capabilitiesValue !== undefined) {
    if (
      !Array.isArray(capabilitiesValue) ||
      capabilitiesValue.some((capability) => typeof capability !== "string" || !capability.trim())
    ) {
      issues.push({
        code: "invalid-capabilities",
        path: `${path}.capabilities`,
        message: "capabilities must be an array of non-empty strings when present.",
      });
    } else {
      capabilities = [...new Set(capabilitiesValue as string[])];
    }
  }

  const pricing = parsePricing(value.pricing, `${path}.pricing`, issues);
  const recordFingerprint = fingerprint(value);
  return {
    exactId: id,
    ...(owner === undefined ? {} : { owner }),
    family: classifyCatalogModelFamily(id, owner),
    ...(contextWindowTokens === undefined ? {} : { contextWindowTokens }),
    capabilities,
    ...(pricing === undefined ? {} : { pricing }),
    provenance: {
      source: "authenticated-catalog",
      catalogRequestId: context.requestId,
      catalogFetchedAt: context.fetchedAt,
      catalogEndpoint: context.endpoint,
      catalogFingerprint,
      catalogRecordFingerprint: recordFingerprint,
      catalogIndex: index,
    },
  };
}

export function validateAuthenticatedCatalog(
  payload: unknown,
  context: CatalogValidationContext,
): CatalogValidationResult {
  const issues: CatalogValidationIssue[] = [];
  if (!context.authenticated) {
    issues.push({
      code: "catalog-not-authenticated",
      path: "context.authenticated",
      message: "Only a positively authenticated catalog response can be routed.",
    });
  }
  if (context.httpStatus !== 200) {
    issues.push({
      code: "catalog-http-status",
      path: "context.httpStatus",
      message: "Authenticated model catalog must return HTTP 200.",
    });
  }
  if (!context.requestId.trim()) {
    issues.push({
      code: "missing-catalog-request-id",
      path: "context.requestId",
      message: "Catalog request ID is required for exact-ID provenance.",
    });
  }
  if (!validTimestamp(context.fetchedAt)) {
    issues.push({
      code: "invalid-catalog-timestamp",
      path: "context.fetchedAt",
      message: "Catalog fetchedAt must be an ISO timestamp.",
    });
  }
  if (!isOfficialCatalogEndpoint(context.endpoint)) {
    issues.push({
      code: "invalid-catalog-endpoint",
      path: "context.endpoint",
      message: "Catalog endpoint must be the official Token Factory HTTPS /v1/models URL.",
    });
  }

  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    issues.push({
      code: "invalid-catalog-shape",
      path: "data",
      message: "Catalog payload must be an object with a data array.",
    });
    return { ok: false, issues };
  }

  const catalogFingerprint = fingerprint(payload);
  const models = payload.data.flatMap((value, index) => {
    const model = parseModel(value, index, context, catalogFingerprint, issues);
    return model ? [model] : [];
  });

  const seen = new Set<string>();
  for (const model of models) {
    if (seen.has(model.exactId)) {
      issues.push({
        code: "duplicate-model-id",
        path: `data.${model.provenance.catalogIndex}.id`,
        message: `Catalog model ID ${model.exactId} is duplicated.`,
      });
    }
    seen.add(model.exactId);
  }

  if (issues.length > 0) return { ok: false, issues };

  const catalog = Object.freeze({
    models: Object.freeze(
      models.map((model) =>
        Object.freeze({
          ...model,
          capabilities: Object.freeze([...model.capabilities]),
          ...(model.pricing === undefined ? {} : { pricing: Object.freeze({ ...model.pricing }) }),
          provenance: Object.freeze({ ...model.provenance }),
        }),
      ),
    ),
    requestId: context.requestId,
    fetchedAt: context.fetchedAt,
    endpoint: context.endpoint,
    fingerprint: catalogFingerprint,
  }) as unknown as ValidatedModelCatalog;
  validatedCatalogs.add(catalog);
  return { ok: true, catalog };
}

export function isValidatedModelCatalog(value: unknown): value is ValidatedModelCatalog {
  return typeof value === "object" && value !== null && validatedCatalogs.has(value);
}
