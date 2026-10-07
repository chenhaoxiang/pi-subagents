---
doc_type: runbook
project: pi-subagents
status: active
truth_mode: maintained
created: 2026-10-07
verified: 2026-10-07
owner: chx
ssot: true
---

# Pi core fork host compatibility

## Problem and authorized scope

The owner requested installation of Pi `1.0.4-fork.1`, then explicitly approved the smallest necessary pi-subagents compatibility change. The existing host alias resolver accepted pure stable Pi 1.x versions only. A valid maintained fork therefore could not omit the already-removed `pi-agent-core/node` export, blocking its detached runner before child execution.

Version `0.76.1-fork.2` retains the same community/fork integration base as `0.76.1-fork.1`; there is no new community synchronization or model-pool change.

## Behavior

- Preserve existing stable-version recognition.
- Additionally recognize bounded, canonical `X.Y.Z-fork.N` versions with a positive revision and no leading zeros.
- Only community major versions >= 1 may omit the removed legacy node export. Pre-1.0 hosts still require it.
- Beta, build metadata, unknown versions, malformed fork revisions and missing other required peers remain fail-closed. A legacy node export that is declared but whose file is missing is also a startup error, not silently omitted.
- The pre-chord gate is unchanged: fork versions of pre-0.85 Pi do not gain a chord-omission exception.
- This does not add exports to Pi, claim that any arbitrary prerelease has a stable API, or change fallback/replay, authorization, activity timeout or child supervision rules.

## Validation and release

New synthetic host fixtures cover valid stable/fork versions, malformed/beta/pre-1.0 versions and unrelated missing peers. Existing host/peer-loader/background-wait assertions are retained unchanged. The first typecheck, compiled-package build and targeted 36-case set passed, followed by the full unit suite and activation smoke. Independent review additionally identified the declared-but-missing target and fixture-version precision boundaries; both are now covered by new assertions. Final gate logs are retained under the task evidence directory; release/CI and installed runtime evidence remain separate from synthetic fixtures.

Publish only the compiled package at immutable tag `v0.76.1-fork.2`, with provenance and checksums under the existing release contract. Install into a new permanent versioned directory and preserve `0.76.1-fork.1`. Do not overwrite loaded modules or restart active sessions/children. The new core and extension versions take effect in newly started Pi processes, not by claiming a disk update hot-upgraded an existing parent.
