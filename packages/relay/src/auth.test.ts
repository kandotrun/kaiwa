import { describe, expect, it } from "vitest";
import { hmacSign } from "@kaiwa/shared";
import { verifyClientAuth, verifyNodeAuth } from "./auth.js";

describe("relay auth", () => {
	describe("verifyClientAuth", () => {
		const secret = "test-api-secret";

		it("accepts valid token", async () => {
			const apiKey = "kw_test123";
			const timestamp = Date.now();
			const data = `${apiKey}:${timestamp}`;
			const signature = await hmacSign(secret, data);

			const valid = await verifyClientAuth(apiKey, timestamp, signature, secret);
			expect(valid).toBe(true);
		});

		it("rejects expired token (>5min old)", async () => {
			const apiKey = "kw_test123";
			const timestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
			const data = `${apiKey}:${timestamp}`;
			const signature = await hmacSign(secret, data);

			const valid = await verifyClientAuth(apiKey, timestamp, signature, secret);
			expect(valid).toBe(false);
		});

		it("rejects future token (>1min ahead)", async () => {
			const apiKey = "kw_test123";
			const timestamp = Date.now() + 2 * 60 * 1000; // 2 minutes ahead
			const data = `${apiKey}:${timestamp}`;
			const signature = await hmacSign(secret, data);

			const valid = await verifyClientAuth(apiKey, timestamp, signature, secret);
			expect(valid).toBe(false);
		});

		it("rejects wrong signature", async () => {
			const apiKey = "kw_test123";
			const timestamp = Date.now();

			const valid = await verifyClientAuth(apiKey, timestamp, "badsignature", secret);
			expect(valid).toBe(false);
		});

		it("rejects wrong secret", async () => {
			const apiKey = "kw_test123";
			const timestamp = Date.now();
			const data = `${apiKey}:${timestamp}`;
			const signature = await hmacSign("wrong-secret", data);

			const valid = await verifyClientAuth(apiKey, timestamp, signature, secret);
			expect(valid).toBe(false);
		});
	});

	describe("verifyNodeAuth", () => {
		const secret = "test-node-secret";

		it("accepts valid node token", async () => {
			const nodeId = "node-1";
			const psk = "my-pre-shared-key";
			const timestamp = Date.now();
			const data = `${nodeId}:${psk}:${timestamp}`;
			const signature = await hmacSign(secret, data);

			const valid = await verifyNodeAuth(nodeId, psk, timestamp, signature, secret);
			expect(valid).toBe(true);
		});

		it("rejects wrong PSK", async () => {
			const nodeId = "node-1";
			const psk = "correct-psk";
			const timestamp = Date.now();
			const data = `${nodeId}:${psk}:${timestamp}`;
			const signature = await hmacSign(secret, data);

			const valid = await verifyNodeAuth(nodeId, "wrong-psk", timestamp, signature, secret);
			expect(valid).toBe(false);
		});

		it("rejects expired token", async () => {
			const nodeId = "node-1";
			const psk = "my-psk";
			const timestamp = Date.now() - 10 * 60 * 1000;
			const data = `${nodeId}:${psk}:${timestamp}`;
			const signature = await hmacSign(secret, data);

			const valid = await verifyNodeAuth(nodeId, psk, timestamp, signature, secret);
			expect(valid).toBe(false);
		});
	});
});
