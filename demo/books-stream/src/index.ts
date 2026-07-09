/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { NDJSONItemGenerator } from "./ndjson-generator";

const allowedOrigins = new Set([
	"https://demo.books-list-instant.pages.dev",
	"https://books-list-instant.pages.dev",
	"http://127.0.0.1:5501",
]);

function getCorsOrigin(request: Request): string | null {
	const origin = request.headers.get("Origin");
	if (!origin || !allowedOrigins.has(origin)) {
		return null;
	}

	return origin;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const corsOrigin = getCorsOrigin(request);
		const corsHeaders = corsOrigin
			? {
				"Access-Control-Allow-Origin": corsOrigin,
				"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type",
			}
			: {
				"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type",
			};

		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: corsHeaders,
			});
		}

		const url = new URL(request.url);
		const requestedRecords = Number.parseInt(url.searchParams.get("num_records") ?? "10", 10);
		const count = Number.isFinite(requestedRecords) && requestedRecords > 0 ? requestedRecords : 10;
		const requestedDelay = Number.parseInt(url.searchParams.get("delay") ?? "0", 10);
		const delayMs = Number.isFinite(requestedDelay) ? clamp(requestedDelay, 0, 250) : 0;

		const generator = new NDJSONItemGenerator();
		const encoder = new TextEncoder();

		const stream = new ReadableStream({
			async start(controller) {
				for (let index = 0; index < count; index += 1) {
					const item = generator.GetNext();
					controller.enqueue(encoder.encode(`${JSON.stringify(item)}\n`));
					await new Promise((resolve) => setTimeout(resolve, delayMs));
				}
				controller.close();
			},
		});

		return new Response(stream, {
			headers: {
				...corsHeaders,
				"content-type": "application/x-ndjson; charset=utf-8",
			},
		});
	},
} satisfies ExportedHandler<Env>;
