import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("NDJSON worker", () => {
	it("returns a matching CORS origin for allowed browser requests", async () => {
		const request = new IncomingRequest("http://example.com", {
			headers: {
				Origin: "http://localhost:5501",
			},
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5501");
	});

	it("responds to CORS preflight requests", async () => {
		const request = new IncomingRequest("http://example.com", {
			method: "OPTIONS",
			headers: {
				Origin: "https://demo.books-list-instant.pages.dev",
			},
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(204);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://demo.books-list-instant.pages.dev");
	});

	it("streams NDJSON content (unit style)", async () => {
		const request = new IncomingRequest("http://example.com");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		const body = await response.text();
		expect(body).toContain('"id":1');
		expect(body).toContain('"id":10');
		expect(response.headers.get("content-type")).toContain("application/x-ndjson");
	});

	it("streams NDJSON content (integration style)", async () => {
		const response = await SELF.fetch("https://example.com");
		const body = await response.text();
		expect(body).toContain('"id":1');
		expect(body).toContain('"id":10');
	});

	it("respects the num_records query parameter", async () => {
		const request = new IncomingRequest("http://example.com?num_records=3");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		const body = await response.text();
		expect(body).toContain('"id":1');
		expect(body).toContain('"id":3');
		expect(body).not.toContain('"id":4');
	});

	it("measures performance of streaming 1000 records", async () => {
		const originalSetTimeout = globalThis.setTimeout;
		globalThis.setTimeout = (((
			handler: TimerHandler,
			_timeout?: number,
			...args: unknown[]
		) => {
			if (typeof handler === "function") {
				handler(...args);
			}
			return 0 as ReturnType<typeof setTimeout>;
		}) as typeof setTimeout);

		try {
			const start = performance.now();
			const response = await SELF.fetch("https://example.com?num_records=1000");
			const body = await response.text();
			const durationMs = performance.now() - start;

			const lines = body.trim().split("\n");
			expect(lines).toHaveLength(1000);
			expect(lines[0]).toContain('"id":1');
			expect(lines[999]).toContain('"id":1000');
			expect(durationMs).toBeGreaterThanOrEqual(0);
			console.info(`Streamed 1000 records in ${durationMs.toFixed(2)} ms`);
		} finally {
			globalThis.setTimeout = originalSetTimeout;
		}
	});

	it("clamps delay query parameter to range 0..250 and defaults to 0", async () => {
		const originalSetTimeout = globalThis.setTimeout;

		const captureDelays = async (url: string): Promise<number[]> => {
			const delays: number[] = [];
			globalThis.setTimeout = (((
				handler: TimerHandler,
				timeout?: number,
				...args: unknown[]
			) => {
				delays.push(timeout ?? 0);
				if (typeof handler === "function") {
					handler(...args);
				}
				return 0 as ReturnType<typeof setTimeout>;
			}) as typeof setTimeout);

			const response = await SELF.fetch(url);
			await response.text();
			return delays;
		};

		try {
			const defaultDelays = await captureDelays("https://example.com?num_records=2");
			expect(defaultDelays).toEqual([0, 0]);

			const highDelays = await captureDelays("https://example.com?num_records=2&delay=999");
			expect(highDelays).toEqual([250, 250]);

			const lowDelays = await captureDelays("https://example.com?num_records=2&delay=-12");
			expect(lowDelays).toEqual([0, 0]);
		} finally {
			globalThis.setTimeout = originalSetTimeout;
		}
	});
});
