/** Node status in the network */
export type NodeStatus = "online" | "offline" | "busy";

/** IP type classification */
export type IpType = "residential" | "mobile" | "datacenter" | "unknown";

/** Registered proxy node */
export interface ProxyNode {
	id: string;
	ip: string;
	ipType: IpType;
	country: string;
	city?: string;
	status: NodeStatus;
	lastSeen: number;
}

/** Authentication token payload */
export interface AuthPayload {
	apiKey: string;
	nodeId?: string;
}

/** Proxy request from client to node */
export interface ProxyRequest {
	requestId: string;
	method: string;
	url: string;
	headers: Record<string, string>;
	body?: string; // base64
}

/** Proxy response from node to client */
export interface ProxyResponse {
	requestId: string;
	statusCode: number;
	headers: Record<string, string>;
	body?: string; // base64
}
