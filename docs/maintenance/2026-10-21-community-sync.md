---
doc_type: report
project: workspace
component: pi-subagents
status: active
truth_mode: maintained
created: 2026-10-21
verified: 2026-10-21
verified_by: manual
owner: chx
---

# 0.79.2-fork.1 community integration

## Exact scope

Integrate 32 community commits through `d48d580954086a426d31f1c7b8d793a1d26ad184` (source version 0.79.2) into the maintained `main`; preserve previous release 0.79.0-fork.3 for rollback. Pure `upstream-main` remains a separate exact mirror. This document records source validation, not a pre-emptive release or installed-runtime claim.

Community main after v0.79.2 adds per-child cwd/model, slash-command opt-out, Codex-compatible custom API IDs, cold-tool exposure, restart-safe completion notices and host-relative SDK discovery. Retained fork behavior includes the guarded fallback pool, activity-based idle timeouts, fail-closed host aliases, native custom parent turns and native-child measurement evidence. Conflicting loader assertions retain JSON import/require checks; new host fixtures identify their stable Pi 1.3 fork version rather than weakening unknown-host checks.

## Verification

`npm run typecheck`, `npm run build:pkg`, 4,174 unit tests passed / 17 skipped, 1,254 integration tests passed / 8 skipped, and 2 tool-activation smoke tests passed. Integration fixtures log non-fatal missing sendMessage warnings; no test failed. Earlier runs under the shared Git root or the user-home .pi ancestor produced discovery/socket failures; final runs use short `/Users/Shared/tmp/pi21/subagents` synthetic roots outside both trees.

Independent review and exact-head CI are bound to the synchronization PR. Release assets must be built from the exact remote merge commit, include a source manifest and SHA-256 checksums, then be freshly downloaded and verified before installation. GitHub Release notes record those later outcomes; do not infer them from this source report.

## Installation boundary

The authorized rollout selects a new permanent versioned package directory only after artifact and provider-free host-loading checks. Preserve old packages and a settings backup; do not force-restart loaded parents, children or a shared broker. Disk selection does not prove existing sessions loaded the new code. Real credentials, paid queries/probes, provider settings and unrelated package declarations are not part of verification.
