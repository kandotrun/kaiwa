import { type ProxyRequest, type ProxyResponse, createMessage, parseMessage } from "@kaiwa/shared";

export interface KaiwaClientOptions {
	/** API key for authentication */
	apiKey: string;
	/** Relay server URL (default: wss://relay.kaiwa.sh/ws) */
	relayUrl?: string;
	/** Preferred country (default: JP) */
	country?: string;
}

/**
 * Kaiwa SDK — route HTTP requests through residential IPs.
 *
 * @example
 * ```ts
 * import { KaiwaClient } from '@kaiwa/sdk';
 *
 * const kaiwa = new KaiwaClient({ apiKey: 'kw_xxx' });
 * const res = await kaiwa.fetch('https://example.jp/api/data');
 * console.log(await res.text());
 * ```
 */
export class KaiwaClient {
	private ws: WebSocket | null = null;
	private pending = new Map<string, {
		resolve: (res: ProxyResponse) => void;
		reject: (err: Error) => void;
	}>();
	private opts: Required<KaiwaClientOptions>;
	private connectPromise: Promise<void> | null = null;

	constructor(opts: KaiwaClientOptions) {
		this.opts = {
			relayUrl: "wss://relay.kaiwa.sh/ws",
			country: "JP",
			...opts,
		};
	}

	/** Send an HTTP request through the proxy network */
	async fetch(url: string, init?: RequestInit): Promise<Response> {
		await this.ensureConnected();

		const requestId = crypto.randomUUID();
		const headers: Record<string, string> = {};
		if (init?.headers) {
			const h = new Headers(init.headers);
			h.forEach((v, k) => { headers[k] = v; });
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
			this.pending.set(requestId, {
				resolve: (proxyRes) => {
					const responseBody = proxyRes.body
						? Uint8Array.from(atob(proxyRes.body), (c) => c.charCodeAt(0))
						: null;
					resolve(new Response(responseBody, {
						status: proxyRes.statusCode,
						headers: proxyRes.headers,
					}));
				},
				reject,
			});

			this.ws!.send(JSON.stringify(createMessage("proxy_request", req)));

			// Timeout after 30s
			setTimeout(() => {
				if (this.pending.has(requestId)) {
					this.pending.delete(requestId);
					reject(new Error(`Request ${requestId} timed out`));
				}
			}, 30_000);
		});
	}

	/** Start a local HTTP proxy server (Node.js only) */
	async listen(_port: number): Promise<void> {
		// TODO: implement local proxy server using http.createServer
		throw new Error("listen() is not yet implemented");
	}

	/** Close the connection */
	close() {
		this.ws?.close();
		this.ws = null;
		this.connectPromise = null;
	}

	private async ensureConnected(): Promise<void> {
		if (this.ws?.readyState === WebSocket.OPEN) return;
		if (this.connectPromise) return this.connectPromise;

		this.connectPromise = new Promise((resolve, reject) => {
			this.ws = new WebSocket(this.opts.relayUrl);

			this.ws.addEventListener("open", () => {
				this.ws!.send(JSON.stringify(createMessage("auth", { apiKey: this.opts.apiKey })));
				resolve();
			});

			this.ws.addEventListener("message", (event) => {
				const msg = parseMessage(event.data as string);
				if (msg.type === "proxy_response" || msg.type === "proxy_error") {
					const payload = msg.payload as ProxyResponse & { error?: string };
					const pending = this.pending.get(payload.requestId);
					if (pending) {
						this.pending.delete(payload.requestId);
						if (msg.type === "proxy_error") {
							pending.reject(new Error(payload.error ?? "Proxy error"));
						} else {
							pending.resolve(payload);
						}
					}
				}
			});

			this.ws.addEventListener("error", () => reject(new Error("WebSocket connection failed")));
			this.ws.addEventListener("close", () => { this.connectPromise = null; });
		});

		return this.connectPromise;
	}
}
