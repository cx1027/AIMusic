import { API_BASE } from "./http";

/**
 * Resolve backend-provided URLs for media.
 *
 * Backend may return relative paths like "/api/files/{key}".
 * The browser must request them from the backend origin (API_BASE),
 * not the frontend origin.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = String(url);
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  return `${API_BASE}/${u}`;
}


