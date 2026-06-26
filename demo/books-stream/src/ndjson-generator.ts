import { BOOK_CATEGORIES, PUBLISHER_ADJECTIVES, PUBLISHER_NOUNS, TITLE_SUFFIXES, TITLE_WORDS } from "./book-data";

function createTitle(index: number): string {
	const wordCount = TITLE_WORDS.length;
	const seed = index % wordCount;
	const targetLength = 50 + Math.floor(Math.random() * (450 - 50 + 1));
	const suffix = TITLE_SUFFIXES[index % TITLE_SUFFIXES.length];
	const words: string[] = [];
	let currentIndex = seed;

	while (words.join(" ").length + suffix.length + 1 < targetLength) {
		words.push(TITLE_WORDS[currentIndex]);
		currentIndex = (currentIndex + Math.floor(Math.random() * wordCount)) % wordCount;
	}

	const title = `${words.join(" ")} ${suffix}`.trim();
	return title.length > 2000 ? title.slice(0, 2000) : title;
}

function createIsbn(index: number): string {
	const group = 978;
	const publisherPart = (index * 37 + 11) % 1000000;
	const itemPart = (index * 53 + 7) % 1000000;
	const checkDigit = (group + publisherPart + itemPart) % 10;
	return `${group}-${(index % 10) + 1}-${String(publisherPart).padStart(6, "0")}-${String(itemPart).padStart(6, "0")}-${checkDigit}`;
}

function createPublisher(index: number): string {
	const adjective = PUBLISHER_ADJECTIVES[(index * 7) % PUBLISHER_ADJECTIVES.length];
	const noun = PUBLISHER_NOUNS[(index * 11 + 3) % PUBLISHER_NOUNS.length];
	return `${adjective} ${noun}`;
}

export class NDJSONItemGenerator {
	private nextId = 1;

	GetNext() {
		const item = {
			id: this.nextId,
			title: createTitle(this.nextId),
			isbn: createIsbn(this.nextId),
			publisher: createPublisher(this.nextId),
			category: BOOK_CATEGORIES[this.nextId % BOOK_CATEGORIES.length],
			year: 1848 + Math.floor(Math.random() * (2026 - 1848 + 1)),
		};
		this.nextId += 1;
		return item;
	}
}
