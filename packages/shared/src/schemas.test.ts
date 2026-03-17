import { describe, expect, it } from "vitest";
import {
	ApiKeySchema,
	AuthTokenSchema,
	ClientAuthMessageSchema,
	HttpMethodSchema,
	InboundWsMessageSchema,
	IpTypeSchema,
	NodeAuthSchema,
	NodeHeartbeatMessageSchema,
	NodeIdSchema,
	NodeRegisterMessageSchema,
	NodeStatusSchema,
	ProxyErrorMessageSchema,
	ProxyNodeSchema,
	ProxyRequestMessageSchema,
	ProxyRequestSchema,
	ProxyResponseMessageSchema,
	ProxyResponseSchema,
	RequestIdSchema,
	SignalOfferMessageSchema,
} from "./schemas.js";

describe("schemas", () => {
	describe("RequestIdSchema", () => {
		it("accepts valid UUIDs", () => {
			expect(RequestIdSchema.safeParse("550e8400-e29b-41d4-a716-446655440000").success).toBe(true);
		});

		it("rejects non-UUID strings", () => {
			expect(RequestIdSchema.safeParse("not-a-uuid").success).toBe(false);
		});

		it("rejects empty string", () => {
			expect(RequestIdSchema.safeParse("").success).toBe(false);
		});
	});

	describe("NodeIdSchema", () => {
		it("accepts valid node IDs", () => {
			expect(NodeIdSchema.safeParse("node-abc123").success).toBe(true);
		});

		it("rejects empty string", () => {
			expect(NodeIdSchema.safeParse("").success).toBe(false);
		});

		it("rejects strings over 128 chars", () => {
			expect(NodeIdSchema.safeParse("x".repeat(129)).success).toBe(false);
		});
	});

	describe("ApiKeySchema", () => {
		it("accepts valid API keys", () => {
			expect(ApiKeySchema.safeParse("kw_test123").success).toBe(true);
		});

		it("rejects empty string", () => {
			expect(ApiKeySchema.safeParse("").success).toBe(false);
		});
	});

	describe("NodeStatusSchema", () => {
		it("accepts online/offline/busy", () => {
			expect(NodeStatusSchema.safeParse("online").success).toBe(true);
			expect(NodeStatusSchema.safeParse("offline").success).toBe(true);
			expect(NodeStatusSchema.safeParse("busy").success).toBe(true);
		});

		it("rejects invalid status", () => {
			expect(NodeStatusSchema.safeParse("inactive").success).toBe(false);
		});
	});

	describe("IpTypeSchema", () => {
		it("accepts all valid types", () => {
			for (const t of ["residential", "mobile", "datacenter", "unknown"]) {
				expect(IpTypeSchema.safeParse(t).success).toBe(true);
			}
		});

		it("rejects invalid type", () => {
			expect(IpTypeSchema.safeParse("vpn").success).toBe(false);
		});
	});

	describe("HttpMethodSchema", () => {
		it("accepts standard HTTP methods", () => {
			for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
				expect(HttpMethodSchema.safeParse(m).success).toBe(true);
			}
		});

		it("rejects non-standard methods", () => {
			expect(HttpMethodSchema.safeParse("TRACE").success).toBe(false);
		});
	});

	describe("AuthTokenSchema", () => {
		it("accepts valid auth token", () => {
			const result = AuthTokenSchema.safeParse({
				apiKey: "kw_test",
				timestamp: Date.now(),
				signature: "abc123def456",
			});
			expect(result.success).toBe(true);
		});

		it("rejects missing fields", () => {
			expect(AuthTokenSchema.safeParse({ apiKey: "kw_test" }).success).toBe(false);
		});
	});

	describe("NodeAuthSchema", () => {
		it("accepts valid node auth", () => {
			const result = NodeAuthSchema.safeParse({
				nodeId: "node-1",
				preSharedKey: "a-secure-key-that-is-long",
				timestamp: Date.now(),
				signature: "abc123",
			});
			expect(result.success).toBe(true);
		});

		it("rejects short preSharedKey", () => {
			const result = NodeAuthSchema.safeParse({
				nodeId: "node-1",
				preSharedKey: "short",
				timestamp: Date.now(),
				signature: "abc123",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("ProxyNodeSchema", () => {
		it("accepts valid proxy node", () => {
			const result = ProxyNodeSchema.safeParse({
				id: "node-1",
				status: "online",
				lastSeen: Date.now(),
			});
			expect(result.success).toBe(true);
		});

		it("accepts node with all optional fields", () => {
			const result = ProxyNodeSchema.safeParse({
				id: "node-1",
				ip: "203.0.113.1",
				ipType: "residential",
				country: "JP",
				city: "Tokyo",
				status: "online",
				lastSeen: Date.now(),
				activeConnections: 5,
			});
			expect(result.success).toBe(true);
		});
	});

	describe("ProxyRequestSchema", () => {
		it("accepts valid proxy request", () => {
			const result = ProxyRequestSchema.safeParse({
				requestId: "550e8400-e29b-41d4-a716-446655440000",
				method: "GET",
				url: "https://example.com/api",
				headers: { "User-Agent": "test" },
			});
			expect(result.success).toBe(true);
		});

		it("rejects invalid URL", () => {
			const result = ProxyRequestSchema.safeParse({
				requestId: "550e8400-e29b-41d4-a716-446655440000",
				method: "GET",
				url: "not-a-url",
				headers: {},
			});
			expect(result.success).toBe(false);
		});

		it("rejects invalid method", () => {
			const result = ProxyRequestSchema.safeParse({
				requestId: "550e8400-e29b-41d4-a716-446655440000",
				method: "INVALID",
				url: "https://example.com",
				headers: {},
			});
			expect(result.success).toBe(false);
		});
	});

	describe("ProxyResponseSchema", () => {
		it("accepts valid response", () => {
			const result = ProxyResponseSchema.safeParse({
				requestId: "550e8400-e29b-41d4-a716-446655440000",
				statusCode: 200,
				headers: { "content-type": "application/json" },
				body: "eyJ0ZXN0IjogdHJ1ZX0=",
			});
			expect(result.success).toBe(true);
		});

		it("rejects status code out of range", () => {
			expect(
				ProxyResponseSchema.safeParse({
					requestId: "550e8400-e29b-41d4-a716-446655440000",
					statusCode: 999,
					headers: {},
				}).success,
			).toBe(false);
		});
	});

	describe("WS Message Schemas", () => {
		const ts = Date.now();

		it("validates ClientAuthMessage", () => {
			expect(
				ClientAuthMessageSchema.safeParse({
					type: "auth",
					payload: { apiKey: "kw_test", timestamp: ts, signature: "sig123" },
					ts,
				}).success,
			).toBe(true);
		});

		it("validates NodeRegisterMessage", () => {
			expect(
				NodeRegisterMessageSchema.safeParse({
					type: "node_register",
					payload: {
						nodeId: "node-1",
						preSharedKey: "key123",
						timestamp: ts,
						signature: "sig123",
					},
					ts,
				}).success,
			).toBe(true);
		});

		it("validates NodeHeartbeatMessage", () => {
			expect(
				NodeHeartbeatMessageSchema.safeParse({
					type: "node_heartbeat",
					payload: { nodeId: "node-1", activeConnections: 3 },
					ts,
				}).success,
			).toBe(true);
		});

		it("validates ProxyRequestMessage", () => {
			expect(
				ProxyRequestMessageSchema.safeParse({
					type: "proxy_request",
					payload: {
						requestId: "550e8400-e29b-41d4-a716-446655440000",
						method: "GET",
						url: "https://example.com",
						headers: {},
					},
					ts,
				}).success,
			).toBe(true);
		});

		it("validates ProxyResponseMessage", () => {
			expect(
				ProxyResponseMessageSchema.safeParse({
					type: "proxy_response",
					payload: {
						requestId: "550e8400-e29b-41d4-a716-446655440000",
						statusCode: 200,
						headers: {},
					},
					ts,
				}).success,
			).toBe(true);
		});

		it("validates ProxyErrorMessage", () => {
			expect(
				ProxyErrorMessageSchema.safeParse({
					type: "proxy_error",
					payload: {
						requestId: "550e8400-e29b-41d4-a716-446655440000",
						code: "PROXY_TIMEOUT",
						message: "Timed out",
					},
					ts,
				}).success,
			).toBe(true);
		});

		it("validates SignalOfferMessage", () => {
			expect(
				SignalOfferMessageSchema.safeParse({
					type: "signal_offer",
					payload: {
						sessionId: "sess-1",
						targetNodeId: "node-1",
						sdp: "v=0...",
					},
					ts,
				}).success,
			).toBe(true);
		});
	});

	describe("InboundWsMessageSchema (discriminated union)", () => {
		const ts = Date.now();

		it("correctly discriminates auth message", () => {
			const result = InboundWsMessageSchema.safeParse({
				type: "auth",
				payload: { apiKey: "kw_test", timestamp: ts, signature: "sig" },
				ts,
			});
			expect(result.success).toBe(true);
		});

		it("correctly discriminates proxy_request message", () => {
			const result = InboundWsMessageSchema.safeParse({
				type: "proxy_request",
				payload: {
					requestId: "550e8400-e29b-41d4-a716-446655440000",
					method: "POST",
					url: "https://api.example.com/data",
					headers: { "Content-Type": "application/json" },
					body: "eyJ0ZXN0IjogdHJ1ZX0=",
				},
				ts,
			});
			expect(result.success).toBe(true);
		});

		it("rejects unknown message type", () => {
			const result = InboundWsMessageSchema.safeParse({
				type: "unknown_type",
				payload: {},
				ts,
			});
			expect(result.success).toBe(false);
		});
	});
});
