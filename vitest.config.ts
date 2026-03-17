import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		workspace: [
			"packages/shared/vitest.config.ts",
			"packages/relay/vitest.config.ts",
			"packages/node-agent/vitest.config.ts",
			"packages/sdk/vitest.config.ts",
		],
	},
});
