import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAsyncRecovery, projectAsyncRecovery } from "../../src/runs/shared/async-recovery.ts";

describe("async recovery projection", () => {
	it("turns unknown runner liveness into an explicit reconcile action", () => {
		const recovery = projectAsyncRecovery({
			runId: "run-unknown",
			state: "running",
			processTerminal: { version: 1, state: "unknown", runId: "run-unknown", runnerProcessInstanceId: "runner-1" },
		});
		assert.deepEqual(recovery, {
			state: "unknown",
			action: "reconcile",
			reason: "runner_liveness_unknown",
			runId: "run-unknown",
		});
		assert.match(formatAsyncRecovery(recovery), /next action: reconcile/);
	});

	it("does not offer resume while a run is active", () => {
		const recovery = projectAsyncRecovery({ runId: "run-live", state: "running" });
		assert.deepEqual(recovery, { state: "waiting", action: "status", reason: "runner_active", runId: "run-live" });
	});

	it("offers resume only when a persisted Pi session is available", () => {
		const recovery = projectAsyncRecovery({
			runId: "run-paused",
			state: "paused",
			steps: [{ index: 0, status: "paused", sessionFile: "/tmp/child.jsonl", sessionFileAvailable: true, runnerType: "pi" }],
		});
		assert.deepEqual(recovery, { state: "ready", action: "resume", reason: "resumable_session", runId: "run-paused", index: 0 });
	});

	it("keeps foreign and external runs from becoming resume targets", () => {
		assert.equal(projectAsyncRecovery({ runId: "foreign", state: "failed", sessionId: "other", currentSessionId: "current" }).reason, "foreign_session");
		assert.equal(projectAsyncRecovery({ runId: "external", state: "failed", steps: [{ index: 0, runnerType: "external-cli" }] }).reason, "external_runner_non_resumable");
	});
});
