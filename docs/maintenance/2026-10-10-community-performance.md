---
doc_type: report
project: workspace
status: active
truth_mode: maintained
created: 2026-10-10
verified: 2026-10-10
verified_by: manual
---

# 0.76.1-fork.3 community performance integration

The owner authorized the staged local extension maintenance after Pi core 1.1.0-fork.1. This candidate normally merges exact community main `d7ac44bdf95b42026720482cfa9f826df0fd9aee` into fork main `c6bc20c223af1c8d79936dfd589833f2dfc67adf`. Community stable remains 0.76.1; the increment is a fork revision, not an invented upstream release.

## Retained contracts

- Native pre-tool heterogeneous fallback remains, including builtin overrides; the community removed-field rejection is not adopted.
- Activity-based idle timeouts remain in schemas, options, runner descriptors/resume and launch receipts. The new launcher field is merged alongside them.
- bg_wait retains the 60-minute default and rejects nonBlocking plus timeoutMs before subscription. Its descriptions are compact without changing these semantics. Operator input can end a blocking wait.
- Strict stable-base fork host aliases remain; unknown/beta/legacy export failures still fail closed.
- Child prompt section ordering, result leases/index publication, declaration pinning, output previews, guide sections and Fleet refresh improvements are integrated. Original schema-budget assertions are kept, not raised.
- The macOS short Unix-socket fixture is retained around the stronger upstream reconnect assertions.

## Local validation

Typecheck and compiled package build pass. The initial focused 17-file unit run passed 460 tests; final targeted regressions passed 311 tests, and idle/launcher integration passed 15 tests. Native activation smoke passed both cases with cold package tool text 2186 characters and activated text 5500, within unchanged budgets.

The full local macOS suite is not green. Initial full unit execution used a Git-ancestry-polluted tmp root; a retry in an independent user tmp root passed 3920/4036 tests with 59 failures, 40 cancellations and 17 skips. Failures include OS-denied process-tree reads (`ps EPERM`), external CLI fixtures, event-loop/process timing and instrumented cleanup. The previous fork.2 part-4 baseline also failed stop/pause/process-tree setup (39/42 passed). The first candidate part-4 attempt hit its 300-second local wrapper deadline; its original log remains. No assertions or process-proof behavior were weakened. Exact remote required CI, independent review and published-install acceptance remain required and are not inferred from these local results.

## Delivery boundary

This document starts as source-validation evidence. Source merge, release tag/assets, downloaded checksums, selected local package and real host loading will be recorded after they occur. The old immutable fork.2 package and active sessions are preserved; a settings change is not a hot upgrade.
