---
doc_type: maintenance
project: pi-subagents
status: active
truth_mode: maintained
created: 2026-10-20
---

# Existing run metadata: native-child measurement parity

This is a narrow repair to the existing `*_meta.json` artifact, not a new tracer, database, or scheduling layer. Background native children already measure tool calls and elapsed time in `runChildSession`; their metadata now retains those measurements across completed attempts, alongside existing SDK usage. Foreground metadata retains its existing progress-summary measurements. Neither path starts another reader, provider request, or per-token write.

## Reading evidence

- `runId` identifies the invocation; `index` identifies the child within it. `parentSessionId` links the parent session, not a mission or run. A resumed invocation may have a new run ID while reusing a session.
- `model` and `thinking` retain the resolved launch evidence already used by results. Where fallback occurred, `requestedModel`, `attemptedModels`, `modelAttempts`, and `skippedModels` retain their existing meanings. They do not authenticate a provider's underlying vendor or served weights.
- `durationMs` sums measured native-child attempt time; `toolCount` sums observed tool starts. Async status step duration also includes runner setup, output handling, and acceptance, so it need not equal metadata duration. Do not add parent/child durations or parallel wall times as if they were one elapsed clock.
- Missing measurements remain absent/unknown. A measured zero tool count is valid, but an unlaunched child does not acquire zero metrics. Older artifacts are not backfilled by reading raw sessions.
- `usage` is the existing SDK projection, including cache fields. `costStatus` is `sdk-reported` for positive SDK cost and `unpriced` for zero SDK cost. Neither is a reconciled invoice or a promise of free execution; consumers must keep absent usage unknown.
- `artifactPaths`, `savedOutputPath`, and the existing transcript fields are evidence pointers only. Safe consumers should whitelist fields and must not load prompt, session, tool-argument, reasoning, or transcript bodies to fill gaps. Artifact capture switches, prompt redaction, and best-effort metadata failure behavior are unchanged.

## Verification and delivery boundaries

Provider-free regression fixtures cover foreground parity, async measured tool usage, failed runs with zero SDK pricing, explicit model fallback, pre-launch cancellation with unknown metrics, and prompt redaction with transcript capture disabled. Type checking, package build and tool-activation smoke remain separate checks; required exact-head platform CI and independent review remain necessary before shared delivery.

Local provider-free checks passed: 322 tests in the three affected integration suites, the unknown-metrics unit regression, typecheck, package build, and tool-activation smoke. A scoped oxlint invocation still reports existing repository debt; none of its diagnostics intersects changed TypeScript lines or the new unit file. This is not a full lint pass. Platform CI and independent review are not inferred from these local results.

The package source candidate is `0.79.0-fork.3`; the verified published rollback baseline is `0.79.0-fork.2`. This document describes the source contract, not an installed-version or active-session claim. An existing session keeps its loaded extension until it is deliberately replaced. No global timeout, model routing, authority, or memory-bank setting is changed here.
