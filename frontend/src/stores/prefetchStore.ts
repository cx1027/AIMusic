/**
 * PrefetchStore — a lightweight SWR-style in-memory cache with
 * stale-while-revalidate semantics.
 *
 * Terminology:
 *   - "key"      : the cache key (e.g. "library", "discover.popular")
 *   - "data"     : the cached value
 *   - "error"    : the last error encountered (undefined when loading)
 *   - "isLoading": whether a fetch is currently in flight
 *   - "stale"   : whether the data is older than maxAgeMs
 */

type PrefetchCallback<T> = () => Promise<T>;

interface CacheEntry<T> {
  data: T;
  error: undefined;
  isLoading: false;
  fetchedAt: number;
}

interface LoadingEntry {
  data: T | undefined;
  error: undefined;
  isLoading: true;
  promise: Promise<T>;
}

interface ErrorEntry<T> {
  data: T | undefined;
  error: unknown;
  isLoading: false;
  fetchedAt: number;
}

type Entry<T> = CacheEntry<T> | LoadingEntry | ErrorEntry<T>;

type PrefetchEntry<T> = {
  data: T | undefined;
  error: unknown | undefined;
  isLoading: boolean;
};

const DEFAULT_MAX_AGE_MS = 30_000; // 30 seconds

class PrefetchStoreImpl {
  private store = new Map<string, Entry<unknown>>();
  private listeners = new Map<string, Set<() => void>>();
  private revalidateTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // ── read ──────────────────────────────────────────────────────────────────

  get<T>(key: string, maxAgeMs = DEFAULT_MAX_AGE_MS): PrefetchEntry<T> {
    const entry = this.store.get(key) as Entry<T> | undefined;
    if (!entry) return { data: undefined, error: undefined, isLoading: false };

    if (entry.isLoading) {
      return { data: entry.data, error: undefined, isLoading: true };
    }

    // Treat stale entries as "loading" from the caller's perspective,
    // but keep serving stale data immediately
    const isStale = Date.now() - entry.fetchedAt > maxAgeMs;
    if (isStale) {
      return { data: entry.data, error: entry.error, isLoading: false, _stale: true } as PrefetchEntry<T> & { _stale: true };
    }

    return { data: entry.data, error: entry.error, isLoading: false };
  }

  /** Synchronously check if a key has cached (non-loading) data. */
  has(key: string): boolean {
    const e = this.store.get(key);
    return !!e && !e.isLoading;
  }

  /** Synchronously check if a key has cached data (stale or fresh). */
  hasData(key: string): boolean {
    const e = this.store.get(key);
    return !!e && "data" in e && e.data !== undefined;
  }

  // ── write ─────────────────────────────────────────────────────────────────

  set<T>(key: string, entry: Entry<T>): void {
    this.store.set(key, entry);
    this.notify(key);
  }

  invalidate(key: string): void {
    this.store.delete(key);
    this.notify(key);
  }

  invalidateAll(): void {
    this.store.clear();
    this.listeners.forEach((s) => s.forEach((l) => l()));
  }

  // ── subscribe ─────────────────────────────────────────────────────────────

  subscribe(key: string, fn: () => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(fn);
    return () => this.listeners.get(key)?.delete(fn);
  }

  // ── fetch (with in-flight deduplication) ─────────────────────────────────

  /**
   * Fetch and cache. Returns the cached value immediately if available,
   * and triggers a background revalidation.
   */
  async fetch<T>(
    key: string,
    fetcher: PrefetchCallback<T>,
    opts: { maxAgeMs?: number; revalidateIntervalMs?: number } = {}
  ): Promise<T> {
    const { maxAgeMs = DEFAULT_MAX_AGE_MS, revalidateIntervalMs } = opts;

    // 1. Serve from cache if we have fresh data
    const cached = this.get<T>(key, maxAgeMs);
    if (!cached.isLoading && cached.data !== undefined && !("_stale" in cached)) {
      // Schedule background revalidation
      void this._backgroundRevalidate(key, fetcher, revalidateIntervalMs);
      return cached.data;
    }

    // 2. If a request is already in flight for this key, await it
    const existing = this.store.get(key) as LoadingEntry<T> | undefined;
    if (existing?.isLoading) {
      return existing.promise;
    }

    // 3. No data available — must wait
    const promise = this._fetchAndCache(key, fetcher);
    this.store.set(key, { isLoading: true, promise, data: cached.data });
    this.notify(key);

    try {
      const data = await promise;
      return data;
    } finally {
      void this._backgroundRevalidate(key, fetcher, revalidateIntervalMs);
    }
  }

  // ── internal ─────────────────────────────────────────────────────────────

  private async _fetchAndCache<T>(key: string, fetcher: PrefetchCallback<T>): Promise<T> {
    try {
      const data = await fetcher();
      this.store.set(key, { data, error: undefined, isLoading: false, fetchedAt: Date.now() });
      this.notify(key);
      return data;
    } catch (err) {
      const existing = this.store.get(key);
      this.store.set(key, {
        error: err,
        isLoading: false,
        fetchedAt: Date.now(),
        data: existing && "data" in existing ? existing.data : undefined,
      });
      this.notify(key);
      throw err;
    }
  }

  private async _backgroundRevalidate<T>(
    key: string,
    fetcher: PrefetchCallback<T>,
    intervalMs?: number
  ): Promise<void> {
    // Clear any existing timer
    const existingTimer = this.revalidateTimers.get(key);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
    }

    if (intervalMs !== undefined && intervalMs > 0) {
      // Schedule periodic revalidation
      this.revalidateTimers.set(
        key,
        setTimeout(async () => {
          try {
            const data = await fetcher();
            this.store.set(key, { data, error: undefined, isLoading: false, fetchedAt: Date.now() });
            this.notify(key);
          } catch {
            // Silent — stale data is still served
          }
        }, intervalMs)
      );
    } else {
      // Single background revalidation after stale window
      const staleDelay = DEFAULT_MAX_AGE_MS;
      this.revalidateTimers.set(
        key,
        setTimeout(async () => {
          try {
            const data = await fetcher();
            this.store.set(key, { data, error: undefined, isLoading: false, fetchedAt: Date.now() });
            this.notify(key);
          } catch {
            // Silent
          }
        }, staleDelay)
      );
    }
  }

  private notify(key: string): void {
    this.listeners.get(key)?.forEach((l) => l());
  }
}

export const prefetchStore = new PrefetchStoreImpl();
