---
doc_type: report
project: pi-subagents
status: completed
truth_mode: snapshot
created: 2026-10-11
verified: 2026-10-11
verified_by: source-release-install-readback
owner: chx
ssot: false
---

# 0.77.0-fork.1 installed acceptance

## Release and installation

- Release: [v0.77.0-fork.1](https://github.com/chenhaoxiang/pi-subagents/releases/tag/v0.77.0-fork.1).
- Exact source: merge commit `5c8002e51e2d1786d5ed41eafbe10e319f4adce7`.
- Community mirror at release time: `upstream-main` `5808e94199735b399fed637e6fbd2559ec3b4620`; community main has since advanced independently with post-release fix `29284cd9`.
- Tarball SHA-256: `ee8b8981c71f9b717e9a42eaee795be45195dbcef0a2e9f6ad057a85fb8e7505`.
- Required GitHub CI for PR #22 passed at the exact head; local typecheck/build and 189 focused regressions also passed.
- The published tarball, `release-manifest.json`, and `SHA256SUMS` were downloaded afresh and verified before installation.
- The permanent local package directory is versioned as `~/.pi/agent/packages/pi-subagents/0.77.0-fork.1`; settings select `packages/pi-subagents/0.77.0-fork.1`.
- The previous `0.76.1-fork.3` package and settings backup remain available for rollback; no active Pi session or child was stopped.

## Installed readback

Every one of the 1,342 files in the downloaded release tarball was compared byte-for-byte with the permanent installed directory. All files matched. A provider-free RPC smoke loaded the installed package and exposed the expected `subagents`, `subagents-guide`, `subagents-fleet`, `subagents-doctor`, `subagents-stop`, `skill:pi-subagents`, and related commands; provider requests were 0.

The local maintenance page subsequently reported `0.77.0-fork.1`, release manifest source `5c8002e51`, and the maintained fork source/installation association. Community main later advanced by one upstream commit; that newer community fix is not silently claimed as part of this immutable release. Disk installation does not imply that already-running Pi processes or children have hot-reloaded the package; restart only after active work is settled.
