import { useEffect, useState } from "react";
import { X, Heart, Share2 } from "lucide-react";
import { api, Playlist, PlaylistWithSongs } from "../../lib/api";
import { resolveMediaUrl } from "../../lib/media";

type SongDetailData = {
  id: string;
  title: string;
  prompt: string;
  lyrics?: string | null;
  audio_url?: string | null;
  cover_image_url?: string | null;
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

  const handleShare = () => {
    if (!song) return;
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/songs/${song.id}`
        : `/songs/${song.id}`;

    if (typeof navigator !== "undefined" && (navigator as any).share) {
      (navigator as any)
        .share({
          title: song.title,
          text: "Check out this song I generated!",
          url,
        })
        .catch(() => {
          // ignore share cancel/errors
        });
      return;
    }

    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).catch(() => {
        // ignore clipboard errors
      });
    }
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
            {song.cover_image_url && (
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
                <img
                  src={resolveMediaUrl(song.cover_image_url)}
                  alt={song.title}
                  className="w-full h-auto object-contain"
                />
              </div>
            )}

            <div>
              <h1 className="text-2xl font-semibold text-white">{song.title}</h1>
              <p className="mt-1 text-xs text-gray-400">
                Generated at {new Date(song.created_at).toLocaleString()}
              </p>
            </div>

            <div className="flex gap-4 text-xs text-gray-400">
              <button
                type="button"
                onClick={handleToggleLike}
                disabled={likeLoading}
                className="inline-flex items-center justify-center rounded-full border border-white/20 p-2 text-white hover:bg-white/10 disabled:opacity-60"
                aria-label={song.liked_by_me ? "Unlike song" : "Like song"}
              >
                <Heart
                  className="h-4 w-4"
                  fill={song.liked_by_me ? "currentColor" : "none"}
                />
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center justify-center rounded-full border border-white/20 p-2 text-white hover:bg-white/10"
                aria-label="Share song"
              >
                <Share2 className="h-4 w-4" />
              </button>
            </div>

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

