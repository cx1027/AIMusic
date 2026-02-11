export { API_BASE } from "./http";
import { authedHttp } from "./http";

type ListSongsParams = {
  q?: string;
  genre?: string;
  order?: "newest" | "oldest" | "popular";
};

export type Playlist = {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
};

export type PlaylistWithSongs = Playlist & {
  songs: {
    id: string;
    title: string;
    audio_url?: string | null;
    created_at: string;
  }[];
};

export const api = {
  register: (email: string, username: string, password: string) =>
    authedHttp<{ id: string; email: string; username: string }>(`/api/auth/register`, {
      method: "POST",
      body: JSON.stringify({ email, username, password })
    }),
  login: (email: string, password: string) =>
    authedHttp<{ access_token: string; refresh_token: string; token_type: string }>(`/api/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  me: () => authedHttp<{ id: string; email: string; username: string; credits_balance: number }>(`/api/users/me`),
  listSongs: (params?: ListSongsParams) => {
    const search = new URLSearchParams();
    if (params?.q) search.set("q", params.q);
    if (params?.genre) search.set("genre", params.genre);
    if (params?.order) search.set("order", params.order);
    const qs = search.toString();
    const url = qs ? `/api/songs?${qs}` : `/api/songs`;
    return authedHttp<Array<{ id: string; title: string; audio_url?: string | null; created_at: string }>>(url);
  },
  getSong: (songId: string) => authedHttp<{
    id: string;
    title: string;
    prompt: string;
    lyrics?: string | null;
    audio_url?: string | null;
    duration: number;
    genre?: string | null;
    bpm?: number | null;
    is_public: boolean;
    play_count: number;
    like_count: number;
    created_at: string;
  }>(`/api/songs/${songId}`),
  toggleLikeSong: (songId: string) =>
    authedHttp<{ song_id: string; liked: boolean; like_count: number }>(`/api/songs/${songId}/like`, {
      method: "POST"
    }),
  generate: (prompt: string, lyrics: string | null, duration: number) =>
    authedHttp<{ task_id: string; events_url: string }>(`/api/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt, lyrics, duration })
    }),
  listPlaylists: () => authedHttp<Playlist[]>(`/api/playlists`),
  createPlaylist: (name: string, description?: string | null) =>
    authedHttp<Playlist>(`/api/playlists`, {
      method: "POST",
      body: JSON.stringify({ name, description })
    }),
  updatePlaylist: (id: string, payload: { name?: string; description?: string | null }) =>
    authedHttp<Playlist>(`/api/playlists/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deletePlaylist: (id: string) =>
    authedHttp<void>(`/api/playlists/${id}`, {
      method: "DELETE"
    }),
  getPlaylist: (id: string) => authedHttp<PlaylistWithSongs>(`/api/playlists/${id}`),
  addSongToPlaylist: (playlistId: string, songId: string) =>
    authedHttp<PlaylistWithSongs>(`/api/playlists/${playlistId}/songs/${songId}`, {
      method: "POST"
    }),
  removeSongFromPlaylist: (playlistId: string, songId: string) =>
    authedHttp<PlaylistWithSongs>(`/api/playlists/${playlistId}/songs/${songId}`, {
      method: "DELETE"
    }),
  followUser: (userId: string) =>
    authedHttp<{ user_id: string; following: boolean }>(`/api/users/${userId}/follow`, {
      method: "POST"
    }),
  unfollowUser: (userId: string) =>
    authedHttp<{ user_id: string; following: boolean }>(`/api/users/${userId}/follow`, {
      method: "DELETE"
    }),
  discover: (opts?: { genre?: string; limit?: number }) => {
    const search = new URLSearchParams();
    if (opts?.genre) search.set("genre", opts.genre);
    if (opts?.limit) search.set("limit", String(opts.limit));
    const qs = search.toString();
    const url = qs ? `/api/discover?${qs}` : `/api/discover`;
    return authedHttp<{
      trending: Array<{
        id: string;
        user_id: string;
        username: string;
        title: string;
        audio_url?: string | null;
        duration: number;
        genre?: string | null;
        bpm?: number | null;
        is_public: boolean;
        play_count: number;
        like_count: number;
        created_at: string;
        liked_by_me: boolean;
      }>;
      latest: Array<{
        id: string;
        user_id: string;
        username: string;
        title: string;
        audio_url?: string | null;
        duration: number;
        genre?: string | null;
        bpm?: number | null;
        is_public: boolean;
        play_count: number;
        like_count: number;
        created_at: string;
        liked_by_me: boolean;
      }>;
      genre_songs: Array<{
        id: string;
        user_id: string;
        username: string;
        title: string;
        audio_url?: string | null;
        duration: number;
        genre?: string | null;
        bpm?: number | null;
        is_public: boolean;
        play_count: number;
        like_count: number;
        created_at: string;
        liked_by_me: boolean;
      }>;
    }>(url);
  }
};


