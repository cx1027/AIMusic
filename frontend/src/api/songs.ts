import { authHeaders, http } from "./client";

export type Song = {
  id: string;
  user_id: string;
  title: string;
  prompt: string;
  lyrics?: string | null;
  audio_url?: string | null;
  cover_image_url?: string | null;
  duration: number;
  genre?: string | null;
  bpm?: number | null;
  is_public: boolean;
  play_count: number;
  like_count: number;
  created_at: string;
};

type ListSongsParams = {
  q?: string;
  genre?: string;
  order?: "newest" | "oldest" | "popular";
};

export function listSongs(token: string, params?: ListSongsParams) {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.genre) search.set("genre", params.genre);
  if (params?.order) search.set("order", params.order);
  const qs = search.toString();
  const url = qs ? `/api/songs?${qs}` : `/api/songs`;
  return http<Array<Pick<Song, "id" | "title" | "audio_url" | "created_at">>>(url, {
    headers: authHeaders(token),
  });
}

export function getSong(token: string, songId: string) {
  return http<Song>(`/api/songs/${songId}`, {
    headers: authHeaders(token),
  });
}

