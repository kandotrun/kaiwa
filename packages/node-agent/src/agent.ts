import {
	type WsMessage,
	type ProxyRequest,
	createMessage,
	parseMessage,
	hmacSign,
	TIMEOUTS,
} from "@kaiwa/shared";
import WebSocket from "ws";
import { ProxyServer } from "./proxy.js";

export interface AgentConfig {
	relayUrl: string;
	nodeId: string;
	preSharedKey: string;
	nodeSecret: string;
	heartbeatInterval?: number;
	ip?: string;
	ipType?: "residential" | "mobile" | "datacenter" | "unknown";
	country?: string;
	city?: string;
}

/**
 * ProxyAgent connects to the relay server and handles proxy requests.
 *
 * Features:
 * - Authenticated registration with HMAC-SHA256 signed tokens
 * - Exponential backoff reconnection
 * - Graceful shutdown
 * - Health reporting via heartbeats
 */
export class ProxyAgent {
	private ws: WebSocket | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private proxyServer: ProxyServer;
	private config: Required<
		Pick<AgentConfig, "relayUrl" | "nodeId" | "preSharedKey" | "nodeSecret" | "heartbeatInterval">
	> &
		AgentConfig;
	private reconnectAttempts = 0;
	private stopping = false;
	private activeRequests = 0;

	constructor(config: AgentConfig) {
		this.config = {
			heartbeatInterval: TIMEOUTS.HEARTBEAT_INTERVAL,
			...config,
		};
		this.proxyServer = new ProxyServer();
	}

	async start(): Promise<void> {
		this.stopping = false;
		await this.connect();
		// Log only metadata, never request content
		console.log(`[kaiwa-agent] Node ${this.config.nodeId} started`);
	}

	stop(): void {
		this.stopping = true;
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		this.ws?.close();
		this.ws = null;
		console.log("[kaiwa-agent] Stopped");
	}

	private async connect(): Promise<void> {
		if (this.stopping) return;

		try {
			this.ws = new WebSocket(this.config.relayUrl);
		} catch (err) {
			console.error("[kaiwa-agent] Connection failed:", (err as Error).message);
			this.scheduleReconnect();
			return;
		}

		this.ws.on("open", async () => {
			console.log("[kaiwa-agent] Connected to relay");
			this.reconnectAttempts = 0;
			await this.register();
			this.startHeartbeat();
		});

		this.ws.on("message", async (data) => {
			try {
				const msg = parseMessage(data.toString());
				await this.handleMessage(msg);
			} catch (err) {
				console.error("[kaiwa-agent] Message parse error:", (err as Error).message);
			}
		});

		this.ws.on("close", () => {
			if (!this.stopping) {
				console.log("[kaiwa-agent] Disconnected");
				this.scheduleReconnect();
			}
		});

		this.ws.on("error", (err) => {
			console.error("[kaiwa-agent] WebSocket error:", err.message);
		});
	}

	private scheduleReconnect(): void {
		if (this.stopping) return;
		this.reconnectAttempts++;
		const delay = Math.min(
			TIMEOUTS.RECONNECT_BASE_DELAY * 2 ** this.reconnectAttempts,
			TIMEOUTS.RECONNECT_MAX_DELAY,
		);
		console.log(`[kaiwa-agent] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
		setTimeout(() => this.connect(), delay);
	}

	private async register(): Promise<void> {
		const timestamp = Date.now();
		const data = `${this.config.nodeId}:${this.config.preSharedKey}:${timestamp}`;
		const signature = await hmacSign(this.config.nodeSecret, data);

		this.send(
			createMessage("node_register", {
				nodeId: this.config.nodeId,
				preSharedKey: this.config.preSharedKey,
				timestamp,
				signature,
				ip: this.config.ip,
				ipType: this.config.ipType,
				country: this.config.country,
				city: this.config.city,
			}),
		);
	}

	private startHeartbeat(): void {
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
		this.heartbeatTimer = setInterval(() => {
			this.send(
				createMessage("node_heartbeat", {
					nodeId: this.config.nodeId,
					activeConnections: this.activeRequests,
				}),
			);
		}, this.config.heartbeatInterval);
	}

	private async handleMessage(msg: WsMessage): Promise<void> {
		switch (msg.type) {
			case "auth_ok": {
				const payload = msg.payload as { nodeId?: string };
				console.log(`[kaiwa-agent] Registered as ${payload.nodeId ?? this.config.nodeId}`);
				break;
			}
			case "auth_error": {
				const payload = msg.payload as { message?: string };
				console.error(`[kaiwa-agent] Auth failed: ${payload.message}`);
				this.stop();
				break;
			}
			case "proxy_request": {
				const payload = msg.payload as ProxyRequest;
				this.activeRequests++;
				const startTime = Date.now();
				try {
					const response = await this.proxyServer.handleRequest(payload);
					this.send(createMessage("proxy_response", response));
					// Log only metadata, never URLs or bodies
					console.log(
						`[kaiwa-agent] req=${payload.requestId} status=${response.statusCode} time=${Date.now() - startTime}ms`,
					);
				} catch (err) {
					this.send(
						createMessage("proxy_error", {
							requestId: payload.requestId,
							code: "PROXY_REQUEST_FAILED",
							message: err instanceof Error ? err.message : "Unknown error",
						}),
					);
				} finally {
					this.activeRequests--;
				}
				break;
			}
			case "error": {
				const payload = msg.payload as { code?: string; message?: string };
				console.error(`[kaiwa-agent] Error: ${payload.code} - ${payload.message}`);
				break;
			}
		}
	}

	private send(msg: WsMessage): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}
}
