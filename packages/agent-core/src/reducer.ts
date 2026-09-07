import {
  RunEventSchema,
  RunSchema,
  SCHEMA_VERSION,
  sourceRevisionId,
  type Candidate,
  type CandidateState,
  type OrchestrationStage,
  type Run,
  type RunEvent,
  type RunState,
  type Verdict,
} from "@portverdict/shared-schemas";

import type {
  NoopReason,
  RejectedTransition,
  RejectionReason,
  RunCommand,
  RunMachineState,
  TransitionResult,
} from "./types";

const TERMINAL_RUN_STATES = new Set<RunState>(["SELECTED", "ABSTAINED", "CANCELED", "FAILED"]);

const TERMINAL_CANDIDATE_STATES = new Set<CandidateState>(["ELIGIBLE", "REJECTED", "INCONCLUSIVE"]);

const CANDIDATE_TRANSITIONS: Readonly<Record<CandidateState, readonly CandidateState[]>> = {
  QUEUED: ["PATCHING"],
  PATCHING: ["BUILDING", "REJECTED", "INCONCLUSIVE"],
  BUILDING: ["VERIFYING", "REJECTED", "INCONCLUSIVE"],
  VERIFYING: ["FALSIFYING", "REJECTED", "INCONCLUSIVE"],
  FALSIFYING: ["ELIGIBLE", "REJECTED", "INCONCLUSIVE"],
  ELIGIBLE: [],
  REJECTED: [],
  INCONCLUSIVE: [],
};

const STAGE_STATES: Readonly<Record<OrchestrationStage, readonly RunState[]>> = {
  "source-resolution": ["RECEIVED"],
  inventory: ["SOURCE_RESOLVED"],
  specification: ["INVENTORIED"],
  "base-checkpoint": ["SPECIFIED"],
  "candidate-execution": ["BASE_CHECKPOINT_READY", "CANDIDATES_RUNNING"],
  "candidate-evaluation": ["CANDIDATES_RUNNING"],
  falsification: ["CANDIDATES_EVALUATED"],
  scoring: ["FALSIFIED"],
  verdict: ["SCORED"],
};

export function createInitialRunMachineState(): RunMachineState {
  return {
    schemaVersion: SCHEMA_VERSION,
    run: null,
    lastEventId: 0,
    processedEventKeys: {},
    retryCounts: {},
  };
}

function reject(
  state: RunMachineState,
  reason: RejectionReason,
  message: string,
): RejectedTransition {
  return { kind: "rejected", reason, message, state, commands: [] };
}

function noop(state: RunMachineState, reason: NoopReason): TransitionResult {
  return { kind: "noop", reason, state, commands: [] };
}

function commandId(event: RunEvent, kind: RunCommand["kind"], suffix?: string): string {
  return `${event.runId}:${event.eventId}:${kind}${suffix === undefined ? "" : `:${suffix}`}`;
}

function commandMetadata(event: RunEvent, kind: RunCommand["kind"], suffix?: string) {
  return {
    commandId: commandId(event, kind, suffix),
    runId: event.runId,
    causedByEventId: event.eventId,
  };
}

function appendUnique(current: readonly string[], additions: readonly string[]): string[] {
  return [...new Set([...current, ...additions])];
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function verdictListsMatchCandidates(verdict: Verdict, candidates: readonly Candidate[]): boolean {
  return (
    sameSet(
      verdict.eligibleCandidateIds,
      candidates.filter((candidate) => candidate.state === "ELIGIBLE").map(({ id }) => id),
    ) &&
    sameSet(
      verdict.rejectedCandidateIds,
      candidates.filter((candidate) => candidate.state === "REJECTED").map(({ id }) => id),
    ) &&
    sameSet(
      verdict.inconclusiveCandidateIds,
      candidates.filter((candidate) => candidate.state === "INCONCLUSIVE").map(({ id }) => id),
    )
  );
}

function apply(
  state: RunMachineState,
  event: RunEvent,
  nextRunValue: unknown,
  commands: readonly RunCommand[],
  retryCounts: RunMachineState["retryCounts"] = state.retryCounts,
): TransitionResult {
  const parsedRun = RunSchema.safeParse(nextRunValue);
  if (!parsedRun.success) {
    return reject(
      state,
      "invariant-violation",
      `Transition violates run invariants: ${parsedRun.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  return {
    kind: "applied",
    event,
    commands,
    state: {
      schemaVersion: SCHEMA_VERSION,
      run: parsedRun.data,
      lastEventId: event.eventId,
      processedEventKeys: {
        ...state.processedEventKeys,
        [event.eventKey]: event.eventId,
      },
      retryCounts,
    },
  };
}

function transitionRun(run: Run, state: RunState, event: RunEvent, patch: Partial<Run> = {}): Run {
  return {
    ...run,
    ...patch,
    state,
    updatedAt: event.recordedAt,
  };
}

function retryDelayMs(run: Run, retryNumber: number): number {
  const exponential = run.config.retryPolicy.baseDelayMs * 2 ** Math.max(0, retryNumber - 1);
  return Math.min(exponential, run.config.retryPolicy.maxDelayMs);
}

function commandForCandidateState(
  event: RunEvent,
  run: Run,
  candidate: Candidate,
): RunCommand | null {
  if (run.baseCheckpoint === null) return null;

  const metadata = (kind: RunCommand["kind"]) => commandMetadata(event, kind, candidate.id);
  const common = {
    candidateId: candidate.id,
    strategy: candidate.strategy,
    checkpoint: run.baseCheckpoint,
    timeoutMs: run.config.timeouts.sandboxOperationMs,
  };

  switch (candidate.state) {
    case "PATCHING":
      return { ...metadata("patch-candidate"), kind: "patch-candidate", ...common };
    case "BUILDING":
      return { ...metadata("build-candidate"), kind: "build-candidate", ...common };
    case "VERIFYING":
      return { ...metadata("verify-candidate"), kind: "verify-candidate", ...common };
    case "FALSIFYING":
      return { ...metadata("falsify-candidate"), kind: "falsify-candidate", ...common };
    case "QUEUED":
    case "ELIGIBLE":
    case "REJECTED":
    case "INCONCLUSIVE":
      return null;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled run event: ${JSON.stringify(value)}`);
}

export function reduceRunEvent(state: RunMachineState, eventValue: unknown): TransitionResult {
  const parsedEvent = RunEventSchema.safeParse(eventValue);
  if (!parsedEvent.success) {
    return reject(
      state,
      "invalid-event",
      parsedEvent.error.issues.map((issue) => issue.message).join("; "),
    );
  }
  const event = parsedEvent.data;

  if (state.run !== null && event.runId !== state.run.id) {
    return reject(state, "run-id-mismatch", "Event run ID does not match the aggregate");
  }

  if (Object.prototype.hasOwnProperty.call(state.processedEventKeys, event.eventKey)) {
    const appliedEventId = state.processedEventKeys[event.eventKey];
    if (appliedEventId === event.eventId) {
      return noop(state, "duplicate-event");
    }
    return reject(
      state,
      "idempotency-conflict",
      "The event key was already used by another event ID",
    );
  }

  if (Object.values(state.processedEventKeys).includes(event.eventId)) {
    return reject(state, "duplicate-event-id", "The event ID was already used by another event");
  }

  if (event.eventId <= state.lastEventId) {
    return reject(state, "out-of-order-event", "Event IDs must increase monotonically");
  }

  if (state.run === null) {
    if (event.type !== "run.received") {
      return reject(state, "run-not-initialized", "The first event must be run.received");
    }
    // A pinned fixture can be executed against real providers by the owner runner.
    // Its source kind describes the input, not whether execution is live.
    if (event.mode === "replay" && event.sourceRequest.kind !== "fixture") {
      return reject(state, "invariant-violation", "Run mode does not match its source kind");
    }

    const run = {
      schemaVersion: SCHEMA_VERSION,
      id: event.runId,
      idempotencyKey: event.idempotencyKey,
      mode: event.mode,
      state: "RECEIVED",
      sourceRequest: event.sourceRequest,
      source: null,
      config: event.config,
      inventoryArtifactId: null,
      migrationSpecArtifactId: null,
      baseCheckpoint: null,
      candidates: [],
      verdict: null,
      evidenceIds: [],
      failure: null,
      createdAt: event.recordedAt,
      updatedAt: event.recordedAt,
      originalLiveRun: null,
    };
    const command: RunCommand = {
      ...commandMetadata(event, "resolve-source"),
      kind: "resolve-source",
      sourceRequest: event.sourceRequest,
      maxSourceBytes: event.config.maxSourceBytes,
    };
    return apply(state, event, run, [command]);
  }

  const run = state.run;

  if (
    event.type === "run.cancel.requested" &&
    (run.state === "CANCELING" || run.state === "CANCELED")
  ) {
    return noop(
      state,
      run.state === "CANCELED" ? "run-already-canceled" : "cancellation-already-requested",
    );
  }

  if (TERMINAL_RUN_STATES.has(run.state)) {
    return reject(state, "terminal-state", `Run is already terminal in ${run.state}`);
  }

  if (run.state === "CANCELING" && event.type !== "run.canceled") {
    return reject(state, "invalid-transition", "Only run.canceled may follow CANCELING");
  }

  switch (event.type) {
    case "run.received":
      return reject(state, "run-already-initialized", "run.received can be applied only once");

    case "source.resolved": {
      if (run.state !== "RECEIVED") {
        return reject(state, "invalid-transition", "source.resolved requires RECEIVED");
      }
      const requestMatches =
        (run.sourceRequest.kind === "fixture" &&
          event.source.kind === "fixture" &&
          run.sourceRequest.fixtureId === event.source.fixtureId) ||
        (run.sourceRequest.kind === "github" &&
          event.source.kind === "github" &&
          run.sourceRequest.url === event.source.url);
      if (!requestMatches) {
        return reject(state, "invariant-violation", "Resolved source does not match its request");
      }
      const nextRun = transitionRun(run, "SOURCE_RESOLVED", event, {
        source: event.source,
        evidenceIds: appendUnique(run.evidenceIds, event.evidenceIds),
      });
      const command: RunCommand = {
        ...commandMetadata(event, "inventory-source"),
        kind: "inventory-source",
        source: event.source,
      };
      return apply(state, event, nextRun, [command]);
    }

    case "inventory.completed": {
      if (run.state !== "SOURCE_RESOLVED" || run.source === null) {
        return reject(state, "invalid-transition", "inventory.completed requires SOURCE_RESOLVED");
      }
      const nextRun = transitionRun(run, "INVENTORIED", event, {
        inventoryArtifactId: event.artifactId,
        evidenceIds: appendUnique(run.evidenceIds, event.evidenceIds),
      });
      const command: RunCommand = {
        ...commandMetadata(event, "specify-migration"),
        kind: "specify-migration",
        source: run.source,
        inventoryArtifactId: event.artifactId,
      };
      return apply(state, event, nextRun, [command]);
    }

    case "specification.completed": {
      if (run.state !== "INVENTORIED" || run.source === null) {
        return reject(state, "invalid-transition", "specification.completed requires INVENTORIED");
      }
      const nextRun = transitionRun(run, "SPECIFIED", event, {
        migrationSpecArtifactId: event.artifactId,
        evidenceIds: appendUnique(run.evidenceIds, event.evidenceIds),
      });
      const command: RunCommand = {
        ...commandMetadata(event, "create-base-checkpoint"),
        kind: "create-base-checkpoint",
        source: run.source,
        migrationSpecArtifactId: event.artifactId,
        timeoutMs: run.config.timeouts.sandboxOperationMs,
      };
      return apply(state, event, nextRun, [command]);
    }

    case "checkpoint.ready": {
      if (run.state !== "SPECIFIED" || run.source === null) {
        return reject(state, "invalid-transition", "checkpoint.ready requires SPECIFIED");
      }
      if (event.checkpoint.sourceRevision !== sourceRevisionId(run.source)) {
        return reject(
          state,
          "invariant-violation",
          "Checkpoint source revision does not match run",
        );
      }
      if (
        !sameSet(
          event.candidateSeeds.map(({ strategy }) => strategy),
          run.config.strategies,
        )
      ) {
        return reject(
          state,
          "invariant-violation",
          "Candidate seeds must exactly match configured strategies",
        );
      }
      const candidates: Candidate[] = event.candidateSeeds.map((seed) => ({
        id: seed.id,
        runId: run.id,
        strategy: seed.strategy,
        state: "QUEUED",
        checkpointId: event.checkpoint.id,
        sandboxOperationId: null,
        hardGates: [],
        score: null,
        evidenceIds: [],
        failure: null,
        startedAt: null,
        completedAt: null,
      }));
      const nextRun = transitionRun(run, "BASE_CHECKPOINT_READY", event, {
        baseCheckpoint: event.checkpoint,
        candidates,
        evidenceIds: appendUnique(run.evidenceIds, event.evidenceIds),
      });
      return apply(state, event, nextRun, []);
    }

    case "candidates.started": {
      if (run.state !== "BASE_CHECKPOINT_READY" || run.baseCheckpoint === null) {
        return reject(state, "invalid-transition", "candidates.started requires a checkpoint");
      }
      const candidates = run.candidates.map((candidate) => ({
        ...candidate,
        state: "PATCHING" as const,
        startedAt: event.recordedAt,
      }));
      const nextRun = transitionRun(run, "CANDIDATES_RUNNING", event, { candidates });
      const commands = candidates
        .map((candidate) => commandForCandidateState(event, nextRun, candidate))
        .filter((command): command is RunCommand => command !== null);
      return apply(state, event, nextRun, commands);
    }

    case "candidate.transitioned": {
      if (run.state !== "CANDIDATES_RUNNING") {
        return reject(
          state,
          "invalid-transition",
          "candidate.transitioned requires CANDIDATES_RUNNING",
        );
      }
      const candidateIndex = run.candidates.findIndex(({ id }) => id === event.candidateId);
      const candidate = run.candidates[candidateIndex];
      if (candidate === undefined) {
        return reject(state, "invariant-violation", "Candidate is not part of this run");
      }
      if (candidate.state !== event.from) {
        return reject(state, "invalid-transition", "Candidate from-state is stale or invalid");
      }
      if (!CANDIDATE_TRANSITIONS[candidate.state].includes(event.to)) {
        return reject(
          state,
          "invalid-transition",
          `Candidate cannot transition from ${candidate.state} to ${event.to}`,
        );
      }
      if (event.score !== null) {
        return reject(state, "invalid-transition", "Scores are accepted only by scoring.completed");
      }
      const unknownGate = event.hardGates.find((gate) => !run.config.hardGates.includes(gate.gate));
      if (unknownGate !== undefined) {
        return reject(state, "invariant-violation", `Unknown hard gate: ${unknownGate.gate}`);
      }
      if (
        event.to === "ELIGIBLE" &&
        !sameSet(
          event.hardGates.map(({ gate }) => gate),
          run.config.hardGates,
        )
      ) {
        return reject(state, "invariant-violation", "Eligible candidate lacks configured gates");
      }

      const terminal = TERMINAL_CANDIDATE_STATES.has(event.to);
      const updatedCandidate: Candidate = {
        ...candidate,
        state: event.to,
        sandboxOperationId: event.sandboxOperationId ?? candidate.sandboxOperationId,
        hardGates: event.hardGates,
        score: null,
        evidenceIds: appendUnique(candidate.evidenceIds, event.evidenceIds),
        failure: event.failure,
        completedAt: terminal ? event.recordedAt : null,
      };
      const candidates = [...run.candidates];
      candidates[candidateIndex] = updatedCandidate;
      const nextRun = transitionRun(run, "CANDIDATES_RUNNING", event, {
        candidates,
        evidenceIds: appendUnique(run.evidenceIds, event.evidenceIds),
      });
      const allTerminal = candidates.every((item) => TERMINAL_CANDIDATE_STATES.has(item.state));
      const nextCandidateCommand = commandForCandidateState(event, nextRun, updatedCandidate);
      const commands: RunCommand[] = [];
      if (nextCandidateCommand !== null) commands.push(nextCandidateCommand);
      if (terminal && allTerminal) {
        commands.push({
          ...commandMetadata(event, "evaluate-candidates"),
          kind: "evaluate-candidates",
          candidates,
        });
      }
      return apply(state, event, nextRun, commands);
    }

    case "candidates.evaluated": {
      if (
        run.state !== "CANDIDATES_RUNNING" ||
        !run.candidates.every((candidate) => TERMINAL_CANDIDATE_STATES.has(candidate.state))
      ) {
        return reject(
          state,
          "invalid-transition",
          "candidates.evaluated requires every candidate to be terminal",
        );
      }
      const nextRun = transitionRun(run, "CANDIDATES_EVALUATED", event, {
        evidenceIds: appendUnique(run.evidenceIds, event.evidenceIds),
      });
      const command: RunCommand = {
        ...commandMetadata(event, "run-final-falsifier"),
        kind: "run-final-falsifier",
        candidates: nextRun.candidates,
      };
      return apply(state, event, nextRun, [command]);
    }

    case "falsification.completed": {
      if (run.state !== "CANDIDATES_EVALUATED") {
        return reject(
          state,
          "invalid-transition",
          "falsification.completed requires CANDIDATES_EVALUATED",
        );
      }
      const nextRun = transitionRun(run, "FALSIFIED", event, {
        evidenceIds: appendUnique(run.evidenceIds, event.evidenceIds),
      });
      const command: RunCommand = {
        ...commandMetadata(event, "score-candidates"),
        kind: "score-candidates",
        candidates: nextRun.candidates,
      };
      return apply(state, event, nextRun, [command]);
    }

    case "scoring.completed": {
      if (run.state !== "FALSIFIED") {
        return reject(state, "invalid-transition", "scoring.completed requires FALSIFIED");
      }
      if (
        !sameSet(
          event.scores.map(({ candidateId }) => candidateId),
          run.candidates.map(({ id }) => id),
        )
      ) {
        return reject(
          state,
          "invariant-violation",
          "Scores must cover every candidate exactly once",
        );
      }
      const eligibleRanks = event.scores.filter(({ eligible }) => eligible).map(({ rank }) => rank);
      if (
        eligibleRanks.some((rank) => rank === null) ||
        new Set(eligibleRanks).size !== eligibleRanks.length
      ) {
        return reject(state, "invariant-violation", "Eligible scores need unique ranks");
      }
      const scoredCandidates: Candidate[] = [];
      for (const candidate of run.candidates) {
        const score = event.scores.find(({ candidateId }) => candidateId === candidate.id);
        if (score === undefined || score.eligible !== (candidate.state === "ELIGIBLE")) {
          return reject(
            state,
            "invariant-violation",
            "Score eligibility conflicts with gate outcome",
          );
        }
        scoredCandidates.push({ ...candidate, score });
      }
      const nextRun = transitionRun(run, "SCORED", event, {
        candidates: scoredCandidates,
        evidenceIds: appendUnique(run.evidenceIds, event.evidenceIds),
      });
      const command: RunCommand = {
        ...commandMetadata(event, "decide-verdict"),
        kind: "decide-verdict",
        candidates: scoredCandidates,
      };
      return apply(state, event, nextRun, [command]);
    }

    case "verdict.selected": {
      if (run.state !== "SCORED") {
        return reject(state, "invalid-transition", "verdict.selected requires SCORED");
      }
      if (!verdictListsMatchCandidates(event.verdict, run.candidates)) {
        return reject(
          state,
          "invariant-violation",
          "Verdict outcome lists conflict with candidates",
        );
      }
      const selected = run.candidates.find(({ id }) => id === event.verdict.selectedCandidateId);
      if (selected?.state !== "ELIGIBLE") {
        return reject(state, "invariant-violation", "Only an eligible candidate may be selected");
      }
      const nextRun = transitionRun(run, "SELECTED", event, {
        verdict: event.verdict,
        evidenceIds: appendUnique(run.evidenceIds, event.verdict.evidenceIds),
      });
      return apply(state, event, nextRun, []);
    }

    case "verdict.abstained": {
      if (run.state !== "SCORED") {
        return reject(state, "invalid-transition", "verdict.abstained requires SCORED");
      }
      if (!verdictListsMatchCandidates(event.verdict, run.candidates)) {
        return reject(
          state,
          "invariant-violation",
          "Verdict outcome lists conflict with candidates",
        );
      }
      const nextRun = transitionRun(run, "ABSTAINED", event, {
        verdict: event.verdict,
        evidenceIds: appendUnique(run.evidenceIds, event.verdict.evidenceIds),
      });
      return apply(state, event, nextRun, []);
    }

    case "orchestration.stage.failed": {
      if (!STAGE_STATES[event.stage].includes(run.state)) {
        return reject(
          state,
          "invalid-transition",
          `${event.stage} cannot fail while run is ${run.state}`,
        );
      }
      const retryNumber = (state.retryCounts[event.stage] ?? 0) + 1;
      const retryCounts = { ...state.retryCounts, [event.stage]: retryNumber };
      if (retryNumber <= run.config.retryPolicy.maxRetries) {
        const nextRun = transitionRun(run, run.state, event, {
          evidenceIds: appendUnique(run.evidenceIds, event.evidenceIds),
        });
        const command: RunCommand = {
          ...commandMetadata(event, "retry-stage", event.stage),
          kind: "retry-stage",
          stage: event.stage,
          retryNumber,
          maxRetries: run.config.retryPolicy.maxRetries,
          delayMs: retryDelayMs(run, retryNumber),
        };
        return apply(state, event, nextRun, [command], retryCounts);
      }
      const nextRun = transitionRun(run, "FAILED", event, {
        evidenceIds: appendUnique(run.evidenceIds, event.evidenceIds),
        failure: {
          kind: "orchestration",
          code: `retry-budget-exhausted:${event.stage}`,
          message: `${event.message} Retry budget exhausted after ${retryNumber - 1} retries.`,
          evidenceIds: event.evidenceIds,
        },
      });
      return apply(state, event, nextRun, [], retryCounts);
    }

    case "run.cancel.requested": {
      const sandboxOperationIds = run.candidates
        .map(({ sandboxOperationId }) => sandboxOperationId)
        .filter((operationId): operationId is string => operationId !== null);
      const nextRun = transitionRun(run, "CANCELING", event);
      const command: RunCommand = {
        ...commandMetadata(event, "cancel-active-operations"),
        kind: "cancel-active-operations",
        sandboxOperationIds: [...new Set(sandboxOperationIds)],
        timeoutMs: run.config.timeouts.cancellationMs,
      };
      return apply(state, event, nextRun, [command]);
    }

    case "run.canceled": {
      if (run.state !== "CANCELING") {
        return reject(state, "invalid-transition", "run.canceled requires CANCELING");
      }
      const nextRun = transitionRun(run, "CANCELED", event, {
        evidenceIds: appendUnique(run.evidenceIds, event.evidenceIds),
      });
      return apply(state, event, nextRun, []);
    }

    case "run.failed": {
      if (run.state === "CANCELING") {
        return reject(state, "invalid-transition", "Cancellation must settle as CANCELED");
      }
      const nextRun = transitionRun(run, "FAILED", event, {
        failure: event.failure,
        evidenceIds: appendUnique(run.evidenceIds, event.failure.evidenceIds),
      });
      return apply(state, event, nextRun, []);
    }
  }

  return assertNever(event);
}
