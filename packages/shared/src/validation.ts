import { PRIVATE_IP_RANGES, SENSITIVE_REQUEST_HEADERS } from "./constants.js";

/**
 * Check if a hostname/IP resolves to a private/internal address.
 * Used to prevent SSRF attacks.
 */
export function isPrivateIp(hostname: string): boolean {
	const lower = hostname.toLowerCase();
	for (const range of PRIVATE_IP_RANGES) {
		if (lower.startsWith(range.prefix.toLowerCase())) {
			return true;
		}
	}
	// Also block bare IPv6 loopback
	if (lower === "::1" || lower === "[::1]") return true;
	// Block 0.0.0.0
	if (lower === "0.0.0.0") return true;
	return false;
}

/**
 * Validate a target URL for proxying.
 * Returns error message if invalid, null if OK.
 */
export function validateProxyUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (!["http:", "https:"].includes(parsed.protocol)) {
			return `Unsupported protocol: ${parsed.protocol}`;
		}
		if (isPrivateIp(parsed.hostname)) {
			return `Blocked private IP: ${parsed.hostname}`;
		}
		return null;
	} catch {
		return `Invalid URL: ${url}`;
	}
}

/**
 * Strip sensitive headers from a headers record.
 * Returns a new object with sensitive headers removed.
 */
export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
	const blocklist = new Set(SENSITIVE_REQUEST_HEADERS.map((h) => h.toLowerCase()));
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		if (!blocklist.has(key.toLowerCase())) {
			result[key] = value;
		}
	}
	return result;
}

/**
 * Generate an HMAC-SHA256 signature.
 * Uses Web Crypto API (works in both Node.js and CF Workers).
 */
export async function hmacSign(key: string, data: string): Promise<string> {
	const encoder = new TextEncoder();
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		encoder.encode(key),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
	return Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Verify an HMAC-SHA256 signature.
 */
export async function hmacVerify(key: string, data: string, signature: string): Promise<boolean> {
	const expected = await hmacSign(key, data);
	// Constant-time comparison
	if (expected.length !== signature.length) return false;
	let result = 0;
	for (let i = 0; i < expected.length; i++) {
		result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
	}
	return result === 0;
}
