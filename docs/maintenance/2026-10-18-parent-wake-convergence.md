---
doc_type: report
project: pi-subagents
status: active
truth_mode: maintained
created: 2026-10-18
owner: chx
---

# Parent wake provenance and convergence

Pi 1.3 runs `before_agent_start` for custom trigger turns. On released Pi 1.3+ hosts, the saved child result/request now starts that native lifecycle directly: no extra human-shaped “Inspect subagent updates above” message is inserted. Supported older hosts retain the existing compatibility wake, because removing it would lose hook-set context. Unknown/prerelease host versions do not opt into the new route.

The shared session-manager reservation, user-abort hold, manual-compaction resume, result ownership, successful workflow-child batching and required final result delivery remain authoritative. This change does not infer whether a business task is complete, hide final results, impose a global spawn cap, or grant authority. The existing task board must retain BLOCKED separately from completed; only changed source/input/artifact/contract invalidates applicable passing evidence.

Regression: native/legacy parent lifecycle 19/19; combined notification/supervisor/reload/wait checks 153/153; full unit suite 4120 passed, 17 skipped, zero failed. Typecheck and compiled-package build pass. A Pi 1.3.0-fork.1 synthetic SDK run observes before_agent_start for user then custom, retains the result and inserts zero synthetic user wakes. No real provider is called. Exact release/installation/activation remain separate evidence; old running sessions are not hot-replaced.
