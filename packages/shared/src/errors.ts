/** Error codes used across all packages */
export const ErrorCodes = {
	// Auth errors (1xxx)
	AUTH_REQUIRED: "AUTH_REQUIRED",
	AUTH_INVALID_TOKEN: "AUTH_INVALID_TOKEN",
	AUTH_EXPIRED: "AUTH_EXPIRED",
	AUTH_RATE_LIMITED: "AUTH_RATE_LIMITED",

	// Node errors (2xxx)
	NODE_NOT_FOUND: "NODE_NOT_FOUND",
	NODE_OFFLINE: "NODE_OFFLINE",
	NODE_BUSY: "NODE_BUSY",
	NODE_REGISTRATION_FAILED: "NODE_REGISTRATION_FAILED",

	// Proxy errors (3xxx)
	PROXY_REQUEST_FAILED: "PROXY_REQUEST_FAILED",
	PROXY_TIMEOUT: "PROXY_TIMEOUT",
	PROXY_BLOCKED_IP: "PROXY_BLOCKED_IP",
	PROXY_INVALID_URL: "PROXY_INVALID_URL",

	// Protocol errors (4xxx)
	INVALID_MESSAGE: "INVALID_MESSAGE",
	MESSAGE_TOO_LARGE: "MESSAGE_TOO_LARGE",
	REQUEST_ID_COLLISION: "REQUEST_ID_COLLISION",

	// Internal errors (5xxx)
	INTERNAL_ERROR: "INTERNAL_ERROR",
	RELAY_UNAVAILABLE: "RELAY_UNAVAILABLE",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Structured error for the Kaiwa protocol */
export class KaiwaError extends Error {
	constructor(
		public readonly code: ErrorCode,
		message: string,
		public readonly details?: unknown,
	) {
		super(message);
		this.name = "KaiwaError";
	}

	toJSON() {
		return {
			code: this.code,
			message: this.message,
			...(this.details ? { details: this.details } : {}),
		};
	}
}
