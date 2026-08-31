import type {
  BaseCheckpoint,
  Candidate,
  CandidateStrategy,
  OrchestrationStage,
  Run,
  RunEvent,
  SourceRequest,
  SourceRevision,
} from "@portverdict/shared-schemas";

export type RunMachineState = Readonly<{
  schemaVersion: 1;
  run: Run | null;
  lastEventId: number;
  processedEventKeys: Readonly<Record<string, number>>;
  retryCounts: Readonly<Partial<Record<OrchestrationStage, number>>>;
}>;

type CommandMetadata = Readonly<{
  commandId: string;
  runId: string;
  causedByEventId: number;
}>;

export type ResolveSourceCommand = CommandMetadata &
  Readonly<{
    kind: "resolve-source";
    sourceRequest: SourceRequest;
    maxSourceBytes: number;
  }>;

export type InventorySourceCommand = CommandMetadata &
  Readonly<{
    kind: "inventory-source";
    source: SourceRevision;
  }>;

export type SpecifyMigrationCommand = CommandMetadata &
  Readonly<{
    kind: "specify-migration";
    source: SourceRevision;
    inventoryArtifactId: string;
  }>;

export type CreateBaseCheckpointCommand = CommandMetadata &
  Readonly<{
    kind: "create-base-checkpoint";
    source: SourceRevision;
    migrationSpecArtifactId: string;
    timeoutMs: number;
  }>;

export type CandidateCommand = CommandMetadata &
  Readonly<{
    kind: "patch-candidate" | "build-candidate" | "verify-candidate" | "falsify-candidate";
    candidateId: string;
    strategy: CandidateStrategy;
    checkpoint: BaseCheckpoint;
    timeoutMs: number;
  }>;

export type EvaluateCandidatesCommand = CommandMetadata &
  Readonly<{
    kind: "evaluate-candidates";
    candidates: readonly Candidate[];
  }>;

export type RunFinalFalsifierCommand = CommandMetadata &
  Readonly<{
    kind: "run-final-falsifier";
    candidates: readonly Candidate[];
  }>;

export type ScoreCandidatesCommand = CommandMetadata &
  Readonly<{
    kind: "score-candidates";
    candidates: readonly Candidate[];
  }>;

export type DecideVerdictCommand = CommandMetadata &
  Readonly<{
    kind: "decide-verdict";
    candidates: readonly Candidate[];
  }>;

export type RetryStageCommand = CommandMetadata &
  Readonly<{
    kind: "retry-stage";
    stage: OrchestrationStage;
    retryNumber: number;
    maxRetries: number;
    delayMs: number;
  }>;

export type CancelActiveOperationsCommand = CommandMetadata &
  Readonly<{
    kind: "cancel-active-operations";
    sandboxOperationIds: readonly string[];
    timeoutMs: number;
  }>;

export type RunCommand =
  | ResolveSourceCommand
  | InventorySourceCommand
  | SpecifyMigrationCommand
  | CreateBaseCheckpointCommand
  | CandidateCommand
  | EvaluateCandidatesCommand
  | RunFinalFalsifierCommand
  | ScoreCandidatesCommand
  | DecideVerdictCommand
  | RetryStageCommand
  | CancelActiveOperationsCommand;

export type NoopReason =
  "duplicate-event" | "cancellation-already-requested" | "run-already-canceled";

export type RejectionReason =
  | "invalid-event"
  | "run-not-initialized"
  | "run-already-initialized"
  | "run-id-mismatch"
  | "idempotency-conflict"
  | "duplicate-event-id"
  | "out-of-order-event"
  | "invalid-transition"
  | "terminal-state"
  | "invariant-violation";

export type AppliedTransition = Readonly<{
  kind: "applied";
  state: RunMachineState;
  commands: readonly RunCommand[];
  event: RunEvent;
}>;

export type NoopTransition = Readonly<{
  kind: "noop";
  reason: NoopReason;
  state: RunMachineState;
  commands: readonly [];
}>;

export type RejectedTransition = Readonly<{
  kind: "rejected";
  reason: RejectionReason;
  message: string;
  state: RunMachineState;
  commands: readonly [];
}>;

export type TransitionResult = AppliedTransition | NoopTransition | RejectedTransition;
