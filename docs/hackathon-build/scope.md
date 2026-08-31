# Project Scope

## Project Name Candidates

- PortVerdict (selected after current GitHub, Devpost, and web conflict research)
- ParityPilot (rejected: material collision with an existing AI fairness product)
- MigrationProof (rejected: active migration-product usage)

## One-Line Summary

PortVerdict migrates an AI application to NVIDIA Nemotron on Nebius, puts competing Sandbox branches on trial, and ships only the candidate supported by executable parity evidence.

## Target User

AI application engineers and platform teams who need to move a production-oriented codebase from a closed model provider to an open NVIDIA model without silently breaking structured output, tool calls, streaming, retry behavior, or prompts.

## Problem

Changing an AI provider is not a safe endpoint substitution. Provider-specific SDK calls, prompts, schemas, tool protocols, error handling, token limits, and streaming semantics interact in ways that compile successfully while degrading behavior. Existing coding agents optimize for producing a patch; they rarely create competing migrations, falsify them, and abstain when evidence is inadequate.

## Core Workflow

1. A judge launches the built-in TypeScript sample or supplies a small public GitHub repository.
2. PortVerdict inventories provider calls, prompts, schemas, tools, streaming, retries, and tests.
3. Nemotron creates a validated migration specification.
4. A real Token Factory Sandbox base checkpoint is created and forked into at least three candidate branches.
5. Worker agents implement minimal compatibility, prompt/schema adaptation, and resilience/routing strategies.
6. Deterministic builds, tests, schema/tool fixtures, security checks, and a counterexample pass evaluate each branch.
7. Tavily retrieves current official documentation for disputed compatibility points and attaches citations.
8. Hard gates eliminate unsafe candidates; a scorer selects the strongest passing branch or abstains.
9. The UI presents the branch tree, activity, evidence, diffs, parity matrix, measurements, rationale, and a patch/PR action.

## What We Are Building

- A polished responsive web experience with a no-login demo path.
- A maintainable state-machine backend with idempotent jobs and structured events.
- Live Nebius Token Factory Nemotron calls with dynamic model discovery and an explicit task router.
- Real Token Factory Sandbox checkpoint/branch execution with time, resource, and network controls.
- Functional runtime Tavily search/extract calls restricted toward official documentation.
- One deeply verified TypeScript fixture and one Python fixture for the live demo; a broader deterministic 10-fixture benchmark suite can use recorded/replayable inputs where live budget is constrained.
- Deterministic provenance, hard gates, abstention, secret redaction, replay mode, and evidence export.
- Public deployment, public repository, CI, documentation, evaluation artifacts, screenshots, and a sub-three-minute real demo video.

## What We Are Not Building

- A general-purpose autonomous software engineer for arbitrary large repositories.
- A production multi-tenant SaaS, billing system, or private-repository OAuth product.
- Automatic execution of untrusted repository code on the application server.
- A promise that every provider feature or repository can be migrated.
- Fine-tuning infrastructure, a custom model, or a new agent framework.
- Unsupported cost estimates or synthetic benchmark claims presented as live results.

## Timebox

- Submission deadline: October 30, 2026 at 10:00 AM Pacific Time / October 31, 2026 at 2:00 AM JST.
- Available calendar window from project start: roughly two months.
- First milestone: a local vertical slice with deterministic replay and complete UI before expanding live integrations.
- Final month: real Nebius/Tavily integration, evaluation, deployment hardening, video, and submission evidence.

## Inspiration And References

- Differential testing and compiler conformance suites: compare behavior, not just output text.
- Branch-and-bound search: explore alternatives from a shared checkpoint and prune failures early.
- CI quality gates: deterministic evidence must pass before any subjective model score is considered.
- Security review tools: surface provenance and findings rather than hiding them behind a single score.

## Demo Path

The judge clicks **Run Demo**, watches three real Sandbox branches diverge, sees the naive branch fail a tool/schema adversarial fixture, sees a repaired branch pass all hard gates with current Tavily documentation attached, inspects the patch and parity matrix, and downloads the selected migration. Replay is clearly labeled and backed by recorded real tool results; live proof displays actual request/run identifiers.

## Submission Story

PortVerdict turns model migration from a hopeful code edit into an evidence-producing engineering process. Nemotron performs the reasoning and repair work, Nebius Sandboxes make branchable isolated experimentation load-bearing, and Tavily supplies current compatibility evidence. The differentiator is restraint: PortVerdict can reject every candidate rather than ship an unsupported migration.
