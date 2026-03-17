/** WebSocket message types between relay, nodes, and clients */
export type MessageType =
	| "auth"
	| "auth_ok"
	| "auth_error"
	| "node_register"
	| "node_heartbeat"
	| "proxy_request"
	| "proxy_response"
	| "proxy_error"
	| "signal_offer"
	| "signal_answer"
	| "signal_ice"
	| "node_list";

export interface WsMessage<T = unknown> {
	type: MessageType;
	payload: T;
	ts: number;
}

export function createMessage<T>(type: MessageType, payload: T): WsMessage<T> {
	return { type, payload, ts: Date.now() };
}

export function parseMessage(data: string): WsMessage {
	return JSON.parse(data) as WsMessage;
}
