import { describe, expect, it } from "vitest";
import { NDJSONItemGenerator } from "../src/ndjson-generator";

describe("NDJSONItemGenerator", () => {
	it("creates a new item on each GetNext() call", () => {
		const generator = new NDJSONItemGenerator();

		expect(generator.GetNext()).toEqual({
			id: 1,
			title: "Book 1",
			author: "Author 1",
		});
		expect(generator.GetNext()).toEqual({
			id: 2,
			title: "Book 2",
			author: "Author 2",
		});
	});
});
