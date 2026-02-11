import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";

type DiscoverSong = {
  id: string;
  user_id: string;
  username: string;
  title: string;
  audio_url?: string | null;
  duration: number;
  genre?: string | null;
  like_count: number;
  play_count: number;
  created_at: string;
  liked_by_me: boolean;
};

export default function TrendingList(props: { songs: DiscoverSong[] }) {
  const { songs } = props;
  const [optimistic, setOptimistic] = useState<Record<string, { like_count: number; liked_by_me: boolean }>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  if (!songs.length) {
    return <div className="text-xs text-gray-400">No trending songs yet.</div>;
  }

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

  return (
    <div className="space-y-2 text-xs">
      {songs.map((s, idx) => {
        const state = optimistic[s.id] ?? { like_count: s.like_count, liked_by_me: s.liked_by_me };
        const isLoading = loadingIds.has(s.id);

        return (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/40 px-3 py-2"
          >
            <button
              type="button"
              className="flex-1 text-left"
              onClick={() => navigate(`/songs/${s.id}`)}
            >
              <div className="flex items-center gap-3">
                <div className="w-5 text-[11px] text-gray-500">{idx + 1}.</div>
                <div className="flex-1">
                  <div className="truncate text-sm font-medium text-white">{s.title || "Untitled"}</div>
                  <div className="mt-0.5 text-[11px] text-gray-400">
                    @{s.username} · ❤️ {state.like_count} · ▶️ {s.play_count}
                  </div>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleLike(s)}
              disabled={isLoading}
              className="rounded-full border border-white/20 px-2 py-0.5 text-[11px] text-white hover:bg-white/10 disabled:opacity-60"
            >
              {isLoading ? "…" : state.liked_by_me ? "Liked" : "Like"}
            </button>
          </div>
        );
      })}
    </div>
  );
}


