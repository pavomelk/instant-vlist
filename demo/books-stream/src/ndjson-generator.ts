export class NDJSONItemGenerator {
	private nextId = 1;

	GetNext() {
		const item = {
			id: this.nextId,
			title: `Book ${this.nextId}`,
			author: `Author ${this.nextId}`,
		};
		this.nextId += 1;
		return item;
	}
}
