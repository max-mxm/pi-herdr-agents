import assert from "node:assert/strict";
import { test } from "node:test";
import { authenticationEnvironment } from "../../maestro/surfaces/desktop/desktop-launch.ts";

test("forwards only authentication variables referenced by the configured connection", () => {
	const config = {
		providers: {
			proxy: {
				apiKey: "$PROXY_TEST_KEY",
				headers: { Authorization: "Bearer ${HEADER_TEST_TOKEN}" },
			},
		},
	};
	assert.deepEqual(
		authenticationEnvironment(config, {
			PROXY_TEST_KEY: "fixture-key",
			HEADER_TEST_TOKEN: "fixture-header",
			UNRELATED_SECRET: "not-forwarded",
		}),
		{ PROXY_TEST_KEY: "fixture-key", HEADER_TEST_TOKEN: "fixture-header" },
	);
});

test("includes credential references in per-model headers and overrides", () => {
	const config = {
		providers: {
			proxy: {
				models: [{ headers: { "X-Test": "$MODEL_TEST_TOKEN" } }],
				modelOverrides: {
					fixture: { headers: { "X-Test": "${OVERRIDE_TEST_TOKEN}" } },
				},
			},
		},
	};
	assert.deepEqual(
		authenticationEnvironment(config, {
			MODEL_TEST_TOKEN: "fixture-one",
			OVERRIDE_TEST_TOKEN: "fixture-two",
		}),
		{ MODEL_TEST_TOKEN: "fixture-one", OVERRIDE_TEST_TOKEN: "fixture-two" },
	);
});

test("does not execute commands, copy literal keys or forward escaped references", () => {
	const config = {
		providers: {
			literal: { apiKey: "literal-fixture" },
			command: { apiKey: "!printf $COMMAND_TEST_TOKEN" },
			escaped: { apiKey: "$$ESCAPED_TEST_TOKEN" },
			missing: { apiKey: "${MISSING_TEST_TOKEN}" },
		},
	};
	assert.deepEqual(
		authenticationEnvironment(config, {
			COMMAND_TEST_TOKEN: "not-forwarded",
			ESCAPED_TEST_TOKEN: "not-forwarded",
		}),
		{},
	);
});

test("handles absent authentication configuration without exporting the environment", () => {
	for (const config of [
		null,
		{},
		{ providers: [] },
		{ providers: { invalid: null } },
	]) {
		assert.deepEqual(
			authenticationEnvironment(config, { UNRELATED_SECRET: "not-forwarded" }),
			{},
		);
	}
});
