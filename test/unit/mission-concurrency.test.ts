import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import { createMission, listGlobalMissions, missionRecordPath, readMission, resolveMissionStoreLocation, updateMission } from "../../src/missions/store.ts";
import { writeMissionAsyncBinding } from "../../src/missions/lifecycle.ts";
import { tryLease } from "../../src/shared/file-lease.ts";

const helper = fileURLToPath(new URL("../support/mission-update-process.mjs", import.meta.url));
async function until(predicate: () => boolean) {
	const end = Date.now() + 15_000;
	while (!predicate()) { assert.ok(Date.now() < end, "fixture process deadline"); await new Promise(resolve => setTimeout(resolve, 10)); }
}
function fixture() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "mission-concurrency-"));
	const location = resolveMissionStoreLocation({ projectRoot: root, config: { directory: path.join(root, "missions"), globalIndexDir: path.join(root, "index") } });
	const mission = createMission(location, { title: "Synthetic concurrent updates", objective: "Preserve original facts", status: "active" });
	const children: Array<{ child: ReturnType<typeof spawn>; closed: Promise<number | null> }> = [];
	let seq = 0;
	function launch(config: Record<string, unknown>) {
		const file = path.join(root, `writer-${++seq}.json`);
		fs.writeFileSync(file, JSON.stringify({ location, missionId: mission.id, ...config }));
		const child = spawn(process.execPath, ["--experimental-strip-types", helper, file], { env: { ...process.env, HOME: root, PI_CODING_AGENT_DIR: path.join(root, "agent") }, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "", stderr = "";
		child.stdout!.on("data", bytes => { stdout += bytes; }); child.stderr!.on("data", bytes => { stderr += bytes; });
		const closed = new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
		children.push({ child, closed });
		return { child, closed, result: async () => { assert.equal(await closed, 0, stderr); return JSON.parse(stdout.trim()); } };
	}
	async function cleanup() {
		for (const { child, closed } of children) {
			if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
			await closed;
		}
		fs.rmSync(root, { recursive: true, force: true });
	}
	return { root, location, mission, launch, cleanup };
}

it("serializes two processes updating the same mission without losing runs or decisions", { timeout: 30_000 }, async () => {
	const h = fixture();
	try {
		const before = updateMission(h.location, h.mission.id, { addDecisions: [{ title: "A" }], addRuns: [{ runId: "run", mode: "single", status: "running" }] });
		const gate = path.join(h.root, "gate");
		const first = h.launch({ action: "update", gate, update: { resolveDecision: { id: before.decisions[0]!.id, resolution: "Synthetic A only" } } });
		await until(() => fs.existsSync(gate + ".ready"));
		const update = { addRuns: [{ runId: "run", mode: "single", status: "complete", acceptanceStatus: "review-required" }] };
		const second = await h.launch({ action: "update", update }).result();
		fs.writeFileSync(gate + ".release", "go");
		assert.equal((await first.result()).state, "written");
		// Busy is a proven pre-write failure, never an uncertain effect replay.
		if (second.state === "busy") assert.equal((await h.launch({ action: "update", update }).result()).state, "written");
		const after = readMission(h.location, h.mission.id);
		assert.equal(after.decisions[0]?.status, "resolved");
		assert.equal(after.runs[0]?.status, "complete", "another writer must not replace the completed run with its stale copy");
		assert.equal(after.runs[0]?.acceptanceStatus, "review-required");
		assert.equal(listGlobalMissions(h.location.globalIndexDir).entries[0]?.status, after.status);
	} finally { await h.cleanup(); }
});

it("computes a late completion's mission status from the locked current record", { timeout: 30_000 }, async () => {
	const h = fixture();
	try {
		const dirs = ["earlier", "continued"].map(id => path.join(h.root, id));
		for (const dir of dirs) { fs.mkdirSync(dir); writeMissionAsyncBinding(dir, { missionId: h.mission.id, location: h.location, autoCreated: false }); }
		updateMission(h.location, h.mission.id, { addRuns: [{ runId: "earlier", mode: "single", status: "running", asyncDir: dirs[0] }, { runId: "continued", mode: "single", status: "running", asyncDir: dirs[1] }] });
		const gate = path.join(h.root, "completion-gate");
		const event = { runId: "earlier", asyncDir: dirs[0], mode: "single", state: "complete", results: [{ acceptance: { status: "verified" } }] };
		const first = h.launch({ action: "complete", gate, event });
		await until(() => fs.existsSync(gate + ".ready"));
		const nextEvent = { runId: "continued", asyncDir: dirs[1], mode: "single", state: "complete", results: [{ acceptance: { status: "review-required" } }] };
		const second = await h.launch({ action: "complete", event: nextEvent }).result();
		fs.writeFileSync(gate + ".release", "go"); await first.result();
		if (second.state === "busy") await h.launch({ action: "complete", event: nextEvent }).result();
		const after = readMission(h.location, h.mission.id);
		assert.equal(after.status, "waiting", "a stale pre-lock status calculation cannot mark the mission completed");
		assert.deepEqual(after.runs.map(run => run.acceptanceStatus), ["verified", "review-required"]);
	} finally { await h.cleanup(); }
});

for (const status of ["completed", "failed", "cancelled"] as const) it(`preserves ${status} after a pre-existing failed launch resumes bookkeeping`, { timeout: 30_000 }, async () => {
	const h = fixture();
	try {
		const gate = path.join(h.root, "failure-gate");
		const oldFailure = h.launch({ action: "failed-launch", gate });
		await until(() => fs.existsSync(gate + ".ready"));
		const other = await h.launch({ action: "update", update: { addRuns: [{ runId: "new-run", mode: "single", status: "running" }], status, summary: "Explicit closure" } }).result();
		assert.equal(other.state, "written");
		fs.writeFileSync(gate + ".release", "go"); await oldFailure.result();
		const record = readMission(h.location, h.mission.id);
		assert.equal(record.status, status);
		assert.equal(record.summary, "Explicit closure");
	} finally { await h.cleanup(); }
});

it("keeps partially corrupt live lease identities unknown without entering a mutation", async () => {
	const h = fixture();
	try {
		const record = missionRecordPath(h.location, h.mission.id), lock = record + ".write-lock";
		for (const processStart of [null, 0, "", {}, [], "not-linux-ticks"]) {
			fs.mkdirSync(lock);
			fs.writeFileSync(path.join(lock, "owner.json"), JSON.stringify({ token: "synthetic-invalid-start", pid: process.pid, hostname: os.hostname(), processStart }));
			const before = fs.readFileSync(record); let entered = false;
			assert.throws(() => updateMission(h.location, h.mission.id, () => { entered = true; return { summary: "must not enter" }; }), /Timed out waiting/);
			assert.equal(entered, false);
			assert.deepEqual(fs.readFileSync(record), before);
			assert.equal(fs.existsSync(lock), true);
			assert.equal(fs.existsSync(lock + ".retired-synthetic-invalid-start"), false);
			fs.rmSync(lock, { recursive: true });
		}
	} finally { await h.cleanup(); }
});

it("recovers a proven dead record lease but never evicts an unknown owner by age", { timeout: 30_000 }, async () => {
	const h = fixture();
	try {
		const held = path.join(h.root, "held"); const owner = h.launch({ action: "hold-lock", held });
		await until(() => fs.existsSync(held)); owner.child.kill("SIGKILL"); await owner.closed;
		assert.equal(updateMission(h.location, h.mission.id, { summary: "Recovered only this dead writer lease" }).summary, "Recovered only this dead writer lease");
		const recordPath = missionRecordPath(h.location, h.mission.id); const lock = recordPath + ".write-lock";
		assert.equal(fs.existsSync(lock), false, "dead owner lease is recovered and our completed write releases its own lease");
		fs.mkdirSync(lock); fs.writeFileSync(path.join(lock, "owner.json"), "{broken");
		fs.utimesSync(lock, new Date(0), new Date(0)); const before = fs.readFileSync(recordPath);
		assert.throws(() => updateMission(h.location, h.mission.id, { summary: "Must not write" }), /Timed out waiting for another process/);
		assert.deepEqual(fs.readFileSync(recordPath), before);
		assert.equal(fs.existsSync(lock), true);
	} finally { await h.cleanup(); }
});

it("keeps no-op transactions byte-stable and skips busy records during retention", async () => {
	const h = fixture();
	try {
		const recordPath = missionRecordPath(h.location, h.mission.id);
		const before = fs.readFileSync(recordPath);
		assert.deepEqual(updateMission(h.location, h.mission.id, () => undefined), h.mission);
		assert.deepEqual(fs.readFileSync(recordPath), before);
		updateMission(h.location, h.mission.id, { status: "completed" });
		const release = tryLease(recordPath + ".write-lock");
		assert.ok(release);
		try {
			createMission(h.location, { title: "Other", objective: "Keep the held terminal original" }, new Date(), 0);
			assert.equal(fs.existsSync(recordPath), true);
			let called = false;
			assert.throws(() => updateMission(h.location, h.mission.id, () => { called = true; return { summary: "No effect on busy" }; }), /Timed out waiting/);
			assert.equal(called, false, "busy means the mutation callback was never entered");
		} finally { release(); }
		createMission(h.location, { title: "After release", objective: "Retain ordinary pruning" }, new Date(), 0);
		assert.equal(fs.existsSync(recordPath), false);
	} finally { await h.cleanup(); }
});
