##### DISCLAIMER: This project is not intended to be actively maintained. The code is provided "as is" in the hope that its functionality will be useful to someone. The author has tried to make it as stable as possible, and it has been tested on a range of modern browsers. However, it has not been battle-tested across many production projects.

##### Its main advantage is that records become available to the user interface as soon as they arrive from the server. If this is not a requirement, there are many more elegant solutions available.
***

This virtual list implementation makes each record available in the UI as soon as it arrives from the server. It dynamically adjusts to the amount of data received during transmission and is capable of handling hundreds of thousands of records.

Data must be streamed in [NDJSON](https://en.wikipedia.org/wiki/JSON_streaming) format. Individual items are expected to be roughly similar in size.

The list provides basic functionality for filtering, searching, and navigation without many additional convenience features.

The unminified source code, including descriptive comments, is approximately 30 KB.

A working example can be found here:
https://books-list-instant.pages.dev/?num_records=250&delay=40  (Thanks, Copilot 😉)

The code is written in vanilla JavaScript and has no dependencies, so it can be downloaded directly from GitHub:
https://raw.githubusercontent.com/pavomelk/instant-vlist/refs/heads/main/src/instant-vlist.js

#### USAGE:
##### The simplest scenario would be:
```javascript
const container = document.getElementById("list");
const vlist = VirtulaList(container, item=>`<p>${item.text}</p>`);
vlist.data.fetchStream("https://www.myserver.dev/ndjson")
```
##### To get the search working:
* define method of extracting text to be searched
* if you indend to highlight the content, do so inside your renderer function. Use RegExp object that is passed as a second parameter to that funciton at the runtime. 

The code in this case may look something like this:

```javascript
const streamUrl = "https://www.myserver.dev/ndjson";
const container = document.getElementById("list");
const renderItem = function(item, regex){
    	let text = item.title.replaceAll(regex, '\<mark\>\$&\<\/mark\>')||""; //highlight matches
		return `
			<p>${text}</p>
		`;
}
const vlist = VirtulaList(container, renderItem, item.title);
vlist.data.fetchStream(streamUrl);
```
##### There are the following search and filtering methods:

 * setSearch(query: string) - Apply text search using defined text extract function
 * addFacet(attr: string, values: string|string[], key?: string) - Add/replace facet by key
 * removeFacet(key: string) - Remove facet by key
 * clearFacets() - Remove all facets
 * addPredicate(fn: (item: any) => boolean) - Add custom predicate. Example: ```virtualList.filter.addPredicate(item => new Date(item.issueDate).getDay() == 2 && item.DocumentType === "Passport" )```
 * removePredicate(fn: (item: any) => boolean) - Remove custom predicate. Example: ```virtualList.filter.removePredicate(referenceToNonAnonymousFunction)```
 * clearPredicates() - Remove all custom predicates
 * clearAll() - Reset search, facets, predicates, and filtered state


