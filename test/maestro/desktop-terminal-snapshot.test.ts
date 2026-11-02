import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
	inspectTerminal,
	parseTerminalList,
} from "../../maestro/surfaces/desktop/terminal-snapshot.ts";

test("lists live terminals and excludes finished terminals", () => {
	assert.deepEqual(
		parseTerminalList({
			terminals: [
				{ address: "t1", state: "live", name: "review", cwd: "/repo" },
				{ address: "t2", state: "finished" },
			],
		}),
		[{ id: "t1", name: "review", cwd: "/repo" }],
	);
});

test("rejects malformed, partial and duplicate snapshots", () => {
	for (const snapshot of [
		null,
		{},
		{ terminals: [{ address: "t1" }] },
		{ terminals: [{ state: "live" }] },
		{
			terminals: [
				{ address: "t1", state: "live" },
				{ address: "t1", state: "finished" },
			],
		},
	]) {
		assert.throws(() => parseTerminalList(snapshot));
	}
});

test("reports a running terminal without inventing an agent status", () => {
	assert.deepEqual(
		inspectTerminal({ address: "t1", state: "live", status: null }, "t1", 42),
		{ kind: "present", agentStatus: "unknown", observedAt: 42 },
	);
	assert.deepEqual(
		inspectTerminal(
			{ address: "t1", state: "live", status: { app: "pi", state: "blocked" } },
			"t1",
			42,
		),
		{ kind: "present", agentStatus: "blocked", agent: "pi", observedAt: 42 },
	);
});

test("confirms absence only from a matching finished terminal", () => {
	assert.equal(
		inspectTerminal({ address: "t1", state: "finished" }, "t1", 42).kind,
		"missing",
	);
	assert.throws(() =>
		inspectTerminal({ address: "t2", state: "finished" }, "t1", 42),
	);
	assert.throws(() => inspectTerminal({ address: "t1" }, "t1", 42));
});
