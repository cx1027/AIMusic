/**
 * usePrefetch — hook that combines a prefetch store read with
 * background revalidation, giving you SWR-style "data immediately,
 * then refresh" behavior.
 *
 * Usage:
 *   const { data, isLoading, error } = usePrefetch("my-key", () => api.listSongs());
 *
 * Returns:
 *   - data     : cached value (may be undefined on first mount)
 *   - isLoading: true while fetching AND cache is empty
 *   - error    : last error encountered (only set after initial fetch failed)
 *
 * The component re-renders when:
 *   1. The cached value changes (background revalidation completed)
 *   2. Loading state changes
 *
 * Background revalidation is always triggered on mount/key change,
 * and on the stale-while-revalidate timer.
 */

import { useEffect, useRef, useState } from "react";
import { prefetchStore } from "./prefetchStore";

type PrefetchCallback<T> = () => Promise<T>;

type UsePrefetchOptions<T> = {
  /** How old data can be before it is considered stale (ms). Default 30 000. */
  maxAgeMs?: number;
  /**
   * If true, isLoading will be true only when BOTH the cache is empty
   * AND a fetch is in-flight. When cached data exists, isLoading stays false
   * even while a background revalidation runs.
   * Default: true (zero-latency mode).
   */
  loadingOnlyWhenEmpty?: boolean;
};

export function usePrefetch<T>(
  key: string,
  fetcher: PrefetchCallback<T> | null,
  opts: UsePrefetchOptions<T> = {}
): {
  data: T | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { maxAgeMs, loadingOnlyWhenEmpty = true } = opts;

  // Callers pass an inline `() => api.foo()` on every render; that new function
  // reference must NOT be a useEffect dependency or we get an infinite loop
  // (effect → fetch → setState → render → new fetcher → effect …).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [entry, setEntry] = useState(() =>
    fetcher ? prefetchStore.get<T>(key, maxAgeMs) : { data: undefined, error: undefined, isLoading: false }
  );

  // Subscribe to store updates so we re-render when the cache changes
  useEffect(() => {
    if (!key) return;
    const unsub = prefetchStore.subscribe(key, () => {
      setEntry(prefetchStore.get<T>(key, maxAgeMs));
    });
    return unsub;
  }, [key, maxAgeMs]);

  // Trigger fetch (always — even if cache is populated, we want background revalidation)
  useEffect(() => {
    if (!key || !fetcherRef.current) return;

    const runFetcher = () => {
      const fn = fetcherRef.current;
      if (!fn) throw new Error("prefetch fetcher missing");
      return fn();
    };

    void prefetchStore
      .fetch(key, runFetcher, { maxAgeMs })
      .then(() => {
        // Update state after the fetch completes (may cause an extra render)
        setEntry(prefetchStore.get<T>(key, maxAgeMs));
      })
      .catch(() => {
        // Error is stored in cache; read it for display
        setEntry(prefetchStore.get<T>(key, maxAgeMs));
      });
  }, [key, maxAgeMs]);

  const isLoading =
    loadingOnlyWhenEmpty
      ? entry.isLoading || (entry.data === undefined && !prefetchStore.has(key))
      : entry.isLoading;

  return { data: entry.data, isLoading, error: entry.error };
}
