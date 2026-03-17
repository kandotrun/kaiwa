import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware, securityHeadersMiddleware } from "./auth.js";
import { SignalingRoom } from "./signaling.js";

export { SignalingRoom };

type Env = {
	SIGNALING: DurableObjectNamespace;
	API_SECRET: string;
	NODE_SECRET: string;
};

const app = new Hono<{ Bindings: Env }>();

// Security headers on all responses
app.use("*", securityHeadersMiddleware());
app.use("*", cors());

// ─── Public endpoints ──────────────────────────────

app.get("/", (c) => c.json({ name: "kaiwa-relay", version: "0.0.1", status: "ok" }));

app.get("/api/health", (c) => c.json({ ok: true, timestamp: Date.now() }));

// ─── Authenticated endpoints ───────────────────────

app.get("/api/nodes", authMiddleware(), async (c) => {
	const id = c.env.SIGNALING.idFromName("global");
	const stub = c.env.SIGNALING.get(id);
	const res = await stub.fetch(new Request("http://internal/nodes"));
	return c.json(await res.json());
});

// ─── WebSocket upgrade ─────────────────────────────

app.get("/ws", async (c) => {
	const upgrade = c.req.header("Upgrade");
	if (upgrade !== "websocket") {
		return c.json({ error: "Expected WebSocket upgrade" }, 426);
	}

	const id = c.env.SIGNALING.idFromName("global");
	const stub = c.env.SIGNALING.get(id);
	return stub.fetch(c.req.raw);
});

export default app;
