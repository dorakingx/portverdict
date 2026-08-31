export type FixtureGateStatus = "passed" | "failed" | "inconclusive";

export type FixtureCandidate = {
  id: string;
  name: string;
  verdict: "Selected" | "Rejected" | "Inconclusive";
  status: FixtureGateStatus;
  gates: Record<string, FixtureGateStatus>;
  rationale: string;
};

export type FixtureEvidence = {
  id: string;
  candidate: string;
  claim: string;
  classification: "observed" | "measured";
  procedure: string;
  observation: string;
  artifact: string;
  contentSha256: string;
};

export const FIXTURE_GATES = [
  { id: "build", label: "Build" },
  { id: "original-tests", label: "Original tests" },
  { id: "migration-tests", label: "Migration tests" },
  { id: "schema", label: "Schema" },
  { id: "tool-calls", label: "Tool calls" },
] as const;

export const FIXTURE_CANDIDATES: ReadonlyArray<FixtureCandidate> = [
  {
    id: "candidate-direct",
    name: "Direct SDK port",
    verdict: "Rejected",
    status: "failed",
    rationale: "Build passed, but the schema counterexample observed a behavioral regression.",
    gates: {
      build: "passed",
      "original-tests": "passed",
      "migration-tests": "failed",
      schema: "failed",
      "tool-calls": "failed",
    },
  },
  {
    id: "candidate-adapter",
    name: "Prompt + schema adapter",
    verdict: "Selected",
    status: "passed",
    rationale: "The only fixture candidate with complete passing evidence for every hard gate.",
    gates: {
      build: "passed",
      "original-tests": "passed",
      "migration-tests": "passed",
      schema: "passed",
      "tool-calls": "passed",
    },
  },
  {
    id: "candidate-shim",
    name: "Compatibility shim",
    verdict: "Inconclusive",
    status: "inconclusive",
    rationale:
      "Sandbox timeout prevented complete verification; no behavioral result was inferred.",
    gates: {
      build: "passed",
      "original-tests": "passed",
      "migration-tests": "inconclusive",
      schema: "inconclusive",
      "tool-calls": "inconclusive",
    },
  },
];

export const FIXTURE_EVIDENCE: Record<string, FixtureEvidence> = {
  "candidate-direct": {
    id: "ev_fixture_schema_01",
    candidate: "Direct SDK port",
    claim: "Tool-call argument shape is not preserved.",
    classification: "observed",
    procedure: "Replay the typed weather-tool fixture and compare normalized argument values.",
    observation: 'Expected {"city":"Tokyo"}; observed "{\\"city\\":\\"Tokyo\\"}".',
    artifact: "fixture://artifacts/direct-port/tool-schema-result.json",
    contentSha256: "6f8d5cfb7a4b86d2e20e2ae65a65d233e476b58a3e8d8b9847141817e496f92a",
  },
  "candidate-adapter": {
    id: "ev_fixture_gates_02",
    candidate: "Prompt + schema adapter",
    claim: "All fixture hard gates preserve the recorded behavior contract.",
    classification: "measured",
    procedure: "Run the eight deterministic migration fixtures and normalize tool/stream events.",
    observation: "8 of 8 synthetic fixture cases matched the expected normalized event sequence.",
    artifact: "fixture://artifacts/schema-adapter/gate-results.json",
    contentSha256: "0e1ee34fb427fa4ee949aba844e9b66f1eb5b23379788089acc5ec535c33b3bb",
  },
  "candidate-shim": {
    id: "ev_fixture_timeout_03",
    candidate: "Compatibility shim",
    claim: "Verification evidence is incomplete.",
    classification: "observed",
    procedure:
      "Observe the bounded fixture execution and record its terminal infrastructure state.",
    observation: "The fixture recorded a timeout before schema and tool-call gates completed.",
    artifact: "fixture://artifacts/compatibility-shim/operation.json",
    contentSha256: "d9ee84db5a493aa90281b46ef3e9d8f30783640285b6b3ed78e3e5caed88a758",
  },
};
