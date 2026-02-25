export { API_BASE } from "./http";
import { authedHttp } from "./http";
import { http } from "../api/client";

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
    like_count?: number;
    liked_by_me?: boolean;
  }[];
};

export const api = {
  register: (email: string, username: string, password: string) =>
    http<{ id: string; email: string; username: string }>(`/api/auth/register`, {
      method: "POST",
      body: JSON.stringify({ email, username, password })
    }),
  login: (email: string, password: string) =>
    http<{ access_token: string; refresh_token: string; token_type: string }>(`/api/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  me: () =>
    authedHttp<{
      id: string;
      email: string;
      username: string;
      avatar_url?: string | null;
      background_url?: string | null;
      credits_balance: number;
      details?: string | null;
    }>(`/api/users/me`),
  getUserByUsername: (username: string) =>
    http<{
      id: string;
      username: string;
      avatar_url?: string | null;
      background_url?: string | null;
      details?: string | null;
      subscription_tier: string;
      created_at: string;
      followers_count: number;
      following_count: number;
      is_following?: boolean | null;
      is_me?: boolean | null;
    }>(
      `/api/users/username/${encodeURIComponent(username)}`
    ),
  updateUser: (payload: { email?: string; username?: string; details?: string | null }) =>
    authedHttp<{ id: string; email: string; username: string; credits_balance: number; details?: string | null }>(`/api/users/me`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return authedHttp<{ avatar_url: string }>(`/api/users/me/avatar`, {
      method: "POST",
      body: form
    });
  },
  uploadBackground: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return authedHttp<{ background_url: string }>(`/api/users/me/background`, {
      method: "POST",
      body: form
    });
  },
  listSongs: (params?: ListSongsParams) => {
    const search = new URLSearchParams();
    if (params?.q) search.set("q", params.q);
    if (params?.genre) search.set("genre", params.genre);
    if (params?.order) search.set("order", params.order);
    const qs = search.toString();
    const url = qs ? `/api/songs?${qs}` : `/api/songs`;
    return authedHttp<
      Array<{
        id: string;
        title: string;
        audio_url?: string | null;
        cover_image_url?: string | null;
        created_at: string;
        genre?: string | null;
        is_public: boolean;
        play_count?: number;
        like_count?: number;
        liked_by_me?: boolean;
      }>
    >(url);
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
  deleteSong: (songId: string) =>
    authedHttp<void>(`/api/songs/${songId}`, {
      method: "DELETE"
    }),
  toggleLikeSong: (songId: string) =>
    authedHttp<{ song_id: string; liked: boolean; like_count: number }>(`/api/songs/${songId}/like`, {
      method: "POST"
    }),
  updateSongVisibility: (songId: string, isPublic: boolean) =>
    authedHttp<{ id: string; is_public: boolean }>(`/api/songs/${songId}/visibility`, {
      method: "PATCH",
      body: JSON.stringify({ is_public: isPublic })
    }),
  generate: (
    prompt: string,
    lyrics: string | null,
    duration: number,
    title?: string | null,
    genre?: string | null
  ) =>
    authedHttp<{ task_id: string; events_url: string }>(`/api/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt, lyrics, duration, title, genre })
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
        liked_by_me: boolean;
      }>;
      latest: Array<{
        id: string;
        user_id: string;
        username: string;
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
        liked_by_me: boolean;
      }>;
      genre_songs: Array<{
        id: string;
        user_id: string;
        username: string;
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
        liked_by_me: boolean;
      }>;
    }>(url);
  },
  getPublicSongsByUser: (userId: string) => {
    // Try authenticated first, fallback to unauthenticated
    return authedHttp<
      Array<{
        id: string;
        title: string;
        audio_url?: string | null;
        created_at: string;
        is_public: boolean;
        liked_by_me: boolean;
      }>
    >(`/api/songs/user/${userId}/public`).catch(() =>
      http<
        Array<{
          id: string;
          title: string;
          audio_url?: string | null;
          created_at: string;
          is_public: boolean;
          liked_by_me: boolean;
        }>
      >(`/api/songs/user/${userId}/public`)
    );
  },
  getFollowers: (userId: string) =>
    http<
      Array<{
        id: string;
        username: string;
        avatar_url?: string | null;
        details?: string | null;
      }>
    >(`/api/users/${userId}/followers`),
  getFollowing: (userId: string) =>
    http<
      Array<{
        id: string;
        username: string;
        avatar_url?: string | null;
        details?: string | null;
      }>
    >(`/api/users/${userId}/following`),
  incrementPlayCount: (songId: string) =>
    http<{ song_id: string; play_count: number }>(`/api/songs/${songId}/play`, {
      method: "POST"
    }),
};


