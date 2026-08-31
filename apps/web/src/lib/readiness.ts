export type ReadinessState = "ready" | "configured" | "unconfigured" | "degraded";

export type ReadinessService = Readonly<{
  id: "replay" | "token-factory" | "sandboxes" | "tavily";
  name: string;
  state: ReadinessState;
  detail: string;
}>;

export type ReadinessSnapshot = Readonly<{
  schemaVersion: 1;
  overall: "replay-ready" | "live-configured" | "live-unconfigured";
  services: readonly ReadinessService[];
}>;

function configured(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function getReadinessSnapshot(): ReadinessSnapshot {
  const tokenFactoryConfigured = configured(process.env.NEBIUS_API_KEY);
  const sandboxesConfigured =
    configured(process.env.CONTREE_TOKEN) && configured(process.env.CONTREE_PROJECT);
  const tavilyConfigured = configured(process.env.TAVILY_API_KEY);
  const allLiveConfigured = tokenFactoryConfigured && sandboxesConfigured && tavilyConfigured;

  return {
    schemaVersion: 1,
    overall: allLiveConfigured ? "live-configured" : "live-unconfigured",
    services: [
      {
        id: "replay",
        name: "Evidence replay",
        state: "ready",
        detail: "Synthetic development fixture is available without credentials.",
      },
      {
        id: "token-factory",
        name: "Token Factory inference",
        state: tokenFactoryConfigured ? "configured" : "unconfigured",
        detail: tokenFactoryConfigured
          ? "Credentials are present; authenticated catalog verification is still required."
          : "Awaiting a server-side NEBIUS_API_KEY and authenticated model catalog check.",
      },
      {
        id: "sandboxes",
        name: "Token Factory Sandboxes",
        state: sandboxesConfigured ? "configured" : "unconfigured",
        detail: sandboxesConfigured
          ? "Credentials and project are present; live branch smoke verification is still required."
          : "Awaiting separate Sandbox IAM token and Nebius project ID.",
      },
      {
        id: "tavily",
        name: "Tavily research",
        state: tavilyConfigured ? "configured" : "unconfigured",
        detail: tavilyConfigured
          ? "Credentials are present; the functional search and extract smoke test is still required."
          : "Awaiting a server-side TAVILY_API_KEY for official-source retrieval.",
      },
    ],
  };
}
