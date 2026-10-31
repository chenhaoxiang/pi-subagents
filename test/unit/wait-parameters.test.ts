import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { minimalWaitParameters } from "../../src/runs/background/wait-parameters.ts";

describe("bg_wait minimal parameter preflight", () => {
	it("omits null optional fields and keeps a blocking wait minimal", () => {
		assert.deepEqual(minimalWaitParameters({ id: null, all: null, timeoutMs: null }), {});
	});

	it("accepts an exact non-blocking subscription shape", () => {
		assert.deepEqual(minimalWaitParameters({ id: "run-123", nonBlocking: true }), { id: "run-123", nonBlocking: true });
	});

	it("rejects non-blocking timeout before subscription or polling", () => {
		assert.throws(
			() => minimalWaitParameters({ id: "run-123", nonBlocking: true, timeoutMs: 1000 }),
			(error: Error) => error.message.includes("E_BG_WAIT_INVALID_PARAMETERS") && error.message.includes("NOT_ARMED"),
		);
	});

	it("rejects placeholder ids and unknown fields", () => {
		assert.throws(() => minimalWaitParameters({ id: "unused" }), /real run id/);
		assert.throws(() => minimalWaitParameters({ timeout: 1000 }), /Unknown option/);
	});
});
