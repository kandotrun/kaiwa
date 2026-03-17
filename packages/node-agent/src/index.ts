#!/usr/bin/env node
import { ProxyAgent } from "./agent.js";

const RELAY_URL = process.env.KAIWA_RELAY_URL ?? "ws://localhost:8787/ws";
const NODE_ID = process.env.KAIWA_NODE_ID ?? `node-${crypto.randomUUID().slice(0, 8)}`;
const TOKEN = process.env.KAIWA_TOKEN ?? "";

console.log(`[kaiwa-node] Starting node: ${NODE_ID}`);
console.log(`[kaiwa-node] Relay: ${RELAY_URL}`);

const agent = new ProxyAgent({ relayUrl: RELAY_URL, nodeId: NODE_ID, token: TOKEN });
agent.start();

process.on("SIGINT", () => {
	console.log("[kaiwa-node] Shutting down...");
	agent.stop();
	process.exit(0);
});
