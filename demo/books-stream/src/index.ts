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

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const requestedRecords = Number.parseInt(url.searchParams.get("num_records") ?? "10", 10);
		const count = Number.isFinite(requestedRecords) && requestedRecords > 0 ? requestedRecords : 10;

		const generator = new NDJSONItemGenerator();
		const encoder = new TextEncoder();

		const stream = new ReadableStream({
			async start(controller) {
				for (let index = 0; index < count; index += 1) {
					const item = generator.GetNext();
					controller.enqueue(encoder.encode(`${JSON.stringify(item)}\n`));
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
				controller.close();
			},
		});

		return new Response(stream, {
			headers: {
				"content-type": "application/x-ndjson; charset=utf-8",
			},
		});
	},
} satisfies ExportedHandler<Env>;
