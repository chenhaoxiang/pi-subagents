import type { SubagentWaitParams } from "./subagent-wait.ts";

/** Pure public-boundary preflight. It does not inspect runs, subscribe, wait or retry. */
export function minimalWaitParameters(input: Record<string, unknown>): SubagentWaitParams {
	const params: SubagentWaitParams = {};
	const reject = (field: string, reason: string): never => {
		throw new Error(JSON.stringify({
			code: "E_BG_WAIT_INVALID_PARAMETERS", field, reason,
			state: "NOT_ARMED", retryPolicy: "CORRECT_ARGUMENTS_ONCE",
			correction: "Use {} or {id} for a blocking wait; use {id, nonBlocking:true} for a subscription. Omit unused options; do not invent an id.",
		}));
	};
	for (const [key, value] of Object.entries(input)) {
		if (value === undefined || value === null) continue;
		switch (key) {
			case "id":
				if (typeof value !== "string" || !value.trim() || /^(?:unused|:omit|omit|undefined|null)$/i.test(value.trim())) {
					reject(key, "Use a real run id, or omit id for a blocking wait across current-session work.");
				}
				params.id = value as string;
				break;
			case "nonBlocking":
			case "all":
			case "stopOnAttention":
				if (typeof value !== "boolean") reject(key, "Use a boolean or omit this optional field.");
				params[key] = value as boolean;
				break;
			case "timeoutMs":
				if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) reject(key, "Use a positive integer for blocking waits only.");
				params.timeoutMs = value as number;
				break;
			default:
				reject(key, "Unknown option; omit it without changing the wait target.");
		}
	}
	if (params.nonBlocking && !params.id) reject("id", "Non-blocking wait subscriptions require id.");
	if (params.nonBlocking && params.all) reject("all", "nonBlocking cannot be combined with all.");
	if (params.nonBlocking && params.timeoutMs !== undefined) {
		reject("timeoutMs", "timeoutMs is only supported for blocking waits. Omit timeoutMs; no subscription was armed.");
	}
	return params;
}
