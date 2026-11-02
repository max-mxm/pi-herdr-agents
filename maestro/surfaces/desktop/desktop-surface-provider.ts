import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
	SurfaceProvider,
	CreateSurfaceOptions,
	CreateWorktreeSurfaceOptions,
	SurfaceInfo,
	SurfaceProcessInfo,
	WorktreeSurface,
	WorktreeSurfaceInfo,
	ReportOpenedPrimaryWorkspaceInput,
} from "../../core/surface-provider.ts";
import type { PaneInspection, SurfaceHandle } from "../../core/types.ts";
import type { JsonValue } from "../../core/config/type-guards.ts";
import { shellQuote } from "../../core/shell.ts";
import { launchDesktopTerminal } from "./desktop-launch.ts";
import {
	desktopAddress,
	desktopProcessInfo,
	desktopText,
	inspectTerminal,
	parseTerminalList,
} from "./terminal-snapshot.ts";

export type DesktopRunner = (args: string[], timeoutMs?: number) => JsonValue;
export type DesktopAsyncRunner = (
	args: string[],
	timeoutMs?: number,
) => Promise<JsonValue>;
const execAsync = promisify(execFile);
function hc(args: string[], timeoutMs = 10_000): JsonValue {
	return JSON.parse(
		execFileSync("hc", [args[0], "--json", ...args.slice(1)], {
			encoding: "utf8",
			timeout: timeoutMs,
			stdio: ["ignore", "pipe", "pipe"],
		}),
	);
}
async function hcAsync(args: string[], timeoutMs = 10_000): Promise<JsonValue> {
	const result = await execAsync("hc", [args[0], "--json", ...args.slice(1)], {
		encoding: "utf8",
		timeout: timeoutMs,
	});
	return JSON.parse(result.stdout);
}
function unsupported(): never {
	throw new Error(
		"Desktop managed worktrees are not supported; no worktree was created or removed.",
	);
}

/** Local Desktop transport. Only terminals acquired by this instance may be controlled. */
export class DesktopSurfaceProvider implements SurfaceProvider {
	readonly name = "desktop";
	readonly #run: DesktopRunner;
	readonly #runAsync: DesktopAsyncRunner;
	readonly #owned = new Set<string>();
	constructor(run: DesktopRunner = hc, runAsync?: DesktopAsyncRunner) {
		this.#run = run;
		this.#runAsync =
			runAsync ??
			(run === hc ? hcAsync : async (args, timeoutMs) => run(args, timeoutMs));
	}
	isAvailable(): boolean {
		const parent = process.env.HC_TERMINAL_ID;
		if (!parent || !/^t[a-z0-9]+$/.test(parent)) return false;
		try {
			return (
				inspectTerminal(this.#run(["get", parent]), parent, Date.now()).kind ===
				"present"
			);
		} catch {
			return false;
		}
	}
	setupHint(): string {
		return "Start Pi in a live local Herdr Desktop terminal with hc available.";
	}
	createSurface(opts: CreateSurfaceOptions): string {
		const parent = process.env.HC_TERMINAL_ID;
		if (!parent || !/^t[a-z0-9]+$/.test(parent))
			throw new Error(this.setupHint());
		const id =
			this.#run === hc
				? launchDesktopTerminal(opts, parent)
				: desktopAddress(
						this.#run([
							"run",
							"--bg",
							"--no-notify",
							"--parent",
							parent,
							"--label",
							`piha.parent=${parent}`,
							"--label",
							`piha.name=${opts.name}`,
							"--cwd",
							opts.cwd,
							"/bin/bash",
							"--noprofile",
							"--norc",
							"-i",
						]),
					);
		if (id === parent)
			throw new Error("Desktop returned the parent terminal as its child");
		this.#owned.add(id);
		return id;
	}
	#assertOwned(id: string): void {
		if (!this.#owned.has(id))
			throw new Error(`Refusing to control an unowned Desktop terminal: ${id}`);
	}
	runCommand(id: string, command: string): void {
		this.#assertOwned(id);
		this.#run(["send", id, command]);
	}
	runScript(
		id: string,
		command: string,
		options: { scriptPath: string; scriptPreamble: string },
	): string {
		this.#assertOwned(id);
		mkdirSync(dirname(options.scriptPath), { recursive: true });
		writeFileSync(
			options.scriptPath,
			`#!/bin/bash\n${options.scriptPreamble.trimEnd()}\n${command}\n`,
			{ mode: 0o700 },
		);
		this.runCommand(id, `bash ${shellQuote(options.scriptPath)}`);
		return options.scriptPath;
	}
	async readScreen(id: string, lines = 50): Promise<string> {
		return desktopText(
			await this.#runAsync(["read", "--lines", String(lines), id]),
		);
	}
	closeSurface(id: string): void {
		this.#assertOwned(id);
		this.#run(["kill", id]);
	}
	async listSurfaces(opts?: { timeoutMs?: number }): Promise<SurfaceInfo[]> {
		return parseTerminalList(await this.#runAsync(["ls"], opts?.timeoutMs));
	}
	attachSurface(id: string): SurfaceHandle {
		this.#assertOwned(id);
		return {
			id,
			runCommand: (command) => this.runCommand(id, command),
			readScreen: (lines) => this.readScreen(id, lines),
			sendKeys: (keys) => this.sendKeys(id, keys),
			close: () => this.closeSurface(id),
		};
	}
	createWorktreeSurface(_opts: CreateWorktreeSurfaceOptions): WorktreeSurface {
		return unsupported();
	}
	removeWorktreeSurface(_id: string): void {
		unsupported();
	}
	reportOpenedPrimaryWorkspace(
		_input: ReportOpenedPrimaryWorkspaceInput,
	): undefined {
		return undefined;
	}
	async listWorktreeSurfaces(): Promise<WorktreeSurfaceInfo[]> {
		return unsupported();
	}
	async inspectSurface(id: string): Promise<PaneInspection> {
		try {
			return inspectTerminal(await this.#runAsync(["get", id]), id, Date.now());
		} catch (error) {
			return { kind: "unavailable", error: String(error) };
		}
	}
	sendKeys(id: string, keys: string): void {
		this.#assertOwned(id);
		const key =
			keys === "Escape"
				? "esc"
				: keys === "Enter"
					? "enter"
					: keys === "C-c"
						? "ctrl+c"
						: keys;
		this.#run(["keys", id, key]);
	}
	async getProcessInfo(
		id: string,
		opts?: { timeoutMs?: number },
	): Promise<SurfaceProcessInfo> {
		return desktopProcessInfo(
			await this.#runAsync(["get", id], opts?.timeoutMs),
			id,
		);
	}
	async waitForShellReady(
		id: string,
		opts?: { timeoutMs?: number },
	): Promise<void> {
		const deadline = Date.now() + (opts?.timeoutMs ?? 5_000);
		while (Date.now() < deadline) {
			const info = await this.getProcessInfo(id, {
				timeoutMs: Math.max(1, deadline - Date.now()),
			});
			if (
				info.shellPid &&
				info.foregroundProcesses.some(
					(process) =>
						process.pid === info.shellPid &&
						(process.name === "bash" || process.argv?.[0] === "/bin/bash"),
				)
			)
				return;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		throw new Error("Desktop shell readiness unconfirmed");
	}
	async waitForSurfaceAbsence(
		id: string,
		opts?: { timeoutMs?: number },
	): Promise<void> {
		const observation = inspectTerminal(
			await this.#runAsync(["get", id], opts?.timeoutMs),
			id,
			Date.now(),
		);
		if (observation.kind !== "missing")
			throw new Error(`Desktop terminal absence unconfirmed: ${id}`);
	}
	focusWorkspace(_id: string): void {
		throw new Error("Desktop workspace focus is not supported");
	}
	setTitle(_target: "tab" | "workspace", _title: string): void {
		throw new Error("Desktop title changes are not supported");
	}
}
