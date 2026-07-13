/**
 * Renders one item from the current result set.
 * Return an HTML string that will be injected into the list row.
 * @param item - User object instantiated from one NDJSON line.
 * @param matchInfo - Optional match info regex used for output pre-processing (for example, highlighting).
 */
type RenderItem = (
    item: object, 
    matchInfo?: RegExp | null) => string;

/**
 * Extracts searchable text from a data item.
 * This text is used by filter.setSearch.
 * @param item - Data object used for rendering the current item.
 */
type ExtractItemText = (
    item: object
) => string;

/**
 * Creates a virtualized list bound to a scrollable container.
 *
 * The list supports incremental NDJSON streaming, text search, facet filters,
 * and navigation within the current result set.
*/
declare const VirtualList: {
  /** Parent element that will host the virtual list markup. */
  (container: HTMLElement,
  /**
   * Renderer function for each visible item.
   * @param item - User object instantiated from one NDJSON line.
   * @param matchInfo - Optional match info regex used for output pre-processing (for example, highlighting).
   */
  renderItem: (item: object, matchInfo?: RegExp | null) => string,
  /** Optional method to extract text used for search. */
  extractItemText?: (item: object) => string): VirtualListApi;
};

/**
 * Public API returned by {@link VirtualList}.
 */
interface VirtualListApi {
  /** Streaming and result-access API. */
  data: DataSourceApi;
  /** Filtering API alias. Equivalent to `data.filterAPI`. */
  filter: FilterApi;
  /** Navigation helpers for the current result set. */
  navigation: NavigationApi;
}

/**
 * Helpers for moving around the current filtered result set.
 */
interface NavigationApi {
  /**
   * Jump to a result index and render the corresponding window.
   *
   * @param index Zero-based index in the current result set.
   */
  jumpTo(index: number): void;
}

/**
 * Data access and streaming API.
 */
interface DataSourceApi {
  /**
   * Start fetching an NDJSON stream and append records incrementally.
   *
   * @param url NDJSON endpoint URL.
   */
  fetchStream(url: string): Promise<void>;

  /**
   * Abort the active fetch request, if any.
   */
  abortFetch(): void;

  /**
   * Indicates whether the stream is currently active.
   */
  isStreaming(): boolean;

  /**
   * Get the number of items in the current result set.
   */
  length(): number;

  /**
   * Get an item by its index in the current result set.
   *
   * @param index Zero-based index in the current result set.
   */
  get(index: number): any;

  /**
   * Return unique sorted values for a field from the current result set.
   *
   * @param attrName Field name to inspect.
   */
  getFacetValues(attrName: string): string[];

  /**
   * Low-level filtering facade.
   */
  filterAPI: FilterApi;

  /**
   * Subscribe to result-state changes.
   *
   * The returned function removes the listener.
   *
   * @param listener Callback invoked after filter/search state changes.
   */
  subscribeResultChanging(listener: (state: ResultState) => void): () => void;
}

/**
 * Filtering API for search, facets, and custom predicates.
 */
interface FilterApi {
  /**
   * Apply or clear text search.
   *
   * @param q Search query. Pass an empty string to clear search.
   */
  setSearch(q: string): void;

  /**
   * Add or replace a facet filter.
   *
   * `values` may be a single allowed value or an array of allowed values.
   * `key` defaults to `attr` and controls replacement/removal identity.
   *
   * @param attr Item property to test.
   * @param values Allowed value or values for the property.
   * @param key Optional facet key used for later replacement/removal.
   */
  addFacet(attr: string, values: string | string[], key?: string): void;

  /**
   * Remove a facet by key.
   *
   * @param key Facet key to remove.
   */
  removeFacet(key: string): void;

  /**
   * Remove all facet filters.
   */
  clearFacets(): void;

  /**
   * Add a custom predicate filter.
   *
   * All custom predicates are combined with logical AND.
   *
   * @param fn Predicate that must return `true` for matching items.
   */
  addPredicate(fn: (item: any) => boolean): void;

  /**
   * Remove a previously added custom predicate.
   *
   * @param fn Exact predicate reference passed earlier to `addPredicate`.
   */
  removePredicate(fn: (item: any) => boolean): void;

  /**
   * Remove all custom predicates.
   */
  clearPredicates(): void;

  /**
   * Reset all filtering state: search, facets, predicates, and filtered results.
   */
  clearAll(): void;
}

/**
 * Snapshot of the current filter/search state.
 */
interface ResultState {
  /** Current search query. */
  query: string;
  /** Regex used for search highlighting and matching. */
  regex: RegExp | null;
  /** Active facet keys. */
  facets: string[];
  /** Registered custom predicate references. */
  customPredicates: Function[];
  /** True when any search, facet, or predicate filter is active. */
  active: boolean;
}
