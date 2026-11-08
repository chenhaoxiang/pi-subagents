import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { it } from "node:test";
import { createMission, listGlobalMissions, listMissions, missionRecordPath, parseMissionRecord, readMission, resolveMissionStoreLocation, updateMission } from "../../src/missions/store.ts";

function fixture() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "mission-schema-"));
	const location = resolveMissionStoreLocation({ projectRoot: root, config: { directory: path.join(root, "missions"), globalIndexDir: path.join(root, "index") } });
	const mission = createMission(location, { title: "Synthetic schema boundary", objective: "Keep decision metadata from old writers", status: "active" });
	const file = missionRecordPath(location, mission.id);
	return { location, mission, file, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

it("keeps missions without typed decisions on schema 1", () => {
	const h = fixture();
	try {
		const record = updateMission(h.location, h.mission.id, { summary: "Ordinary bookkeeping", addDecisions: [{ title: "Open legacy decision" }] });
		assert.equal(h.mission.schemaVersion, 1);
		assert.equal(record.schemaVersion, 1);
		assert.equal(JSON.parse(fs.readFileSync(h.file, "utf8")).schemaVersion, 1);
	} finally { h.cleanup(); }
});

for (const reason of ["answered", "withdrawn", "superseded"] as const) it(`fences ${reason} metadata with schema 2 and preserves it on unrelated writes`, () => {
	const h = fixture();
	try {
		const opened = updateMission(h.location, h.mission.id, { addDecisions: [{ title: "Original" }] });
		const originalId = opened.decisions[0]!.id;
		let replacementId: string | undefined;
		if (reason === "superseded") {
			const appended = updateMission(h.location, h.mission.id, { addDecisions: [{ title: "Replacement", supersedes: originalId }] });
			replacementId = appended.decisions[1]!.id;
			assert.equal(appended.schemaVersion, 2, "replacement intent alone already needs protection");
			assert.equal(appended.decisions[0]!.status, "open", "schema promotion does not close the old decision");
		}
		const closed = updateMission(h.location, h.mission.id, { resolveDecision: { id: originalId, resolution: "Explicit synthetic owner result", closeReason: reason, ...(replacementId ? { supersededBy: replacementId } : {}) } });
		assert.equal(closed.schemaVersion, 2);
		assert.equal(JSON.parse(fs.readFileSync(h.file, "utf8")).schemaVersion, 2);
		const updated = updateMission(h.location, h.mission.id, { summary: "Unrelated bookkeeping" });
		assert.equal(updated.schemaVersion, 2);
		assert.deepEqual(updated.decisions, closed.decisions);
		assert.deepEqual(readMission(h.location, h.mission.id), updated);
		assert.deepEqual(listMissions(h.location).records, [updated]);
		assert.equal(listGlobalMissions(h.location.globalIndexDir).entries[0]?.stale, false);
		const index = JSON.parse(fs.readFileSync(path.join(h.location.globalIndexDir, fs.readdirSync(h.location.globalIndexDir)[0]!), "utf8"));
		assert.equal(index.schemaVersion, 1, "the pointer format does not change with the record format");
	} finally { h.cleanup(); }
});

it("reads existing schema-1 typed records without migrating them and promotes only an actual write", () => {
	const h = fixture();
	try {
		const opened = updateMission(h.location, h.mission.id, { addDecisions: [{ title: "Historical question" }] });
		const closed = updateMission(h.location, h.mission.id, { resolveDecision: { id: opened.decisions[0]!.id, resolution: "Historical answer" } });
		// fork.5 persisted typed decisions using schema 1. Keep this legacy fixture explicit.
		fs.writeFileSync(h.file, JSON.stringify({ ...closed, schemaVersion: 1 }));
		const bytes = fs.readFileSync(h.file);
		assert.equal(readMission(h.location, h.mission.id).schemaVersion, 1);
		assert.equal(updateMission(h.location, h.mission.id, () => undefined).schemaVersion, 1);
		assert.deepEqual(fs.readFileSync(h.file), bytes, "read/no-change does not migrate old records");
		const updated = updateMission(h.location, h.mission.id, { summary: "Authorized owner write" });
		assert.equal(updated.schemaVersion, 2);
		assert.deepEqual(updated.decisions, closed.decisions);
	} finally { h.cleanup(); }
});

it("never downgrades schema 2 or invents typed closure on unclassified decisions", () => {
	const h = fixture();
	try {
		const raw = { ...h.mission, schemaVersion: 2, decisions: [{ id: "unclassified", status: "resolved", title: "Legacy closure", createdAt: h.mission.createdAt, resolvedAt: h.mission.createdAt, resolution: "Original result" }] };
		fs.writeFileSync(h.file, JSON.stringify(raw));
		const updated = updateMission(h.location, h.mission.id, { summary: "Keep the format fence" });
		assert.equal(updated.schemaVersion, 2);
		assert.equal(updated.decisions[0]!.closeReason, undefined);
	} finally { h.cleanup(); }
});

it("rejects unsupported record versions before any mutation callback or write", () => {
	const h = fixture();
	try {
		for (const schemaVersion of [0, 3, "2", null]) {
			const raw = { ...h.mission, schemaVersion };
			fs.writeFileSync(h.file, JSON.stringify(raw));
			const before = fs.readFileSync(h.file);
			assert.throws(() => parseMissionRecord(raw), /schemaVersion/);
			let called = false;
			assert.throws(() => updateMission(h.location, h.mission.id, () => { called = true; return { summary: "Must not write" }; }), /schemaVersion/);
			assert.equal(called, false);
			assert.deepEqual(fs.readFileSync(h.file), before);
		}
	} finally { h.cleanup(); }
});
