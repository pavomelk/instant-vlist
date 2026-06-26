import { describe, expect, it } from "vitest";
import { BOOK_CATEGORIES, PUBLISHER_ADJECTIVES, PUBLISHER_NOUNS } from "../src/book-data";
import { NDJSONItemGenerator } from "../src/ndjson-generator";

describe("NDJSONItemGenerator", () => {
	it("creates a new enriched book record on each GetNext() call", () => {
		const generator = new NDJSONItemGenerator();
		const first = generator.GetNext();
		const second = generator.GetNext();

		expect(first.id).toBe(1);
		expect(second.id).toBe(2);
		expect(first.title).toEqual(expect.any(String));
		expect(first.title.length).toBeGreaterThanOrEqual(80);
		expect(first.title.length).toBeLessThanOrEqual(2000);
		expect(first.isbn).toMatch(/^978-\d-\d{1,6}-\d{1,6}-\d$/);
		expect(first.publisher).toBe(`${PUBLISHER_ADJECTIVES[(1 * 7) % PUBLISHER_ADJECTIVES.length]} ${PUBLISHER_NOUNS[(1 * 11 + 3) % PUBLISHER_NOUNS.length]}`);
		expect(BOOK_CATEGORIES).toContain(first.category);
		expect(first.year).toBeGreaterThanOrEqual(1848);
		expect(first.year).toBeLessThanOrEqual(2026);
		expect(new Set([first.isbn, second.isbn]).size).toBe(2);
	});
});
