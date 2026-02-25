import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { DiscoverSongCard } from "../components/discover/DiscoverSongCard";
import { PopularArtistCard } from "../components/discover/PopularArtistCard";
import { inferGenresFromPrompt } from "../lib/genres";
import { resolveMediaUrl } from "../lib/media";
import { playerStore } from "../stores/playerStore";
import { Music, Download, Sparkles, ArrowRight, Smartphone } from "lucide-react";

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
  const [optimistic, setOptimistic] = useState<
    Record<string, { like_count: number; liked_by_me: boolean; play_count?: number }>
  >({});
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

  // Get album covers for hero background mosaic
  const albumCovers = trending
    .filter((s) => s.cover_image_url)
    .slice(0, 20)
    .map((s) => resolveMediaUrl(s.cover_image_url));

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

  // Subscribe to player store to track currently playing song
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

    // Optimistically bump play count
    setOptimistic((prev) => {
      const prevState = prev[song.id];
      const currentPlayCount = prevState?.play_count ?? song.play_count;
      return {
        ...prev,
        [song.id]: {
          like_count: prevState?.like_count ?? song.like_count,
          liked_by_me: prevState?.liked_by_me ?? song.liked_by_me,
          play_count: currentPlayCount + 1,
        },
      };
    });

    // Persist play count to backend (best-effort)
    void api
      .incrementPlayCount(song.id)
      .catch(() => {
        // ignore errors
      });

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
    <div className="min-h-screen">
      {/* Hero Section with Album Cover Mosaic Background */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-purple-950/30 to-slate-900 py-20 sm:py-32">
        {/* Album Cover Mosaic Background */}
        <div className="absolute inset-0 opacity-20">
          <div className="grid grid-cols-5 gap-2 p-4 blur-sm">
            {albumCovers.length > 0 ? (
              albumCovers.map((cover, idx) => (
                <div
                  key={idx}
                  className="aspect-square overflow-hidden rounded-lg"
                  style={{
                    animation: `float ${3 + (idx % 3)}s ease-in-out infinite`,
                    animationDelay: `${idx * 0.1}s`,
                  }}
                >
                  {cover && (
                    <img
                      src={cover}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
              ))
            ) : (
              // Fallback gradient squares
              Array.from({ length: 20 }).map((_, idx) => (
                <div
                  key={idx}
                  className="aspect-square rounded-lg bg-gradient-to-br from-purple-500/30 to-pink-500/30"
                  style={{
                    animation: `float ${3 + (idx % 3)}s ease-in-out infinite`,
                    animationDelay: `${idx * 0.1}s`,
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* Liquid Gradient Overlay */}
        <div className="absolute inset-0">
          <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-purple-500/20 blur-3xl animate-pulse" />
          <div className="absolute -right-20 -bottom-20 h-96 w-96 rounded-full bg-pink-500/20 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
          <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
        </div>

        {/* Content */}
        <div className="relative mx-auto max-w-6xl px-4">
          <div className="text-center">
            <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl">
              <span className="bg-gradient-to-r from-purple-300 via-pink-300 to-blue-300 bg-clip-text text-transparent">
                Create AI Songs
              </span>
              <br />
              Generate & Share Your Music
              <br />
              <span className="text-4xl sm:text-5xl md:text-6xl">Powered by AI</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300 sm:text-xl">
              Transform your ideas into music with AI. Generate unique songs from text prompts, share them with the community, 
              and discover amazing AI-generated tracks from creators worldwide.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-black shadow-lg transition hover:bg-slate-100 hover:shadow-xl"
              >
                Start Creating
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                to="/discover"
                className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 bg-white/5 px-6 py-4 text-base font-semibold text-white backdrop-blur-sm transition hover:border-white/50 hover:bg-white/10"
              >
                Discover AI Songs
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 rounded-full border-2 border-transparent bg-black/30 px-6 py-4 text-base font-semibold text-slate-100 backdrop-blur-sm transition hover:border-white/20 hover:bg-black/50"
              >
                View Plans
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-400">
              Create unlimited AI songs · Share with the community
            </p>
          </div>
        </div>
      </section>

      {/* Feature Highlights Section */}
      <section className="bg-black/40 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid gap-8 md:grid-cols-3">
            {/* High Quality Audio */}
            <div className="rounded-2xl bg-gradient-to-br from-purple-900/30 to-black/60 p-8 backdrop-blur-sm">
              <div className="mb-4 inline-flex rounded-full bg-purple-500/20 p-3">
                <Music className="h-6 w-6 text-purple-300" />
              </div>
              <h3 className="mb-2 text-xl font-semibold text-white">AI-Powered Generation</h3>
              <p className="text-sm text-slate-300">
                Create unique songs from simple text prompts. Our AI understands your vision and brings it to life with professional-quality music.
              </p>
            </div>

            {/* Offline Download */}
            <div className="rounded-2xl bg-gradient-to-br from-pink-900/30 to-black/60 p-8 backdrop-blur-sm">
              <div className="mb-4 inline-flex rounded-full bg-pink-500/20 p-3">
                <Download className="h-6 w-6 text-pink-300" />
              </div>
              <h3 className="mb-2 text-xl font-semibold text-white">Share & Discover</h3>
              <p className="text-sm text-slate-300">
                Share your AI-generated songs with the world and discover amazing tracks from other creators. Build your music library and connect with the community.
              </p>
            </div>

            {/* Animated Lyrics */}
            <div className="rounded-2xl bg-gradient-to-br from-blue-900/30 to-black/60 p-8 backdrop-blur-sm">
              <div className="mb-4 inline-flex rounded-full bg-blue-500/20 p-3">
                <Sparkles className="h-6 w-6 text-blue-300" />
              </div>
              <h3 className="mb-2 text-xl font-semibold text-white">Customize & Control</h3>
              <p className="text-sm text-slate-300">
                Control genre, duration, lyrics, and more. Fine-tune your AI-generated songs to match your creative vision perfectly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Songs Section */}
      <section className="bg-gradient-to-b from-black/80 via-slate-950/90 to-black/80 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-white">Popular AI Songs</h2>
              <p className="mt-2 text-slate-300">
                Discover trending AI-generated tracks created by our community of music creators.
              </p>
            </div>
            <Link
              to="/discover"
              className="text-sm font-medium text-purple-300 hover:text-purple-200 transition"
            >
              View All →
            </Link>
          </div>

          {loading && <div className="text-sm text-slate-300">Loading popular songs…</div>}
          {error && !loading && <div className="text-sm text-red-300">{error}</div>}
          {!loading && !error && !trending.length && (
            <div className="text-sm text-slate-400">
              No AI songs shared yet. Be the first to generate and share one.
            </div>
          )}

          {!loading && !error && trending.length > 0 && (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {trending.slice(0, 6).map((s) => {
                const state = optimistic[s.id] ?? {
                  like_count: s.like_count,
                  liked_by_me: s.liked_by_me,
                  play_count: s.play_count,
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
                  play_count: state.play_count ?? s.play_count,
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
        </div>
      </section>

      {/* Artist Recommendations Section */}
      <section className="bg-black/60 py-16">
        <div className="mx-auto max-w-6xl px-4">
          {/* Artist Announcement Banner */}
          <div className="mb-8 rounded-2xl bg-gradient-to-r from-purple-900/40 via-pink-900/40 to-blue-900/40 p-6 backdrop-blur-sm border border-white/10">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-white/10 p-3">
                <Sparkles className="h-6 w-6 text-yellow-300" />
              </div>
              <div className="flex-1">
                <h3 className="mb-2 text-lg font-semibold text-white">
                  CREATOR SPOTLIGHT · Top AI Music Creators
                </h3>
                <p className="text-sm text-slate-300">
                  Discover talented creators who are pushing the boundaries of AI music generation. 
                  Explore their unique styles and get inspired for your next AI song creation.
                </p>
              </div>
            </div>
          </div>

          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-white">Top AI Music Creators</h2>
              <p className="mt-2 text-slate-300">
                Discover talented creators who are generating amazing AI songs and sharing them with the community.
              </p>
            </div>
            <Link
              to="/discover"
              className="text-sm font-medium text-purple-300 hover:text-purple-200 transition"
            >
              Browse All Artists →
            </Link>
          </div>

          {loading && <div className="text-sm text-slate-300">Finding standout artists…</div>}
          {error && !loading && <div className="text-sm text-red-300">{error}</div>}
          {!loading && !error && !popularArtists.length && (
            <div className="text-sm text-slate-400">Top creators will appear here as AI songs get likes and shares.</div>
          )}

          {!loading && !error && popularArtists.length > 0 && (
            <div className="flex gap-4 overflow-x-auto pb-4">
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
        </div>
      </section>

      {/* App Download Section */}
      <section className="bg-gradient-to-b from-black/80 to-slate-950 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="rounded-3xl bg-gradient-to-br from-slate-900/80 to-black/80 p-12 backdrop-blur-sm border border-white/10">
            <div className="grid gap-8 md:grid-cols-2 md:items-center">
              <div>
                <div className="mb-4 inline-flex rounded-full bg-purple-500/20 p-3">
                  <Smartphone className="h-6 w-6 text-purple-300" />
                </div>
                <h2 className="mb-4 text-3xl font-bold text-white">
                  Create Anywhere
                </h2>
                <p className="mb-6 text-slate-300">
                  Generate AI songs on any device. Access your library, playlists, and shared creations 
                  seamlessly across phone, tablet, and desktop.
                </p>
                <div className="flex flex-wrap gap-4">
                  <a
                    href="#"
                    className="inline-flex items-center gap-3 rounded-xl bg-black/60 px-6 py-4 text-white hover:bg-black/80 transition border border-white/20"
                    onClick={(e) => {
                      e.preventDefault();
                      // TODO: Add actual App Store link
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">Download on the</span>
                      <span className="text-lg font-semibold">App Store</span>
                    </div>
                  </a>
                  <a
                    href="#"
                    className="inline-flex items-center gap-3 rounded-xl bg-black/60 px-6 py-4 text-white hover:bg-black/80 transition border border-white/20"
                    onClick={(e) => {
                      e.preventDefault();
                      // TODO: Add actual Google Play link
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">Get it on</span>
                      <span className="text-lg font-semibold">Google Play</span>
                    </div>
                  </a>
                </div>
              </div>
              <div className="hidden md:block">
                <div className="relative mx-auto max-w-xs">
                  <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 blur-2xl" />
                  <div className="relative rounded-3xl bg-slate-800/50 p-8 backdrop-blur-sm border border-white/10">
                    <div className="aspect-[9/16] rounded-2xl bg-gradient-to-br from-purple-900 to-pink-900 flex items-center justify-center">
                      <Smartphone className="h-24 w-24 text-white/30" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
