import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { readMissionBinding, syncMissionFromAsyncCompletion } from "../../src/missions/lifecycle.ts";
import type { Details } from "../../src/shared/types.ts";
import { makeAgent, makeMinimalCtx } from "../support/helpers.ts";
import {
	available, installAsyncExecutionHooks, isAsyncAvailable, makeAsyncExecutor,
	mockPi, readAsyncPayload, tempDir, waitForAsyncState,
} from "../support/async-execution-fixture.ts";

// Native executor, real SessionManager identities and background processes;
// child inference is scripted, with no live session/provider or takeover.
describe("linked async result acceptance", { skip: !available ? "pi packages not available" : undefined }, () => {
	installAsyncExecutionHooks();
	it("keeps original review evidence when a fresh parent explicitly reuses the mission", { timeout: 60_000, skip: !isAsyncAvailable() ? "async runtime unavailable" : undefined }, async () => {
		const config = { missions: { directory: path.join(tempDir, "missions"), globalIndex: false } };
		const executor = makeAsyncExecutor([makeAgent("worker")], config);
		const original = SessionManager.create(tempDir, path.join(tempDir, "original-sessions"));
		const fresh = SessionManager.create(tempDir, path.join(tempDir, "fresh-sessions"));
		assert.notEqual(original.getSessionId(), fresh.getSessionId());
		assert.notEqual(original.getSessionFile(), fresh.getSessionFile());
		const context = (manager: SessionManager) => ({ ...makeMinimalCtx(tempDir), sessionManager: manager });
		const execute = (id: string, params: Record<string, unknown>, manager: SessionManager) => executor.execute(id, params, new AbortController().signal, undefined, context(manager)) as Promise<{ isError?: boolean; details: Details }>;
		mockPi.onCall({ output: "Original output still requires review." });
		const first = await execute("original-launch", {
			agent: "worker", task: "Produce the original result", async: true, context: "fresh",
			mission: { title: "Preserve per-run acceptance" }, output: path.join(tempDir, "original.md"),
			acceptance: { level: "attested", review: { required: true } },
		}, original);
		assert.notEqual(first.isError, true);
		const firstId = first.details.asyncId!;
		assert.ok(firstId);
		const firstPayload = await readAsyncPayload(firstId);
		await waitForAsyncState(firstId, status => status.state === "complete" && (status as { processTerminal?: { state?: string } }).processTerminal?.state === "observed");
		assert.equal(firstPayload.results[0]?.acceptance?.status, "review-required");
		syncMissionFromAsyncCompletion({ ...firstPayload, runId: firstId, asyncDir: first.details.asyncDir });
		const firstOutput = fs.readFileSync(path.join(tempDir, "original.md"));
		const sourceStatus = fs.readFileSync(path.join(first.details.asyncDir!, "status.json"));
		const sourceBinding = fs.readFileSync(path.join(first.details.asyncDir!, "mission.json"));
		const before = await execute("fresh-show", { action: "mission.show", missionId: first.details.missionId }, fresh);
		assert.equal(before.details.mission?.status, "waiting");
		assert.equal(before.details.mission?.ownerSessionId, original.getSessionFile());

		mockPi.onCall({ output: "Independent later result; not acceptance of the original." });
		const next = await execute("fresh-launch", {
			agent: "worker", task: "Produce independently authorized follow-up", async: true, context: "fresh",
			missionId: first.details.missionId, acceptance: false, output: path.join(tempDir, "continued.md"),
		}, fresh);
		assert.notEqual(next.isError, true);
		const nextId = next.details.asyncId!;
		assert.ok(nextId && nextId !== firstId);
		const nextPayload = await readAsyncPayload(nextId);
		await waitForAsyncState(nextId, status => status.state === "complete" && (status as { processTerminal?: { state?: string } }).processTerminal?.state === "observed");
		syncMissionFromAsyncCompletion({ ...nextPayload, runId: nextId, asyncDir: next.details.asyncDir });
		const shown = await execute("final-show", { action: "mission.show", missionId: first.details.missionId }, fresh);
		assert.equal(shown.details.mission?.status, "waiting");
		assert.equal(shown.details.mission?.ownerSessionId, original.getSessionFile());
		assert.deepEqual(shown.details.mission?.runs.map(run => [run.runId, run.acceptanceStatus]), [[firstId, "review-required"], [nextId, "not-required"]]);
		assert.equal(readMissionBinding(next.details.asyncDir!)?.missionId, first.details.missionId);
		assert.deepEqual(fs.readFileSync(path.join(tempDir, "original.md")), firstOutput);
		assert.deepEqual(fs.readFileSync(path.join(first.details.asyncDir!, "status.json")), sourceStatus);
		assert.deepEqual(fs.readFileSync(path.join(first.details.asyncDir!, "mission.json")), sourceBinding);
		assert.equal(mockPi.callCount(), 2, "two explicit launches only; reading does not replay either run");
	});
});
