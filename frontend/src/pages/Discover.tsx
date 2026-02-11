import { useEffect, useState } from "react";
import { api } from "../lib/api";
import DiscoverGrid from "@/components/discover/DiscoverGrid";
import TrendingList from "@/components/discover/TrendingList";

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

export default function Discover() {
  const [data, setData] = useState<DiscoverResponse | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .discover({ genre: genre || undefined, limit: 20 })
      .then(setData)
      .catch((e: any) => setError(e?.message || "Failed to load discover feed"))
      .finally(() => setLoading(false));
  }, [genre]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Discover</h1>
      <p className="mt-2 text-sm text-gray-300">Public square · 热门 · 最新 · 按风格浏览</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-300">
        <span className="text-gray-400">Genre:</span>
        <button
          type="button"
          onClick={() => setGenre(null)}
          className={`rounded-full px-3 py-1 ${
            !genre ? "bg-white text-black" : "border border-white/20 text-gray-200"
          }`}
        >
          All
        </button>
        {["pop", "rock", "hiphop", "electronic", "jazz"].map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGenre(g)}
            className={`rounded-full px-3 py-1 capitalize ${
              genre === g ? "bg-white text-black" : "border border-white/20 text-gray-200"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
        {loading && <div className="text-sm text-gray-300">Loading discover feed…</div>}
        {error && !loading && <div className="text-sm text-red-300">{error}</div>}
        {!loading && !error && data && (
          <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
            <div>
              <h2 className="text-sm font-semibold text-white">最新作品</h2>
              <p className="mt-1 text-xs text-gray-400">Newest public tracks from all creators.</p>
              <div className="mt-4">
                <DiscoverGrid songs={data.latest} />
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">热门榜单</h2>
              <p className="mt-1 text-xs text-gray-400">Most liked & played public tracks.</p>
              <div className="mt-4">
                <TrendingList songs={data.trending} />
              </div>
            </div>
          </div>
        )}

        {!loading && !error && data && genre && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-white">
              风格：<span className="capitalize">{genre}</span>
            </h2>
            <p className="mt-1 text-xs text-gray-400">Browse by style.</p>
            <div className="mt-4">
              <DiscoverGrid songs={data.genre_songs} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


