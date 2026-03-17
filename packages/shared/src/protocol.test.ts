import { describe, expect, it } from "vitest";
import { createMessage, parseMessage } from "./protocol.js";

describe("protocol", () => {
	describe("createMessage", () => {
		it("creates a message with type, payload, and timestamp", () => {
			const before = Date.now();
			const msg = createMessage("auth", { apiKey: "test" });
			const after = Date.now();

			expect(msg.type).toBe("auth");
			expect(msg.payload).toEqual({ apiKey: "test" });
			expect(msg.ts).toBeGreaterThanOrEqual(before);
			expect(msg.ts).toBeLessThanOrEqual(after);
		});
	});

	describe("parseMessage", () => {
		it("parses valid JSON messages", () => {
			const data = JSON.stringify({
				type: "auth_ok",
				payload: { nodeId: "n1" },
				ts: 1234567890,
			});
			const msg = parseMessage(data);
			expect(msg.type).toBe("auth_ok");
			expect(msg.payload).toEqual({ nodeId: "n1" });
		});

		it("throws on invalid JSON", () => {
			expect(() => parseMessage("not-json")).toThrow();
		});

		it("throws on missing type field", () => {
			expect(() => parseMessage(JSON.stringify({ payload: {} }))).toThrow(
				"Invalid WebSocket message format",
			);
		});
	});
});
