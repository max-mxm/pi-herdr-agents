import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DesktopSurfaceProvider } from "../../maestro/surfaces/desktop/desktop-surface-provider.ts";

test("creates and controls a desktop child terminal", async (t) => {
	const previous = process.env.HC_TERMINAL_ID;
	process.env.HC_TERMINAL_ID = "t1";
	t.after(() => {
		if (previous === undefined) delete process.env.HC_TERMINAL_ID;
		else process.env.HC_TERMINAL_ID = previous;
	});
	const calls: string[][] = [];
	const provider = new DesktopSurfaceProvider((args) => {
		calls.push(args);
		if (args[0] === "run") return { address: "t9", state: "live" };
		if (args[0] === "get")
			return {
				address: "t9",
				state: "live",
				pid: 12,
				foreground: { pid: 12, name: "bash" },
				status: null,
			};
		if (args[0] === "read") return { text: "screen" };
		return {};
	});
	assert.equal(provider.createSurface({ name: "test", cwd: "/tmp" }), "t9");
	await provider.waitForShellReady("t9");
	assert.equal(await provider.readScreen("t9"), "screen");
	provider.sendKeys("t9", "Escape");
	assert.deepEqual(calls.at(-1), ["keys", "t9", "esc"]);
});

test("fails closed on unsupported worktrees and uncertain terminal state", async () => {
	const provider = new DesktopSurfaceProvider(() => {
		throw new Error("offline");
	});
	assert.throws(
		() =>
			provider.createWorktreeSurface({
				name: "x",
				cwd: "/tmp",
				branch: "b",
				base: "main",
			}),
		/not supported/,
	);
	await assert.rejects(() => provider.listWorktreeSurfaces(), /not supported/);
	assert.equal((await provider.inspectSurface("t9")).kind, "unavailable");
	await assert.rejects(() => provider.waitForSurfaceAbsence("t9"), /offline/);
});

test("refuses to send commands or kill terminals it did not create", () => {
	let calls = 0;
	const provider = new DesktopSurfaceProvider(() => {
		calls++;
		return {};
	});
	assert.throws(() => provider.closeSurface("t1"), /unowned/);
	assert.throws(() => provider.runCommand("t1", "exit"), /unowned/);
	assert.throws(() => provider.sendKeys("t1", "Escape"), /unowned/);
	assert.throws(() => provider.attachSurface("t1"), /unowned/);
	assert.equal(calls, 0);
});

test("does not treat a live, mismatched or malformed reply as stopped", async () => {
	for (const response of [
		{ address: "t9", state: "live" },
		{ address: "t1", state: "finished" },
		{},
	]) {
		const provider = new DesktopSurfaceProvider(() => response);
		await assert.rejects(() => provider.waitForSurfaceAbsence("t9"));
	}
});

test("only confirms terminal disappearance from a finished response", async () => {
	const provider = new DesktopSurfaceProvider(() => ({
		address: "t9",
		state: "finished",
	}));
	await provider.waitForSurfaceAbsence("t9");
});
