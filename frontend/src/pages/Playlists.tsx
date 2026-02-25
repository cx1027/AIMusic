import { useEffect, useState } from "react";
import { api, Playlist, PlaylistWithSongs } from "../lib/api";
import { resolveMediaUrl } from "../lib/media";
import { playerStore } from "../stores/playerStore";
import SongDetailSidebar from "../components/song/SongDetailSidebar";
import SongCard from "../components/song/SongCard";

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlaylistWithSongs | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [removingSongId, setRemovingSongId] = useState<string | null>(null);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);

  const loadPlaylists = () => {
    setLoading(true);
    api
      .listPlaylists()
      .then((data) => {
        setPlaylists(data);
        if (!selectedId && data.length > 0) {
          setSelectedId(data[0].id);
        }
      })
      .catch((e: any) => setErr(e?.message || "Failed to load playlists"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPlaylists();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    api
      .getPlaylist(selectedId)
      .then(setSelected)
      .catch((e: any) => setErr(e?.message || "Failed to load playlist detail"));
  }, [selectedId]);

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

  const handleCreate = () => {
    if (!newName.trim()) return;
    setCreating(true);
    api
      .createPlaylist(newName.trim(), newDesc.trim() || null)
      .then((pl) => {
        setNewName("");
        setNewDesc("");
        setPlaylists((prev) => [pl, ...prev]);
        setSelectedId(pl.id);
      })
      .catch((e: any) => setErr(e?.message || "Failed to create playlist"))
      .finally(() => setCreating(false));
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Delete this playlist?")) return;
    api
      .deletePlaylist(id)
      .then(() => {
        setPlaylists((prev) => prev.filter((p) => p.id !== id));
        if (selectedId === id) {
          setSelectedId(null);
        }
      })
      .catch((e: any) => setErr(e?.message || "Failed to delete playlist"));
  };

  const handleRemoveSong = (playlistId: string, songId: string) => {
    if (!window.confirm("Remove this song from the playlist?")) return;
    setErr(null);
    setRemovingSongId(songId);
    api
      .removeSongFromPlaylist(playlistId, songId)
      .then((updated) => {
        setSelected(updated);
      })
      .catch((e: any) => setErr(e?.message || "Failed to remove song from playlist"))
      .finally(() => setRemovingSongId(null));
  };

  const handleToggleLike = async (songId: string) => {
    if (!selected) return;
    setErr(null);
    try {
      setLikingId(songId);
      const result = await api.toggleLikeSong(songId);
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              songs: prev.songs.map((s) =>
                s.id === songId
                  ? {
                      ...s,
                      liked_by_me: result.liked,
                      like_count: result.like_count
                    }
                  : s
              )
            }
          : prev
      );
    } catch (e: any) {
      setErr(e?.message || "Failed to update like");
    } finally {
      setLikingId(null);
    }
  };

  const buildQueueFromSelected = (startSongId?: string) => {
    if (!selected) return null;
    const items = selected.songs
      .filter((s) => !!s.audio_url)
      .map((s) => {
        const url = s.audio_url ? resolveMediaUrl(s.audio_url) : null;
        return url
          ? {
              id: s.id,
              title: s.title,
              audioUrl: url
            }
          : null;
      })
      .filter((x): x is { id: string; title: string; audioUrl: string } => x !== null);

    if (!items.length) return null;

    let startIndex = 0;
    if (startSongId) {
      const idx = items.findIndex((i) => i.id === startSongId);
      if (idx !== -1) startIndex = idx;
    }

    return { items, startIndex };
  };

  const handlePlayPlaylist = () => {
    const queue = buildQueueFromSelected();
    if (!queue) return;
    // Persist play counts for all songs in the playlist run (best-effort, no optimistic UI needed here)
    queue.items.forEach((item) => {
      void api
        .incrementPlayCount(item.id)
        .catch(() => {
          // ignore errors
        });
    });

    playerStore.setQueue(queue.items, queue.startIndex);
  };

  const handlePlayFromSong = (songId: string) => {
    const queue = buildQueueFromSelected(songId);
    if (!queue) return;

    // Persist a play for the specific song (best-effort)
    void api
      .incrementPlayCount(songId)
      .catch(() => {
        // ignore errors
      });

    playerStore.setQueue(queue.items, queue.startIndex);
  };

  return (
    <>
      <div className={`mx-auto flex flex-1 flex-col px-4 py-6 text-white transition-all ${selectedSongId ? 'max-w-5xl' : 'max-w-6xl'}`}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Playlists</h1>
            <p className="mt-2 text-sm text-gray-300">Organize your AI-generated songs into playlists. Create collections and share your favorite AI music.</p>
          </div>
        </div>

        {err && <p className="mt-3 text-sm text-red-400">{err}</p>}

        <div className="mt-6 grid gap-4 md:grid-cols-[260px,1fr]">
        <div className="space-y-4">
          <div className={`rounded-xl border border-white/10 bg-white/5 p-4 transition-all ${selectedSongId ? 'max-w-[240px]' : ''}`}>
            <h2 className="text-sm font-medium">New playlist</h2>
            <div className="mt-3 space-y-2 text-sm">
              <input
                className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/30"
                placeholder="Playlist name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <textarea
                className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/30"
                placeholder="Description (optional)"
                rows={2}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
              <button
                className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-white px-3 py-1.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
              >
                {creating ? "Creating..." : "Create playlist"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-300">
              Your playlists
            </div>
            <div className="max-h-[420px] space-y-1 overflow-y-auto p-2 text-sm">
              {loading && playlists.length === 0 && <div className="px-2 py-3 text-gray-400">Loading…</div>}
              {!loading && playlists.length === 0 && (
                <div className="px-2 py-3 text-gray-400">No playlists yet. Create one above.</div>
              )}
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-white/10 cursor-pointer ${
                    selectedId === pl.id ? "bg-white/15" : ""
                  }`}
                  onClick={() => setSelectedId(pl.id)}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{pl.name}</div>
                    {pl.description && (
                      <div className="truncate text-xs text-gray-400">{pl.description}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="ml-2 flex h-7 w-7 items-center justify-center rounded-full text-sm text-red-300 transition hover:bg-red-500/20 hover:text-red-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(pl.id);
                    }}
                    aria-label="Delete playlist"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    >
                      <path
                        d="M9 3h6a1 1 0 0 1 1 1v1h3a1 1 0 1 1 0 2h-1v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7H4a1 1 0 1 1 0-2h3V4a1 1 0 0 1 1-1Zm1 3h4V5h-4v1Zm-2 2v10h8V8H8Zm2 2h2v6h-2v-6Zm4 0h2v6h-2v-6Z"
                        fill="#FFFFFF"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`rounded-xl border border-white/10 bg-white/5 p-4 transition-all ${selectedSongId ? 'max-w-2xl' : ''}`}>
          {!selected && <p className="text-sm text-gray-300">Select a playlist on the left.</p>}
          {selected && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{selected.name}</h2>
                  {selected.description && (
                    <p className="mt-1 text-sm text-gray-300">{selected.description}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    {selected.songs.length} {selected.songs.length === 1 ? "song" : "songs"}
                  </p>
                </div>
                <div className="flex items-center">
                  {/*
                    Consider the playlist "active" if the current playing song
                    belongs to this playlist. This controls the icon color.
                  */}
                  {(() => {
                    const isPlaylistActive =
                      !!currentPlayingId && selected.songs.some((s) => s.id === currentPlayingId);
                    return (
                  <button
                    type="button"
                        className={`group inline-flex h-10 w-10 items-center justify-center rounded-full text-xs font-medium text-green-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                          isPlaylistActive
                            ? "bg-white/5 hover:bg-white/10"
                            : "bg-white/10 hover:bg-white/20"
                        }`}
                    onClick={handlePlayPlaylist}
                    disabled={selected.songs.length === 0 || !selected.songs.some((s) => !!s.audio_url)}
                  >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          className={
                            isPlaylistActive
                              ? "h-5 w-5 fill-gray-300 transition group-hover:fill-white"
                              : "h-5 w-5 fill-white"
                          }
                          aria-hidden="true"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        <span className="sr-only">Play playlist</span>
                  </button>
                    );
                  })()}
                </div>
              </div>

              <div className="mt-4 border-t border-white/10 pt-3 text-sm">
                {selected.songs.length === 0 && (
                  <p className="text-gray-300">No songs in this playlist yet.</p>
                )}
                {selected.songs.length > 0 && (
                  <div className="grid gap-3">
                    {selected.songs.map((s) => {
                      const isPlaying = currentPlayingId === s.id;
                      return (
                        <SongCard
                          key={s.id} 
                          song={s}
                          variant="card"
                          isPlaying={isPlaying}
                          showPlayButton={true}
                          showLikeButton={true}
                          showDate={true}
                          playButtonText={isPlaying ? "Playing" : "Play from here"}
                          onPlay={() => handlePlayFromSong(s.id)}
                          onLike={() => handleToggleLike(s.id)}
                          onSelect={() => setSelectedSongId(s.id)}
                          isLoading={likingId === s.id}
                          additionalActions={
                            <button
                              type="button"
                              className="flex h-7 w-7 items-center justify-center rounded-full text-sm text-red-300 transition hover:bg-red-500/20 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={removingSongId === s.id}
                              onClick={() => handleRemoveSong(selected.id, s.id)}
                              aria-label={removingSongId === s.id ? "Removing…" : "Remove from playlist"}
                            >
                              {removingSongId === s.id ? (
                                <span className="text-[10px]">…</span>
                              ) : (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24"
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M9 3h6a1 1 0 0 1 1 1v1h3a1 1 0 1 1 0 2h-1v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7H4a1 1 0 1 1 0-2h3V4a1 1 0 0 1 1-1Zm1 3h4V5h-4v1Zm-2 2v10h8V8H8Zm2 2h2v6h-2v-6Zm4 0h2v6h-2v-6Z"
                                    fill="#FFFFFF"
                                  />
                                </svg>
                              )}
                            </button>
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      </div>
      <SongDetailSidebar
        songId={selectedSongId}
        onClose={() => setSelectedSongId(null)}
        onLikeChange={({ songId, liked, like_count }) => {
          setSelected((prev) =>
            prev
              ? {
                  ...prev,
                  songs: prev.songs.map((s) =>
                    s.id === songId
                      ? {
                          ...s,
                          liked_by_me: liked,
                          like_count,
                        }
                      : s
                  ),
                }
              : prev
          );
        }}
      />
    </>
  );
}


