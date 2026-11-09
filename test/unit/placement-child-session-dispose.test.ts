import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChildSession, ChildSessionFactory, ChildSessionLaunch } from "../../src/runs/shared/child-session.ts";
import { createPlacementAwareChildSessionFactory } from "../../src/runs/shared/herdr-placed-run.ts";

function trackedChild() {
	const events: string[] = [];
	const child: ChildSession = {
		subscribe: () => () => {},
		prompt: async () => {},
		steer: async () => {},
		followUp: async () => {},
		abort: async () => { events.push("abort"); },
		async dispose() {
			assert.equal(this.sessionId, "synthetic-placed-child", "disposal must retain the original receiver");
			events.push("dispose");
		},
		messages: [], sessionFile: undefined, sessionId: "synthetic-placed-child", modelId: undefined,
	};
	return { child, events };
}

function launch(parentSessionFile: string | undefined, placed = true): ChildSessionLaunch {
	return {
		cwd: "/synthetic/project", parentSessionFile,
		...(placed ? { machine: { provider: "herdr" as const, id: "fixture", label: "fixture", target: "fixture.invalid", cwd: "/synthetic/project" }, remoteResources: { agent: "worker" } } : {}),
		storage: { kind: "memory" }, extensionPaths: [], ambientExtensions: false,
		hooks: [], noSkills: true, noContextFiles: true,
		runtime: { runId: "synthetic-scope", agent: "worker", childIndex: 0, fanoutChild: false, depth: 1, maxDepth: 1, inheritProjectContext: false, inheritGlobalContext: false, inheritSkills: false, fast: false, waitTool: { enabled: false } },
	};
}

function fixture() {
	const scoped: Array<string | undefined> = [];
	let global = 0;
	const localChild = trackedChild();
	const local: ChildSessionFactory = {
		create: async () => localChild.child,
		dispose: async () => { global++; },
		disposeForParent: async (parent) => { scoped.push(parent); },
	};
	const remote: ReturnType<typeof trackedChild>[] = [];
	const factory = createPlacementAwareChildSessionFactory(local, async () => {
		const record = trackedChild(); remote.push(record); return record.child;
	});
	return { factory, remote, scoped, localChild, globalCalls: () => global };
}

describe("placement wrapper child shutdown scopes", () => {
	it("closes only the matching parent's remote bridges and forwards that exact local scope", async () => {
		const { factory, remote, scoped, globalCalls } = fixture();
		await factory.create(launch("parent-a"));
		await factory.create(launch("parent-b"));
		await factory.create(launch(undefined));
		await factory.disposeForParent("parent-a");
		assert.deepEqual(remote.map(({ events }) => events), [["dispose"], [], []]);
		assert.deepEqual(scoped, ["parent-a"]);
		assert.equal(globalCalls(), 0);

		await factory.disposeForParent(undefined);
		assert.deepEqual(remote.map(({ events }) => events), [["dispose"], [], ["dispose"]]);
		assert.deepEqual(scoped, ["parent-a", undefined]);
		assert.equal(globalCalls(), 0, "a file-less scope must never become global disposal");
		await factory.dispose();
	});

	it("whole-process disposal closes remaining attached bridges without disposing prior scopes twice", async () => {
		const { factory, remote, globalCalls } = fixture();
		await factory.create(launch("parent-a"));
		await factory.create(launch("parent-b"));
		await factory.disposeForParent("parent-a");
		await factory.dispose();
		assert.deepEqual(remote.map(({ events }) => events), [["dispose"], ["dispose"]]);
		assert.equal(globalCalls(), 1);
	});

	it("keeps detached remote children running across scoped and whole-process disposal", async () => {
		const { factory, remote } = fixture();
		const detached = await factory.create(launch("parent-a"));
		detached.detached = true;
		await factory.create(launch("parent-a"));
		try {
			await factory.disposeForParent("parent-a");
			await factory.dispose();
			assert.deepEqual(remote.map(({ events }) => events), [[], ["dispose"]]);
		} finally {
			detached.detached = false;
			await factory.dispose();
		}
	});

	it("forgets a detached child after its individual terminal disposal without reattaching it", async () => {
		const { factory, remote } = fixture();
		const detached = await factory.create(launch("parent-a"));
		let inspections = 0;
		Object.defineProperty(detached, "detached", { get() { inspections++; return true; } });
		await detached.dispose();
		await factory.disposeForParent("parent-a");
		await factory.dispose();
		assert.deepEqual(remote[0]?.events, ["dispose"], "terminal disposal occurs once");
		assert.equal(inspections, 0, "a disposed child must no longer be retained or inspected by the factory");
	});

	it("does not route an ordinary local child through the placed factory", async () => {
		const { factory, remote, localChild, scoped } = fixture();
		assert.equal(await factory.create(launch("parent-local", false)), localChild.child);
		await factory.disposeForParent("parent-local");
		assert.equal(remote.length, 0);
		assert.deepEqual(scoped, ["parent-local"]);
	});
});
