import {
  TokenFactoryClient,
  routeModel,
  type RoutingDecision,
  type ValidatedModelCatalog,
} from "@portverdict/model-router";
import { TokenFactorySandboxClient, type SandboxTelemetry } from "@portverdict/sandbox-runner";
import { TavilyResearchClient, type TavilyTelemetry } from "@portverdict/tavily-research";

export const OFFICIAL_RESEARCH_HOSTS = Object.freeze([
  "docs.tokenfactory.nebius.com",
  "docs.tavily.com",
  "build.nvidia.com",
  "developer.nvidia.com",
]);

export type LiveEnvironment = Readonly<Record<string, string | undefined>>;

export function requireLiveEnvironment(environment: LiveEnvironment): {
  nebiusApiKey: string;
  nebiusProject: string;
  sandboxToken: string;
  sandboxProject: string;
  tavilyApiKey: string;
} {
  const nebiusApiKey = environment.NEBIUS_API_KEY?.trim();
  const nebiusProject = environment.NEBIUS_AI_PROJECT?.trim();
  const sandboxToken = environment.CONTREE_TOKEN?.trim() || nebiusApiKey;
  const sandboxProject = environment.CONTREE_PROJECT?.trim() || nebiusProject;
  const tavilyApiKey = environment.TAVILY_API_KEY?.trim();
  const missing = [
    ["NEBIUS_API_KEY", nebiusApiKey],
    ["NEBIUS_AI_PROJECT or CONTREE_PROJECT", sandboxProject],
    ["CONTREE_TOKEN or NEBIUS_API_KEY", sandboxToken],
    ["TAVILY_API_KEY", tavilyApiKey],
  ]
    .filter((entry) => !entry[1])
    .map((entry) => entry[0]);
  if (missing.length > 0) {
    throw new Error(`Live credentials are incomplete: ${missing.join(", ")}.`);
  }
  return {
    nebiusApiKey: nebiusApiKey as string,
    nebiusProject: nebiusProject ?? (sandboxProject as string),
    sandboxToken: sandboxToken as string,
    sandboxProject: sandboxProject as string,
    tavilyApiKey: tavilyApiKey as string,
  };
}

export function createLiveClients(
  environment: LiveEnvironment,
  telemetry: {
    sandbox: SandboxTelemetry[];
    tavily: TavilyTelemetry[];
  },
): {
  tokenFactory: TokenFactoryClient;
  sandbox: TokenFactorySandboxClient;
  tavily: TavilyResearchClient;
} {
  const credentials = requireLiveEnvironment(environment);
  return {
    tokenFactory: new TokenFactoryClient({
      apiKey: credentials.nebiusApiKey,
      fetch,
      timeoutMs: 120_000,
      maxRetries: 2,
    }),
    sandbox: new TokenFactorySandboxClient({
      iamToken: credentials.sandboxToken,
      projectId: credentials.sandboxProject,
      requestTimeoutMs: 120_000,
      pollIntervalMs: 1_000,
      maxTransientRetries: 2,
      onTelemetry: (event) => telemetry.sandbox.push(event),
    }),
    tavily: new TavilyResearchClient({
      apiKey: credentials.tavilyApiKey,
      allowedHosts: OFFICIAL_RESEARCH_HOSTS,
      requestTimeoutMs: 60_000,
      maxRetries: 2,
      maxResults: 5,
      maxExtractUrls: 3,
      minimumScore: 0.1,
      onTelemetry: (event) => telemetry.tavily.push(event),
    }),
  };
}

export function selectNvidiaDecision(
  catalog: ValidatedModelCatalog,
): Extract<RoutingDecision, { status: "routed" }> {
  const candidates = catalog.models
    .filter((model) => model.family !== "OTHER" && /^nvidia\//iu.test(model.exactId))
    .sort((left, right) => {
      const leftStructured = left.capabilities.some((feature) =>
        /structured[-_ ]?output|json[-_ ]?schema/iu.test(feature),
      );
      const rightStructured = right.capabilities.some((feature) =>
        /structured[-_ ]?output|json[-_ ]?schema/iu.test(feature),
      );
      if (leftStructured !== rightStructured) return leftStructured ? -1 : 1;
      if (left.family === "LIGHTNING" && right.family !== "LIGHTNING") return -1;
      if (right.family === "LIGHTNING" && left.family !== "LIGHTNING") return 1;
      return left.exactId.localeCompare(right.exactId);
    });
  const selected = candidates[0];
  if (!selected) {
    throw new Error("The authenticated catalog contains no active NVIDIA Nemotron model.");
  }
  const role =
    selected.family === "LIGHTNING" ? "LIGHT" : selected.family === "SUPER" ? "STANDARD" : "HEAVY";
  const decision = routeModel(catalog, {
    role,
    taskCategory: "portverdict-migration",
    difficulty: "medium",
    estimatedInputTokens: 4_000,
    maxOutputTokens: 4_000,
    minContextTokens: 8_000,
    preferredExactIds: [selected.exactId],
  });
  if (decision.status !== "routed") {
    throw new Error(`Authenticated NVIDIA model could not be routed: ${decision.reason}.`);
  }
  return decision;
}
