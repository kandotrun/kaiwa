import { type WsMessage, createMessage, parseMessage } from "@kaiwa/shared";
import type { ProxyNode } from "@kaiwa/shared";

interface Session {
	ws: WebSocket;
	nodeId?: string;
	isNode: boolean;
}

/**
 * Durable Object — manages WebSocket connections for signaling & relay.
 *
 * Responsibilities:
 * 1. Node registration & heartbeat tracking
 * 2. WebRTC signaling (offer/answer/ICE exchange)
 * 3. Fallback relay when P2P fails
 */
export class SignalingRoom {
	private sessions = new Map<WebSocket, Session>();
	private nodes = new Map<string, ProxyNode>();

	constructor(
		private state: DurableObjectState,
		private env: unknown,
	) {}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/nodes") {
			return Response.json(Array.from(this.nodes.values()));
		}

		const upgrade = request.headers.get("Upgrade");
		if (upgrade !== "websocket") {
			return new Response("Expected WebSocket", { status: 426 });
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.state.acceptWebSocket(server);
		this.sessions.set(server, { ws: server, isNode: false });

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
		if (typeof data !== "string") return;

		const msg = parseMessage(data);
		const session = this.sessions.get(ws);
		if (!session) return;

		switch (msg.type) {
			case "node_register":
				this.handleNodeRegister(session, msg);
				break;
			case "node_heartbeat":
				this.handleHeartbeat(session);
				break;
			case "proxy_request":
				this.handleProxyRequest(session, msg);
				break;
			case "proxy_response":
			case "proxy_error":
				this.handleProxyResponse(msg);
				break;
			case "signal_offer":
			case "signal_answer":
			case "signal_ice":
				this.forwardSignaling(session, msg);
				break;
		}
	}

	async webSocketClose(ws: WebSocket) {
		const session = this.sessions.get(ws);
		if (session?.nodeId) {
			this.nodes.delete(session.nodeId);
		}
		this.sessions.delete(ws);
	}

	async webSocketError(ws: WebSocket) {
		this.webSocketClose(ws);
	}

	private handleNodeRegister(
		session: Session,
		msg: WsMessage,
	) {
		const payload = msg.payload as ProxyNode;
		session.isNode = true;
		session.nodeId = payload.id;
		this.nodes.set(payload.id, { ...payload, status: "online", lastSeen: Date.now() });
		session.ws.send(JSON.stringify(createMessage("auth_ok", { nodeId: payload.id })));
	}

	private handleHeartbeat(session: Session) {
		if (session.nodeId) {
			const node = this.nodes.get(session.nodeId);
			if (node) {
				node.lastSeen = Date.now();
				node.status = "online";
			}
		}
	}

	private handleProxyRequest(
		_session: Session,
		msg: WsMessage,
	) {
		// Find an available node and forward the request
		for (const [, s] of this.sessions) {
			if (s.isNode && s.nodeId) {
				s.ws.send(JSON.stringify(msg));
				return;
			}
		}
	}

	private handleProxyResponse(msg: WsMessage) {
		// Forward response back to the requesting client
		for (const [, s] of this.sessions) {
			if (!s.isNode) {
				s.ws.send(JSON.stringify(msg));
				return;
			}
		}
	}

	private forwardSignaling(
		_from: Session,
		msg: WsMessage,
	) {
		// Forward signaling messages to the peer
		const target = (msg.payload as { targetNodeId?: string }).targetNodeId;
		if (target) {
			for (const [, s] of this.sessions) {
				if (s.nodeId === target) {
					s.ws.send(JSON.stringify(msg));
					return;
				}
			}
		}
	}
}
