import http from "node:http";
import https from "node:https";
import type { ProxyDataMessage } from "@kaiwa/shared";

type HttpRequest = Extract<ProxyDataMessage, { type: "http-request" }>;
type HttpResponse = Extract<ProxyDataMessage, { type: "http-response" }>;

export class ProxyServer {
	async handleRequest(msg: HttpRequest): Promise<HttpResponse> {
		try {
			const url = new URL(msg.url);
			const transport = url.protocol === "https:" ? https : http;

			return await new Promise<HttpResponse>((resolve, reject) => {
				const req = transport.request(
					msg.url,
					{
						method: msg.method,
						headers: msg.headers,
					},
					(res) => {
						const chunks: Buffer[] = [];
						res.on("data", (chunk: Buffer) => chunks.push(chunk));
						res.on("end", () => {
							resolve({
								type: "http-response",
								requestId: msg.requestId,
								status: res.statusCode ?? 500,
								headers: (res.headers as Record<string, string>) ?? {},
								body: Buffer.concat(chunks).toString("utf-8"),
							});
						});
						res.on("error", reject);
					},
				);

				if (msg.body) {
					req.write(msg.body);
				}
				req.end();
				req.on("error", reject);
			});
		} catch (err) {
			return {
				type: "http-response",
				requestId: msg.requestId,
				status: 502,
				headers: {},
				body: `Proxy error: ${err instanceof Error ? err.message : "Unknown error"}`,
			};
		}
	}
}
