import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { inspectSubagentStatus } from "../../src/runs/background/run-status.ts";
import { DIRS, type AsyncStatus, type Details, type ProcessTerminal } from "../../src/shared/types.ts";
import { createMockPi } from "../support/mock-pi.ts";

type ToolResult = AgentToolResult<Details>;
type HostIdentity = { sessionId: string; sessionFile: string; header: { id: string }; pid: number };
type HostSnapshot = {
	sent: Array<{ message: { customType?: string; details?: { runs?: Array<{ runId?: string }> } } }>;
	staleSends: unknown[];
	shutdownAt?: number;
};
type PublishedResult = Pick<AsyncStatus, "sessionId" | "completionOwnerId" | "completionOwnerProcess"> & {
	success: boolean;
	results: Array<{ output?: string; acceptance?: { status: string }; artifactPaths?: { outputPath?: string } }>;
};

// These files are produced by the package and the scripted test host, never real user sessions.
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;
const text = (result: ToolResult): string => result.content.flatMap((item) => item.type === "text" ? [item.text] : []).join("\n");
const hash = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const notices = (snapshot: HostSnapshot) => snapshot.sent.filter((entry) => entry.message.customType === "subagent-notify");

async function until<T>(label: string, readValue: () => T | Promise<T>, predicate: (value: T) => boolean): Promise<T> {
	const deadline = Date.now() + 30_000;
	for (;;) {
		const value = await readValue();
		if (predicate(value)) return value;
		assert.ok(Date.now() < deadline, `Timed out waiting for ${label}`);
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

function host(cwd: string, agentDir: string) {
	const child: ChildProcess = fork(fileURLToPath(new URL("../support/parent-result-continuity-host.mjs", import.meta.url)), [cwd, agentDir], {
		execArgv: ["--experimental-strip-types", "--import", new URL("../support/register-loader.mjs", import.meta.url).href],
		stdio: ["ignore", "pipe", "pipe", "ipc"],
	});
	let log = "";
	let sequence = 0;
	child.stdout!.on("data", (chunk) => { log += String(chunk); });
	child.stderr!.on("data", (chunk) => { log += String(chunk); });
	const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
	child.on("message", (raw: unknown) => {
		const message = raw as { id: number; error?: string; value?: unknown };
		const request = pending.get(message.id);
		if (!request) return;
		pending.delete(message.id);
		if (message.error) request.reject(new Error(`${message.error}\n${log}`));
		else request.resolve(message.value);
	});
	child.on("error", (error) => {
		for (const request of pending.values()) request.reject(error);
		pending.clear();
	});
	const exited = new Promise<void>((resolve) => child.once("exit", (code, signal) => {
		for (const request of pending.values()) request.reject(new Error(`Test host exited: ${code}/${signal}\n${log}`));
		pending.clear();
		resolve();
	}));
	const waitForExit = async () => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([exited, new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => reject(new Error(`Test host exit timed out\n${log}`)), 5_000);
			})]);
		} finally {
			clearTimeout(timer);
		}
	};
	const request = <T = HostSnapshot>(action: string, input: Record<string, unknown> = {}): Promise<T> => new Promise((resolve, reject) => {
		if (!child.connected) { reject(new Error(`Test host IPC is closed\n${log}`)); return; }
		const id = ++sequence;
		const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Test host ${action} timed out\n${log}`)); }, action === "exit" ? 5_000 : 30_000);
		pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value as T); }, reject: (error) => { clearTimeout(timer); reject(error); } });
		child.send({ id, action, ...input }, (error) => {
			if (!error) return;
			pending.get(id)?.reject(error);
			pending.delete(id);
		});
	});
	return {
		request,
		call: (params: Record<string, unknown>, tool = "subagent") => request<ToolResult>("call", { tool, params }),
		log: () => log,
		async exit() {
			if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
			try {
				await request("exit");
				await waitForExit();
			} finally {
				if (child.exitCode === null && child.signalCode === null) {
					// Only this fixture's ChildProcess handle is eligible for forced cleanup.
					child.kill("SIGKILL");
					await waitForExit();
				}
			}
		},
	};
}

for (const { outcome, exitOwner } of [
	{ outcome: "complete", exitOwner: true },
	{ outcome: "failed", exitOwner: true },
	{ outcome: "complete", exitOwner: false },
] as const) {
	it(`reads the original ${outcome} single-async result after parent ${exitOwner ? "process exit" : "session shutdown"} without takeover or relaunch`, { timeout: 120_000 }, async (t) => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-"));
		const cwd = path.join(root, "project");
		const agentDir = path.join(root, "agent");
		const release = path.join(root, "release-child");
		fs.mkdirSync(cwd);
		fs.mkdirSync(path.join(agentDir, "agents"), { recursive: true });
		fs.writeFileSync(path.join(agentDir, "agents", "continuity-probe.md"), "---\nname: continuity-probe\ndescription: Scripted continuity probe\ntools: read\n---\nReturn the synthetic evidence.\n");
		fs.mkdirSync(path.join(agentDir, "extensions", "subagent"), { recursive: true });
		fs.writeFileSync(path.join(agentDir, "extensions", "subagent", "config.json"), JSON.stringify({
			toolActivation: "eager", completionBatch: { enabled: false }, intercomBridge: { mode: "off" },
		}));
		const mock = createMockPi();
		const output = `Original ${outcome} evidence; not business approval.`;
		let owner: ReturnType<typeof host> | undefined;
		let fresh: ReturnType<typeof host> | undefined;
		let reopened: ReturnType<typeof host> | undefined;
		let runId: string | undefined;
		// Keep a snapshot of the scripted queue before its fixture cleanup. With an explicit temp root,
		// the runtime artifacts and every phase response below remain available for independent review.
		const save = <T>(name: string, value: T): T => { fs.writeFileSync(path.join(root, `${name}.json`), JSON.stringify(value, null, 2)); return value; };
		const refused = async (name: string, call: Promise<unknown>, pattern: RegExp) => {
			await assert.rejects(call, (error: Error) => { save(name, { error: error.message }); assert.match(error.message, pattern); return true; });
		};
		let scenarioFailed = false;
		try {
			mock.install();
			mock.onCall({ waitForPath: release, output, ...(outcome === "failed" ? { exitCode: 1, stderr: "scripted child failure" } : {}) });
			owner = host(cwd, agentDir);
			const identity = save("owner", await owner.request<HostIdentity>("start"));
			const reload = save("reload", await owner.request<HostIdentity>("reload"));
			assert.equal(reload.sessionId, identity.sessionId, "reload keeps the same session header");
			assert.equal(reload.sessionFile, identity.sessionFile);
			const launch = save("launch", await owner.call({
				agent: "continuity-probe", task: "Produce the original evidence once.", async: true,
				options: { mission: { title: "Parent result continuity" }, acceptance: { level: "attested", review: { required: true } } },
			}));
			assert.notEqual(launch.isError, true, text(launch));
			runId = launch.details.asyncId;
			assert.ok(runId);
			assert.ok(launch.details.missionId);
			const asyncDir = launch.details.asyncDir;
			assert.ok(asyncDir);
			const statusPath = path.join(asyncDir, "status.json");
			const resultPath = path.join(DIRS.results, `${runId}.json`);
			await until("the original child prompt", () => mock.callCount(), (count) => count === 1);
			const active = save("active-status", read<AsyncStatus>(statusPath));
			assert.equal(active.state, "running");
			assert.equal(active.sessionId, identity.sessionFile);
			assert.equal(active.completionOwnerProcess?.pid, identity.pid, "ownership must come from the native launch, not a test patch");
			await refused("live-resume-refused", owner.call({ action: "resume", id: runId, message: "Must not duplicate a live child" }), /still running/);
			const shutdown = save("shutdown", await owner.request("shutdown"));
			assert.equal(notices(shutdown).length, 0);
			if (exitOwner) await owner.exit();

			fresh = host(cwd, agentDir);
			const observer = save("fresh", await fresh.request<HostIdentity>("start"));
			assert.notEqual(observer.pid, identity.pid);
			assert.notEqual(observer.header.id, identity.header.id, "fresh manager must have a genuinely new header");
			const activeRead = save("fresh-active-status", await fresh.call({ action: "status", id: runId }));
			assert.notEqual(activeRead.isError, true, text(activeRead));
			assert.match(text(activeRead), /State: running/);
			assert.equal(activeRead.details.recovery?.reason, "foreign_session");
			const waiting = save("fresh-bg-wait", await fresh.call({ id: runId, timeoutMs: 1 }, "bg_wait"));
			assert.match(text(waiting), /No active run matched/);

			// Exercise the existing liveness-probe seam on the real launch artifacts. No status,
			// ownership or process-terminal field is fabricated to simulate the inaccessible boundary.
			const unknown = save("unknown-reconcile", inspectSubagentStatus({ action: "reconcile", id: runId }, {
				kill: () => { throw Object.assign(new Error("test-only inaccessible PID boundary"), { code: "EPERM" }); },
			}));
			assert.equal(unknown.details.recovery?.state, "unknown");
			assert.equal(unknown.details.recovery?.action, "reconcile");
			assert.equal(read<AsyncStatus>(statusPath).state, "running");
			assert.equal(mock.callCount(), 1);
			await refused("fresh-resume-refused", fresh.call({ action: "resume", id: runId, message: "Must not take over the old child" }), /not found in the active session/);

			fs.writeFileSync(release, "finish the original child");
			await until("the original result", () => fs.existsSync(resultPath), Boolean);
			const preservedResult = path.join(root, "original-result.json");
			fs.copyFileSync(resultPath, preservedResult);
			const payload = read<PublishedResult>(preservedResult);
			assert.equal(payload.success, outcome === "complete");
			assert.equal(payload.sessionId, identity.sessionFile);
			assert.equal(payload.completionOwnerId, active.completionOwnerId);
			assert.equal(payload.completionOwnerProcess?.pid, identity.pid);
			assert.equal(payload.results.length, 1);
			const child = payload.results[0];
			assert.ok(child);
			assert.equal(child.output, output);
			assert.equal(child.acceptance?.status, "review-required");
			const report = child.artifactPaths?.outputPath;
			assert.ok(report);
			assert.equal(fs.readFileSync(report, "utf8").trim(), output);
			const originalHash = hash(report);
			const resultHash = hash(resultPath);
			assert.equal(hash(preservedResult), resultHash, "preserve the exact delivery envelope before the owner can retire it");
			const settled = save("settled-status", await until("the original terminal status", () => read<AsyncStatus>(statusPath),
				(status) => status.state === outcome && typeof status.endedAt === "number"));
			assert.equal(settled.state, outcome);
			assert.ok(settled.endedAt! >= shutdown.shutdownAt!, "the child must finish after parent shutdown");
			if (!exitOwner) await until("the still-live host's runner close observer", () => read<ProcessTerminal>(path.join(asyncDir, "process-terminal.json")), (proof) => proof.state === "observed");
			const descriptorHash = hash(path.join(asyncDir, "recovery-descriptor.json"));
			const bindingHash = hash(path.join(asyncDir, "mission.json"));
			const terminalRead = save("fresh-terminal-status", await fresh.call({ action: "status", id: runId }));
			assert.match(text(terminalRead), new RegExp(`State: ${outcome}`));
			assert.ok(text(terminalRead).includes(`Result: ${resultPath}`));
			const reconciled = save("fresh-terminal-reconcile", await fresh.call({ action: "reconcile", id: runId }));
			assert.notEqual(reconciled.isError, true, text(reconciled));
			assert.match(text(reconciled), new RegExp(`State: ${outcome}`));
			assert.ok(text(reconciled).includes(`Result: ${resultPath}`));
			assert.equal(reconciled.details.recovery?.reason, "foreign_session");
			assert.equal(reconciled.details.lifecycleStatus?.processTerminal?.state, exitOwner ? "pending" : "observed", "session shutdown keeps the host close observer; process exit loses it");
			const mission = save("fresh-mission-show", await fresh.call({ action: "mission.show", options: { missionId: launch.details.missionId } }));
			assert.equal(mission.details.mission?.ownerSessionId, identity.sessionFile);
			assert.equal(mission.details.mission?.status, outcome === "complete" ? "waiting" : "failed");
			assert.deepEqual(mission.details.mission?.runs.map((run) => run.runId), [runId]);
			await refused("fresh-transcript-refused", fresh.call({ action: "status", id: runId, options: { view: "transcript" } }), /only available.*owned by the current session/);
			await refused("fresh-terminal-resume-refused", fresh.call({ action: "resume", id: runId, message: "Do not revive this foreign terminal run" }), /not found in the active session/);
			assert.equal(hash(resultPath), resultHash, "foreign observation cannot acknowledge or rewrite delivery");
			const freshSnapshot = save("fresh-notifications", await fresh.request("snapshot"));
			assert.equal(notices(freshSnapshot).length, 0, "fresh ownership does not steal the old completion wake");
			assert.deepEqual(freshSnapshot.staleSends, []);
			if (!exitOwner) {
				const lateOwner = save("shutdown-owner-after-completion", await owner.request("snapshot"));
				assert.equal(notices(lateOwner).length, 0, "shutdown cannot deliver the late result");
				assert.deepEqual(lateOwner.staleSends, [], "disposed callbacks cannot send into the old context");
				await owner.exit();
			}

			// A returning old owner opens the original session, not the fresh header. Its ordinary
			// notifier may retire the delivery envelope; the original output remains unchanged.
			reopened = host(cwd, agentDir);
			const returned = save("reopened-owner", await reopened.request<HostIdentity>("start", { sessionFile: identity.sessionFile }));
			assert.equal(returned.header.id, identity.header.id);
			const delivered = await until("the reopened owner's notification", () => reopened!.request("snapshot"), (value) => notices(value).length === 1);
			save("reopened-notification", delivered);
			assert.equal(notices(delivered)[0]?.message.details?.runs?.[0]?.runId, runId);
			await reopened.request("reload");
			assert.equal(notices(await reopened.request("snapshot")).length, 1, "reload cannot deliver a duplicate notice");
			const afterOwner = save("fresh-after-owner-return", await fresh.call({ action: "status", id: runId }));
			assert.match(text(afterOwner), new RegExp(`State: ${outcome}`));
			const outputLog = text(afterOwner).split("\n").find((line) => line.startsWith("Output: "))?.slice("Output: ".length);
			assert.ok(outputLog);
			assert.ok(fs.readFileSync(outputLog, "utf8").includes(output));
			assert.equal(hash(report), originalHash);
			assert.equal(read<AsyncStatus>(statusPath).sessionId, identity.sessionFile);
			assert.equal(read<AsyncStatus>(statusPath).completionOwnerId, active.completionOwnerId);
			assert.deepEqual(read<AsyncStatus>(statusPath).steps?.[0]?.acceptance, settled.steps?.[0]?.acceptance);
			assert.equal(hash(path.join(asyncDir, "recovery-descriptor.json")), descriptorHash, "observation cannot rewrite the retained launch contract");
			assert.equal(hash(path.join(asyncDir, "mission.json")), bindingHash, "observation cannot rebind the mission");
			assert.equal(mock.callCount(), 1, "all reads, reloads, refused resumes and owner return must keep one child invocation");
			const scenarioOwners = new Set([identity.sessionFile, observer.sessionFile]);
			const scenarioRuns = fs.readdirSync(DIRS.async).filter((entry) => {
				const statusFile = path.join(DIRS.async, entry, "status.json");
				try {
					const status = read<AsyncStatus>(statusFile);
					return status.sessionId !== undefined && scenarioOwners.has(status.sessionId);
				} catch (error) {
					if (entry !== runId && (error as NodeJS.ErrnoException).code === "ENOENT") return false;
					throw error;
				}
			});
			assert.deepEqual(scenarioRuns, [runId], "no replacement run may be allocated under either session owner");
			save("summary", { runId, missionId: launch.details.missionId, report, outputSha256: originalHash, resultSha256: resultHash, childLaunches: mock.callCount(), processTerminal: reconciled.details.lifecycleStatus?.processTerminal, outcome, exitOwner });
			t.diagnostic(`Continuity artifacts: ${root}`);
		} catch (error) {
			scenarioFailed = true;
			throw error;
		} finally {
			const cleanupErrors: unknown[] = [];
			try {
				try { fs.writeFileSync(release, "test cleanup: release only this scripted child"); }
				catch (error) { cleanupErrors.push(error); }
				const exits = await Promise.allSettled([owner, fresh, reopened].map((runtime) => runtime?.exit()));
				for (const exit of exits) if (exit.status === "rejected") cleanupErrors.push(exit.reason);
				try { fs.writeFileSync(path.join(root, "hosts.log"), [owner?.log() ?? "", fresh?.log() ?? "", reopened?.log() ?? ""].join("\n")); }
				catch (error) { cleanupErrors.push(error); }
				try { fs.cpSync(mock.dir, path.join(root, "scripted-queue"), { recursive: true }); }
				catch (error) { cleanupErrors.push(error); }
			} finally {
				try { mock.uninstall(); }
				catch (error) { cleanupErrors.push(error); }
			}
			if (cleanupErrors.length) {
				if (!scenarioFailed) throw new AggregateError(cleanupErrors, "Continuity fixture cleanup failed");
				for (const error of cleanupErrors) t.diagnostic(`Continuity fixture cleanup failed after the scenario error: ${String(error)}`);
			}
		}
	});
}
