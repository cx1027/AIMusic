/**
 * PrefetchService — triggers data prefetching after login.
 *
 * Call `prefetchService.start()` right after `setTokens()` in Login/Register
 * to kick off background fetches before the user even navigates.
 *
 * Prefetch keys (defined here as constants to avoid typos):
 *   PREFETCH_LIBRARY          → api.listSongs()
 *   PREFETCH_DISCOVER         → api.discover()
 *   PREFETCH_CURRENT_USER     → api.me()
 */

import { api } from "../lib/api";
import { prefetchStore } from "./prefetchStore";// ── Key constants ──────────────────────────────────────────────────────────────

export const PREFETCH_LIBRARY = "library";
export const PREFETCH_DISCOVER = "discover";
export const PREFETCH_CURRENT_USER = "current_user";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fire-and-forget. Silently fails — prefetch errors are non-critical. */
function silent<T>(p: Promise<T>): void {
  void p.catch(() => {});
}

// ── PrefetchService ───────────────────────────────────────────────────────────

export const prefetchService = {
  /**
   * Start prefetching all authenticated data in the background.
   * Call this right after `setTokens()` in the login/register flow.
   *
   * Fetches:
   *  1. /api/users/me          → current user profile (needed by Profile page)
   *  2. /api/songs             → user's library  (needed by Library page)
   *  3. /api/discover          → trending/latest (needed by Home + Discover pages)
   *
   * All requests run in parallel. Each is independently wrapped in a
   * try/catch so one failure does not affect the others.
   */
  start(): void {
    silent(
      prefetchStore.fetch(PREFETCH_CURRENT_USER, () => api.me(), {
        maxAgeMs: 5 * 60 * 1000, // 5 min — auth data changes rarely
        revalidateIntervalMs: 5 * 60 * 1000,
      })
    );

    silent(
      prefetchStore.fetch(PREFETCH_LIBRARY, () => api.listSongs(), {
        maxAgeMs: 10 * 1000,  // library can change often (new songs, deletes)
        revalidateIntervalMs: 30 * 1000,
      })
    );

    silent(
      prefetchStore.fetch(PREFETCH_DISCOVER, () => api.discover({ limit: 20 }), {
        maxAgeMs: 60 * 1000,  // discover data changes slowly
        revalidateIntervalMs: 60 * 1000,
      })
    );
  },

  /**
   * Invalidate all prefetch caches.
   * Call this on logout so stale data does not bleed into the next session.
   */
  clear(): void {
    prefetchStore.invalidateAll();
  },

  /**
   * Invalidate only the library cache (e.g. after a song is generated or deleted).
   */
  invalidateLibrary(): void {
    prefetchStore.invalidate(PREFETCH_LIBRARY);
  },

  /**
   * Invalidate the discover cache (e.g. after a song is published/liked).
   */
  invalidateDiscover(): void {
    prefetchStore.invalidate(PREFETCH_DISCOVER);
  },
};
