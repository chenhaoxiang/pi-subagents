import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { createWaitSubscriptionManager } from "../../src/runs/background/wait-subscriptions.ts";
import type { SubagentState } from "../../src/shared/types.ts";

function fixture() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-wait-format-"));
	const subscriptionsDir = path.join(root, "subscriptions");
	const managers: Array<{ dispose(): void }> = [];
	const sent: unknown[] = [];
	const open = (owner?: string, kill: (pid: number) => boolean = () => true) => {
		const state = { currentSessionId: "synthetic-shared-session", completionOwnerId: owner, waitSubscriptions: new Map(), foregroundRuns: new Map() } as unknown as SubagentState;
		const manager = createWaitSubscriptionManager({ events: { on: () => () => {} }, sendMessage: (message: unknown) => sent.push(message) } as never, state, {
			subscriptionsDir, asyncDirRoot: path.join(root, "runs"), resultsDir: path.join(root, "results"), now: () => 100, kill,
		});
		managers.push(manager);
		return { manager, state };
	};
	return { root, subscriptionsDir, sent, open, dispose() { for (const manager of managers) manager.dispose(); fs.rmSync(root, { recursive: true, force: true }); } };
}

const input = { targetKind: "foreground" as const, runId: "synthetic-run", requestedId: "synthetic-run", timeoutMs: 1_000 };

describe("wait subscription record format fence", () => {
	it("refuses arming without a native completion identity before writing anything", () => {
		const f = fixture();
		try {
			assert.throws(() => f.open().manager.arm(input), /completion owner identity/);
			assert.equal(fs.existsSync(f.subscriptionsDir), false);
		} finally { f.dispose(); }
	});
	it("writes owner-bound registrations as version 2, not consumable version 1 with extra fields", () => {
		const f = fixture();
		try {
			const { manager } = f.open("owner-a");
			const record = manager.arm(input);
			assert.equal(record.version, 2);
			assert.equal(record.completionOwnerId, "owner-a");
			assert.equal(record.completionOwnerProcess?.pid, process.pid);
			assert.equal(JSON.parse(fs.readFileSync(path.join(f.subscriptionsDir, `${record.token}.json`), "utf8")).version, 2);
		} finally { f.dispose(); }
	});

	it("leaves a legacy record untouched instead of competing with an old live writer", () => {
		const f = fixture();
		try {
			fs.mkdirSync(f.subscriptionsDir, { recursive: true });
			const record = { version: 1, token: "11111111-1111-4111-8111-111111111111", sessionId: "synthetic-shared-session", ...input, createdAt: 0, expiresAt: 1 };
			const file = path.join(f.subscriptionsDir, `${record.token}.json`);
			const bytes = JSON.stringify(record);
			fs.writeFileSync(file, bytes);
			const reader = f.open("owner-b");
			reader.manager.restore();
			reader.manager.reconcile();
			reader.state.currentSessionId = "synthetic-foreign-session";
			reader.manager.restore();
			assert.equal(reader.state.waitSubscriptions?.has(record.token), false);
			assert.equal(fs.readFileSync(file, "utf8"), bytes, "no read-time version or owner reconstruction");
			assert.deepEqual(f.sent, []);
		} finally { f.dispose(); }
	});

	it("rejects malformed version-2 owner bindings without deleting or notifying", () => {
		for (const missing of ["completionOwnerId", "completionOwnerProcess"]) {
			const f = fixture();
			try {
				const original = f.open("owner-a");
				const record = original.manager.arm(input);
				original.manager.dispose();
				const file = path.join(f.subscriptionsDir, `${record.token}.json`);
				const malformed = { ...record, version: 2 } as Record<string, unknown>;
				delete malformed[missing];
				const bytes = JSON.stringify(malformed);
				fs.writeFileSync(file, bytes);
				const reader = f.open("owner-b");
				reader.manager.restore();
				assert.equal(reader.state.waitSubscriptions?.size, 0);
				assert.equal(fs.readFileSync(file, "utf8"), bytes);
				assert.deepEqual(f.sent, []);
			} finally { f.dispose(); }
		}
	});

	it("does not adopt a bound record without the new reader's own completion identity", () => {
		const f = fixture();
		try {
			const original = f.open("owner-a");
			const record = original.manager.arm(input);
			original.manager.dispose();
			const file = path.join(f.subscriptionsDir, `${record.token}.json`);
			const bytes = JSON.stringify({ ...record, version: 2, completionOwnerProcess: { pid: 999_999 } });
			fs.writeFileSync(file, bytes);
			const reader = f.open(undefined, () => { throw Object.assign(new Error("gone"), { code: "ESRCH" }); });
			reader.manager.restore();
			assert.equal(reader.state.waitSubscriptions?.size, 0);
			assert.equal(fs.readFileSync(file, "utf8"), bytes);
			assert.deepEqual(f.sent, []);
		} finally { f.dispose(); }
	});

	it("does not infer death from an unreadable process state", () => {
		const f = fixture();
		try {
			const original = f.open("owner-a");
			const record = original.manager.arm(input);
			original.manager.dispose();
			const file = path.join(f.subscriptionsDir, `${record.token}.json`);
			const bytes = JSON.stringify({ ...record, version: 2, completionOwnerProcess: { pid: 999_999 } });
			fs.writeFileSync(file, bytes);
			const reader = f.open("owner-b", () => { throw Object.assign(new Error("unavailable"), { code: "EPERM" }); });
			reader.manager.restore();
			assert.equal(reader.state.waitSubscriptions?.size, 0);
			assert.equal(fs.readFileSync(file, "utf8"), bytes);
			assert.deepEqual(f.sent, []);
		} finally { f.dispose(); }
	});
});
