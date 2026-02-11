import { authedHttp } from "@/lib/http";

export type PublishShareRequest = {
  file_object_id: string;
  expires_in_hours?: number | null;
};

export type PublishShareResponse = {
  slug: string;
  expires_at: string | null;
};

export type RevokeShareRequest = {
  slug: string;
};

export type RevokeShareResponse = {
  slug: string;
  revoked_at: string | null;
};

export type ResolvedShare = {
  slug: string;
  file: {
    id: string;
    key: string;
    content_type: string;
    original_filename: string | null;
  };
  content_url: string;
  expires_at: string | null;
  revoked_at: string | null;
};

export async function publishShare(req: PublishShareRequest): Promise<PublishShareResponse> {
  return authedHttp("/api/shares/publish", {
    method: "POST",
    body: JSON.stringify(req)
  });
}

export async function revokeShare(req: RevokeShareRequest): Promise<RevokeShareResponse> {
  return authedHttp("/api/shares/revoke", {
    method: "POST",
    body: JSON.stringify(req)
  });
}

export async function getShare(slug: string): Promise<ResolvedShare> {
  const res = await fetch(`/api/shares/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as ResolvedShare;
}


