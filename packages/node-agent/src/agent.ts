import type { ClientMessage, ProxyDataMessage, RelayMessage } from "@kaiwa/shared";
import WebSocket from "ws";
import { ProxyServer } from "./proxy.js";

interface AgentConfig {
	relayUrl: string;
	token: string;
	nodeId: string;
	heartbeatInterval?: number;
}

export class ProxyAgent {
	private ws: WebSocket | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private proxyServer: ProxyServer;
	private config: Required<AgentConfig>;

	constructor(config: AgentConfig) {
		this.config = {
			heartbeatInterval: 30_000,
			...config,
		};
		this.proxyServer = new ProxyServer();
	}

	start(): void {
		this.connect();
		console.log(`[kaiwa-agent] Starting node ${this.config.nodeId}`);
	}

	stop(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		this.ws?.close();
		this.ws = null;
		console.log("[kaiwa-agent] Stopped");
	}

	private connect(): void {
		this.ws = new WebSocket(this.config.relayUrl);

		this.ws.on("open", () => {
			console.log("[kaiwa-agent] Connected to relay");
			this.register();
			this.startHeartbeat();
		});

		this.ws.on("message", (data) => {
			const msg = JSON.parse(data.toString()) as RelayMessage;
			this.handleMessage(msg);
		});

		this.ws.on("close", () => {
			console.log("[kaiwa-agent] Disconnected, reconnecting in 5s...");
			setTimeout(() => this.connect(), 5000);
		});

		this.ws.on("error", (err) => {
			console.error("[kaiwa-agent] WebSocket error:", err.message);
		});
	}

	private register(): void {
		this.send({
			type: "register",
			nodeId: this.config.nodeId,
			token: this.config.token,
		});
	}

	private startHeartbeat(): void {
		this.heartbeatTimer = setInterval(() => {
			this.ws?.ping();
		}, this.config.heartbeatInterval);
	}

	private handleMessage(msg: RelayMessage): void {
		switch (msg.type) {
			case "registered":
				console.log(`[kaiwa-agent] Registered as ${msg.nodeId}`);
				break;
			case "sdp-offer":
				// TODO: Handle WebRTC offer for P2P connection
				console.log(`[kaiwa-agent] Received SDP offer for session ${msg.sessionId}`);
				break;
			case "ice-candidate":
				// TODO: Handle ICE candidate
				break;
			case "error":
				console.error(`[kaiwa-agent] Error: ${msg.message}`);
				break;
		}
	}

	async handleProxyRequest(msg: Extract<ProxyDataMessage, { type: "http-request" }>): Promise<Extract<ProxyDataMessage, { type: "http-response" }>> {
		return this.proxyServer.handleRequest(msg);
	}

	private send(msg: ClientMessage): void {
		this.ws?.send(JSON.stringify(msg));
	}
}
