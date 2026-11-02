import assert from "node:assert/strict";
import { test } from "node:test";
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	readFileSync,
	readdirSync,
	existsSync,
	watch,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DesktopSurfaceProvider } from "../../maestro/surfaces/desktop/desktop-surface-provider.ts";
import { shellQuote } from "../../maestro/core/shell.ts";
import {
	TEST_MODEL,
	TEST_PROVIDER_URL,
	requireTestAuthorization,
} from "../integration/fake-provider.ts";

function waitForFile(
	dir: string,
	file: string,
	predicate: (content: string) => boolean,
	signal: AbortSignal,
): Promise<string> {
	return new Promise((resolveResult, reject) => {
		const finish = (error?: Error, content = "") => {
			clearTimeout(timer);
			watcher.close();
			signal.removeEventListener("abort", abort);
			if (error) reject(error);
			else resolveResult(content);
		};
		const abort = () => finish(new Error("Desktop test observation aborted"));
		const timer = setTimeout(
			() =>
				finish(new Error(`Desktop evidence not delivered; retained at ${dir}`)),
			60_000,
		);
		const check = () => {
			try {
				if (!existsSync(file)) return;
				const content = readFileSync(file, "utf8");
				if (predicate(content)) finish(undefined, content);
			} catch (error) {
				finish(error instanceof Error ? error : new Error(String(error)));
			}
		};
		const watcher = watch(dir, check);
		signal.addEventListener("abort", abort, { once: true });
		check();
	});
}

function createFixture() {
	const provider = new DesktopSurfaceProvider();
	assert.equal(
		provider.isAvailable(),
		true,
		"Run the explicit Desktop suite from a local hc terminal",
	);
	const root = mkdtempSync(join(tmpdir(), "pi-desktop-lifecycle-"));
	const home = join(root, "agent");
	const credential = randomUUID();
	requireTestAuthorization(credential);
	mkdirSync(join(home, "extensions"), { recursive: true });
	const extension = resolve(
		import.meta.dirname,
		"../../pi-extension/subagents/index.ts",
	);
	writeFileSync(
		join(home, "extensions", "subagents.ts"),
		`export { default } from ${JSON.stringify(extension)};\n`,
	);
	writeFileSync(
		join(home, "settings.json"),
		JSON.stringify({ packages: [], quietStartup: true }),
	);
	writeFileSync(
		join(home, "models.json"),
		JSON.stringify({
			providers: {
				"pi-integration": {
					baseUrl: TEST_PROVIDER_URL,
					api: "openai-completions",
					apiKey: "$DESKTOP_TEST_API_KEY",
					compat: {
						supportsDeveloperRole: false,
						supportsReasoningEffort: false,
						supportsUsageInStreaming: false,
					},
					models: [
						{
							id: "test",
							name: "Deterministic local fixture",
							reasoning: false,
							input: ["text"],
							contextWindow: 128000,
							maxTokens: 4096,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						},
					],
				},
			},
		}),
	);
	mkdirSync(join(root, ".pi", "agents"), { recursive: true });
	for (const name of ["desktop-leaf", "test-echo"]) {
		writeFileSync(
			join(root, ".pi", "agents", `${name}.md`),
			`---\nname: ${name}\ndescription: Deterministic local leaf\nspawning: false\nauto-exit: true\n---\nFollow the test task. Do not start other agents.\n`,
		);
	}
	const previousHome = process.env.PI_CODING_AGENT_DIR;
	const previousKey = process.env.DESKTOP_TEST_API_KEY;
	process.env.PI_CODING_AGENT_DIR = home;
	process.env.DESKTOP_TEST_API_KEY = credential;
	let parent: string;
	try {
		parent = provider.createSurface({ name: "desktop-test-parent", cwd: root });
	} finally {
		if (previousHome === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousHome;
		if (previousKey === undefined) delete process.env.DESKTOP_TEST_API_KEY;
		else process.env.DESKTOP_TEST_API_KEY = previousKey;
	}
	const session = join(root, "parent.jsonl");
	const controller = new AbortController();
	return {
		provider,
		root,
		parent,
		session,
		controller,
		async launch(task: string) {
			await provider.waitForShellReady(parent);
			provider.runScript(
				parent,
				`PI_OFFLINE=1 PI_CODING_AGENT_DIR=${shellQuote(home)} pi -ne -e ${shellQuote(extension)} --no-context-files --no-skills --no-prompt-templates --no-mcp --session ${shellQuote(session)} --model ${shellQuote(TEST_MODEL)} --thinking off ${shellQuote(task)}`,
				{ scriptPath: join(root, "start.sh"), scriptPreamble: "" },
			);
		},
		result() {
			return waitForFile(
				root,
				session,
				(text) => text.includes('"customType":"subagent_result"'),
				controller.signal,
			);
		},
		async close() {
			controller.abort();
			provider.closeSurface(parent);
			await provider.waitForSurfaceAbsence(parent);
			const live = JSON.parse(
				execFileSync(
					"hc",
					["ls", "--json", "--label", `piha.parent=${parent}`],
					{ encoding: "utf8" },
				),
			);
			assert.deepEqual(live.terminals, [], "No test-owned child remains live");
			for (const file of readdirSync(root, {
				recursive: true,
				encoding: "utf8",
			})) {
				if (/\.(sh|json|jsonl)$/.test(file))
					assert.equal(
						readFileSync(join(root, file), "utf8").includes(credential),
						false,
						"Authentication must not be persisted in scripts, config or sessions",
					);
			}
			console.log(
				`Desktop lifecycle evidence retained: ${root}; stopped parent: ${parent}`,
			);
		},
	};
}

const options = { skip: process.env.PI_TEST_DESKTOP !== "1", timeout: 90_000 };

test(
	"Desktop parent launches a real Pi child and receives its result",
	options,
	async () => {
		const fixture = createFixture();
		try {
			await fixture.launch(
				'Call subagent with name: "desktop-test-api", task: "Return exactly DESKTOP_CHILD_OK", agent: "desktop-leaf"',
			);
			const text = await fixture.result();
			const entries = text
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line));
			const delivery = entries.find(
				(entry) =>
					entry.type === "custom_message" &&
					entry.customType === "subagent_result",
			);
			assert.ok(delivery, "Result is delivered to the actual parent session");
			assert.equal(delivery.details.exitCode, 0);
			assert.match(delivery.content, /DESKTOP_CHILD_OK/);
			assert.doesNotMatch(
				delivery.content,
				/Subagent failed|Subagent error|Launch failed/,
			);
			const resumed = waitForFile(
				fixture.root,
				fixture.session,
				(content) =>
					(content.match(/"customType":"subagent_result"/g) ?? []).length >= 2,
				fixture.controller.signal,
			);
			fixture.provider.runCommand(
				fixture.parent,
				`Call the subagent_resume tool with sessionPath: ${JSON.stringify(delivery.details.sessionFile)}, name: "desktop-test-resume", message: "RESUME_FOLLOWUP_INPUT: desktop"`,
			);
			const resumedEntries = (await resumed)
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line));
			const resumedDelivery = resumedEntries
				.filter(
					(entry) =>
						entry.type === "custom_message" &&
						entry.customType === "subagent_result",
				)
				.at(-1);
			assert.equal(resumedDelivery.details.exitCode, 0);
			assert.match(resumedDelivery.content, /RESUME_RESULT_desktop/);
		} finally {
			await fixture.close();
		}
	},
);

test(
	"Desktop persistent specialist accepts a follow-up task and stops cleanly",
	options,
	async () => {
		const fixture = createFixture();
		try {
			const start = join(fixture.root, "persistent-start");
			await fixture.launch(
				`INTEGRATION_PERSISTENT_SPECIALIST:desktop\nPERSISTENT_START_FILE: ${start}`,
			);
			const text = await waitForFile(
				fixture.root,
				fixture.session,
				(content) => content.includes("PERSISTENT_LIFECYCLE_COMPLETE_desktop"),
				fixture.controller.signal,
			);
			const entries = text
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line));
			const deliveries = entries.filter(
				(entry) =>
					entry.type === "custom_message" &&
					entry.customType === "subagent_result",
			);
			assert.equal(deliveries.length, 2);
			assert.match(deliveries[0].content, /PERSISTENT_TASK_1_RESULT_desktop/);
			assert.match(deliveries[1].content, /PERSISTENT_TASK_2_RESULT_desktop/);
			assert.match(text, /Persistent specialist stopped\./);
		} finally {
			await fixture.close();
		}
	},
);

test(
	"Desktop parent cancels an active Pi child and receives one confirmed result",
	options,
	async () => {
		const fixture = createFixture();
		try {
			const start = join(fixture.root, "child-started");
			const gate = join(fixture.root, "cancel-gate");
			await fixture.launch(
				`INTEGRATION_CANCEL:desktop:basic\nCANCEL_START_FILE: ${start}\nCANCEL_GATE_FILE: ${gate}\nCANCEL_SLEEP: 30\nCANCEL_MODELS: ${TEST_MODEL}`,
			);
			await waitForFile(
				fixture.root,
				start,
				(text) => text.includes("START_desktop"),
				fixture.controller.signal,
			);
			writeFileSync(gate, "cancel now\n");
			const text = await fixture.result();
			const entries = text
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line));
			const deliveries = entries.filter(
				(entry) =>
					entry.type === "custom_message" &&
					entry.customType === "subagent_result",
			);
			assert.equal(deliveries.length, 1);
			assert.equal(deliveries[0].details.error, "cancelled");
			assert.equal(deliveries[0].details.cancellation.termination, "confirmed");
			assert.equal(
				existsSync(`${start}.done`),
				false,
				"The cancelled task never reaches its final write",
			);
		} finally {
			await fixture.close();
		}
	},
);
