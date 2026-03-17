import { describe, expect, it } from "vitest";
import { hmacSign, hmacVerify, isPrivateIp, sanitizeHeaders, validateProxyUrl } from "./validation.js";

describe("isPrivateIp", () => {
	it("blocks 10.x.x.x", () => {
		expect(isPrivateIp("10.0.0.1")).toBe(true);
		expect(isPrivateIp("10.255.255.255")).toBe(true);
	});

	it("blocks 172.16-31.x.x", () => {
		expect(isPrivateIp("172.16.0.1")).toBe(true);
		expect(isPrivateIp("172.31.255.255")).toBe(true);
	});

	it("blocks 192.168.x.x", () => {
		expect(isPrivateIp("192.168.0.1")).toBe(true);
		expect(isPrivateIp("192.168.1.100")).toBe(true);
	});

	it("blocks 127.x.x.x (loopback)", () => {
		expect(isPrivateIp("127.0.0.1")).toBe(true);
		expect(isPrivateIp("127.1.2.3")).toBe(true);
	});

	it("blocks localhost", () => {
		expect(isPrivateIp("localhost")).toBe(true);
	});

	it("blocks 0.0.0.0", () => {
		expect(isPrivateIp("0.0.0.0")).toBe(true);
	});

	it("blocks link-local 169.254.x.x", () => {
		expect(isPrivateIp("169.254.1.1")).toBe(true);
	});

	it("blocks IPv6 loopback", () => {
		expect(isPrivateIp("::1")).toBe(true);
		expect(isPrivateIp("[::1]")).toBe(true);
	});

	it("blocks IPv6 link-local", () => {
		expect(isPrivateIp("fe80:1234::1")).toBe(true);
	});

	it("blocks IPv6 unique local", () => {
		expect(isPrivateIp("fc00::1")).toBe(true);
		expect(isPrivateIp("fd12:3456::1")).toBe(true);
	});

	it("allows public IPs", () => {
		expect(isPrivateIp("203.0.113.1")).toBe(false);
		expect(isPrivateIp("8.8.8.8")).toBe(false);
		expect(isPrivateIp("1.1.1.1")).toBe(false);
	});

	it("allows public hostnames", () => {
		expect(isPrivateIp("example.com")).toBe(false);
		expect(isPrivateIp("api.example.jp")).toBe(false);
	});
});

describe("validateProxyUrl", () => {
	it("accepts valid HTTP URLs", () => {
		expect(validateProxyUrl("https://example.com")).toBe(null);
		expect(validateProxyUrl("http://api.example.com/path")).toBe(null);
	});

	it("rejects non-http protocols", () => {
		expect(validateProxyUrl("ftp://example.com")).toContain("Unsupported protocol");
		expect(validateProxyUrl("file:///etc/passwd")).toContain("Unsupported protocol");
	});

	it("rejects private IPs", () => {
		expect(validateProxyUrl("http://127.0.0.1/admin")).toContain("Blocked private IP");
		expect(validateProxyUrl("http://192.168.1.1/")).toContain("Blocked private IP");
		expect(validateProxyUrl("http://localhost:3000/")).toContain("Blocked private IP");
	});

	it("rejects invalid URLs", () => {
		expect(validateProxyUrl("not-a-url")).toContain("Invalid URL");
	});
});

describe("sanitizeHeaders", () => {
	it("strips cookie headers", () => {
		const result = sanitizeHeaders({
			Cookie: "session=abc123",
			"Content-Type": "application/json",
		});
		expect(result).not.toHaveProperty("Cookie");
		expect(result).toHaveProperty("Content-Type", "application/json");
	});

	it("strips authorization headers", () => {
		const result = sanitizeHeaders({
			Authorization: "Bearer token123",
			Accept: "text/html",
		});
		expect(result).not.toHaveProperty("Authorization");
		expect(result).toHaveProperty("Accept", "text/html");
	});

	it("strips forwarding headers (case-insensitive)", () => {
		const result = sanitizeHeaders({
			"x-forwarded-for": "1.2.3.4",
			"X-Real-IP": "5.6.7.8",
			"x-forwarded-host": "example.com",
			"User-Agent": "test",
		});
		expect(result).not.toHaveProperty("x-forwarded-for");
		expect(result).not.toHaveProperty("X-Real-IP");
		expect(result).not.toHaveProperty("x-forwarded-host");
		expect(result).toHaveProperty("User-Agent", "test");
	});

	it("strips Cloudflare headers", () => {
		const result = sanitizeHeaders({
			"cf-connecting-ip": "1.2.3.4",
			"cf-ipcountry": "JP",
			"cf-ray": "abc123",
		});
		expect(Object.keys(result)).toHaveLength(0);
	});

	it("preserves safe headers", () => {
		const result = sanitizeHeaders({
			"Content-Type": "text/html",
			"Accept-Language": "ja",
			"Cache-Control": "no-cache",
		});
		expect(Object.keys(result)).toHaveLength(3);
	});
});

describe("hmacSign / hmacVerify", () => {
	it("signs and verifies correctly", async () => {
		const key = "test-secret-key";
		const data = "hello:world:12345";

		const signature = await hmacSign(key, data);
		expect(typeof signature).toBe("string");
		expect(signature.length).toBeGreaterThan(0);

		const valid = await hmacVerify(key, data, signature);
		expect(valid).toBe(true);
	});

	it("rejects wrong data", async () => {
		const key = "test-secret-key";
		const signature = await hmacSign(key, "correct-data");

		const valid = await hmacVerify(key, "wrong-data", signature);
		expect(valid).toBe(false);
	});

	it("rejects wrong key", async () => {
		const signature = await hmacSign("correct-key", "data");

		const valid = await hmacVerify("wrong-key", "data", signature);
		expect(valid).toBe(false);
	});

	it("rejects tampered signature", async () => {
		const key = "test-secret-key";
		const signature = await hmacSign(key, "data");

		const tampered = `${signature.slice(0, -2)}00`;
		const valid = await hmacVerify(key, "data", tampered);
		expect(valid).toBe(false);
	});

	it("produces deterministic signatures", async () => {
		const key = "test-key";
		const data = "test-data";

		const sig1 = await hmacSign(key, data);
		const sig2 = await hmacSign(key, data);
		expect(sig1).toBe(sig2);
	});
});
