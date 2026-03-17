import { z } from "zod";

// ─── Common ────────────────────────────────────────
export const NodeStatusSchema = z.enum(["online", "offline", "busy"]);
export const IpTypeSchema = z.enum(["residential", "mobile", "datacenter", "unknown"]);

export const RequestIdSchema = z.string().uuid();
export const NodeIdSchema = z.string().min(1).max(128);
export const ApiKeySchema = z.string().min(1).max(256);

// ─── Auth ──────────────────────────────────────────
export const AuthTokenSchema = z.object({
	apiKey: ApiKeySchema,
	timestamp: z.number().int().positive(),
	signature: z.string().min(1),
});
export type AuthToken = z.infer<typeof AuthTokenSchema>;

export const NodeAuthSchema = z.object({
	nodeId: NodeIdSchema,
	preSharedKey: z.string().min(16).max(256),
	timestamp: z.number().int().positive(),
	signature: z.string().min(1),
});
export type NodeAuth = z.infer<typeof NodeAuthSchema>;

// ─── Proxy Node ────────────────────────────────────
export const ProxyNodeSchema = z.object({
	id: NodeIdSchema,
	ip: z.string().ip().optional(),
	ipType: IpTypeSchema.optional(),
	country: z.string().length(2).optional(),
	city: z.string().max(128).optional(),
	status: NodeStatusSchema,
	lastSeen: z.number().int().positive(),
	activeConnections: z.number().int().nonnegative().optional(),
});
export type ProxyNode = z.infer<typeof ProxyNodeSchema>;

// ─── Proxy Request/Response ────────────────────────
export const HttpMethodSchema = z.enum([
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
	"HEAD",
	"OPTIONS",
]);

export const ProxyRequestSchema = z.object({
	requestId: RequestIdSchema,
	method: HttpMethodSchema,
	url: z.string().url(),
	headers: z.record(z.string()),
	body: z.string().optional(),
});
export type ProxyRequest = z.infer<typeof ProxyRequestSchema>;

export const ProxyResponseSchema = z.object({
	requestId: RequestIdSchema,
	statusCode: z.number().int().min(100).max(599),
	headers: z.record(z.string()),
	body: z.string().optional(),
});
export type ProxyResponse = z.infer<typeof ProxyResponseSchema>;

// ─── WebSocket Messages ────────────────────────────

// Client → Relay
export const ClientAuthMessageSchema = z.object({
	type: z.literal("auth"),
	payload: z.object({
		apiKey: ApiKeySchema,
		timestamp: z.number().int().positive(),
		signature: z.string().min(1),
	}),
	ts: z.number(),
});

export const NodeRegisterMessageSchema = z.object({
	type: z.literal("node_register"),
	payload: z.object({
		nodeId: NodeIdSchema,
		preSharedKey: z.string().min(1),
		timestamp: z.number().int().positive(),
		signature: z.string().min(1),
		ip: z.string().optional(),
		ipType: IpTypeSchema.optional(),
		country: z.string().length(2).optional(),
		city: z.string().max(128).optional(),
	}),
	ts: z.number(),
});

export const NodeHeartbeatMessageSchema = z.object({
	type: z.literal("node_heartbeat"),
	payload: z.object({
		nodeId: NodeIdSchema,
		activeConnections: z.number().int().nonnegative().optional(),
	}),
	ts: z.number(),
});

export const ProxyRequestMessageSchema = z.object({
	type: z.literal("proxy_request"),
	payload: ProxyRequestSchema,
	ts: z.number(),
});

export const ProxyResponseMessageSchema = z.object({
	type: z.literal("proxy_response"),
	payload: ProxyResponseSchema,
	ts: z.number(),
});

export const ProxyErrorMessageSchema = z.object({
	type: z.literal("proxy_error"),
	payload: z.object({
		requestId: RequestIdSchema,
		code: z.string(),
		message: z.string(),
	}),
	ts: z.number(),
});

export const SignalOfferMessageSchema = z.object({
	type: z.literal("signal_offer"),
	payload: z.object({
		sessionId: z.string().min(1),
		targetNodeId: NodeIdSchema,
		sdp: z.string().min(1),
	}),
	ts: z.number(),
});

export const SignalAnswerMessageSchema = z.object({
	type: z.literal("signal_answer"),
	payload: z.object({
		sessionId: z.string().min(1),
		targetNodeId: NodeIdSchema,
		sdp: z.string().min(1),
	}),
	ts: z.number(),
});

export const SignalIceMessageSchema = z.object({
	type: z.literal("signal_ice"),
	payload: z.object({
		sessionId: z.string().min(1),
		targetNodeId: NodeIdSchema,
		candidate: z.string(),
	}),
	ts: z.number(),
});

// Relay → Client
export const AuthOkMessageSchema = z.object({
	type: z.literal("auth_ok"),
	payload: z.object({
		nodeId: NodeIdSchema.optional(),
	}),
	ts: z.number(),
});

export const AuthErrorMessageSchema = z.object({
	type: z.literal("auth_error"),
	payload: z.object({
		code: z.string(),
		message: z.string(),
	}),
	ts: z.number(),
});

export const NodeListMessageSchema = z.object({
	type: z.literal("node_list"),
	payload: z.object({
		nodes: z.array(ProxyNodeSchema),
	}),
	ts: z.number(),
});

export const ErrorMessageSchema = z.object({
	type: z.literal("error"),
	payload: z.object({
		code: z.string(),
		message: z.string(),
		requestId: z.string().optional(),
	}),
	ts: z.number(),
});

// ─── Union of all inbound WS messages ──────────────
export const InboundWsMessageSchema = z.discriminatedUnion("type", [
	ClientAuthMessageSchema,
	NodeRegisterMessageSchema,
	NodeHeartbeatMessageSchema,
	ProxyRequestMessageSchema,
	ProxyResponseMessageSchema,
	ProxyErrorMessageSchema,
	SignalOfferMessageSchema,
	SignalAnswerMessageSchema,
	SignalIceMessageSchema,
]);

export type InboundWsMessage = z.infer<typeof InboundWsMessageSchema>;
