import { createMessage, hmacSign } from "@kaiwa/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignalingRoom } from "./signaling.js";

// Mock WebSocket
function createMockWebSocket(): WebSocket & { sentMessages: string[] } {
	const messages: string[] = [];
	return {
		send: vi.fn((data: string) => messages.push(data)),
		close: vi.fn(),
		sentMessages: messages,
		readyState: 1,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(() => true),
		binaryType: "blob",
		bufferedAmount: 0,
		extensions: "",
		onclose: null,
		onerror: null,
		onmessage: null,
		onopen: null,
		protocol: "",
		url: "",
		CONNECTING: 0,
		OPEN: 1,
		CLOSING: 2,
		CLOSED: 3,
	} as unknown as WebSocket & { sentMessages: string[] };
}

// Mock DurableObjectState
function createMockState(): DurableObjectState {
	return {
		acceptWebSocket: vi.fn(),
		id: { toString: () => "test-id" },
	} as unknown as DurableObjectState;
}

describe("SignalingRoom", () => {
	let room: SignalingRoom;
	let state: DurableObjectState;
	const env = { API_SECRET: "test-api-secret", NODE_SECRET: "test-node-secret" };

	beforeEach(() => {
		state = createMockState();
		room = new SignalingRoom(state, env);
	});

	describe("fetch", () => {
		it("returns node list on /nodes endpoint", async () => {
			const req = new Request("http://internal/nodes");
			const res = await room.fetch(req);
			const body = await res.json();
			expect(Array.isArray(body)).toBe(true);
		});

		it("returns 426 for non-WebSocket requests", async () => {
			const req = new Request("http://internal/ws");
			const res = await room.fetch(req);
			expect(res.status).toBe(426);
		});
	});

	describe("webSocketMessage", () => {
		it("requires auth as first message", async () => {
			const ws = createMockWebSocket();
			const session = new Map();
			// Simulate sessions map by calling fetch first
			// We'll directly test by setting up the session
			(room as unknown as { sessions: Map<WebSocket, unknown> }).sessions.set(ws, {
				ws,
				isNode: false,
				authenticated: false,
				seenRequestIds: new Set(),
				requestTimestamps: [],
			});

			const msg = JSON.stringify(createMessage("proxy_request", { requestId: "abc" }));
			await room.webSocketMessage(ws, msg);

			expect(ws.send).toHaveBeenCalled();
			const sent = JSON.parse(ws.sentMessages[0]);
			expect(sent.type).toBe("error");
			expect(sent.payload.code).toBe("AUTH_REQUIRED");
		});

		it("rejects oversized messages", async () => {
			const ws = createMockWebSocket();
			(room as unknown as { sessions: Map<WebSocket, unknown> }).sessions.set(ws, {
				ws,
				isNode: false,
				authenticated: false,
				seenRequestIds: new Set(),
				requestTimestamps: [],
			});

			const bigData = "x".repeat(1024 * 1024 + 1);
			await room.webSocketMessage(ws, bigData);

			expect(ws.send).toHaveBeenCalled();
			const sent = JSON.parse(ws.sentMessages[0]);
			expect(sent.type).toBe("error");
			expect(sent.payload.code).toBe("MESSAGE_TOO_LARGE");
		});

		it("rejects malformed JSON", async () => {
			const ws = createMockWebSocket();
			(room as unknown as { sessions: Map<WebSocket, unknown> }).sessions.set(ws, {
				ws,
				isNode: false,
				authenticated: false,
				seenRequestIds: new Set(),
				requestTimestamps: [],
			});

			await room.webSocketMessage(ws, "not valid json{{{");

			expect(ws.send).toHaveBeenCalled();
			const sent = JSON.parse(ws.sentMessages[0]);
			expect(sent.type).toBe("error");
			expect(sent.payload.code).toBe("INVALID_MESSAGE");
		});

		it("authenticates client with valid credentials", async () => {
			const ws = createMockWebSocket();
			(room as unknown as { sessions: Map<WebSocket, unknown> }).sessions.set(ws, {
				ws,
				isNode: false,
				authenticated: false,
				seenRequestIds: new Set(),
				requestTimestamps: [],
			});

			const apiKey = "kw_test";
			const timestamp = Date.now();
			const signature = await hmacSign("test-api-secret", `${apiKey}:${timestamp}`);

			const msg = JSON.stringify(createMessage("auth", { apiKey, timestamp, signature }));
			await room.webSocketMessage(ws, msg);

			expect(ws.send).toHaveBeenCalled();
			const sent = JSON.parse(ws.sentMessages[0]);
			expect(sent.type).toBe("auth_ok");
		});

		it("rejects client with bad credentials", async () => {
			const ws = createMockWebSocket();
			(room as unknown as { sessions: Map<WebSocket, unknown> }).sessions.set(ws, {
				ws,
				isNode: false,
				authenticated: false,
				seenRequestIds: new Set(),
				requestTimestamps: [],
			});

			const msg = JSON.stringify(
				createMessage("auth", {
					apiKey: "kw_test",
					timestamp: Date.now(),
					signature: "bad-signature",
				}),
			);
			await room.webSocketMessage(ws, msg);

			const sent = JSON.parse(ws.sentMessages[0]);
			expect(sent.type).toBe("auth_error");
		});

		it("authenticates and registers node", async () => {
			const ws = createMockWebSocket();
			(room as unknown as { sessions: Map<WebSocket, unknown> }).sessions.set(ws, {
				ws,
				isNode: false,
				authenticated: false,
				seenRequestIds: new Set(),
				requestTimestamps: [],
			});

			const nodeId = "node-test-1";
			const psk = "my-pre-shared-key";
			const timestamp = Date.now();
			const data = `${nodeId}:${psk}:${timestamp}`;
			const signature = await hmacSign("test-node-secret", data);

			const msg = JSON.stringify(
				createMessage("node_register", {
					nodeId,
					preSharedKey: psk,
					timestamp,
					signature,
					country: "JP",
					ipType: "residential",
				}),
			);
			await room.webSocketMessage(ws, msg);

			const sent = JSON.parse(ws.sentMessages[0]);
			expect(sent.type).toBe("auth_ok");
			expect(sent.payload.nodeId).toBe(nodeId);

			// Check node is listed
			const nodesReq = new Request("http://internal/nodes");
			const nodesRes = await room.fetch(nodesReq);
			const nodes = (await nodesRes.json()) as Array<{ id: string }>;
			expect(nodes.some((n) => n.id === nodeId)).toBe(true);
		});

		it("returns error when no nodes available for proxy request", async () => {
			const ws = createMockWebSocket();
			(room as unknown as { sessions: Map<WebSocket, unknown> }).sessions.set(ws, {
				ws,
				isNode: false,
				authenticated: true,
				apiKey: "kw_test",
				seenRequestIds: new Set(),
				requestTimestamps: [],
			});

			const msg = JSON.stringify(
				createMessage("proxy_request", {
					requestId: "550e8400-e29b-41d4-a716-446655440000",
					method: "GET",
					url: "https://example.com",
					headers: {},
				}),
			);
			await room.webSocketMessage(ws, msg);

			const sent = JSON.parse(ws.sentMessages[0]);
			expect(sent.type).toBe("error");
			expect(sent.payload.code).toBe("NODE_NOT_FOUND");
		});
	});

	describe("webSocketClose", () => {
		it("removes session and node on close", async () => {
			const ws = createMockWebSocket();
			const sessions = (room as unknown as { sessions: Map<WebSocket, unknown> }).sessions;
			const nodes = (room as unknown as { nodes: Map<string, unknown> }).nodes;

			sessions.set(ws, {
				ws,
				isNode: true,
				nodeId: "node-1",
				authenticated: true,
				seenRequestIds: new Set(),
				requestTimestamps: [],
			});
			nodes.set("node-1", { id: "node-1", status: "online", lastSeen: Date.now() });

			await room.webSocketClose(ws);

			expect(sessions.has(ws)).toBe(false);
			expect(nodes.has("node-1")).toBe(false);
		});
	});
});
