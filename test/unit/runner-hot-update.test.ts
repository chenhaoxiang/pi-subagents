import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packedRunnerDir = process.env.PI_SUBAGENTS_TEST_PACKED_RUNNER_DIR;
const runnerDir = packedRunnerDir ?? fileURLToPath(new URL("../../src/runs/background/", import.meta.url));
const runnerExtension = packedRunnerDir ? ".js" : ".ts";
const runnerArgs = packedRunnerDir ? [] : ["--experimental-strip-types"];
const executionModule = new URL("../fixtures/runner-execution-marker.mjs", import.meta.url).href;

function runUpdatedRunner(entrypoint: string): void {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "runner-hot-update-"));
	try {
		const asyncDir = path.join(root, "run");
		const configPath = path.join(root, "async-cfg-hot-update.json");
		const token = "runner-instance-0701";
		fs.mkdirSync(asyncDir);
		// v0.70.1 tag 1ac7b5e: async-execution.ts spawns subagent-runner with
		// runnerProcessInstanceId=launchBarrierToken and a matching proceed control.
		fs.writeFileSync(configPath, JSON.stringify({
			id: "hot-update",
			steps: [{ agent: "worker", task: "synthetic", parentSessionId: "old-parent", cwd: root, inheritProjectContext: false, inheritGlobalContext: false, inheritSkills: false }],
			resultPath: path.join(root, "result.json"), cwd: root, asyncDir, placeholder: "{previous}",
			runnerProcessInstanceId: token, launchBarrierToken: token,
		}));
		fs.writeFileSync(path.join(asyncDir, "runner-startup-proceed.json"), JSON.stringify({ action: "proceed", token }));
		const result = spawnSync(process.execPath, [...runnerArgs, entrypoint, configPath], {
			cwd: root,
			env: { ...process.env, PI_SUBAGENTS_TEST_PARENT_PID: String(process.pid), PI_SUBAGENTS_TEST_RUNNER_EXECUTION_MODULE: executionModule },
			encoding: "utf8",
			timeout: 10_000,
		});
		assert.ifError(result.error);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(fs.existsSync(configPath), false, "runner must consume the parent's config file");
		assert.equal(fs.existsSync(path.join(asyncDir, "runner-startup-proceed.json")), false, "runner must consume startup authorization");
		assert.deepEqual(JSON.parse(fs.readFileSync(path.join(asyncDir, "execution-marker.json"), "utf8")), { id: "hot-update" });
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

test("a 0.70.1 parent can start the 0.71 runner path after an on-disk update", () => {
	// The parent has already loaded its old runner path; only the child reads the updated source.
	runUpdatedRunner(path.join(runnerDir, `subagent-runner${runnerExtension}`));
});

test("the current bootstrap entrypoint still starts one synthetic execution", () => {
	runUpdatedRunner(path.join(runnerDir, `subagent-runner-bootstrap${runnerExtension}`));
});

test("the legacy entrypoint fails visibly when its config cannot be read", () => {
	const missingConfig = path.join(os.tmpdir(), `missing-runner-config-${process.pid}.json`);
	const result = spawnSync(process.execPath, [...runnerArgs, path.join(runnerDir, `subagent-runner${runnerExtension}`), missingConfig], {
		cwd: os.tmpdir(),
		env: { ...process.env, PI_SUBAGENTS_TEST_PARENT_PID: String(process.pid) },
		encoding: "utf8",
		timeout: 10_000,
	});
	assert.ifError(result.error);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Subagent runner error:/);
});
