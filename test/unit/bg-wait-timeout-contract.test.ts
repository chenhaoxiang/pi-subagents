import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createChildSafeState } from "../../src/extension/fanout-child.ts";
import { SubagentWaitParams as WaitSchema } from "../../src/extension/schemas.ts";
import { resolveWaitToolConfig, waitForSubagents, type SubagentWaitDeps } from "../../src/runs/background/subagent-wait.ts";
import { registerWaitTool } from "../../src/runs/background/wait-tool.ts";
import type { Details } from "../../src/shared/types.ts";

const ONE_HOUR_MS = 60 * 60 * 1_000;

interface WaitFixture { root: string; deps: SubagentWaitDeps }

function fixture(): WaitFixture {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-wait-timeout-contract-"));
	const state = createChildSafeState();
	state.baseCwd = root;
	state.currentSessionId = "wait-contract-session";
	state.foregroundRuns?.set("detached-run", {
		runId: "detached-run",
		mode: "single",
		cwd: root,
		sessionId: "wait-contract-session",
		updatedAt: 1_000,
		children: [{ agent: "worker", index: 0, status: "detached" }],
	});
	return { root, deps: { state, asyncDirRoot: path.join(root, "runs"), resultsDir: path.join(root, "results") } };
}

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content.map((entry) => entry.text ?? "").join("\n");
}

describe("bg_wait timeout contract", () => {
	it("uses an unconfigured 60-minute subscription window and never blocks", async (t) => {
		const { root, deps } = fixture();
		t.after(() => fs.rmSync(root, { recursive: true, force: true }));
		let armed: Parameters<NonNullable<SubagentWaitDeps["subscribe"]>>[0] | undefined;
		const result = await waitForSubagents({ id: "detached", nonBlocking: true }, undefined, {
			...deps,
			sleep: async () => { throw new Error("a subscription must not block"); },
			subscribe: (input) => {
				armed = input;
				return { token: "default-window", expiresAt: ONE_HOUR_MS + 1_000 };
			},
		});
		assert.equal(result.isError, undefined);
		assert.equal(armed?.timeoutMs, ONE_HOUR_MS);
		assert.equal(armed?.runId, "detached-run");
		assert.match(textOf(result), /Subscription window:/);
	});

	it("uses an unconfigured 60-minute blocking window with a synthetic clock", async (t) => {
		const { root, deps } = fixture();
		t.after(() => fs.rmSync(root, { recursive: true, force: true }));
		let clock = 1_000;
		const result = await waitForSubagents({ id: "detached-run" }, undefined, {
			...deps,
			now: () => clock,
			pollIntervalMs: ONE_HOUR_MS / 4,
			sleep: async (ms) => { clock += ms; },
		});
		assert.equal(result.isError, undefined);
		assert.equal(clock, ONE_HOUR_MS + 1_000);
		assert.equal(result.details.wait?.reason, "window_elapsed");
		assert.deepEqual(result.details.wait?.activeRunIds, ["detached-run"]);
		assert.equal(deps.state.foregroundRuns?.get("detached-run")?.children[0]?.status, "detached");
	});

	for (const timeoutMs of [1_000, ONE_HOUR_MS]) {
		it(`rejects nonBlocking + timeoutMs=${timeoutMs} before arming any subscription`, async (t) => {
			const { root, deps } = fixture();
			t.after(() => fs.rmSync(root, { recursive: true, force: true }));
			let arms = 0;
			const result = await waitForSubagents({
				id: "detached-run", nonBlocking: true, all: false, timeoutMs, stopOnAttention: true,
			}, undefined, {
				...deps,
				sleep: async () => { throw new Error("invalid subscriptions must not block"); },
				subscribe: () => { arms++; return { token: "must-not-arm", expiresAt: 0 }; },
			});
			assert.equal(result.isError, true);
			assert.match(textOf(result), /timeoutMs.*blocking waits/);
			assert.match(textOf(result), /Omit timeoutMs/);
			assert.equal(arms, 0);
		});
	}

	it("preserves configured and environment subscription windows", async (t) => {
		const { root, deps } = fixture();
		t.after(() => fs.rmSync(root, { recursive: true, force: true }));
		for (const config of [
			resolveWaitToolConfig({ defaultTimeoutMs: 120_000 }, {}),
			resolveWaitToolConfig({ defaultTimeoutMs: 120_000 }, { PI_SUBAGENT_WAIT_TOOL_DEFAULT_TIMEOUT_MS: "240000" }),
		]) {
			let armedMs: number | undefined;
			const result = await waitForSubagents({ id: "detached-run", nonBlocking: true }, undefined, {
				...deps,
				defaultTimeoutMs: config.defaultTimeoutMs,
				subscribe: (input) => { armedMs = input.timeoutMs; return { token: "configured-window", expiresAt: input.timeoutMs }; },
			});
			assert.equal(result.isError, undefined);
			assert.equal(armedMs, config.defaultTimeoutMs);
		}
	});

	it("preserves explicit short blocking windows over configured defaults", async (t) => {
		const { root, deps } = fixture();
		t.after(() => fs.rmSync(root, { recursive: true, force: true }));
		let clock = 1_000;
		const result = await waitForSubagents({ id: "detached-run", nonBlocking: false, timeoutMs: 1_000 }, undefined, {
			...deps, defaultTimeoutMs: ONE_HOUR_MS, now: () => clock, pollIntervalMs: 1_000,
			sleep: async (ms) => { clock += ms; },
		});
		assert.equal(result.details.wait?.reason, "window_elapsed");
		assert.equal(clock, 2_000);
	});

	it("enforces the contract through the registered tool and explains the correct call", async (t) => {
		const { root, deps } = fixture();
		t.after(() => fs.rmSync(root, { recursive: true, force: true }));
		let registered: ToolDefinition<typeof WaitSchema, Details> | undefined;
		let arms = 0;
		// SAFETY: registration only reads events.on and registerTool from this injected API.
		const api = {
			on() { return () => {}; },
			events: { on() { return () => {}; } },
			registerTool(tool: ToolDefinition<typeof WaitSchema, Details>) { registered = tool; },
		} as ExtensionAPI;
		registerWaitTool(api, deps.state, true, {
			arm() { arms++; return { token: "must-not-arm", expiresAt: 0 }; },
		});
		assert.ok(registered);
		// SAFETY: the registered wait executor only reads hasUI from its host context.
		const ctx = { hasUI: true } as ExtensionContext;
		await assert.rejects(
			registered.execute("wait", { id: "detached-run", nonBlocking: true, timeoutMs: 1_000 }, undefined, undefined, ctx),
			/timeoutMs.*blocking waits/,
		);
		assert.equal(arms, 0);
		assert.match(registered.description, /cannot be combined with.*timeoutMs/);
		assert.match(registered.description, /60 minutes/);
		const schema = WaitSchema;
		assert.match(schema.properties.nonBlocking?.description ?? "", /cannot be combined with.*timeoutMs/);
		assert.match(schema.properties.timeoutMs?.description ?? "", /blocking waits only/i);
		assert.match(schema.properties.timeoutMs?.description ?? "", /3600000/);
	});
});
