export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function fetchShareData(slug: string): Promise<import("@/types/share").TrackShareData> {
  const res = await fetch(`${API_BASE}/api/track-shares/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 }, // ISR: revalidate every 60 seconds
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch share: ${res.status}`);
  }
  return res.json();
}

export function resolveMediaUrl(url: string | null): string | null {
  if (!url) return null;
  // If it's already an absolute URL (R2), return as-is
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  // If it's a local path, prefix with API base
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}
