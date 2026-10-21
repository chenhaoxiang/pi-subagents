import assert from "node:assert/strict";
import { it } from "node:test";
import * as parentWakeModule from "../../src/shared/parent-wake.ts";
const { createParentWake } = parentWakeModule;
const supportsNativeCustomTurns = (version: string) => (parentWakeModule as unknown as { supportsNativeCustomTurns(version: string): boolean }).supportsNativeCustomTurns(version);

function harness() {
	const calls: unknown[][] = [];
	let idle = true;
	const manager = { getSessionId: () => "native-wake-session" };
	const pi = {
		sendMessage: (...args: unknown[]) => { calls.push(["custom", ...args]); },
		sendUserMessage: (...args: unknown[]) => { calls.push(["user", ...args]); },
	};
	const wake = createParentWake(pi as never, () => 0, true);
	wake.bindSession({ isIdle: () => idle, sessionManager: manager } as never);
	return { calls, wake, manager, pi, setIdle: (value: boolean) => { idle = value; } };
}

it("uses the native custom prompt lifecycle only on released Pi 1.2+ hosts", () => {
	for (const version of ["1.2.0", "1.2.0-fork.1", "1.3.0", "1.3.0-fork.1", "1.10.0", "2.0.0"]) assert.equal(supportsNativeCustomTurns(version), true, version);
	for (const version of ["0.87.0", "1.1.0-fork.1", "1.2.0-rc.1", "1.3.0-rc.1", "unknown", ""]) assert.equal(supportsNativeCustomTurns(version), false, version);
});

it("wakes once with the result itself, without inventing a human user prompt", () => {
	const { calls, wake } = harness();
	const first = { customType: "subagent-notify", content: "Saved result A", display: true };
	const second = { customType: "subagent-notify", content: "Saved result B", display: true };
	assert.equal(wake.sendMessage(first, { triggerTurn: true }), false);
	assert.equal(wake.sendMessage(second, { triggerTurn: true }), true);
	assert.deepEqual(calls, [["custom", first, { triggerTurn: true }], ["custom", second, { triggerTurn: false }]]);
	assert.equal(wake.isPending(), true);
	wake.agentStarted();
	assert.equal(wake.isPending(), false);
});

it("preserves abort holds, silent progress and busy-parent delivery", () => {
	const { calls, wake, setIdle } = harness();
	const message = { customType: "subagent_supervisor_request", content: "Decision needed", display: true };
	wake.userAborted();
	assert.equal(wake.sendMessage(message, { triggerTurn: true }), true);
	wake.agentStarted();
	setIdle(false);
	assert.equal(wake.sendMessage(message, { triggerTurn: true }), false);
	wake.sendMessage(message, { triggerTurn: false });
	assert.deepEqual(calls.map(call => call[2]), [{ triggerTurn: false }, { triggerTurn: true }, { triggerTurn: false }]);
	assert.ok(calls.every(call => call[0] === "custom"));
});

it("keeps native wake reservations across runtime replacement", () => {
	const { calls, wake, manager, pi } = harness();
	const message = { customType: "subagent-notify", content: "A result", display: true };
	wake.sendMessage(message, { triggerTurn: true });
	wake.sessionShutdown("reload");
	const replacement = createParentWake(pi as never, () => 0, true);
	replacement.bindSession({ isIdle: () => true, sessionManager: manager } as never);
	assert.equal(replacement.sendMessage(message, { triggerTurn: true }), true);
	assert.equal(calls.filter(call => (call[2] as { triggerTurn?: boolean })?.triggerTurn).length, 1);
});
