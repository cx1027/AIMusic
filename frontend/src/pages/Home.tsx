import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { DiscoverSongCard } from "../components/discover/DiscoverSongCard";
import { PopularArtistCard } from "../components/discover/PopularArtistCard";
import { inferGenresFromPrompt } from "../lib/genres";
import { resolveMediaUrl } from "../lib/media";
import { playerStore } from "../stores/playerStore";

type DiscoverSong = {
  id: string;
  user_id: string;
  username: string;
  title: string;
  prompt: string;
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
};

export default function Home() {
  const [trending, setTrending] = useState<DiscoverSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, { like_count: number; liked_by_me: boolean }>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);

  // Derive a simple "popular artists" list from trending
  const popularArtists = (() => {
    const stats = new Map<
      string,
      {
        user_id: string;
        username: string;
        totalLikes: number;
      }
    >();

    for (const s of trending) {
      const key = s.username;
      const existing = stats.get(key);
      if (existing) {
        existing.totalLikes += s.like_count;
      } else {
        stats.set(key, {
          user_id: s.user_id,
          username: s.username,
          totalLikes: s.like_count,
        });
      }
    }

    return Array.from(stats.values())
      .sort((a, b) => b.totalLikes - a.totalLikes)
      .slice(0, 8);
  })();

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .discover({ limit: 16 })
      .then((res) => {
        setTrending(res.trending);
      })
      .catch((e: any) => setError(e?.message || "Failed to load popular feed"))
      .finally(() => setLoading(false));
  }, []);

  // Subscribe to player store to track currently playing song (for small play indicator)
  useEffect(() => {
    const updateCurrentPlaying = () => {
      const state = playerStore.getState();
      const currentSong = state.currentIndex >= 0 && state.queue[state.currentIndex]
        ? state.queue[state.currentIndex]
        : null;
      setCurrentPlayingId(currentSong?.id || null);
    };

    updateCurrentPlaying();
    const unsubscribe = playerStore.subscribe(updateCurrentPlaying);
    return () => {
      unsubscribe();
    };
  }, []);

  const handlePlaySong = (song: DiscoverSong) => {
    if (!song.audio_url) return;
    const url = resolveMediaUrl(song.audio_url);
    if (!url) return;
    playerStore.setQueue(
      [
        {
          id: song.id,
          title: song.title,
          audioUrl: url,
        },
      ],
      0
    );
  };

  const handleLike = (song: DiscoverSong) => {
    if (loadingIds.has(song.id)) return;
    setLoadingIds((prev) => new Set(prev).add(song.id));
    api
      .toggleLikeSong(song.id)
      .then((res) => {
        setOptimistic((prev) => ({
          ...prev,
          [song.id]: { like_count: res.like_count, liked_by_me: res.liked },
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
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-black via-slate-950 to-red-900/70 p-6 sm:p-8">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-red-500/25 blur-3xl" />
          <div className="absolute -bottom-16 right-0 h-56 w-56 rounded-full bg-rose-500/20 blur-3xl" />
        </div>
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-red-300/90">
              AI SOUND STUDIO
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Turn your ideas into{" "}
              <span className="bg-gradient-to-r from-red-300 via-rose-300 to-amber-200 bg-clip-text text-transparent">
                sound
              </span>
              .
            </h1>
            <p className="mt-3 max-w-xl text-sm text-slate-200/90">
              Type a vibe, get a fully produced track. Save your favorites and share them with the world.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black shadow-sm transition hover:bg-slate-100"
                to="/generate"
              >
                Start generating
                <span className="text-[10px] font-normal uppercase tracking-wide text-black/70">No DAW required</span>
              </Link>
              <Link
                className="inline-flex items-center gap-2 rounded-full border border-red-400/60 bg-white/5 px-4 py-2 text-sm text-white backdrop-blur-sm transition hover:border-red-300 hover:bg-red-500/10"
                to="/discover"
              >
                Explore discover
              </Link>
              <Link
                className="inline-flex items-center gap-2 rounded-full border border-transparent bg-black/30 px-4 py-2 text-sm text-slate-100 backdrop-blur-sm transition hover:border-white/20 hover:bg-black/40"
                to="/pricing"
              >
                View pricing
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Popular Songs (top) */}
      <section className="mt-10 rounded-2xl bg-gradient-to-b from-red-950/70 via-black/80 to-black/80 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.35em] text-red-300">
              Popular Songs
            </h2>
            <p className="mt-1 text-xs text-rose-100/80">
              The hottest AI-generated tracks right now.
            </p>
          </div>
          <Link
            to="/discover"
            className="text-[11px] font-medium text-red-300 hover:text-rose-200"
          >
            View all
          </Link>
        </div>

        {loading && <div className="text-xs text-rose-100/80">Loading popular songs…</div>}
        {error && !loading && <div className="text-xs text-red-300">{error}</div>}
        {!loading && !error && !trending.length && (
          <div className="text-xs text-rose-100/70">
            No public songs yet. Be the first to create one.
          </div>
        )}

        {!loading && !error && trending.length > 0 && (
          <div className="flex gap-4 overflow-x-auto pb-1">
            {trending.slice(0, 6).map((s) => {
              const state = optimistic[s.id] ?? {
                like_count: s.like_count,
                liked_by_me: s.liked_by_me,
              };
              const isLoading = loadingIds.has(s.id);
              const isPlaying = currentPlayingId === s.id;
              const inferredGenres = inferGenresFromPrompt(s.prompt);
              const displayGenre =
                inferredGenres.length > 1
                  ? inferredGenres.join(" / ")
                  : s.genre ?? inferredGenres[0] ?? null;

              const songWithOptimisticLikes: DiscoverSong = {
                ...s,
                like_count: state.like_count,
                liked_by_me: state.liked_by_me,
              };

              return (
                <div key={s.id} className="w-[210px] flex-shrink-0">
                  <DiscoverSongCard
                    song={songWithOptimisticLikes}
                    displayGenre={displayGenre}
                    isPlaying={isPlaying}
                    onPlay={() => handlePlaySong(s)}
                    onLike={() => handleLike(s)}
                    onSelect={() => {}}
                    isLiking={isLoading}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Popular Artists (bottom) */}
      <section className="mt-8 rounded-2xl bg-gradient-to-b from-black/40 via-slate-900/80 to-black/60 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-100">
              Popular Artists
            </h2>
            <p className="mt-1 text-xs text-slate-300/80">
              Creators with the most-loved tracks.
            </p>
          </div>
          <Link
            to="/discover"
            className="text-[11px] font-medium text-red-300 hover:text-rose-200"
          >
            Browse artists
          </Link>
        </div>

        {loading && <div className="text-xs text-slate-300">Finding standout artists…</div>}
        {error && !loading && <div className="text-xs text-red-300">{error}</div>}
        {!loading && !error && !popularArtists.length && (
          <div className="text-xs text-slate-400">Artists will appear here as songs get likes.</div>
        )}

        {!loading && !error && popularArtists.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {popularArtists.map((artist) => (
              <div key={artist.username} className="w-[160px] flex-shrink-0">
                <PopularArtistCard
                  username={artist.username}
                  avatar_url={undefined}
                  background_url={undefined}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}


