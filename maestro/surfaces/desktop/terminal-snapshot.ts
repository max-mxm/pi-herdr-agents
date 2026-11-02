import type { PaneInspection, SurfaceAgentStatus } from "../../core/types.ts";
import type {
	SurfaceInfo,
	SurfaceProcessInfo,
} from "../../core/surface-provider.ts";
import {
	isRecord,
	isString,
	isNonEmptyString,
	isFiniteNumber,
	type JsonValue,
	type JsonObject,
} from "../../core/config/type-guards.ts";

/** Decode CLI JSON at the boundary. Missing facts never establish absence. */
export function desktopRecord(value: JsonValue): JsonObject {
	if (!isRecord(value)) throw new Error("Invalid desktop response");
	return value;
}
function terminal(value: JsonValue): JsonObject {
	const item = desktopRecord(value);
	if (
		!isNonEmptyString(item.address) ||
		(item.state !== "live" && item.state !== "finished")
	) {
		throw new Error("Invalid desktop terminal identity or state");
	}
	return item;
}
export function desktopAddress(value: JsonValue): string {
	const item = desktopRecord(value);
	if (
		!isNonEmptyString(item.address) ||
		!/^t[a-z0-9]+$/.test(item.address) ||
		item.state !== "live"
	) {
		throw new Error("Desktop did not return a live local terminal address");
	}
	return item.address;
}
export function desktopText(value: JsonValue): string {
	const item = desktopRecord(value);
	if (!isString(item.text)) throw new Error("Invalid desktop screen response");
	return item.text;
}
export function parseTerminalList(value: JsonValue): SurfaceInfo[] {
	const snapshot = desktopRecord(value);
	if (!Array.isArray(snapshot.terminals))
		throw new Error("Invalid desktop terminal list");
	const seen = new Set<string>();
	const result: SurfaceInfo[] = [];
	for (const raw of snapshot.terminals) {
		const item = terminal(raw);
		if (!isNonEmptyString(item.address))
			throw new Error("Missing terminal address");
		const id = item.address;
		if (seen.has(id)) throw new Error("Duplicate desktop terminal identity");
		seen.add(id);
		if (item.state !== "live") continue;
		const surface: SurfaceInfo = { id };
		if (isNonEmptyString(item.name)) surface.name = item.name;
		if (isNonEmptyString(item.cwd)) surface.cwd = item.cwd;
		result.push(surface);
	}
	return result;
}
export function inspectTerminal(
	value: JsonValue,
	expectedId: string,
	observedAt: number,
): PaneInspection {
	const item = terminal(value);
	if (item.address !== expectedId)
		throw new Error("Desktop terminal identity mismatch");
	if (item.state === "finished")
		return { kind: "missing", error: "Terminal finished" };
	const status = isRecord(item.status) ? item.status : undefined;
	const rawStatus = status?.state;
	const agentStatus: SurfaceAgentStatus =
		rawStatus === "idle" ||
		rawStatus === "working" ||
		rawStatus === "blocked" ||
		rawStatus === "done"
			? rawStatus
			: "unknown";
	const result: PaneInspection = { kind: "present", agentStatus, observedAt };
	if (isNonEmptyString(status?.app)) result.agent = status.app;
	return result;
}
export function desktopProcessInfo(
	value: JsonValue,
	expectedId: string,
): SurfaceProcessInfo {
	const item = terminal(value);
	if (item.address !== expectedId || item.state !== "live")
		throw new Error("Desktop terminal is not live");
	const foreground = isRecord(item.foreground) ? item.foreground : undefined;
	const info: SurfaceProcessInfo = { pids: [], foregroundProcesses: [] };
	if (isFiniteNumber(item.pid) && Number.isInteger(item.pid) && item.pid > 0)
		info.shellPid = item.pid;
	if (
		foreground &&
		isFiniteNumber(foreground.pid) &&
		Number.isInteger(foreground.pid) &&
		foreground.pid > 0
	) {
		const process: SurfaceProcessInfo["foregroundProcesses"][number] = {
			pid: foreground.pid,
		};
		if (isNonEmptyString(foreground.name)) process.name = foreground.name;
		if (isNonEmptyString(foreground.cwd)) process.cwd = foreground.cwd;
		if (Array.isArray(foreground.argv) && foreground.argv.every(isString))
			process.argv = foreground.argv;
		info.pids.push(process.pid);
		info.foregroundProcesses.push(process);
	}
	return info;
}
