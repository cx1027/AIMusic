import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Playlist } from "../lib/api";
import { resolveMediaUrl } from "../lib/media";
import { playerStore } from "../stores/playerStore";
import SongDetailSidebar from "../components/song/SongDetailSidebar";
import SongCard from "../components/song/SongCard";
import { DiscoverSongCard } from "../components/discover/DiscoverSongCard";
import { PopularArtistCard } from "../components/discover/PopularArtistCard";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, { like_count: number; liked_by_me: boolean }>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [playlistPopupPosition, setPlaylistPopupPosition] = useState<{ top: number; left: number } | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [addingToId, setAddingToId] = useState<string | null>(null);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [popularPage, setPopularPage] = useState(1);
  const [artistProfiles, setArtistProfiles] = useState<
    Record<
      string,
      | {
          id: string;
          username: string;
          avatar_url?: string | null;
          background_url?: string | null;
        }
      | undefined
    >
  >({});
  const [showAllPopularSongs, setShowAllPopularSongs] = useState(false);
  const [showAllPopularArtists, setShowAllPopularArtists] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .discover({ genre: genre || undefined, limit: 20 })
      .then(setData)
      .catch((e: any) => setError(e?.message || "Failed to load discover feed"))
      .finally(() => setLoading(false));
  }, [genre]);

  // Reset popular songs pagination and layout when genre changes
  useEffect(() => {
    setShowAllPopularSongs(false);
    setPopularPage(1);
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

  // Compute popular songs list used for the grid & artists section
  const popularSongs: DiscoverSong[] = (() => {
    if (!data) return [];
    if (genre) {
      // When a genre is selected, use the genre-specific bucket if available, otherwise fallback to trending
      return data.genre_songs.length ? data.genre_songs : data.trending;
    }
    // Default to trending when no genre filter
    return data.trending;
  })();

  const popularSongsPerPage = 25; // 5 rows * 5 songs per row
  const popularTotalPages = Math.max(1, Math.ceil(popularSongs.length / popularSongsPerPage));
  const currentPopularPage = Math.min(popularPage, popularTotalPages);
  const pagedPopularSongs = popularSongs.slice(
    (currentPopularPage - 1) * popularSongsPerPage,
    currentPopularPage * popularSongsPerPage
  );

  const popularArtistsStats = (() => {
    const stats = new Map<
      string,
      {
        user_id: string;
        username: string;
        totalLikes: number;
        songCount: number;
      }
    >();

    for (const s of popularSongs) {
      const key = s.username;
      const existing = stats.get(key);
      if (existing) {
        existing.totalLikes += s.like_count;
        existing.songCount += 1;
      } else {
        stats.set(key, {
          user_id: s.user_id,
          username: s.username,
          totalLikes: s.like_count,
          songCount: 1,
        });
      }
    }

    return Array.from(stats.values()).sort((a, b) => b.totalLikes - a.totalLikes);
  })();

  // Lazy-load basic artist profile data for the Popular Artists section
  useEffect(() => {
    const loadProfiles = async () => {
      if (!popularArtistsStats.length) return;
      const top = popularArtistsStats.slice(0, 8);
      const toFetch = top.filter((a) => artistProfiles[a.username] === undefined);
      if (!toFetch.length) return;

      try {
        const results = await Promise.all(
          toFetch.map((artist) =>
            api
              .getUserByUsername(artist.username)
              .then((profile) => ({ username: artist.username, profile }))
              .catch(() => ({ username: artist.username, profile: undefined }))
          )
        );
        setArtistProfiles((prev) => {
          const next = { ...prev };
          for (const r of results) {
            next[r.username] = r.profile
              ? {
                  id: r.profile.id,
                  username: r.profile.username,
                  avatar_url: r.profile.avatar_url || null,
                  background_url: r.profile.background_url || null,
                }
              : undefined;
          }
          return next;
        });
      } catch {
        // ignore errors here; artists will simply render with initials
      }
    };

    void loadProfiles();
  }, [popularArtistsStats, artistProfiles]);

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

  const openPlaylistPicker = async (songId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    setError(null);
    // If clicking the same song, toggle the popup off
    if (activeSongId === songId) {
      setActiveSongId(null);
      setPlaylistPopupPosition(null);
      return;
    }

    // Position the popup next to the clicked button using viewport coordinates
    const rect = event.currentTarget.getBoundingClientRect();
    const verticalOffset = 8;
    const horizontalOffset = 0;
    const popupWidth = 224; // ~ w-56
    const top = rect.bottom + verticalOffset;
    const maxLeft = window.innerWidth - popupWidth - 8;
    const left = Math.min(rect.left + horizontalOffset, maxLeft);

    setActiveSongId(songId);
    setPlaylistPopupPosition({ top, left });

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

  return (
    <>
      <div className={`mx-auto px-4 py-10 transition-all ${selectedSongId ? "max-w-4xl" : "max-w-6xl"}`}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Discover</h1>
            <p className="mt-2 text-sm text-gray-300">
              Explore popular tracks and artists from the public library.
            </p>
          </div>
          <Link className="rounded-full bg-white px-3 py-2 text-sm font-medium text-black hover:bg-gray-100" to="/generate">
            Generate new
          </Link>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-col gap-3 border-b border-white/5 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Browse by genre</h2>
                <p className="mt-1 text-xs text-gray-400">
                  Tap a tag to filter the discover feed, similar to Spotify&apos;s browse experience.
                </p>
              </div>
            </div>
            <div className="mt-1 flex gap-2 overflow-x-auto pb-1 text-xs">
              {DISCOVER_GENRES.map((g) => {
                const value = g.value || null;
                const isActive = (genre || null) === value;
                return (
                  <button
                    key={g.value || "all"}
                    type="button"
                    onClick={() => setGenre(value)}
                    className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs transition ${
                      isActive
                        ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                        : "border-white/15 bg-black/40 text-gray-200 hover:border-emerald-400 hover:text-emerald-100"
                    }`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>

          {loading && <div className="mt-4 text-sm text-gray-300">Loading discover feed…</div>}
          {error && !loading && <div className="mt-4 text-sm text-red-300">{error}</div>}
          {!loading && !error && !popularSongs.length && (
            <div className="mt-4 text-xs text-gray-400">No songs yet.</div>
          )}

          {!loading && !error && popularSongs.length > 0 && (
            <>
              {/* Popular Songs */}
              <section className="mt-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-white">Popular Songs</h2>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => {
                      setShowAllPopularSongs(true);
                      setPopularPage(1);
                    }}
                    disabled={!popularSongs.length}
                  >
                    Show All
                  </button>
                </div>
                {!showAllPopularSongs ? (
                  <div className="flex gap-4 overflow-x-auto pb-1">
                    {popularSongs.slice(0, 7).map((s) => {
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
                        <div key={s.id} className="w-[220px] flex-shrink-0">
                          <DiscoverSongCard
                            song={songWithOptimisticLikes}
                            displayGenre={displayGenre}
                            isPlaying={isPlaying}
                            onPlay={() => handlePlaySong(s)}
                            onLike={() => handleLike(s)}
                            onSelect={() => setSelectedSongId(s.id)}
                            isLiking={isLoading}
                            additionalActions={
                              <>
                                <button
                                  type="button"
                                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition ${
                                    activeSongId === s.id
                                      ? "bg-blue-500/20 text-blue-200"
                                      : "bg-transparent text-gray-300 hover:bg-white/10"
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void openPlaylistPicker(s.id, e);
                                  }}
                                  aria-label="Add to playlist"
                                >
                                  +
                                </button>
                                {activeSongId === s.id && playlistPopupPosition && (
                                  <div
                                    className="fixed z-50 w-56 rounded-md border border-white/10 bg-gray-900/80 p-2 text-xs shadow-lg"
                                    style={{ top: playlistPopupPosition.top, left: playlistPopupPosition.left }}
                                  >
                                    <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                                      Add to playlist
                                    </div>
                                    {playlistsLoading ? (
                                      <div className="px-2 py-1.5 text-gray-300">Loading playlists…</div>
                                    ) : playlists && playlists.length > 0 ? (
                                      <div className="flex flex-col gap-1.5">
                                        {playlists.map((pl) => (
                                          <button
                                            key={pl.id}
                                            type="button"
                                            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-gray-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                                            disabled={addingToId === pl.id}
                                            onClick={() => handleAddToPlaylist(pl.id, s.id)}
                                          >
                                            <span className="truncate">{pl.name}</span>
                                            {addingToId === pl.id && (
                                              <span className="ml-2 text-[10px] text-gray-300">Adding…</span>
                                            )}
                                          </button>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                                        <span className="text-[11px] text-gray-300">
                                          You don&apos;t have any playlists yet.
                                        </span>
                                        <Link
                                          to="/playlists"
                                          className="rounded-full border border-white/30 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white hover:border-white/60"
                                        >
                                          Create a playlist
                                        </Link>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <>
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                    {pagedPopularSongs.map((s) => {
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
                      <DiscoverSongCard
                        key={s.id}
                        song={songWithOptimisticLikes}
                        displayGenre={displayGenre}
                        isPlaying={isPlaying}
                        onPlay={() => handlePlaySong(s)}
                        onLike={() => handleLike(s)}
                        onSelect={() => setSelectedSongId(s.id)}
                        isLiking={isLoading}
                        additionalActions={
                          <>
                            <button
                              type="button"
                              className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition ${
                                activeSongId === s.id
                                  ? "bg-blue-500/20 text-blue-200"
                                  : "bg-transparent text-gray-300 hover:bg-white/10"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void openPlaylistPicker(s.id, e);
                              }}
                              aria-label="Add to playlist"
                            >
                              +
                            </button>
                            {activeSongId === s.id && playlistPopupPosition && (
                              <div
                                className="fixed z-50 w-56 rounded-md border border-white/10 bg-gray-900/80 p-2 text-xs shadow-lg"
                                style={{ top: playlistPopupPosition.top, left: playlistPopupPosition.left }}
                              >
                                <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                                  Add to playlist
                                </div>
                                {playlistsLoading ? (
                                  <div className="px-2 py-1.5 text-gray-300">Loading playlists…</div>
                                ) : playlists && playlists.length > 0 ? (
                                  <div className="flex flex-col gap-1.5">
                                    {playlists.map((pl) => (
                                      <button
                                        key={pl.id}
                                        type="button"
                                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-gray-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                                        disabled={addingToId === pl.id}
                                        onClick={() => handleAddToPlaylist(pl.id, s.id)}
                                      >
                                        <span className="truncate">{pl.name}</span>
                                        {addingToId === pl.id && (
                                          <span className="ml-2 text-[10px] text-gray-300">Adding…</span>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                                    <span className="text-[11px] text-gray-300">
                                      You don&apos;t have any playlists yet.
                                    </span>
                                    <Link
                                      to="/playlists"
                                      className="rounded-full border border-white/30 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white hover:border-white/60"
                                    >
                                      Create a playlist
                                    </Link>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        }
                      />
                    );
                  })}
                  </div>
                  {popularTotalPages > 1 && (
                    <div className="mt-4 flex items-center justify-center gap-3 text-[11px] text-gray-300">
                      <button
                        type="button"
                        className="rounded-full border border-white/20 px-2 py-0.5 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => setPopularPage((p) => Math.max(1, p - 1))}
                        disabled={currentPopularPage === 1}
                      >
                        Prev
                      </button>
                      <span>
                        Page {currentPopularPage} of {popularTotalPages}
                      </span>
                      <button
                        type="button"
                        className="rounded-full border border-white/20 px-2 py-0.5 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => setPopularPage((p) => Math.min(popularTotalPages, p + 1))}
                        disabled={currentPopularPage === popularTotalPages}
                      >
                        Next
                      </button>
                    </div>
                  )}
                  </>
                )}
              </section>

              {/* Popular Artists */}
              {popularArtistsStats.length > 0 && (
                <section className="mt-8">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-white">Popular Artists</h2>
                    <span className="text-[11px] text-gray-400">
                      Based on the most liked tracks{genre ? ` in ${genre}` : ""}
                    </span>
                  </div>
                  {!showAllPopularArtists ? (
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {popularArtistsStats.slice(0, 7).map((artist) => {
                        const profile = artistProfiles[artist.username];
                        return (
                          <PopularArtistCard
                            key={artist.username}
                            username={artist.username}
                            avatar_url={profile?.avatar_url}
                            background_url={profile?.background_url}
                          />
                        );
                      })}
                      {popularArtistsStats.length > 7 && (
                        <button
                          type="button"
                          className="flex h-[180px] w-[160px] flex-shrink-0 items-center justify-center rounded-xl border border-dashed border-white/20 bg-black/40 text-xs font-medium text-gray-300 hover:border-white/40 hover:text-white"
                          onClick={() => setShowAllPopularArtists(true)}
                        >
                          Show all
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {popularArtistsStats.map((artist) => {
                        const profile = artistProfiles[artist.username];
                        return (
                          <PopularArtistCard
                            key={artist.username}
                            username={artist.username}
                            avatar_url={profile?.avatar_url}
                            background_url={profile?.background_url}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </>
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


