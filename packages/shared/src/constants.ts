/** Headers that must be stripped before forwarding requests */
export const SENSITIVE_REQUEST_HEADERS = [
	"cookie",
	"authorization",
	"proxy-authorization",
	"x-forwarded-for",
	"x-real-ip",
	"x-forwarded-host",
	"x-forwarded-proto",
	"x-forwarded-port",
	"forwarded",
	"via",
	"cf-connecting-ip",
	"cf-ipcountry",
	"cf-ray",
	"cf-visitor",
	"true-client-ip",
	"x-cluster-client-ip",
	"x-client-ip",
	"x-originating-ip",
	"x-remote-ip",
	"x-remote-addr",
	"set-cookie",
] as const;

/** Headers that must be stripped from responses */
export const SENSITIVE_RESPONSE_HEADERS = ["set-cookie", "x-powered-by", "server"] as const;

/** Security headers to add to HTTP responses */
export const SECURITY_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"X-XSS-Protection": "0",
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
	"Referrer-Policy": "no-referrer",
	"Content-Security-Policy": "default-src 'none'",
};

/** Private/internal IP CIDR ranges that must be blocked (SSRF prevention) */
export const PRIVATE_IP_RANGES = [
	// IPv4
	{ prefix: "10.", description: "Class A private" },
	{ prefix: "172.16.", description: "Class B private" },
	{ prefix: "172.17.", description: "Class B private" },
	{ prefix: "172.18.", description: "Class B private" },
	{ prefix: "172.19.", description: "Class B private" },
	{ prefix: "172.20.", description: "Class B private" },
	{ prefix: "172.21.", description: "Class B private" },
	{ prefix: "172.22.", description: "Class B private" },
	{ prefix: "172.23.", description: "Class B private" },
	{ prefix: "172.24.", description: "Class B private" },
	{ prefix: "172.25.", description: "Class B private" },
	{ prefix: "172.26.", description: "Class B private" },
	{ prefix: "172.27.", description: "Class B private" },
	{ prefix: "172.28.", description: "Class B private" },
	{ prefix: "172.29.", description: "Class B private" },
	{ prefix: "172.30.", description: "Class B private" },
	{ prefix: "172.31.", description: "Class B private" },
	{ prefix: "192.168.", description: "Class C private" },
	{ prefix: "127.", description: "Loopback" },
	{ prefix: "0.", description: "Current network" },
	{ prefix: "169.254.", description: "Link-local" },
	{ prefix: "100.64.", description: "Carrier-grade NAT" },
	// IPv6
	{ prefix: "::1", description: "IPv6 loopback" },
	{ prefix: "fe80:", description: "IPv6 link-local" },
	{ prefix: "fc00:", description: "IPv6 unique local" },
	{ prefix: "fd", description: "IPv6 unique local" },
	// Hostnames
	{ prefix: "localhost", description: "Localhost" },
] as const;

/** Timeouts in milliseconds */
export const TIMEOUTS = {
	/** WebSocket connection timeout */
	WS_CONNECT: 10_000,
	/** Proxy request timeout */
	PROXY_REQUEST: 30_000,
	/** Node heartbeat interval */
	HEARTBEAT_INTERVAL: 30_000,
	/** Node TTL — considered offline if no heartbeat within this period */
	NODE_TTL: 90_000,
	/** Reconnection base delay */
	RECONNECT_BASE_DELAY: 1_000,
	/** Reconnection max delay */
	RECONNECT_MAX_DELAY: 60_000,
} as const;

/** Limits */
export const LIMITS = {
	/** Maximum request body size in bytes (10MB) */
	MAX_REQUEST_BODY: 10 * 1024 * 1024,
	/** Maximum WebSocket message size in bytes (1MB) */
	MAX_WS_MESSAGE: 1 * 1024 * 1024,
	/** Rate limit: requests per minute per API key */
	RATE_LIMIT_RPM: 60,
	/** Rate limit window in milliseconds */
	RATE_LIMIT_WINDOW: 60_000,
	/** Maximum pending requests per client */
	MAX_PENDING_REQUESTS: 100,
	/** Maximum number of nodes tracked */
	MAX_NODES: 1000,
} as const;
