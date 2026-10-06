import type { ModelInfo as AvailableModelInfo } from "../../shared/model-info.ts";
import { splitKnownThinkingSuffix as splitThinkingSuffix } from "../../shared/model-info.ts";
import type { ModelScopeCheckRule, ModelScopeViolation, ModelSource } from "./model-scope.ts";
import { checkModelScope } from "./model-scope.ts";
import { resolveModelCandidate } from "./model-resolution.ts";
import type { Usage } from "../../shared/types.ts";

/**
 * Default heterogeneous fallback order used when an agent has no explicit
 * `fallbackModels` chain. Keep this list aligned with the operator-facing
 * model-probe ladder; runtime attempts are the authoritative availability check.
 */
export const DEFAULT_HETERO_MODEL_POOL = [
	"codex-local/kimi-k3:high",
	"codex-local/gpt-6.1-sol:xhigh",
	"codex-local/gpt-6-astra:high",
	"zai-coding-cn/glm-5.3:high",
	"codex-local/deepseek-flash:high",
] as const;

export interface SkippedModel {
	model: string;
	reason: string;
}

export interface ModelAttempt {
	model: string;
	success: boolean;
	exitCode?: number | null;
	error?: string;
	usage?: Usage;
}

export interface ModelCandidateEvidence {
	candidates: string[];
	requestedModel?: string;
	skippedModels?: SkippedModel[];
}

export interface BuildModelCandidatesOptions {
	scope?: ModelScopeCheckRule | ModelScopeCheckRule[];
	onWarn?: (violation: ModelScopeViolation) => void;
	/** The primary model came from the running parent session, not configuration. */
	primaryModelFromParent?: boolean;
	/** How the primary model was selected. */
	origin?: ModelSource | "configured";
}

function scopesOf(scope: ModelScopeCheckRule | ModelScopeCheckRule[] | undefined): ModelScopeCheckRule[] {
	return scope ? (Array.isArray(scope) ? scope : [scope]) : [];
}

function enforceFallbackScope(
	model: string,
	scope: ModelScopeCheckRule | ModelScopeCheckRule[] | undefined,
	onWarn: ((violation: ModelScopeViolation) => void) | undefined,
): void {
	for (const rule of scopesOf(scope)) {
		const violation = checkModelScope(model, rule, "inherited");
		if (!violation) continue;
		if (violation.severity === "error") throw new Error(violation.message);
		(onWarn ?? ((warning) => console.warn(`[pi-subagents] ${warning.message}`)))(violation);
	}
}

function normalizeModelPart(value: string): string {
	return value.toLowerCase().replace(/[._]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/** Provider-agnostic model identity used to keep automatic fallback heterogeneous. */
export function modelKey(model: string): string {
	const base = splitThinkingSuffix(model).baseModel;
	return normalizeModelPart(base.slice(base.lastIndexOf("/") + 1));
}

function canonicalFallbackModel(
	raw: string,
	availableModels: AvailableModelInfo[] | undefined,
	preferredProvider: string | undefined,
): string | undefined {
	const trimmed = raw.trim();
	if (!trimmed) return undefined;
	const resolved = resolveModelCandidate(trimmed, availableModels, preferredProvider);
	if (!availableModels || availableModels.length === 0) return resolved;
	const base = splitThinkingSuffix(resolved ?? trimmed).baseModel;
	return availableModels.some((entry) => entry.fullId === base) ? resolved : undefined;
}

/**
 * Build the ordered launch chain. Explicit fallbackModels win. Without them,
 * use the parent-aware heterogeneous pool first, then append candidates sharing
 * the primary model identity as same-model fallbacks. Registry presence is only
 * a preflight filter; a real launch failure is still handled by the execution loop.
 */
export function buildModelCandidates(
	primaryModel: string | undefined,
	fallbackModels: string[] | undefined,
	availableModels: AvailableModelInfo[] | undefined,
	preferredProvider?: string,
	options?: BuildModelCandidatesOptions,
): ModelCandidateEvidence {
	const origin = options?.origin ?? (options?.primaryModelFromParent ? "inherited" : "configured");
	const requestedModel = origin === "inherited" ? undefined : primaryModel;
	const explicitChain = fallbackModels !== undefined;
	const rawFallbacks = explicitChain
		? fallbackModels
		: availableModels && availableModels.length > 0
			? [
					...DEFAULT_HETERO_MODEL_POOL.filter((candidate) => !primaryModel || modelKey(candidate) !== modelKey(primaryModel)),
					...(primaryModel
						? DEFAULT_HETERO_MODEL_POOL.filter((candidate) => modelKey(candidate) === modelKey(primaryModel))
						: []),
				]
			: [];
	const candidates: string[] = [];
	const skippedModels: SkippedModel[] = [];
	const seen = new Set<string>();

	const addCandidate = (raw: string, index: number): void => {
		const normalized = index === 0 && primaryModel === raw
			? raw.trim()
			: canonicalFallbackModel(raw, availableModels, preferredProvider);
		if (!normalized) {
			if (index > 0) skippedModels.push({ model: raw.trim(), reason: "unavailable in the active model registry" });
			return;
		}
		const parsed = splitThinkingSuffix(normalized);
		const identity = `${modelKey(normalized)}${parsed.thinkingSuffix.toLowerCase()}`;
		if (seen.has(identity)) return;
		if (index > 0) enforceFallbackScope(normalized, options?.scope, options?.onWarn);
		seen.add(identity);
		candidates.push(normalized);
	};

	if (primaryModel) addCandidate(primaryModel, 0);
	for (const fallback of rawFallbacks) addCandidate(fallback, 1);

	return {
		candidates,
		...(requestedModel ? { requestedModel } : {}),
		...(skippedModels.length > 0 ? { skippedModels } : {}),
	};
}

const RETRYABLE_MODEL_FAILURE_PATTERNS = [
	/^REQUEST_LIMIT_EXCEEDED$/i,
	/rate\s*limit/i,
	/usage\s*limit/i,
	/too many requests/i,
	/\b429\b/,
	/quota/i,
	/billing/i,
	/credit/i,
	/^\s*401\s*:/,
	/auth(?:entication)?/i,
	/unauthori[sz]ed/i,
	/forbidden/i,
	/api key/i,
	/token expired/i,
	/invalid key/i,
	/provider.*unavailable/i,
	/(?:model.*(?:not found|unavailable|disabled)|unknown model)/i,
	/overloaded/i,
	/service unavailable/i,
	/temporar(?:ily)? unavailable/i,
	/connection\s+(?:error|reset|closed|aborted)/i,
	/connection refused/i,
	/fetch failed/i,
	/network error/i,
	/socket hang up/i,
	/stream ended without finish_reason/i,
	/upstream/i,
	/timed? out/i,
	/timeout/i,
	/\b500\b/,
	/\b502\b/,
	/\b503\b/,
	/\b504\b/,
	/internal server error/i,
	/cold.?start/i,
	/empty response/i,
	/no output/i,
	/model.*(?:load|fail|error)/i,
];

const TOOL_FAILURE_PREFIX = /^[\w.:@/-]+ failed (?:(?:\(exit \d+\):)|(?:with exit code \d+))(?:\s|$)/i;
const CONTEXT_OVERFLOW_PATTERNS = [
	/context(?: length| window| limit)? (?:exceed|overflow|too long)/i,
	/maximum context length/i,
	/too many tokens/i,
	/token limit/i,
	/context_length_exceeded/i,
	/length_required/i,
	/maximum.*tokens/i,
	/prompt.*too long/i,
	/input.*too long/i,
	/exceeded.*context/i,
	/context.*overflow/i,
];

export function isRetryableModelFailure(error: string | undefined): boolean {
	if (!error || TOOL_FAILURE_PREFIX.test(error.trim())) return false;
	return RETRYABLE_MODEL_FAILURE_PATTERNS.some((pattern) => pattern.test(error));
}

function messageError(message: unknown): string | undefined {
	if (!message || typeof message !== "object") return undefined;
	const value = (message as { errorMessage?: unknown }).errorMessage;
	return typeof value === "string" ? value : undefined;
}

function isTransientNoOutputFailure(error: string | undefined): boolean {
	return error === "Subagent produced no output (possible model cold-start or empty response)."
		|| /^Subagent produced no output after terminal assistant stopReason "[^"]+"\.$/.test(error ?? "");
}

/** Only provider/model failures before any child tool activity may replay safely. */
export function isRetryableModelFailureAttempt(input: {
	error: string | undefined;
	messages?: readonly unknown[];
	toolCount?: number;
}): boolean {
	if (!isRetryableModelFailure(input.error) || (input.toolCount ?? 0) > 0) return false;
	if (isTransientNoOutputFailure(input.error)) return true;
	if ((input.messages?.length ?? 0) === 0) return true;
	const error = input.error?.trim();
	return Boolean(error && input.messages?.some((message) => messageError(message)?.trim() === error));
}

export function isContextOverflow(error: string | undefined): boolean {
	if (!error || TOOL_FAILURE_PREFIX.test(error.trim())) return false;
	return CONTEXT_OVERFLOW_PATTERNS.some((pattern) => pattern.test(error));
}

export function formatModelAttemptNote(attempt: ModelAttempt, nextModel?: string): string {
	const failure = attempt.error?.trim() || `exit ${attempt.exitCode ?? 1}`;
	return nextModel
		? `[fallback] ${attempt.model} failed: ${failure}. Retrying with ${nextModel}.`
		: `[fallback] ${attempt.model} failed: ${failure}.`;
}
