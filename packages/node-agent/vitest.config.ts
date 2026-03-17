import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "node-agent",
		include: ["src/**/*.test.ts"],
	},
});
