##### DISCLAIMER: This project is not intended to be actively maintained. The code is provided "as is" in hope its functionality will be useful for somebody. Author tried to make the code as stable as possible and it is tested on range of modern browsers but it is not "battle tested in many projects".
***
This virtual list implementation makes each record accessible on the client's page as soon as it arrives from the server. It adequately adjusts UI part to the available amount of data during transmission and it is capable of handling number of records in range of many hundreds of thousands. 

Data required to be streamed in [NDJSON](https://en.wikipedia.org/wiki/JSON_streaming) format. Individual items for rendering expected to be more or less of the same size. 

The list exposes basic funcitonality for filtering, searching and navigation without much of a "sugar". 

Not minified code with descriptive comments takes around 30K. 

working example can be seen here: https://books-list-instant.pages.dev/?num_records=250&delay=40  (Thanks, Copilot ;)

Code is vanilla javascript without any dependencies thus just can be downloaded raw: https://raw.githubusercontent.com/pavomelk/instant-vlist/refs/heads/main/src/instant-vlist.js


#### USAGE:
##### The simplest scenario would be:
```javascript
const container = document.getElementById("list");
const vlist = VirtulaList(container, item=>`<p>${item.text}</p>`);
vlist.data.fetchStream("https://www.myserver.dev/ndjson", container)
```
##### To get the search working:
* define method of extracting text to be searched
* if you indend to higligt content, do so inside your renderer function. Use RegExp object that is passed as a second parameter to that funciton at the runtime. 

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


