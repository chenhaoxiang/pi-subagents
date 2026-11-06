import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { it, type TestContext } from "node:test";
import { handleMissionAction } from "../../src/missions/actions.ts";
import { attachMissionToLaunchResult, prepareMissionLaunch, readMissionBinding, syncMissionFromAsyncCompletion } from "../../src/missions/lifecycle.ts";
import { readMission, updateMission } from "../../src/missions/store.ts";

function fixture(t: TestContext, automatic = false) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "mission-binding-"));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const projectRoot = path.join(root, "project");
	const asyncDir = path.join(root, "run");
	fs.mkdirSync(projectRoot);
	fs.mkdirSync(asyncDir);
	const config = { directory: ".pi/subagents/missions", globalIndexDir: path.join(root, "index") };
	const ctx = { cwd: projectRoot, config };
	const binding = prepareMissionLaunch({
		params: { task: "Review this result", ...(automatic ? {} : { mission: { title: "Requested review" } }) },
		projectRoot, config, ownerSessionId: "original-owner",
	});
	assert.ok(binding);
	attachMissionToLaunchResult({ binding, result: {
		content: [{ type: "text", text: "Started" }],
		details: { mode: "single", runId: "run-1", asyncId: "run-1", asyncDir, results: [] },
	} });
	const bindingPath = path.join(asyncDir, "mission.json");
	const finish = (state = "complete", acceptance: string | undefined = "review-required") => fs.writeFileSync(
		path.join(asyncDir, "status.json"),
		JSON.stringify({ state, steps: acceptance ? [{ acceptance: { status: acceptance } }] : [] }),
	);
	const show = () => handleMissionAction("mission.show", { missionId: binding.missionId }, ctx).details!.mission!;
	return { root, asyncDir, bindingPath, binding, ctx, finish, show };
}

for (const source of ["missing-file", "missing-autoCreated", "explicit-request", "foreign-mission", "foreign-store", "foreign-project", "automatic"] as const) {
	it(`mission.show requires a matching explicit automatic binding: ${source}`, (t) => {
		const h = fixture(t, source !== "explicit-request");
		const persisted = JSON.parse(fs.readFileSync(h.bindingPath, "utf-8"));
		if (source === "missing-file") fs.rmSync(h.bindingPath);
		else {
			if (source === "missing-autoCreated") delete persisted.autoCreated;
			if (source === "foreign-mission") persisted.missionId = "another-mission";
			if (source === "foreign-store") persisted.missionDir = path.join(h.root, "another-store");
			if (source === "foreign-project") persisted.projectRoot = path.join(h.root, "another-project");
			fs.writeFileSync(h.bindingPath, JSON.stringify(persisted));
		}
		h.finish();
		const shown = h.show();
		assert.equal(shown.status, source === "automatic" ? "completed" : "waiting");
		assert.equal(shown.ownerSessionId, "original-owner");
		assert.equal(shown.runs[0]?.acceptanceStatus, "review-required");
		assert.deepEqual(h.show(), shown, "unchanged reads preserve the record");
	});
}

it("a manually attached run without mission.json cannot bypass review", (t) => {
	const h = fixture(t);
	fs.rmSync(h.bindingPath);
	handleMissionAction("mission.attach-run", { missionId: h.binding.missionId, runId: "manual", dir: h.asyncDir, runStatus: "running" }, h.ctx);
	h.finish();
	assert.equal(h.show().status, "waiting");
});

it("one automatic binding cannot accept an unbound foreground run", (t) => {
	const h = fixture(t, true);
	updateMission(h.binding.location, h.binding.missionId, { addRuns: [{ runId: "foreground", mode: "single", status: "completed", acceptanceStatus: "review-required" }] });
	h.finish("complete", "verified");
	assert.equal(h.show().status, "waiting");
});

it("one automatic binding cannot accept another async run with missing provenance", (t) => {
	const h = fixture(t, true);
	const otherDir = path.join(h.root, "other-run");
	fs.mkdirSync(otherDir);
	fs.writeFileSync(path.join(otherDir, "status.json"), JSON.stringify({ state: "complete", steps: [{ acceptance: { status: "review-required" } }] }));
	handleMissionAction("mission.attach-run", { missionId: h.binding.missionId, runId: "other", dir: otherDir, runStatus: "running" }, h.ctx);
	h.finish("complete", "verified");
	assert.equal(h.show().status, "waiting");
});

it("a binding without autoCreated is not an acceptance exemption in completion events", (t) => {
	const h = fixture(t, true);
	const persisted = JSON.parse(fs.readFileSync(h.bindingPath, "utf-8"));
	delete persisted.autoCreated;
	fs.writeFileSync(h.bindingPath, JSON.stringify(persisted));
	assert.equal(readMissionBinding(h.asyncDir)?.autoCreated, false);
	const result = syncMissionFromAsyncCompletion({ runId: "run-1", asyncDir: h.asyncDir, state: "complete", results: [{ acceptance: { status: "review-required" } }] });
	assert.equal(result?.status, "waiting");
});

for (const terminal of ["completed", "failed", "cancelled"] as const) {
	it(`explicit ${terminal} remains terminal without a binding`, (t) => {
		const h = fixture(t);
		fs.rmSync(h.bindingPath);
		handleMissionAction("mission.close", { missionId: h.binding.missionId, missionStatus: terminal }, h.ctx);
		h.finish();
		const shown = h.show();
		assert.equal(shown.status, terminal);
		assert.equal(shown.ownerSessionId, "original-owner");
		assert.equal(shown.runs[0]?.acceptanceStatus, "review-required");
	});
}

it("missing provenance does not invent a review requirement when none was recorded", (t) => {
	const h = fixture(t);
	fs.rmSync(h.bindingPath);
	h.finish("complete", "");
	assert.equal(h.show().status, "completed");
});

for (const state of ["failed", "unknown"] as const) {
	it(`missing provenance preserves ${state} execution evidence`, (t) => {
		const h = fixture(t);
		fs.rmSync(h.bindingPath);
		h.finish(state);
		const shown = h.show();
		assert.equal(shown.status, state === "failed" ? "failed" : "active");
		assert.equal(shown.runs[0]?.status, state);
	});
}

for (const first of ["missing-file", "missing-autoCreated", "explicit-request"] as const) {
	it(`reads malformed bindings even after ${first} provenance`, (t) => {
		const h = fixture(t);
		if (first === "missing-file") fs.rmSync(h.bindingPath);
		if (first === "missing-autoCreated") {
			const persisted = JSON.parse(fs.readFileSync(h.bindingPath, "utf-8"));
			delete persisted.autoCreated;
			fs.writeFileSync(h.bindingPath, JSON.stringify(persisted));
		}
		const otherDir = path.join(h.root, "malformed-run");
		fs.mkdirSync(otherDir);
		fs.writeFileSync(path.join(otherDir, "mission.json"), "{broken");
		fs.writeFileSync(path.join(otherDir, "status.json"), JSON.stringify({ state: "complete", steps: [] }));
		handleMissionAction("mission.attach-run", { missionId: h.binding.missionId, runId: "malformed", dir: otherDir, runStatus: "running" }, h.ctx);
		h.finish("complete", "");
		const before = readMission(h.binding.location, h.binding.missionId);
		assert.throws(h.show, /Invalid mission binding file/);
		assert.deepEqual(readMission(h.binding.location, h.binding.missionId), before);
	});
}

it("malformed binding remains an error, not successful completion", (t) => {
	const h = fixture(t);
	fs.writeFileSync(h.bindingPath, "{broken");
	h.finish();
	const before = readMission(h.binding.location, h.binding.missionId);
	assert.throws(h.show, /Invalid mission binding file/);
	assert.deepEqual(readMission(h.binding.location, h.binding.missionId), before);
});
