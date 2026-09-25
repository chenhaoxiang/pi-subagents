import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import { withShortUnixSocketDir } from "../support/short-unix-socket-dir.ts";

test("fake Unix socket directories are short, unique, and cleaned on success and failure", { skip: process.platform === "win32" }, async () => {
	const prefix = `test-socket-${randomUUID().slice(0, 8)}-`;
	let first = "";
	await withShortUnixSocketDir(prefix, ["bridge.sock"], async (dir) => {
		first = dir;
		assert.ok(Buffer.byteLength(path.join(dir, "bridge.sock")) < 104);
		if (process.platform === "darwin") assert.ok(dir.startsWith("/tmp/"));
		assert.equal(fs.existsSync(dir), true);
	});
	assert.equal(fs.existsSync(first), false);

	let second = "";
	await assert.rejects(withShortUnixSocketDir(prefix, ["bridge.sock"], async (dir) => {
		second = dir;
		throw new Error("synthetic bind failure");
	}), /synthetic bind failure/);
	assert.notEqual(first, second);
	assert.equal(fs.existsSync(second), false);

	await assert.rejects(withShortUnixSocketDir(prefix, ["x".repeat(160)], async () => {
		assert.fail("overlong socket must be rejected before the fixture starts");
	}), /Test Unix socket path exceeds 103 bytes/);
	assert.equal(fs.readdirSync("/tmp").some((name) => name.startsWith(prefix)), false);
});
