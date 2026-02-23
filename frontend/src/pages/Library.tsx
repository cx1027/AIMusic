import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Playlist } from "../lib/api";
import { resolveMediaUrl } from "../lib/media";
import { playerStore } from "../stores/playerStore";
import SongDetailSidebar from "../components/song/SongDetailSidebar";
import SongCard from "../components/song/SongCard";

type SongRow = {
  id: string;
  title: string;
  audio_url?: string | null;
  created_at: string;
  is_public: boolean;
  like_count?: number;
  liked_by_me?: boolean;
};

const LIBRARY_GENRES = [
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

export default function Library() {
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState("");
  const [order, setOrder] = useState<"newest" | "oldest" | "popular">("newest");
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [addingToId, setAddingToId] = useState<string | null>(null);
  const [updatingVisibilityId, setUpdatingVisibilityId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);

  const handlePlaySong = (song: SongRow) => {
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

  const handleToggleVisibility = async (song: SongRow) => {
    setErr(null);
    try {
      setUpdatingVisibilityId(song.id);
      const updated = await api.updateSongVisibility(song.id, !song.is_public);
      setSongs((prev) => prev.map((x) => (x.id === song.id ? { ...x, is_public: updated.is_public } : x)));
    } catch (e: any) {
      setErr(e?.message || "Failed to update visibility");
    } finally {
      setUpdatingVisibilityId(null);
    }
  };

  const handleToggleLike = async (song: SongRow) => {
    setErr(null);
    try {
      setLikingId(song.id);
      const result = await api.toggleLikeSong(song.id);
      setSongs((prev) =>
        prev.map((x) =>
          x.id === song.id
            ? {
                ...x,
                liked_by_me: result.liked,
                like_count: result.like_count
              }
            : x
        )
      );
    } catch (e: any) {
      setErr(e?.message || "Failed to update like");
    } finally {
      setLikingId(null);
    }
  };

  useEffect(() => {
    setLoading(true);
    api
      .listSongs({
        q: q || undefined,
        genre: genre || undefined,
        order
      })
      .then(setSongs)
      .catch((e: any) => setErr(e?.message || "Failed to load songs"))
      .finally(() => setLoading(false));
  }, [q, genre, order]);

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

  const openFavoritePicker = async (songId: string) => {
    setErr(null);
    setActiveSongId((current) => (current === songId ? null : songId));

    // Lazy-load playlists the first time they are needed
    if (playlists === null) {
      try {
        setPlaylistsLoading(true);
        const list = await api.listPlaylists();
        setPlaylists(list);
      } catch (e: any) {
        setErr(e?.message || "Failed to load playlists");
      } finally {
        setPlaylistsLoading(false);
      }
    }
  };

  const handleAddToPlaylist = async (playlistId: string, songId: string) => {
    setErr(null);
    try {
      setAddingToId(playlistId);
      await api.addSongToPlaylist(playlistId, songId);
      // Close picker after successful add
      setActiveSongId(null);
    } catch (e: any) {
      setErr(e?.message || "Failed to add to playlist");
    } finally {
      setAddingToId(null);
    }
  };

  return (
    <>
      <div className={`mx-auto px-4 py-10 transition-all ${selectedSongId ? 'max-w-4xl' : 'max-w-5xl'}`}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Library</h1>
            <p className="mt-2 text-sm text-gray-300">Your generated songs.</p>
          </div>
        </div>

        <div className={`mt-6 rounded-xl border border-white/10 bg-white/5 p-5 transition-all ${selectedSongId ? 'max-w-3xl' : ''}`}>
        <div className="flex flex-col gap-3 border-b border-white/5 pb-4 text-sm md:flex-row md:items-end md:justify-between">
          <div className="flex flex-1 flex-col gap-2 md:flex-row">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-400">Search</label>
              <input
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/30"
                placeholder="Search by title or prompt…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="w-full md:w-48">
              <label className="block text-xs font-medium text-gray-400">Genre</label>
              <select
                className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/30"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
              >
                {LIBRARY_GENRES.map((g) => (
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
              onChange={(e) => setOrder(e.target.value as typeof order)}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="popular">Most played</option>
            </select>
          </div>
        </div>

        {loading ? <div className="text-gray-300">Loading…</div> : null}
        {err ? <div className="mt-2 text-sm text-red-300">{err}</div> : null}
        {!loading && !err && songs.length === 0 ? <div className="mt-2 text-gray-400">No songs yet.</div> : null}

        <div className="mt-4 grid gap-3">
          {songs.map((s) => {
            const isPlaying = currentPlayingId === s.id;
            return (
              <SongCard
              key={s.id}
                song={s}
                variant="card"
                isPlaying={isPlaying}
                showPlayButton={true}
                showLikeButton={true}
                showVisibilityToggle={true}
                showDate={true}
                onPlay={() => handlePlaySong(s)}
                onLike={() => handleToggleLike(s)}
                onToggleVisibility={() => handleToggleVisibility(s)}
                onSelect={() => setSelectedSongId(s.id)}
                isUpdatingVisibility={updatingVisibilityId === s.id}
                isLoading={likingId === s.id}
                additionalActions={
                  <>
                  <button
                    type="button"
                    className={`flex h-9 w-9 items-center justify-center rounded-full border px-0 text-sm transition ${
                      activeSongId === s.id
                        ? "border-pink-400 bg-pink-500/20 text-pink-200"
                        : "border-white/20 bg-black/40 text-gray-200 hover:border-pink-400 hover:text-pink-200"
                    }`}
                    onClick={() => openFavoritePicker(s.id)}
                    aria-label="Add to playlist"
                  >
                    <span className="text-base leading-none">+</span>
                  </button>
                  <button
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={deletingId === s.id}
                    onClick={async () => {
                      setErr(null);
                      const ok = window.confirm(`Delete "${s.title}"? This can't be undone.`);
                      if (!ok) return;
                      try {
                        setDeletingId(s.id);
                        await api.deleteSong(s.id);
                        setSongs((prev) => prev.filter((x) => x.id !== s.id));
                      } catch (e: any) {
                        setErr(e?.message || "Failed to delete song");
                      } finally {
                        setDeletingId(null);
                      }
                    }}
                  >
                    {deletingId === s.id ? "Deleting…" : "Delete"}
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
      </div>
      </div>
      <SongDetailSidebar
        songId={selectedSongId}
        onClose={() => setSelectedSongId(null)}
        onLikeChange={({ songId, liked, like_count }) => {
          setSongs((prev) =>
            prev.map((s) =>
              s.id === songId
                ? {
                    ...s,
                    liked_by_me: liked,
                    like_count,
                  }
                : s
            )
          );
        }}
      />
    </>
  );
}


