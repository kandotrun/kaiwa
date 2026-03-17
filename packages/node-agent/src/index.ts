#!/usr/bin/env node
import { ProxyAgent } from "./agent.js";

const RELAY_URL = process.env.KAIWA_RELAY_URL ?? "ws://localhost:8787/ws";
const NODE_ID = process.env.KAIWA_NODE_ID ?? `node-${crypto.randomUUID().slice(0, 8)}`;
const PRE_SHARED_KEY = process.env.KAIWA_PRE_SHARED_KEY ?? "dev-psk";
const NODE_SECRET = process.env.KAIWA_NODE_SECRET ?? "dev-node-secret";

console.log(`[kaiwa-node] Starting node: ${NODE_ID}`);
console.log(`[kaiwa-node] Relay: ${RELAY_URL}`);

const agent = new ProxyAgent({
	relayUrl: RELAY_URL,
	nodeId: NODE_ID,
	preSharedKey: PRE_SHARED_KEY,
	nodeSecret: NODE_SECRET,
	ip: process.env.KAIWA_NODE_IP,
	ipType: (process.env.KAIWA_NODE_IP_TYPE as "residential" | "mobile" | "datacenter") ?? "unknown",
	country: process.env.KAIWA_NODE_COUNTRY ?? "JP",
	city: process.env.KAIWA_NODE_CITY,
});

agent.start();

// Graceful shutdown
const shutdown = () => {
	console.log("[kaiwa-node] Shutting down...");
	agent.stop();
	process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
