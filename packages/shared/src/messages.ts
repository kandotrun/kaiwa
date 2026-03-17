/** Client → Relay messages */
export type ClientMessage =
	| { type: "register"; nodeId: string; token: string }
	| { type: "request-proxy"; targetNodeId: string; sessionId: string }
	| { type: "ice-candidate"; sessionId: string; candidate: RTCIceCandidateInit }
	| { type: "sdp-offer"; sessionId: string; sdp: string }
	| { type: "sdp-answer"; sessionId: string; sdp: string };

/** Relay → Client messages */
export type RelayMessage =
	| { type: "registered"; nodeId: string }
	| { type: "proxy-assigned"; sessionId: string; nodeId: string }
	| { type: "ice-candidate"; sessionId: string; candidate: RTCIceCandidateInit }
	| { type: "sdp-offer"; sessionId: string; sdp: string }
	| { type: "sdp-answer"; sessionId: string; sdp: string }
	| { type: "error"; code: ErrorCode; message: string };

/** Relay data messages (over WebRTC data channel or WS relay) */
export type ProxyDataMessage =
	| { type: "http-request"; requestId: string; method: string; url: string; headers: Record<string, string>; body?: string }
	| { type: "http-response"; requestId: string; status: number; headers: Record<string, string>; body?: string }
	| { type: "relay-data"; sessionId: string; data: string };

export type ErrorCode = "AUTH_FAILED" | "NODE_NOT_FOUND" | "NODE_OFFLINE" | "RELAY_FAILED";
