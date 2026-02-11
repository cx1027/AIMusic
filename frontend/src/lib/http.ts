import { clearTokens, getAccessToken, setTokens } from "./auth";

export const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:8000").replace(/\/$/, "");

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function mergeHeaders(a?: HeadersInit, b?: HeadersInit): HeadersInit {
  const out = new Headers(a || {});
  if (b) new Headers(b).forEach((v, k) => out.set(k, v));
  return out;
}

async function parseError(res: Response) {
  const text = await res.text().catch(() => "");
  return text || `HTTP ${res.status}`;
}

let refreshInFlight: Promise<{ access: string; refresh: string }> | null = null;

async function refreshTokens(): Promise<{ access: string; refresh: string }> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refresh = localStorage.getItem("aimusic.refresh_token");
    if (!refresh) throw new Error("Missing refresh token");
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh })
    });
    if (!res.ok) throw new Error(await parseError(res));
    const data = (await res.json()) as { access_token: string; refresh_token: string; token_type: string };
    setTokens(data.access_token, data.refresh_token);
    return { access: data.access_token, refresh: data.refresh_token };
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function authedHttp<T>(path: string, init?: RequestInit, opts?: { retry?: boolean }): Promise<T> {
  const token = getAccessToken();
  const headers: HeadersInit = mergeHeaders(
    { "Content-Type": "application/json" },
    mergeHeaders(init?.headers, token ? { Authorization: `Bearer ${token}` } : undefined)
  );

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && (opts?.retry ?? true)) {
    try {
      const { access } = await refreshTokens();
      const retryHeaders: HeadersInit = mergeHeaders(headers, { Authorization: `Bearer ${access}` });
      const retryRes = await fetch(`${API_BASE}${path}`, { ...init, headers: retryHeaders });
      if (!retryRes.ok) throw new Error(await parseError(retryRes));
      return (await retryRes.json()) as T;
    } catch (e) {
      clearTokens();
      throw e;
    }
  }

  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as T;
}


