import {
	type ProxyRequest,
	type ProxyResponse,
	createMessage,
	parseMessage,
	hmacSign,
	TIMEOUTS,
	LIMITS,
} from "@kaiwa/shared";

export interface KaiwaClientOptions {
	/** API key for authentication */
	apiKey: string;
	/** API secret for signing tokens */
	apiSecret: string;
	/** Relay server URL (default: wss://relay.kaiwa.sh/ws) */
	relayUrl?: string;
	/** Request timeout in ms (default: 30000) */
	timeout?: number;
	/** Auto-reconnect on disconnect (default: true) */
	autoReconnect?: boolean;
}

export type KaiwaClientState = "disconnected" | "connecting" | "connected" | "error";

/**
 * Kaiwa SDK — route HTTP requests through residential IPs.
 *
 * Features:
 * - Type-safe API
 * - Auto-reconnect on disconnect
 * - Request timeout and retry logic
 * - Both browser and Node.js compatible
 *
 * @example
 * ```ts
 * import { KaiwaClient } from '@kaiwa/sdk';
 *
 * const kaiwa = new KaiwaClient({ apiKey: 'kw_xxx', apiSecret: 'secret' });
 * const res = await kaiwa.fetch('https://example.jp/api/data');
 * console.log(await res.text());
 * kaiwa.close();
 * ```
 */
export class KaiwaClient {
	private ws: WebSocket | null = null;
	private pending = new Map<
		string,
		{
			resolve: (res: ProxyResponse) => void;
			reject: (err: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	private opts: Required<KaiwaClientOptions>;
	private connectPromise: Promise<void> | null = null;
	private _state: KaiwaClientState = "disconnected";
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(opts: KaiwaClientOptions) {
		this.opts = {
			relayUrl: "wss://relay.kaiwa.sh/ws",
			timeout: TIMEOUTS.PROXY_REQUEST,
			autoReconnect: true,
			...opts,
		};
	}

	get state(): KaiwaClientState {
		return this._state;
	}

	/** Send an HTTP request through the proxy network */
	async fetch(url: string, init?: RequestInit): Promise<Response> {
		await this.ensureConnected();

		if (this.pending.size >= LIMITS.MAX_PENDING_REQUESTS) {
			throw new Error("Too many pending requests");
		}

		const requestId = crypto.randomUUID();
		const headers: Record<string, string> = {};
		if (init?.headers) {
			const h = new Headers(init.headers);
			h.forEach((v, k) => {
				headers[k] = v;
			});
		}

		let body: string | undefined;
		if (init?.body) {
			if (typeof init.body === "string") {
				body = btoa(init.body);
			} else if (init.body instanceof ArrayBuffer) {
				body = btoa(String.fromCharCode(...new Uint8Array(init.body)));
			}
		}

		const req: ProxyRequest = {
			requestId,
			method: init?.method ?? "GET",
			url,
			headers,
			body,
		};

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				if (this.pending.has(requestId)) {
					this.pending.delete(requestId);
					reject(new Error(`Request ${requestId} timed out`));
				}
			}, this.opts.timeout);

			this.pending.set(requestId, {
				resolve: (proxyRes) => {
					clearTimeout(timer);
					const responseBody = proxyRes.body
						? Uint8Array.from(atob(proxyRes.body), (c) => c.charCodeAt(0))
						: null;
					resolve(
						new Response(responseBody, {
							status: proxyRes.statusCode,
							headers: proxyRes.headers,
						}),
					);
				},
				reject: (err) => {
					clearTimeout(timer);
					reject(err);
				},
				timer,
			});

			if (this.ws?.readyState === WebSocket.OPEN) {
				this.ws.send(JSON.stringify(createMessage("proxy_request", req)));
			} else {
				this.pending.delete(requestId);
				clearTimeout(timer);
				reject(new Error("WebSocket not connected"));
			}
		});
	}

	/** Close the connection */
	close() {
		this.opts.autoReconnect = false;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		// Reject all pending requests
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error("Client closed"));
			this.pending.delete(id);
		}
		this.ws?.close();
		this.ws = null;
		this.connectPromise = null;
		this._state = "disconnected";
	}

	private async ensureConnected(): Promise<void> {
		if (this.ws?.readyState === WebSocket.OPEN) return;
		if (this.connectPromise) return this.connectPromise;

		this._state = "connecting";
		this.connectPromise = new Promise<void>((resolve, reject) => {
			this.ws = new WebSocket(this.opts.relayUrl);

			this.ws.addEventListener("open", async () => {
				try {
					// Send auth message
					const timestamp = Date.now();
					const data = `${this.opts.apiKey}:${timestamp}`;
					const signature = await hmacSign(this.opts.apiSecret, data);

					this.ws?.send(
						JSON.stringify(
							createMessage("auth", {
								apiKey: this.opts.apiKey,
								timestamp,
								signature,
							}),
						),
					);
				} catch (err) {
					reject(err);
				}
			});

			this.ws.addEventListener("message", (event) => {
				try {
					const msg = parseMessage(event.data as string);

					if (msg.type === "auth_ok") {
						this._state = "connected";
						this.reconnectAttempts = 0;
						resolve();
						return;
					}

					if (msg.type === "auth_error") {
						const payload = msg.payload as { message?: string };
						this._state = "error";
						reject(new Error(`Auth failed: ${payload.message}`));
						return;
					}

					if (msg.type === "proxy_response" || msg.type === "proxy_error") {
						const payload = msg.payload as ProxyResponse & {
							requestId: string;
							code?: string;
							message?: string;
						};
						const pending = this.pending.get(payload.requestId);
						if (pending) {
							this.pending.delete(payload.requestId);
							if (msg.type === "proxy_error") {
								pending.reject(
									new Error(payload.message ?? "Proxy error"),
								);
							} else {
								pending.resolve(payload);
							}
						}
					}

					if (msg.type === "error") {
						const payload = msg.payload as { requestId?: string; message?: string };
						if (payload.requestId) {
							const pending = this.pending.get(payload.requestId);
							if (pending) {
								this.pending.delete(payload.requestId);
								pending.reject(new Error(payload.message ?? "Error"));
							}
						}
					}
				} catch {
					// Ignore parse errors
				}
			});

			this.ws.addEventListener("error", () => {
				this._state = "error";
				reject(new Error("WebSocket connection failed"));
			});

			this.ws.addEventListener("close", () => {
				this.connectPromise = null;
				if (this._state === "connected" && this.opts.autoReconnect) {
					this._state = "disconnected";
					this.scheduleReconnect();
				}
			});
		});

		return this.connectPromise;
	}

	private scheduleReconnect(): void {
		if (!this.opts.autoReconnect) return;
		this.reconnectAttempts++;
		const delay = Math.min(
			TIMEOUTS.RECONNECT_BASE_DELAY * 2 ** this.reconnectAttempts,
			TIMEOUTS.RECONNECT_MAX_DELAY,
		);
		this.reconnectTimer = setTimeout(() => {
			this.connectPromise = null;
			this.ensureConnected().catch(() => {
				// Reconnect failed, will retry
			});
		}, delay);
	}
}
