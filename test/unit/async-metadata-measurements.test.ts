import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { runSingleStepInner } from "../../src/runs/background/subagent-runner.ts";

it("omits unmeasured native-child metrics when aborted before launch", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "async-metadata-unknown-"));
	try {
		const result = await runSingleStepInner({
			agent: "worker", task: "PRIVATE_UNLAUNCHED_PROMPT", context: "fresh",
			systemPrompt: "Read only.", tools: ["read"], thinking: "high",
			inheritProjectContext: false, inheritGlobalContext: false, inheritSkills: false,
		}, {
			cwd, id: "unlaunched-run", flatIndex: 2, flatStepCount: 3,
			previousOutput: "", placeholder: "{previous}", outputFile: join(cwd, "output.log"),
			sessionEnabled: false, timeoutSignal: AbortSignal.abort(),
			artifactsDir: join(cwd, "artifacts"),
			artifactConfig: { enabled: true, includeInput: false, includeOutput: false, includeTranscript: false, includeMetadata: true },
		});
		assert.equal(result.timedOut, true);
		assert.ok(result.artifactPaths?.metadataPath);
		const text = readFileSync(result.artifactPaths.metadataPath, "utf8");
		const metadata: { runId?: string; index?: number; durationMs?: number; toolCount?: number; model?: string; thinking?: string; usage?: { cost?: number }; costStatus?: string } = JSON.parse(text);
		assert.equal(metadata.runId, "unlaunched-run");
		assert.equal(metadata.index, 2);
		for (const key of ["durationMs", "toolCount", "model", "thinking", "usage", "costStatus"]) {
			assert.equal(Object.hasOwn(metadata, key), false, `${key} must stay unknown, not a fabricated zero/config value`);
		}
		assert.doesNotMatch(text, /PRIVATE_UNLAUNCHED_PROMPT/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
