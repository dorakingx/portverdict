import { describe, expect, it } from "vitest";

import {
  DEFAULT_RUN_CONFIG,
  SCHEMA_VERSION,
  type CandidateStrategy,
  type RunConfig,
  type RunState,
} from "@portverdict/shared-schemas";

import { createInitialRunMachineState, reduceRunEvent } from "./reducer.js";
import type { AppliedTransition, RunMachineState, TransitionResult } from "./types.js";

const HASH = "a".repeat(64);
const RUN_ID = "run_001";
const IDEMPOTENCY_KEY = "00000000-0000-4000-8000-000000000001";

function expectApplied(result: TransitionResult): AppliedTransition {
  expect(result.kind).toBe("applied");
  if (result.kind !== "applied") {
    throw new Error(`Expected applied transition, got ${result.kind}`);
  }
  return result;
}

function createHarness() {
  let state = createInitialRunMachineState();
  let nextEventId = 1;

  function event(payload: Record<string, unknown>, explicitId?: number) {
    const eventId = explicitId ?? nextEventId;
    nextEventId = Math.max(nextEventId, eventId + 1);
    return {
      schemaVersion: SCHEMA_VERSION,
      eventId,
      eventKey: `event_${eventId.toString().padStart(3, "0")}`,
      runId: RUN_ID,
      recordedAt: new Date(Date.UTC(2026, 7, 31, 0, 0, eventId)).toISOString(),
      ...payload,
    };
  }

  function send(payload: Record<string, unknown>, explicitId?: number) {
    const value = event(payload, explicitId);
    const result = reduceRunEvent(state, value);
    if (result.kind === "applied") state = result.state;
    return { value, result };
  }

  return {
    event,
    send,
    get state(): RunMachineState {
      return state;
    },
  };
}

function runConfig(strategies: CandidateStrategy[], maxRetries = 2): RunConfig {
  return {
    ...DEFAULT_RUN_CONFIG,
    strategies,
    hardGates: ["build", "schema"],
    retryPolicy: {
      ...DEFAULT_RUN_CONFIG.retryPolicy,
      maxRetries,
    },
  };
}

function receive(
  harness: ReturnType<typeof createHarness>,
  strategies: CandidateStrategy[] = ["minimal-compatibility"],
  maxRetries = 2,
) {
  return harness.send({
    type: "run.received",
    mode: "replay",
    sourceRequest: { kind: "fixture", fixtureId: "fixture-weather" },
    config: runConfig(strategies, maxRetries),
    idempotencyKey: IDEMPOTENCY_KEY,
  });
}

function bootstrapCandidates(
  harness: ReturnType<typeof createHarness>,
  strategies: CandidateStrategy[] = ["minimal-compatibility"],
  mode: "live" | "replay" = "replay",
) {
  const states: RunState[] = [];
  const applied = (payload: Record<string, unknown>) => {
    const result = expectApplied(harness.send(payload).result);
    if (result.state.run !== null) states.push(result.state.run.state);
    return result;
  };

  applied({
    type: "run.received",
    mode,
    sourceRequest: { kind: "fixture", fixtureId: "fixture-weather" },
    config: runConfig(strategies),
    idempotencyKey: IDEMPOTENCY_KEY,
  });
  applied({
    type: "source.resolved",
    source: {
      kind: "fixture",
      fixtureId: "fixture-weather",
      revision: "fixture-v1",
      displayName: "Weather tool migration",
      contentSha256: HASH,
    },
    evidenceIds: ["evidence_source"],
  });
  applied({
    type: "inventory.completed",
    artifactId: "artifact_inventory",
    evidenceIds: ["evidence_inventory"],
  });
  applied({
    type: "specification.completed",
    artifactId: "artifact_specification",
    evidenceIds: ["evidence_specification"],
  });
  applied({
    type: "checkpoint.ready",
    checkpoint: {
      id: "checkpoint_001",
      sourceRevision: "fixture-v1",
      sandboxOperationId: "operation_checkpoint",
      sandboxImageId: "image_checkpoint",
      artifactId: "artifact_checkpoint",
      createdAt: "2026-08-31T00:00:05.000Z",
    },
    candidateSeeds: strategies.map((strategy, index) => ({
      id: `candidate_${index + 1}`,
      strategy,
    })),
    evidenceIds: ["evidence_checkpoint"],
  });
  const started = applied({ type: "candidates.started" });

  return { states, started };
}

function transitionCandidate(
  harness: ReturnType<typeof createHarness>,
  candidateId: string,
  from: string,
  to: string,
  options: {
    hardGates?: unknown[];
    failure?: unknown;
    evidenceIds?: string[];
  } = {},
) {
  return harness.send({
    type: "candidate.transitioned",
    candidateId,
    from,
    to,
    sandboxOperationId: `operation_${candidateId}`,
    hardGates: options.hardGates ?? [],
    score: null,
    failure: options.failure ?? null,
    evidenceIds: options.evidenceIds ?? [],
  });
}

function score(candidateId: string, eligible: boolean, rank: number | null, evidenceId: string) {
  return {
    candidateId,
    eligible,
    rank,
    dimensions: [
      {
        name: "behavioral-parity",
        value: eligible ? 100 : 0,
        unit: "percent",
        direction: "maximize",
        evidenceIds: [evidenceId],
      },
    ],
  };
}

describe("run reducer", () => {
  it.each(["replay", "live"] as const)(
    "executes every successful %s fixture transition before selecting",
    (mode) => {
      const harness = createHarness();
      const { states, started } = bootstrapCandidates(harness, undefined, mode);

      expect(started.commands.map(({ kind }) => kind)).toEqual(["patch-candidate"]);
      expect(harness.state.run?.candidates[0]?.state).toBe("PATCHING");

      const candidateStates: string[] = ["PATCHING"];
      for (const [from, to] of [
        ["PATCHING", "BUILDING"],
        ["BUILDING", "VERIFYING"],
        ["VERIFYING", "FALSIFYING"],
      ] as const) {
        const applied = expectApplied(transitionCandidate(harness, "candidate_1", from, to).result);
        candidateStates.push(applied.state.run?.candidates[0]?.state ?? "missing");
      }

      const passedGates = [
        { gate: "build", status: "passed", evidenceIds: ["evidence_build"] },
        { gate: "schema", status: "passed", evidenceIds: ["evidence_schema"] },
      ];
      const eligible = expectApplied(
        transitionCandidate(harness, "candidate_1", "FALSIFYING", "ELIGIBLE", {
          hardGates: passedGates,
          evidenceIds: ["evidence_build", "evidence_schema"],
        }).result,
      );
      candidateStates.push(eligible.state.run?.candidates[0]?.state ?? "missing");
      expect(eligible.commands.map(({ kind }) => kind)).toEqual(["evaluate-candidates"]);

      const evaluated = expectApplied(
        harness.send({
          type: "candidates.evaluated",
          evidenceIds: ["evidence_evaluation"],
        }).result,
      );
      states.push(evaluated.state.run?.state ?? "FAILED");
      const falsified = expectApplied(
        harness.send({
          type: "falsification.completed",
          evidenceIds: ["evidence_falsification"],
        }).result,
      );
      states.push(falsified.state.run?.state ?? "FAILED");
      const scored = expectApplied(
        harness.send({
          type: "scoring.completed",
          scores: [score("candidate_1", true, 1, "evidence_score")],
          evidenceIds: ["evidence_score"],
        }).result,
      );
      states.push(scored.state.run?.state ?? "FAILED");
      const selected = expectApplied(
        harness.send({
          type: "verdict.selected",
          verdict: {
            kind: "selected",
            selectedCandidateId: "candidate_1",
            eligibleCandidateIds: ["candidate_1"],
            rejectedCandidateIds: [],
            inconclusiveCandidateIds: [],
            decidedAt: "2026-08-31T00:00:14.000Z",
            evidenceIds: ["evidence_verdict"],
            rationaleEvidenceId: null,
          },
        }).result,
      );
      states.push(selected.state.run?.state ?? "FAILED");

      expect(states).toEqual([
        "RECEIVED",
        "SOURCE_RESOLVED",
        "INVENTORIED",
        "SPECIFIED",
        "BASE_CHECKPOINT_READY",
        "CANDIDATES_RUNNING",
        "CANDIDATES_EVALUATED",
        "FALSIFIED",
        "SCORED",
        "SELECTED",
      ]);
      expect(candidateStates).toEqual([
        "PATCHING",
        "BUILDING",
        "VERIFYING",
        "FALSIFYING",
        "ELIGIBLE",
      ]);
      expect(selected.commands).toEqual([]);
    },
  );

  it("does not mutate state for duplicate, conflicting, out-of-order, or invalid transitions", () => {
    const harness = createHarness();
    const received = receive(harness);
    const appliedReceived = expectApplied(received.result);

    const duplicate = reduceRunEvent(appliedReceived.state, received.value);
    expect(duplicate).toMatchObject({ kind: "noop", reason: "duplicate-event" });
    expect(duplicate.state).toBe(appliedReceived.state);

    const conflict = reduceRunEvent(appliedReceived.state, {
      ...received.value,
      eventId: 2,
      recordedAt: "2026-08-31T00:00:02.000Z",
    });
    expect(conflict).toMatchObject({ kind: "rejected", reason: "idempotency-conflict" });
    expect(conflict.state).toBe(appliedReceived.state);

    const rejectedTransition = harness.send({
      type: "inventory.completed",
      artifactId: "artifact_inventory",
      evidenceIds: ["evidence_inventory"],
    });
    expect(rejectedTransition.result).toMatchObject({
      kind: "rejected",
      reason: "invalid-transition",
    });
    expect(rejectedTransition.result.state).toBe(appliedReceived.state);

    const resolved = harness.send(
      {
        type: "source.resolved",
        source: {
          kind: "fixture",
          fixtureId: "fixture-weather",
          revision: "fixture-v1",
          displayName: "Weather tool migration",
          contentSha256: HASH,
        },
        evidenceIds: [],
      },
      4,
    );
    const resolvedState = expectApplied(resolved.result).state;
    const outOfOrderEvent = harness.event(
      {
        type: "inventory.completed",
        artifactId: "artifact_inventory",
        evidenceIds: ["evidence_inventory"],
      },
      3,
    );
    const outOfOrder = reduceRunEvent(resolvedState, outOfOrderEvent);
    expect(outOfOrder).toMatchObject({ kind: "rejected", reason: "out-of-order-event" });
    expect(outOfOrder.state).toBe(resolvedState);

    const invalid = reduceRunEvent(resolvedState, { type: "source.resolved" });
    expect(invalid).toMatchObject({ kind: "rejected", reason: "invalid-event" });
    expect(invalid.state).toBe(resolvedState);
  });

  it("retries only within the configured budget and then fails terminally", () => {
    const harness = createHarness();
    expectApplied(receive(harness, ["minimal-compatibility"], 1).result);

    const firstFailure = expectApplied(
      harness.send({
        type: "orchestration.stage.failed",
        stage: "source-resolution",
        code: "provider-timeout",
        message: "Provider did not answer.",
        evidenceIds: ["evidence_timeout_1"],
      }).result,
    );
    expect(firstFailure.state.run?.state).toBe("RECEIVED");
    expect(firstFailure.commands).toMatchObject([
      { kind: "retry-stage", retryNumber: 1, maxRetries: 1 },
    ]);

    const exhausted = expectApplied(
      harness.send({
        type: "orchestration.stage.failed",
        stage: "source-resolution",
        code: "provider-timeout",
        message: "Provider still did not answer.",
        evidenceIds: ["evidence_timeout_2"],
      }).result,
    );
    expect(exhausted.state.run).toMatchObject({
      state: "FAILED",
      failure: { code: "retry-budget-exhausted:source-resolution" },
    });
    expect(exhausted.commands).toEqual([]);

    const terminalAttempt = harness.send({
      type: "run.cancel.requested",
      reason: "Too late",
    }).result;
    expect(terminalAttempt).toMatchObject({ kind: "rejected", reason: "terminal-state" });
    expect(terminalAttempt.state).toBe(exhausted.state);
  });

  it("cancels from an active state with bounded cleanup and treats repeated cancellation as a no-op", () => {
    const harness = createHarness();
    expectApplied(receive(harness).result);
    expectApplied(
      harness.send({
        type: "source.resolved",
        source: {
          kind: "fixture",
          fixtureId: "fixture-weather",
          revision: "fixture-v1",
          displayName: "Weather tool migration",
          contentSha256: HASH,
        },
        evidenceIds: [],
      }).result,
    );

    const canceling = expectApplied(
      harness.send({ type: "run.cancel.requested", reason: "Judge requested stop" }).result,
    );
    expect(canceling.state.run?.state).toBe("CANCELING");
    expect(canceling.commands).toMatchObject([
      { kind: "cancel-active-operations", timeoutMs: 30_000 },
    ]);

    const repeated = harness.send({
      type: "run.cancel.requested",
      reason: "Judge requested stop again",
    }).result;
    expect(repeated).toMatchObject({
      kind: "noop",
      reason: "cancellation-already-requested",
    });
    expect(repeated.state).toBe(canceling.state);

    const canceled = expectApplied(
      harness.send({ type: "run.canceled", evidenceIds: ["evidence_cancel"] }).result,
    );
    expect(canceled.state.run?.state).toBe("CANCELED");

    const afterCanceled = harness.send({
      type: "run.cancel.requested",
      reason: "Still canceled",
    }).result;
    expect(afterCanceled).toMatchObject({ kind: "noop", reason: "run-already-canceled" });
    expect(afterCanceled.state).toBe(canceled.state);
  });

  it("records behavioral rejection and infrastructure inconclusion, then abstains when all branches fail", () => {
    const harness = createHarness();
    bootstrapCandidates(harness, ["minimal-compatibility", "prompt-schema-adaptation"]);

    for (const [from, to] of [
      ["PATCHING", "BUILDING"],
      ["BUILDING", "VERIFYING"],
      ["VERIFYING", "FALSIFYING"],
    ] as const) {
      expectApplied(transitionCandidate(harness, "candidate_1", from, to).result);
    }
    const rejected = expectApplied(
      transitionCandidate(harness, "candidate_1", "FALSIFYING", "REJECTED", {
        hardGates: [{ gate: "schema", status: "failed", evidenceIds: ["evidence_behavior"] }],
        failure: {
          kind: "behavioral",
          code: "schema-mismatch",
          message: "Tool arguments violate the target schema.",
          retriable: false,
          evidenceIds: ["evidence_behavior"],
        },
        evidenceIds: ["evidence_behavior"],
      }).result,
    );
    expect(rejected.state.run?.candidates[0]).toMatchObject({
      state: "REJECTED",
      failure: { kind: "behavioral" },
    });

    const beforeInvalidFailure = harness.state;
    const invalidFailure = transitionCandidate(harness, "candidate_2", "PATCHING", "REJECTED", {
      hardGates: [{ gate: "build", status: "failed", evidenceIds: ["evidence_infra"] }],
      failure: {
        kind: "infrastructure",
        code: "sandbox-timeout",
        message: "Sandbox operation timed out.",
        retriable: false,
        evidenceIds: ["evidence_infra"],
      },
      evidenceIds: ["evidence_infra"],
    }).result;
    expect(invalidFailure).toMatchObject({
      kind: "rejected",
      reason: "invariant-violation",
    });
    expect(invalidFailure.state).toBe(beforeInvalidFailure);

    const inconclusive = expectApplied(
      transitionCandidate(harness, "candidate_2", "PATCHING", "INCONCLUSIVE", {
        hardGates: [{ gate: "build", status: "inconclusive", evidenceIds: ["evidence_infra"] }],
        failure: {
          kind: "infrastructure",
          code: "sandbox-timeout",
          message: "Sandbox operation timed out.",
          retriable: false,
          evidenceIds: ["evidence_infra"],
        },
        evidenceIds: ["evidence_infra"],
      }).result,
    );
    expect(inconclusive.state.run?.candidates[1]).toMatchObject({
      state: "INCONCLUSIVE",
      failure: { kind: "infrastructure" },
    });
    expect(inconclusive.commands.map(({ kind }) => kind)).toEqual(["evaluate-candidates"]);

    expectApplied(
      harness.send({
        type: "candidates.evaluated",
        evidenceIds: ["evidence_evaluation"],
      }).result,
    );
    expectApplied(
      harness.send({
        type: "falsification.completed",
        evidenceIds: ["evidence_falsification"],
      }).result,
    );
    expectApplied(
      harness.send({
        type: "scoring.completed",
        scores: [
          score("candidate_1", false, null, "evidence_score_1"),
          score("candidate_2", false, null, "evidence_score_2"),
        ],
        evidenceIds: ["evidence_score_1", "evidence_score_2"],
      }).result,
    );

    const beforeUnsafeSelection = harness.state;
    const unsafeSelection = harness.send({
      type: "verdict.selected",
      verdict: {
        kind: "selected",
        selectedCandidateId: "candidate_1",
        eligibleCandidateIds: ["candidate_1"],
        rejectedCandidateIds: [],
        inconclusiveCandidateIds: ["candidate_2"],
        decidedAt: "2026-08-31T00:00:20.000Z",
        evidenceIds: ["evidence_bad_verdict"],
        rationaleEvidenceId: null,
      },
    }).result;
    expect(unsafeSelection).toMatchObject({
      kind: "rejected",
      reason: "invariant-violation",
    });
    expect(unsafeSelection.state).toBe(beforeUnsafeSelection);

    const abstained = expectApplied(
      harness.send({
        type: "verdict.abstained",
        verdict: {
          kind: "abstained",
          reason: "all-candidates-failed",
          message: "No branch passed every hard gate.",
          eligibleCandidateIds: [],
          rejectedCandidateIds: ["candidate_1"],
          inconclusiveCandidateIds: ["candidate_2"],
          decidedAt: "2026-08-31T00:00:21.000Z",
          evidenceIds: ["evidence_abstention"],
          rationaleEvidenceId: null,
        },
      }).result,
    );
    expect(abstained.state.run).toMatchObject({
      state: "ABSTAINED",
      verdict: { kind: "abstained", reason: "all-candidates-failed" },
    });
  });
});
