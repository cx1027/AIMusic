import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

type DiscoverSong = {
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
};

type DiscoverResponse = {
  trending: DiscoverSong[];
  latest: DiscoverSong[];
  genre_songs: DiscoverSong[];
};

type DiscoverOrder = "newest" | "popular" | "style";

export default function Discover() {
  const [data, setData] = useState<DiscoverResponse | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [order, setOrder] = useState<DiscoverOrder>("newest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, { like_count: number; liked_by_me: boolean }>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .discover({ genre: genre || undefined, limit: 20 })
      .then(setData)
      .catch((e: any) => setError(e?.message || "Failed to load discover feed"))
      .finally(() => setLoading(false));
  }, [genre]);

  const getSongsForView = (): DiscoverSong[] => {
    if (!data) return [];
    if (order === "popular") return data.trending;
    if (order === "style") return data.genre_songs;
    return data.latest;
  };

  const handleLike = (song: DiscoverSong) => {
    if (loadingIds.has(song.id)) return;
    setLoadingIds((prev) => new Set(prev).add(song.id));
    api
      .toggleLikeSong(song.id)
      .then((res) => {
        setOptimistic((prev) => ({
          ...prev,
          [song.id]: { like_count: res.like_count, liked_by_me: res.liked }
        }));
      })
      .catch(() => {
        // ignore errors for now
      })
      .finally(() => {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(song.id);
          return next;
        });
      });
  };

  const songs = getSongsForView();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Discover</h1>
          <p className="mt-2 text-sm text-gray-300">Public library of shared songs.</p>
        </div>
        <Link className="rounded-md bg-white px-3 py-2 text-sm text-black" to="/generate">
          Generate new
        </Link>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-3 border-b border-white/5 pb-4 text-sm md:flex-row md:items-end md:justify-between">
          <div className="flex flex-1 flex-col gap-2 md:flex-row">
            <div className="w-full md:w-40">
              <label className="block text-xs font-medium text-gray-400">Genre</label>
              <select
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/30"
                value={genre || ""}
                onChange={(e) => setGenre(e.target.value || null)}
              >
                <option value="">All</option>
                {["pop", "rock", "hiphop", "electronic", "jazz"].map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="w-full md:w-40">
            <label className="block text-xs font-medium text-gray-400">Sort by</label>
            <select
              className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/30"
              value={order}
              onChange={(e) => setOrder(e.target.value as DiscoverOrder)}
            >
              <option value="newest">Newest</option>
              <option value="popular">Most popular</option>
              <option value="style">By style</option>
            </select>
          </div>
        </div>

        {loading && <div className="mt-2 text-sm text-gray-300">Loading discover feed…</div>}
        {error && !loading && <div className="mt-2 text-sm text-red-300">{error}</div>}
        {!loading && !error && order === "style" && !genre && (
          <div className="mt-2 text-xs text-gray-400">Choose a genre to browse by style.</div>
        )}
        {!loading && !error && !songs.length && (
          <div className="mt-2 text-xs text-gray-400">No songs yet.</div>
        )}

        {!loading && !error && songs.length > 0 && (
          <div className="mt-4 grid gap-3">
            {songs.map((s) => {
              const state = optimistic[s.id] ?? { like_count: s.like_count, liked_by_me: s.liked_by_me };
              const isLoading = loadingIds.has(s.id);

              return (
                <div
                  key={s.id}
                  className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/songs/${s.id}`} className="truncate text-gray-100 hover:underline">
                        {s.title || "Untitled"}
                      </Link>
                      <div className="mt-1 text-xs text-gray-400">
                        by <span className="font-medium text-gray-200">@{s.username}</span>{" "}
                        · {s.genre ? <span className="uppercase">{s.genre}</span> : "No genre"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-500">
                        {new Date(s.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-300">
                      <span>❤️ {state.like_count}</span>
                      <span>▶️ {s.play_count}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => handleLike(s)}
                      disabled={isLoading}
                      className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs text-white hover:border-pink-400 hover:text-pink-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoading ? "…" : state.liked_by_me ? "Liked" : "Like"}
                    </button>
                    <Link
                      to={`/songs/${s.id}`}
                      className="rounded-full border border-white/30 bg-white/5 px-3 py-1 text-xs text-white hover:border-white/60"
                    >
                      View details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


