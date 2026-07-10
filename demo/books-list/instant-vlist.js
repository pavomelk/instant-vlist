function VirtualList(container, renderItem, extractItemText) {
/* 
This is virtual list whose purpose is to handle rendering datasets that potentially can grow to large amount of items (hundreds of thousands or more). 
It was designet for being able to display items immediately after they start to arrive from the stream. Data component of this list expects stream to be in *NDJSON* format and it exposes API for further interacting with the data.
The basic idea of of this implementation is to present data to the client in small *Window* of items around the current scroll position, and dynamically mutate that window as the user scrolls. 
We trick the scrollbar into thinking the entire list is rendered by using top and bottom spacer DOM elements that take up the appropriate height.
We use two ways of mutating rendered items depending on the scrolling type:
- incremental growth: when user scrolls within the rendered window, we append/prepend a few items at a time and remove from the opposite end if we exceed MAX_RENDERED. this allows for smooth scrolling with a large dataset while keeping DOM size manageable.
- hard reset: when user scrolls violently (e.g. dragging scrollbar thumb), we jump-scroll and render a new window centered around the new scroll position based on estimated height of items.
One of the challenges of presenting large data as scrollable content is finding good way to compensate for browser's limitations on maximum height of elements (around 33 million pixels in Chrome), 
when approaching that limit browsers tend to behave erratically. To address this, we introduce dynamic scaling of the render window and spacers when we detect that total height is growing beyond a certain threshold (MAX_SPACER_HEIGHT), 
which allows us to handle much larger datasets while still providing fairly smooth scrolling experience.
The other challenge was to ensure coherent re-calculation of the layout to accurately adjust scroll position in response to DOM mutations. 
*/
  
  const { visibleList, spacerTop, spacerBottom } = createDOMNodesForScrolling(container);

  const data = DataSource(onDataUpdated);

  let estimatedItemHeight = null; // we update this later based on actual rendered item heights.
  let itemMarginHeight = 0;  //margins are not included in item height. We need to be aware of these in our calculations
  let renderStartIndex = 0;
  let renderEndIndex = -1;

  let lastScrollTop = container.scrollTop;
  let lastLoggedSize; // for debug logging of render window changes
  let lastWheelTime = 0; // to classify scroll intent
  let lastIncrementalUpdateTime = 0; // to monitor performance of incremental updates

  let viewportRect = container.getBoundingClientRect();

  const MAX_SPACER_HEIGHT = 15_000_000; //navigation elements height threshold before we begin scaling up scroll positions of larger datasets.
  let scaler = 1; // upscaling factor

  const BASE = {
    MIN_RENDERED: 8,  //this is being changed later in the code based on estimatedItemHeight and container height to render enough items to fill the viewport plus some buffer for smoother scrolling, while keeping it low enough to avoid performance issues with large datasets. we can calculate the number of items that can fit in the viewport and add a buffer of a few items on either side to allow for smooth incremental scrolling without hitting MAX_RENDERED too quickly.
    MAX_RENDERED: 24, //MAX_RENDERED = MIN_RENDERED + 2 * EXTEND_CHUNK to allow for smooth incremental scrolling without causing too much overhead from rendering too many items, especially when scaling is applied for large datasets. we can experiment with different values to find a good balance between performance and scroll smoothness.
    EXTEND_CHUNK: 8, //nuber of items that go beyond the viewport when we extend the render window during incremental scrolling. this should be enough to allow for smooth scrolling without causing too much overhead from rendering too many items, especially when scaling is applied for large datasets. we can experiment with different values to find a good balance.
    EDGE_EXTEND: 6,  //number of items from the edge of the viewport at which we trigger an extension of the render window during incremental scrolling. this should be enough to allow for smooth scrolling without causing too much overhead from rendering too many items, especially when scaling is applied for large datasets. we can experiment with different values to find a good balance between performance and scroll smoothness.
    FEASABLE_LENGTH: 24  // minimum number of items that make the virtualized rendering approach feasible. If less than, then we just fall back to rendering all items at once.
  };

  const VIOLENT_SCROLL_DELTA = 800; //this value helps us to differrenciate between rapid and smooth scroll requests.

  const DEBUG_RENDER_WINDOW = true; //if set to true, we get some debug information in console log.

  const filter = data.filterAPI;
  const navigation = {
    jumpTo: i => jumpToIndex(i)
  };

  container.style.overflowAnchor = "none"; // to keep browser from arbitrarily adjusting scroll position during DOM mutations, which results in incorrect positioning of rendered items and spacers, which visually appears as no items in the list.
  container.style.scrollBehavior = "contain"; // don't use "smooth scroll" because lagging in rendering scrollable items will reveal blank spaces of the spacers.  (yes, we may increse number of rendered items to takle that, but it still will look ugly)
  container.addEventListener("scroll", onScroll);
  container.addEventListener("wheel", () => { lastWheelTime = performance.now(); }, { passive: true });
  
  let wasResized = false;
  window.addEventListener("resize", () => 
    { 
      wasResized = true;
      viewportRect = container.getBoundingClientRect();
      BASE.MIN_RENDERED = Math.ceil(container.clientHeight / estimatedItemHeight) + 2 * BASE.EDGE_EXTEND;
    }, 
    { passive: true });
  
  function createDOMNodesForScrolling(container) {
    const visibleList = document.createElement("div");
    visibleList.id = "visible-list";
    const spacerTop = document.createElement("div")
    spacerTop.id = "spacer-top";
    const spacerBottom = document.createElement("div")
    spacerBottom.id = "spacer-bottom";
    container.appendChild(spacerTop);
    container.appendChild(visibleList);
    container.appendChild(spacerBottom);

    return {visibleList, spacerTop, spacerBottom}; 
  }

  function onDataUpdated(event = {type: "incremental"|"rebuild"|"eot"}) {  //called by the data source 
    const { type } = event;
    if(isScalerAdjusting(event) && type != "rebuild") return; //scaler may adjust back to 1 when rebuild is needed. We still need to proceed furter in such cases
    
    if(data.length() < BASE.MAX_RENDERED){ //start with conventional rendering when data is too small.
        switch(type){
          case "rebuild":
            spacerTop.style.height = "0px";
            spacerBottom.style.height = "0px";
            visibleList.innerHTML = "";
            expandConventionalList();
            break;
          case "eot":
          case "incremental":
            expandConventionalList();
            break;
          default:
            break;
        }
        return;
    }

    switch (type) {
      case "rebuild":
        if(data.isStreaming)
        {
          BASE.EXTEND_CHUNK = 8; //going back to initial values
          BASE.EDGE_EXTEND = 6;  
        }
        else{
          BASE.EXTEND_CHUNK = 3; //smoothen scrolling   
          BASE.EDGE_EXTEND = 2;  //(because adding big chunks of items causes more noticeable shutter of the list position)
        }
        resetRenderWindow();  // logical index space changed → must re-render
        break;

      case "eot": 
        if(data.length() === 0) break; 
        BASE.EXTEND_CHUNK = 3; //once transmission ended we reduce boundaries to smoothen scrolling 
        BASE.EDGE_EXTEND = 2;  //(because adding big chunks of items causes more noticeable shutter of the list position)
        updateSpacers(); // data is final → update spacers only, preserve scroll
        break;

      case "incremental":
        if(performance.now() - lastIncrementalUpdateTime < 100) { //throttling (think if it is worth to be parametrized)
            return;
        }
        else {
          lastIncrementalUpdateTime = performance.now();
          lastIntent = "continuous"; //reset intent after data update to allow continuous scrolling if user keeps scrolling
        } //we continue to default case heere
      // eslint-disable-next-line no-fallthrough
      default:
        if (renderEndIndex < renderStartIndex) {
          initWindow();
        } else { //we stay on the same subset of records in viewport but we need to reflect the size of data change
          requestAnimationFrame(updateSpacers); //wrapping this into rAF allows updates of the scrollbar to be displayed more fluent during data load
        }
    }

  }

  let lastIntent = "continuous";
  function classifyScrollIntent(delta) { 
    if (performance.now() - lastWheelTime < 150) { // Recent wheel/trackpad activity → continuous scroll
      return "continuous";
    }
    if (Math.abs(delta) > VIOLENT_SCROLL_DELTA * scaler) { // Large delta without wheel → jump scroll
      return "jump";
    }
    return "continuous";
  }
  
  function onScroll() {
    const scrollTop = container.scrollTop;
    const delta = scrollTop - lastScrollTop;
    lastScrollTop = scrollTop;

    const intent = classifyScrollIntent(delta);
    if (intent !== lastIntent && DEBUG_RENDER_WINDOW) {
      console.log("scroll intent →", intent, "renderStartIndex:", renderStartIndex);
      lastIntent = intent;
    }

    switch (intent) {
      case "jump":
        rebuildWindowFromJumpScroll();
        return;
      case "continuous":
        rollWindowContent();
        return;
    }
  }

  let renderItemReExp = null; // we pass this to the renderItem funciton for text highlighting
  data.subscribeResultChanging(
    state => { renderItemReExp = state.regex;}
  );

  function initWindow() {
    if (data.length() <= BASE.MIN_RENDERED) return;

    calculateItemHeights();

    renderStartIndex = 0;
    renderEndIndex = Math.min(data.length() - 1, BASE.MIN_RENDERED - 1);

    renderWindow();
  }

  function resetRenderWindow() {
    visibleList.replaceChildren();
    
    renderStartIndex = 0;
    renderEndIndex = -1;
    lastScrollTop = 0;
    container.scrollTop = 0;

    initWindow();
  }

  function renderWindow() {
    const fragment = document.createDocumentFragment();

    for (let i = renderStartIndex; i <= renderEndIndex; i++) {
      fragment.appendChild(createNode(i));
    }

    visibleList.innerHTML = "";
    visibleList.appendChild(fragment);
    //requestAnimationFrame(updateSpacers); 
    updateSpacers();

    logRenderWindowIfChanged("renderWindow");
  }


  function logRenderWindowIfChanged(context = "") {
    if (!DEBUG_RENDER_WINDOW) return;

    const size = renderEndIndex - renderStartIndex + 1;

    if (lastLoggedSize !== size) {
      lastLoggedSize = size;

      console.log("context:", context,
        `[render window] size=${size} ` +
        `(indices ${renderStartIndex}–${renderEndIndex})`
      );
    }
  }

  function expandConventionalList(){
    const startIndex = (visibleList.children.length == 0)? 0: visibleList.lastChild.dataset.index; 
    for(let i = startIndex; i< data.length(); i++){
      appendItem(i);
    }
  }

  function rebuildWindowFromJumpScroll() {
    const approxIndex = Math.min( 
        Math.floor(container.scrollTop / estimatedItemHeight) * scaler,
        data.length() - BASE.MIN_RENDERED
      ) ;

    renderStartIndex = Math.max(0, approxIndex);

    renderEndIndex = Math.min(
      data.length() - 1,
      renderStartIndex + BASE.MIN_RENDERED - 1
    );
    if(DEBUG_RENDER_WINDOW){
      console.log("rebuildWindowFromJumpScroll: approxIndex:", approxIndex, "rendering indices", renderStartIndex, "-", renderEndIndex);
    }
    renderWindow();
  }

  function rollWindowContent() { 
    //when rendered items being scrolled in viewport beyond BASE.EDGE_EXTEND 
    //we update our visible list and spacers with the next set of data items
    if (!visibleList.children.length) return;
    if (wasResized) {//exact item height matters mostly for rendered items.
      calculateItemHeights(); //otherwise it is just proportion of spacer sizes
      wasResized = false;
    }

    const containerRect = container.getBoundingClientRect();
    const firstRect = visibleList.firstElementChild.getBoundingClientRect();
    const lastRect = visibleList.lastElementChild.getBoundingClientRect();

    //this code causes parent content respond to scroll event. If the list is placed in nested scrollable items it may cause content of containing element "jump".
     if(lastRect.bottom < viewportRect.top || firstRect.top > viewportRect.bottom) { //if spacer adjustment does not keep up with the amount of (inertial mouse wheel) continuous scroll requests...
       visibleList.children[BASE.EXTEND_CHUNK - 1]?.scrollIntoView({ block: "start", container: "nearest" }); 
     }

    if (
      lastRect.bottom <
        containerRect.bottom + BASE.EDGE_EXTEND * estimatedItemHeight 
    ) {
      rollDirection.forward();
      appendChunk();
    }

    if (
      firstRect.top >
        containerRect.top - BASE.EDGE_EXTEND * estimatedItemHeight &&
      renderStartIndex > 0
    ) {
      rollDirection.backward();
      prependChunk();
    }
  }
  //appendChunk and prependChunk are symmetrical, but removing duplication may make code less readable.
  function appendChunk() {
    let added = 0;
    let addedHeight = {topHeightDelta: 0, bottomHeightDelta: 0};

    while (
      added < BASE.EXTEND_CHUNK &&
      renderEndIndex < data.length() - 1
    ) {
      renderEndIndex++;
      const newItem = appendItem(renderEndIndex);
      addedHeight.bottomHeightDelta -= (newItem.clientHeight + itemMarginHeight);
      added++;
    }

    while ( // if we exceeded max rendered, remove from the top and adjust spacer accordingly
      renderEndIndex - renderStartIndex + 1 > BASE.MAX_RENDERED
    ) {
      const firstChild = visibleList.firstChild;
      if(firstChild) {
          addedHeight.topHeightDelta += (firstChild.clientHeight  + itemMarginHeight); //accumulate height of removed item for spacer adjustment
      }
      visibleList.removeChild(firstChild); 
      renderStartIndex++;
    }
    adjustSpacersDuringScroll(addedHeight); //adjust spacers based on actual heights of added/removed items to keep scroll position stable
    logRenderWindowIfChanged("appendChunk");
  }

  function prependChunk() {
    let added = 0;
    let addedHeight = {topHeightDelta: 0, bottomHeightDelta: 0};
    

    while (
      added < BASE.EXTEND_CHUNK &&
      renderStartIndex > 0
    ) {
      renderStartIndex--;
      const newItem = prependItem(renderStartIndex);
      addedHeight.topHeightDelta -= (newItem.clientHeight  + itemMarginHeight); //add new item and accumulate its height for spacer adjustment
      added++;
    }

    while (
      renderEndIndex - renderStartIndex + 1 > BASE.MAX_RENDERED
    ) {
      const lastChild = visibleList.lastChild;
      if(lastChild) {
        addedHeight.bottomHeightDelta += (lastChild.clientHeight  + itemMarginHeight); //accumulate height of removed item for spacer adjustment
      }
      visibleList.removeChild(lastChild); //accumulate height of removed item for spacer adjustment
      renderEndIndex--;
    }
    adjustSpacersDuringScroll(addedHeight); //adjust spacers based on actual heights of added/removed items to keep scroll position stable
    logRenderWindowIfChanged("prependChunk");
  }

  function appendItem(index) {
    return visibleList.appendChild(createNode(index));
  }

  function prependItem(index) {
    return visibleList.insertBefore(
      createNode(index),
      visibleList.firstChild
    );
  }

  function createNode(index) {
    const el = document.createElement("div");
    el.className = "result-item";
    el.dataset.index = index;
    el.innerHTML = renderItem(data.get(index), renderItemReExp);
    return el;
  }

  function calculateItemHeights(){
      const tempNode = createNode(0);
      visibleList.appendChild(tempNode);
      estimatedItemHeight = tempNode.clientHeight;
      visibleList.removeChild(tempNode);
      BASE.MIN_RENDERED = Math.ceil(container.clientHeight / estimatedItemHeight) + 2 * BASE.EDGE_EXTEND; // enough items to fill viewport plus buffer for smooth scrolling
      const style = window.getComputedStyle(tempNode);
      itemMarginHeight = Math.round(( style.marginTop || 0) + (style.marginBottom || 0));
      estimatedItemHeight += itemMarginHeight;
  }

  function captureVisibleItemPosition(){
    for(const child of visibleList.children) {
      const diff = child.getBoundingClientRect().top - viewportRect.top;
      if(diff > 0) {
        return {node: child, topDistance: -diff};
      }
    }
    return {node: visibleList.firstChild, topDistance: 0};
  }

  function isScalerAdjusting(event) {
    const newScaler = Math.ceil((data.length() * estimatedItemHeight) / MAX_SPACER_HEIGHT) || 1;

    if (newScaler !== scaler) { 
      if(DEBUG_RENDER_WINDOW) {
        console.log("Applying scaler", newScaler, "to render window to accommodate large dataset of size", data.length(), "startAt:" + renderStartIndex);
      }
      scaler = newScaler;
      const position = captureVisibleItemPosition();

      updateSpacers(); 
      position.node?.scrollIntoView({block: "nearest"}); 
      container.scrollBy(0, position.topDistance );
      lastScrollTop = container.scrollTop; 
      return true;
    }
    return false;
  }

  function updateSpacers() { //most sensitive part of the implementation. Getting spacer heights wrong can cause items rendering outside viewport.
    spacerTop.style.height = (renderStartIndex * estimatedItemHeight) / scaler + "px";
    spacerBottom.style.height = (data.length() - renderEndIndex - 1) * estimatedItemHeight / scaler + "px";
  }

const rollDirection = {   prev: 0,  curr: 0,   i: 0,
  update(direction) {
    this.i = this.curr === -direction ? this.i + 1 : 0;
    this.prev = this.curr;
    this.curr = direction;
  },
  forward() {
    this.update(1);
  },
  backward() {
    this.update(-1);
  },
  isJittering() {
    return this.i > 3;
  }
};

  let scrollTimeout = null;
  function adjustSpacersDuringScroll(addedHeight) { //for continuous scrolling, we adjust spacers based on actual heights of added/removed items to keep scroll position stable, which is especially important when scaling is applied for large datasets, as estimated heights may be less accurate.
      if(rollDirection.isJittering()) return;
      const addTop =  renderStartIndex == 0 ? 0 : spacerTop.clientHeight + addedHeight.topHeightDelta;
      spacerTop.style.height = addTop > 0 ? addTop + "px" : "0px";
      const addBottom = renderEndIndex == data.length() - 1 ? 0: spacerBottom.clientHeight + addedHeight.bottomHeightDelta;
      spacerBottom.style.height = addBottom > 0 ? addBottom + "px" : "0px";
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(()=>{debounceLastScrollEvent()}, 20);
  }

  let stopDebounce = false;
  function debounceLastScrollEvent(){
    if(!stopDebounce && !rollDirection.isJittering()){ //we don't want endless recursion here
      rollWindowContent();
      stopDebounce = true;
    }
    stopDebounce = false;
    return;
  }

  function jumpToIndex(i) {
    renderStartIndex = Math.max(0, Math.min(i, data.length() - 1));
    renderEndIndex = Math.min(
      data.length() - 1,
      renderStartIndex + BASE.MIN_RENDERED - 1
    );
    renderWindow();
    lastScrollTop = renderStartIndex * estimatedItemHeight / scaler;
    container.scrollTop = lastScrollTop;
    visibleList.firstChild?.scrollIntoView({ block: "nearest" })
    //requestAnimationFrame(() => visibleList.firstChild?.scrollIntoView({ block: "start" }) );
    //requestAnimationFrame(() => visibleList.childNodes[BASE.EDGE_EXTEND]?.scrollIntoView({ block: "start" }) );
  }

  function DataSource(onUpdate, options = {}) {
    //retrive, filter and index data items, and provide API for accessing them and subscribing to changes. it also handles streaming data ingestion with batching and supports search/predicate filtering with match info tracking.
    let raw = [];
    let filtered = null;
    let query = "";
    let regex = null;

    
    const facetPredicates = new Map(); 
    const customPredicates = new Set();
    //const matchInfo = new Map();

    const BATCH_SIZE = options.batchSize ?? 25;
    const BATCH_TIME = options.batchTime ?? 50; // ms
    let pendingCount = 0;
    let flushTimer = null;
    let streamCompleted = false;

    const resultListeners = new Set(); // for notifying about changes in result state (e.g. to update UI)

    const StreamState = {
      IDLE: "idle",
      STREAMING: "streaming",
      COMPLETED: "completed",
      ABORTED: "aborted"
    };
    let streamState = StreamState.IDLE;
    let abortController = null;

    async function fetchStream(url) {
      if (streamState === StreamState.STREAMING) {
        console.warn("DataSource: fetch already in progress");
        return;
      }

      // Allow restart from completed or aborted
      streamState = StreamState.STREAMING;
      abortController = new AbortController();

      try {
        const resp = await fetch(url, { signal: abortController.signal });
        const reader = resp.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.trim()) continue;
            add(JSON.parse(line));
          }
        }

        streamState = StreamState.COMPLETED;
        flush({ type: "eot", source: "stream" });

      } catch (err) {
        if (err.name === "AbortError") {
          streamState = StreamState.ABORTED;
          console.info("DataSource: fetch aborted");
        } else {
          streamState = StreamState.ABORTED;
          console.error("DataSource: fetch error", err);
        }
      } finally {
        abortController = null;
      }
    }

    function isStreaming() {
      return streamState === StreamState.STREAMING;
    }

    function abortFetch() {
      if (abortController) {
        abortController.abort();
      }
    }


    function armTimerIfNeeded() {
      if (flushTimer !== null) return;

      flushTimer = setTimeout(() => {
        flush({ type: "incremental", source: "timer" });
      }, BATCH_TIME);
    }
    function cancelTimer() {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    }

    function flush(event) {
      if (!event) return;

      pendingCount = 0;
      cancelTimer();
      onUpdate(event);
    }

    function composedPredicate(item) {
      for (const fn of facetPredicates.values()) {
        if (!fn(item)) return false;
      }
      for (const fn of customPredicates.values()) {
        if (!fn(item)) return false;
      }
      return true;
    }

    function add(item) {
      raw.push(item);
      const rawIndex = raw.length - 1;

      let accepted = false;

      if (filtered) {
        if (matches(item)) {
          filtered.push(rawIndex);
          accepted = true;
        }
      } else {
        accepted = true;
      }

      if (!accepted) return;

      pendingCount++;

      if (pendingCount === 1) {
        armTimerIfNeeded();
      }

      if (pendingCount >= BATCH_SIZE) {
        flush({ type: "incremental", source: "count" });
      }
    }

    function rebuild() {
      //matchInfo.clear();
      const hasPredicates = facetPredicates.size > 0 || customPredicates.size > 0;
      const hasQuery = !!query;

      if (!hasPredicates && !hasQuery) {
        filtered = null;
        emitResultChaning();
        onUpdate({ type: "rebuild" });
        return;
      }

      filtered = [];

      for (let i = 0; i < raw.length; i++) {
        const item = raw[i];

        if (hasPredicates && !composedPredicate(item)) continue;

        if (hasQuery && !matches(item)) continue;

        filtered.push(i);
      }
      emitResultChaning();
      onUpdate({ type: "rebuild" });
    }
    
    function matches(item) {
      if ((facetPredicates.size || customPredicates.size) &&
          !composedPredicate(item)) {
        return false;
      }

      if (!query) return true;
      if (!extractItemText) return true;

      const text = extractItemText(item).toLowerCase() || "";
      return text.includes(query);
    }

    function length() {
      return filtered ? filtered.length : raw.length;
    }

    function get(i) {
      return raw[filtered ? filtered[i] : i];
    }

    function getFacetValues(attrName) {
      const values = new Set();

      if (filtered) {
        for (const rawIndex of filtered) {
          const v = raw[rawIndex]?.[attrName];
          if (v) values.add(v);
        }
      } else {
        for (let i = 0; i < raw.length; i++) {
          const v = raw[i]?.[attrName];
          if (v) values.add(v);
        }
      }

      return Array.from(values).sort();
    }

    function emitResultChaning() {
      for (const fn of resultListeners) {
        try {          
          fn(getResultState());
        } catch (err) {
          console.error("Error in result changed listener.", err);
        }
      }
    }

    function subscribeResultChanging(fn) { //example virtualList.data.subscribeResultChanging(state => console.log("result changed", state))
      resultListeners.add(fn);
      return () => resultListeners.delete(fn);
    }

    function getResultState() {
      return {
        query,
        regex,
        facets: Array.from(facetPredicates.keys()),
        customPredicates: Array.from(customPredicates.keys()),
        active: !!query || facetPredicates.size > 0 || customPredicates.size > 0
      };
    }

    const filterAPI = {
      // text search
      setSearch: q => { //example virutalList.filter.setSearch("bank of america")
        if(!extractItemText){
          console.error("Search requires function for extracting item's text to be searched on. Example: [const vlist = VirtualList(container, renderItem, item => item.Title);]");
          return; 
        }
        if(q){
          query = q.toLowerCase();
          const r = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          regex = new RegExp(r, "gi"); //is OK to pass RegExp with /g for highlighting, but it is not suitable for using .test() method to find match  
        }
        else{
          regex = null;
          query = "";  
        }
        rebuild();
      },

      // facet filters (replaceable by key)
      addFacet: (attr, values, key = attr) => { //example virtualList.filter.addFacet("Category", "Astronomy") or virtualList.filter.addFacet("category", ["Astronomy", "Art"])
        const valuesSet = new Set(Array.isArray(values)? values: [values]);
        facetPredicates.set(key, item => valuesSet.has(item[attr]));
        rebuild();
      },

      removeFacet: key => { //example virtualList.filter.removeFacet("category")
        facetPredicates.delete(key);
        rebuild();
      },

      clearFacets: () => { //example virtualList.filter.clearFacets()
        facetPredicates.clear();
        rebuild();
      },

      // arbitrary predicates (stackable)
      addPredicate: fn => { //example virtualList.filter.addPredicate(item => item.FilingType === "Indictment" && item.CaseNumber.startsWith("IT-02"))
        customPredicates.add(fn);
        rebuild();
      },

      removePredicate: fn => { //example virtualList.filter.removePredicate(referenceToNonAnonymousFunction)

        customPredicates.delete(fn);
        rebuild();
      },

      clearPredicates: () => {
        customPredicates.clear();
        rebuild();
      },

      // full reset
      clearAll: () => {
        query = "";
        regex = null;
        facetPredicates.clear();
        customPredicates.clear();
        filtered = null;
        emitResultChaning();
        onUpdate({ type: "rebuild" });
      }
    };
    return { fetchStream, abortFetch, isStreaming, length, get, getFacetValues, filterAPI, subscribeResultChanging: subscribeResultChanging};
  }

  return {
    data,
    filter,
    navigation
  };
}
