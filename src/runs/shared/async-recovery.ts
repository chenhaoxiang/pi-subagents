import type { AsyncStatus, ProcessTerminal } from "../../shared/types.ts";

/**
 * Read-only recovery guidance for a retained async run.
 *
 * This is deliberately a projection, not a second lifecycle or recovery store:
 * the existing status/result/recovery-descriptor files remain authoritative and
 * the caller still decides whether to invoke status, reconcile or resume.
 */
export type AsyncRecoveryState = "waiting" | "unknown" | "ready" | "blocked";
export type AsyncRecoveryAction = "status" | "reconcile" | "resume" | "inspect";
export type AsyncRecoveryReason =
	| "runner_active"
	| "runner_liveness_unknown"
	| "terminal_process_unobserved"
	| "resumable_session"
	| "missing_session"
	| "stopped_run"
	| "external_runner_non_resumable"
	| "foreign_session";

export interface AsyncRecoveryProjection {
	state: AsyncRecoveryState;
	action: AsyncRecoveryAction;
	reason: AsyncRecoveryReason;
	runId: string;
	index?: number;
}

export interface AsyncRecoveryStep {
	index: number;
	sessionFile?: string;
	sessionFileAvailable?: boolean;
	runnerType?: "pi" | "external-cli" | "external-job";
	status?: string;
}

export interface AsyncRecoveryInput {
	runId: string;
	state: AsyncStatus["state"];
	sessionId?: string;
	currentSessionId?: string;
	processTerminal?: ProcessTerminal;
	steps?: readonly AsyncRecoveryStep[];
	sessionFile?: string;
	sessionFileAvailable?: boolean;
}

function ownsSession(input: AsyncRecoveryInput): boolean {
	return input.currentSessionId === undefined || input.sessionId === undefined || input.currentSessionId === input.sessionId;
}

function readyStep(input: AsyncRecoveryInput): AsyncRecoveryStep | undefined {
	return (input.steps ?? []).find((step) =>
		step.runnerType !== "external-cli"
		&& step.runnerType !== "external-job"
		&& Boolean(step.sessionFile)
		&& step.sessionFileAvailable !== false,
	);
}

function hasExternalRunner(input: AsyncRecoveryInput): boolean {
	return (input.steps ?? []).some((step) => step.runnerType === "external-cli" || step.runnerType === "external-job");
}

/**
 * Classify the next safe operator action without dispatching a new effect.
 * Unknown liveness is intentionally actionable (`reconcile`) but never
 * resumable until the existing owner/result path proves the runner terminal.
 */
export function projectAsyncRecovery(input: AsyncRecoveryInput): AsyncRecoveryProjection {
	if (!ownsSession(input)) return { state: "blocked", action: "inspect", reason: "foreign_session", runId: input.runId };

	if (input.state === "running" || input.state === "queued") {
		if (input.processTerminal?.state === "unknown") {
			return { state: "unknown", action: "reconcile", reason: "runner_liveness_unknown", runId: input.runId };
		}
		if (input.processTerminal?.state === "pending" && input.processTerminal.runnerProcessInstanceId === "observer-unavailable") {
			return { state: "unknown", action: "reconcile", reason: "terminal_process_unobserved", runId: input.runId };
		}
		return { state: "waiting", action: "status", reason: "runner_active", runId: input.runId };
	}

	if (input.state === "stopped" || input.state === "rejected") {
		return { state: "blocked", action: "inspect", reason: "stopped_run", runId: input.runId };
	}

	if (hasExternalRunner(input)) {
		return { state: "blocked", action: "inspect", reason: "external_runner_non_resumable", runId: input.runId };
	}

	const candidate = readyStep(input) ?? (input.sessionFile && input.sessionFileAvailable !== false
		? { index: 0, sessionFile: input.sessionFile, sessionFileAvailable: input.sessionFileAvailable }
		: undefined);
	if (candidate) return { state: "ready", action: "resume", reason: "resumable_session", runId: input.runId, index: candidate.index };

	return { state: "blocked", action: "inspect", reason: "missing_session", runId: input.runId };
}

export function formatAsyncRecovery(projection: AsyncRecoveryProjection): string {
	const index = projection.index === undefined ? "" : ` child ${projection.index}`;
	return `Recovery: ${projection.state} (${projection.reason})${index}; next action: ${projection.action}`;
}
