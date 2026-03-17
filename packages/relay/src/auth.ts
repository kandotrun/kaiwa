import { SECURITY_HEADERS, hmacVerify } from "@kaiwa/shared";
import type { Context, Next } from "hono";

export interface AuthEnv {
	API_SECRET: string;
	NODE_SECRET: string;
}

/**
 * Verify a client API key auth token.
 * Token format: apiKey:timestamp:signature
 * Signature = HMAC-SHA256(API_SECRET, apiKey + ":" + timestamp)
 */
export async function verifyClientAuth(
	apiKey: string,
	timestamp: number,
	signature: string,
	secret: string,
): Promise<boolean> {
	// Reject tokens older than 5 minutes
	const age = Date.now() - timestamp;
	if (age > 5 * 60 * 1000 || age < -60_000) return false;

	const data = `${apiKey}:${timestamp}`;
	return hmacVerify(secret, data, signature);
}

/**
 * Verify a node registration auth token.
 * Signature = HMAC-SHA256(NODE_SECRET, nodeId + ":" + preSharedKey + ":" + timestamp)
 */
export async function verifyNodeAuth(
	nodeId: string,
	preSharedKey: string,
	timestamp: number,
	signature: string,
	secret: string,
): Promise<boolean> {
	const age = Date.now() - timestamp;
	if (age > 5 * 60 * 1000 || age < -60_000) return false;

	const data = `${nodeId}:${preSharedKey}:${timestamp}`;
	return hmacVerify(secret, data, signature);
}

/**
 * Auth middleware for HTTP endpoints.
 * Expects header: Authorization: Bearer <apiKey>:<timestamp>:<signature>
 */
export function authMiddleware() {
	return async (c: Context<{ Bindings: AuthEnv }>, next: Next) => {
		const authHeader = c.req.header("Authorization");
		if (!authHeader?.startsWith("Bearer ")) {
			return c.json({ error: "Authorization required" }, 401);
		}

		const token = authHeader.slice(7);
		const parts = token.split(":");
		if (parts.length !== 3) {
			return c.json({ error: "Invalid token format" }, 401);
		}

		const [apiKey, timestampStr, signature] = parts;
		const timestamp = Number.parseInt(timestampStr, 10);
		if (Number.isNaN(timestamp)) {
			return c.json({ error: "Invalid timestamp" }, 401);
		}

		const secret = c.env.API_SECRET || "dev-secret";
		const valid = await verifyClientAuth(apiKey, timestamp, signature, secret);
		if (!valid) {
			return c.json({ error: "Invalid or expired token" }, 401);
		}

		// Store the api key for rate limiting
		c.set("apiKey", apiKey);
		await next();
	};
}

/**
 * Add security headers to all responses.
 */
export function securityHeadersMiddleware() {
	return async (c: Context, next: Next) => {
		await next();
		for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
			c.res.headers.set(key, value);
		}
	};
}
