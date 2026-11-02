import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Import before the extension: configuration is loaded during module evaluation.
const directory = mkdtempSync(join(tmpdir(), "initfix-test-agent-"));
process.env.PI_CODING_AGENT_DIR = directory;
// Unit fixtures must not discover or control the caller's Desktop terminals.
delete process.env.HC_TERMINAL_ID;
delete process.env.HC_TERMINAL_SOCKET;
delete process.env.HC_SCOPE;
process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
