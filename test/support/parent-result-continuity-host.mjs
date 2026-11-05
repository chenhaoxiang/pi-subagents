// Synthetic extension host for parent-result-continuity.test.ts. The session manager,
// public tool registration and package lifecycle are real; no parent/provider turn runs.
import assert from "node:assert/strict";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import registerSubagentExtension from "../../src/extension/index.ts";
import { setChildSessionFactory, setChildSessionFactoryModule } from "../../src/runs/shared/child-session.ts";
import { createFakeChildSessions } from "./fake-child-session.ts";
import { createEventBus, makeMinimalCtx } from "./helpers.ts";

const [cwd, agentDir] = process.argv.slice(2);
assert.ok(process.env.PI_SUBAGENTS_TEST_LOADER, "run with the isolated test loader");
assert.ok(process.env.MOCK_PI_QUEUE_DIR, "scripted child queue is required");
process.env.PI_CODING_AGENT_DIR = agentDir;
setChildSessionFactory(createFakeChildSessions(() => process.env.MOCK_PI_QUEUE_DIR).factory);
setChildSessionFactoryModule(fileURLToPath(new URL("./runner-child-session-factory.ts", import.meta.url)));

let manager;
let runtime;
const sent = [];
const staleSends = [];

async function start(reason, sessionFile) {
	if (reason !== "reload") {
		manager = sessionFile ? SessionManager.open(sessionFile) : SessionManager.create(cwd, path.join(agentDir, "sessions"));
		if (!sessionFile) manager.appendMessage({ role: "user", content: "Continue the synthetic authorized task.", timestamp: Date.now() });
	}
	const handlers = new Map();
	const tools = new Map();
	let stale = false;
	const pi = new Proxy({
		events: createEventBus(),
		on(event, handler) { handlers.set(event, [...(handlers.get(event) ?? []), handler]); },
		registerTool(tool) { tools.set(tool.name, tool); },
		getActiveTools() { return [...tools.keys()]; },
		getAllTools() { return [...tools.values()]; },
		getSessionName() { return undefined; },
		appendEntry(customType, data) { manager.appendCustomEntry(customType, data); },
		sendMessage(message, options) {
			if (stale) { staleSends.push(message); throw new Error("This extension ctx is stale after session replacement or reload."); }
			sent.push({ message, options });
			manager.appendCustomMessageEntry(message.customType, message.content, message.display ?? false, message.details);
			return true;
		},
	}, { get: (target, key) => key in target ? target[key] : () => undefined });
	const ctx = { ...makeMinimalCtx(cwd), sessionManager: manager, isIdle: () => true, isProjectTrusted: () => true };
	registerSubagentExtension(pi);
	for (const handler of handlers.get("session_start") ?? []) await handler({ reason }, ctx);
	runtime = {
		async call(tool, params) {
			assert.ok(!stale);
			assert.ok(tools.has(tool), `missing registered tool ${tool}`);
			return tools.get(tool).execute(`continuity-${tool}-${Date.now()}`, params, new AbortController().signal, undefined, ctx);
		},
		async shutdown(reason) {
			if (stale) return;
			for (const handler of handlers.get("session_shutdown") ?? []) await handler({ reason }, ctx);
			stale = true;
		},
	};
	return { sessionId: manager.getSessionId(), sessionFile: manager.getSessionFile(), header: manager.getHeader(), pid: process.pid };
}

process.on("message", async ({ id, action, ...input }) => {
	try {
		let value;
		if (action === "start") value = await start("startup", input.sessionFile);
		else if (action === "reload") { await runtime.shutdown("reload"); value = await start("reload"); }
		else if (action === "call") value = await runtime.call(input.tool ?? "subagent", input.params);
		else if (action === "snapshot") value = { sent, staleSends, entries: manager.getEntries() };
		else if (action === "shutdown") { await runtime.shutdown("quit"); value = { sent, staleSends, shutdownAt: Date.now() }; }
		else if (action === "exit") { await runtime?.shutdown("quit"); process.send({ id, value: { pid: process.pid } }, () => process.exit(0)); return; }
		else throw new Error(`Unknown continuity test action ${action}`);
		process.send({ id, value });
	} catch (error) {
		process.send({ id, error: error.stack ?? String(error) });
	}
});
