import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildModelCandidates,
	isContextOverflow,
	isRetryableModelFailureAttempt,
	modelKey,
} from "../../src/runs/shared/model-fallback.ts";

const poolModels = [
	{ provider: "codex-local", id: "kimi-k3", fullId: "codex-local/kimi-k3" },
	{ provider: "codex-local", id: "gpt-6.1-sol", fullId: "codex-local/gpt-6.1-sol" },
	{ provider: "codex-local", id: "gpt-6-astra", fullId: "codex-local/gpt-6-astra" },
	{ provider: "zai-coding-cn", id: "glm-5.3", fullId: "zai-coding-cn/glm-5.3" },
	{ provider: "codex-local-8410", id: "claude-opus-5-5", fullId: "codex-local-8410/claude-opus-5-5" },
	{ provider: "codex-local", id: "deepseek-flash", fullId: "codex-local/deepseek-flash" },
];

describe("model fallback", () => {
	it("prefers an explicit ordered fallback chain and skips unavailable entries", () => {
		const evidence = buildModelCandidates(
			"codex-local/kimi-k3:max",
			["missing/model", "zai-coding-cn/glm-5.3"],
			poolModels,
		);

		assert.deepEqual(evidence.candidates, ["codex-local/kimi-k3:max", "zai-coding-cn/glm-5.3"]);
		assert.deepEqual(evidence.skippedModels, [{ model: "missing/model", reason: "unavailable in the active model registry" }]);
	});

	it("uses the global heterogeneous pool when no explicit chain is configured", () => {
		const evidence = buildModelCandidates("codex-local/gpt-6-sol", undefined, [
			...poolModels,
			{ provider: "codex-local", id: "gpt-6-sol", fullId: "codex-local/gpt-6-sol" },
		]);

		assert.equal(evidence.candidates[0], "codex-local/gpt-6-sol");
		assert.deepEqual(evidence.candidates.slice(1), [
			"codex-local/kimi-k3:high",
			"codex-local/gpt-6.1-sol:xhigh",
			"codex-local/gpt-6-astra:high",
			"zai-coding-cn/glm-5.3:high",
			"codex-local/deepseek-flash:high",
		]);
	});

	it("defers the parent model identity until heterogeneous fallbacks are exhausted", () => {
		const evidence = buildModelCandidates("codex-local/gpt-6.1-sol", undefined, poolModels);

		assert.deepEqual(evidence.candidates, [
			"codex-local/gpt-6.1-sol",
			"codex-local/kimi-k3:high",
			"codex-local/gpt-6-astra:high",
			"zai-coding-cn/glm-5.3:high",
			"codex-local/deepseek-flash:high",
			"codex-local/gpt-6.1-sol:xhigh",
		]);
	});

	it("keeps same-name models as the final fallback tier", () => {
		const evidence = buildModelCandidates("codex-local/kimi-k3", undefined, poolModels);

		assert.deepEqual(evidence.candidates, [
			"codex-local/kimi-k3",
			"codex-local/gpt-6.1-sol:xhigh",
			"codex-local/gpt-6-astra:high",
			"zai-coding-cn/glm-5.3:high",
			"codex-local/deepseek-flash:high",
			"codex-local/kimi-k3:high",
		]);
	});

	it("retains an unavailable primary so runtime failure evidence precedes fallback", () => {
		const evidence = buildModelCandidates(
			"missing/primary",
			["zai-coding-cn/glm-5.3"],
			poolModels,
		);
		assert.deepEqual(evidence.candidates, ["missing/primary", "zai-coding-cn/glm-5.3"]);
	});

	it("uses the full heterogeneous pool when no primary model is configured", () => {
		const evidence = buildModelCandidates(undefined, undefined, poolModels);

		assert.deepEqual(evidence.candidates, [
			"codex-local/kimi-k3:high",
			"codex-local/gpt-6.1-sol:xhigh",
			"codex-local/gpt-6-astra:high",
			"zai-coding-cn/glm-5.3:high",
			"codex-local/deepseek-flash:high",
		]);
	});

	it("treats models served by different providers as the same model identity", () => {
		assert.equal(modelKey("codex-local/kimi-k3:high"), modelKey("zai-coding-cn/kimi-k3:max"));
	});

	it("allows provider failures only before child tool activity", () => {
		assert.equal(isRetryableModelFailureAttempt({ error: "HTTP 503 provider unavailable", messages: [], toolCount: 0 }), true);
		assert.equal(isRetryableModelFailureAttempt({ error: "HTTP 503 provider unavailable", messages: [], toolCount: 1 }), false);
		assert.equal(isRetryableModelFailureAttempt({ error: "bash failed (exit 1): command not found", messages: [], toolCount: 0 }), false);
	});

	it("does not fallback on context overflow", () => {
		assert.equal(isContextOverflow("maximum context length exceeded"), true);
	});
});
