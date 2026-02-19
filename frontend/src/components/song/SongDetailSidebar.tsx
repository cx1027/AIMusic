import { useEffect, useState } from "react";
import { X } from "lucide-react";
import DetailPlayer from "../player/DetailPlayer";
import { api, Playlist, PlaylistWithSongs } from "../../lib/api";

type SongDetailData = {
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
  liked_by_me?: boolean;
};

type SongDetailSidebarProps = {
  songId: string | null;
  onClose: () => void;
};

export default function SongDetailSidebar({ songId, onClose }: SongDetailSidebarProps) {
  const [song, setSong] = useState<SongDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>("");
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistWithSongs | null>(null);
  const [playlistActionLoading, setPlaylistActionLoading] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);

  useEffect(() => {
    if (!songId) {
      setSong(null);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getSong(songId)
      .then(setSong)
      .catch((e: any) => {
        setError(e?.message || "Failed to load song");
      })
      .finally(() => setLoading(false));
  }, [songId]);

  // Load playlists
  useEffect(() => {
    if (!songId) return;
    setPlaylistsLoading(true);
    api
      .listPlaylists()
      .then((data) => {
        setPlaylists(data);
        if (data.length > 0 && !selectedPlaylistId) {
          setSelectedPlaylistId(data[0].id);
        }
      })
      .catch(() => {
        // Ignore errors for playlists
      })
      .finally(() => setPlaylistsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  // Load selected playlist details
  useEffect(() => {
    if (!selectedPlaylistId || !songId) {
      setSelectedPlaylist(null);
      return;
    }
    api
      .getPlaylist(selectedPlaylistId)
      .then(setSelectedPlaylist)
      .catch(() => {
        // Ignore errors
      });
  }, [selectedPlaylistId, songId]);

  const isInSelectedPlaylist =
    !!song && !!selectedPlaylist && selectedPlaylist.songs.some((s) => s.id === song.id);

  const handleTogglePlaylist = () => {
    if (!song || !selectedPlaylistId) return;
    setPlaylistActionLoading(true);
    const action = isInSelectedPlaylist ? api.removeSongFromPlaylist : api.addSongToPlaylist;
    action(selectedPlaylistId, song.id)
      .then((updated) => {
        setSelectedPlaylist(updated);
      })
      .catch(() => {
        // Ignore errors
      })
      .finally(() => setPlaylistActionLoading(false));
  };

  const handleToggleLike = () => {
    if (!song || likeLoading) return;
    setLikeLoading(true);
    api
      .toggleLikeSong(song.id)
      .then((res) => {
        setSong((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            like_count: res.like_count,
            liked_by_me: res.liked,
          };
        });
      })
      .catch(() => {
        // Ignore errors
      })
      .finally(() => setLikeLoading(false));
  };

  if (!songId) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-full max-w-md border-l border-white/10 bg-black/95 backdrop-blur-sm shadow-2xl overflow-y-auto z-50">
      <div className="sticky top-0 bg-black/95 border-b border-white/10 p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Song Details</h2>
        <button
          onClick={onClose}
          className="rounded-full p-1 hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-gray-400" />
        </button>
      </div>

      <div className="p-4 space-y-6">
        {loading && <div className="text-gray-300">Loading…</div>}
        {error && !loading && <div className="text-sm text-red-400">{error}</div>}

        {!loading && !error && song && (
          <>
            <div>
              <h1 className="text-2xl font-semibold text-white">{song.title}</h1>
              <p className="mt-1 text-xs text-gray-400">
                Generated at {new Date(song.created_at).toLocaleString()}
              </p>
            </div>

            <div className="flex gap-4 text-xs text-gray-400">
              <div>
                <div className="font-medium text-gray-200">Plays</div>
                <div className="mt-1 tabular-nums">{song.play_count}</div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className="font-medium text-gray-200">Likes</div>
                  <button
                    type="button"
                    onClick={handleToggleLike}
                    disabled={likeLoading}
                    className="rounded-full border border-white/20 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-white/10 disabled:opacity-60"
                  >
                    {likeLoading ? "…" : song.liked_by_me ? "Liked" : "Like"}
                  </button>
                </div>
                <div className="mt-1 tabular-nums">{song.like_count}</div>
              </div>
              {song.genre && (
                <div>
                  <div className="font-medium text-gray-200">Genre</div>
                  <div className="mt-1 uppercase">{song.genre}</div>
                </div>
              )}
              {song.bpm != null && (
                <div>
                  <div className="font-medium text-gray-200">BPM</div>
                  <div className="mt-1 tabular-nums">{song.bpm}</div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <DetailPlayer audioUrl={song.audio_url} durationSeconds={song.duration} />
            </div>

            {playlists.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <h2 className="text-sm font-semibold text-white mb-3">Playlists</h2>
                <div className="flex flex-col gap-2">
                  <select
                    value={selectedPlaylistId}
                    onChange={(e) => setSelectedPlaylistId(e.target.value)}
                    className="w-full rounded-md border border-white/15 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                  >
                    {playlists.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleTogglePlaylist}
                    disabled={!selectedPlaylistId || playlistActionLoading || playlistsLoading}
                    className="inline-flex items-center justify-center rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {playlistActionLoading || playlistsLoading
                      ? "Updating…"
                      : isInSelectedPlaylist
                      ? "Remove from playlist"
                      : "Add to playlist"}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2 rounded-xl border border-white/10 bg-black/40 p-4">
                <h2 className="text-sm font-semibold text-white">Prompt</h2>
                <p className="whitespace-pre-wrap text-sm text-gray-200">{song.prompt}</p>
              </div>
              <div className="space-y-2 rounded-xl border border-white/10 bg-black/40 p-4">
                <h2 className="text-sm font-semibold text-white">Lyrics</h2>
                {song.lyrics ? (
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
                    {song.lyrics}
                  </pre>
                ) : (
                  <p className="text-sm text-gray-400">No lyrics provided.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

