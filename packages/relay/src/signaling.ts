import {
	type WsMessage,
	type ProxyNode,
	createMessage,
	parseMessage,
	InboundWsMessageSchema,
	TIMEOUTS,
	LIMITS,
} from "@kaiwa/shared";
import { verifyClientAuth, verifyNodeAuth } from "./auth.js";

interface Session {
	ws: WebSocket;
	nodeId?: string;
	isNode: boolean;
	authenticated: boolean;
	apiKey?: string;
	/** Request IDs seen from this session (collision prevention) */
	seenRequestIds: Set<string>;
	/** Rate limit: timestamps of recent requests */
	requestTimestamps: number[];
}

/**
 * Durable Object — manages WebSocket connections for signaling & relay.
 *
 * Uses the Hibernation API for efficient WebSocket handling.
 *
 * Responsibilities:
 * 1. Node registration & heartbeat tracking with TTL-based cleanup
 * 2. Request routing: round-robin across online nodes
 * 3. Fallback relay when P2P fails
 * 4. Auth on all messages after handshake
 * 5. Rate limiting per API key
 */
export class SignalingRoom {
	private sessions = new Map<WebSocket, Session>();
	private nodes = new Map<string, ProxyNode>();
	/** Maps request IDs to the WebSocket of the requesting client */
	private pendingRequests = new Map<string, WebSocket>();
	/** Round-robin index for node selection */
	private roundRobinIndex = 0;
	/** Cleanup interval */
	private cleanupTimer: ReturnType<typeof setInterval> | null = null;

	constructor(
		private state: DurableObjectState,
		private env: Record<string, string>,
	) {
		// Schedule periodic cleanup
		this.cleanupTimer = setInterval(() => this.cleanupStaleNodes(), TIMEOUTS.NODE_TTL);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/nodes") {
			const nodes = Array.from(this.nodes.values()).map((n) => ({
				id: n.id,
				status: n.status,
				country: n.country,
				ipType: n.ipType,
				activeConnections: n.activeConnections,
			}));
			return Response.json(nodes);
		}

		const upgrade = request.headers.get("Upgrade");
		if (upgrade !== "websocket") {
			return new Response("Expected WebSocket", { status: 426 });
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.state.acceptWebSocket(server);
		this.sessions.set(server, {
			ws: server,
			isNode: false,
			authenticated: false,
			seenRequestIds: new Set(),
			requestTimestamps: [],
		});

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
		if (typeof data !== "string") return;

		// Size check
		if (data.length > LIMITS.MAX_WS_MESSAGE) {
			this.sendError(ws, "MESSAGE_TOO_LARGE", "Message exceeds size limit");
			return;
		}

		let msg: WsMessage;
		try {
			msg = parseMessage(data);
		} catch {
			this.sendError(ws, "INVALID_MESSAGE", "Failed to parse message");
			return;
		}

		const session = this.sessions.get(ws);
		if (!session) return;

		// First message must be auth or node_register
		if (!session.authenticated) {
			if (msg.type === "auth") {
				await this.handleAuth(session, msg);
				return;
			}
			if (msg.type === "node_register") {
				await this.handleNodeRegister(session, msg);
				return;
			}
			this.sendError(ws, "AUTH_REQUIRED", "Authentication required");
			return;
		}

		// Validate message schema
		const validation = InboundWsMessageSchema.safeParse(msg);
		if (!validation.success) {
			this.sendError(ws, "INVALID_MESSAGE", "Invalid message schema");
			return;
		}

		// Rate limiting
		if (!session.isNode && !this.checkRateLimit(session)) {
			this.sendError(ws, "AUTH_RATE_LIMITED", "Rate limit exceeded");
			return;
		}

		switch (msg.type) {
			case "node_heartbeat":
				this.handleHeartbeat(session);
				break;
			case "proxy_request":
				this.handleProxyRequest(session, msg, ws);
				break;
			case "proxy_response":
			case "proxy_error":
				this.handleProxyResponse(msg);
				break;
			case "signal_offer":
			case "signal_answer":
			case "signal_ice":
				this.forwardSignaling(msg);
				break;
		}
	}

	async webSocketClose(ws: WebSocket) {
		const session = this.sessions.get(ws);
		if (session?.nodeId) {
			this.nodes.delete(session.nodeId);
		}
		// Clean up any pending requests for this session
		for (const [reqId, reqWs] of this.pendingRequests) {
			if (reqWs === ws) {
				this.pendingRequests.delete(reqId);
			}
		}
		this.sessions.delete(ws);
	}

	async webSocketError(ws: WebSocket) {
		this.webSocketClose(ws);
	}

	// ─── Auth handlers ─────────────────────────────

	private async handleAuth(session: Session, msg: WsMessage) {
		const payload = msg.payload as {
			apiKey?: string;
			timestamp?: number;
			signature?: string;
		};

		if (!payload.apiKey || !payload.timestamp || !payload.signature) {
			this.sendError(session.ws, "AUTH_FAILED", "Missing auth fields");
			return;
		}

		const secret = this.env.API_SECRET || "dev-secret";
		const valid = await verifyClientAuth(
			payload.apiKey,
			payload.timestamp,
			payload.signature,
			secret,
		);

		if (!valid) {
			session.ws.send(
				JSON.stringify(
					createMessage("auth_error", {
						code: "AUTH_FAILED",
						message: "Invalid credentials",
					}),
				),
			);
			return;
		}

		session.authenticated = true;
		session.apiKey = payload.apiKey;
		session.ws.send(JSON.stringify(createMessage("auth_ok", {})));
	}

	private async handleNodeRegister(session: Session, msg: WsMessage) {
		const payload = msg.payload as {
			nodeId?: string;
			preSharedKey?: string;
			timestamp?: number;
			signature?: string;
			ip?: string;
			ipType?: string;
			country?: string;
			city?: string;
		};

		if (!payload.nodeId || !payload.preSharedKey || !payload.timestamp || !payload.signature) {
			this.sendError(session.ws, "AUTH_FAILED", "Missing node auth fields");
			return;
		}

		const secret = this.env.NODE_SECRET || "dev-node-secret";
		const valid = await verifyNodeAuth(
			payload.nodeId,
			payload.preSharedKey,
			payload.timestamp,
			payload.signature,
			secret,
		);

		if (!valid) {
			session.ws.send(
				JSON.stringify(
					createMessage("auth_error", {
						code: "AUTH_FAILED",
						message: "Invalid node credentials",
					}),
				),
			);
			return;
		}

		session.authenticated = true;
		session.isNode = true;
		session.nodeId = payload.nodeId;

		const node: ProxyNode = {
			id: payload.nodeId,
			ip: payload.ip,
			ipType: (payload.ipType as ProxyNode["ipType"]) ?? "unknown",
			country: payload.country,
			city: payload.city,
			status: "online",
			lastSeen: Date.now(),
			activeConnections: 0,
		};

		this.nodes.set(payload.nodeId, node);
		session.ws.send(
			JSON.stringify(createMessage("auth_ok", { nodeId: payload.nodeId })),
		);
	}

	// ─── Message handlers ──────────────────────────

	private handleHeartbeat(session: Session) {
		if (session.nodeId) {
			const node = this.nodes.get(session.nodeId);
			if (node) {
				node.lastSeen = Date.now();
				node.status = "online";
			}
		}
	}

	private handleProxyRequest(session: Session, msg: WsMessage, clientWs: WebSocket) {
		const payload = msg.payload as { requestId?: string };
		if (!payload.requestId) return;

		// Request ID collision prevention
		if (this.pendingRequests.has(payload.requestId)) {
			this.sendError(clientWs, "REQUEST_ID_COLLISION", "Duplicate request ID");
			return;
		}

		// Find an available node (round-robin)
		const nodeSession = this.selectNode();
		if (!nodeSession) {
			this.sendError(
				clientWs,
				"NODE_NOT_FOUND",
				"No online nodes available",
				payload.requestId,
			);
			return;
		}

		// Track the pending request
		this.pendingRequests.set(payload.requestId, clientWs);

		// Forward to node
		nodeSession.ws.send(JSON.stringify(msg));
	}

	private handleProxyResponse(msg: WsMessage) {
		const payload = msg.payload as { requestId?: string };
		if (!payload.requestId) return;

		const clientWs = this.pendingRequests.get(payload.requestId);
		if (clientWs) {
			this.pendingRequests.delete(payload.requestId);
			try {
				clientWs.send(JSON.stringify(msg));
			} catch {
				// Client disconnected
			}
		}
	}

	private forwardSignaling(msg: WsMessage) {
		const target = (msg.payload as { targetNodeId?: string }).targetNodeId;
		if (target) {
			for (const [, s] of this.sessions) {
				if (s.nodeId === target && s.authenticated) {
					s.ws.send(JSON.stringify(msg));
					return;
				}
			}
		}
	}

	// ─── Node selection ────────────────────────────

	private selectNode(): Session | null {
		const nodeSessions: Session[] = [];
		for (const [, s] of this.sessions) {
			if (s.isNode && s.authenticated && s.nodeId) {
				const node = this.nodes.get(s.nodeId);
				if (node?.status === "online") {
					nodeSessions.push(s);
				}
			}
		}

		if (nodeSessions.length === 0) return null;

		// Round-robin selection
		this.roundRobinIndex = this.roundRobinIndex % nodeSessions.length;
		const selected = nodeSessions[this.roundRobinIndex];
		this.roundRobinIndex++;
		return selected;
	}

	// ─── Rate limiting ─────────────────────────────

	private checkRateLimit(session: Session): boolean {
		const now = Date.now();
		// Remove old timestamps
		session.requestTimestamps = session.requestTimestamps.filter(
			(t) => now - t < LIMITS.RATE_LIMIT_WINDOW,
		);
		if (session.requestTimestamps.length >= LIMITS.RATE_LIMIT_RPM) {
			return false;
		}
		session.requestTimestamps.push(now);
		return true;
	}

	// ─── Cleanup ───────────────────────────────────

	private cleanupStaleNodes() {
		const now = Date.now();
		for (const [id, node] of this.nodes) {
			if (now - node.lastSeen > TIMEOUTS.NODE_TTL) {
				node.status = "offline";
				this.nodes.delete(id);
			}
		}
	}

	// ─── Helpers ───────────────────────────────────

	private sendError(ws: WebSocket, code: string, message: string, requestId?: string) {
		try {
			ws.send(
				JSON.stringify(
					createMessage("error", { code, message, requestId }),
				),
			);
		} catch {
			// WebSocket may be closed
		}
	}
}
