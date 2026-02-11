import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DetailPlayer from "../components/player/DetailPlayer";
import { api, Playlist, PlaylistWithSongs } from "../lib/api";

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
};

export default function SongDetail() {
  const { songId } = useParams();
  const [song, setSong] = useState<SongDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [playlistsError, setPlaylistsError] = useState<string | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>("");
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistWithSongs | null>(null);
  const [playlistActionLoading, setPlaylistActionLoading] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);

  useEffect(() => {
    if (!songId) return;
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

  // 加载当前用户的所有 playlists
  useEffect(() => {
    setPlaylistsLoading(true);
    setPlaylistsError(null);
    api
      .listPlaylists()
      .then((data) => {
        setPlaylists(data);
        if (data.length > 0 && !selectedPlaylistId) {
          setSelectedPlaylistId(data[0].id);
        }
      })
      .catch((e: any) => {
        setPlaylistsError(e?.message || "Failed to load playlists");
      })
      .finally(() => setPlaylistsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当选择的 playlist 变化时，加载该 playlist 的详情以判断当前歌曲是否在其中
  useEffect(() => {
    if (!selectedPlaylistId) {
      setSelectedPlaylist(null);
      return;
    }
    setPlaylistsLoading(true);
    api
      .getPlaylist(selectedPlaylistId)
      .then((pl) => {
        setSelectedPlaylist(pl);
      })
      .catch((e: any) => {
        setPlaylistsError(e?.message || "Failed to load playlist detail");
      })
      .finally(() => setPlaylistsLoading(false));
  }, [selectedPlaylistId]);

  const isInSelectedPlaylist =
    !!song && !!selectedPlaylist && selectedPlaylist.songs.some((s) => s.id === song.id);

  const handleTogglePlaylist = () => {
    if (!song || !selectedPlaylistId) return;
    setPlaylistActionLoading(true);
    const action = isInSelectedPlaylist ? api.removeSongFromPlaylist : api.addSongToPlaylist;
    action(selectedPlaylistId, song.id)
      .then((updated) => {
        setSelectedPlaylist(updated);
        setPlaylistsError(null);
      })
      .catch((e: any) => {
        setPlaylistsError(e?.message || "Failed to update playlist");
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
            // backend puts this on response as `liked`
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...( { liked_by_me: res.liked } as any)
          };
        });
      })
      .catch((e: any) => {
        setPlaylistsError(e?.message || "Failed to like song");
      })
      .finally(() => setLikeLoading(false));
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {loading && <div className="text-gray-300">Loading…</div>}
      {error && !loading && <div className="text-sm text-red-400">{error}</div>}

      {!loading && !error && song && (
        <>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Song</p>
              <h1 className="mt-1 text-3xl font-semibold text-white">{song.title}</h1>
              <p className="mt-2 text-sm text-gray-300">
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
                    {likeLoading
                      ? "…"
                      : // @ts-expect-error backend may return liked_by_me
                        song.liked_by_me
                      ? "Liked"
                      : "Like"}
                  </button>
                </div>
                <div className="mt-1 tabular-nums">{song.like_count}</div>
              </div>
              {song.bpm != null && (
                <div>
                  <div className="font-medium text-gray-200">BPM</div>
                  <div className="mt-1 tabular-nums">{song.bpm}</div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
            <DetailPlayer audioUrl={song.audio_url} durationSeconds={song.duration} />
          </div>

          {/* Playlist 选择与添加/移除 */}
          <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">Playlists</h2>
              {playlistsLoading && (
                <span className="text-xs text-gray-400">Loading playlists…</span>
              )}
            </div>
            {playlistsError && (
              <p className="mt-2 text-xs text-red-400">{playlistsError}</p>
            )}
            {playlists.length === 0 && !playlistsLoading ? (
              <p className="mt-2 text-sm text-gray-400">
                You don&apos;t have any playlists yet. Create one from the Playlists page.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <select
                  value={selectedPlaylistId}
                  onChange={(e) => setSelectedPlaylistId(e.target.value)}
                  className="w-full rounded-md border border-white/15 bg-black/60 px-3 py-2 text-sm text-white outline-none ring-0 focus:border-white/40 focus:outline-none sm:max-w-xs"
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
                  disabled={
                    !selectedPlaylistId || playlistActionLoading || playlistsLoading
                  }
                  className="inline-flex items-center justify-center rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {playlistActionLoading || playlistsLoading
                    ? "Updating…"
                    : isInSelectedPlaylist
                    ? "Remove from playlist"
                    : "Add to playlist"}
                </button>
              </div>
            )}
            {selectedPlaylist && song && (
              <p className="mt-2 text-xs text-gray-400">
                This song is{" "}
                {isInSelectedPlaylist ? "already in" : "not yet in"}{" "}
                &ldquo;{selectedPlaylist.name}&rdquo;.
              </p>
            )}
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-4">
              <h2 className="text-sm font-semibold text-white">Prompt</h2>
              <p className="whitespace-pre-wrap text-sm text-gray-200">{song.prompt}</p>
            </div>
            <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-4">
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
  );
}

