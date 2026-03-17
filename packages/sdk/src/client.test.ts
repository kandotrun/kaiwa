import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KaiwaClient } from "./client.js";

describe("KaiwaClient", () => {
	describe("constructor", () => {
		it("creates client with required options", () => {
			const client = new KaiwaClient({
				apiKey: "kw_test",
				apiSecret: "secret",
			});
			expect(client.state).toBe("disconnected");
			client.close();
		});

		it("creates client with custom options", () => {
			const client = new KaiwaClient({
				apiKey: "kw_test",
				apiSecret: "secret",
				relayUrl: "wss://custom.relay.com/ws",
				timeout: 60000,
				autoReconnect: false,
			});
			expect(client.state).toBe("disconnected");
			client.close();
		});
	});

	describe("state management", () => {
		it("starts in disconnected state", () => {
			const client = new KaiwaClient({
				apiKey: "kw_test",
				apiSecret: "secret",
			});
			expect(client.state).toBe("disconnected");
			client.close();
		});

		it("returns to disconnected state after close", () => {
			const client = new KaiwaClient({
				apiKey: "kw_test",
				apiSecret: "secret",
			});
			client.close();
			expect(client.state).toBe("disconnected");
		});
	});

	describe("close", () => {
		it("can be called multiple times safely", () => {
			const client = new KaiwaClient({
				apiKey: "kw_test",
				apiSecret: "secret",
			});
			client.close();
			client.close();
			client.close();
			expect(client.state).toBe("disconnected");
		});
	});

	describe("fetch", () => {
		it("throws when WebSocket is not available", async () => {
			// Mock WebSocket to fail connection
			const origWS = globalThis.WebSocket;
			globalThis.WebSocket = class MockWS {
				static CONNECTING = 0;
				static OPEN = 1;
				static CLOSING = 2;
				static CLOSED = 3;
				readyState = 3;
				close = vi.fn();
				send = vi.fn();
				addEventListener = vi.fn((event: string, handler: (ev: unknown) => void) => {
					if (event === "error") {
						setTimeout(() => handler(new Event("error")), 10);
					}
				});
				removeEventListener = vi.fn();
			} as unknown as typeof WebSocket;

			const client = new KaiwaClient({
				apiKey: "kw_test",
				apiSecret: "secret",
				relayUrl: "wss://nonexistent.example.com/ws",
				autoReconnect: false,
			});

			await expect(client.fetch("https://example.com")).rejects.toThrow();

			client.close();
			globalThis.WebSocket = origWS;
		});
	});
});
