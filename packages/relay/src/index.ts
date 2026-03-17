import { Hono } from "hono";
import { cors } from "hono/cors";
import { SignalingRoom } from "./signaling.js";

export { SignalingRoom };

type Env = {
	SIGNALING: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

app.get("/", (c) => c.json({ name: "kaiwa-relay", version: "0.0.1" }));

app.get("/health", (c) => c.json({ ok: true }));

/** WebSocket upgrade — route to Durable Object */
app.get("/ws", async (c) => {
	const id = c.env.SIGNALING.idFromName("global");
	const stub = c.env.SIGNALING.get(id);
	return stub.fetch(c.req.raw);
});

/** List online nodes */
app.get("/nodes", async (c) => {
	const id = c.env.SIGNALING.idFromName("global");
	const stub = c.env.SIGNALING.get(id);
	const res = await stub.fetch(new Request("http://internal/nodes"));
	return c.json(await res.json());
});

export default app;
