import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CreateSurfaceOptions } from "../../core/surface-provider.ts";
import {
	isRecord,
	isString,
	type JsonValue,
} from "../../core/config/type-guards.ts";
import { desktopAddress } from "./terminal-snapshot.ts";

/** Forward declared authentication references, not the caller's entire environment. */
export function authenticationEnvironment(
	config: JsonValue,
	environment: NodeJS.ProcessEnv,
) {
	const result: Record<string, string> = {};
	if (!isRecord(config) || !isRecord(config.providers)) return result;
	function collect(value: JsonValue | undefined): void {
		if (!isString(value) || value.startsWith("!")) return;
		// Escaped dollars are literals. Credentials and header strings support interpolation.
		for (const match of value
			.replace(/\$\$/g, "")
			.matchAll(
				/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g,
			)) {
			const name = match[1] ?? match[2];
			const resolved = environment[name];
			if (Object.hasOwn(environment, name) && isString(resolved))
				result[name] = resolved;
		}
	}
	function credentials(value: JsonValue | undefined): void {
		if (!isRecord(value)) return;
		collect(value.apiKey);
		if (isRecord(value.headers))
			for (const header of Object.values(value.headers)) collect(header);
	}
	for (const provider of Object.values(config.providers)) {
		credentials(provider);
		if (!isRecord(provider)) continue;
		if (Array.isArray(provider.models))
			for (const model of provider.models) credentials(model);
		if (isRecord(provider.modelOverrides))
			for (const model of Object.values(provider.modelOverrides))
				credentials(model);
	}
	return result;
}

export function desktopLaunchEnvironment() {
	const home =
		process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
	const config = join(home, "models.json");
	let values: Record<string, string> = {};
	if (existsSync(config)) {
		try {
			values = authenticationEnvironment(
				JSON.parse(readFileSync(config, "utf8")),
				process.env,
			);
		} catch {
			throw new Error(
				"Unable to read Desktop authentication references; credentials were not logged.",
			);
		}
	}
	return { ...values, PI_CODING_AGENT_DIR: home };
}

/** Credentials travel over stdin to the local RPC, never argv, scripts or labels. */
export function launchDesktopTerminal(
	opts: CreateSurfaceOptions,
	parent: string,
): string {
	const request = {
		jsonrpc: "2.0",
		id: 1,
		method: "terminal.run",
		params: {
			argv: ["/bin/bash", "--noprofile", "--norc", "-i"],
			cwd: opts.cwd,
			parent,
			no_notify: true,
			labels: { "piha.parent": parent, "piha.name": opts.name },
			env: desktopLaunchEnvironment(),
		},
	};
	let output: string;
	try {
		output = execFileSync("hc", ["connect"], {
			input: `${JSON.stringify(request)}\n`,
			encoding: "utf8",
			timeout: 10_000,
			stdio: ["pipe", "pipe", "pipe"],
		});
	} catch {
		throw new Error(
			"Desktop terminal launch RPC failed; credentials were not logged.",
		);
	}
	try {
		for (const line of output.split("\n").filter(Boolean)) {
			const reply: JsonValue = JSON.parse(line);
			if (
				isRecord(reply) &&
				reply.id === 1 &&
				reply.result !== undefined &&
				reply.error === undefined
			)
				return desktopAddress(reply.result);
		}
	} catch {
		throw new Error(
			"Invalid Desktop launch RPC response; credentials were not logged.",
		);
	}
	throw new Error(
		"Desktop terminal launch was not confirmed; credentials were not logged.",
	);
}
