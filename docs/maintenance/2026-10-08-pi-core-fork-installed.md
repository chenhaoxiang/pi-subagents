---
doc_type: report
project: pi-subagents
status: completed
truth_mode: snapshot
created: 2026-10-08
verified: 2026-10-08
verified_by: owner-session
owner: chx
ssot: false
---

# 0.76.1-fork.2 installed acceptance

This is the performing owner session's installation attestation. The independent reader checked consistency/source safety, not an independent private-runtime replay. Source review/CI and download/installation facts below are owner-recorded and anchored by the linked public release and PR.

[PR #18](https://github.com/chenhaoxiang/pi-subagents/pull/18) normally merged with independent DeepSeek Flash high review/recheck and all exact-head required CI successful. Release source is `93bfe49573eea62db4d02d943da2bc3d917bdbfa`; stable/latest immutable release [v0.76.1-fork.2](https://github.com/chenhaoxiang/pi-subagents/releases/tag/v0.76.1-fork.2) includes compiled package, source manifest and SHA256SUMS.

The compiled package was rebuilt from that exact merged source, published, downloaded afresh and all hashes verified. It is installed in a new permanent `~/.pi/agent/packages/pi-subagents/0.76.1-fork.2` directory with runtime dependencies and no SDK peer replacement. Only its declaration changed in the owner's settings. The prior fork.1 directory and owner-only settings/rollback receipt remain preserved.

Actual alias resolution against the downloaded, installed Pi 1.0.4-fork.1 host reports `missing=[]`; global offline Pi loading exited 0 with no extension errors. The owner session performed no forced parent/child stop or hot reload. Newly started Pi sessions use the new core/package declarations; an existing parent can retain old imported modules.

Typecheck/build, 38 targeted assertions and activation smoke passed. Initial complete local units were green; the final full-local run retained one pre-existing load-sensitive 500ms fake-npm PID-start failure while the same file passed alone. Required Linux/Windows/loader/clean-install/standalone/nested-wait/Bun CI all passed. Do not rewrite the recorded local failure as unconditional platform success.

No live 700k reliability or unconditional local native-watcher acceptance is asserted by this extension report.

Community integration base, model pool, pre-tool fallback, activity timeout, permissions and supervision remain unchanged. See [strict fork host behavior](2026-10-07-pi-core-fork-host.md) and [release maintenance](../releasing.md).
