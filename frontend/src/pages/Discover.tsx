import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Playlist } from "../lib/api";
import { resolveMediaUrl } from "../lib/media";
import { playerStore } from "../stores/playerStore";
import SongDetailSidebar from "../components/song/SongDetailSidebar";
import SongCard from "../components/song/SongCard";
import { inferGenresFromPrompt } from "../lib/genres";

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

type DiscoverResponse = {
  trending: DiscoverSong[];
  latest: DiscoverSong[];
  genre_songs: DiscoverSong[];
};

type DiscoverOrder = "newest" | "popular" | "style";

const DISCOVER_GENRES = [
  { value: "", label: "All genres" },
  { value: "Electronic", label: "Electronic" },
  { value: "Ambient", label: "Ambient" },
  { value: "Cinematic", label: "Cinematic" },
  { value: "Lo-Fi", label: "Lo-Fi" },
  { value: "Rock", label: "Rock" },
  { value: "Jazz", label: "Jazz" },
  { value: "Classical", label: "Classical" },
  { value: "Hip-Hop", label: "Hip-Hop" },
  { value: "Pop", label: "Pop" },
  { value: "R&B", label: "R&B" },
  { value: "Other", label: "Other / Mixed" },
] as const;

export default function Discover() {
  const [data, setData] = useState<DiscoverResponse | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [order, setOrder] = useState<DiscoverOrder>("newest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, { like_count: number; liked_by_me: boolean }>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [addingToId, setAddingToId] = useState<string | null>(null);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .discover({ genre: genre || undefined, limit: 20 })
      .then(setData)
      .catch((e: any) => setError(e?.message || "Failed to load discover feed"))
      .finally(() => setLoading(false));
  }, [genre]);

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

  const getSongsForView = (): DiscoverSong[] => {
    if (!data) return [];
    if (order === "popular") return data.trending;
    if (order === "style") return data.genre_songs;
    return data.latest;
  };

  const handlePlaySong = (song: DiscoverSong) => {
    if (!song.audio_url) return;
    const url = resolveMediaUrl(song.audio_url);
    if (!url) return;
    playerStore.setQueue(
      [
        {
          id: song.id,
          title: song.title,
          audioUrl: url
        }
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

  const openPlaylistPicker = async (songId: string) => {
    setError(null);
    setActiveSongId((current) => (current === songId ? null : songId));

    // Lazy-load playlists the first time they are needed
    if (playlists === null) {
      try {
        setPlaylistsLoading(true);
        const list = await api.listPlaylists();
        setPlaylists(list);
      } catch (e: any) {
        setError(e?.message || "Failed to load playlists");
      } finally {
        setPlaylistsLoading(false);
      }
    }
  };

  const handleAddToPlaylist = async (playlistId: string, songId: string) => {
    setError(null);
    try {
      setAddingToId(playlistId);
      await api.addSongToPlaylist(playlistId, songId);
      // Close picker after successful add
      setActiveSongId(null);
    } catch (e: any) {
      setError(e?.message || "Failed to add to playlist");
    } finally {
      setAddingToId(null);
    }
  };

  const songs = getSongsForView();

  return (
    <>
      <div className={`mx-auto px-4 py-10 transition-all ${selectedSongId ? 'max-w-4xl' : 'max-w-5xl'}`}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Discover</h1>
            <p className="mt-2 text-sm text-gray-300">Public library of shared songs.</p>
          </div>
          <Link className="rounded-md bg-white px-3 py-2 text-sm text-black" to="/generate">
            Generate new
          </Link>
        </div>

        <div className={`mt-6 rounded-xl border border-white/10 bg-white/5 p-5 transition-all ${selectedSongId ? 'max-w-3xl' : ''}`}>
        <div className="flex flex-col gap-3 border-b border-white/5 pb-4 text-sm md:flex-row md:items-end md:justify-between">
          <div className="flex flex-1 flex-col gap-2 md:flex-row">
            <div className="w-full md:w-48">
              <label className="block text-xs font-medium text-gray-400">Genre</label>
              <select
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/30"
                value={genre || ""}
                onChange={(e) => setGenre(e.target.value || null)}
              >
                {DISCOVER_GENRES.map((g) => (
                  <option key={g.value || "all"} value={g.value}>
                    {g.label}
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
              const isPlaying = currentPlayingId === s.id;
              const inferredGenres = inferGenresFromPrompt(s.prompt);
              const displayGenre =
                inferredGenres.length > 1 ? inferredGenres.join(" / ") : s.genre ?? inferredGenres[0] ?? null;

              return (
                <SongCard
                  key={s.id}
                  song={{
                      ...s,
                      genre: displayGenre,
                      like_count: state.like_count,
                      liked_by_me: state.liked_by_me,
                    }}
                  variant="card"
                  isPlaying={isPlaying}
                  showPlayButton={true}
                  showUsername={true}
                  showGenre={true}
                  showDate={true}
                  onPlay={() => handlePlaySong(s)}
                  onSelect={() => setSelectedSongId(s.id)}
                  additionalActions={
                    <>
                      <button
                        type="button"
                        onClick={() => handleLike(s)}
                        disabled={isLoading}
                        className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs text-white hover:border-pink-400 hover:text-pink-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isLoading ? "…" : state.liked_by_me ? "❤️" : "🤍"} {state.like_count}
                      </button>
                      <button
                        type="button"
                        className={`flex h-8 w-8 items-center justify-center rounded-full border px-0 text-sm transition ${
                          activeSongId === s.id
                            ? "border-blue-400 bg-blue-500/20 text-blue-200"
                            : "border-white/20 bg-black/40 text-gray-200 hover:border-blue-400 hover:text-blue-200"
                        }`}
                        onClick={() => openPlaylistPicker(s.id)}
                        aria-label="Add to playlist"
                      >
                        <span className="text-base leading-none">+</span>
                      </button>
                    </>
                  }
                  footer={
                    activeSongId === s.id ? (
                    <div className="rounded-md border border-white/15 bg-black/60 p-2 text-xs text-gray-200">
                      {playlistsLoading ? (
                        <div className="px-1 py-0.5 text-gray-300">Loading playlists…</div>
                      ) : playlists && playlists.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="mr-1 text-[11px] uppercase tracking-wide text-gray-400">
                            Add to playlist:
                          </span>
                          {playlists.map((pl) => (
                            <button
                              key={pl.id}
                              type="button"
                              className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[11px] font-medium hover:border-white/50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={addingToId === pl.id}
                              onClick={() => handleAddToPlaylist(pl.id, s.id)}
                            >
                              {addingToId === pl.id ? "Adding…" : pl.name}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span>You don&apos;t have any playlists yet.</span>
                          <Link
                            to="/playlists"
                            className="rounded-full border border-white/30 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white hover:border-white/60"
                          >
                            Create a playlist
                          </Link>
                        </div>
                      )}
                    </div>
                    ) : null
                  }
                />
              );
            })}
          </div>
        )}
      </div>
      </div>
      <SongDetailSidebar
        songId={selectedSongId}
        onClose={() => setSelectedSongId(null)}
        onLikeChange={({ songId, liked, like_count }) => {
          setOptimistic((prev) => ({
            ...prev,
            [songId]: {
              like_count,
              liked_by_me: liked,
            },
          }));
        }}
      />
    </>
  );
}


