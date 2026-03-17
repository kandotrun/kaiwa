import http from "node:http";
import https from "node:https";
import {
	type ProxyRequest,
	type ProxyResponse,
	TIMEOUTS,
	isPrivateIp,
	sanitizeHeaders,
	validateProxyUrl,
} from "@kaiwa/shared";

/**
 * ProxyServer handles HTTP requests on behalf of clients.
 *
 * Security:
 * - Blocks private/internal IPs (SSRF prevention)
 * - Strips sensitive headers
 * - Does NOT store any proxied data
 * - Request timeout handling
 */
export class ProxyServer {
	async handleRequest(msg: ProxyRequest): Promise<ProxyResponse> {
		// Validate URL
		const urlError = validateProxyUrl(msg.url);
		if (urlError) {
			return {
				requestId: msg.requestId,
				statusCode: 403,
				headers: {},
				body: urlError,
			};
		}

		// Additional hostname check
		try {
			const parsed = new URL(msg.url);
			if (isPrivateIp(parsed.hostname)) {
				return {
					requestId: msg.requestId,
					statusCode: 403,
					headers: {},
					body: "Blocked: private IP address",
				};
			}
		} catch {
			return {
				requestId: msg.requestId,
				statusCode: 400,
				headers: {},
				body: "Invalid URL",
			};
		}

		// Sanitize request headers
		const sanitizedHeaders = sanitizeHeaders(msg.headers);

		try {
			const url = new URL(msg.url);
			const transport = url.protocol === "https:" ? https : http;

			return await new Promise<ProxyResponse>((resolve, reject) => {
				const timeout = setTimeout(() => {
					req.destroy();
					resolve({
						requestId: msg.requestId,
						statusCode: 504,
						headers: {},
						body: "Gateway timeout",
					});
				}, TIMEOUTS.PROXY_REQUEST);

				const req = transport.request(
					msg.url,
					{
						method: msg.method,
						headers: sanitizedHeaders,
						timeout: TIMEOUTS.PROXY_REQUEST,
					},
					(res) => {
						const chunks: Buffer[] = [];
						res.on("data", (chunk: Buffer) => chunks.push(chunk));
						res.on("end", () => {
							clearTimeout(timeout);
							const rawHeaders = res.headers as Record<string, string | string[] | undefined>;
							const responseHeaders: Record<string, string> = {};
							for (const [key, value] of Object.entries(rawHeaders)) {
								if (value !== undefined) {
									responseHeaders[key] = Array.isArray(value) ? value.join(", ") : value;
								}
							}
							resolve({
								requestId: msg.requestId,
								statusCode: res.statusCode ?? 500,
								headers: responseHeaders,
								body: Buffer.concat(chunks).toString("base64"),
							});
						});
						res.on("error", (err) => {
							clearTimeout(timeout);
							reject(err);
						});
					},
				);

				if (msg.body) {
					// Body is base64 encoded
					req.write(Buffer.from(msg.body, "base64"));
				}
				req.end();
				req.on("error", (err) => {
					clearTimeout(timeout);
					reject(err);
				});
			});
		} catch (err) {
			return {
				requestId: msg.requestId,
				statusCode: 502,
				headers: {},
				body: `Proxy error: ${err instanceof Error ? err.message : "Unknown error"}`,
			};
		}
	}
}
